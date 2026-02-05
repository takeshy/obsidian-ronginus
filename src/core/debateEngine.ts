/**
 * Debate Engine for Ronginus
 * Orchestrates parallel debates between Gemini, Claude, and Codex CLIs
 */

import type {
  CliType,
  Message,
  DebateTurn,
  DebateResponse,
  DebateConclusion,
  VoteResult,
  DebateResult,
  RonginusSettings,
  DebatePhase,
  Participant,
  Voter,
  ParticipantType,
} from "../types";
import { CliProviderManager, CliProviderInterface } from "./cliProvider";
import { t } from "../i18n";

export interface UserInputRequest {
  type: "debate" | "vote";
  participantId: string;
  displayName: string;
  role?: string;
  // For voting
  candidates?: { id: string; displayName: string }[];
}

export interface UserInputResponse {
  content: string;
  // For voting
  votedForId?: string;
  reason?: string;
}

export interface DebateEventCallbacks {
  onPhaseChange?: (phase: DebatePhase) => void;
  onTurnStart?: (turnNumber: number) => void;
  onResponseStream?: (participantId: string, content: string) => void;
  onResponseComplete?: (participantId: string, response: DebateResponse) => void;
  onTurnComplete?: (turn: DebateTurn) => void;
  onConclusionStream?: (participantId: string, content: string) => void;
  onConclusionComplete?: (conclusion: DebateConclusion) => void;
  onVoteComplete?: (vote: VoteResult) => void;
  onDebateComplete?: (result: DebateResult) => void;
  onError?: (error: Error) => void;
  onUserInputRequest?: (request: UserInputRequest) => Promise<UserInputResponse>;
}

class AbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AbortError";
  }
}

export class DebateEngine {
  private providerManager: CliProviderManager;
  private settings: RonginusSettings;
  private workingDirectory: string;
  private abortController: AbortController | null = null;
  private callbacks: DebateEventCallbacks = {};

  constructor(settings: RonginusSettings, workingDirectory: string) {
    this.settings = settings;
    this.workingDirectory = workingDirectory;
    const cliPaths = {
      gemini: settings.cliConfig.geminiCliPath,
      claude: settings.cliConfig.claudeCliPath,
      codex: settings.cliConfig.codexCliPath,
    };
    this.providerManager = new CliProviderManager(cliPaths);
  }

  setCallbacks(callbacks: DebateEventCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Get verified CLI providers based on settings
   */
  getVerifiedProviders(): CliProviderInterface[] {
    const providers: CliProviderInterface[] = [];
    const cliConfig = this.settings.cliConfig;

    if (cliConfig.geminiVerified) {
      const gemini = this.providerManager.getProvider("gemini-cli");
      if (gemini) {
        providers.push(gemini);
      }
    }

    if (cliConfig.claudeVerified) {
      const claude = this.providerManager.getProvider("claude-cli");
      if (claude) {
        providers.push(claude);
      }
    }

    if (cliConfig.codexVerified) {
      const codex = this.providerManager.getProvider("codex-cli");
      if (codex) {
        providers.push(codex);
      }
    }

    return providers;
  }

  /**
   * Get provider for a participant type
   */
  getProviderForType(type: ParticipantType): CliProviderInterface | null {
    if (type === "user") {
      return null;
    }
    return this.providerManager.getProvider(type) || null;
  }

  /**
   * Run a complete debate on a theme
   */
  async runDebate(
    theme: string,
    turns: number = this.settings.defaultTurns,
    debateParticipants?: Participant[],
    voteParticipants?: Voter[]
  ): Promise<DebateResult> {
    this.abortController = new AbortController();
    const startTime = Date.now();

    // Use provided participants or fall back to verified providers
    const participants = debateParticipants || this.getDefaultParticipants();
    const voters = voteParticipants || this.getDefaultVoters();

    if (participants.length < 1) {
      throw new Error("At least 1 participant is required for a debate.");
    }

    const allTurns: DebateTurn[] = [];
    const conclusions: DebateConclusion[] = [];
    const votes: VoteResult[] = [];

    try {
      // Run discussion turns
      for (let turn = 1; turn <= turns; turn++) {
        this.callbacks.onPhaseChange?.("thinking");
        this.callbacks.onTurnStart?.(turn);

        const isLastTurn = turn === turns;
        const turnResult = await this.runTurnWithParticipants(
          theme,
          turn,
          allTurns,
          participants,
          isLastTurn
        );
        allTurns.push(turnResult);
        this.callbacks.onTurnComplete?.(turnResult);
        this.callbacks.onPhaseChange?.("turn_complete");
      }

      // Collect conclusions (from last turn or explicit conclusion phase)
      this.callbacks.onPhaseChange?.("concluding");
      const lastTurn = allTurns[allTurns.length - 1];
      for (const response of lastTurn.responses) {
        if (response.isConclusion) {
          const conclusion: DebateConclusion = {
            participantId: response.participantId,
            displayName: response.displayName,
            content: response.content,
          };
          conclusions.push(conclusion);
          this.callbacks.onConclusionComplete?.(conclusion);
        }
      }

      // If conclusions weren't marked in last turn, get explicit conclusions
      if (conclusions.length === 0) {
        const explicitConclusions = await this.getConclusionsWithParticipants(
          theme,
          allTurns,
          participants
        );
        conclusions.push(...explicitConclusions);
      }

      // Voting phase
      this.callbacks.onPhaseChange?.("voting");
      const voteResults = await this.runVotingWithVoters(
        theme,
        conclusions,
        voters
      );
      votes.push(...voteResults);

      // Determine winner(s)
      const { winnerIds, isDraw } = this.determineWinnersById(votes, conclusions);
      const winnerId = isDraw ? null : winnerIds[0] || null;

      // Build final conclusion (combine if draw)
      let finalConclusion = "";
      if (isDraw) {
        finalConclusion = winnerIds
          .map(id => conclusions.find(c => c.participantId === id)?.content || "")
          .join("\n\n---\n\n");
      } else if (winnerId) {
        finalConclusion = conclusions.find(c => c.participantId === winnerId)?.content || "";
      }

      const result: DebateResult = {
        theme,
        turns: allTurns,
        conclusions,
        votes,
        winnerId,
        winnerIds,
        isDraw,
        finalConclusion,
        startTime,
        endTime: Date.now(),
        debateParticipants: participants,
        voteParticipants: voters,
      };

      this.callbacks.onPhaseChange?.("complete");
      this.callbacks.onDebateComplete?.(result);

      return result;
    } catch (error) {
      if (this.abortController?.signal.aborted) {
        throw new AbortError("Debate aborted");
      }
      this.callbacks.onPhaseChange?.("error");
      this.callbacks.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * Get default participants from verified providers
   */
  private getDefaultParticipants(): Participant[] {
    const providers = this.getVerifiedProviders();
    return providers.map((provider, index) => ({
      id: `${provider.name}-${index + 1}`,
      type: provider.name as ParticipantType,
      displayName: this.getDisplayName(provider.name),
    }));
  }

  /**
   * Get default voters from verified providers
   */
  private getDefaultVoters(): Voter[] {
    const providers = this.getVerifiedProviders();
    return providers.map((provider, index) => ({
      id: `${provider.name}-${index + 1}`,
      type: provider.name as ParticipantType,
      displayName: this.getDisplayName(provider.name),
    }));
  }

  /**
   * Run a single turn of debate with participants
   * User input and AI responses run in parallel
   */
  private async runTurnWithParticipants(
    theme: string,
    turnNumber: number,
    previousTurns: DebateTurn[],
    participants: Participant[],
    isLastTurn: boolean
  ): Promise<DebateTurn> {
    const responseMap = new Map<string, DebateResponse>();

    // Build context from previous turns
    const baseContext = this.buildTurnContextWithParticipants(theme, previousTurns, isLastTurn);

    // Separate user and AI participants
    const userParticipants = participants.filter(p => p.type === "user");
    const aiParticipants = participants.filter(p => p.type !== "user");

    // Create promises for all participants (run in parallel)
    const allPromises: Promise<DebateResponse | null>[] = [];

    // User participant promises
    for (const participant of userParticipants) {
      const userPromise = (async (): Promise<DebateResponse | null> => {
        if (this.abortController?.signal.aborted) {
          throw new AbortError("Debate aborted");
        }

        if (this.callbacks.onUserInputRequest) {
          const userResponse = await this.callbacks.onUserInputRequest({
            type: "debate",
            participantId: participant.id,
            displayName: participant.displayName,
            role: participant.role,
          });

          const debateResponse: DebateResponse = {
            participantId: participant.id,
            displayName: participant.displayName,
            content: userResponse.content,
            isConclusion: isLastTurn,
            timestamp: Date.now(),
          };

          responseMap.set(participant.id, debateResponse);
          this.callbacks.onResponseComplete?.(participant.id, debateResponse);
          return debateResponse;
        }
        return null;
      })();
      allPromises.push(userPromise);
    }

    // AI participant promises
    for (const participant of aiParticipants) {
      const aiPromise = (async (): Promise<DebateResponse | null> => {
        if (this.abortController?.signal.aborted) {
          throw new AbortError("Debate aborted");
        }

        const provider = this.getProviderForType(participant.type);
        if (!provider) {
          return null;
        }

        // Build context with role if present
        let context = baseContext;
        if (participant.role) {
          context += `\n\n${t().yourPosition}: ${participant.role}`;
        }

        try {
          const messages: Message[] = [
            { role: "user", content: context, timestamp: Date.now() }
          ];

          // Build system prompt with role
          let systemPrompt = this.settings.systemPrompt;
          if (participant.role) {
            systemPrompt += `\n\n${t().yourPosition}: ${participant.role}`;
          }

          let response = "";
          const signal = this.abortController?.signal;

          for await (const chunk of provider.chatStream(
            messages,
            systemPrompt,
            this.workingDirectory,
            signal
          )) {
            if (chunk.type === "text" && chunk.content) {
              response += chunk.content;
              this.callbacks.onResponseStream?.(participant.id, response);
            } else if (chunk.type === "error" && chunk.error) {
              throw new Error(chunk.error);
            }
          }

          const debateResponse: DebateResponse = {
            participantId: participant.id,
            displayName: participant.displayName,
            content: response,
            isConclusion: isLastTurn,
            timestamp: Date.now(),
          };

          responseMap.set(participant.id, debateResponse);
          this.callbacks.onResponseComplete?.(participant.id, debateResponse);
          return debateResponse;
        } catch (error) {
          if (this.abortController?.signal.aborted) {
            throw new AbortError("Debate aborted");
          }
          const errorResponse: DebateResponse = {
            participantId: participant.id,
            displayName: participant.displayName,
            content: "",
            isConclusion: false,
            timestamp: Date.now(),
            error: (error as Error).message,
          };
          responseMap.set(participant.id, errorResponse);
          return errorResponse;
        }
      })();
      allPromises.push(aiPromise);
    }

    // Wait for all participants to complete
    await Promise.all(allPromises);

    // Build responses in original participant order
    const responses: DebateResponse[] = [];
    for (const participant of participants) {
      const response = responseMap.get(participant.id);
      if (response) {
        responses.push(response);
      }
    }

    return {
      turnNumber,
      responses,
      timestamp: Date.now(),
    };
  }

  /**
   * Build context message for a turn (with participants)
   */
  private buildTurnContextWithParticipants(
    theme: string,
    previousTurns: DebateTurn[],
    isLastTurn: boolean
  ): string {
    const i18n = t();
    let context = `# ${i18n.debateThemeHeader}\n${theme}\n\n`;

    if (previousTurns.length > 0) {
      context += `# ${i18n.previousDiscussion}\n\n`;
      for (const turn of previousTurns) {
        context += `## ${i18n.turn} ${turn.turnNumber}\n\n`;
        for (const response of turn.responses) {
          context += `### ${response.displayName}\n${response.content}\n\n`;
        }
      }

      context += `# ${i18n.yourTask}\n`;
      context += `${i18n.yourTaskInstruction}\n\n`;
    }

    if (isLastTurn) {
      context += `\n${this.settings.conclusionPrompt}\n`;
    }

    return context;
  }

  /**
   * Get explicit conclusions from all participants
   * User input and AI responses run in parallel
   */
  private async getConclusionsWithParticipants(
    theme: string,
    turns: DebateTurn[],
    participants: Participant[]
  ): Promise<DebateConclusion[]> {
    const conclusionMap = new Map<string, DebateConclusion>();
    const baseContext = this.buildConclusionContextWithParticipants(theme, turns);

    // Separate user and AI participants
    const userParticipants = participants.filter(p => p.type === "user");
    const aiParticipants = participants.filter(p => p.type !== "user");

    // Create promises for all participants (run in parallel)
    const allPromises: Promise<DebateConclusion | null>[] = [];

    // User participant promises
    for (const participant of userParticipants) {
      const userPromise = (async (): Promise<DebateConclusion | null> => {
        if (this.abortController?.signal.aborted) {
          throw new AbortError("Debate aborted");
        }

        if (this.callbacks.onUserInputRequest) {
          const userResponse = await this.callbacks.onUserInputRequest({
            type: "debate",
            participantId: participant.id,
            displayName: participant.displayName,
            role: participant.role,
          });

          const conclusion: DebateConclusion = {
            participantId: participant.id,
            displayName: participant.displayName,
            content: userResponse.content,
          };
          conclusionMap.set(participant.id, conclusion);
          this.callbacks.onConclusionComplete?.(conclusion);
          return conclusion;
        }
        return null;
      })();
      allPromises.push(userPromise);
    }

    // AI participant promises
    for (const participant of aiParticipants) {
      const aiPromise = (async (): Promise<DebateConclusion | null> => {
        if (this.abortController?.signal.aborted) {
          throw new AbortError("Debate aborted");
        }

        const provider = this.getProviderForType(participant.type);
        if (!provider) {
          return null;
        }

        // Build context with role if present
        let context = baseContext;
        if (participant.role) {
          context += `\n\n${t().yourPosition}: ${participant.role}`;
        }

        try {
          const messages: Message[] = [
            { role: "user", content: context, timestamp: Date.now() }
          ];

          // Build system prompt with role
          let systemPrompt = this.settings.systemPrompt;
          if (participant.role) {
            systemPrompt += `\n\n${t().yourPosition}: ${participant.role}`;
          }

          let response = "";
          for await (const chunk of provider.chatStream(
            messages,
            systemPrompt,
            this.workingDirectory,
            this.abortController?.signal
          )) {
            if (chunk.type === "text" && chunk.content) {
              response += chunk.content;
              this.callbacks.onConclusionStream?.(participant.id, response);
            }
          }

          const conclusion: DebateConclusion = {
            participantId: participant.id,
            displayName: participant.displayName,
            content: response,
          };
          conclusionMap.set(participant.id, conclusion);
          this.callbacks.onConclusionComplete?.(conclusion);
          return conclusion;
        } catch (error) {
          if (this.abortController?.signal.aborted) {
            throw new AbortError("Debate aborted");
          }
          const conclusion: DebateConclusion = {
            participantId: participant.id,
            displayName: participant.displayName,
            content: `Error: ${(error as Error).message}`,
          };
          conclusionMap.set(participant.id, conclusion);
          return conclusion;
        }
      })();
      allPromises.push(aiPromise);
    }

    // Wait for all participants to complete
    await Promise.all(allPromises);

    // Build conclusions in original participant order
    const conclusions: DebateConclusion[] = [];
    for (const participant of participants) {
      const conclusion = conclusionMap.get(participant.id);
      if (conclusion) {
        conclusions.push(conclusion);
      }
    }

    return conclusions;
  }

  /**
   * Build context for conclusion phase (with participants)
   */
  private buildConclusionContextWithParticipants(theme: string, turns: DebateTurn[]): string {
    const i18n = t();
    let context = `# ${i18n.debateThemeHeader}\n${theme}\n\n`;
    context += `# ${i18n.completeDiscussion}\n\n`;

    for (const turn of turns) {
      context += `## ${i18n.turn} ${turn.turnNumber}\n\n`;
      for (const response of turn.responses) {
        context += `### ${response.displayName}\n${response.content}\n\n`;
      }
    }

    context += `\n${this.settings.conclusionPrompt}\n`;
    return context;
  }

  /**
   * Run voting phase with voters
   * User input and AI responses run in parallel
   */
  private async runVotingWithVoters(
    theme: string,
    conclusions: DebateConclusion[],
    voters: Voter[]
  ): Promise<VoteResult[]> {
    const voteMap = new Map<string, VoteResult>();
    const context = this.buildVotingContextWithParticipants(theme, conclusions);

    // Separate user and AI voters
    const userVoters = voters.filter(v => v.type === "user");
    const aiVoters = voters.filter(v => v.type !== "user");

    // Create promises for all voters (run in parallel)
    const allPromises: Promise<VoteResult | null>[] = [];

    // User voter promises
    for (const voter of userVoters) {
      const userPromise = (async (): Promise<VoteResult | null> => {
        if (this.abortController?.signal.aborted) {
          throw new AbortError("Debate aborted");
        }

        if (this.callbacks.onUserInputRequest) {
          const candidates = conclusions.map(c => ({
            id: c.participantId,
            displayName: c.displayName,
          }));

          const userResponse = await this.callbacks.onUserInputRequest({
            type: "vote",
            participantId: voter.id,
            displayName: voter.displayName,
            candidates,
          });

          const votedFor = conclusions.find(c => c.participantId === userResponse.votedForId);
          const vote: VoteResult = {
            voterId: voter.id,
            voterDisplayName: voter.displayName,
            votedForId: userResponse.votedForId || conclusions[0]?.participantId || "",
            votedForDisplayName: votedFor?.displayName || "",
            reason: userResponse.reason,
          };
          voteMap.set(voter.id, vote);
          this.callbacks.onVoteComplete?.(vote);
          return vote;
        }
        return null;
      })();
      allPromises.push(userPromise);
    }

    // AI voter promises
    for (const voter of aiVoters) {
      const aiPromise = (async (): Promise<VoteResult | null> => {
        if (this.abortController?.signal.aborted) {
          throw new AbortError("Debate aborted");
        }

        const provider = this.getProviderForType(voter.type);
        if (!provider) {
          return null;
        }

        try {
          const messages: Message[] = [
            { role: "user", content: context, timestamp: Date.now() }
          ];

          let response = "";
          for await (const chunk of provider.chatStream(
            messages,
            this.settings.systemPrompt,
            this.workingDirectory,
            this.abortController?.signal
          )) {
            if (chunk.type === "text" && chunk.content) {
              response += chunk.content;
            }
          }

          const vote = this.parseVoteWithParticipants(voter, response, conclusions);
          voteMap.set(voter.id, vote);
          this.callbacks.onVoteComplete?.(vote);
          return vote;
        } catch (error) {
          if (this.abortController?.signal.aborted) {
            throw new AbortError("Debate aborted");
          }
          const vote: VoteResult = {
            voterId: voter.id,
            voterDisplayName: voter.displayName,
            votedForId: voter.id, // Invalid vote
            votedForDisplayName: voter.displayName,
            reason: `Error: ${(error as Error).message}`,
          };
          voteMap.set(voter.id, vote);
          return vote;
        }
      })();
      allPromises.push(aiPromise);
    }

    // Wait for all voters to complete
    await Promise.all(allPromises);

    // Build votes in original voter order
    const votes: VoteResult[] = [];
    for (const voter of voters) {
      const vote = voteMap.get(voter.id);
      if (vote) {
        votes.push(vote);
      }
    }

    return votes;
  }

  /**
   * Build context for voting phase (with participants)
   */
  private buildVotingContextWithParticipants(theme: string, conclusions: DebateConclusion[]): string {
    const i18n = t();
    let context = `# ${i18n.debateThemeHeader}\n${theme}\n\n`;
    context += `# ${i18n.finalConclusions}\n\n`;

    for (const conclusion of conclusions) {
      context += `## ${i18n.conclusionOf(conclusion.displayName)}\n${conclusion.content}\n\n`;
    }

    // Build dynamic vote prompt with participant names
    const participantNames = conclusions.map(c => c.displayName).join(", ");
    const votePrompt = this.settings.votePrompt.replace(
      /Gemini,?\s*Claude,?\s*(or|and)?\s*Codex/gi,
      participantNames
    );

    // Auto-append format instruction (required for vote parsing)
    context += `\n${votePrompt}\n\n${i18n.voteFormatInstruction}\n`;
    return context;
  }

  /**
   * Parse vote response (can vote for self or others) - with participants
   */
  private parseVoteWithParticipants(
    voter: Voter,
    response: string,
    conclusions: DebateConclusion[]
  ): VoteResult {
    const responseLower = response.toLowerCase();

    // Helper to extract reason from response (captures multi-line reasons)
    const extractReason = (): string | undefined => {
      // Multi-line patterns (capture everything after the marker)
      const multiLinePatterns = [
        /理由[：:は]\s*([\s\S]+)/i,
        /[Rr]eason[：:]\s*([\s\S]+)/i,
        /なぜなら[、,]?\s*([\s\S]+)/i,
        /because\s+([\s\S]+)/i,
        /[-–—]\s*([\s\S]+)/,
      ];

      for (const pattern of multiLinePatterns) {
        const match = response.match(pattern);
        if (match) {
          // Clean up the extracted reason
          let reason = match[1].trim();
          // Remove trailing vote-related text if present
          reason = reason.replace(/^(以下の通りです。?\s*)/i, "");
          // Limit length but keep full content
          if (reason.length > 0) {
            return reason;
          }
        }
      }

      // Fallback: if response has multiple lines, take everything after first line
      const lines = response.split("\n").filter(l => l.trim());
      if (lines.length > 1) {
        // Skip first line (usually contains the vote target)
        return lines.slice(1).join("\n").trim();
      }

      return undefined;
    };

    // Helper to escape regex special characters
    const escapeRegex = (str: string): string => {
      return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    };

    // Strategy 1: Look for "VOTE: Name" or "投票: Name" format
    for (const participant of conclusions) {
      const displayName = participant.displayName;
      const baseName = displayName.replace(/[（(].+[）)]/, "").trim();

      const votePatterns = [
        new RegExp(`(?:VOTE|投票)[：:]\\s*${escapeRegex(displayName)}`, "i"),
        new RegExp(`(?:VOTE|投票)[：:]\\s*${escapeRegex(baseName)}`, "i"),
        new RegExp(`^\\s*${escapeRegex(displayName)}\\s*$`, "im"),
        new RegExp(`^\\s*${escapeRegex(baseName)}\\s*$`, "im"),
      ];

      for (const pattern of votePatterns) {
        if (pattern.test(response)) {
          return {
            voterId: voter.id,
            voterDisplayName: voter.displayName,
            votedForId: participant.participantId,
            votedForDisplayName: participant.displayName,
            reason: extractReason(),
          };
        }
      }
    }

    // Strategy 2: Look for participant name anywhere (prioritize longer matches)
    const sortedConclusions = [...conclusions].sort(
      (a, b) => b.displayName.length - a.displayName.length
    );

    for (const participant of sortedConclusions) {
      const displayName = participant.displayName;
      const baseName = displayName.replace(/[（(].+[）)]/, "").trim();
      const displayNameLower = displayName.toLowerCase();
      const baseNameLower = baseName.toLowerCase();

      if (responseLower.includes(displayNameLower) || responseLower.includes(baseNameLower)) {
        return {
          voterId: voter.id,
          voterDisplayName: voter.displayName,
          votedForId: participant.participantId,
          votedForDisplayName: participant.displayName,
          reason: extractReason(),
        };
      }
    }

    // Strategy 3: Look for common AI names
    const nameMapping: { pattern: RegExp; type: string }[] = [
      { pattern: /gemini/i, type: "gemini-cli" },
      { pattern: /claude/i, type: "claude-cli" },
      { pattern: /codex/i, type: "codex-cli" },
      { pattern: /user|ユーザー/i, type: "user" },
    ];

    for (const { pattern, type } of nameMapping) {
      if (pattern.test(response)) {
        const matchedParticipant = conclusions.find(c =>
          c.participantId.startsWith(type) ||
          c.displayName.toLowerCase().includes(type.replace("-cli", ""))
        );
        if (matchedParticipant) {
          return {
            voterId: voter.id,
            voterDisplayName: voter.displayName,
            votedForId: matchedParticipant.participantId,
            votedForDisplayName: matchedParticipant.displayName,
            reason: extractReason(),
          };
        }
      }
    }

    return {
      voterId: voter.id,
      voterDisplayName: voter.displayName,
      votedForId: voter.id,
      votedForDisplayName: voter.displayName,
      reason: "Unable to parse vote",
    };
  }

  /**
   * Determine winner(s) by vote count (all votes including self-votes are counted)
   * Returns multiple winners in case of a tie (draw)
   */
  private determineWinnersById(votes: VoteResult[], conclusions: DebateConclusion[]): { winnerIds: string[]; isDraw: boolean } {
    const voteCounts = new Map<string, number>();

    for (const conclusion of conclusions) {
      voteCounts.set(conclusion.participantId, 0);
    }

    for (const vote of votes) {
      // Count all votes including self-votes
      const current = voteCounts.get(vote.votedForId) || 0;
      voteCounts.set(vote.votedForId, current + 1);
    }

    // Find max vote count
    let maxVotes = 0;
    for (const count of voteCounts.values()) {
      if (count > maxVotes) {
        maxVotes = count;
      }
    }

    // Find all participants with max votes
    const winnerIds: string[] = [];
    for (const [participantId, count] of voteCounts) {
      if (count === maxVotes) {
        winnerIds.push(participantId);
      }
    }

    return {
      winnerIds,
      isDraw: winnerIds.length > 1,
    };
  }

  /**
   * Get display name for CLI type
   */
  private getDisplayName(cliType: CliType): string {
    switch (cliType) {
      case "gemini-cli":
        return "Gemini";
      case "claude-cli":
        return "Claude";
      case "codex-cli":
        return "Codex";
      default:
        return cliType;
    }
  }

  /**
   * Stop the current debate
   */
  stop(): void {
    this.abortController?.abort();
  }

  /**
   * Generate markdown note from debate result
   */
  static generateMarkdownNote(result: DebateResult): string {
    const lines: string[] = [];

    // Build winner display names
    const getWinnerDisplayName = (winnerId: string): string => {
      const participant = result.debateParticipants.find(p => p.id === winnerId);
      return participant?.displayName || winnerId;
    };

    // Header
    lines.push(`# AI Debate: ${result.theme}`);
    lines.push("");
    lines.push(`**Date:** ${new Date(result.startTime).toLocaleString()}`);
    lines.push(`**Duration:** ${Math.round((result.endTime - result.startTime) / 1000)} seconds`);
    if (result.isDraw) {
      const winnerNames = result.winnerIds.map(id => getWinnerDisplayName(id)).join(" & ");
      lines.push(`**Result:** Draw (${winnerNames})`);
    } else {
      lines.push(`**Winner:** ${result.winnerId ? getWinnerDisplayName(result.winnerId) : "No winner"}`);
    }
    lines.push("");

    // Participants
    lines.push("## Participants");
    lines.push("");
    for (const participant of result.debateParticipants) {
      const roleStr = participant.role ? ` (${participant.role})` : "";
      lines.push(`- ${participant.displayName}${roleStr}`);
    }
    lines.push("");

    // Discussion rounds (exclude last turn if it's the same as conclusions)
    const totalTurns = result.turns.length;
    const turnsToShow = result.conclusions.length > 0
      ? result.turns.filter(turn => turn.turnNumber !== totalTurns)
      : result.turns;

    if (turnsToShow.length > 0) {
      lines.push("## Discussion");
      lines.push("");

      for (const turn of turnsToShow) {
        lines.push(`### Turn ${turn.turnNumber}`);
        lines.push("");

        for (const response of turn.responses) {
          lines.push(`#### ${response.displayName}`);
          lines.push("");
          if (response.error) {
            lines.push(`> Error: ${response.error}`);
          } else {
            lines.push(response.content);
          }
          lines.push("");
        }
      }
    }

    // Conclusions
    lines.push("## Conclusions");
    lines.push("");

    for (const conclusion of result.conclusions) {
      lines.push(`### ${conclusion.displayName}'s Conclusion`);
      lines.push("");
      lines.push(conclusion.content);
      lines.push("");
    }

    // Voting results
    lines.push("## Voting Results");
    lines.push("");

    for (const vote of result.votes) {
      lines.push(`- **${vote.voterDisplayName}** voted for **${vote.votedForDisplayName}**${vote.reason ? `: ${vote.reason}` : ""}`);
    }
    lines.push("");

    // Final conclusion
    lines.push("## Final Conclusion");
    lines.push("");
    if (result.isDraw) {
      const winnerNames = result.winnerIds.map(id => getWinnerDisplayName(id)).join(" & ");
      lines.push(`> **Draw:** ${winnerNames}`);
      lines.push("");
      // Show each winner's conclusion
      for (const winnerId of result.winnerIds) {
        const winnerName = getWinnerDisplayName(winnerId);
        const conclusion = result.conclusions.find(c => c.participantId === winnerId);
        if (conclusion) {
          lines.push(`### ${winnerName}`);
          lines.push("");
          lines.push(conclusion.content);
          lines.push("");
        }
      }
    } else if (result.winnerId) {
      const winnerName = getWinnerDisplayName(result.winnerId);
      lines.push(`> Winner: **${winnerName}**`);
      lines.push("");
      lines.push(result.finalConclusion);
    } else {
      lines.push(result.finalConclusion);
    }

    return lines.join("\n");
  }
}
