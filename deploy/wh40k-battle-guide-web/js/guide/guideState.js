import { buildFullGuideFlow } from './phaseFlow.js';
import { extractArmyAbilities, injectAbilitiesIntoFlow } from './abilityMapper.js';
import { parseRosterJson, normalizeArmy, getUnitWoundsPerModel, getUnitInitialModelCount, findKeywordRule, getUnitKeywordRules } from './rosterParser.js';
import {
  createEmptyBattleMap,
  mapUnitKey,
  buildDeployedModels,
  getStagingOrigin,
  boardSizeForLayout,
  getModelMarkerRadius,
} from '../battleSim/battleMapState.js';
import { getLayoutById } from '../battleSim/layouts.js';
import { clearImportSession } from '../battleSim/layoutImport.js';
import { computeLosFromCombat } from '../battleSim/battleLos.js';

const STORAGE_KEY = 'wh40k-battle-guide-v2';

function emptyScore() {
  return { cp: 0, secondary: 0, primary: 0 };
}

function totalScore(s) {
  return s.secondary + s.primary;
}

export function createInitialGuideState() {
  return {
    player1: { name: 'Player 1', army: null, score: emptyScore() },
    player2: { name: 'Player 2', army: null, score: emptyScore() },
    firstPlayer: 'player1',
    battleReady: { player1: false, player2: false },
    deadUnits: { player1: [], player2: [] },
    unitWounds: { player1: {}, player2: {} },
    leaderAttachments: { player1: {}, player2: {} },
    woundKilledUnits: { player1: [], player2: [] },
    battleShocked: { player1: [], player2: [] },
    roundSnapshots: {},
    combat: null,
    flow: [],
    stepIndex: 0,
    completedSteps: {},
    cpAwarded: {},
    unitPhaseUsed: {},
    unitDetail: null,
    keywordRulePopup: null,
    started: false,
    viewMode: 'companion',
    battleMap: createEmptyBattleMap(),
    layoutImport: null,
  };
}

export function getDeadUnitIds(state, playerKey) {
  return new Set(state.deadUnits?.[playerKey] || []);
}

export function isUnitDead(state, playerKey, unitId) {
  return getDeadUnitIds(state, playerKey).has(unitId);
}

export function getUnitWoundsTaken(state, playerKey, unitId) {
  return state.unitWounds?.[playerKey]?.[unitId] ?? 0;
}

export function getUnitWoundCapacity(unit) {
  return getUnitWoundsPerModel(unit) * getUnitInitialModelCount(unit);
}

export function getRemainingModels(unit, woundsTaken) {
  const w = getUnitWoundsPerModel(unit);
  const initial = getUnitInitialModelCount(unit);
  const lost = Math.floor(woundsTaken / w);
  return Math.max(0, initial - lost);
}

/** Leader + bodyguard share one group when attached. Multiple leaders (e.g. Leader + Support) can attach to one bodyguard. */
export function unitIsSupport(unit) {
  if (unit?.isSupport) return true;
  if ((unit?.keywords || []).some((k) => /^support$/i.test(k))) return true;
  if ((unit?.abilities || []).some((a) => /^support$/i.test(a.name))) return true;
  return (unit?.rules || []).some((r) => /^support$/i.test(r.name));
}

export function unitCanLead(unit) {
  return !!unit?.isLeader || unitIsSupport(unit);
}

export function getLeadersOnBodyguard(leaderAttachments, bodyguardId) {
  const leaders = [];
  for (const [leaderId, attachedId] of Object.entries(leaderAttachments || {})) {
    if (attachedId === bodyguardId) leaders.push(leaderId);
  }
  return leaders;
}

export function canLeaderAttachTo(army, leaderAttachments, leaderId, bodyguardId) {
  if (!bodyguardId || !leaderId) return true;
  const leader = army?.units?.find((u) => u.id === leaderId);
  if (!leader) return false;
  if (unitIsSupport(leader)) return true;

  const otherOnBodyguard = getLeadersOnBodyguard(leaderAttachments, bodyguardId).filter((id) => id !== leaderId);
  const otherNonSupport = otherOnBodyguard.filter((id) => {
    const u = army.units.find((x) => x.id === id);
    return u && !unitIsSupport(u);
  });
  return otherNonSupport.length === 0;
}

export function getUnitGroupInfo(army, leaderAttachments, unitId) {
  const attachments = leaderAttachments || {};

  for (const [leaderId, attachedId] of Object.entries(attachments)) {
    if (attachedId === unitId && leaderId !== unitId) {
      const allLeaders = getLeadersOnBodyguard(attachments, unitId);
      return { groupId: unitId, unitIds: [unitId, ...allLeaders] };
    }
  }

  if (attachments[unitId]) {
    const bodyguardId = attachments[unitId];
    const allLeaders = getLeadersOnBodyguard(attachments, bodyguardId);
    return { groupId: bodyguardId, unitIds: [bodyguardId, ...allLeaders] };
  }

  const leadersHere = getLeadersOnBodyguard(attachments, unitId);
  if (leadersHere.length) {
    return { groupId: unitId, unitIds: [unitId, ...leadersHere] };
  }

  return { groupId: unitId, unitIds: [unitId] };
}

export function getCombatDisplayUnits(army, leaderAttachments, unitId) {
  const group = getUnitGroupInfo(army, leaderAttachments, unitId);
  return group.unitIds.map((id) => army?.units?.find((u) => u.id === id)).filter(Boolean);
}

export function isCombatActionStep(step) {
  if (!step?.player) return false;
  return step.id === `${step.player}-shoot` || step.id === `${step.player}-fight`;
}

export function getGroupStrengthStats(state, playerKey, groupInfo, army) {
  let totalInitialModels = 0;
  let totalRemainingModels = 0;
  let totalWoundCapacity = 0;
  let totalWoundsTaken = 0;
  let allDead = true;

  for (const id of groupInfo.unitIds) {
    const unit = army?.units?.find((u) => u.id === id);
    if (!unit) continue;
    const woundsTaken = getUnitWoundsTaken(state, playerKey, id);
    totalInitialModels += getUnitInitialModelCount(unit);
    totalRemainingModels += getRemainingModels(unit, woundsTaken);
    totalWoundCapacity += getUnitWoundCapacity(unit);
    totalWoundsTaken += woundsTaken;
    if (!isUnitDead(state, playerKey, id)) allDead = false;
  }

  return { totalInitialModels, totalRemainingModels, totalWoundCapacity, totalWoundsTaken, allDead };
}

export function isGroupBattleShockEligible(state, playerKey, groupInfo, army) {
  const stats = getGroupStrengthStats(state, playerKey, groupInfo, army);
  if (stats.allDead || stats.totalInitialModels <= 0) return false;

  // Single-model groups: half or fewer wounds remaining on the model
  if (stats.totalInitialModels === 1) {
    if (stats.totalWoundCapacity <= 0) return false;
    return stats.totalWoundsTaken >= stats.totalWoundCapacity / 2;
  }

  // Multi-model groups: at or below half starting model count (combined for leader + bodyguard)
  const halfStrength = Math.floor(stats.totalInitialModels / 2);
  return stats.totalRemainingModels <= halfStrength;
}

export function isGroupBattleShocked(state, playerKey, groupId) {
  return (state.battleShocked?.[playerKey] || []).includes(groupId);
}

export function groupMustTakeBattleShockTest(state, playerKey, groupInfo, army) {
  const stats = getGroupStrengthStats(state, playerKey, groupInfo, army);
  if (stats.allDead) return false;
  if (isGroupBattleShocked(state, playerKey, groupInfo.groupId)) return true;
  return isGroupBattleShockEligible(state, playerKey, groupInfo, army);
}

export function getBattleShockActivePlayer(state) {
  const step = state.flow[state.stepIndex];
  if (!step?.id?.endsWith('-cmd-shock')) return null;
  return step.player === 'p1' ? 'player1' : 'player2';
}

function reorderForLeaderAttachment(units, leaderId, attachedId) {
  if (!attachedId) return units;
  const arr = [...units];
  const leaderIdx = arr.findIndex((u) => u.id === leaderId);
  const attachIdx = arr.findIndex((u) => u.id === attachedId);
  if (leaderIdx < 0 || attachIdx < 0) return arr;
  const [attached] = arr.splice(attachIdx, 1);
  const newLeaderIdx = arr.findIndex((u) => u.id === leaderId);
  arr.splice(newLeaderIdx + 1, 0, attached);
  return arr;
}

function applyWoundDeadState(state, playerKey, unitId, woundsTaken, capacity) {
  const deadSet = new Set(state.deadUnits?.[playerKey] || []);
  const woundKilled = new Set(state.woundKilledUnits?.[playerKey] || []);

  if (woundsTaken >= capacity) {
    deadSet.add(unitId);
    woundKilled.add(unitId);
  } else if (woundKilled.has(unitId)) {
    deadSet.delete(unitId);
    woundKilled.delete(unitId);
  }

  return {
    deadUnits: { ...(state.deadUnits || { player1: [], player2: [] }), [playerKey]: [...deadSet] },
    woundKilledUnits: { ...(state.woundKilledUnits || { player1: [], player2: [] }), [playerKey]: [...woundKilled] },
  };
}

export function snapshotScoreSlice(score) {
  return {
    secondary: score.secondary,
    primary: score.primary,
    total: totalScore(score),
  };
}

function captureRoundSnapshot(state, leavingStep) {
  const snapshots = { ...(state.roundSnapshots || {}) };
  const match = leavingStep?.id?.match(/^br(\d+)-end$/);
  if (match) {
    const round = parseInt(match[1], 10);
    snapshots[round] = {
      player1: snapshotScoreSlice(state.player1.score),
      player2: snapshotScoreSlice(state.player2.score),
    };
  }
  if (leavingStep?.id === 'battle-end' && !snapshots[5]) {
    snapshots[5] = {
      player1: snapshotScoreSlice(state.player1.score),
      player2: snapshotScoreSlice(state.player2.score),
    };
  }
  return snapshots;
}

function pruneSnapshotsAfterIndex(state, stepIndex) {
  const snapshots = { ...(state.roundSnapshots || {}) };
  for (const step of state.flow) {
    const match = step.id?.match(/^br(\d+)-end$/);
    if (!match) continue;
    const idx = state.flow.findIndex((s) => s.id === step.id);
    if (idx > stepIndex) delete snapshots[parseInt(match[1], 10)];
  }
  return snapshots;
}

function navigateSteps(state, nextIndex, fromIndex) {
  const leavingStep = state.flow[fromIndex];
  let roundSnapshots = captureRoundSnapshot(state, leavingStep);
  if (nextIndex < fromIndex) {
    roundSnapshots = pruneSnapshotsAfterIndex({ ...state, roundSnapshots }, nextIndex);
  }
  return roundSnapshots;
}

export function findUnitInArmy(army, unitId) {
  return army?.units?.find((u) => u.id === unitId) || null;
}

export function getUnitPhaseKey(step) {
  if (!step?.player || !step?.phase || !step?.round) return null;
  return `${step.player}-${step.phase}-${step.round}`;
}

export function isUnitChecklistStep(step) {
  if (isCombatActionStep(step)) return false;
  return step?.player && ['movement', 'charge'].includes(step.phase);
}

function preserveStepIndex(state, flow) {
  const currentId = state.flow[state.stepIndex]?.id;
  if (!currentId) return state.stepIndex;
  const idx = flow.findIndex((s) => s.id === currentId);
  return idx >= 0 ? idx : state.stepIndex;
}

function awardCpForStepIndex(state, index) {
  const step = state.flow[index];
  if (!step?.id?.endsWith('-cmd-cp')) return state;
  const awardKey = String(index);
  if (state.cpAwarded?.[awardKey]) return state;

  return {
    ...state,
    player1: {
      ...state.player1,
      score: { ...state.player1.score, cp: state.player1.score.cp + 1 },
    },
    player2: {
      ...state.player2,
      score: { ...state.player2.score, cp: state.player2.score.cp + 1 },
    },
    cpAwarded: { ...(state.cpAwarded || {}), [awardKey]: true },
  };
}

export function rebuildFlow(state) {
  const p1Name = state.player1.army?.name || state.player1.name;
  const p2Name = state.player2.army?.name || state.player2.name;
  const firstPlayer = state.firstPlayer || 'player1';
  let flow = buildFullGuideFlow(p1Name, p2Name, firstPlayer);

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

function syncBattleMapModels(state) {
  const battleMap = state.battleMap || createEmptyBattleMap();
  const unitsOnMap = { ...battleMap.unitsOnMap };
  let attachmentsByPlayer = {
    player1: { ...(state.leaderAttachments?.player1 || {}) },
    player2: { ...(state.leaderAttachments?.player2 || {}) },
  };
  let attachmentsChanged = false;
  let changed = false;

  const detachLeadersFromBodyguard = (player, bodyguardId) => {
    const attachments = attachmentsByPlayer[player] || {};
    let localChanged = false;
    for (const [leaderId, attachedId] of Object.entries(attachments)) {
      if (attachedId === bodyguardId) {
        delete attachments[leaderId];
        localChanged = true;
      }
    }
    if (localChanged) {
      attachmentsByPlayer = { ...attachmentsByPlayer, [player]: attachments };
      attachmentsChanged = true;
    }
  };

  const promoteSurvivingLeaders = (entry, bodyguardId) => {
    const army = state[entry.player]?.army;
    const byLeader = new Map();
    for (const m of entry.models || []) {
      const uid = m.unitId || bodyguardId;
      if (uid === bodyguardId) continue;
      const unit = army?.units?.find((u) => u.id === uid);
      if (!unit || isUnitDead(state, entry.player, uid)) continue;
      if (!byLeader.has(uid)) byLeader.set(uid, []);
      byLeader.get(uid).push({ ...m, unitId: uid });
    }

    for (const [leaderId, leaderModels] of byLeader.entries()) {
      const leaderKey = mapUnitKey(entry.player, leaderId);
      const existing = unitsOnMap[leaderKey];
      unitsOnMap[leaderKey] = {
        player: entry.player,
        unitId: leaderId,
        models: existing?.models?.length
          ? [...existing.models, ...leaderModels.filter((m) => !(existing.models || []).some((e) => e.id === m.id))]
          : leaderModels,
      };
      changed = true;
    }
    detachLeadersFromBodyguard(entry.player, bodyguardId);
  };

  for (const [key, entry] of Object.entries(unitsOnMap)) {
    const army = state[entry.player]?.army;
    const bodyguard = army?.units?.find((u) => u.id === entry.unitId);
    if (!bodyguard || isUnitDead(state, entry.player, entry.unitId)) {
      // Bodyguard is gone — keep living attached leaders as their own map entries
      promoteSurvivingLeaders(entry, entry.unitId);
      delete unitsOnMap[key];
      changed = true;
      continue;
    }

    let models = [...(entry.models || [])];
    let entryChanged = false;
    const unitIds = [
      ...new Set([entry.unitId, ...models.map((m) => m.unitId).filter(Boolean)]),
    ];

    for (const uid of unitIds) {
      const unit = army.units.find((u) => u.id === uid);
      const isOwn = (m) => (m.unitId || entry.unitId) === uid;
      const own = () => models.filter(isOwn);
      const others = () => models.filter((m) => !isOwn(m));

      // Remove attached leader/support models if that unit is dead or missing
      if (!unit || (uid !== entry.unitId && isUnitDead(state, entry.player, uid))) {
        if (own().length) {
          models = others();
          entryChanged = true;
        }
        if (uid !== entry.unitId) {
          const attachments = attachmentsByPlayer[entry.player] || {};
          if (attachments[uid] === entry.unitId) {
            delete attachments[uid];
            attachmentsByPlayer = { ...attachmentsByPlayer, [entry.player]: attachments };
            attachmentsChanged = true;
          }
        }
        continue;
      }

      const remaining = getRemainingModels(unit, getUnitWoundsTaken(state, entry.player, uid));
      const mine = own();

      if (mine.length > remaining) {
        models = [...mine.slice(0, remaining), ...others()];
        entryChanged = true;
        continue;
      }

      if (mine.length < remaining) {
        const anchor = mine[mine.length - 1] || others()[0];
        const role = mine[0]?.role || 'standard';
        const radiusIn = getModelMarkerRadius(unit, role);
        const layout = getLayoutById(battleMap.layoutId);
        const board = boardSizeForLayout(layout);
        const staging = getStagingOrigin(entry.player, board);
        const ax = anchor?.x ?? staging.x;
        const ay = anchor?.y ?? staging.y;
        const step = (anchor?.radiusIn || radiusIn) * 2 + 0.4;
        const added = [];
        for (let i = mine.length; i < remaining; i++) {
          const n = i - mine.length + 1;
          const angle = n * 1.2;
          added.push({
            id: `${uid}-m${i}`,
            unitId: uid,
            player: entry.player,
            role,
            radiusIn,
            x: ax + Math.cos(angle) * step,
            y: ay + Math.sin(angle) * step,
          });
        }
        models = [...mine, ...added, ...others()];
        entryChanged = true;
      }
    }

    if (entryChanged) {
      unitsOnMap[key] = { ...entry, models };
      changed = true;
    }
  }

  if (!changed && !attachmentsChanged) return state;
  const selectedGone = battleMap.selectedUnitKey && !unitsOnMap[battleMap.selectedUnitKey];
  return {
    ...state,
    leaderAttachments: attachmentsChanged
      ? {
          ...(state.leaderAttachments || { player1: {}, player2: {} }),
          player1: attachmentsByPlayer.player1,
          player2: attachmentsByPlayer.player2,
        }
      : state.leaderAttachments,
    battleMap: {
      ...battleMap,
      unitsOnMap,
      selectedUnitKey: selectedGone ? null : battleMap.selectedUnitKey,
      selectedModelId: selectedGone ? null : battleMap.selectedModelId,
    },
  };
}

function clearPlayerArmyExtras(state, playerKey) {
  const battleReady = { ...(state.battleReady || { player1: false, player2: false }), [playerKey]: false };
  const deadUnits = { ...(state.deadUnits || { player1: [], player2: [] }), [playerKey]: [] };
  const unitWounds = { ...(state.unitWounds || { player1: {}, player2: {} }), [playerKey]: {} };
  const leaderAttachments = { ...(state.leaderAttachments || { player1: {}, player2: {} }), [playerKey]: {} };
  const woundKilledUnits = { ...(state.woundKilledUnits || { player1: [], player2: [] }), [playerKey]: [] };
  const battleShocked = { ...(state.battleShocked || { player1: [], player2: [] }), [playerKey]: [] };
  let score = state[playerKey].score;
  if (state.battleReady?.[playerKey]) {
    score = { ...score, primary: Math.max(0, score.primary - 10) };
  }
  return { battleReady, deadUnits, unitWounds, leaderAttachments, woundKilledUnits, battleShocked, score };
}

export function guideReducer(state, action) {
  switch (action.type) {
    case 'LOAD_ARMY': {
      const army = normalizeArmy(parseRosterJson(action.json));
      const key = action.player;
      const extras = clearPlayerArmyExtras(state, key);
      const next = {
        ...state,
        battleReady: extras.battleReady,
        deadUnits: extras.deadUnits,
        unitWounds: extras.unitWounds,
        leaderAttachments: extras.leaderAttachments,
        woundKilledUnits: extras.woundKilledUnits,
        battleShocked: extras.battleShocked,
        [key]: {
          ...state[key],
          army,
          name: army.name,
          score: extras.score,
        },
      };
      const flow = rebuildFlow(next);
      const battleMap = next.battleMap || createEmptyBattleMap();
      const unitsOnMap = { ...battleMap.unitsOnMap };
      for (const k of Object.keys(unitsOnMap)) {
        if (k.startsWith(`${key}:`)) delete unitsOnMap[k];
      }
      return {
        ...next,
        flow,
        stepIndex: preserveStepIndex(state, flow),
        battleMap: { ...battleMap, unitsOnMap, losPreview: null },
      };
    }

    case 'CLEAR_ARMY': {
      const extras = clearPlayerArmyExtras(state, action.player);
      const next = {
        ...state,
        battleReady: extras.battleReady,
        deadUnits: extras.deadUnits,
        unitWounds: extras.unitWounds,
        leaderAttachments: extras.leaderAttachments,
        woundKilledUnits: extras.woundKilledUnits,
        battleShocked: extras.battleShocked,
        [action.player]: {
          ...state[action.player],
          army: null,
          name: action.player === 'player1' ? 'Player 1' : 'Player 2',
          score: extras.score,
        },
      };
      const flow = rebuildFlow(next);
      const battleMap = next.battleMap || createEmptyBattleMap();
      const unitsOnMap = { ...battleMap.unitsOnMap };
      for (const k of Object.keys(unitsOnMap)) {
        if (k.startsWith(`${action.player}:`)) delete unitsOnMap[k];
      }
      return {
        ...next,
        flow,
        stepIndex: preserveStepIndex(state, flow),
        battleMap: { ...battleMap, unitsOnMap, losPreview: null },
      };
    }

    case 'SET_PLAYER_NAME': {
      const next = { ...state, [action.player]: { ...state[action.player], name: action.value } };
      const flow = rebuildFlow(next);
      return { ...next, flow, stepIndex: preserveStepIndex(state, flow) };
    }

    case 'SET_FIRST_PLAYER': {
      if (action.player !== 'player1' && action.player !== 'player2') return state;
      const next = { ...state, firstPlayer: action.player };
      const flow = rebuildFlow(next);
      return { ...next, flow, stepIndex: preserveStepIndex(state, flow), cpAwarded: {} };
    }

    case 'START_GAME': {
      const flow = rebuildFlow(state);
      let next = {
        ...state,
        flow,
        started: true,
        stepIndex: 0,
        completedSteps: {},
        cpAwarded: {},
        unitPhaseUsed: {},
        roundSnapshots: {},
      };
      next = awardCpForStepIndex(next, 0);
      return next;
    }

    case 'NEXT_STEP': {
      const step = state.flow[state.stepIndex];
      const completed = { ...state.completedSteps, [step?.id]: true };
      const nextIndex = Math.min(state.stepIndex + 1, state.flow.length - 1);
      const roundSnapshots = navigateSteps(state, nextIndex, state.stepIndex);
      let next = { ...state, stepIndex: nextIndex, completedSteps: completed, roundSnapshots, combat: null };
      next = awardCpForStepIndex(next, nextIndex);
      return next;
    }

    case 'PREV_STEP': {
      const prevIndex = Math.max(0, state.stepIndex - 1);
      const roundSnapshots = navigateSteps(state, prevIndex, state.stepIndex);
      let next = { ...state, stepIndex: prevIndex, roundSnapshots, combat: null };
      next = awardCpForStepIndex(next, prevIndex);
      return next;
    }

    case 'GOTO_STEP': {
      const gotoIndex = Math.max(0, Math.min(action.index, state.flow.length - 1));
      const roundSnapshots = navigateSteps(state, gotoIndex, state.stepIndex);
      let next = { ...state, stepIndex: gotoIndex, roundSnapshots, combat: null };
      next = awardCpForStepIndex(next, gotoIndex);
      return next;
    }

    case 'ADJUST_SCORE': {
      const { player, field, delta } = action;
      const score = { ...state[player].score };
      score[field] = Math.max(0, score[field] + delta);
      return { ...state, [player]: { ...state[player], score } };
    }

    case 'TOGGLE_BATTLE_READY': {
      const { player } = action;
      if (player !== 'player1' && player !== 'player2') return state;
      const wasReady = !!state.battleReady?.[player];
      const nextReady = !wasReady;
      const score = { ...state[player].score };
      if (nextReady) score.primary += 10;
      else score.primary = Math.max(0, score.primary - 10);
      return {
        ...state,
        battleReady: { ...(state.battleReady || { player1: false, player2: false }), [player]: nextReady },
        [player]: { ...state[player], score },
      };
    }

    case 'REORDER_UNIT': {
      const { player, unitId, direction } = action;
      const army = state[player]?.army;
      if (!army?.units?.length || !unitId) return state;
      const units = [...army.units];
      const idx = units.findIndex((u) => u.id === unitId);
      if (idx < 0) return state;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= units.length) return state;
      [units[idx], units[swapIdx]] = [units[swapIdx], units[idx]];
      return {
        ...state,
        [player]: { ...state[player], army: { ...army, units } },
      };
    }

    case 'SET_LEADER_ATTACHMENT': {
      const { player, leaderId, attachedUnitId } = action;
      const army = state[player]?.army;
      if (!army || !leaderId) return state;

      const attachments = { ...(state.leaderAttachments?.[player] || {}) };
      if (attachedUnitId) {
        if (!canLeaderAttachTo(army, attachments, leaderId, attachedUnitId)) return state;
        attachments[leaderId] = attachedUnitId;
      } else {
        delete attachments[leaderId];
      }

      let units = [...army.units];
      if (attachedUnitId) units = reorderForLeaderAttachment(units, leaderId, attachedUnitId);

      return {
        ...state,
        leaderAttachments: { ...(state.leaderAttachments || { player1: {}, player2: {} }), [player]: attachments },
        [player]: { ...state[player], army: { ...army, units } },
      };
    }

    case 'COMBAT_SELECT_ACTIVE': {
      const step = state.flow[state.stepIndex];
      if (!isCombatActionStep(step)) return state;
      const player = step.player === 'p1' ? 'player1' : 'player2';
      const unitId = action.unitId;
      if (!unitId) return state;
      const wasActive = state.combat?.active?.unitId;
      const nextActive = wasActive === unitId ? null : unitId;
      const target = nextActive && wasActive === nextActive ? state.combat?.target : null;
      return {
        ...state,
        combat: {
          active: nextActive ? { player, unitId: nextActive } : null,
          target: target || null,
        },
      };
    }

    case 'COMBAT_SELECT_TARGET': {
      const step = state.flow[state.stepIndex];
      if (!isCombatActionStep(step)) return state;
      const activePlayer = step.player === 'p1' ? 'player1' : 'player2';
      const enemyPlayer = activePlayer === 'player1' ? 'player2' : 'player1';
      const unitId = action.unitId;
      if (!unitId) return state;
      const current = state.combat?.target?.unitId;
      const nextTarget = current === unitId ? null : unitId;
      return {
        ...state,
        combat: {
          active: state.combat?.active || null,
          target: nextTarget ? { player: enemyPlayer, unitId: nextTarget } : null,
        },
      };
    }

    case 'ADJUST_UNIT_WOUNDS': {
      const { player, unitId, delta } = action;
      const unit = findUnitInArmy(state[player]?.army, unitId);
      if (!unit) return state;

      const capacity = getUnitWoundCapacity(unit);
      const current = getUnitWoundsTaken(state, player, unitId);
      const nextWounds = Math.max(0, Math.min(capacity, current + delta));
      const woundDead = applyWoundDeadState(state, player, unitId, nextWounds, capacity);

      let next = {
        ...state,
        unitWounds: {
          ...(state.unitWounds || { player1: {}, player2: {} }),
          [player]: { ...(state.unitWounds?.[player] || {}), [unitId]: nextWounds },
        },
        deadUnits: woundDead.deadUnits,
        woundKilledUnits: woundDead.woundKilledUnits,
      };
      return syncBattleMapModels(next);
    }

    case 'TOGGLE_BATTLE_SHOCK': {
      const { player, groupId } = action;
      if (!player || !groupId) return state;
      const current = new Set(state.battleShocked?.[player] || []);
      if (current.has(groupId)) current.delete(groupId);
      else current.add(groupId);
      return {
        ...state,
        battleShocked: { ...(state.battleShocked || { player1: [], player2: [] }), [player]: [...current] },
      };
    }

    case 'TOGGLE_UNIT_DEAD': {
      const { player, unitId } = action;
      if (!player || !unitId) return state;
      const current = new Set(state.deadUnits?.[player] || []);
      const woundKilled = new Set(state.woundKilledUnits?.[player] || []);
      if (current.has(unitId)) {
        current.delete(unitId);
        woundKilled.delete(unitId);
      } else {
        current.add(unitId);
      }
      return syncBattleMapModels({
        ...state,
        deadUnits: { ...(state.deadUnits || { player1: [], player2: [] }), [player]: [...current] },
        woundKilledUnits: { ...(state.woundKilledUnits || { player1: [], player2: [] }), [player]: [...woundKilled] },
      });
    }

    case 'TOGGLE_UNIT_USED': {
      const step = state.flow[state.stepIndex];
      const phaseKey = getUnitPhaseKey(step);
      if (!phaseKey || !action.unitId) return state;
      const used = new Set(state.unitPhaseUsed?.[phaseKey] || []);
      if (used.has(action.unitId)) used.delete(action.unitId);
      else used.add(action.unitId);
      return {
        ...state,
        unitPhaseUsed: { ...(state.unitPhaseUsed || {}), [phaseKey]: [...used] },
      };
    }

    case 'OPEN_UNIT_DETAIL': {
      if (!action.player || !action.unitId) return state;
      return { ...state, unitDetail: { player: action.player, unitId: action.unitId }, keywordRulePopup: null };
    }

    case 'CLOSE_UNIT_DETAIL':
      return { ...state, unitDetail: null, keywordRulePopup: null };

    case 'SHOW_KEYWORD_RULE': {
      const { player, unitId, ruleName } = action;
      if (!player || !unitId || !ruleName) return state;
      const unit = findUnitInArmy(state[player]?.army, unitId);
      if (!unit) return state;
      const rule = findKeywordRule(ruleName, getUnitKeywordRules(unit));
      if (!rule) return state;
      return { ...state, keywordRulePopup: { name: rule.name, description: rule.description } };
    }

    case 'CLOSE_KEYWORD_RULE':
      return { ...state, keywordRulePopup: null };

    case 'SET_VIEW_MODE': {
      const mode = action.mode === 'battleSim' ? 'battleSim' : 'companion';
      return { ...state, viewMode: mode };
    }

    case 'SET_MAP_LAYOUT': {
      const layout = getLayoutById(action.layoutId);
      const battleMap = {
        ...(state.battleMap || createEmptyBattleMap()),
        layoutId: layout.id,
        camera: { x: 0, y: 0, zoom: 1 },
        losPreview: null,
      };
      return { ...state, battleMap };
    }

    case 'OPEN_LAYOUT_IMPORT':
      clearImportSession();
      return {
        ...state,
        layoutImport: {
          open: true,
          riList: [],
          selectedRiId: '',
          title: '',
          error: null,
          status: null,
        },
      };

    case 'CLOSE_LAYOUT_IMPORT':
      clearImportSession();
      return { ...state, layoutImport: null };

    case 'LAYOUT_IMPORT_PARSED':
      return {
        ...state,
        layoutImport: {
          open: true,
          riList: action.riList || [],
          selectedRiId: action.selectedRiId || '',
          title: action.title || '',
          error: action.error || null,
          status: action.status || null,
        },
      };

    case 'CUSTOM_LAYOUT_DELETED': {
      const battleMap = state.battleMap || createEmptyBattleMap();
      const nextId = action.nextLayoutId || battleMap.layoutId;
      const layout = getLayoutById(nextId);
      return {
        ...state,
        battleMap: {
          ...battleMap,
          layoutId: layout.id,
          ...(battleMap.layoutId !== layout.id
            ? { camera: { x: 0, y: 0, zoom: 1 }, losPreview: null }
            : {}),
        },
        layoutImport: state.layoutImport?.open
          ? { ...state.layoutImport, status: 'Removed imported layout.' }
          : state.layoutImport,
      };
    }

    case 'MAP_ZOOM': {
      const battleMap = state.battleMap || createEmptyBattleMap();
      const zoom = Math.min(3, Math.max(0.35, (battleMap.camera?.zoom || 1) + (action.delta || 0)));
      return { ...state, battleMap: { ...battleMap, camera: { ...battleMap.camera, zoom } } };
    }

    case 'MAP_SET_CAMERA': {
      const battleMap = state.battleMap || createEmptyBattleMap();
      return { ...state, battleMap: { ...battleMap, camera: { ...battleMap.camera, ...(action.camera || {}) } } };
    }

    case 'MAP_RESET_CAMERA': {
      const battleMap = state.battleMap || createEmptyBattleMap();
      return { ...state, battleMap: { ...battleMap, camera: { x: 0, y: 0, zoom: 1 } } };
    }

    case 'MAP_DEPLOY_UNIT': {
      const { player, unitId } = action;
      const army = state[player]?.army;
      const unit = army?.units?.find((u) => u.id === unitId);
      if (!unit || isUnitDead(state, player, unitId)) return state;

      const attachments = state.leaderAttachments?.[player] || {};
      const group = getUnitGroupInfo(army, attachments, unitId);
      const bodyguardId = group.groupId;
      const bodyguard = army.units.find((u) => u.id === bodyguardId);
      if (!bodyguard || isUnitDead(state, player, bodyguardId)) return state;

      const key = mapUnitKey(player, bodyguardId);
      const battleMap = state.battleMap || createEmptyBattleMap();
      if (battleMap.unitsOnMap?.[key]) return state;

      const layout = getLayoutById(battleMap.layoutId);
      const board = boardSizeForLayout(layout);
      const staging = getStagingOrigin(player, board);
      const remaining = getRemainingModels(bodyguard, getUnitWoundsTaken(state, player, bodyguardId));
      const attachedLeaders = group.unitIds
        .filter((id) => id !== bodyguardId)
        .map((id) => army.units.find((u) => u.id === id))
        .filter((u) => u && !isUnitDead(state, player, u.id));

      const models = buildDeployedModels(bodyguard, player, remaining, staging, attachedLeaders);
      const preferredModel =
        models.find((m) => String(m.id).startsWith(`${unitId}-`)) || models[0] || null;
      return {
        ...state,
        battleMap: {
          ...battleMap,
          unitsOnMap: {
            ...battleMap.unitsOnMap,
            [key]: { player, unitId: bodyguardId, models },
          },
          selectedUnitKey: key,
          selectedModelId: preferredModel?.id || null,
          selectedWeapon: null,
        },
      };
    }

    case 'MAP_WITHDRAW_UNIT': {
      const { player, unitId } = action;
      const army = state[player]?.army;
      const attachments = state.leaderAttachments?.[player] || {};
      const group = getUnitGroupInfo(army, attachments, unitId);
      const key = mapUnitKey(player, group.groupId);
      const battleMap = state.battleMap || createEmptyBattleMap();
      const unitsOnMap = { ...battleMap.unitsOnMap };
      delete unitsOnMap[key];
      return {
        ...state,
        battleMap: {
          ...battleMap,
          unitsOnMap,
          selectedUnitKey: battleMap.selectedUnitKey === key ? null : battleMap.selectedUnitKey,
          selectedModelId: battleMap.selectedUnitKey === key ? null : battleMap.selectedModelId,
          selectedWeapon: battleMap.selectedUnitKey === key ? null : battleMap.selectedWeapon,
          losPreview: null,
        },
      };
    }

    case 'MAP_SELECT_UNIT': {
      const { player, unitId } = action;
      const army = state[player]?.army;
      const attachments = state.leaderAttachments?.[player] || {};
      const group = getUnitGroupInfo(army, attachments, unitId);
      const key = mapUnitKey(player, group.groupId);
      const battleMap = state.battleMap || createEmptyBattleMap();
      const entry = battleMap.unitsOnMap?.[key];
      let modelId = action.modelId || null;
      if (!modelId && entry?.models?.length) {
        modelId =
          entry.models.find((m) => String(m.id).startsWith(`${unitId}-`))?.id ||
          entry.models[0]?.id ||
          null;
      }

      const step = state.flow[state.stepIndex];
      const isCombat = isCombatActionStep(step) && entry;
      const stepPlayer = step?.player === 'p1' ? 'player1' : 'player2';
      const combat = isCombat
        ? {
            active:
              stepPlayer === player
                ? { player, unitId: group.groupId }
                : state.combat?.active || null,
            target:
              stepPlayer !== player
                ? { player, unitId: group.groupId }
                : state.combat?.target || null,
          }
        : state.combat;

      // Keep shooter's weapon-range pick when clicking enemies as targets (shoot/fight)
      const selectingTarget = isCombat && stepPlayer !== player;
      const sameUnitReselect = entry && battleMap.selectedUnitKey === key;
      const selectedWeapon = selectingTarget
        ? battleMap.selectedWeapon
        : sameUnitReselect
          ? battleMap.selectedWeapon
          : null;

      const next = {
        ...state,
        battleMap: {
          ...battleMap,
          selectedUnitKey: entry ? key : null,
          selectedModelId: entry ? modelId : null,
          selectedWeapon,
          losPreview: null,
        },
        combat,
      };

      const isShoot =
        step && (step.phase === 'shooting' || String(step.id || '').includes('-shoot'));
      if (isShoot && combat?.active && combat?.target) {
        const los = computeLosFromCombat(next);
        if (los) {
          next.battleMap = { ...next.battleMap, losPreview: los };
        }
      }
      return next;
    }

    case 'MAP_CLEAR_SELECTION': {
      const battleMap = state.battleMap || createEmptyBattleMap();
      return {
        ...state,
        battleMap: {
          ...battleMap,
          selectedUnitKey: null,
          selectedModelId: null,
          selectedWeapon: null,
          losPreview: null,
        },
      };
    }

    case 'MAP_SELECT_WEAPON': {
      const battleMap = state.battleMap || createEmptyBattleMap();
      const next =
        action.weaponIndex == null
          ? null
          : {
              unitId: action.unitId,
              weaponIndex: Number(action.weaponIndex),
            };
      // Toggle off if same weapon clicked again
      const cur = battleMap.selectedWeapon;
      const same =
        cur &&
        next &&
        cur.unitId === next.unitId &&
        cur.weaponIndex === next.weaponIndex;
      return {
        ...state,
        battleMap: {
          ...battleMap,
          selectedWeapon: same ? null : next,
        },
      };
    }

    case 'MAP_MOVE_MODELS': {
      const battleMap = state.battleMap || createEmptyBattleMap();
      const entry = battleMap.unitsOnMap?.[action.unitKey];
      if (!entry) return state;
      const moveMap = new Map((action.moves || []).map((m) => [m.id, m]));
      const models = entry.models.map((m) => {
        const next = moveMap.get(m.id);
        return next ? { ...m, x: next.x, y: next.y } : m;
      });
      const next = {
        ...state,
        battleMap: {
          ...battleMap,
          unitsOnMap: { ...battleMap.unitsOnMap, [action.unitKey]: { ...entry, models } },
        },
      };
      const step = state.flow[state.stepIndex];
      const isShoot =
        step && (step.phase === 'shooting' || String(step.id || '').includes('-shoot'));
      if (isShoot && state.combat?.active && state.combat?.target) {
        const los = computeLosFromCombat(next);
        next.battleMap = { ...next.battleMap, losPreview: los };
      }
      return next;
    }

    case 'MAP_SET_LOS':
      return {
        ...state,
        battleMap: { ...(state.battleMap || createEmptyBattleMap()), losPreview: action.los || null },
      };

    case 'MAP_ADD_SPECIAL_MARKER': {
      const battleMap = state.battleMap || createEmptyBattleMap();
      const layout = getLayoutById(battleMap.layoutId);
      const board = boardSizeForLayout(layout);
      const id = `special-${Date.now()}`;
      const marker = {
        id,
        name: action.name || 'Marker',
        x: board.width / 2,
        y: board.height / 2,
        radiusIn: 0.5,
      };
      return {
        ...state,
        battleMap: {
          ...battleMap,
          specialMarkers: [...(battleMap.specialMarkers || []), marker],
          selectedUnitKey: null,
          selectedModelId: id,
        },
      };
    }

    case 'MAP_SELECT_SPECIAL': {
      const battleMap = state.battleMap || createEmptyBattleMap();
      const id = action.id;
      if (!(battleMap.specialMarkers || []).some((m) => m.id === id)) return state;
      return {
        ...state,
        battleMap: {
          ...battleMap,
          selectedUnitKey: null,
          selectedModelId: id,
        },
      };
    }

    case 'MAP_MOVE_SPECIAL': {
      const battleMap = state.battleMap || createEmptyBattleMap();
      const specialMarkers = (battleMap.specialMarkers || []).map((m) =>
        m.id === action.id ? { ...m, x: action.x, y: action.y } : m,
      );
      return { ...state, battleMap: { ...battleMap, specialMarkers } };
    }

    case 'MAP_REMOVE_SPECIAL_MARKER': {
      const battleMap = state.battleMap || createEmptyBattleMap();
      const id = action.id;
      const specialMarkers = (battleMap.specialMarkers || []).filter((m) => m.id !== id);
      return {
        ...state,
        battleMap: {
          ...battleMap,
          specialMarkers,
          selectedModelId: battleMap.selectedModelId === id ? null : battleMap.selectedModelId,
        },
      };
    }

    case 'SHOW_REMINDER': {
      const battleMap = state.battleMap || createEmptyBattleMap();
      return {
        ...state,
        battleMap: {
          ...battleMap,
          reminderPopup: {
            name: action.name,
            description: action.description,
            unitName: action.unitName,
          },
        },
      };
    }

    case 'CLOSE_REMINDER': {
      const battleMap = state.battleMap || createEmptyBattleMap();
      return { ...state, battleMap: { ...battleMap, reminderPopup: null } };
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
          firstPlayer: saved.firstPlayer === 'player2' ? 'player2' : 'player1',
          stepIndex: typeof saved.stepIndex === 'number' ? saved.stepIndex : 0,
          completedSteps: saved.completedSteps || {},
          cpAwarded: saved.cpAwarded || {},
          unitPhaseUsed: saved.unitPhaseUsed || {},
          battleReady: {
            player1: !!saved.battleReady?.player1,
            player2: !!saved.battleReady?.player2,
          },
          deadUnits: {
            player1: Array.isArray(saved.deadUnits?.player1) ? saved.deadUnits.player1 : [],
            player2: Array.isArray(saved.deadUnits?.player2) ? saved.deadUnits.player2 : [],
          },
          unitWounds: {
            player1: saved.unitWounds?.player1 && typeof saved.unitWounds.player1 === 'object' ? saved.unitWounds.player1 : {},
            player2: saved.unitWounds?.player2 && typeof saved.unitWounds.player2 === 'object' ? saved.unitWounds.player2 : {},
          },
          leaderAttachments: {
            player1: saved.leaderAttachments?.player1 && typeof saved.leaderAttachments.player1 === 'object' ? saved.leaderAttachments.player1 : {},
            player2: saved.leaderAttachments?.player2 && typeof saved.leaderAttachments.player2 === 'object' ? saved.leaderAttachments.player2 : {},
          },
          woundKilledUnits: {
            player1: Array.isArray(saved.woundKilledUnits?.player1) ? saved.woundKilledUnits.player1 : [],
            player2: Array.isArray(saved.woundKilledUnits?.player2) ? saved.woundKilledUnits.player2 : [],
          },
          battleShocked: {
            player1: Array.isArray(saved.battleShocked?.player1) ? saved.battleShocked.player1 : [],
            player2: Array.isArray(saved.battleShocked?.player2) ? saved.battleShocked.player2 : [],
          },
          roundSnapshots:
            saved.roundSnapshots && typeof saved.roundSnapshots === 'object' ? saved.roundSnapshots : {},
          combat: saved.combat && typeof saved.combat === 'object' ? saved.combat : null,
          started: !!saved.started,
          viewMode: saved.viewMode === 'battleSim' ? 'battleSim' : 'companion',
          battleMap:
            saved.battleMap && typeof saved.battleMap === 'object'
              ? {
                  ...createEmptyBattleMap(),
                  ...saved.battleMap,
                  layoutId: getLayoutById(saved.battleMap.layoutId).id,
                }
              : createEmptyBattleMap(),
        };
        merged.player1.army = normalizeArmy(merged.player1.army);
        merged.player2.army = normalizeArmy(merged.player2.army);
        merged.flow = rebuildFlow(merged);
        if (saved.currentStepId) {
          const idx = merged.flow.findIndex((s) => s.id === saved.currentStepId);
          if (idx >= 0) merged.stepIndex = idx;
        }
        return merged;
      } catch (_) {
        return state;
      }
    }

    case 'SAVE':
      try {
        const toSave = {
          ...state,
          player1: { ...state.player1, army: normalizeArmy(state.player1.army) },
          player2: { ...state.player2, army: normalizeArmy(state.player2.army) },
          flow: [],
          unitDetail: null,
          currentStepId: state.flow[state.stepIndex]?.id || null,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
      } catch (_) {}
      return state;

    default:
      return state;
  }
}

export function getCurrentStep(state) {
  return state.flow[state.stepIndex] || null;
}

export function getProgress(state) {
  if (!state.flow.length) return 0;
  return Math.round((state.stepIndex / (state.flow.length - 1)) * 100);
}

export { totalScore };
