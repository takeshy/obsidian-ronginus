/**
 * Types for Ronginus - AI Debate Plugin
 */

// CLI Provider types
export type CliType = "gemini-cli" | "claude-cli" | "codex-cli";

export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface StreamChunk {
  type: "text" | "error" | "done" | "session_id";
  content?: string;
  error?: string;
  sessionId?: string;
}

// Debate types
export interface DebateParticipant {
  cliType: CliType;
  displayName: string;
  enabled: boolean;
}

export interface DebateTurn {
  turnNumber: number;
  responses: DebateResponse[];
  timestamp: number;
}

export interface DebateResponse {
  cliType: CliType;
  content: string;
  isConclusion: boolean;
  timestamp: number;
  error?: string;
}

export interface DebateConclusion {
  cliType: CliType;
  content: string;
}

export interface VoteResult {
  voter: CliType;
  votedFor: CliType;
  reason?: string;
}

export interface DebateResult {
  theme: string;
  turns: DebateTurn[];
  conclusions: DebateConclusion[];
  votes: VoteResult[];
  winner: CliType | null;
  winners: CliType[];  // For tie/draw cases
  isDraw: boolean;
  finalConclusion: string;
  startTime: number;
  endTime: number;
}

// CLI config types
export interface CliConfig {
  geminiVerified: boolean;
  claudeVerified: boolean;
  codexVerified: boolean;
  geminiCliPath?: string;
  claudeCliPath?: string;
  codexCliPath?: string;
}

export const DEFAULT_CLI_CONFIG: CliConfig = {
  geminiVerified: false,
  claudeVerified: false,
  codexVerified: false,
};

// Settings types
export interface RonginusSettings {
  defaultTurns: number;
  systemPrompt: string;
  conclusionPrompt: string;
  votePrompt: string;
  outputFolder: string;
  cliConfig: CliConfig;
}

export const DEFAULT_SETTINGS: RonginusSettings = {
  defaultTurns: 2,
  systemPrompt: `You are participating in a structured debate with other AI assistants.
Your role is to think critically about the given theme and provide your unique perspective.
Be concise but thorough. Consider different angles and potential counterarguments.`,
  conclusionPrompt: `Based on all the discussion so far, please provide your FINAL CONCLUSION on the theme.
Be clear and decisive. Summarize your position in a well-structured manner.
Start your response with "CONCLUSION:" followed by your final answer.`,
  votePrompt: `You have seen the conclusions from all participants.
Now you must vote for the BEST conclusion (you can also vote for your own if you believe it's the best).
Consider clarity, logical reasoning, and completeness.
Respond with ONLY the name of the participant you vote for (Gemini, Claude, or Codex) followed by a brief reason.
Format: VOTE: [Name] - [Reason]`,
  outputFolder: "Debates",
  cliConfig: { ...DEFAULT_CLI_CONFIG },
};

/**
 * Check if any CLI is verified
 */
export function hasVerifiedCli(config: CliConfig): boolean {
  return config.geminiVerified || config.claudeVerified || config.codexVerified;
}

/**
 * Count verified CLIs
 */
export function countVerifiedClis(config: CliConfig): number {
  return [config.geminiVerified, config.claudeVerified, config.codexVerified].filter(Boolean).length;
}

// Debate state for UI
export type DebatePhase =
  | "idle"
  | "thinking"
  | "turn_complete"
  | "concluding"
  | "voting"
  | "complete"
  | "error";

export interface DebateState {
  phase: DebatePhase;
  currentTurn: number;
  totalTurns: number;
  theme: string;
  turns: DebateTurn[];
  conclusions: DebateConclusion[];
  votes: VoteResult[];
  winner: CliType | null;
  winners: CliType[];
  isDraw: boolean;
  finalConclusion: string;
  error?: string;
  streamingResponses: Map<CliType, string>;
  startTime?: number;
  endTime?: number;
}
