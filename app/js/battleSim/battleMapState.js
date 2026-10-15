/**
 * Battle map helpers (no guideState imports — safe for bundle order).
 */

export const MARKER_RADIUS = {
  standard: 0.5,
  leader: 0.75,
  vehicle: 2,
};

/** Redemptor / typical dreadnought round base used as Frame size reference. */
export const DREADNOUGHT_BASE_MM = 90;
/** Frame hull footprint ≈ 1.25× dreadnought base on the short side. */
export const FRAME_SCALE = 1.25;
/** Tank-like length/width ratio for Frame rectangles. */
export const FRAME_ASPECT = 1.5;

/** Convert datasheet base diameter (mm) to map marker radius in inches. */
export function baseMmToRadiusInches(baseMm) {
  const mm = Number(baseMm);
  if (!(mm > 0)) return null;
  // Base size is diameter; marker uses radius. Clamp for clickability on the 60×44" board.
  const radius = mm / 25.4 / 2;
  return Math.max(0.28, Math.min(radius, 3));
}

export function unitIsFrame(unit) {
  return hasKeyword(unit, /^frame$/i);
}

/** Frame hull size in inches (width × length). */
export function getFrameFootprintInches() {
  const widthIn = (DREADNOUGHT_BASE_MM * FRAME_SCALE) / 25.4;
  const lengthIn = widthIn * FRAME_ASPECT;
  return { widthIn, lengthIn };
}

export function createEmptyBattleMap() {
  return {
    layoutId: 'blank',
    layoutTransform: { ops: [] },
    camera: { x: 0, y: 0, zoom: 1 },
    unitsOnMap: {},
    selectedUnitKey: null,
    selectedModelId: null,
    selectedWeapon: null,
    specialMarkers: [],
    losPreview: null,
    reminderPopup: null,
  };
}

export function mapUnitKey(player, unitId) {
  return `${player}:${unitId}`;
}

export function parseMapUnitKey(key) {
  if (!key) return null;
  const idx = key.indexOf(':');
  if (idx < 0) return null;
  return { player: key.slice(0, idx), unitId: key.slice(idx + 1) };
}

/** Match model to a unit whether ids use legacy `unitId-mN` or `player:unitId-mN`. */
export function modelBelongsToUnit(model, unitId) {
  if (!model || !unitId) return false;
  if (model.unitId === unitId) return true;
  const id = String(model.id || '');
  return id.includes(`:${unitId}-`) || id.startsWith(`${unitId}-`);
}

function hasKeyword(unit, pattern) {
  return (unit?.keywords || []).some((k) => pattern.test(k));
}

function unitIsSupportLocal(unit) {
  if (unit?.isSupport) return true;
  return hasKeyword(unit, /^support$/i);
}

function unitCanLeadLocal(unit) {
  return !!unit?.isLeader || unitIsSupportLocal(unit);
}

function getUnitInitialCountHint(unit) {
  return Math.max(1, unit?.initialModelCount || unit?.modelCount || 1);
}

export function getModelMarkerRadius(unit, role = 'standard') {
  if (unitIsFrame(unit)) {
    const { widthIn, lengthIn } = getFrameFootprintInches();
    return Math.hypot(widthIn / 2, lengthIn / 2);
  }

  const fromBase = baseMmToRadiusInches(unit?.baseMm);
  if (fromBase != null) return fromBase;

  const baseLabel = unit?.baseLabel || unit?.stats?.Base || '';
  if (/hull/i.test(baseLabel)) return MARKER_RADIUS.vehicle;

  if (hasKeyword(unit, /^(monster|vehicle)$/i) || role === 'vehicle' || role === 'monster') {
    return MARKER_RADIUS.vehicle;
  }
  if (role === 'leader' || role === 'support') {
    return MARKER_RADIUS.leader;
  }
  if (unitCanLeadLocal(unit) && role === 'standard') {
    // single-model characters are leader-sized when Base is missing
    return MARKER_RADIUS.leader;
  }
  return MARKER_RADIUS.standard;
}

/**
 * Full footprint for deploy/render: circles for normal bases, rotatable rect for Frame.
 * radiusIn is kept as an effective half-extent for range rings / LoS helpers.
 */
export function getModelFootprint(unit, role = 'standard') {
  if (unitIsFrame(unit)) {
    const { widthIn, lengthIn } = getFrameFootprintInches();
    return {
      shape: 'rect',
      widthIn,
      lengthIn,
      rotation: 0,
      radiusIn: Math.hypot(widthIn / 2, lengthIn / 2),
    };
  }
  return {
    shape: 'circle',
    widthIn: 0,
    lengthIn: 0,
    rotation: 0,
    radiusIn: getModelMarkerRadius(unit, role),
  };
}

export function getStagingOrigin(player, board) {
  const w = board?.width ?? 44;
  if (player === 'player1') return { x: -6, y: 2 };
  return { x: w + 2, y: 2 };
}

export function boardSizeForLayout(layout) {
  return {
    width: layout?.width ?? 60,
    height: layout?.height ?? 44,
  };
}

/** Build model markers for deploy. remainingModels / groupLeaders supplied by caller. */
export function buildDeployedModels(unit, player, remainingModels, stagingOrigin, attachedLeaders = []) {
  const models = [];
  let index = 0;

  const pushOne = (u, modelIndex, forceRole) => {
    let role = forceRole;
    if (!role) {
      if (unitIsFrame(u) || hasKeyword(u, /^(monster|vehicle)$/i)) role = 'vehicle';
      else if (unitCanLeadLocal(u) && (getUnitInitialCountHint(u) <= 1 || modelIndex === 0)) {
        role = unitIsSupportLocal(u) ? 'support' : 'leader';
      } else role = 'standard';
    }
    // Multi-model squads: only index 0 of a pure leader unit is leader-sized; bodyguard models stay standard
    if (!forceRole && !unitCanLeadLocal(u)) role = 'standard';
    if (!forceRole && unitCanLeadLocal(u) && modelIndex > 0) role = 'standard';

    const footprint = getModelFootprint(u, role);
    const step = Math.max(footprint.widthIn || 0, footprint.lengthIn || 0, footprint.radiusIn * 2) + 0.4;
    const col = index % 4;
    const row = Math.floor(index / 4);
    models.push({
      id: `${player}:${u.id}-m${modelIndex}`,
      unitId: u.id,
      player,
      role,
      ...footprint,
      x: stagingOrigin.x + col * step,
      y: stagingOrigin.y + row * step,
    });
    index += 1;
  };

  for (let i = 0; i < remainingModels; i++) pushOne(unit, i);

  // Multi-model leader units (e.g. Hyperadapted Raveners) place every remaining model
  attachedLeaders.forEach((leader) => {
    const n = Math.max(
      1,
      Number(leader._remainingModels) || getUnitInitialCountHint(leader),
    );
    const forceLead = unitIsSupportLocal(leader) ? 'support' : 'leader';
    for (let i = 0; i < n; i++) {
      // Only the first marker keeps the larger leader/support size
      pushOne(leader, i, i === 0 ? forceLead : undefined);
    }
  });

  return models;
}

/** Rewrite legacy model ids that omit the player prefix (same-faction id collisions). */
export function ensureUniqueModelIds(unitsOnMap) {
  if (!unitsOnMap || typeof unitsOnMap !== 'object') return unitsOnMap || {};
  let changed = false;
  const next = {};
  for (const [key, entry] of Object.entries(unitsOnMap)) {
    if (!entry || typeof entry !== 'object') {
      next[key] = entry;
      continue;
    }
    const player = entry.player;
    if (!Array.isArray(entry.models)) {
      next[key] = entry;
      continue;
    }
    const models = entry.models.map((m) => {
      if (!m || typeof m !== 'object') return m;
      const id = String(m.id || '');
      if (!player || id.startsWith(`${player}:`)) return m;
      changed = true;
      return { ...m, id: `${player}:${id}`, player: m.player || player };
    });
    next[key] = changed ? { ...entry, models } : entry;
  }
  return changed ? next : unitsOnMap;
}

/** Migrate map model ids + selectedModelId for saved / in-progress same-faction games. */
export function migrateBattleMapModelIds(battleMap) {
  if (!battleMap || typeof battleMap !== 'object') return battleMap;
  const unitsOnMap = ensureUniqueModelIds(battleMap.unitsOnMap);
  let selectedModelId = battleMap.selectedModelId;
  const parsed = parseMapUnitKey(battleMap.selectedUnitKey);
  if (
    selectedModelId &&
    parsed?.player &&
    !String(selectedModelId).startsWith('special-') &&
    !String(selectedModelId).startsWith(`${parsed.player}:`)
  ) {
    selectedModelId = `${parsed.player}:${selectedModelId}`;
  }
  if (unitsOnMap === battleMap.unitsOnMap && selectedModelId === battleMap.selectedModelId) {
    return battleMap;
  }
  return { ...battleMap, unitsOnMap, selectedModelId };
}
