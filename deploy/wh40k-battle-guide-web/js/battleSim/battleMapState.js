/**
 * Battle map helpers (no guideState imports — safe for bundle order).
 */

export const MARKER_RADIUS = {
  standard: 0.5,
  leader: 0.75,
  vehicle: 2,
};

export function createEmptyBattleMap() {
  return {
    layoutId: 'blank',
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
  if (hasKeyword(unit, /^(monster|vehicle)$/i) || role === 'vehicle' || role === 'monster') {
    return MARKER_RADIUS.vehicle;
  }
  if (role === 'leader' || role === 'support') {
    return MARKER_RADIUS.leader;
  }
  if (unitCanLeadLocal(unit) && role === 'standard') {
    // single-model characters are leader-sized
    return MARKER_RADIUS.leader;
  }
  return MARKER_RADIUS.standard;
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
      if (hasKeyword(u, /^(monster|vehicle)$/i)) role = 'vehicle';
      else if (unitCanLeadLocal(u) && (getUnitInitialCountHint(u) <= 1 || modelIndex === 0)) {
        role = unitIsSupportLocal(u) ? 'support' : 'leader';
      } else role = 'standard';
    }
    // Multi-model squads: only index 0 of a pure leader unit is leader-sized; bodyguard models stay standard
    if (!forceRole && !unitCanLeadLocal(u)) role = 'standard';
    if (!forceRole && unitCanLeadLocal(u) && modelIndex > 0) role = 'standard';

    const radiusIn = getModelMarkerRadius(u, role);
    const col = index % 4;
    const row = Math.floor(index / 4);
    models.push({
      id: `${u.id}-m${modelIndex}`,
      unitId: u.id,
      player,
      role,
      radiusIn,
      x: stagingOrigin.x + col * (radiusIn * 2 + 0.4),
      y: stagingOrigin.y + row * (radiusIn * 2 + 0.4),
    });
    index += 1;
  };

  for (let i = 0; i < remainingModels; i++) pushOne(unit, i);
  attachedLeaders.forEach((leader, i) => pushOne(leader, 0, unitIsSupportLocal(leader) ? 'support' : 'leader'));

  return models;
}
