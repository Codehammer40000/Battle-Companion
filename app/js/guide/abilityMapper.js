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
  'Rapid Fire',
  'Assault',
  'Heavy',
  'Precision',
  'Melta 2',
  'Melta',
  'Blast',
  'Twin-linked',
  'Sustained Hits',
  'Hazardous',
  'One Shot',
  'Psychic',
  'Close-quarters',
  'Deadly Demise D6',
]);

const KEYWORD_EXPLANATION_NAMES = new Set([
  'Devastating Wounds',
  'Lethal Hits',
  'Rapid Fire',
  'Assault',
  'Heavy',
  'Torrent',
  'Ignores Cover',
  'Melta',
  'Blast',
  'Twin-linked',
  'Sustained Hits',
  'Hazardous',
  'One Shot',
  'Psychic',
  'Close-quarters',
  'Deadly Demise D6',
  'Feel No Pain 6+',
  'Feel No Pain 5+',
  'Feel No Pain 4+',
]);

/** Explicit "In your X phase" triggers — checked before generic patterns. */
const EXPLICIT_PHASE_PATTERNS = [
  { slot: 'shoot', timing: 'opponent', patterns: [/\bin your opponent'?s? shooting phase\b/i, /\bduring your opponent'?s? shooting phase\b/i] },
  { slot: 'shoot', timing: 'either', patterns: [/\bin either player'?s? shooting phase\b/i] },
  { slot: 'shoot', timing: 'yours', patterns: [/\bin your shooting phase\b/i, /\bduring your shooting phase\b/i] },
  { slot: 'fight', timing: 'opponent', patterns: [/\bin your opponent'?s? fight phase\b/i, /\bduring your opponent'?s? fight phase\b/i] },
  { slot: 'fight', timing: 'either', patterns: [/\bin either player'?s? fight phase\b/i] },
  { slot: 'fight', timing: 'yours', patterns: [/\bin your fight phase\b/i, /\bduring your fight phase\b/i] },
  { slot: 'charge', timing: 'opponent', patterns: [/\bin your opponent'?s? charge phase\b/i] },
  { slot: 'charge', timing: 'either', patterns: [/\bin either player'?s? charge phase\b/i] },
  { slot: 'charge', timing: 'yours', patterns: [/\bin your charge phase\b/i, /\bduring your charge phase\b/i] },
  { slot: 'mov', timing: 'opponent', patterns: [/\bin your opponent'?s? movement phase\b/i, /\bduring your opponent'?s? movement phase\b/i] },
  { slot: 'mov', timing: 'either', patterns: [/\bin either player'?s? movement phase\b/i] },
  { slot: 'mov', timing: 'yours', patterns: [/\bin your movement phase\b/i, /\bduring your movement phase\b/i] },
  { slot: 'cmd', timing: 'opponent', patterns: [/\bin your opponent'?s? command phase\b/i, /\bduring your opponent'?s? command phase\b/i] },
  { slot: 'cmd', timing: 'either', patterns: [/\bin either player'?s? command phase\b/i] },
  { slot: 'cmd', timing: 'yours', patterns: [/\bin your command phase\b/i, /\bduring your command phase\b/i] },
  { slot: 'turn-start', timing: 'opponent', patterns: [/\bin your opponent'?s? turn\b/i, /\bduring your opponent'?s? turn\b/i] },
  { slot: 'turn-start', timing: 'either', patterns: [/\bin either player'?s? turn\b/i, /\bduring either player'?s? turn\b/i] },
];

/** Most specific phase triggers first — order matters. */
const PHASE_SLOTS = [
  { slot: 'setup-pre-battle', patterns: [/pre-battle/i, /before the battle begins/i, /if you include this (model|unit) in your army/i] },
  {
    slot: 'setup-deploy',
    patterns: [
      /first time this (model|unit) is set up/i,
      /when you set up this (model|unit)/i,
      /when this unit is set up/i,
      /when this model is set up/i,
      /after both armies are deployed/i,
      /during deployment/i,
    ],
  },
  { slot: 'setup-redeploy', patterns: [/redeploy/i] },
  {
    slot: 'setup-formations',
    patterns: [
      /can be attached to the following units/i,
      /declare battle formations/i,
      /transport capacity/i,
      /deep strike/i,
      /strategic reserves/i,
    ],
  },
  { slot: 'br-start', patterns: [/start of the battle round/i] },
  { slot: 'br-end', patterns: [/end of the battle round/i] },
  { slot: 'turn-start', patterns: [/start of your turn/i, /start of a turn/i, /at the start of any turn/i] },
  { slot: 'turn-end', patterns: [/end of your turn/i, /at the end of your turn/i, /end of the turn step/i] },
  { slot: 'cmd-start', patterns: [/start of your command phase/i, /start of the command phase/i, /at the start of your next command phase/i] },
  { slot: 'cmd-end', patterns: [/end of your command phase/i, /end of the command phase/i, /at the end of your command phase/i] },
  { slot: 'cmd', patterns: [/command phase/i, /command abilities/i] },
  { slot: 'mov-start', patterns: [/start of the movement phase/i, /start of your movement phase/i] },
  { slot: 'mov-end', patterns: [/end of the movement phase/i, /end of your movement phase/i] },
  {
    slot: 'mov',
    patterns: [/movement phase/i, /when this unit moves/i, /after this unit moves/i, /after moving/i, /while moving/i, /make a move/i],
  },
  { slot: 'shoot-start', patterns: [/start of the shooting phase/i, /start of your shooting phase/i] },
  { slot: 'shoot-end', patterns: [/end of the shooting phase/i, /end of your shooting phase/i] },
  {
    slot: 'shoot',
    patterns: [
      /shooting phase/i,
      /when this (model|unit) shoots/i,
      /each time this (model|unit) shoots/i,
      /after this model has shot/i,
      /after this unit has shot/i,
      /selected to shoot/i,
      /after shooting/i,
      /while shooting/i,
      /makes a ranged attack/i,
      /makes an attack with a/i,
    ],
  },
  { slot: 'charge-start', patterns: [/start of the charge phase/i] },
  { slot: 'charge-end', patterns: [/end of the charge phase/i] },
  { slot: 'charge', patterns: [/charge phase/i, /declares a charge/i, /declare a charge/i, /charge move/i, /after a charge move/i, /disembarks from this model/i] },
  { slot: 'fight-start', patterns: [/start of the fight phase/i] },
  { slot: 'pile-in', patterns: [/pile-in/i, /pile in/i] },
  { slot: 'consolidate', patterns: [/consolidat/i] },
  { slot: 'fight-end', patterns: [/end of the fight phase/i] },
  {
    slot: 'fight',
    patterns: [
      /fight phase/i,
      /when this unit fights/i,
      /while fighting/i,
      /selected to fight/i,
      /makes a melee attack/i,
      /each time an attack targets this unit/i,
    ],
  },
  {
    slot: 'passive',
    patterns: [
      /while this (model|unit)/i,
      /while an enemy/i,
      /has the following ability/i,
      /invulnerable save/i,
      /^[2-6]\+$/,
    ],
  },
];

const SLOT_TO_STEP_SUFFIX = {
  'setup-pre-battle': 'setup-pre-battle',
  'setup-deploy': 'setup-deploy',
  'setup-redeploy': 'setup-redeploy',
  'setup-formations': 'setup-formations',
  'br-start': (round) => `br${round}-start`,
  'turn-start': (player) => `${player}-turn-start`,
  'cmd-start': (player) => `${player}-cmd-start`,
  'cmd-end': (player) => `${player}-cmd-end`,
  cmd: (player) => `${player}-cmd-abilities`,
  'mov-start': (player) => `${player}-mov-start`,
  mov: (player) => `${player}-mov-units`,
  'mov-end': (player) => `${player}-mov-end`,
  'shoot-start': (player) => `${player}-shoot-start`,
  shoot: (player) => `${player}-shoot`,
  'shoot-end': (player) => `${player}-shoot-end`,
  'charge-start': (player) => `${player}-charge-start`,
  charge: (player) => `${player}-charge`,
  'charge-end': (player) => `${player}-charge-end`,
  'fight-start': (player) => `${player}-fight-start`,
  'pile-in': (player) => `${player}-pile-in`,
  fight: (player) => `${player}-fight`,
  consolidate: (player) => `${player}-consolidate`,
  'fight-end': (player) => `${player}-fight-end`,
  'turn-end': (player) => `${player}-turn-end`,
  'br-end': (round) => `br${round}-end`,
  passive: (player) => `${player}-turn-start`,
};

export function cleanRuleText(text) {
  if (!text) return '';
  return text
    .replace(/\*\*\^\^([^]+?)\^\^\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectTimingModifier(description, abilityName = '') {
  const text = `${abilityName} ${description}`.toLowerCase();
  for (const { timing, patterns } of EXPLICIT_PHASE_PATTERNS) {
    if (patterns.some((p) => p.test(text))) return timing;
  }
  if (/\b(?:in|during) either player'?s?\b/i.test(text)) return 'either';
  if (/\b(?:in|during) your opponent'?s?\b/i.test(text)) return 'opponent';
  if (/\bopponent'?s? (?:turn|command|movement|shooting|charge|fight) phase\b/i.test(text)) return 'opponent';
  return 'yours';
}

function detectPhaseSlotExplicit(description, abilityName = '') {
  const text = `${abilityName} ${description}`;
  for (const { slot, patterns } of EXPLICIT_PHASE_PATTERNS) {
    if (patterns.some((p) => p.test(text))) return slot;
  }
  return null;
}

function detectPhaseSlotFromPatterns(text) {
  for (const { slot, patterns } of PHASE_SLOTS) {
    if (patterns.some((p) => p.test(text))) return slot;
  }
  return null;
}

export function analyzeAbility(description, abilityName = '') {
  const desc = cleanRuleText(description || abilityName);
  const combined = `${abilityName} ${desc}`;
  const timing = detectTimingModifier(desc, abilityName);
  const slot = detectPhaseSlotExplicit(desc, abilityName) || detectPhaseSlotFromPatterns(combined.toLowerCase());
  return { slot, timing, description: desc };
}

export function detectPhaseSlot(description, abilityName = '') {
  return analyzeAbility(description, abilityName).slot;
}

export function mapSlotToStepId(slot, playerKey, round) {
  const fn = SLOT_TO_STEP_SUFFIX[slot];
  if (!fn) return null;
  if (typeof fn === 'function') {
    if (slot.startsWith('br')) return fn(round);
    return fn(playerKey);
  }
  return fn;
}

function isSkippableRule(rule, source) {
  if (!rule?.description && !rule?.name) return true;
  if (source === 'rule' && SKIP_RULE_NAMES.has(rule.name)) return true;
  if (source === 'rule' && rule.name === 'Leader') return true;
  if (KEYWORD_EXPLANATION_NAMES.has(rule.name) && (rule.description || '').length > 120) return true;
  if (/^keywords\s*-/i.test(rule.description || '')) return true;
  return false;
}

function makeAbilityKey(unitName, rule, source) {
  if (source === 'army' || source === 'detachment') {
    return `${source}::${rule.id || rule.name}::${rule.description.slice(0, 80)}`;
  }
  return `${unitName}::${rule.id || rule.name}::${rule.description.slice(0, 80)}`;
}

function forEachDetachmentRule(roster, cb) {
  const detachments = roster.detachments?.length
    ? roster.detachments
    : roster.detachment || roster.detachmentRules?.length
      ? [{ name: roster.detachment || 'Detachment', rules: roster.detachmentRules || [] }]
      : [];

  for (const det of detachments) {
    for (const rule of det.rules || []) {
      cb(det.name, rule);
    }
  }
}

export function extractArmyAbilities(roster) {
  const abilities = [];
  const seen = new Set();

  function addAbility(unitName, rule, source) {
    if (isSkippableRule(rule, source)) return;

    const analyzed = analyzeAbility(rule.description || rule.name, rule.name);
    if (!analyzed.description || analyzed.description.length < 2) return;

    const key = makeAbilityKey(unitName, rule, source);
    if (seen.has(key)) return;
    seen.add(key);

    const slot = analyzed.slot;
    if (!slot || slot === 'passive') return;

    abilities.push({
      id: key,
      unitName,
      ruleName: rule.name,
      description: analyzed.description,
      slot,
      timing: analyzed.timing,
      source,
    });
  }

  for (const rule of roster.armyRules || roster.forceRules || []) {
    addAbility('Army', rule, 'army');
  }
  forEachDetachmentRule(roster, (detName, rule) => addAbility(detName, rule, 'detachment'));
  for (const unit of roster.units) {
    for (const ability of unit.abilities || []) {
      addAbility(unit.name, ability, 'profile');
    }
    for (const rule of unit.rules || []) {
      addAbility(unit.name, rule, 'rule');
    }
  }

  return abilities;
}

/** Ability slots that apply to a given guide step. */
export function getPhaseContext(step) {
  if (!step?.id) return null;
  const id = step.id;

  if (step.section === 'setup') {
    const setupMap = {
      'setup-pre-battle': 'setup-pre-battle',
      'setup-deploy': 'setup-deploy',
      'setup-redeploy': 'setup-redeploy',
      'setup-formations': 'setup-formations',
    };
    const slot = setupMap[id];
    return slot ? { kind: 'setup', slot } : null;
  }

  if (id.startsWith('br') && id.endsWith('-start')) return { kind: 'phase', prefix: 'br', broad: true };
  if (id.startsWith('br') && id.endsWith('-end')) return { kind: 'phase', prefix: 'br', broad: true };
  if (id.endsWith('-turn-start')) return { kind: 'phase', prefix: 'turn', broad: true };
  if (id.endsWith('-turn-end')) return { kind: 'phase', prefix: 'turn', broad: true };
  if (/-cmd-/.test(id)) return { kind: 'phase', prefix: 'cmd', broad: false };
  if (/-mov-/.test(id)) return { kind: 'phase', prefix: 'mov', broad: true };
  if (/-shoot/.test(id)) return { kind: 'phase', prefix: 'shoot', broad: true };
  if (/-charge/.test(id)) return { kind: 'phase', prefix: 'charge', broad: true };
  if (/-fight|-pile-in|-consolidate/.test(id)) return { kind: 'phase', prefix: 'fight', broad: true };

  return null;
}

export function getSlotsForStep(step) {
  const ctx = getPhaseContext(step);
  if (!ctx) return [];
  if (ctx.kind === 'setup') return [ctx.slot];
  return [ctx.prefix];
}

function abilityPhasePrefix(slot) {
  if (!slot) return '';
  if (slot === 'pile-in' || slot === 'consolidate') return 'fight';
  if (slot.startsWith('br')) return 'br';
  if (slot.startsWith('turn')) return 'turn';
  if (slot.startsWith('setup')) return 'setup';
  return slot.split('-')[0];
}

function unitAbilityMatchesStep(abilitySlot, step, ctx) {
  if (!abilitySlot || abilitySlot === 'passive' || !ctx) return false;

  if (ctx.kind === 'setup') return abilitySlot === ctx.slot;

  const abPrefix = abilityPhasePrefix(abilitySlot);
  if (abPrefix !== ctx.prefix) return false;

  if (ctx.prefix === 'cmd') {
    if (abilitySlot === 'cmd-end') return step.id.endsWith('-cmd-end');
    if (abilitySlot === 'cmd-start') return step.id.endsWith('-cmd-start');
    return step.id.includes('-cmd-');
  }

  if (ctx.broad) return true;

  return false;
}

function armyAbilityMatchesStep(abilitySlot, ctx) {
  if (!abilitySlot || abilitySlot === 'passive' || !ctx) return false;
  if (ctx.kind === 'setup') return abilitySlot === ctx.slot;
  return abilityPhasePrefix(abilitySlot) === ctx.prefix;
}

function abilityMatchesPhase(ability, step, ctx) {
  if (!ability.slot || ability.slot === 'passive' || !ctx) return false;
  const isArmy = ability.source === 'army' || ability.source === 'detachment';
  if (isArmy) return armyAbilityMatchesStep(ability.slot, ctx);
  return unitAbilityMatchesStep(ability.slot, step, ctx);
}

function shouldShowAbilityForStep(ability, ownerKey, step) {
  const isSharedStep = step.section === 'setup' || step.section === 'battle_round';
  const timing = ability.timing || 'yours';
  const isActiveTurn = step.player === ownerKey;
  const isOpponentTurn = step.player && step.player !== ownerKey;

  if (isSharedStep) return true;

  if (timing === 'either') return true;
  if (timing === 'opponent') return isOpponentTurn;
  return isActiveTurn;
}

/** All usable abilities for both armies on the current step. */
export function getAllAbilitiesForStep(state, step) {
  const ctx = getPhaseContext(step);
  if (!ctx) return [];

  const seen = new Set();
  const out = [];

  const players = [
    { army: state.player1?.army, key: 'p1', playerKey: 'player1' },
    { army: state.player2?.army, key: 'p2', playerKey: 'player2' },
  ];

  for (const { army, key, playerKey } of players) {
    if (!army) continue;
    const deadIds = new Set(state.deadUnits?.[playerKey] || []);

    for (const ability of listAllAbilities(army)) {
      if (ability.unitId && deadIds.has(ability.unitId)) continue;
      if (!abilityMatchesPhase(ability, step, ctx)) continue;
      if (!shouldShowAbilityForStep(ability, key, step)) continue;

      const entry = { ...ability, player: key };
      const dedupeKey = `${entry.player}::${entry.id}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      out.push(entry);
    }
  }

  out.sort((a, b) => {
    if (a.player !== b.player) return a.player === 'p1' ? -1 : 1;
    if (a.unitName !== b.unitName) return a.unitName.localeCompare(b.unitName);
    return a.ruleName.localeCompare(b.ruleName);
  });
  return out;
}

export function injectAbilitiesIntoFlow(flow, abilities, playerKey) {
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

/** All abilities from roster with phase slot (or null) — for army panel reference. */
export function listAllAbilities(roster) {
  const out = [];
  const seen = new Set();

  function push(unitName, rule, source, unitId = null) {
    if (isSkippableRule(rule, source)) return;
    const analyzed = analyzeAbility(rule.description || rule.name, rule.name);
    if (!analyzed.description || analyzed.description.length < 2) return;
    const key = makeAbilityKey(unitName, rule, source);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      id: key,
      unitName,
      unitId,
      ruleName: rule.name,
      description: analyzed.description,
      slot: analyzed.slot,
      timing: analyzed.timing,
      source,
    });
  }

  for (const rule of roster.armyRules || roster.forceRules || []) push('Army', rule, 'army');
  forEachDetachmentRule(roster, (detName, rule) => push(detName, rule, 'detachment'));
  for (const unit of roster.units) {
    for (const ability of unit.abilities || []) push(unit.name, ability, 'profile', unit.id);
    for (const rule of unit.rules || []) push(unit.name, rule, 'rule', unit.id);
  }
  return out;
}
