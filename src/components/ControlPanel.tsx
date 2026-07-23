import type { GameState } from '../types/game';
import { PLAYER_LABELS } from '../data/sampleBattle';
import { calculateObjectiveControl } from '../engine/objectives';
import { getMeleeWeapons, getRangedWeapons } from '../engine/combat';
import { unitIsVisibleToUnit } from '../engine/los';
import { unitIsEngaged, unitIsUnengaged } from '../engine/geometry';

interface Props {
  state: GameState;
  onSelectUnit: (id: string) => void;
  onSelectTarget: (id: string) => void;
  onSetMoveType: (type: GameState['pendingMoveType']) => void;
  onRemainStationary: () => void;
  onRollAdvance: () => void;
  onDeclareCharge: (targetId: string) => void;
  onRollCharge: () => void;
  onShoot: (weaponId: string) => void;
  onFight: (weaponId: string) => void;
  onAdvancePhase: () => void;
  onToggleLos: () => void;
}

export function ControlPanel({
  state,
  onSelectUnit,
  onSelectTarget,
  onSetMoveType,
  onRemainStationary,
  onRollAdvance,
  onDeclareCharge,
  onRollCharge,
  onShoot,
  onFight,
  onAdvancePhase,
  onToggleLos,
}: Props) {
  const selected = state.units.find((u) => u.id === state.selectedUnitId);
  const objectives = calculateObjectiveControl(state.battlefield.terrainAreas, state.units);
  const enemyUnits = state.units.filter((u) => u.player !== state.activePlayer);

  const eligibleShootTargets = enemyUnits.filter((e) => {
    if (!selected) return false;
    return unitIsVisibleToUnit(
      selected,
      e,
      state.battlefield.terrainAreas,
      state.battlefield.terrainFeatures,
      state.units,
    );
  });

  return (
    <div className="control-panel">
      <section className="panel-section">
        <h3>Command Points</h3>
        <div className="cp-row">
          <span>P1: {state.cp.player1} CP</span>
          <span>P2: {state.cp.player2} CP</span>
        </div>
      </section>

      <section className="panel-section">
        <h3>Units</h3>
        {state.units.map((unit) => {
          const alive = unit.models.filter((m) => m.woundsRemaining > 0).length;
          const isActive = unit.player === state.activePlayer;
          return (
            <button
              key={unit.id}
              type="button"
              className={`unit-btn ${state.selectedUnitId === unit.id ? 'selected' : ''} ${!isActive ? 'inactive' : ''}`}
              onClick={() => onSelectUnit(unit.id)}
            >
              <span className="unit-name">{unit.name}</span>
              <span className="unit-meta">
                {PLAYER_LABELS[unit.player].split(' ')[0]} · {alive}/{unit.startingModelCount}
                {unit.battleShocked ? ' · Shocked' : ''}
              </span>
            </button>
          );
        })}
      </section>

      {selected && (
        <section className="panel-section actions">
          <h3>Actions — {selected.name}</h3>

          {state.phase === 'movement' && selected.player === state.activePlayer && (
            <div className="action-group">
              <button type="button" onClick={() => onSetMoveType('normal')}>Normal Move (M&quot;)</button>
              <button type="button" onClick={onRollAdvance}>Advance (D6 + M&quot;)</button>
              {unitIsEngaged(selected, enemyUnits) && (
                <button type="button" onClick={() => onSetMoveType('fall_back')}>Fall Back</button>
              )}
              <button type="button" onClick={onRemainStationary}>Remain Stationary</button>
              {state.advanceRoll && (
                <p className="hint">Advance roll: +{state.advanceRoll}&quot; — click a model, then click destination</p>
              )}
              {state.pendingMoveType && state.pendingMoveType !== 'remain_stationary' && (
                <p className="hint">Select a model, then click battlefield to move (max {selected.models[0]?.profile.move}&quot;)</p>
              )}
            </div>
          )}

          {state.phase === 'shooting' && selected.player === state.activePlayer && (
            <div className="action-group">
              {unitIsUnengaged(selected, enemyUnits) && !selected.advancedThisTurn && (
                <>
                  <p className="hint">Normal Shooting — select target, then weapon:</p>
                  {eligibleShootTargets.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={state.selectedTargetUnitId === t.id ? 'selected' : ''}
                      onClick={() => onSelectTarget(t.id)}
                    >
                      Target: {t.name}
                    </button>
                  ))}
                  {state.selectedTargetUnitId &&
                    getRangedWeapons(selected).map((w) => (
                      <button key={w.id} type="button" onClick={() => onShoot(w.id)}>
                        Fire {w.name} (R{w.range}&quot;, {w.attacks}A)
                      </button>
                    ))}
                </>
              )}
              {selected.advancedThisTurn && (
                <p className="hint">Unit advanced — only [ASSAULT] weapons eligible (not equipped on demo units).</p>
              )}
              {unitIsEngaged(selected, enemyUnits) && (
                <p className="hint">Engaged — use Close-quarters shooting rules for [CLOSE-QUARTERS] weapons.</p>
              )}
            </div>
          )}

          {state.phase === 'charge' && selected.player === state.activePlayer && (
            <div className="action-group">
              <p className="hint">Declare charge (within 12&quot; of enemy):</p>
              {enemyUnits.map((t) => (
                <button key={t.id} type="button" onClick={() => onDeclareCharge(t.id)}>
                  Charge {t.name}
                </button>
              ))}
              {state.selectedTargetUnitId && (
                <button type="button" onClick={onRollCharge}>Roll Charge (2D6)</button>
              )}
              {state.chargeRoll && (
                <p className="hint">Charge roll: {state.chargeRoll}&quot; — move models toward target</p>
              )}
            </div>
          )}

          {(state.phase === 'fight' || state.phase === 'fight_pile_in') &&
            selected.player === state.activePlayer && (
            <div className="action-group">
              {enemyUnits.filter((e) => unitIsEngaged(selected, [e])).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={state.selectedTargetUnitId === t.id ? 'selected' : ''}
                  onClick={() => onSelectTarget(t.id)}
                >
                  Fight: {t.name}
                </button>
              ))}
              {state.selectedTargetUnitId &&
                getMeleeWeapons(selected).map((w) => (
                  <button key={w.id} type="button" onClick={() => onFight(w.id)}>
                    Attack with {w.name}
                  </button>
                ))}
            </div>
          )}
        </section>
      )}

      <section className="panel-section">
        <h3>Objectives</h3>
        {objectives.map((o) => (
          <div key={o.areaId} className="objective-row">
            <span>{o.label}</span>
            <span>
              {o.controller
                ? o.controller === 'player1'
                  ? 'P1'
                  : 'P2'
                : 'Contested'}{' '}
              ({o.player1OC} vs {o.player2OC} OC)
            </span>
          </div>
        ))}
      </section>

      <section className="panel-section tools">
        <button type="button" className={state.showLos ? 'active' : ''} onClick={onToggleLos}>
          {state.showLos ? 'Hide' : 'Show'} Line of Sight
        </button>
        <button type="button" className="primary" onClick={onAdvancePhase}>
          Advance to Next Step →
        </button>
      </section>
    </div>
  );
}
