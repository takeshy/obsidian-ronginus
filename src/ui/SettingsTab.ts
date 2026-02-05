import { App, PluginSettingTab, Setting, Notice, Modal } from "obsidian";
import type RonginusPlugin from "../plugin";
import {
  verifyGeminiCli,
  verifyClaudeCli,
  verifyCodexCli,
  validateCliPath,
  isWindows,
} from "../core/cliProvider";
import { DEFAULT_CLI_CONFIG, countVerifiedClis } from "../types";
import { t } from "../i18n";

type CliType = "gemini" | "claude" | "codex";

/**
 * Modal for CLI path configuration
 */
class CliPathModal extends Modal {
  private cliType: CliType;
  private currentPath: string;
  private onSave: (path: string | undefined) => void | Promise<void>;

  constructor(
    app: App,
    cliType: CliType,
    currentPath: string | undefined,
    onSave: (path: string | undefined) => void | Promise<void>
  ) {
    super(app);
    this.cliType = cliType;
    this.currentPath = currentPath || "";
    this.onSave = onSave;
  }

  onOpen() {
    const { contentEl } = this;
    const i18n = t();
    contentEl.addClass("ronginus-cli-path-modal");
    contentEl.createEl("h2", { text: i18n.cliPathSettings });

    const cliName = this.cliType === "gemini" ? "Gemini" : this.cliType === "claude" ? "Claude" : "Codex";

    new Setting(contentEl)
      .setName(cliName + " CLI")
      .addText((text) => {
        text
          .setPlaceholder(i18n.cliPathPlaceholder)
          .setValue(this.currentPath)
          .onChange((value) => {
            this.currentPath = value;
          });
        text.inputEl.addClass("ronginus-cli-path-input");
        text.inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            this.save();
          }
        });
      });

    // Show OS-specific help note
    const noteEl = contentEl.createDiv({ cls: "ronginus-cli-path-note" });
    noteEl.textContent = isWindows() ? i18n.cliPathNoteWindows : i18n.cliPathNoteUnix;

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText(i18n.clear).onClick(() => {
          void this.clear();
        })
      )
      .addButton((btn) =>
        btn.setButtonText(i18n.cancel).onClick(() => {
          this.close();
        })
      )
      .addButton((btn) =>
        btn
          .setButtonText(i18n.save)
          .setCta()
          .onClick(() => {
            this.save();
          })
      );
  }

  private save() {
    const i18n = t();
    const path = this.currentPath.trim();
    if (path) {
      const result = validateCliPath(path);
      if (!result.valid) {
        if (result.reason === "file_not_found") {
          new Notice(i18n.fileNotFound);
        } else {
          new Notice(i18n.invalidChars);
        }
        return;
      }
    }
    void this.onSave(path || undefined);
    this.close();
  }

  private async clear() {
    await this.onSave(undefined);
    this.close();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

export class SettingsTab extends PluginSettingTab {
  plugin: RonginusPlugin;
  private verifyingCli: CliType | null = null;

  constructor(app: App, plugin: RonginusPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    const i18n = t();
    containerEl.empty();

    const cliConfig = this.plugin.settings.cliConfig || DEFAULT_CLI_CONFIG;

    new Setting(containerEl).setName(i18n.settingsTitle).setHeading();

    // CLI Providers section
    new Setting(containerEl).setName(i18n.cliProviders).setHeading();

    // Introduction
    const introEl = containerEl.createDiv({ cls: "setting-item-description ronginus-cli-intro" });
    introEl.textContent = i18n.cliIntro;

    // Gemini CLI row
    this.createCliVerifyRow(containerEl, {
      name: i18n.geminiCli,
      cliType: "gemini",
      isVerified: cliConfig.geminiVerified,
      customPath: cliConfig.geminiCliPath,
      installCmd: i18n.installGemini,
      onVerify: () => this.handleVerifyGeminiCli(),
      onDisable: () => this.handleDisableCli("gemini"),
    });

    // Claude CLI row
    this.createCliVerifyRow(containerEl, {
      name: i18n.claudeCli,
      cliType: "claude",
      isVerified: cliConfig.claudeVerified,
      customPath: cliConfig.claudeCliPath,
      installCmd: i18n.installClaude,
      onVerify: () => this.handleVerifyClaudeCli(),
      onDisable: () => this.handleDisableCli("claude"),
    });

    // Codex CLI row
    this.createCliVerifyRow(containerEl, {
      name: i18n.codexCli,
      cliType: "codex",
      isVerified: cliConfig.codexVerified,
      customPath: cliConfig.codexCliPath,
      installCmd: i18n.installCodex,
      onVerify: () => this.handleVerifyCodexCli(),
      onDisable: () => this.handleDisableCli("codex"),
    });

    // Show CLI count status
    const verifiedCount = countVerifiedClis(cliConfig);
    const statusEl = containerEl.createDiv({ cls: "ronginus-cli-count-status" });
    if (verifiedCount >= 1) {
      statusEl.addClass("ronginus-cli-count-ok");
      statusEl.textContent = i18n.clisVerifiedReady(verifiedCount);
    } else {
      statusEl.addClass("ronginus-cli-count-warning");
      statusEl.textContent = i18n.clisVerifiedNeed(verifiedCount);
    }

    // General settings
    new Setting(containerEl).setName(i18n.general).setHeading();

    new Setting(containerEl)
      .setName(i18n.outputFolder)
      .setDesc(i18n.outputFolderDesc)
      .addText((text) =>
        text
          .setPlaceholder("Debates")
          .setValue(this.plugin.settings.outputFolder)
          .onChange(async (value) => {
            this.plugin.settings.outputFolder = value || "Debates";
            await this.plugin.saveSettings();
          })
      );

    // Prompts section
    new Setting(containerEl).setName(i18n.prompts).setHeading();

    new Setting(containerEl)
      .setName(i18n.systemPrompt)
      .setDesc(i18n.systemPromptDesc)
      .addTextArea((text) => {
        text
          .setPlaceholder("System prompt...")
          .setValue(this.plugin.settings.systemPrompt)
          .onChange(async (value) => {
            this.plugin.settings.systemPrompt = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 4;
        text.inputEl.addClass("ronginus-settings-textarea");
      });

    new Setting(containerEl)
      .setName(i18n.conclusionPrompt)
      .setDesc(i18n.conclusionPromptDesc)
      .addTextArea((text) => {
        text
          .setPlaceholder("Conclusion prompt...")
          .setValue(this.plugin.settings.conclusionPrompt)
          .onChange(async (value) => {
            this.plugin.settings.conclusionPrompt = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 4;
        text.inputEl.addClass("ronginus-settings-textarea");
      });

    new Setting(containerEl)
      .setName(i18n.votePrompt)
      .addTextArea((text) => {
        text
          .setPlaceholder("Vote prompt...")
          .setValue(this.plugin.settings.votePrompt)
          .onChange(async (value) => {
            this.plugin.settings.votePrompt = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 4;
        text.inputEl.addClass("ronginus-settings-textarea");
      });

    // Add note about auto-appended format instruction
    containerEl.createEl("p", {
      text: i18n.votePromptDesc,
      cls: "ronginus-vote-prompt-note",
    });
  }

  private createCliVerifyRow(
    containerEl: HTMLElement,
    options: {
      name: string;
      cliType: CliType;
      isVerified: boolean;
      customPath?: string;
      installCmd: string;
      onVerify: () => Promise<void>;
      onDisable: () => Promise<void>;
    }
  ): void {
    const i18n = t();
    const setting = new Setting(containerEl)
      .setName(options.name)
      .setDesc(`Install: ${options.installCmd}`);

    // Add status element first
    const statusEl = setting.controlEl.createDiv({ cls: "ronginus-cli-row-status" });

    const isVerifying = this.verifyingCli === options.cliType;

    if (options.isVerified) {
      // Verified state: show status badge and Disable button
      statusEl.addClass("ronginus-cli-status--success");
      statusEl.textContent = i18n.verified;

      setting.addButton((button) =>
        button
          .setButtonText(i18n.disable)
          .setDisabled(isVerifying)
          .onClick(() => void options.onDisable())
      );
    } else if (isVerifying) {
      // Verifying state: show verifying status and disabled button
      statusEl.addClass("ronginus-cli-status--verifying");
      statusEl.textContent = i18n.verifying;

      setting.addButton((button) =>
        button
          .setButtonText(i18n.verifying)
          .setDisabled(true)
      );
    } else {
      // Not verified: show Verify button
      setting.addButton((button) =>
        button
          .setButtonText(i18n.verify)
          .setCta()
          .setDisabled(this.verifyingCli !== null) // Disable if another CLI is being verified
          .onClick(() => void options.onVerify())
      );
    }

    // Add settings button (gear icon)
    setting.addExtraButton((button) =>
      button
        .setIcon("settings")
        .setTooltip(i18n.cliPathSettings)
        .setDisabled(isVerifying)
        .onClick(() => {
          this.openCliPathModal(options.cliType, options.customPath);
        })
    );
  }

  private openCliPathModal(cliType: CliType, currentPath?: string): void {
    const i18n = t();
    new CliPathModal(
      this.app,
      cliType,
      currentPath,
      async (path: string | undefined) => {
        const cliConfig = this.plugin.settings.cliConfig;
        const pathKey = cliType === "gemini" ? "geminiCliPath" :
                        cliType === "claude" ? "claudeCliPath" : "codexCliPath";

        if (path) {
          this.plugin.settings.cliConfig = { ...cliConfig, [pathKey]: path };
          await this.plugin.saveSettings();
          new Notice(i18n.cliPathSaved);
        } else {
          // Clear the path
          const newConfig = { ...cliConfig };
          delete newConfig[pathKey];
          this.plugin.settings.cliConfig = newConfig;
          await this.plugin.saveSettings();
          new Notice(i18n.cliPathCleared);
        }
        this.display();
      }
    ).open();
  }

  private async handleDisableCli(cliType: CliType): Promise<void> {
    const i18n = t();
    const verifiedKey = cliType === "gemini" ? "geminiVerified" :
                        cliType === "claude" ? "claudeVerified" : "codexVerified";
    const cliName = cliType === "gemini" ? "Gemini" : cliType === "claude" ? "Claude" : "Codex";

    this.plugin.settings.cliConfig = {
      ...this.plugin.settings.cliConfig,
      [verifiedKey]: false,
    };
    await this.plugin.saveSettings();
    this.display();
    new Notice(i18n.cliDisabled(cliName));
  }

  private async handleVerifyGeminiCli(): Promise<void> {
    const i18n = t();

    // Set verifying state and refresh UI
    this.verifyingCli = "gemini";
    this.display();

    try {
      const customPath = this.plugin.settings.cliConfig.geminiCliPath;
      const result = await verifyGeminiCli(customPath);

      // Clear verifying state
      this.verifyingCli = null;

      if (!result.success) {
        this.plugin.settings.cliConfig = {
          ...this.plugin.settings.cliConfig,
          geminiVerified: false,
        };
        await this.plugin.saveSettings();
        this.display();

        if (result.stage === "version") {
          new Notice(`${i18n.notFound}: ${result.error || "Gemini CLI not found"}`);
        } else {
          new Notice(`${i18n.loginRequired}: ${i18n.runGeminiAuth}`);
        }
        return;
      }

      // Success - save first, then refresh UI, then show notice
      this.plugin.settings.cliConfig = {
        ...this.plugin.settings.cliConfig,
        geminiVerified: true,
      };
      await this.plugin.saveSettings();
      this.display();
      new Notice(i18n.cliVerifiedSuccess("Gemini"));
    } catch (err) {
      // Clear verifying state
      this.verifyingCli = null;

      this.plugin.settings.cliConfig = {
        ...this.plugin.settings.cliConfig,
        geminiVerified: false,
      };
      await this.plugin.saveSettings();
      this.display();
      new Notice(`${i18n.error}: ${String(err)}`);
    }
  }

  private async handleVerifyClaudeCli(): Promise<void> {
    const i18n = t();

    // Set verifying state and refresh UI
    this.verifyingCli = "claude";
    this.display();

    try {
      const customPath = this.plugin.settings.cliConfig.claudeCliPath;
      const result = await verifyClaudeCli(customPath);

      // Clear verifying state
      this.verifyingCli = null;

      if (!result.success) {
        this.plugin.settings.cliConfig = {
          ...this.plugin.settings.cliConfig,
          claudeVerified: false,
        };
        await this.plugin.saveSettings();
        this.display();

        if (result.stage === "version") {
          new Notice(`${i18n.notFound}: ${result.error || "Claude CLI not found"}`);
        } else {
          new Notice(`${i18n.loginRequired}: ${i18n.runClaudeLogin}`);
        }
        return;
      }

      // Success
      this.plugin.settings.cliConfig = {
        ...this.plugin.settings.cliConfig,
        claudeVerified: true,
      };
      await this.plugin.saveSettings();
      this.display();
      new Notice(i18n.cliVerifiedSuccess("Claude"));
    } catch (err) {
      // Clear verifying state
      this.verifyingCli = null;

      this.plugin.settings.cliConfig = {
        ...this.plugin.settings.cliConfig,
        claudeVerified: false,
      };
      await this.plugin.saveSettings();
      this.display();
      new Notice(`${i18n.error}: ${String(err)}`);
    }
  }

  private async handleVerifyCodexCli(): Promise<void> {
    const i18n = t();

    // Set verifying state and refresh UI
    this.verifyingCli = "codex";
    this.display();

    try {
      const customPath = this.plugin.settings.cliConfig.codexCliPath;
      const result = await verifyCodexCli(customPath);

      // Clear verifying state
      this.verifyingCli = null;

      if (!result.success) {
        this.plugin.settings.cliConfig = {
          ...this.plugin.settings.cliConfig,
          codexVerified: false,
        };
        await this.plugin.saveSettings();
        this.display();

        if (result.stage === "version") {
          new Notice(`${i18n.notFound}: ${result.error || "Codex CLI not found"}`);
        } else {
          new Notice(`${i18n.apiKeyRequired}: ${i18n.setOpenaiKey}`);
        }
        return;
      }

      // Success
      this.plugin.settings.cliConfig = {
        ...this.plugin.settings.cliConfig,
        codexVerified: true,
      };
      await this.plugin.saveSettings();
      this.display();
      new Notice(i18n.cliVerifiedSuccess("Codex"));
    } catch (err) {
      // Clear verifying state
      this.verifyingCli = null;

      this.plugin.settings.cliConfig = {
        ...this.plugin.settings.cliConfig,
        codexVerified: false,
      };
      await this.plugin.saveSettings();
      this.display();
      new Notice(`${i18n.error}: ${String(err)}`);
    }
  }
}
