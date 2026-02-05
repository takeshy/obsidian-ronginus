import * as React from "react";
import { useState } from "react";
import type { DebateState, RonginusSettings, CliType, DebateTurn, DebateConclusion, VoteResult } from "../types";
import { t } from "../i18n";

interface DebatePanelProps {
  state: DebateState;
  settings: RonginusSettings;
  onStartDebate: (theme: string, turns: number) => void;
  onStopDebate: () => void;
  onSaveNote: () => void;
  onReset: () => void;
}

export function DebatePanel({
  state,
  settings,
  onStartDebate,
  onStopDebate,
  onSaveNote,
  onReset,
}: DebatePanelProps): React.ReactElement {
  const [theme, setTheme] = useState("");
  const [turns, setTurns] = useState(settings.defaultTurns);
  const i18n = t();

  const isRunning = state.phase !== "idle" && state.phase !== "complete" && state.phase !== "error";
  const hasActiveDebate = state.phase !== "idle";

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

          <button
            className="ronginus-start-button mod-cta"
            onClick={() => onStartDebate(theme, turns)}
            disabled={!theme.trim()}
          >
            {i18n.startDebate}
          </button>
        </div>
      )}

      {isRunning && (
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
            {Array.from(state.streamingResponses.entries()).map(([cliType, content]) => (
              <div key={cliType} className={`ronginus-response-card ${cliType}`}>
                <div className="ronginus-response-header">
                  <span className={`ronginus-cli-badge ${cliType}`}>
                    {getDisplayName(cliType)}
                  </span>
                  <span className="ronginus-thinking-indicator">...</span>
                </div>
                <div className="ronginus-response-content">
                  {content || <span className="ronginus-waiting">{i18n.thinking}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed turns */}
      {state.turns.length > 0 && (
        <div className="ronginus-turns-section">
          <h3>{i18n.discussion}</h3>
          {state.turns.map((turn) => (
            <TurnDisplay key={turn.turnNumber} turn={turn} i18n={i18n} />
          ))}
        </div>
      )}

      {/* Conclusions */}
      {state.conclusions.length > 0 && (
        <div className="ronginus-conclusions-section">
          <h3>{i18n.conclusions}</h3>
          <div className="ronginus-response-grid">
            {state.conclusions.map((conclusion) => (
              <ConclusionDisplay key={conclusion.cliType} conclusion={conclusion} i18n={i18n} />
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
      {state.phase === "complete" && state.isDraw && state.winners.length > 0 && (
        <div className="ronginus-winner-section">
          <h3>{i18n.draw}</h3>
          <div className="ronginus-draw-cards">
            {state.winners.map((winnerCli) => {
              const conclusion = state.conclusions.find(c => c.cliType === winnerCli);
              return (
                <div key={winnerCli} className={`ronginus-winner-card ${winnerCli}`}>
                  <span className={`ronginus-cli-badge ${winnerCli} large`}>
                    {getDisplayName(winnerCli)}
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

      {state.phase === "complete" && !state.isDraw && state.winner && (
        <div className="ronginus-winner-section">
          <h3>{i18n.winner}</h3>
          <div className={`ronginus-winner-card ${state.winner}`}>
            <span className={`ronginus-cli-badge ${state.winner} large`}>
              {getDisplayName(state.winner)}
            </span>
            <div className="ronginus-final-conclusion">
              {state.finalConclusion}
            </div>
          </div>
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

interface TurnDisplayProps {
  turn: DebateTurn;
  i18n: ReturnType<typeof t>;
}

function TurnDisplay({ turn, i18n }: TurnDisplayProps): React.ReactElement {
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
          {turn.responses.map((response) => (
            <div key={response.cliType} className={`ronginus-response-card ${response.cliType}`}>
              <div className="ronginus-response-header">
                <span className={`ronginus-cli-badge ${response.cliType}`}>
                  {getDisplayName(response.cliType)}
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
          ))}
        </div>
      )}
    </div>
  );
}

interface ConclusionDisplayProps {
  conclusion: DebateConclusion;
  i18n: ReturnType<typeof t>;
}

function ConclusionDisplay({ conclusion, i18n }: ConclusionDisplayProps): React.ReactElement {
  return (
    <div className={`ronginus-response-card ${conclusion.cliType} conclusion`}>
      <div className="ronginus-response-header">
        <span className={`ronginus-cli-badge ${conclusion.cliType}`}>
          {getDisplayName(conclusion.cliType)}
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
      <span className={`ronginus-cli-badge ${vote.voter} small`}>
        {getDisplayName(vote.voter)}
      </span>
      <span className="ronginus-vote-arrow">→</span>
      <span className={`ronginus-cli-badge ${vote.votedFor} small`}>
        {getDisplayName(vote.votedFor)}
      </span>
      {vote.reason && (
        <span className="ronginus-vote-reason">{vote.reason}</span>
      )}
    </div>
  );
}

function getDisplayName(cliType: CliType): string {
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
