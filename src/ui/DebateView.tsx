import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import type RonginusPlugin from "../plugin";
import { DebatePanel } from "./DebatePanel";
import type { DebateState, DebateResult, Participant, Voter, ParticipantType } from "../types";
import { DebateEngine, UserInputRequest, UserInputResponse } from "../core/debateEngine";
import { t } from "../i18n";

export const VIEW_TYPE_DEBATE = "ronginus-debate-view";

// Helper to get base display name for a participant type
function getBaseDisplayName(type: ParticipantType): string {
  switch (type) {
    case "gemini-cli":
      return "Gemini";
    case "claude-cli":
      return "Claude";
    case "codex-cli":
      return "Codex";
    case "user":
      return t().user;
    default:
      return type;
  }
}

export class DebateView extends ItemView {
  plugin: RonginusPlugin;
  private root: Root | null = null;
  private debateEngine: DebateEngine | null = null;
  private state: DebateState = this.getInitialState();
  private panelKey: number = 0;
  private userInputResolver: ((response: UserInputResponse) => void) | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: RonginusPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  private getDefaultParticipants(): Participant[] {
    const participants: Participant[] = [];
    const cliConfig = this.plugin.settings.cliConfig;

    if (cliConfig.geminiVerified) {
      participants.push({
        id: "gemini-cli-1",
        type: "gemini-cli",
        displayName: getBaseDisplayName("gemini-cli"),
      });
    }
    if (cliConfig.claudeVerified) {
      participants.push({
        id: "claude-cli-1",
        type: "claude-cli",
        displayName: getBaseDisplayName("claude-cli"),
      });
    }
    if (cliConfig.codexVerified) {
      participants.push({
        id: "codex-cli-1",
        type: "codex-cli",
        displayName: getBaseDisplayName("codex-cli"),
      });
    }

    return participants;
  }

  private getDefaultVoters(participants?: Participant[]): Voter[] {
    // If participants provided, derive voters from them
    if (participants && participants.length > 0) {
      return participants.map(p => ({
        id: `${p.type}-voter-${p.id}`,
        type: p.type,
        displayName: getBaseDisplayName(p.type),
      }));
    }

    // Otherwise, use verified CLIs
    const voters: Voter[] = [];
    const cliConfig = this.plugin.settings.cliConfig;

    if (cliConfig.geminiVerified) {
      voters.push({
        id: "gemini-cli-voter-1",
        type: "gemini-cli",
        displayName: getBaseDisplayName("gemini-cli"),
      });
    }
    if (cliConfig.claudeVerified) {
      voters.push({
        id: "claude-cli-voter-1",
        type: "claude-cli",
        displayName: getBaseDisplayName("claude-cli"),
      });
    }
    if (cliConfig.codexVerified) {
      voters.push({
        id: "codex-cli-voter-1",
        type: "codex-cli",
        displayName: getBaseDisplayName("codex-cli"),
      });
    }

    return voters;
  }

  private getInitialState(): DebateState {
    return {
      phase: "idle",
      currentTurn: 0,
      totalTurns: this.plugin?.settings?.defaultTurns || 3,
      theme: "",
      turns: [],
      conclusions: [],
      votes: [],
      winnerId: null,
      winnerIds: [],
      isDraw: false,
      finalConclusion: "",
      streamingResponses: new Map(),
      startTime: undefined,
      endTime: undefined,
      debateParticipants: [],
      voteParticipants: [],
    };
  }

  getViewType(): string {
    return VIEW_TYPE_DEBATE;
  }

  getDisplayText(): string {
    return "AI debate";
  }

  getIcon(): string {
    return "messages-square";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("ronginus-debate-container");

    // Initialize state with default participants
    const defaultParticipants = this.getDefaultParticipants();
    this.state = {
      ...this.getInitialState(),
      debateParticipants: defaultParticipants,
      voteParticipants: this.getDefaultVoters(defaultParticipants),
    };

    this.root = createRoot(container);
    this.renderPanel();
    await Promise.resolve();
  }

  async onClose(): Promise<void> {
    this.debateEngine?.stop();
    this.root?.unmount();
    await Promise.resolve();
  }

  private renderPanel(): void {
    this.root?.render(
      <DebatePanel
        key={this.panelKey}
        state={this.state}
        settings={this.plugin.settings}
        onStartDebate={(theme, turns, debateParticipants, voteParticipants) => {
          void this.startDebate(theme, turns, debateParticipants, voteParticipants);
        }}
        onStopDebate={() => this.stopDebate()}
        onSaveNote={() => { void this.saveNote(); }}
        onReset={() => this.resetDebate()}
        onUserDebateInput={(content) => this.handleUserDebateInput(content)}
        onUserVoteInput={(votedForId, reason) => this.handleUserVoteInput(votedForId, reason)}
      />
    );
  }

  private updateState(updates: Partial<DebateState>): void {
    this.state = { ...this.state, ...updates };
    this.renderPanel();
  }

  private handleUserDebateInput(content: string): void {
    if (this.userInputResolver) {
      this.userInputResolver({ content });
      this.userInputResolver = null;
      this.updateState({ pendingUserInput: undefined });
    }
  }

  private handleUserVoteInput(votedForId: string, reason: string): void {
    if (this.userInputResolver) {
      this.userInputResolver({ content: "", votedForId, reason });
      this.userInputResolver = null;
      this.updateState({ pendingUserInput: undefined });
    }
  }

  private async startDebate(
    theme: string,
    turns: number,
    debateParticipants: Participant[],
    voteParticipants: Voter[]
  ): Promise<void> {
    const i18n = t();
    if (!theme.trim()) {
      new Notice(i18n.enterTheme);
      return;
    }

    // Check for at least 1 participant (not 2 verified CLIs)
    if (debateParticipants.length < 1) {
      new Notice(i18n.needOneParticipant);
      return;
    }

    // Use vault root as working directory
    const vaultPath = (this.app.vault.adapter as { basePath?: string }).basePath || "";
    this.debateEngine = new DebateEngine(this.plugin.settings, vaultPath);

    this.updateState({
      phase: "thinking",
      theme,
      totalTurns: turns,
      currentTurn: 1,
      turns: [],
      conclusions: [],
      votes: [],
      winnerId: null,
      winnerIds: [],
      isDraw: false,
      finalConclusion: "",
      error: undefined,
      streamingResponses: new Map(),
      startTime: undefined,
      endTime: undefined,
      debateParticipants,
      voteParticipants,
    });

    this.debateEngine.setCallbacks({
      onPhaseChange: (phase) => {
        this.updateState({ phase });
      },
      onTurnStart: (turnNumber) => {
        this.updateState({
          currentTurn: turnNumber,
          streamingResponses: new Map(),
        });
      },
      onResponseStream: (participantId, content) => {
        const newMap = new Map(this.state.streamingResponses);
        newMap.set(participantId, content);
        this.updateState({ streamingResponses: newMap });
      },
      onTurnComplete: (turn) => {
        this.updateState({
          turns: [...this.state.turns, turn],
          streamingResponses: new Map(),
        });
      },
      onConclusionStream: (participantId, content) => {
        const newMap = new Map(this.state.streamingResponses);
        newMap.set(participantId, content);
        this.updateState({ streamingResponses: newMap });
      },
      onConclusionComplete: (conclusion) => {
        this.updateState({
          conclusions: [...this.state.conclusions, conclusion],
        });
      },
      onVoteComplete: (vote) => {
        this.updateState({
          votes: [...this.state.votes, vote],
        });
      },
      onDebateComplete: (result) => {
        this.updateState({
          phase: "complete",
          winnerId: result.winnerId,
          winnerIds: result.winnerIds,
          isDraw: result.isDraw,
          finalConclusion: result.finalConclusion,
          startTime: result.startTime,
          endTime: result.endTime,
        });
      },
      onError: (error) => {
        if (error.name === "AbortError") {
          return;
        }
        this.updateState({
          phase: "error",
          error: error.message,
        });
        new Notice(t().debateError(error.message));
      },
      onUserInputRequest: async (request: UserInputRequest): Promise<UserInputResponse> => {
        return new Promise((resolve) => {
          this.userInputResolver = resolve;
          this.updateState({
            pendingUserInput: {
              type: request.type,
              participantId: request.participantId,
              role: request.role,
            },
            currentParticipantId: request.participantId,
          });
        });
      },
    });

    try {
      await this.debateEngine.runDebate(theme, turns, debateParticipants, voteParticipants);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Debate failed:", error);
    }
  }

  private stopDebate(): void {
    this.debateEngine?.stop();
    this.userInputResolver = null;
    this.updateState({ phase: "idle", pendingUserInput: undefined });
    new Notice(t().debateStopped);
  }

  private async saveNote(): Promise<void> {
    const i18n = t();
    if (this.state.phase !== "complete") {
      new Notice(i18n.debateNotComplete);
      return;
    }

    const result: DebateResult = {
      theme: this.state.theme,
      turns: this.state.turns,
      conclusions: this.state.conclusions,
      votes: this.state.votes,
      winnerId: this.state.winnerId,
      winnerIds: this.state.winnerIds,
      isDraw: this.state.isDraw,
      finalConclusion: this.state.finalConclusion,
      startTime: this.state.startTime ?? Date.now(),
      endTime: this.state.endTime ?? Date.now(),
      debateParticipants: this.state.debateParticipants,
      voteParticipants: this.state.voteParticipants,
    };

    const markdown = DebateEngine.generateMarkdownNote(result);
    const folder = this.plugin.settings.outputFolder;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const sanitizedTheme = this.state.theme.slice(0, 50).replace(/[\\/:*?"<>|]/g, "_");
    const fileName = `${folder}/${timestamp}-${sanitizedTheme}.md`;

    try {
      // Ensure folder exists
      const folderExists = this.app.vault.getAbstractFileByPath(folder);
      if (!folderExists) {
        await this.app.vault.createFolder(folder);
      }

      await this.app.vault.create(fileName, markdown);
      new Notice(i18n.debateSaved(fileName));

      // Open the created file
      const file = this.app.vault.getAbstractFileByPath(fileName);
      if (file) {
        await this.app.workspace.getLeaf().openFile(file as import("obsidian").TFile);
      }

      // Reset to new debate screen
      this.resetDebate();
    } catch (error) {
      new Notice(i18n.debateSaveFailed((error as Error).message));
    }
  }

  private resetDebate(): void {
    this.debateEngine?.stop();
    this.userInputResolver = null;
    const defaultParticipants = this.getDefaultParticipants();
    this.state = {
      ...this.getInitialState(),
      debateParticipants: defaultParticipants,
      voteParticipants: this.getDefaultVoters(defaultParticipants),
    };
    this.panelKey++;
    this.renderPanel();
  }
}
