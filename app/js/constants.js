export const BATTLEFIELD_WIDTH = 60;
export const BATTLEFIELD_HEIGHT = 44;
export const PIXELS_PER_INCH = 10;
export const ENGAGEMENT_RANGE = 2;
export const COHERENCY_CLOSE = 2;
export const COHERENCY_MAX = 9;
export const CHARGE_DECLARE_RANGE = 12;
export const HIDDEN_DETECTION_RANGE = 15;

export const PHASE_LABELS = {
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

export const TURN_PHASES = [
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
