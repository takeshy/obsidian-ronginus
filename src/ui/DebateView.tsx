import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import type RonginusPlugin from "../plugin";
import { DebatePanel } from "./DebatePanel";
import type { DebateState, DebateResult } from "../types";
import { countVerifiedClis } from "../types";
import { DebateEngine } from "../core/debateEngine";
import { t } from "../i18n";

export const VIEW_TYPE_DEBATE = "ronginus-debate-view";

export class DebateView extends ItemView {
  plugin: RonginusPlugin;
  private root: Root | null = null;
  private debateEngine: DebateEngine | null = null;
  private state: DebateState = this.getInitialState();
  private panelKey: number = 0;

  constructor(leaf: WorkspaceLeaf, plugin: RonginusPlugin) {
    super(leaf);
    this.plugin = plugin;
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
      winner: null,
      winners: [],
      isDraw: false,
      finalConclusion: "",
      streamingResponses: new Map(),
      startTime: undefined,
      endTime: undefined,
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
        onStartDebate={(theme, turns) => { void this.startDebate(theme, turns); }}
        onStopDebate={() => this.stopDebate()}
        onSaveNote={() => { void this.saveNote(); }}
        onReset={() => this.resetDebate()}
      />
    );
  }

  private updateState(updates: Partial<DebateState>): void {
    this.state = { ...this.state, ...updates };
    this.renderPanel();
  }

  private async startDebate(theme: string, turns: number): Promise<void> {
    const i18n = t();
    if (!theme.trim()) {
      new Notice(i18n.enterTheme);
      return;
    }

    // Check for verified CLIs
    const verifiedCount = countVerifiedClis(this.plugin.settings.cliConfig);
    if (verifiedCount < 2) {
      new Notice(i18n.needTwoClis);
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
      winner: null,
      winners: [],
      isDraw: false,
      finalConclusion: "",
      error: undefined,
      streamingResponses: new Map(),
      startTime: undefined,
      endTime: undefined,
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
      onResponseStream: (cliType, content) => {
        const newMap = new Map(this.state.streamingResponses);
        newMap.set(cliType, content);
        this.updateState({ streamingResponses: newMap });
      },
      onTurnComplete: (turn) => {
        this.updateState({
          turns: [...this.state.turns, turn],
          streamingResponses: new Map(),
        });
      },
      onConclusionStream: (cliType, content) => {
        const newMap = new Map(this.state.streamingResponses);
        newMap.set(cliType, content);
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
          winner: result.winner,
          winners: result.winners,
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
    });

    try {
      await this.debateEngine.runDebate(theme, turns);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Debate failed:", error);
    }
  }

  private stopDebate(): void {
    this.debateEngine?.stop();
    this.updateState({ phase: "idle" });
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
      winner: this.state.winner,
      winners: this.state.winners,
      isDraw: this.state.isDraw,
      finalConclusion: this.state.finalConclusion,
      startTime: this.state.startTime ?? Date.now(),
      endTime: this.state.endTime ?? Date.now(),
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
    this.state = this.getInitialState();
    this.panelKey++;
    this.renderPanel();
  }
}
