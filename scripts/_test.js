/* WH40k Battle Guide - bundled for offline use */
(function () {
'use strict';

/* --- guide\phaseFlow.js --- */
/**
 * Game guide flow from Warhammer 40,000 Core Rules & Event Companion.
 * Each step is a click-through reminder for tabletop play.
 */

const MAX_BATTLE_ROUNDS = 5;

const SETUP_STEPS = [
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

function buildFullGuideFlow(player1Name, player2Name) {
  const flow = [];

  for (const step of SETUP_STEPS) {
    flow.push({ ...step, section: 'setup', turnLabel: 'Setup & Deployment' });
  }

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

    const p1Label = player1Name || 'Player 1';
    const p2Label = player2Name || 'Player 2';

    for (const step of playerTurnSteps('p1', p1Label)) {
      flow.push({ ...step, section: 'turn', round, turnLabel: `Battle Round ${round} — ${p1Label}'s Turn` });
    }
    for (const step of playerTurnSteps('p2', p2Label)) {
      flow.push({ ...step, section: 'turn', round, turnLabel: `Battle Round ${round} — ${p2Label}'s Turn` });
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

  return flow;
}

function getPhaseGroupLabel(step) {
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

/* --- guide\abilityMapper.js --- */
/**
 * Maps army ability descriptions to guide phases using text analysis.
 */

const SKIP_RULE_NAMES = new Set([
  'Leader',
  'Feel No Pain 6+',
  'Feel No Pain 5+',
  'Feel No Pain 4+',
  'Pistol',
  'Torrent',
  'Ignores Cover',
  'Devastating Wounds',
  'Lethal Hits',
  'Rapid Fire 1',
  'Rapid Fire 2',
  'Assault',
  'Heavy',
  'Precision',
  'Melta 2',
  'Blast',
]);

const PHASE_SLOTS = [
  { slot: 'setup-pre-battle', patterns: [/pre-battle/i, /before the battle begins/i] },
  { slot: 'setup-deploy', patterns: [/when you set up/i, /when this unit is set up/i, /deploy/i, /set up on the battlefield/i, /after both armies are deployed/i, /deployment/i] },
  { slot: 'setup-redeploy', patterns: [/redeploy/i] },
  { slot: 'br-start', patterns: [/start of the battle round/i] },
  { slot: 'turn-start', patterns: [/start of your turn/i, /start of a turn/i] },
  { slot: 'cmd-start', patterns: [/start of your command phase/i, /start of the command phase/i] },
  { slot: 'cmd', patterns: [/command phase/i, /command abilities/i] },
  { slot: 'mov-start', patterns: [/start of the movement phase/i, /start of your movement phase/i] },
  { slot: 'mov', patterns: [/movement phase/i, /when this unit moves/i, /after this unit moves/i, /after moving/i, /while moving/i] },
  { slot: 'shoot-start', patterns: [/start of the shooting phase/i, /start of your shooting phase/i] },
  { slot: 'shoot', patterns: [/shooting phase/i, /when this unit shoots/i, /after shooting/i, /while shooting/i] },
  { slot: 'charge-start', patterns: [/start of the charge phase/i] },
  { slot: 'charge', patterns: [/charge phase/i, /declares a charge/i, /charge move/i, /after a charge move/i] },
  { slot: 'fight-start', patterns: [/start of the fight phase/i] },
  { slot: 'pile-in', patterns: [/pile-in/i, /pile in/i] },
  { slot: 'fight', patterns: [/fight phase/i, /when this unit fights/i, /while fighting/i, /selected to fight/i] },
  { slot: 'consolidate', patterns: [/consolidat/i] },
  { slot: 'turn-end', patterns: [/end of your turn/i, /end of the turn/i] },
  { slot: 'br-end', patterns: [/end of the battle round/i] },
];

const SLOT_TO_STEP_SUFFIX = {
  'setup-pre-battle': 'setup-pre-battle',
  'setup-deploy': 'setup-deploy',
  'setup-redeploy': 'setup-redeploy',
  'br-start': (round) => `br${round}-start`,
  'turn-start': (player) => `${player}-turn-start`,
  'cmd-start': (player) => `${player}-cmd-start`,
  'cmd': (player) => `${player}-cmd-abilities`,
  'mov-start': (player) => `${player}-mov-start`,
  'mov': (player) => `${player}-mov-units`,
  'mov-end': (player) => `${player}-mov-end`,
  'shoot-start': (player) => `${player}-shoot-start`,
  'shoot': (player) => `${player}-shoot`,
  'shoot-end': (player) => `${player}-shoot-end`,
  'charge-start': (player) => `${player}-charge-start`,
  'charge': (player) => `${player}-charge`,
  'charge-end': (player) => `${player}-charge-end`,
  'fight-start': (player) => `${player}-fight-start`,
  'pile-in': (player) => `${player}-pile-in`,
  'fight': (player) => `${player}-fight`,
  'consolidate': (player) => `${player}-consolidate`,
  'turn-end': (player) => `${player}-turn-end`,
  'br-end': (round) => `br${round}-end`,
};

function cleanRuleText(text) {
  if (!text) return '';
  return text
    .replace(/\*\*\^\^([^]+?)\^\^\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectPhaseSlot(description) {
  const text = description.toLowerCase();
  for (const { slot, patterns } of PHASE_SLOTS) {
    if (patterns.some((p) => p.test(text))) return slot;
  }
  return null;
}

function mapSlotToStepId(slot, playerKey, round) {
  const fn = SLOT_TO_STEP_SUFFIX[slot];
  if (!fn) return null;
  if (typeof fn === 'function') {
    if (slot.startsWith('br')) return fn(round);
    return fn(playerKey);
  }
  return fn;
}

function extractArmyAbilities(roster) {
  const abilities = [];
  const seen = new Set();

  function addAbility(unitName, rule, source) {
    if (!rule?.description || rule.description.length < 40) return;
    if (SKIP_RULE_NAMES.has(rule.name)) return;
    const key = `${rule.id || rule.name}::${rule.description.slice(0, 80)}`;
    if (seen.has(key)) return;
    seen.add(key);

    const desc = cleanRuleText(rule.description);
    const slot = detectPhaseSlot(desc);
    if (!slot) return;

    abilities.push({
      id: key,
      unitName,
      ruleName: rule.name,
      description: desc,
      slot,
      source,
    });
  }

  for (const rule of roster.forceRules || []) {
    addAbility('Army', rule, 'force');
  }
  for (const rule of roster.detachmentRules || []) {
    addAbility('Detachment', rule, 'detachment');
  }
  for (const unit of roster.units) {
    for (const rule of unit.rules || []) {
      addAbility(unit.name, rule, 'unit');
    }
  }

  return abilities;
}

function injectAbilitiesIntoFlow(flow, abilities, playerKey) {
  const flowById = new Map(flow.map((s, i) => [s.id, i]));

  for (const ability of abilities) {
    const targets = [];

    if (ability.slot.startsWith('setup')) {
      const stepId = mapSlotToStepId(ability.slot, playerKey, null);
      if (stepId && flowById.has(stepId)) targets.push(stepId);
    } else if (ability.slot === 'br-start' || ability.slot === 'br-end') {
      for (const step of flow) {
        const id = mapSlotToStepId(ability.slot, playerKey, step.round);
        if (id === step.id) targets.push(id);
      }
    } else {
      const stepId = mapSlotToStepId(ability.slot, playerKey, null);
      if (stepId && flowById.has(stepId)) {
        targets.push(stepId);
      } else {
        const alt = mapSlotToStepId(ability.slot.replace('-start', ''), playerKey, null);
        if (alt && flowById.has(alt)) targets.push(alt);
      }
    }

    const uniqueTargets = [...new Set(targets)];
    for (const stepId of uniqueTargets) {
      const idx = flowById.get(stepId);
      if (idx === undefined) continue;
      if (!flow[idx].abilities) flow[idx].abilities = [];
      const already = flow[idx].abilities.some((a) => a.id === ability.id);
      if (!already) {
        flow[idx].abilities.push({
          ...ability,
          player: playerKey,
        });
      }
    }
  }

  return flow;
}

/* --- guide\rosterParser.js --- */
/**
 * Parses BattleScribe / New Recruit roster export JSON.
 */

const CONFIG_NAMES = new Set(['Battle Size', 'Detachment', 'Force Disposition', 'Show/Hide Options']);

function getPoints(costs) {
  const pts = (costs || []).find((c) => c.name === 'pts');
  return pts?.value ?? 0;
}

function getCategories(sel) {
  return (sel.categories || []).map((c) => c.name).filter(Boolean);
}

function isUnitEntry(sel) {
  if (CONFIG_NAMES.has(sel.name)) return false;
  if (sel.type === 'unit') return true;
  if (sel.type === 'model') {
    const cats = getCategories(sel);
    if (cats.includes('Configuration')) return false;
    if (cats.some((c) => ['Character', 'Epic Hero', 'Battleline', 'Infantry', 'Vehicle', 'Monster'].includes(c))) {
      return true;
    }
  }
  return false;
}

function countModels(sel) {
  if (sel.type === 'model' && !sel.selections?.some((s) => s.type === 'model')) return 1;
  let count = 0;
  for (const child of sel.selections || []) {
    if (child.type === 'model') count += 1;
    else if (child.selections) count += countModels(child);
  }
  return count || 1;
}

function collectRules(sel, rules = []) {
  for (const r of sel.rules || []) {
    if (r.description && r.description.length > 30) {
      rules.push({ id: r.id, name: r.name, description: cleanRuleText(r.description) });
    }
  }
  return rules;
}

function parseUnit(sel) {
  const modelCount = countModels(sel);
  const rules = collectRules(sel);
  const keywords = getCategories(sel).filter(
    (c) => !c.startsWith('Faction:') && !['Imperium', 'Configuration'].includes(c),
  );

  return {
    id: sel.id,
    name: sel.name,
    type: sel.type,
    points: getPoints(sel.costs),
    modelCount,
    keywords: keywords.slice(0, 8),
    rules,
    isWarlord: (sel.selections || []).some((s) => s.name === 'Warlord'),
    isAttached: rules.some((r) => r.name === 'Leader') || keywords.includes('Captain'),
  };
}

function parseRosterJson(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  const roster = data.roster;
  if (!roster?.forces?.[0]) {
    throw new Error('Invalid roster file: expected roster.forces[0]');
  }

  const force = roster.forces[0];
  const units = [];
  let detachmentName = '';
  let detachmentRules = [];
  let battleSize = '';

  for (const sel of force.selections || []) {
    if (sel.name === 'Battle Size') {
      battleSize = sel.selections?.[0]?.name || '';
    }
    if (sel.name === 'Detachment') {
      detachmentName = sel.selections?.[0]?.name || '';
      detachmentRules = (sel.selections?.[0]?.rules || []).map((r) => ({
        id: r.id,
        name: r.name,
        description: cleanRuleText(r.description),
      }));
    }
    if (isUnitEntry(sel)) {
      units.push(parseUnit(sel));
    }
  }

  const forceRules = (force.rules || []).map((r) => ({
    id: r.id,
    name: r.name,
    description: cleanRuleText(r.description),
  }));

  const uniqueForceRules = [];
  const seen = new Set();
  for (const r of forceRules) {
    const k = r.name + r.description.slice(0, 60);
    if (!seen.has(k)) {
      seen.add(k);
      uniqueForceRules.push(r);
    }
  }

  return {
    name: roster.name || force.name || 'Unnamed Army',
    faction: force.catalogueName || '',
    battleSize,
    detachment: detachmentName,
    points: getPoints(roster.costs),
    pointsLimit: roster.costLimits?.[0]?.value ?? 0,
    units,
    forceRules: uniqueForceRules,
    detachmentRules,
    raw: data,
  };
}

/* --- guide\guideState.js --- */
const STORAGE_KEY = 'wh40k-battle-guide-v2';

function emptyScore() {
  return { cp: 0, secondary: 0, primary: 0 };
}

function totalScore(s) {
  return s.secondary + s.primary;
}

function createInitialGuideState() {
  return {
    player1: { name: 'Player 1', army: null, score: emptyScore() },
    player2: { name: 'Player 2', army: null, score: emptyScore() },
    flow: [],
    stepIndex: 0,
    completedSteps: {},
    started: false,
  };
}

function rebuildFlow(state) {
  const p1Name = state.player1.army?.name || state.player1.name;
  const p2Name = state.player2.army?.name || state.player2.name;
  let flow = buildFullGuideFlow(p1Name, p2Name);

  if (state.player1.army) {
    const abilities = extractArmyAbilities(state.player1.army);
    flow = injectAbilitiesIntoFlow(flow, abilities, 'p1');
  }
  if (state.player2.army) {
    const abilities = extractArmyAbilities(state.player2.army);
    flow = injectAbilitiesIntoFlow(flow, abilities, 'p2');
  }

  return flow;
}

function guideReducer(state, action) {
  switch (action.type) {
    case 'LOAD_ARMY': {
      const army = parseRosterJson(action.json);
      const key = action.player;
      const next = {
        ...state,
        [key]: {
          ...state[key],
          army,
          name: army.name,
        },
      };
      next.flow = rebuildFlow(next);
      return next;
    }

    case 'CLEAR_ARMY': {
      const next = {
        ...state,
        [action.player]: { ...state[action.player], army: null, name: action.player === 'player1' ? 'Player 1' : 'Player 2' },
      };
      next.flow = rebuildFlow(next);
      return next;
    }

    case 'SET_PLAYER_NAME': {
      const next = { ...state, [action.player]: { ...state[action.player], name: action.value } };
      next.flow = rebuildFlow(next);
      return next;
    }

    case 'START_GAME': {
      const flow = rebuildFlow(state);
      return { ...state, flow, started: true, stepIndex: 0, completedSteps: {} };
    }

    case 'NEXT_STEP': {
      const step = state.flow[state.stepIndex];
      const completed = { ...state.completedSteps, [step?.id]: true };
      const nextIndex = Math.min(state.stepIndex + 1, state.flow.length - 1);
      return { ...state, stepIndex: nextIndex, completedSteps: completed };
    }

    case 'PREV_STEP': {
      return { ...state, stepIndex: Math.max(0, state.stepIndex - 1) };
    }

    case 'GOTO_STEP': {
      return { ...state, stepIndex: Math.max(0, Math.min(action.index, state.flow.length - 1)) };
    }

    case 'ADJUST_SCORE': {
      const { player, field, delta } = action;
      const score = { ...state[player].score };
      score[field] = Math.max(0, score[field] + delta);
      return { ...state, [player]: { ...state[player], score } };
    }

    case 'RESET_GAME':
      return createInitialGuideState();

    case 'RESTORE': {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return state;
        const saved = JSON.parse(raw);
        if (!saved?.player1 || !saved?.player2) return state;
        const base = createInitialGuideState();
        const merged = {
          ...base,
          player1: {
            ...base.player1,
            ...saved.player1,
            score: { ...base.player1.score, ...(saved.player1.score || {}) },
          },
          player2: {
            ...base.player2,
            ...saved.player2,
            score: { ...base.player2.score, ...(saved.player2.score || {}) },
          },
          stepIndex: typeof saved.stepIndex === 'number' ? saved.stepIndex : 0,
          completedSteps: saved.completedSteps || {},
          started: !!saved.started,
        };
        merged.flow = rebuildFlow(merged);
        return merged;
      } catch (_) {
        return state;
      }
    }

    case 'SAVE':
      try {
        const toSave = { ...state, flow: [] };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
      } catch (_) {}
      return state;

    default:
      return state;
  }
}

function getCurrentStep(state) {
  return state.flow[state.stepIndex] || null;
}

function getProgress(state) {
  if (!state.flow.length) return 0;
  return Math.round((state.stepIndex / (state.flow.length - 1)) * 100);
}

/* --- guideRender.js --- */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function renderScoreCell(player, field, label, value, playerKey) {
  return `
    <div class="score-cell">
      <span class="score-label">${label}</span>
      <div class="score-controls">
        <button type="button" data-action="score" data-player="${playerKey}" data-field="${field}" data-delta="-1">−</button>
        <span class="score-value">${value}</span>
        <button type="button" data-action="score" data-player="${playerKey}" data-field="${field}" data-delta="1">+</button>
      </div>
    </div>`;
}

function renderScoreboard(state) {
  const p1 = state.player1;
  const p2 = state.player2;
  const p1Total = totalScore(p1.score);
  const p2Total = totalScore(p2.score);

  const renderPlayer = (p, key, align) => `
    <div class="score-player score-${align}">
      <div class="score-player-name">${esc(p.army?.name || p.name)}</div>
      <div class="score-row">
        ${renderScoreCell(p, 'cp', 'CP', p.score.cp, key)}
        ${renderScoreCell(p, 'secondary', 'Secondary', p.score.secondary, key)}
        ${renderScoreCell(p, 'primary', 'Primary', p.score.primary, key)}
        <div class="score-cell score-total-cell">
          <span class="score-label">Total</span>
          <span class="score-total">${pTotal}</span>
        </div>
      </div>
    </div>`;

  return `
    <header class="scoreboard">
      ${renderPlayer(p1, 'player1', 'left')}
      <div class="score-center">
        <div class="score-vs">VS</div>
        <div class="turn-display">${esc(getCurrentStep(state)?.turnLabel || 'Load armies to begin')}</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${getProgress(state)}%"></div></div>
      </div>
      ${renderPlayer(p2, 'player2', 'right')}
    </header>`;
}

function renderArmyPanel(player, key) {
  const army = player.army;
  if (!army) {
    return `
      <div class="army-panel army-empty">
        <h3>${key === 'player1' ? 'Player 1' : 'Player 2'}</h3>
        <label class="file-btn">
          Load Army (.json)
          <input type="file" accept=".json,application/json" data-action="load-army" data-player="${key}" hidden />
        </label>
        <p class="hint">Upload a BattleScribe / New Recruit roster export.</p>
      </div>`;
  }

  const units = army.units
    .map(
      (u) => `
      <div class="unit-card">
        <div class="unit-card-header">
          <span class="unit-card-name">${esc(u.name)}</span>
          <span class="unit-card-pts">${u.points} pts</span>
        </div>
        <div class="unit-card-meta">${u.modelCount} model${u.modelCount !== 1 ? 's' : ''}${u.isWarlord ? ' · Warlord' : ''}</div>
        ${u.keywords.length ? `<div class="unit-card-kw">${u.keywords.slice(0, 4).map(esc).join(' · ')}</div>` : ''}
      </div>`,
    )
    .join('');

  return `
    <div class="army-panel">
      <div class="army-panel-header">
        <div>
          <h3>${esc(army.name)}</h3>
          <p class="army-meta">${esc(army.faction)} · ${army.points}/${army.pointsLimit} pts</p>
          ${army.detachment ? `<p class="army-meta">${esc(army.detachment)}</p>` : ''}
        </div>
        <button type="button" class="btn-small" data-action="clear-army" data-player="${key}">Clear</button>
      </div>
      <label class="file-btn btn-small">
        Replace
        <input type="file" accept=".json,application/json" data-action="load-army" data-player="${key}" hidden />
      </label>
      <div class="unit-list">${units}</div>
    </div>`;
}

function renderGuideCenter(state) {
  const step = getCurrentStep(state);
  if (!state.started || !step) {
    const canStart = state.player1.army && state.player2.army;
    return `
      <div class="guide-center guide-welcome">
        <h2>Battle Guide</h2>
        <p>Load both army rosters, then begin. This guide walks you through every phase and step from the Core Rules — click <strong>Next Step</strong> as you play on the tabletop.</p>
        <ul class="welcome-list">
          <li>Setup &amp; Deployment (12 steps)</li>
          <li>5 Battle Rounds with full turn sequence</li>
          <li>Army abilities auto-placed in the correct phase</li>
          <li>Scoreboard: CP · Secondary VP · Primary VP · Total</li>
        </ul>
        <button type="button" class="btn-primary" data-action="start-game" ${canStart ? '' : 'disabled'}>
          ${canStart ? 'Begin Battle Guide' : 'Load both armies first'}
        </button>
      </div>`;
  }

  const phaseLabel = getPhaseGroupLabel(step);
  const abilities = (step.abilities || [])
    .map(
      (a) => `
      <div class="ability-reminder ${a.player === 'p1' ? 'p1' : 'p2'}">
        <div class="ability-header">
          <span class="ability-player">${a.player === 'p1' ? 'P1' : 'P2'}</span>
          <strong>${esc(a.unitName)}</strong> — ${esc(a.ruleName)}
        </div>
        <p>${esc(a.description.slice(0, 280))}${a.description.length > 280 ? '…' : ''}</p>
      </div>`,
    )
    .join('');

  const checklist = state.flow
    .map((s, i) => {
      const done = state.completedSteps[s.id] || i < state.stepIndex;
      const current = i === state.stepIndex;
      const cls = `check-item ${done ? 'done' : ''} ${current ? 'current' : ''}`;
      return `<button type="button" class="${cls}" data-action="goto-step" data-index="${i}">
        <span class="check-dot"></span>
        <span class="check-text">${esc(s.label)}</span>
      </button>`;
    })
    .join('');

  return `
    <div class="guide-center">
      <div class="step-card">
        <div class="step-phase">${esc(phaseLabel)}</div>
        <h2 class="step-title">${esc(step.label)}</h2>
        <p class="step-detail">${esc(step.detail)}</p>
        <p class="step-ref">${esc(step.ruleRef || '')}</p>
        ${abilities ? `<div class="ability-list"><h4>Army Abilities — check now</h4>${abilities}</div>` : ''}
      </div>
      <div class="step-nav">
        <button type="button" data-action="prev-step" ${state.stepIndex === 0 ? 'disabled' : ''}>← Previous</button>
        <span class="step-counter">Step ${state.stepIndex + 1} of ${state.flow.length}</span>
        <button type="button" class="btn-primary" data-action="next-step" ${state.stepIndex >= state.flow.length - 1 ? 'disabled' : ''}>Next Step →</button>
      </div>
      <details class="checklist-panel" ${state.stepIndex > 5 ? 'open' : ''}>
        <summary>Full checklist (${state.flow.length} steps)</summary>
        <div class="checklist">${checklist}</div>
      </details>
    </div>`;
}

function renderGuide(root, state, dispatch) {
  root.innerHTML = `
    <div class="guide-app">
      ${renderScoreboard(state)}
      <main class="guide-main">
        ${renderArmyPanel(state.player1, 'player1')}
        ${renderGuideCenter(state)}
        ${renderArmyPanel(state.player2, 'player2')}
      </main>
      <footer class="guide-footer">
        Warhammer 40,000 Battle Guide · Core Rules &amp; Event Companion · Step ${state.stepIndex + 1}/${state.flow.length || '—'}
        <button type="button" class="btn-link" data-action="reset-game">Reset</button>
        <button type="button" class="btn-link" data-action="save-game">Save</button>
      </footer>
    </div>`;

  bindGuideEvents(root, dispatch);
}

function bindGuideEvents(root, dispatch) {
  root.querySelector('[data-action="start-game"]')?.addEventListener('click', () => dispatch({ type: 'START_GAME' }));
  root.querySelector('[data-action="next-step"]')?.addEventListener('click', () => dispatch({ type: 'NEXT_STEP' }));
  root.querySelector('[data-action="prev-step"]')?.addEventListener('click', () => dispatch({ type: 'PREV_STEP' }));
  root.querySelector('[data-action="reset-game"]')?.addEventListener('click', () => {
    if (confirm('Reset the battle guide? Armies and scores will be cleared.')) dispatch({ type: 'RESET_GAME' });
  });
  root.querySelector('[data-action="save-game"]')?.addEventListener('click', () => dispatch({ type: 'SAVE' }));

  root.querySelectorAll('[data-action="goto-step"]').forEach((btn) => {
    btn.addEventListener('click', () => dispatch({ type: 'GOTO_STEP', index: Number(btn.dataset.index) }));
  });

  root.querySelectorAll('[data-action="score"]').forEach((btn) => {
    btn.addEventListener('click', () =>
      dispatch({
        type: 'ADJUST_SCORE',
        player: btn.dataset.player,
        field: btn.dataset.field,
        delta: Number(btn.dataset.delta),
      }),
    );
  });

  root.querySelectorAll('[data-action="clear-army"]').forEach((btn) => {
    btn.addEventListener('click', () => dispatch({ type: 'CLEAR_ARMY', player: btn.dataset.player }));
  });

  root.querySelectorAll('input[data-action="load-army"]').forEach((input) => {
    input.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          dispatch({ type: 'LOAD_ARMY', player: input.dataset.player, json: reader.result });
        } catch (err) {
          alert('Failed to load roster: ' + err.message);
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
  });
}

/* --- main.js --- */
function showBootError(err) {
  const root = document.getElementById('root');
  const msg = err && err.message ? err.message : String(err);
  const stack = err && err.stack ? '<pre style="font-size:11px;margin-top:1rem;white-space:pre-wrap;color:#a8a29e">' + err.stack + '</pre>' : '';
  if (root) {
    root.innerHTML =
      '<div style="padding:2rem;font-family:monospace;color:#f87171;min-height:100vh">' +
      '<h2 style="color:#fbbf24">Battle Guide failed to start</h2>' +
      '<p>' + msg + '</p>' + stack +
      '<p style="color:#a8a29e;margin-top:1rem">Try running build.bat, then launch-offline.bat again.</p></div>';
  }
}

try {
  let state = createInitialGuideState();
  state = guideReducer(state, { type: 'RESTORE' });

  function dispatch(action) {
    state = guideReducer(state, action);
    if (action.type !== 'RESTORE') {
      state = guideReducer(state, { type: 'SAVE' });
    }
    renderGuide(document.getElementById('root'), state, dispatch);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => renderGuide(document.getElementById('root'), state, dispatch));
  } else {
    renderGuide(document.getElementById('root'), state, dispatch);
  }
} catch (err) {
  showBootError(err);
}

})();
    