/**
 * Types for Ronginus - AI Debate Plugin
 */

// CLI Provider types
export type CliType = "gemini-cli" | "claude-cli" | "codex-cli";

// Participant types
export type ParticipantType = CliType | "user";

// Debate participant (with role)
export interface Participant {
  id: string;              // Unique ID (e.g., "claude-1", "user-1")
  type: ParticipantType;   // CLI type or "user"
  role?: string;           // Role (e.g., "Affirmative", "Critical") - optional
  displayName: string;     // Display name (e.g., "Claude (Affirmative)")
}

// Vote participant (no role needed)
export interface Voter {
  id: string;              // Unique ID
  type: ParticipantType;   // CLI type or "user"
  displayName: string;     // Display name (e.g., "Claude")
}

// Debate configuration
export interface DebateConfig {
  debateParticipants: Participant[];  // Debate participants (with roles)
  voteParticipants: Voter[];          // Vote participants (no roles)
}

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
  participantId: string;
  displayName: string;
  content: string;
  isConclusion: boolean;
  timestamp: number;
  error?: string;
}

export interface DebateConclusion {
  participantId: string;
  displayName: string;
  content: string;
}

export interface VoteResult {
  voterId: string;
  voterDisplayName: string;
  votedForId: string;
  votedForDisplayName: string;
  reason?: string;
}

export interface DebateResult {
  theme: string;
  turns: DebateTurn[];
  conclusions: DebateConclusion[];
  votes: VoteResult[];
  winnerId: string | null;
  winnerIds: string[];  // For tie/draw cases
  isDraw: boolean;
  finalConclusion: string;
  startTime: number;
  endTime: number;
  debateParticipants: Participant[];
  voteParticipants: Voter[];
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
  systemPrompt: `You are discussing a theme with other AI assistants. Share your thoughts concisely.`,
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
  winnerId: string | null;
  winnerIds: string[];
  isDraw: boolean;
  finalConclusion: string;
  error?: string;
  streamingResponses: Map<string, string>;  // participantId -> content
  startTime?: number;
  endTime?: number;
  // User interaction
  pendingUserInput?: {
    type: "debate" | "vote";
    participantId: string;
    role?: string;
  };
  currentParticipantId?: string;
  // Configuration
  debateParticipants: Participant[];
  voteParticipants: Voter[];
}
