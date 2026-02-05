/**
 * Internationalization (i18n) for Ronginus
 */

export type Locale = "en" | "ja";

interface Translations {
  // Settings
  settingsTitle: string;
  cliProviders: string;
  cliIntro: string;
  geminiCli: string;
  claudeCli: string;
  codexCli: string;
  verify: string;
  disable: string;
  verified: string;
  verifying: string;
  notFound: string;
  loginRequired: string;
  apiKeyRequired: string;
  cliPathSettings: string;
  cliPathPlaceholder: string;
  cliPathNoteWindows: string;
  cliPathNoteUnix: string;
  clear: string;
  cancel: string;
  save: string;
  cliPathSaved: string;
  cliPathCleared: string;
  fileNotFound: string;
  invalidChars: string;
  cliVerifiedSuccess: (name: string) => string;
  cliDisabled: (name: string) => string;
  clisVerifiedReady: (count: number) => string;
  clisVerifiedNeed: (count: number) => string;

  // General settings
  general: string;
  outputFolder: string;
  outputFolderDesc: string;

  // Prompts
  prompts: string;
  systemPrompt: string;
  systemPromptDesc: string;
  conclusionPrompt: string;
  conclusionPromptDesc: string;
  votePrompt: string;
  votePromptDesc: string;

  // Debate Panel
  debateArena: string;
  debateSubtitle: string;
  debateTheme: string;
  debateThemePlaceholder: string;
  numberOfTurns: string;
  startDebate: string;
  stopDebate: string;
  saveAsNote: string;
  newDebate: string;
  theme: string;
  turn: string;
  thinking: string;
  turnComplete: string;
  concluding: string;
  voting: string;
  complete: string;
  error: string;
  ready: string;
  currentResponses: string;
  discussion: string;
  conclusions: string;
  votingResults: string;
  winner: string;
  draw: string;
  conclusion: string;
  noWinner: string;

  // Notices
  enterTheme: string;
  needTwoClis: string;
  debateSaved: (path: string) => string;
  debateSaveFailed: (error: string) => string;
  debateStopped: string;
  debateNotComplete: string;
  debateError: (error: string) => string;

  // Install commands
  installGemini: string;
  installClaude: string;
  installCodex: string;
  runGeminiAuth: string;
  runClaudeLogin: string;
  setOpenaiKey: string;

  // Default prompts
  defaultSystemPrompt: string;
  defaultConclusionPrompt: string;
  defaultVotePrompt: string;

  // Debate context strings
  debateThemeHeader: string;
  previousDiscussion: string;
  yourTask: string;
  yourTaskInstruction: string;
  completeDiscussion: string;
  finalConclusions: string;
  conclusionOf: (name: string) => string;
}

const en: Translations = {
  // Settings
  settingsTitle: "Ronginus - AI Debate Settings",
  cliProviders: "CLI Providers",
  cliIntro: "Configure the AI CLI tools for debates. At least 2 verified CLIs are required.",
  geminiCli: "Gemini CLI",
  claudeCli: "Claude CLI",
  codexCli: "Codex CLI",
  verify: "Verify",
  disable: "Disable",
  verified: "Verified",
  verifying: "Verifying...",
  notFound: "Not Found",
  loginRequired: "Login Required",
  apiKeyRequired: "API Key Required",
  cliPathSettings: "CLI Path Settings",
  cliPathPlaceholder: "Custom path (leave empty for default)",
  cliPathNoteWindows: "On Windows, you can specify the path to node.exe or the CLI script directly.",
  cliPathNoteUnix: "Specify the full path to the CLI executable.",
  clear: "Clear",
  cancel: "Cancel",
  save: "Save",
  cliPathSaved: "CLI path saved",
  cliPathCleared: "CLI path cleared",
  fileNotFound: "File not found at specified path",
  invalidChars: "Path contains invalid characters",
  cliVerifiedSuccess: (name) => `${name} CLI verified successfully`,
  cliDisabled: (name) => `${name} CLI disabled`,
  clisVerifiedReady: (count) => `${count} CLIs verified - Ready for debates`,
  clisVerifiedNeed: (count) => `${count} CLI verified - Need at least 2 for debates`,

  // General settings
  general: "General",
  outputFolder: "Output folder",
  outputFolderDesc: "Folder for saving debate notes",

  // Prompts
  prompts: "Prompts",
  systemPrompt: "System prompt",
  systemPromptDesc: "Instructions given to all participants",
  conclusionPrompt: "Conclusion prompt",
  conclusionPromptDesc: "Prompt for final conclusion",
  votePrompt: "Vote prompt",
  votePromptDesc: "Prompt for voting phase",

  // Debate Panel
  debateArena: "AI Debate Arena",
  debateSubtitle: "Gemini vs Claude vs Codex",
  debateTheme: "Debate Theme",
  debateThemePlaceholder: "Enter a topic for the AI to debate...",
  numberOfTurns: "Number of Turns",
  startDebate: "Start Debate",
  stopDebate: "Stop Debate",
  saveAsNote: "Save as Note",
  newDebate: "New Debate",
  theme: "Theme",
  turn: "Turn",
  thinking: "Thinking...",
  turnComplete: "Turn Complete",
  concluding: "Drawing Conclusions...",
  voting: "Voting...",
  complete: "Complete",
  error: "Error",
  ready: "Ready",
  currentResponses: "Current Responses",
  discussion: "Discussion",
  conclusions: "Conclusions",
  votingResults: "Voting Results",
  winner: "Winner",
  draw: "Draw",
  conclusion: "Conclusion",
  noWinner: "No winner",

  // Notices
  enterTheme: "Please enter a debate theme",
  needTwoClis: "At least 2 verified CLIs are required. Please verify CLIs in settings.",
  debateSaved: (path) => `Debate saved to ${path}`,
  debateSaveFailed: (error) => `Failed to save debate: ${error}`,
  debateStopped: "Debate stopped",
  debateNotComplete: "Debate is not complete yet",
  debateError: (error) => `Debate error: ${error}`,

  // Install commands
  installGemini: "npm install -g @google/gemini-cli",
  installClaude: "npm install -g @anthropic-ai/claude-code",
  installCodex: "npm install -g @openai/codex",
  runGeminiAuth: "Run: gemini auth login",
  runClaudeLogin: "Run: claude login",
  setOpenaiKey: "Set OPENAI_API_KEY environment variable",

  // Default prompts
  defaultSystemPrompt: `You are discussing a theme with other AI assistants. Share your thoughts concisely.`,
  defaultConclusionPrompt: `Based on all the discussion so far, please provide your FINAL CONCLUSION on the theme.
Be clear and decisive. Summarize your position in a well-structured manner.
Start your response with "CONCLUSION:" followed by your final answer.`,
  defaultVotePrompt: `You have seen the conclusions from all participants.
Now you must vote for the BEST conclusion (you can also vote for your own if you believe it's the best).
Consider clarity, logical reasoning, and completeness.
Respond with ONLY the name of the participant you vote for (Gemini, Claude, or Codex) followed by a brief reason.
Format: VOTE: [Name] - [Reason]`,

  // Debate context strings
  debateThemeHeader: "Debate Theme",
  previousDiscussion: "Previous Discussion",
  yourTask: "Your Task",
  yourTaskInstruction: "Consider the perspectives shared above and provide your thoughts. Build upon, challenge, or refine the ideas presented.",
  completeDiscussion: "Complete Discussion",
  finalConclusions: "Final Conclusions",
  conclusionOf: (name) => `${name}'s Conclusion`,
};

const ja: Translations = {
  // Settings
  settingsTitle: "Ronginus - AIディベート設定",
  cliProviders: "CLIプロバイダー",
  cliIntro: "ディベート用のAI CLIツールを設定します。少なくとも2つの認証済みCLIが必要です。",
  geminiCli: "Gemini CLI",
  claudeCli: "Claude CLI",
  codexCli: "Codex CLI",
  verify: "認証",
  disable: "無効化",
  verified: "認証済み",
  verifying: "認証中...",
  notFound: "見つかりません",
  loginRequired: "ログインが必要",
  apiKeyRequired: "APIキーが必要",
  cliPathSettings: "CLIパス設定",
  cliPathPlaceholder: "カスタムパス（デフォルトの場合は空欄）",
  cliPathNoteWindows: "Windowsでは、node.exeまたはCLIスクリプトへのパスを直接指定できます。",
  cliPathNoteUnix: "CLI実行ファイルへのフルパスを指定してください。",
  clear: "クリア",
  cancel: "キャンセル",
  save: "保存",
  cliPathSaved: "CLIパスを保存しました",
  cliPathCleared: "CLIパスをクリアしました",
  fileNotFound: "指定されたパスにファイルが見つかりません",
  invalidChars: "パスに無効な文字が含まれています",
  cliVerifiedSuccess: (name) => `${name} CLIの認証に成功しました`,
  cliDisabled: (name) => `${name} CLIを無効化しました`,
  clisVerifiedReady: (count) => `${count}個のCLIが認証済み - ディベート可能`,
  clisVerifiedNeed: (count) => `${count}個のCLIが認証済み - ディベートには2つ以上必要`,

  // General settings
  general: "一般",
  outputFolder: "出力フォルダ",
  outputFolderDesc: "ディベートノートを保存するフォルダ",

  // Prompts
  prompts: "プロンプト",
  systemPrompt: "システムプロンプト",
  systemPromptDesc: "全参加者に与える指示",
  conclusionPrompt: "結論プロンプト",
  conclusionPromptDesc: "最終結論用のプロンプト",
  votePrompt: "投票プロンプト",
  votePromptDesc: "投票フェーズ用のプロンプト",

  // Debate Panel
  debateArena: "AIディベートアリーナ",
  debateSubtitle: "Gemini vs Claude vs Codex",
  debateTheme: "ディベートテーマ",
  debateThemePlaceholder: "AIにディベートさせるトピックを入力...",
  numberOfTurns: "ターン数",
  startDebate: "ディベート開始",
  stopDebate: "停止",
  saveAsNote: "ノートに保存",
  newDebate: "新規ディベート",
  theme: "テーマ",
  turn: "ターン",
  thinking: "思考中...",
  turnComplete: "ターン完了",
  concluding: "結論を出しています...",
  voting: "投票中...",
  complete: "完了",
  error: "エラー",
  ready: "準備完了",
  currentResponses: "現在の回答",
  discussion: "議論",
  conclusions: "結論",
  votingResults: "投票結果",
  winner: "勝者",
  draw: "引き分け",
  conclusion: "結論",
  noWinner: "勝者なし",

  // Notices
  enterTheme: "ディベートテーマを入力してください",
  needTwoClis: "少なくとも2つの認証済みCLIが必要です。設定でCLIを認証してください。",
  debateSaved: (path) => `ディベートを ${path} に保存しました`,
  debateSaveFailed: (error) => `ディベートの保存に失敗しました: ${error}`,
  debateStopped: "ディベートを停止しました",
  debateNotComplete: "ディベートがまだ完了していません",
  debateError: (error) => `ディベートエラー: ${error}`,

  // Install commands
  installGemini: "npm install -g @google/gemini-cli",
  installClaude: "npm install -g @anthropic-ai/claude-code",
  installCodex: "npm install -g @openai/codex",
  runGeminiAuth: "実行: gemini auth login",
  runClaudeLogin: "実行: claude login",
  setOpenaiKey: "OPENAI_API_KEY環境変数を設定",

  // Default prompts
  defaultSystemPrompt: `他のAIアシスタントとテーマについて議論しています。簡潔に考えを述べてください。`,
  defaultConclusionPrompt: `これまでの議論を踏まえて、テーマについての最終結論を述べてください。
明確かつ決定的に。立場を整理された形でまとめてください。
回答は「結論：」から始めてください。`,
  defaultVotePrompt: `全参加者の結論を確認しました。
最も優れた結論に投票してください（自分の結論が最も優れていると思えば、自分に投票しても構いません）。
明確さ、論理的な推論、完全性を考慮してください。
投票する参加者名（Gemini、Claude、またはCodex）と簡単な理由を回答してください。
形式：投票: [名前] - [理由]`,

  // Debate context strings
  debateThemeHeader: "ディベートテーマ",
  previousDiscussion: "これまでの議論",
  yourTask: "あなたの課題",
  yourTaskInstruction: "上記で共有された視点を考慮し、あなたの考えを述べてください。提示されたアイデアを発展させたり、異議を唱えたり、洗練させたりしてください。",
  completeDiscussion: "議論全体",
  finalConclusions: "最終結論",
  conclusionOf: (name) => `${name}の結論`,
};

const translations: Record<Locale, Translations> = { en, ja };

let currentLocale: Locale = "en";

/**
 * Detect locale from Obsidian's moment locale
 */
export function detectLocale(): Locale {
  // Check if window.moment exists (Obsidian uses moment.js)
  if (typeof window !== "undefined" && (window as unknown as { moment?: { locale?: () => string } }).moment) {
    const momentLocale = (window as unknown as { moment: { locale: () => string } }).moment.locale();
    if (momentLocale.startsWith("ja")) {
      return "ja";
    }
  }
  return "en";
}

/**
 * Initialize locale detection
 */
export function initLocale(): void {
  currentLocale = detectLocale();
}

/**
 * Get current locale
 */
export function getLocale(): Locale {
  return currentLocale;
}

/**
 * Set locale manually
 */
export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

/**
 * Get translation object for current locale
 */
export function t(): Translations {
  return translations[currentLocale];
}

/**
 * Get translation object for specific locale
 */
export function tLocale(locale: Locale): Translations {
  return translations[locale];
}
