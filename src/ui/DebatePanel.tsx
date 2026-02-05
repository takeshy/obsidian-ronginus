import * as React from "react";
import { useState } from "react";
import type { DebateState, RonginusSettings, DebateTurn, DebateConclusion, VoteResult, Participant, Voter, ParticipantType } from "../types";
import { t } from "../i18n";

interface DebatePanelProps {
  state: DebateState;
  settings: RonginusSettings;
  onStartDebate: (theme: string, turns: number, debateParticipants: Participant[], voteParticipants: Voter[]) => void;
  onStopDebate: () => void;
  onSaveNote: () => void;
  onReset: () => void;
  onUserDebateInput?: (content: string) => void;
  onUserVoteInput?: (votedForId: string, reason: string) => void;
}

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

// Get available participant types based on settings
function getAvailableTypes(settings: RonginusSettings): ParticipantType[] {
  const types: ParticipantType[] = [];
  if (settings.cliConfig.geminiVerified) types.push("gemini-cli");
  if (settings.cliConfig.claudeVerified) types.push("claude-cli");
  if (settings.cliConfig.codexVerified) types.push("codex-cli");
  types.push("user");
  return types;
}

export function DebatePanel({
  state,
  settings,
  onStartDebate,
  onStopDebate,
  onSaveNote,
  onReset,
  onUserDebateInput,
  onUserVoteInput,
}: DebatePanelProps): React.ReactElement {
  const [theme, setTheme] = useState("");
  const [turns, setTurns] = useState(settings.defaultTurns);
  const [debateParticipants, setDebateParticipants] = useState<Participant[]>(state.debateParticipants);
  const [voteParticipants, setVoteParticipants] = useState<Voter[]>(state.voteParticipants);
  const [showAddDebateDialog, setShowAddDebateDialog] = useState(false);
  const [showAddVoteDialog, setShowAddVoteDialog] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [userVoteTarget, setUserVoteTarget] = useState("");
  const [userVoteReason, setUserVoteReason] = useState("");
  const i18n = t();

  // Sync vote participants when debate participants change
  const updateDebateParticipants = (newParticipants: Participant[]) => {
    setDebateParticipants(newParticipants);
    // Auto-sync: create voters from debate participants
    const newVoters: Voter[] = newParticipants.map(p => ({
      id: `${p.type}-voter-${p.id}`,
      type: p.type,
      displayName: getBaseDisplayName(p.type),
    }));
    setVoteParticipants(newVoters);
  };

  const isRunning = state.phase !== "idle" && state.phase !== "complete" && state.phase !== "error";
  const hasActiveDebate = state.phase !== "idle";
  const isPendingUserDebate = state.pendingUserInput?.type === "debate";
  const isPendingUserVote = state.pendingUserInput?.type === "vote";

  const handleStartDebate = () => {
    onStartDebate(theme, turns, debateParticipants, voteParticipants);
  };

  const handleSubmitUserDebate = () => {
    if (userInput.trim() && onUserDebateInput) {
      onUserDebateInput(userInput);
      setUserInput("");
    }
  };

  const handleSubmitUserVote = () => {
    if (userVoteTarget && onUserVoteInput) {
      onUserVoteInput(userVoteTarget, userVoteReason);
      setUserVoteTarget("");
      setUserVoteReason("");
    }
  };

  return (
    <div className="ronginus-panel">
      <div className="ronginus-header">
        <h2>{i18n.debateArena}</h2>
        <p className="ronginus-subtitle">{i18n.debateSubtitle}</p>
        {hasActiveDebate && state.theme && (
          <div className="ronginus-header-theme">
            <strong>{i18n.theme}:</strong> {state.theme}
          </div>
        )}
      </div>

      {state.phase === "idle" && (
        <div className="ronginus-input-section">
          <div className="ronginus-input-group">
            <label htmlFor="theme-input">{i18n.debateTheme}</label>
            <textarea
              id="theme-input"
              className="ronginus-theme-input"
              placeholder={i18n.debateThemePlaceholder}
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              rows={3}
            />
          </div>

          <div className="ronginus-input-group">
            <label htmlFor="turns-input">{i18n.numberOfTurns}</label>
            <input
              id="turns-input"
              type="number"
              className="ronginus-turns-input"
              min={1}
              max={10}
              value={turns}
              onChange={(e) => setTurns(parseInt(e.target.value) || 2)}
            />
          </div>

          {/* Debate Participants Section */}
          <ParticipantSection
            title={i18n.debateParticipants}
            participants={debateParticipants}
            onUpdate={updateDebateParticipants}
            showRole={true}
            settings={settings}
            showAddDialog={showAddDebateDialog}
            onToggleAddDialog={() => setShowAddDebateDialog(!showAddDebateDialog)}
            i18n={i18n}
          />

          {/* Vote Participants Section */}
          <VoterSection
            title={i18n.voteParticipants}
            voters={voteParticipants}
            onUpdate={setVoteParticipants}
            settings={settings}
            showAddDialog={showAddVoteDialog}
            onToggleAddDialog={() => setShowAddVoteDialog(!showAddVoteDialog)}
            i18n={i18n}
          />

          <button
            className="ronginus-start-button mod-cta"
            onClick={handleStartDebate}
            disabled={!theme.trim() || debateParticipants.length < 1}
          >
            {i18n.startDebate}
          </button>
          {debateParticipants.length < 1 && (
            <p className="ronginus-warning">{i18n.needOneParticipant}</p>
          )}
        </div>
      )}

      {/* User Debate Input */}
      {isPendingUserDebate && state.pendingUserInput && (
        <div className="ronginus-user-input-section">
          <h3>{i18n.yourTurn}</h3>
          {state.pendingUserInput.role && (
            <p className="ronginus-user-role">
              <strong>{i18n.yourRole}:</strong> {state.pendingUserInput.role}
            </p>
          )}
          <textarea
            className="ronginus-user-input"
            placeholder={i18n.debateThemePlaceholder}
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            rows={5}
          />
          <button
            className="ronginus-submit-button mod-cta"
            onClick={handleSubmitUserDebate}
            disabled={!userInput.trim()}
          >
            {i18n.submitResponse}
          </button>
        </div>
      )}

      {/* User Vote Input */}
      {isPendingUserVote && state.conclusions.length > 0 && (
        <div className="ronginus-user-vote-section">
          <h3>{i18n.selectVote}</h3>
          <div className="ronginus-input-group">
            <label>{i18n.selectVote}</label>
            <select
              className="ronginus-vote-select"
              value={userVoteTarget}
              onChange={(e) => setUserVoteTarget(e.target.value)}
            >
              <option value="">{i18n.selectVote}</option>
              {state.conclusions.map((conclusion) => (
                <option key={conclusion.participantId} value={conclusion.participantId}>
                  {conclusion.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="ronginus-input-group">
            <label>{i18n.voteReason}</label>
            <input
              type="text"
              className="ronginus-vote-reason-input"
              value={userVoteReason}
              onChange={(e) => setUserVoteReason(e.target.value)}
              placeholder={i18n.voteReason}
            />
          </div>
          <button
            className="ronginus-submit-button mod-cta"
            onClick={handleSubmitUserVote}
            disabled={!userVoteTarget}
          >
            {i18n.submitVote}
          </button>
        </div>
      )}

      {isRunning && !isPendingUserDebate && !isPendingUserVote && (
        <div className="ronginus-progress-section">
          <div className="ronginus-status">
            <span className="ronginus-phase">{getPhaseLabel(state.phase, i18n)}</span>
            <span className="ronginus-turn-info">
              {i18n.turn} {state.currentTurn} / {state.totalTurns}
            </span>
          </div>

          <button
            className="ronginus-stop-button"
            onClick={onStopDebate}
          >
            {i18n.stopDebate}
          </button>
        </div>
      )}

      {/* Streaming responses during thinking */}
      {state.streamingResponses.size > 0 && (
        <div className="ronginus-streaming-section">
          <h3>{i18n.currentResponses}</h3>
          <div className="ronginus-response-grid">
            {Array.from(state.streamingResponses.entries()).map(([participantId, content]) => {
              const participant = state.debateParticipants.find(p => p.id === participantId);
              const displayName = participant?.displayName || participantId;
              return (
                <div key={participantId} className={`ronginus-response-card ${participant?.type || ""}`}>
                  <div className="ronginus-response-header">
                    <span className={`ronginus-cli-badge ${participant?.type || ""}`}>
                      {displayName}
                    </span>
                    <span className="ronginus-thinking-indicator">...</span>
                  </div>
                  <div className="ronginus-response-content">
                    {content || <span className="ronginus-waiting">{i18n.thinking}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Completed turns (exclude last turn if conclusions exist, since they're the same) */}
      {(() => {
        const turnsToShow = state.turns.filter(
          (turn) => !(state.conclusions.length > 0 && turn.turnNumber === state.totalTurns)
        );
        return turnsToShow.length > 0 ? (
          <div className="ronginus-turns-section">
            <h3>{i18n.discussion}</h3>
            {turnsToShow.map((turn) => (
              <TurnDisplay key={turn.turnNumber} turn={turn} participants={state.debateParticipants} i18n={i18n} />
            ))}
          </div>
        ) : null;
      })()}

      {/* Conclusions */}
      {state.conclusions.length > 0 && (
        <div className="ronginus-conclusions-section">
          <h3>{i18n.conclusions}</h3>
          <div className="ronginus-response-grid">
            {state.conclusions.map((conclusion) => (
              <ConclusionDisplay key={conclusion.participantId} conclusion={conclusion} participants={state.debateParticipants} i18n={i18n} />
            ))}
          </div>
        </div>
      )}

      {/* Voting results */}
      {state.votes.length > 0 && (
        <div className="ronginus-votes-section">
          <h3>{i18n.votingResults}</h3>
          <div className="ronginus-votes-list">
            {state.votes.map((vote, index) => (
              <VoteDisplay key={index} vote={vote} />
            ))}
          </div>
        </div>
      )}

      {/* Winner announcement */}
      {state.phase === "complete" && state.isDraw && state.winnerIds.length > 0 && (
        <div className="ronginus-winner-section">
          <h3>{i18n.draw}</h3>
          <div className="ronginus-draw-cards">
            {state.winnerIds.map((winnerId) => {
              const conclusion = state.conclusions.find(c => c.participantId === winnerId);
              const participant = state.debateParticipants.find(p => p.id === winnerId);
              return (
                <div key={winnerId} className={`ronginus-winner-card ${participant?.type || ""}`}>
                  <span className={`ronginus-cli-badge ${participant?.type || ""} large`}>
                    {conclusion?.displayName || winnerId}
                  </span>
                  <div className="ronginus-final-conclusion">
                    {conclusion?.content || ""}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {state.phase === "complete" && !state.isDraw && state.winnerId && (
        <div className="ronginus-winner-section">
          <h3>{i18n.winner}</h3>
          {(() => {
            const winner = state.conclusions.find(c => c.participantId === state.winnerId);
            const participant = state.debateParticipants.find(p => p.id === state.winnerId);
            return (
              <div className={`ronginus-winner-card ${participant?.type || ""}`}>
                <span className={`ronginus-cli-badge ${participant?.type || ""} large`}>
                  {winner?.displayName || state.winnerId}
                </span>
                <div className="ronginus-final-conclusion">
                  {state.finalConclusion}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Error display */}
      {state.phase === "error" && state.error && (
        <div className="ronginus-error-section">
          <h3>{i18n.error}</h3>
          <p className="ronginus-error-message">{state.error}</p>
        </div>
      )}

      {/* Action buttons */}
      {(state.phase === "complete" || state.phase === "error") && (
        <div className="ronginus-actions-section">
          {state.phase === "complete" && (
            <button
              className="ronginus-save-button mod-cta"
              onClick={onSaveNote}
            >
              {i18n.saveAsNote}
            </button>
          )}
          <button
            className="ronginus-reset-button"
            onClick={onReset}
          >
            {i18n.newDebate}
          </button>
        </div>
      )}
    </div>
  );
}

// Participant Section Component
interface ParticipantSectionProps {
  title: string;
  participants: Participant[];
  onUpdate: (participants: Participant[]) => void;
  showRole: boolean;
  settings: RonginusSettings;
  showAddDialog: boolean;
  onToggleAddDialog: () => void;
  i18n: ReturnType<typeof t>;
}

function ParticipantSection({
  title,
  participants,
  onUpdate,
  showRole,
  settings,
  showAddDialog,
  onToggleAddDialog,
  i18n,
}: ParticipantSectionProps): React.ReactElement {
  const [newType, setNewType] = useState<ParticipantType>("claude-cli");
  const [newRole, setNewRole] = useState("");
  const availableTypes = getAvailableTypes(settings);

  const addParticipant = () => {
    const existingCount = participants.filter(p => p.type === newType).length;
    const baseDisplayName = getBaseDisplayName(newType);
    const displayName = newRole
      ? `${baseDisplayName}（${newRole}）`
      : baseDisplayName;

    const newParticipant: Participant = {
      id: `${newType}-${existingCount + 1}-${Date.now()}`,
      type: newType,
      role: newRole || undefined,
      displayName,
    };
    onUpdate([...participants, newParticipant]);
    setNewRole("");
    onToggleAddDialog();
  };

  const removeParticipant = (id: string) => {
    onUpdate(participants.filter(p => p.id !== id));
  };

  const updateRole = (id: string, role: string) => {
    onUpdate(participants.map(p => {
      if (p.id === id) {
        const baseDisplayName = getBaseDisplayName(p.type);
        const displayName = role
          ? `${baseDisplayName}（${role}）`
          : baseDisplayName;
        return { ...p, role: role || undefined, displayName };
      }
      return p;
    }));
  };

  return (
    <div className="ronginus-participants-section">
      <div className="ronginus-section-header">
        <label>{title}</label>
        <button className="ronginus-add-button" onClick={onToggleAddDialog}>
          + {i18n.addParticipant}
        </button>
      </div>

      {showAddDialog && (
        <div className="ronginus-add-dialog">
          <h4>{i18n.addDebateParticipant}</h4>
          <div className="ronginus-input-group">
            <label>{i18n.type}</label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as ParticipantType)}
            >
              {availableTypes.map(type => (
                <option key={type} value={type}>{getBaseDisplayName(type)}</option>
              ))}
            </select>
          </div>
          {showRole && (
            <div className="ronginus-input-group">
              <label>{i18n.role}</label>
              <input
                type="text"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                placeholder={i18n.rolePlaceholder}
              />
            </div>
          )}
          <div className="ronginus-dialog-buttons">
            <button onClick={onToggleAddDialog}>{i18n.cancel}</button>
            <button className="mod-cta" onClick={addParticipant}>{i18n.addParticipant}</button>
          </div>
        </div>
      )}

      <div className="ronginus-participants-list">
        {participants.map((participant) => (
          <div key={participant.id} className="ronginus-participant-item">
            <span className={`ronginus-cli-badge ${participant.type}`}>
              {getBaseDisplayName(participant.type)}
            </span>
            {showRole && (
              <input
                type="text"
                className="ronginus-role-input"
                value={participant.role || ""}
                onChange={(e) => updateRole(participant.id, e.target.value)}
                placeholder={i18n.rolePlaceholder}
              />
            )}
            <button
              className="ronginus-remove-button"
              onClick={() => removeParticipant(participant.id)}
            >
              ×
            </button>
          </div>
        ))}
        {participants.length === 0 && (
          <p className="ronginus-empty-list">{i18n.needOneParticipant}</p>
        )}
      </div>
    </div>
  );
}

// Voter Section Component
interface VoterSectionProps {
  title: string;
  voters: Voter[];
  onUpdate: (voters: Voter[]) => void;
  settings: RonginusSettings;
  showAddDialog: boolean;
  onToggleAddDialog: () => void;
  i18n: ReturnType<typeof t>;
}

function VoterSection({
  title,
  voters,
  onUpdate,
  settings,
  showAddDialog,
  onToggleAddDialog,
  i18n,
}: VoterSectionProps): React.ReactElement {
  const [newType, setNewType] = useState<ParticipantType>("claude-cli");
  const availableTypes = getAvailableTypes(settings);

  const addVoter = () => {
    const existingCount = voters.filter(v => v.type === newType).length;
    const displayName = getBaseDisplayName(newType);

    const newVoter: Voter = {
      id: `${newType}-voter-${existingCount + 1}-${Date.now()}`,
      type: newType,
      displayName,
    };
    onUpdate([...voters, newVoter]);
    onToggleAddDialog();
  };

  const removeVoter = (id: string) => {
    onUpdate(voters.filter(v => v.id !== id));
  };

  return (
    <div className="ronginus-participants-section">
      <div className="ronginus-section-header">
        <label>{title}</label>
        <button className="ronginus-add-button" onClick={onToggleAddDialog}>
          + {i18n.addParticipant}
        </button>
      </div>

      {showAddDialog && (
        <div className="ronginus-add-dialog">
          <h4>{i18n.addVoter}</h4>
          <div className="ronginus-input-group">
            <label>{i18n.type}</label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as ParticipantType)}
            >
              {availableTypes.map(type => (
                <option key={type} value={type}>{getBaseDisplayName(type)}</option>
              ))}
            </select>
          </div>
          <div className="ronginus-dialog-buttons">
            <button onClick={onToggleAddDialog}>{i18n.cancel}</button>
            <button className="mod-cta" onClick={addVoter}>{i18n.addParticipant}</button>
          </div>
        </div>
      )}

      <div className="ronginus-participants-list">
        {voters.map((voter) => (
          <div key={voter.id} className="ronginus-participant-item">
            <span className={`ronginus-cli-badge ${voter.type}`}>
              {voter.displayName}
            </span>
            <button
              className="ronginus-remove-button"
              onClick={() => removeVoter(voter.id)}
            >
              ×
            </button>
          </div>
        ))}
        {voters.length === 0 && (
          <p className="ronginus-empty-list">{i18n.needOneParticipant}</p>
        )}
      </div>
    </div>
  );
}

interface TurnDisplayProps {
  turn: DebateTurn;
  participants: Participant[];
  i18n: ReturnType<typeof t>;
}

function TurnDisplay({ turn, participants, i18n }: TurnDisplayProps): React.ReactElement {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="ronginus-turn">
      <div
        className="ronginus-turn-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="ronginus-turn-number">{i18n.turn} {turn.turnNumber}</span>
        <span className="ronginus-expand-icon">{expanded ? "▼" : "▶"}</span>
      </div>
      {expanded && (
        <div className="ronginus-response-grid">
          {turn.responses.map((response) => {
            const participant = participants.find(p => p.id === response.participantId);
            return (
              <div key={response.participantId} className={`ronginus-response-card ${participant?.type || ""}`}>
                <div className="ronginus-response-header">
                  <span className={`ronginus-cli-badge ${participant?.type || ""}`}>
                    {response.displayName}
                  </span>
                </div>
                <div className="ronginus-response-content">
                  {response.error ? (
                    <span className="ronginus-error">{response.error}</span>
                  ) : (
                    response.content
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ConclusionDisplayProps {
  conclusion: DebateConclusion;
  participants: Participant[];
  i18n: ReturnType<typeof t>;
}

function ConclusionDisplay({ conclusion, participants, i18n }: ConclusionDisplayProps): React.ReactElement {
  const participant = participants.find(p => p.id === conclusion.participantId);
  return (
    <div className={`ronginus-response-card ${participant?.type || ""} conclusion`}>
      <div className="ronginus-response-header">
        <span className={`ronginus-cli-badge ${participant?.type || ""}`}>
          {conclusion.displayName}
        </span>
        <span className="ronginus-conclusion-badge">{i18n.conclusion}</span>
      </div>
      <div className="ronginus-response-content">
        {conclusion.content}
      </div>
    </div>
  );
}

function VoteDisplay({ vote }: { vote: VoteResult }): React.ReactElement {
  return (
    <div className="ronginus-vote-item">
      <span className="ronginus-cli-badge small">
        {vote.voterDisplayName}
      </span>
      <span className="ronginus-vote-arrow">→</span>
      <span className="ronginus-cli-badge small">
        {vote.votedForDisplayName}
      </span>
      {vote.reason && (
        <span className="ronginus-vote-reason">{vote.reason}</span>
      )}
    </div>
  );
}

function getPhaseLabel(phase: string, i18n: ReturnType<typeof t>): string {
  switch (phase) {
    case "thinking":
      return i18n.thinking;
    case "turn_complete":
      return i18n.turnComplete;
    case "concluding":
      return i18n.concluding;
    case "voting":
      return i18n.voting;
    case "complete":
      return i18n.complete;
    case "error":
      return i18n.error;
    default:
      return i18n.ready;
  }
}
