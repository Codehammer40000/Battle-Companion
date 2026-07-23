/**
 * Parses BattleScribe / New Recruit roster export JSON.
 */

import { cleanRuleText } from './abilityMapper.js';

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
  let count = 0;
  for (const child of sel.selections || []) {
    if (child.type === 'model') {
      count += Math.max(1, child.number || 1);
    } else if (child.selections?.length) {
      count += countModels(child);
    }
  }
  if (count > 0) return count;
  if (sel.type === 'model') return Math.max(1, sel.number || 1);
  return 1;
}

function getProfileDescription(profile) {
  for (const c of profile.characteristics || []) {
    const name = (c.name || '').toLowerCase();
    if (name === 'description' || name === 'abilities' || name === 'ability') {
      const text = c.$text ?? c.value ?? '';
      if (text) return cleanRuleText(text);
    }
  }
  return '';
}

function isAbilityProfile(profile) {
  const type = (profile.typeName || '').toLowerCase();
  return type === 'abilities' || type === 'ability';
}

function collectProfileAbilities(sel, out = [], unitName = sel.name) {
  for (const profile of sel.profiles || []) {
    if (!isAbilityProfile(profile)) continue;
    const description = getProfileDescription(profile);
    if (!description && !profile.name) continue;
    out.push({
      id: profile.id || `${sel.id}-${profile.name}`,
      name: profile.name || 'Ability',
      description: description || profile.name,
      sourceSelection: unitName,
    });
  }
  for (const child of sel.selections || []) {
    collectProfileAbilities(child, out, unitName);
  }
  return out;
}

function collectRulesRecursive(sel, rules = []) {
  for (const r of sel.rules || []) {
    if (!r.description) continue;
    rules.push({
      id: r.id,
      name: r.name,
      description: cleanRuleText(r.description),
    });
  }
  for (const child of sel.selections || []) {
    collectRulesRecursive(child, rules);
  }
  return rules;
}

function dedupeByKey(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function isArmyWideRule(rule) {
  const text = (rule.description || '').toLowerCase();
  return (
    /if your army faction/i.test(text) ||
    /if your army includes/i.test(text) ||
    /models in your army have/i.test(text)
  );
}

const KEYWORD_SKIP = new Set([
  'Configuration',
  'Melee Weapon',
  'Ranged Weapon',
  'Extra Attacks Weapon',
  'Attacks Dx Weapon',
  'Torrent Weapon',
  'Imperium',
]);

function getProfileChars(profile) {
  const out = {};
  for (const c of profile.characteristics || []) {
    out[c.name] = String(c.$text ?? c.value ?? '').trim();
  }
  return out;
}

function isEmptyStat(value) {
  const v = String(value ?? '').trim();
  return !v || v === '-' || v === 'N/A';
}

function collectUnitStatProfiles(sel, out = []) {
  for (const profile of sel.profiles || []) {
    if (profile.typeName === 'Unit') {
      out.push({ name: profile.name, chars: getProfileChars(profile) });
    }
  }
  for (const child of sel.selections || []) {
    collectUnitStatProfiles(child, out);
  }
  return out;
}

function pickPrimaryStats(profiles, unitName) {
  if (!profiles.length) return {};
  const exact = profiles.find((p) => p.name === unitName);
  if (exact) return exact.chars;
  const squad = profiles.find((p) => p.name.includes(unitName) && !/sergeant|champion|leader/i.test(p.name));
  if (squad) return squad.chars;
  const nonSergeant = profiles.find((p) => !/sergeant|champion/i.test(p.name));
  return (nonSergeant || profiles[0]).chars;
}

function collectWeapons(sel, typeName, out = []) {
  for (const profile of sel.profiles || []) {
    if (profile.typeName !== typeName) continue;
    const chars = getProfileChars(profile);
    out.push({
      name: profile.name,
      range: chars.Range || '',
      a: chars.A || '',
      bs: chars.BS || '',
      ws: chars.WS || '',
      s: chars.S || '',
      ap: chars.AP || '',
      d: chars.D || '',
      keywords: isEmptyStat(chars.Keywords) ? '' : chars.Keywords,
    });
  }
  for (const child of sel.selections || []) {
    collectWeapons(child, typeName, out);
  }
  return out;
}

function collectAllKeywords(sel, out = new Set()) {
  for (const cat of sel.categories || []) {
    const name = cat.name || '';
    if (!name || name.startsWith('Faction:') || KEYWORD_SKIP.has(name)) continue;
    out.add(name);
  }
  for (const child of sel.selections || []) {
    collectAllKeywords(child, out);
  }
  return [...out];
}

function extractFnp(rules, abilities) {
  for (const rule of rules) {
    const m = rule.name?.match(/Feel No Pain\s*(\d+\+)/i);
    if (m) return m[1];
  }
  for (const ability of abilities) {
    if (/feel no pain/i.test(ability.name || '')) {
      const m = (ability.name + ' ' + ability.description).match(/(\d+\+)/);
      if (m) return m[1];
    }
    const m = (ability.description || '').match(/Feel No Pain\s*(\d+\+)/i);
    if (m) return m[1];
  }
  return '';
}

function buildUnitStats(charStats, rules, abilities) {
  const invulnAbility = abilities.find((a) => a.name === 'Invulnerable Save');
  let invuln = isEmptyStat(charStats.InSv) ? '' : charStats.InSv;
  if (!invuln && invulnAbility && !isEmptyStat(invulnAbility.description)) {
    invuln = invulnAbility.description;
  }

  const fnp = extractFnp(rules, abilities);

  return {
    M: charStats.M || '',
    T: charStats.T || '',
    Sv: charStats.Sv || '',
    W: charStats.W || charStats.Wounds || '',
    LD: charStats.LD || '',
    OC: charStats.OC || '',
    InSv: invuln,
    FNP: fnp,
  };
}

export function formatUnitStatsLine(stats) {
  if (!stats) return '';
  const parts = [];
  if (!isEmptyStat(stats.M)) parts.push(`M ${stats.M}`);
  if (!isEmptyStat(stats.T)) parts.push(`T ${stats.T}`);
  if (!isEmptyStat(stats.Sv)) parts.push(`Sv ${stats.Sv}`);
  if (!isEmptyStat(stats.W)) parts.push(`W ${stats.W}`);
  if (!isEmptyStat(stats.LD)) parts.push(`LD ${stats.LD}`);
  if (!isEmptyStat(stats.OC)) parts.push(`OC ${stats.OC}`);
  if (!isEmptyStat(stats.InSv)) parts.push(`InSv ${stats.InSv}`);
  if (!isEmptyStat(stats.FNP)) parts.push(`FNP ${stats.FNP}`);
  return parts.join(' · ');
}

function parseWoundValue(w) {
  if (w == null || w === '' || w === '-') return 1;
  const n = parseInt(String(w).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export { parseWoundValue };

export function getUnitWoundsPerModel(unit) {
  if (unit?.woundsPerModel > 0) return unit.woundsPerModel;
  return parseWoundValue(unit?.stats?.W ?? unit?.stats?.Wounds);
}

export function getUnitInitialModelCount(unit) {
  if (unit?.initialModelCount > 0) return unit.initialModelCount;
  return Math.max(1, unit?.modelCount ?? 1);
}

export function indexKeywordRules(rules) {
  const index = {};
  for (const rule of rules || []) {
    if (!rule?.name || !rule.description) continue;
    index[rule.name] = { id: rule.id, name: rule.name, description: rule.description };
  }
  return index;
}

export function findKeywordRule(keyword, ruleIndex) {
  if (!keyword || !ruleIndex) return null;
  const text = String(keyword).trim();
  if (!text) return null;
  if (ruleIndex[text]) return ruleIndex[text];

  const lower = text.toLowerCase();
  for (const [name, rule] of Object.entries(ruleIndex)) {
    if (name.toLowerCase() === lower) return rule;
  }

  let best = null;
  let bestLen = 0;
  for (const [name, rule] of Object.entries(ruleIndex)) {
    const nameLower = name.toLowerCase();
    if (lower.startsWith(nameLower) && name.length > bestLen) {
      best = rule;
      bestLen = name.length;
    }
  }
  return best;
}

export function getUnitKeywordRules(unit) {
  if (unit?.keywordRules && typeof unit.keywordRules === 'object') return unit.keywordRules;
  return indexKeywordRules(unit?.rules);
}

const UNIT_ABILITY_RULE_PATTERNS = [/^feel no pain/i, /^deadly demise/i, /^deep strike/i];

const UNIT_DISPLAY_KEYWORD_PATTERNS = [/^deep strike/i];

export function isPromotedUnitAbilityRule(rule) {
  const name = rule?.name || '';
  if (!name || !rule?.description) return false;
  if (name === 'Leader' || name === 'Oath of Moment') return false;
  return UNIT_ABILITY_RULE_PATTERNS.some((pattern) => pattern.test(name));
}

/** Profile abilities plus unit-level rules like Feel No Pain and Deadly Demise. */
export function getUnitDisplayAbilities(unit) {
  const seen = new Set();
  const out = [];

  for (const item of [...(unit?.abilities || []), ...(unit?.rules || []).filter(isPromotedUnitAbilityRule)]) {
    const key = `${item.name}::${(item.description || '').slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

export function unitHasDeepStrike(unit) {
  if ((unit?.keywords || []).some((k) => /^deep strike$/i.test(k))) return true;
  if ((unit?.rules || []).some((r) => /^deep strike/i.test(r.name))) return true;
  if ((unit?.abilities || []).some((a) => /^deep strike/i.test(a.name))) return true;
  return getUnitDisplayAbilities(unit).some((a) => /^deep strike/i.test(a.name));
}

/** Unit keywords plus ability keywords like Deep Strike from rules/abilities. */
export function getUnitDisplayKeywords(unit) {
  const keywords = new Set(unit?.keywords || []);

  for (const rule of unit?.rules || []) {
    if (UNIT_DISPLAY_KEYWORD_PATTERNS.some((pattern) => pattern.test(rule.name))) {
      keywords.add(rule.name);
    }
  }

  for (const ability of getUnitDisplayAbilities(unit)) {
    if (UNIT_DISPLAY_KEYWORD_PATTERNS.some((pattern) => pattern.test(ability.name))) {
      keywords.add(ability.name);
    }
  }

  return [...keywords];
}

function parseDetachmentEntry(detachmentChild) {
  let rules = (detachmentChild.rules || []).map((r) => ({
    id: r.id,
    name: r.name,
    description: cleanRuleText(r.description),
  }));

  const profileRules = collectProfileAbilities(detachmentChild, [], detachmentChild.name).map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
  }));
  rules.push(...profileRules);

  for (const child of detachmentChild.selections || []) {
    rules.push(
      ...collectRulesRecursive(child).map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
      })),
    );
    rules.push(
      ...collectProfileAbilities(child, [], detachmentChild.name).map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
      })),
    );
  }

  rules = dedupeByKey(rules, (r) => r.id || `${r.name}::${r.description.slice(0, 80)}`);

  return {
    id: detachmentChild.id || '',
    name: detachmentChild.name || 'Detachment',
    entryId: detachmentChild.entryId || '',
    rules,
  };
}

function parseDetachmentsFromForce(force) {
  const detachments = [];

  for (const sel of force.selections || []) {
    if (sel.name === 'Detachment') {
      for (const child of sel.selections || []) {
        if (!child?.name) continue;
        detachments.push(parseDetachmentEntry(child));
      }
      continue;
    }

    const categories = getCategories(sel);
    if (categories.includes('Detachment') && sel.name !== 'Detachment') {
      detachments.push(parseDetachmentEntry(sel));
    }
  }

  return dedupeByKey(detachments, (d) => d.entryId || d.id || d.name);
}

export function normalizeArmyDetachments(army) {
  if (!army) return army;
  if (army.detachments?.length) return army;

  if (army.detachment || army.detachmentRules?.length) {
    return {
      ...army,
      detachments: [
        {
          id: 'legacy-detachment',
          name: army.detachment || 'Detachment',
          entryId: '',
          rules: army.detachmentRules || [],
        },
      ],
    };
  }

  return { ...army, detachments: [] };
}

export function normalizeArmy(army) {
  if (!army) return army;
  return normalizeArmyDetachments(normalizeArmyUnits(army));
}

export function normalizeArmyUnits(army) {
  if (!army?.units) return army;
  return {
    ...army,
    units: army.units.map((u) => ({
      ...u,
      woundsPerModel: getUnitWoundsPerModel(u),
      initialModelCount: getUnitInitialModelCount(u),
      keywordRules: u.keywordRules || indexKeywordRules(u.rules),
    })),
  };
}

function unitHasLeaderAbility(abilities, unitRules) {
  return abilities.some((a) => a.name === 'Leader') || unitRules.some((r) => r.name === 'Leader');
}

function unitHasSupport(abilities, unitRules, keywords) {
  if (keywords.some((k) => /^support$/i.test(k))) return true;
  if (abilities.some((a) => /^support$/i.test(a.name))) return true;
  return unitRules.some((r) => /^support$/i.test(r.name));
}

function parseUnit(sel) {
  const modelCount = countModels(sel);
  const allRules = dedupeByKey(collectRulesRecursive(sel), (r) => r.id || `${r.name}::${r.description.slice(0, 80)}`);
  const abilities = dedupeByKey(collectProfileAbilities(sel, [], sel.name), (a) => `${a.name}::${a.description.slice(0, 80)}`);
  const allKeywords = collectAllKeywords(sel);
  const keywords = allKeywords.filter((c) => !c.startsWith('Faction:'));

  const armyWideRules = allRules.filter(isArmyWideRule);
  const unitRules = allRules.filter((r) => !isArmyWideRule(r));

  const statProfiles = collectUnitStatProfiles(sel);
  const charStats = pickPrimaryStats(statProfiles, sel.name);
  const stats = buildUnitStats(charStats, unitRules, abilities);

  const rangedWeapons = dedupeByKey(collectWeapons(sel, 'Ranged Weapons'), (w) =>
    `${w.name}::${w.range}::${w.a}::${w.bs}::${w.s}::${w.ap}::${w.d}`,
  );
  const meleeWeapons = dedupeByKey(collectWeapons(sel, 'Melee Weapons'), (w) =>
    `${w.name}::${w.a}::${w.ws}::${w.s}::${w.ap}::${w.d}`,
  );

  return {
    id: sel.id,
    name: sel.name,
    type: sel.type,
    points: getPoints(sel.costs),
    modelCount,
    initialModelCount: modelCount,
    woundsPerModel: parseWoundValue(stats.W),
    keywords,
    stats,
    statsLine: formatUnitStatsLine(stats),
    rangedWeapons,
    meleeWeapons,
    abilities,
    rules: unitRules,
    keywordRules: indexKeywordRules(unitRules),
    armyWideRules,
    isWarlord: (sel.selections || []).some((s) => s.name === 'Warlord'),
    isLeader: unitHasLeaderAbility(abilities, unitRules),
    isSupport: unitHasSupport(abilities, unitRules, keywords),
    isAttached: allRules.some((r) => r.name === 'Leader') || keywords.includes('Captain'),
  };
}

export function parseRosterJson(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  const roster = data.roster;
  if (!roster?.forces?.[0]) {
    throw new Error('Invalid roster file: expected roster.forces[0]');
  }

  const force = roster.forces[0];
  const units = [];
  let battleSize = '';
  let forceDisposition = '';

  for (const sel of force.selections || []) {
    if (sel.name === 'Battle Size') {
      battleSize = sel.selections?.[0]?.name || '';
    }
    if (sel.name === 'Force Disposition') {
      forceDisposition = sel.selections?.[0]?.name || '';
    }
    if (isUnitEntry(sel)) {
      units.push(parseUnit(sel));
    }
  }

  const detachments = parseDetachmentsFromForce(force);
  const detachmentName = detachments[0]?.name || '';
  const detachmentRules = detachments.flatMap((d) => d.rules);

  const forceRules = (force.rules || []).map((r) => ({
    id: r.id,
    name: r.name,
    description: cleanRuleText(r.description),
  }));

  const armyRules = dedupeByKey(
    [...forceRules, ...units.flatMap((u) => u.armyWideRules || [])],
    (r) => r.id || `${r.name}::${r.description.slice(0, 80)}`,
  );

  for (const unit of units) {
    delete unit.armyWideRules;
  }

  return {
    name: roster.name || force.name || 'Unnamed Army',
    faction: force.catalogueName || '',
    battleSize,
    detachment: detachmentName,
    detachments,
    forceDisposition,
    points: getPoints(roster.costs),
    pointsLimit: roster.costLimits?.[0]?.value ?? 0,
    units,
    armyRules,
    forceRules: armyRules,
    detachmentRules,
    raw: data,
  };
}
