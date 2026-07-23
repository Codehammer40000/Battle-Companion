export type PlayerId = 'player1' | 'player2';

export type Phase =
  | 'setup'
  | 'start_battle_round'
  | 'start_turn'
  | 'command'
  | 'movement'
  | 'shooting'
  | 'charge'
  | 'fight_pile_in'
  | 'fight'
  | 'fight_consolidate'
  | 'end_turn'
  | 'end_battle_round'
  | 'game_over';

export type MoveType =
  | 'remain_stationary'
  | 'normal'
  | 'advance'
  | 'fall_back'
  | 'charge'
  | 'pile_in'
  | 'consolidate';

export type ShootingType = 'normal' | 'assault' | 'close_quarters' | 'indirect';

export type TerrainCategory = 'exposed' | 'light' | 'dense';

export interface Point {
  x: number;
  y: number;
}

export interface Weapon {
  id: string;
  name: string;
  range: number | 'melee';
  attacks: number;
  skill: number;
  strength: number;
  ap: number;
  damage: number;
  keywords?: string[];
}

export interface ModelProfile {
  move: number;
  toughness: number;
  save: number;
  invuln?: number;
  wounds: number;
  leadership: number;
  oc: number;
}

export interface Model {
  id: string;
  name: string;
  profile: ModelProfile;
  weapons: Weapon[];
  position: Point;
  baseRadius: number;
  woundsRemaining: number;
  keywords: string[];
  isCharacter?: boolean;
}

export interface Unit {
  id: string;
  name: string;
  player: PlayerId;
  models: Model[];
  keywords: string[];
  startingModelCount: number;
  advancedThisTurn: boolean;
  fellBackThisTurn: boolean;
  chargedThisTurn: boolean;
  shotThisTurn: boolean;
  movedThisTurn: boolean;
  moveTypeThisTurn?: MoveType;
  fightsFirst: boolean;
  battleShocked: boolean;
  remainingStationary: boolean;
  hasActedThisPhase: boolean;
}

export interface TerrainArea {
  id: string;
  bounds: { x: number; y: number; w: number; h: number };
  category: TerrainCategory;
  isObscuring: boolean;
  isObjective?: boolean;
  objectiveType?: 'home' | 'central' | 'expansion';
  label?: string;
}

export interface TerrainFeature {
  id: string;
  areaId: string;
  bounds: { x: number; y: number; w: number; h: number };
  category: TerrainCategory;
  solid: boolean;
  label?: string;
}

export interface DeploymentZone {
  player: PlayerId;
  role: 'attacker' | 'defender';
  bounds: { x: number; y: number; w: number; h: number };
}

export interface Battlefield {
  width: number;
  height: number;
  terrainAreas: TerrainArea[];
  terrainFeatures: TerrainFeature[];
  deploymentZones: DeploymentZone[];
}

export interface LogEntry {
  id: string;
  round: number;
  phase: Phase;
  message: string;
  timestamp: number;
}

export type GameAction =
  | 'select_unit'
  | 'move_model'
  | 'shoot'
  | 'charge'
  | 'fight'
  | 'advance_phase'
  | 'end_phase'
  | 'toggle_los';

export interface CombatResult {
  hits: number;
  wounds: number;
  failedSaves: number;
  modelsDestroyed: string[];
  diceLog: string[];
}

export interface GameState {
  battlefield: Battlefield;
  units: Unit[];
  activePlayer: PlayerId;
  firstPlayer: PlayerId;
  battleRound: number;
  maxBattleRounds: number;
  phase: Phase;
  cp: Record<PlayerId, number>;
  selectedUnitId: string | null;
  selectedModelId: string | null;
  selectedTargetUnitId: string | null;
  pendingMoveType: MoveType | null;
  advanceRoll: number | null;
  chargeRoll: number | null;
  showLos: boolean;
  losPreview: { from: Point; to: Point; visible: boolean } | null;
  log: LogEntry[];
  winner: PlayerId | 'draw' | null;
  gameStarted: boolean;
}

export const BATTLEFIELD_WIDTH = 44;
export const BATTLEFIELD_HEIGHT = 60;
export const PIXELS_PER_INCH = 10;
export const ENGAGEMENT_RANGE = 2;
export const COHERENCY_CLOSE = 2;
export const COHERENCY_MAX = 9;
export const CHARGE_DECLARE_RANGE = 12;
export const PILE_IN_DISTANCE = 3;
export const HIDDEN_DETECTION_RANGE = 15;
export const SOLID_GAP_HEIGHT = 3;

export const PHASE_ORDER: Phase[] = [
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

export const PHASE_LABELS: Record<Phase, string> = {
  setup: 'Setup',
  start_battle_round: 'Start of Battle Round',
  start_turn: 'Start of Turn',
  command: 'Command Phase',
  movement: 'Movement Phase',
  shooting: 'Shooting Phase',
  charge: 'Charge Phase',
  fight_pile_in: 'Fight — Pile In',
  fight: 'Fight Phase',
  fight_consolidate: 'Fight — Consolidate',
  end_turn: 'End of Turn',
  end_battle_round: 'End of Battle Round',
  game_over: 'Game Over',
};
