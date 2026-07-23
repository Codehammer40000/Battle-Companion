import type { GameState, LogEntry, Phase, PlayerId } from '../types/game';
import { createBattlefield, createSampleUnits } from '../data/sampleBattle';
import { resolveBattleShock, resolveWeaponAttacks } from './combat';
import { roll2D6 } from './dice';
import { unitAtHalfStrength } from './geometry';

let logCounter = 0;

function makeLog(round: number, phase: Phase, message: string): LogEntry {
  return {
    id: `log-${++logCounter}`,
    round,
    phase,
    message,
    timestamp: Date.now(),
  };
}

function resetUnitTurnFlags(units: GameState['units']): GameState['units'] {
  return units.map((u) => ({
    ...u,
    advancedThisTurn: false,
    fellBackThisTurn: false,
    chargedThisTurn: false,
    shotThisTurn: false,
    movedThisTurn: false,
    moveTypeThisTurn: undefined,
    fightsFirst: false,
    hasActedThisPhase: false,
    remainingStationary: false,
  }));
}

function resetPhaseFlags(units: GameState['units']): GameState['units'] {
  return units.map((u) => ({ ...u, hasActedThisPhase: false }));
}

export function createInitialState(): GameState {
  return {
    battlefield: createBattlefield(),
    units: createSampleUnits(),
    activePlayer: 'player1',
    firstPlayer: 'player1',
    battleRound: 0,
    maxBattleRounds: 5,
    phase: 'setup',
    cp: { player1: 0, player2: 0 },
    selectedUnitId: null,
    selectedModelId: null,
    selectedTargetUnitId: null,
    pendingMoveType: null,
    advanceRoll: null,
    chargeRoll: null,
    showLos: false,
    losPreview: null,
    log: [],
    winner: null,
    gameStarted: false,
  };
}

export type GameAction =
  | { type: 'START_GAME' }
  | { type: 'SELECT_UNIT'; unitId: string | null }
  | { type: 'SELECT_MODEL'; modelId: string | null }
  | { type: 'SELECT_TARGET'; unitId: string | null }
  | { type: 'SET_MOVE_TYPE'; moveType: GameState['pendingMoveType'] }
  | { type: 'MOVE_MODEL'; modelId: string; position: { x: number; y: number } }
  | { type: 'ADVANCE_PHASE' }
  | { type: 'REMAIN_STATIONARY' }
  | { type: 'ROLL_ADVANCE' }
  | { type: 'DECLARE_CHARGE'; targetUnitId: string }
  | { type: 'ROLL_CHARGE' }
  | { type: 'SHOOT'; weaponId: string }
  | { type: 'FIGHT'; weaponId: string }
  | { type: 'TOGGLE_LOS' }
  | { type: 'ADD_LOG'; message: string };

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_GAME': {
      const log = [
        makeLog(1, 'start_battle_round', 'Battle begins! 5 battle rounds. Player 1 takes first turn.'),
        makeLog(1, 'start_battle_round', 'Battlefield: 44" × 60" (Event Companion standard).'),
      ];
      return {
        ...state,
        gameStarted: true,
        battleRound: 1,
        phase: 'start_battle_round',
        cp: { player1: 0, player2: 0 },
        log,
      };
    }

    case 'SELECT_UNIT':
      return { ...state, selectedUnitId: action.unitId, selectedModelId: null };

    case 'SELECT_MODEL':
      return { ...state, selectedModelId: action.modelId };

    case 'SELECT_TARGET':
      return { ...state, selectedTargetUnitId: action.unitId };

    case 'SET_MOVE_TYPE':
      return { ...state, pendingMoveType: action.moveType };

    case 'TOGGLE_LOS':
      return { ...state, showLos: !state.showLos };

    case 'ADD_LOG':
      return {
        ...state,
        log: [...state.log, makeLog(state.battleRound, state.phase, action.message)],
      };

    case 'REMAIN_STATIONARY': {
      if (!state.selectedUnitId) return state;
      const units = state.units.map((u) =>
        u.id === state.selectedUnitId
          ? { ...u, hasActedThisPhase: true, remainingStationary: true, movedThisTurn: true }
          : u,
      );
      return {
        ...state,
        units,
        log: [
          ...state.log,
          makeLog(state.battleRound, state.phase, `${getUnitName(state, state.selectedUnitId)} remains stationary.`),
        ],
      };
    }

    case 'ROLL_ADVANCE': {
      if (!state.selectedUnitId) return state;
      const roll = Math.floor(Math.random() * 6) + 1;
      return {
        ...state,
        advanceRoll: roll,
        pendingMoveType: 'advance',
        log: [
          ...state.log,
          makeLog(
            state.battleRound,
            state.phase,
            `${getUnitName(state, state.selectedUnitId)} advances — rolled ${roll}" extra movement.`,
          ),
        ],
      };
    }

    case 'MOVE_MODEL': {
      const units = state.units.map((unit) => {
        if (!unit.models.some((m) => m.id === action.modelId)) return unit;
        const model = unit.models.find((m) => m.id === action.modelId)!;
        const maxMove = getMaxMove(state, unit, model);
        const dx = action.position.x - model.position.x;
        const dy = action.position.y - model.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const clamped =
          dist > maxMove
            ? {
                x: model.position.x + (dx / dist) * maxMove,
                y: model.position.y + (dy / dist) * maxMove,
              }
            : action.position;

        return {
          ...unit,
          models: unit.models.map((m) =>
            m.id === action.modelId ? { ...m, position: clamped } : m,
          ),
          movedThisTurn: true,
          hasActedThisPhase: true,
          moveTypeThisTurn: state.pendingMoveType ?? 'normal',
          advancedThisTurn: state.pendingMoveType === 'advance',
          fellBackThisTurn: state.pendingMoveType === 'fall_back',
        };
      });
      return { ...state, units };
    }

    case 'DECLARE_CHARGE': {
      return {
        ...state,
        selectedTargetUnitId: action.targetUnitId,
        pendingMoveType: 'charge',
        log: [
          ...state.log,
          makeLog(
            state.battleRound,
            state.phase,
            `${getUnitName(state, state.selectedUnitId!)} declares charge against ${getUnitName(state, action.targetUnitId)}.`,
          ),
        ],
      };
    }

    case 'ROLL_CHARGE': {
      const roll = roll2D6();
      return {
        ...state,
        chargeRoll: roll,
        log: [
          ...state.log,
          makeLog(state.battleRound, state.phase, `Charge roll: ${roll}" maximum distance.`),
        ],
      };
    }

    case 'SHOOT':
    case 'FIGHT':
      return handleCombat(state, action);

    case 'ADVANCE_PHASE':
      return advancePhase(state);

    default:
      return state;
  }
}

function getUnitName(state: GameState, unitId: string): string {
  return state.units.find((u) => u.id === unitId)?.name ?? unitId;
}

function getMaxMove(state: GameState, unit: GameState['units'][0], model: GameState['units'][0]['models'][0]): number {
  const base = model.profile.move;
  if (state.pendingMoveType === 'charge' && state.chargeRoll) return state.chargeRoll;
  if (state.pendingMoveType === 'advance' && state.advanceRoll) return base + state.advanceRoll;
  if (state.pendingMoveType === 'pile_in' || state.pendingMoveType === 'consolidate') return 3;
  return base;
}

function handleCombat(
  state: GameState,
  action: { type: 'SHOOT' | 'FIGHT'; weaponId: string },
): GameState {
  const shooter = state.units.find((u) => u.id === state.selectedUnitId);
  const target = state.units.find((u) => u.id === state.selectedTargetUnitId);
  if (!shooter || !target) return state;

  const weapon =
    shooter.models.flatMap((m) => m.weapons).find((w) => w.id === action.weaponId) ??
    target.models.flatMap((m) => m.weapons).find((w) => w.id === action.weaponId);

  if (!weapon) return state;

  const result = resolveWeaponAttacks(weapon, shooter.models, target);
  const logMessages = [
    makeLog(
      state.battleRound,
      state.phase,
      `${shooter.name} attacks ${target.name} with ${weapon.name}: ${result.hits} hits, ${result.wounds} wounds, ${result.failedSaves} unsaved.`,
    ),
    ...result.diceLog.map((m) => makeLog(state.battleRound, state.phase, `  → ${m}`)),
  ];

  const units = state.units.map((u) => {
    if (u.id !== target.id) {
      if (u.id === shooter.id) {
        return { ...u, shotThisTurn: action.type === 'SHOOT', hasActedThisPhase: true };
      }
      return u;
    }
    return {
      ...u,
      models: u.models.map((m) =>
        result.modelsDestroyed.includes(m.id) ? { ...m, woundsRemaining: 0 } : m,
      ),
    };
  });

  return { ...state, units, log: [...state.log, ...logMessages] };
}

function advancePhase(state: GameState): GameState {
  const phaseFlow: Phase[] = [
    'start_battle_round',
    'start_turn',
    'command',
    'movement',
    'shooting',
    'charge',
    'fight_pile_in',
    'fight',
    'fight_consolidate',
    'end_turn',
    'end_battle_round',
  ];

  const idx = phaseFlow.indexOf(state.phase);
  let nextPhase = phaseFlow[idx + 1] ?? 'game_over';
  let battleRound = state.battleRound;
  let activePlayer = state.activePlayer;
  let units = [...state.units];
  let cp = { ...state.cp };
  const newLogs: LogEntry[] = [];

  if (state.phase === 'start_battle_round') {
    nextPhase = 'start_turn';
    newLogs.push(makeLog(battleRound, nextPhase, `Battle Round ${battleRound} begins.`));
  } else if (state.phase === 'start_turn') {
    nextPhase = 'command';
    newLogs.push(makeLog(battleRound, nextPhase, `${playerLabel(activePlayer)} — Start of Turn.`));
  } else if (state.phase === 'command') {
    cp[activePlayer] += 1;
    newLogs.push(makeLog(battleRound, 'command', `${playerLabel(activePlayer)} gains 1 Core CP (now ${cp[activePlayer]} CP).`));

    for (const unit of units.filter((u) => u.player === activePlayer)) {
      const needsShock = unit.battleShocked || unitAtHalfStrength(unit);
      if (needsShock) {
        const result = resolveBattleShock(unit);
        const msg = result.success
          ? `${unit.name} passes battle-shock (${result.total}).`
          : `${unit.name} FAILS battle-shock (${result.total}) — battle-shocked!`;
        newLogs.push(makeLog(battleRound, 'command', msg));
        units = units.map((u) =>
          u.id === unit.id
            ? { ...u, battleShocked: result.success ? false : true }
            : u,
        );
      }
    }
    nextPhase = 'movement';
    units = resetPhaseFlags(units);
  } else if (state.phase === 'movement') {
    nextPhase = 'shooting';
    units = resetPhaseFlags(units);
    newLogs.push(makeLog(battleRound, nextPhase, 'Movement phase complete.'));
  } else if (state.phase === 'shooting') {
    nextPhase = 'charge';
    units = resetPhaseFlags(units);
  } else if (state.phase === 'charge') {
    nextPhase = 'fight_pile_in';
    units = resetPhaseFlags(units);
  } else if (state.phase === 'fight_consolidate') {
    nextPhase = 'end_turn';
  } else if (state.phase === 'end_turn') {
    if (activePlayer === state.firstPlayer) {
      activePlayer = activePlayer === 'player1' ? 'player2' : 'player1';
      units = resetUnitTurnFlags(units);
      nextPhase = 'start_turn';
      newLogs.push(makeLog(battleRound, nextPhase, `${playerLabel(activePlayer)} begins their turn.`));
    } else {
      nextPhase = 'end_battle_round';
    }
  } else if (state.phase === 'end_battle_round') {
    battleRound += 1;
    if (battleRound > state.maxBattleRounds) {
      nextPhase = 'game_over';
      newLogs.push(makeLog(battleRound - 1, 'game_over', 'Battle complete after 5 rounds.'));
    } else {
      activePlayer = state.firstPlayer;
      units = resetUnitTurnFlags(units);
      nextPhase = 'start_battle_round';
      newLogs.push(makeLog(battleRound, 'start_battle_round', `Battle Round ${battleRound} begins.`));
    }
  } else if (state.phase === 'fight_pile_in') {
    nextPhase = 'fight';
    newLogs.push(makeLog(battleRound, 'fight', 'Pile-in complete. Resolve melee combat.'));
  } else if (state.phase === 'fight') {
    nextPhase = 'fight_consolidate';
    newLogs.push(makeLog(battleRound, 'fight_consolidate', 'Consolidation step.'));
  }

  return {
    ...state,
    phase: nextPhase,
    battleRound,
    activePlayer,
    units,
    cp,
    selectedUnitId: null,
    selectedTargetUnitId: null,
    pendingMoveType: null,
    advanceRoll: null,
    chargeRoll: null,
    log: [...state.log, ...newLogs],
    winner: nextPhase === 'game_over' ? 'draw' : state.winner,
  };
}

function playerLabel(player: PlayerId): string {
  return player === 'player1' ? 'Ultramarines' : 'Orks';
}
