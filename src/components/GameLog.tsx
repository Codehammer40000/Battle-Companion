import type { LogEntry } from '../types/game';

interface Props {
  entries: LogEntry[];
}

export function GameLog({ entries }: Props) {
  return (
    <div className="game-log">
      <h3>Battle Log</h3>
      <div className="log-entries">
        {[...entries].reverse().map((entry) => (
          <div key={entry.id} className="log-entry">
            <span className="log-meta">R{entry.round}</span>
            <span className="log-text">{entry.message}</span>
          </div>
        ))}
        {entries.length === 0 && <p className="log-empty">No events yet. Start the battle to begin.</p>}
      </div>
    </div>
  );
}
