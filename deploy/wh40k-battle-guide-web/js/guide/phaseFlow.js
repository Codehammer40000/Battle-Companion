/**
 * Game guide flow from Warhammer 40,000 Core Rules & Event Companion.
 * Each step is a click-through reminder for tabletop play.
 */

export const MAX_BATTLE_ROUNDS = 5;

export const SETUP_STEPS = [
  { id: 'setup-muster', label: 'Muster Armies', detail: 'Armies are mustered per mission instructions. Force Disposition recorded on roster.', ruleRef: 'Event Companion §1' },
  { id: 'setup-mission', label: 'Determine Mission', detail: 'Generate or select Primary Mission. Note how to score Victory Points (VP).', ruleRef: 'Event Companion §2' },
  { id: 'setup-layout', label: 'Determine Layout', detail: 'Select terrain layout (A, B, or C) for your Primary Mission combination.', ruleRef: 'Event Companion §3' },
    { id: 'setup-battlefield', label: 'Create the Battlefield', detail: '44" x 60" battlefield. Place terrain areas and terrain features per selected layout.', ruleRef: 'Event Companion section 4, Core 13.01' },
  { id: 'setup-attacker', label: 'Determine Attacker and Defender', detail: 'Agree battlefield edges. Roll off — winner chooses Attacker or Defender.', ruleRef: 'Event Companion §5' },
  { id: 'setup-secondary', label: 'Select Secondary Missions', detail: 'Secretly note Tactical or Fixed Secondary Missions. Reveal decisions. Shuffle Tactical deck if used.', ruleRef: 'Event Companion §6' },
  { id: 'setup-formations', label: 'Declare Battle Formations', detail: 'Note embarked units in TRANSPORTS and units in Strategic Reserves. Reveal.', ruleRef: 'Event Companion §7, Core 20' },
  { id: 'setup-deploy', label: 'Deploy Armies', detail: 'Alternate setting up units wholly within deployment zones. Defender sets up first. TITANIC units skip next setup turn.', ruleRef: 'Event Companion §8, Core 03.02' },
  { id: 'setup-redeploy', label: 'Redeploy Units', detail: 'Alternate resolving redeploy rules (Attacker first). Strategic Reserves placed here do not count toward combined reserve points limit.', ruleRef: 'Event Companion §9' },
  { id: 'setup-first-turn', label: 'Determine First Turn', detail: 'Roll off — winner takes the first turn.', ruleRef: 'Event Companion §10' },
  { id: 'setup-pre-battle', label: 'Resolve Pre-battle Rules', detail: 'Alternate resolving pre-battle rules (first-turn player first).', ruleRef: 'Event Companion §11' },
  { id: 'setup-begin', label: 'Begin the Battle', detail: 'Battle Round 1 begins.', ruleRef: 'Event Companion §12, Core 07.01' },
];

function commandPhaseSteps(playerKey) {
  return [
    { id: `${playerKey}-cmd-start`, phase: 'command', label: 'Start of Command Phase', detail: 'Resolve rules triggered at the start of the Command phase. If using Tactical Secondary Missions: draw two Secondary Mission cards face-up.', ruleRef: 'Core 08.01, Event Companion §6', player: playerKey },
    { id: `${playerKey}-cmd-cp`, phase: 'command', label: 'Gain Core CP', detail: 'You gain 1 Core Command Point (CP).', ruleRef: 'Core 08.02', player: playerKey },
    { id: `${playerKey}-cmd-shock`, phase: 'command', label: 'Battle-shock', detail: 'Make a battle-shock roll for each unit in your army that is battle-shocked and/or at or below half-strength.', ruleRef: 'Core 08.03, 01.07', player: playerKey },
    { id: `${playerKey}-cmd-abilities`, phase: 'command', label: 'Command Abilities', detail: 'Resolve rules triggered in the Command phase (excluding start/end, Core CP, and battle-shock).', ruleRef: 'Core 08.04', player: playerKey },
    { id: `${playerKey}-cmd-end`, phase: 'command', label: 'End of Command Phase', detail: 'Resolve end-of-Command-phase rules, then consult mission for VP scored at this point.', ruleRef: 'Core 08.05', player: playerKey },
  ];
}

function movementPhaseSteps(playerKey) {
  return [
    { id: `${playerKey}-mov-start`, phase: 'movement', label: 'Start of Movement Phase', detail: 'Resolve rules triggered at the start of the Movement phase.', ruleRef: 'Core 09.01', player: playerKey },
    { id: `${playerKey}-mov-units`, phase: 'movement', label: 'Move Units', detail: 'Select each friendly unit once. Choose: Remain Stationary, Normal Move, Advance Move, Fall-back Move, Disembark Move, or Ingress Move. Every unit must be selected.', ruleRef: 'Core 09.02–09.07', player: playerKey },
    { id: `${playerKey}-mov-end`, phase: 'movement', label: 'End of Movement Phase', detail: 'Resolve rules triggered at the end of the Movement phase.', ruleRef: 'Core 09.03', player: playerKey },
  ];
}

function shootingPhaseSteps(playerKey) {
  return [
    { id: `${playerKey}-shoot-start`, phase: 'shooting', label: 'Start of Shooting Phase', detail: 'Resolve rules triggered at the start of the Shooting phase.', ruleRef: 'Core 10.01', player: playerKey },
    { id: `${playerKey}-shoot`, phase: 'shooting', label: 'Shoot', detail: 'With eligible units: select Normal Shooting, Assault Shooting, Close-quarters Shooting, or Indirect Shooting. Resolve attacks per Making Attacks sequence.', ruleRef: 'Core 10.02–10.07, 04–05', player: playerKey },
    { id: `${playerKey}-shoot-end`, phase: 'shooting', label: 'End of Shooting Phase', detail: 'Resolve rules triggered at the end of the Shooting phase.', ruleRef: 'Core 10.03', player: playerKey },
  ];
}

function chargePhaseSteps(playerKey) {
  return [
    { id: `${playerKey}-charge-start`, phase: 'charge', label: 'Start of Charge Phase', detail: 'Resolve rules triggered at the start of the Charge phase.', ruleRef: 'Core 11.01', player: playerKey },
    { id: `${playerKey}-charge`, phase: 'charge', label: 'Charge', detail: 'With eligible units (within 12" of enemy, unengaged, did not Advance or Fall-back this turn): Declare Charge → Charge Roll (2D6) → Charge Move.', ruleRef: 'Core 11.02–11.04', player: playerKey },
    { id: `${playerKey}-charge-end`, phase: 'charge', label: 'End of Charge Phase', detail: 'Resolve rules triggered at the end of the Charge phase.', ruleRef: 'Core 11.03', player: playerKey },
  ];
}

function fightPhaseSteps(playerKey) {
  return [
    { id: `${playerKey}-fight-start`, phase: 'fight', label: 'Start of Fight Phase', detail: 'Resolve rules triggered at the start of the Fight phase.', ruleRef: 'Core 12.01', player: playerKey },
    { id: `${playerKey}-pile-in`, phase: 'fight', label: 'Pile In', detail: 'Both players make optional Pile-in Moves (3") with eligible units. Active player resolves first.', ruleRef: 'Core 12.02–12.03', player: playerKey },
    { id: `${playerKey}-fight`, phase: 'fight', label: 'Fight', detail: 'Resolve Fights First combats, then remaining combats. Select Normal Fight or Overrun Fight. All eligible units must fight.', ruleRef: 'Core 12.04–12.06', player: playerKey },
    { id: `${playerKey}-consolidate`, phase: 'fight', label: 'Consolidate', detail: 'Both players make optional Consolidation Moves (3") with eligible units. Active player resolves first.', ruleRef: 'Core 12.07–12.08', player: playerKey },
    { id: `${playerKey}-fight-end`, phase: 'fight', label: 'End of Fight Phase', detail: 'Resolve rules triggered at the end of the Fight phase.', ruleRef: 'Core 12.09', player: playerKey },
  ];
}

function playerTurnSteps(playerKey, playerLabel) {
  return [
    { id: `${playerKey}-turn-start`, phase: 'turn', label: 'Start of Turn Step', detail: `Resolve rules triggered at the start of ${playerLabel}'s turn.`, ruleRef: 'Core 07.02', player: playerKey },
    ...commandPhaseSteps(playerKey),
    ...movementPhaseSteps(playerKey),
    ...shootingPhaseSteps(playerKey),
    ...chargePhaseSteps(playerKey),
    ...fightPhaseSteps(playerKey),
    { id: `${playerKey}-turn-end`, phase: 'turn', label: 'End of Turn Step', detail: 'Resolve end-of-turn rules. Consult mission — score Secondary Mission VP. Tactical: may discard missions for 1CP each.', ruleRef: 'Core 07.02, Event Companion §6', player: playerKey },
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
        flow.push({ ...step, section: 'turn', round, turnLabel: `Battle Round ${round} — ${label}'s Turn` });
      }
    }

    flow.push({
      id: `br${round}-end`,
      section: 'battle_round',
      round,
      label: `End of Battle Round ${round}`,
      detail: 'Resolve end-of-battle-round rules. Consult mission for Primary Mission VP triggered at this point.',
      ruleRef: 'Core 07.03',
      turnLabel: `Battle Round ${round}`,
    });
  }

  flow.push({
    id: 'battle-end',
    section: 'end',
    label: 'End the Battle',
    detail: 'Battle ends after 5 battle rounds. Award Battle Ready VP (10VP each if applicable). Determine victor by total VP.',
    ruleRef: 'Event Companion §13–14',
    turnLabel: 'Battle Complete',
  });

  flow.push({
    id: 'battle-summary',
    section: 'end',
    label: 'Game Summary',
    detail: 'Final scores and round-by-round VP breakdown.',
    ruleRef: 'Event Companion §14',
    turnLabel: 'Game Summary',
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
