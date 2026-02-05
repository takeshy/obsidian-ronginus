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
} from "../types";
import { CliProviderManager, CliProviderInterface } from "./cliProvider";
import { t } from "../i18n";

export interface DebateEventCallbacks {
  onPhaseChange?: (phase: DebatePhase) => void;
  onTurnStart?: (turnNumber: number) => void;
  onResponseStream?: (cliType: CliType, content: string) => void;
  onResponseComplete?: (cliType: CliType, response: DebateResponse) => void;
  onTurnComplete?: (turn: DebateTurn) => void;
  onConclusionStream?: (cliType: CliType, content: string) => void;
  onConclusionComplete?: (conclusion: DebateConclusion) => void;
  onVoteComplete?: (vote: VoteResult) => void;
  onDebateComplete?: (result: DebateResult) => void;
  onError?: (error: Error) => void;
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
   * Run a complete debate on a theme
   */
  async runDebate(theme: string, turns: number = this.settings.defaultTurns): Promise<DebateResult> {
    this.abortController = new AbortController();
    const startTime = Date.now();

    const providers = this.getVerifiedProviders();
    if (providers.length < 2) {
      throw new Error("At least 2 verified CLI providers are required for a debate. Please verify CLIs in settings.");
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
        const turnResult = await this.runTurn(
          theme,
          turn,
          allTurns,
          providers,
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
          conclusions.push({
            cliType: response.cliType,
            content: response.content,
          });
        }
      }

      // If conclusions weren't marked in last turn, get explicit conclusions
      if (conclusions.length === 0) {
        const explicitConclusions = await this.getConclusions(
          theme,
          allTurns,
          providers
        );
        conclusions.push(...explicitConclusions);
      }

      // Voting phase
      this.callbacks.onPhaseChange?.("voting");
      const voteResults = await this.runVoting(
        theme,
        conclusions,
        providers
      );
      votes.push(...voteResults);

      // Determine winner(s)
      const { winners, isDraw } = this.determineWinners(votes, conclusions);
      const winner = isDraw ? null : winners[0] || null;

      // Build final conclusion (combine if draw)
      let finalConclusion = "";
      if (isDraw) {
        finalConclusion = winners
          .map(w => conclusions.find(c => c.cliType === w)?.content || "")
          .join("\n\n---\n\n");
      } else if (winner) {
        finalConclusion = conclusions.find(c => c.cliType === winner)?.content || "";
      }

      const result: DebateResult = {
        theme,
        turns: allTurns,
        conclusions,
        votes,
        winner,
        winners,
        isDraw,
        finalConclusion,
        startTime,
        endTime: Date.now(),
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
   * Run a single turn of debate
   */
  private async runTurn(
    theme: string,
    turnNumber: number,
    previousTurns: DebateTurn[],
    providers: CliProviderInterface[],
    isLastTurn: boolean
  ): Promise<DebateTurn> {
    const responseMap = new Map<CliType, DebateResponse>();

    // Build context from previous turns
    const context = this.buildTurnContext(theme, previousTurns, isLastTurn);

    // Run all providers in parallel
    const promises = providers.map(async (provider) => {
      try {
        if (this.abortController?.signal.aborted) {
          throw new AbortError("Debate aborted");
        }
        const messages: Message[] = [
          { role: "user", content: context, timestamp: Date.now() }
        ];

        let response = "";
        const signal = this.abortController?.signal;

        for await (const chunk of provider.chatStream(
          messages,
          this.settings.systemPrompt,
          this.workingDirectory,
          signal
        )) {
          if (chunk.type === "text" && chunk.content) {
            response += chunk.content;
            this.callbacks.onResponseStream?.(provider.name, response);
          } else if (chunk.type === "error" && chunk.error) {
            throw new Error(chunk.error);
          }
        }

        const debateResponse: DebateResponse = {
          cliType: provider.name,
          content: response,
          isConclusion: isLastTurn,
          timestamp: Date.now(),
        };

        responseMap.set(provider.name, debateResponse);
        this.callbacks.onResponseComplete?.(provider.name, debateResponse);

        return debateResponse;
      } catch (error) {
        if (this.abortController?.signal.aborted) {
          throw new AbortError("Debate aborted");
        }
        const errorResponse: DebateResponse = {
          cliType: provider.name,
          content: "",
          isConclusion: false,
          timestamp: Date.now(),
          error: (error as Error).message,
        };
        responseMap.set(provider.name, errorResponse);
        return errorResponse;
      }
    });

    await Promise.all(promises);

    const responses: DebateResponse[] = [];
    for (const provider of providers) {
      const response = responseMap.get(provider.name);
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
   * Build context message for a turn
   */
  private buildTurnContext(
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
          const displayName = this.getDisplayName(response.cliType);
          context += `### ${displayName}\n${response.content}\n\n`;
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
   * Get explicit conclusions from all providers
   */
  private async getConclusions(
    theme: string,
    turns: DebateTurn[],
    providers: CliProviderInterface[]
  ): Promise<DebateConclusion[]> {
    const conclusions: DebateConclusion[] = [];
    const context = this.buildConclusionContext(theme, turns);

    const promises = providers.map(async (provider) => {
      try {
        if (this.abortController?.signal.aborted) {
          throw new AbortError("Debate aborted");
        }
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
            this.callbacks.onConclusionStream?.(provider.name, response);
          }
        }

        const conclusion: DebateConclusion = {
          cliType: provider.name,
          content: response,
        };
        conclusions.push(conclusion);
        this.callbacks.onConclusionComplete?.(conclusion);
        return conclusion;
      } catch (error) {
        if (this.abortController?.signal.aborted) {
          throw new AbortError("Debate aborted");
        }
        const conclusion: DebateConclusion = {
          cliType: provider.name,
          content: `Error: ${(error as Error).message}`,
        };
        conclusions.push(conclusion);
        return conclusion;
      }
    });

    await Promise.all(promises);
    return conclusions;
  }

  /**
   * Build context for conclusion phase
   */
  private buildConclusionContext(theme: string, turns: DebateTurn[]): string {
    const i18n = t();
    let context = `# ${i18n.debateThemeHeader}\n${theme}\n\n`;
    context += `# ${i18n.completeDiscussion}\n\n`;

    for (const turn of turns) {
      context += `## ${i18n.turn} ${turn.turnNumber}\n\n`;
      for (const response of turn.responses) {
        const displayName = this.getDisplayName(response.cliType);
        context += `### ${displayName}\n${response.content}\n\n`;
      }
    }

    context += `\n${this.settings.conclusionPrompt}\n`;
    return context;
  }

  /**
   * Run voting phase
   */
  private async runVoting(
    theme: string,
    conclusions: DebateConclusion[],
    providers: CliProviderInterface[]
  ): Promise<VoteResult[]> {
    const votes: VoteResult[] = [];
    const context = this.buildVotingContext(theme, conclusions);

    const promises = providers.map(async (provider) => {
      try {
        if (this.abortController?.signal.aborted) {
          throw new AbortError("Debate aborted");
        }
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

        const vote = this.parseVote(provider.name, response, conclusions);
        votes.push(vote);
        this.callbacks.onVoteComplete?.(vote);
        return vote;
      } catch (error) {
        if (this.abortController?.signal.aborted) {
          throw new AbortError("Debate aborted");
        }
        const vote: VoteResult = {
          voter: provider.name,
          votedFor: provider.name, // Invalid vote
          reason: `Error: ${(error as Error).message}`,
        };
        votes.push(vote);
        return vote;
      }
    });

    await Promise.all(promises);
    return votes;
  }

  /**
   * Build context for voting phase
   */
  private buildVotingContext(theme: string, conclusions: DebateConclusion[]): string {
    const i18n = t();
    let context = `# ${i18n.debateThemeHeader}\n${theme}\n\n`;
    context += `# ${i18n.finalConclusions}\n\n`;

    for (const conclusion of conclusions) {
      const displayName = this.getDisplayName(conclusion.cliType);
      context += `## ${i18n.conclusionOf(displayName)}\n${conclusion.content}\n\n`;
    }

    context += `\n${this.settings.votePrompt}\n`;
    return context;
  }

  /**
   * Parse vote response (can vote for self or others)
   */
  private parseVote(
    voter: CliType,
    response: string,
    conclusions: DebateConclusion[]
  ): VoteResult {
    const voteLineMatch = response.match(/^\s*VOTE\s*:\s*(Gemini|Claude|Codex)\b.*$/im);
    if (voteLineMatch) {
      const votedName = voteLineMatch[1].toLowerCase();
      for (const participant of conclusions) {
        const displayName = this.getDisplayName(participant.cliType).toLowerCase();
        if (displayName === votedName) {
          const reasonMatch = response.match(/[-–]\s*(.+)$/);
          return {
            voter,
            votedFor: participant.cliType,
            reason: reasonMatch ? reasonMatch[1].trim() : undefined,
          };
        }
      }
    }

    return {
      voter,
      votedFor: voter,
      reason: "Unable to parse vote",
    };
  }

  /**
   * Determine winner(s) by vote count (all votes including self-votes are counted)
   * Returns multiple winners in case of a tie (draw)
   */
  private determineWinners(votes: VoteResult[], conclusions: DebateConclusion[]): { winners: CliType[]; isDraw: boolean } {
    const voteCounts = new Map<CliType, number>();

    for (const conclusion of conclusions) {
      voteCounts.set(conclusion.cliType, 0);
    }

    for (const vote of votes) {
      // Count all votes including self-votes
      const current = voteCounts.get(vote.votedFor) || 0;
      voteCounts.set(vote.votedFor, current + 1);
    }

    // Find max vote count
    let maxVotes = 0;
    for (const count of voteCounts.values()) {
      if (count > maxVotes) {
        maxVotes = count;
      }
    }

    // Find all participants with max votes
    const winners: CliType[] = [];
    for (const [cliType, count] of voteCounts) {
      if (count === maxVotes) {
        winners.push(cliType);
      }
    }

    return {
      winners,
      isDraw: winners.length > 1,
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

    // Header
    lines.push(`# AI Debate: ${result.theme}`);
    lines.push("");
    lines.push(`**Date:** ${new Date(result.startTime).toLocaleString()}`);
    lines.push(`**Duration:** ${Math.round((result.endTime - result.startTime) / 1000)} seconds`);
    if (result.isDraw) {
      const winnerNames = result.winners.map(w => getDisplayNameStatic(w)).join(" & ");
      lines.push(`**Result:** Draw (${winnerNames})`);
    } else {
      lines.push(`**Winner:** ${result.winner ? getDisplayNameStatic(result.winner) : "No winner"}`);
    }
    lines.push("");

    // Discussion rounds
    lines.push("## Discussion");
    lines.push("");

    for (const turn of result.turns) {
      lines.push(`### Turn ${turn.turnNumber}`);
      lines.push("");

      for (const response of turn.responses) {
        const displayName = getDisplayNameStatic(response.cliType);
        lines.push(`#### ${displayName}`);
        lines.push("");
        if (response.error) {
          lines.push(`> Error: ${response.error}`);
        } else {
          lines.push(response.content);
        }
        lines.push("");
      }
    }

    // Conclusions
    lines.push("## Conclusions");
    lines.push("");

    for (const conclusion of result.conclusions) {
      const displayName = getDisplayNameStatic(conclusion.cliType);
      lines.push(`### ${displayName}'s Conclusion`);
      lines.push("");
      lines.push(conclusion.content);
      lines.push("");
    }

    // Voting results
    lines.push("## Voting Results");
    lines.push("");

    for (const vote of result.votes) {
      const voterName = getDisplayNameStatic(vote.voter);
      const votedForName = getDisplayNameStatic(vote.votedFor);
      lines.push(`- **${voterName}** voted for **${votedForName}**${vote.reason ? `: ${vote.reason}` : ""}`);
    }
    lines.push("");

    // Final conclusion
    lines.push("## Final Conclusion");
    lines.push("");
    if (result.isDraw) {
      const winnerNames = result.winners.map(w => getDisplayNameStatic(w)).join(" & ");
      lines.push(`> **Draw:** ${winnerNames}`);
      lines.push("");
      // Show each winner's conclusion
      for (const winnerCli of result.winners) {
        const winnerName = getDisplayNameStatic(winnerCli);
        const conclusion = result.conclusions.find(c => c.cliType === winnerCli);
        if (conclusion) {
          lines.push(`### ${winnerName}`);
          lines.push("");
          lines.push(conclusion.content);
          lines.push("");
        }
      }
    } else if (result.winner) {
      const winnerName = getDisplayNameStatic(result.winner);
      lines.push(`> Winner: **${winnerName}**`);
      lines.push("");
      lines.push(result.finalConclusion);
    } else {
      lines.push(result.finalConclusion);
    }

    return lines.join("\n");
  }
}

function getDisplayNameStatic(cliType: CliType): string {
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
