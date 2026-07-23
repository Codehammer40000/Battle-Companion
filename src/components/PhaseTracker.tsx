import type { GameState, Phase } from '../types/game';
import { PHASE_LABELS } from '../types/game';

const TURN_PHASES: Phase[] = [
  'start_turn',
  'command',
  'movement',
  'shooting',
  'charge',
  'fight_pile_in',
  'fight',
  'fight_consolidate',
  'end_turn',
];

interface Props {
  state: GameState;
}

export function PhaseTracker({ state }: Props) {
  const currentIdx = TURN_PHASES.indexOf(state.phase);

  return (
    <div className="phase-tracker">
      <div className="phase-header">
        <span className="round-badge">Round {state.battleRound || '—'} / {state.maxBattleRounds}</span>
        <span className="active-player">
          {state.gameStarted
            ? state.activePlayer === 'player1'
              ? 'Ultramarines'
              : 'Orks'
            : 'Pre-battle'}
        </span>
      </div>

      <div className="phase-steps">
        {TURN_PHASES.map((phase, i) => {
          const isActive = state.phase === phase;
          const isPast = currentIdx > i && state.gameStarted;
          return (
            <div
              key={phase}
              className={`phase-step ${isActive ? 'active' : ''} ${isPast ? 'done' : ''}`}
            >
              <div className="phase-dot" />
              <span>{PHASE_LABELS[phase].replace(' Phase', '').replace('Fight — ', '')}</span>
            </div>
          );
        })}
      </div>

      <div className="current-phase-label">{PHASE_LABELS[state.phase]}</div>
    </div>
  );
}
