import { Plugin, WorkspaceLeaf } from "obsidian";
import { DebateView, VIEW_TYPE_DEBATE } from "./ui/DebateView";
import { SettingsTab } from "./ui/SettingsTab";
import { RonginusSettings, DEFAULT_SETTINGS, DEFAULT_CLI_CONFIG } from "./types";
import { initLocale } from "./i18n";

export default class RonginusPlugin extends Plugin {
  settings: RonginusSettings = { ...DEFAULT_SETTINGS };

  async onload(): Promise<void> {
    // Initialize locale
    initLocale();

    await this.loadSettings();

    // Register the debate view
    this.registerView(
      VIEW_TYPE_DEBATE,
      (leaf) => new DebateView(leaf, this)
    );

    // Add settings tab
    this.addSettingTab(new SettingsTab(this.app, this));

    // Add ribbon icon
    this.addRibbonIcon("messages-square", "Open AI debate", () => {
      void this.activateDebateView();
    });

    // Add command to open debate view
    this.addCommand({
      id: "open-debate-view",
      name: "Open AI debate",
      callback: () => {
        void this.activateDebateView();
      },
    });

    // Ensure view exists on layout ready
    this.app.workspace.onLayoutReady(() => {
      void this.ensureDebateViewExists();
    });
  }

  onunload(): void {
    // Intentionally no view detachment to avoid resetting user layouts.
  }

  async loadSettings(): Promise<void> {
    const loaded = await this.loadData();
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...loaded,
      cliConfig: {
        ...DEFAULT_CLI_CONFIG,
        ...(loaded?.cliConfig || {}),
      },
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async ensureDebateViewExists(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DEBATE);
    if (leaves.length === 0) {
      let leaf = this.app.workspace.getRightLeaf(false);
      if (!leaf) {
        leaf = this.app.workspace.getRightLeaf(true);
      }
      if (leaf) {
        await leaf.setViewState({
          type: VIEW_TYPE_DEBATE,
          active: false,
        });
      }
    }
  }

  async activateDebateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;

    const existingLeaves = workspace.getLeavesOfType(VIEW_TYPE_DEBATE);
    if (existingLeaves.length > 0) {
      leaf = existingLeaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({
          type: VIEW_TYPE_DEBATE,
          active: true,
        });
      }
    }

    if (leaf) {
      void workspace.revealLeaf(leaf);
    }
  }
}
