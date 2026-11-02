/**
 * Coarse battle clock for map-first play.
 * One step per phase (not micro-checklist essays).
 */

export const MAX_BATTLE_ROUNDS = 5;

/** Lean setup — map deploy / reserves / pre-battle only. */
export const SETUP_STEPS = [
  {
    id: 'setup-formations',
    label: 'Battle Formations',
    detail: 'Note embarked units and Strategic Reserves / Deep Strike. Reveal.',
    ruleRef: 'Event Companion §7, Core 20',
  },
  {
    id: 'setup-deploy',
    label: 'Deploy Armies',
    detail: 'Deploy units on the Battle Map within deployment zones.',
    ruleRef: 'Event Companion §8, Core 03.02',
  },
  {
    id: 'setup-redeploy',
    label: 'Redeploy',
    detail: 'Resolve redeploy rules if any. Place remaining reserves as allowed.',
    ruleRef: 'Event Companion §9',
  },
  {
    id: 'setup-pre-battle',
    label: 'Pre-battle Rules',
    detail: 'Resolve pre-battle abilities (first-turn player first).',
    ruleRef: 'Event Companion §11',
  },
  {
    id: 'setup-begin',
    label: 'Begin the Battle',
    detail: 'Battle Round 1 begins.',
    ruleRef: 'Event Companion §12, Core 07.01',
  },
];

function playerTurnSteps(playerKey, playerLabel) {
  return [
    {
      id: `${playerKey}-turn-start`,
      phase: 'turn',
      label: 'Start of Turn',
      detail: `Resolve start-of-turn rules for ${playerLabel}.`,
      ruleRef: 'Core 07.02',
      player: playerKey,
    },
    {
      id: `${playerKey}-cmd`,
      phase: 'command',
      label: 'Command Phase',
      detail:
        'Both players gain 1 Core CP. Active player: battle-shock tests and command abilities.',
      ruleRef: 'Core 08',
      player: playerKey,
    },
    {
      id: `${playerKey}-mov`,
      phase: 'movement',
      label: 'Movement Phase',
      detail: 'Move eligible units on the Battle Map (Normal, Advance, Fall Back, etc.).',
      ruleRef: 'Core 09',
      player: playerKey,
    },
    {
      id: `${playerKey}-shoot`,
      phase: 'shooting',
      label: 'Shooting Phase',
      detail: 'Select shooter and target on the map for ranges and LoS. Resolve attacks on the table.',
      ruleRef: 'Core 10',
      player: playerKey,
    },
    {
      id: `${playerKey}-charge`,
      phase: 'charge',
      label: 'Charge Phase',
      detail: 'Declare charges and move charging units on the map.',
      ruleRef: 'Core 11',
      player: playerKey,
    },
    {
      id: `${playerKey}-fight`,
      phase: 'fight',
      label: 'Fight Phase',
      detail: 'Pile in, fight, and consolidate. Select units on the map as needed.',
      ruleRef: 'Core 12',
      player: playerKey,
    },
    {
      id: `${playerKey}-turn-end`,
      phase: 'turn',
      label: 'End of Turn',
      detail: 'Score secondary VP / discard Tactical missions for CP as applicable.',
      ruleRef: 'Core 07.02, Event Companion §6',
      player: playerKey,
    },
  ];
}

export function buildFullGuideFlow(player1Name, player2Name, firstPlayer = 'player1') {
  const flow = [];

  for (const step of SETUP_STEPS) {
    flow.push({ ...step, section: 'setup', turnLabel: 'Setup & Deployment' });
  }

  const p1Label = player1Name || 'Player 1';
  const p2Label = player2Name || 'Player 2';
  const turnOrder =
    firstPlayer === 'player2'
      ? [
          { key: 'p2', label: p2Label },
          { key: 'p1', label: p1Label },
        ]
      : [
          { key: 'p1', label: p1Label },
          { key: 'p2', label: p2Label },
        ];

  for (let round = 1; round <= MAX_BATTLE_ROUNDS; round++) {
    flow.push({
      id: `br${round}-start`,
      section: 'battle_round',
      round,
      label: `Start of Battle Round ${round}`,
      detail: 'Resolve rules triggered at the start of the battle round.',
      ruleRef: 'Core 07.01',
      turnLabel: `Battle Round ${round}`,
    });

    for (const { key, label } of turnOrder) {
      for (const step of playerTurnSteps(key, label)) {
        flow.push({
          ...step,
          section: 'turn',
          round,
          turnLabel: `Battle Round ${round} — ${label}'s Turn`,
        });
      }
    }

    flow.push({
      id: `br${round}-end`,
      section: 'battle_round',
      round,
      label: `End of Battle Round ${round}`,
      detail: 'Resolve end-of-battle-round rules. Score Primary Mission VP if applicable.',
      ruleRef: 'Core 07.03',
      turnLabel: `Battle Round ${round}`,
    });
  }

  flow.push({
    id: 'battle-end',
    section: 'end',
    label: 'End the Battle',
    detail: 'Battle ends after 5 battle rounds. Award Battle Ready VP. Determine victor by total VP.',
    ruleRef: 'Event Companion §13–14',
    turnLabel: 'Battle Complete',
  });

  return flow;
}

export function getPhaseGroupLabel(step) {
  if (!step) return '';
  const phaseNames = {
    command: 'Command Phase',
    movement: 'Movement Phase',
    shooting: 'Shooting Phase',
    charge: 'Charge Phase',
    fight: 'Fight Phase',
    turn: 'Turn',
    battle_round: 'Battle Round',
    setup: 'Setup',
    end: 'End',
  };
  return phaseNames[step.phase] || step.section || '';
}
