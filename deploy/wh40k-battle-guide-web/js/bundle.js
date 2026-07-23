/* WH40k Battle Guide - bundled for offline use */
(function () {
'use strict';

/* --- constants.js --- */
const BATTLEFIELD_WIDTH = 60;
const BATTLEFIELD_HEIGHT = 44;
const PIXELS_PER_INCH = 10;
const ENGAGEMENT_RANGE = 2;
const COHERENCY_CLOSE = 2;
const COHERENCY_MAX = 9;
const CHARGE_DECLARE_RANGE = 12;
const HIDDEN_DETECTION_RANGE = 15;

const PHASE_LABELS = {
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

const TURN_PHASES = [
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

/* --- geometry.js --- */
function distance(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function distanceBetweenModels(a, b) {
  return Math.max(0, distance(a.position, b.position) - a.baseRadius - b.baseRadius);
}

function isWithinEngagementRange(a, b) {
  return distanceBetweenModels(a, b) <= ENGAGEMENT_RANGE;
}

function unitIsEngaged(unit, enemyUnits) {
  return enemyUnits.some((enemy) =>
    unit.models.some((m) => enemy.models.some((em) => isWithinEngagementRange(m, em))),
  );
}

function unitIsUnengaged(unit, enemyUnits) {
  return !unitIsEngaged(unit, enemyUnits);
}

function isInCoherency(models) {
  if (models.length <= 1) return true;
  for (const model of models) {
    const others = models.filter((m) => m.id !== model.id);
    const hasClose = others.some((o) => distanceBetweenModels(model, o) <= COHERENCY_CLOSE);
    if (!hasClose) return false;
    const allWithinMax = others.every((o) => distanceBetweenModels(model, o) <= COHERENCY_MAX);
    if (!allWithinMax) return false;
  }
  return true;
}

function pointInRect(point, rect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.w &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.h
  );
}

/** Ray-cast point-in-polygon. polygon = [{x,y}, ...] */
function pointInPolygon(point, polygon) {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInArea(point, area) {
  if (!area) return false;
  if (area.polygon?.length >= 3) return pointInPolygon(point, area.polygon);
  if (area.bounds) return pointInRect(point, area.bounds);
  return false;
}

function modelInTerrainArea(model, area) {
  return pointInArea(model.position, area);
}

function crossesRect(p1, p2, rect) {
  const samples = 20;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
    if (pointInRect(p, rect)) return true;
  }
  return false;
}

function crossesPolygon(p1, p2, polygon) {
  if (!polygon || polygon.length < 3) return false;
  const samples = 28;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
    if (pointInPolygon(p, polygon)) return true;
  }
  return false;
}

function lineIntersectsSolidFeature(p1, p2, feature) {
  if (!feature?.solid && feature?.color !== 'green') return false;
  if (feature.solid === false) return false;
  // Battle Sim: green/solid features block through full footprint
  if (feature.color === 'green' || feature.solid) {
    if (feature.polygon?.length >= 3) return crossesPolygon(p1, p2, feature.polygon);
    return crossesRect(p1, p2, feature.bounds);
  }
  if (feature.category !== 'dense') return false;
  if (feature.polygon?.length >= 3) return crossesPolygon(p1, p2, feature.polygon);
  const groundGap = {
    x: feature.bounds.x,
    y: feature.bounds.y,
    w: feature.bounds.w,
    h: Math.min(3, feature.bounds.h),
  };
  return crossesRect(p1, p2, groundGap);
}

function unitAtHalfStrength(unit) {
  const alive = unit.models.filter((m) => m.woundsRemaining > 0).length;
  return alive <= Math.ceil(unit.startingModelCount / 2);
}

function isWithinBounds(point, radius) {
  return (
    point.x - radius >= 0 &&
    point.x + radius <= BATTLEFIELD_WIDTH &&
    point.y - radius >= 0 &&
    point.y + radius <= BATTLEFIELD_HEIGHT
  );
}

/* --- los.js --- */
function isInfantryLike(model) {
  return model.keywords.some((k) => ['INFANTRY', 'BEASTS', 'SWARM'].includes(k));
}

function modelInDenseArea(model, areas) {
  return areas.some((a) => a.category === 'dense' && modelInTerrainArea(model, a));
}

function isHidden(model, unit, areas) {
  if (!isInfantryLike(model)) return false;
  if (!modelInDenseArea(model, areas)) return false;
  if (unit.shotThisTurn) return false;
  return true;
}

function hasLineOfSight(
  observer,
  target,
  observerUnit,
  targetUnit,
  terrainAreas,
  terrainFeatures,
  allUnits,
) {
  const p1 = observer.position;
  const p2 = target.position;

  for (const feature of terrainFeatures) {
    if (lineIntersectsSolidFeature(p1, p2, feature)) return false;
  }

  const observerArea = terrainAreas.find((a) => pointInRect(p1, a.bounds));
  const targetArea = terrainAreas.find((a) => pointInRect(p2, a.bounds));

  for (const area of terrainAreas) {
    if (!area.isObscuring) continue;
    const observerInside = observerArea?.id === area.id;
    const targetInside = targetArea?.id === area.id;
    if (observerInside || targetInside) continue;
    if (crossesRect(p1, p2, area.bounds)) return false;
  }

  if (isHidden(target, targetUnit, terrainAreas) && isInfantryLike(observer)) {
    const dist = distanceBetweenModels(observer, target);
    if (dist > HIDDEN_DETECTION_RANGE) return false;
  } else if (isHidden(target, targetUnit, terrainAreas)) {
    return false;
  }

  return true;
}

function unitIsVisibleToUnit(shooterUnit, targetUnit, terrainAreas, terrainFeatures, allUnits) {
  const aliveShooters = shooterUnit.models.filter((m) => m.woundsRemaining > 0);
  const aliveTargets = targetUnit.models.filter((m) => m.woundsRemaining > 0);
  return aliveShooters.some((s) =>
    aliveTargets.some((t) =>
      hasLineOfSight(s, t, shooterUnit, targetUnit, terrainAreas, terrainFeatures, allUnits),
    ),
  );
}

function getLosPreview(
  observer,
  target,
  observerUnit,
  targetUnit,
  terrainAreas,
  terrainFeatures,
  allUnits,
) {
  return {
    from: observer.position,
    to: target.position,
    visible: hasLineOfSight(
      observer,
      target,
      observerUnit,
      targetUnit,
      terrainAreas,
      terrainFeatures,
      allUnits,
    ),
  };
}

/* --- battleSim\battleMapState.js --- */
/**
 * Battle map helpers (no guideState imports — safe for bundle order).
 */

const MARKER_RADIUS = {
  standard: 0.5,
  leader: 0.75,
  vehicle: 2,
};

function createEmptyBattleMap() {
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

function mapUnitKey(player, unitId) {
  return `${player}:${unitId}`;
}

function parseMapUnitKey(key) {
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

function getModelMarkerRadius(unit, role = 'standard') {
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

function getStagingOrigin(player, board) {
  const w = board?.width ?? 44;
  if (player === 'player1') return { x: -6, y: 2 };
  return { x: w + 2, y: 2 };
}

function boardSizeForLayout(layout) {
  return {
    width: layout?.width ?? 60,
    height: layout?.height ?? 44,
  };
}

/** Build model markers for deploy. remainingModels / groupLeaders supplied by caller. */
function buildDeployedModels(unit, player, remainingModels, stagingOrigin, attachedLeaders = []) {
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

/* --- battleSim\layoutData\searchAndDestroy.js --- */
/** Auto-generated from Rapid Ingress DI-PF-A — do not hand-edit polygons. */
const SEARCH_AND_DESTROY_LAYOUT = {"id":"search-and-destroy","name":"Search and Destroy","page":1,"source":"Rapid Ingress DI-PF-A (Purge the Foe vs Disruption Layout A)","width":60,"height":44,"deploymentZones":[{"id":"DI-PF-A-dz-atk-0","color":"red","role":"attacker","polygon":[{"x":21.03,"y":22.02},{"x":0.14,"y":22.02},{"x":0.14,"y":0.04},{"x":30.03,"y":0.04},{"x":30.03,"y":13.02},{"x":26.52,"y":13.73},{"x":23.66,"y":15.65},{"x":21.74,"y":18.51},{"x":21.03,"y":22.01}],"bounds":{"x":0.14,"y":0.04,"w":29.89,"h":21.98}},{"id":"DI-PF-A-dz-def-0","color":"blue","role":"defender","polygon":[{"x":59.88,"y":43.96},{"x":30.01,"y":43.96},{"x":30.01,"y":30.98},{"x":33.5,"y":30.27},{"x":36.36,"y":28.35},{"x":38.28,"y":25.49},{"x":38.99,"y":22},{"x":59.88,"y":22}],"bounds":{"x":30.01,"y":22,"w":29.87,"h":21.96}}],"terrainAreas":[{"id":"DI-PF-A-T01","polygon":[{"x":43.41,"y":30.95},{"x":46.81,"y":30.95},{"x":47.96,"y":30.5},{"x":49.1,"y":30.87},{"x":49.91,"y":30.76},{"x":51.31,"y":30.95},{"x":51.92,"y":30.37},{"x":53.18,"y":30.64},{"x":53.66,"y":30.95},{"x":54.99,"y":30.95},{"x":54.99,"y":37.99},{"x":43.41,"y":37.99}],"bounds":{"x":43.41,"y":30.37,"w":11.58,"h":7.62},"obscuring":true,"isObjective":true,"objectiveType":"home"},{"id":"DI-PF-A-T02","polygon":[{"x":43.9,"y":22.6},{"x":42.63,"y":22.04},{"x":42.09,"y":22.04},{"x":42.09,"y":19.45},{"x":47.6,"y":19.45},{"x":47.98,"y":18.91},{"x":48.9,"y":19.06},{"x":49.25,"y":19.45},{"x":52.1,"y":19.45},{"x":52.1,"y":22.04},{"x":49.74,"y":22.2},{"x":49.49,"y":22.04},{"x":44.69,"y":22.04},{"x":44.27,"y":22.52},{"x":43.96,"y":22.6}],"bounds":{"x":42.09,"y":18.91,"w":10.01,"h":3.69},"obscuring":true,"isObjective":false,"objectiveType":null},{"id":"DI-PF-A-T03","polygon":[{"x":37.12,"y":41.04},{"x":37.12,"y":39.77},{"x":36.87,"y":39.54},{"x":36.75,"y":39.03},{"x":37.12,"y":37.58},{"x":37.12,"y":35.01},{"x":38.02,"y":35.01},{"x":38.24,"y":34.65},{"x":38.62,"y":34.74},{"x":39.18,"y":34.45},{"x":40.09,"y":35.01},{"x":41.1,"y":35.01},{"x":41.1,"y":41.04}],"bounds":{"x":36.75,"y":34.45,"w":4.35,"h":6.59},"obscuring":true,"isObjective":false,"objectiveType":null},{"id":"DI-PF-A-T04","polygon":[{"x":23.84,"y":22.09},{"x":24.22,"y":21.27},{"x":24.22,"y":18.91},{"x":26.6,"y":19.39},{"x":28.43,"y":21.07},{"x":28.88,"y":21.18},{"x":32.35,"y":23.34},{"x":33.4,"y":24.48},{"x":35.8,"y":24.96},{"x":35.8,"y":27},{"x":24.22,"y":27},{"x":24.22,"y":22.88},{"x":23.83,"y":22.13}],"bounds":{"x":23.83,"y":18.91,"w":11.97,"h":8.09},"obscuring":true,"isObjective":true,"objectiveType":"centre"},{"id":"DI-PF-A-T05","polygon":[{"x":39.61,"y":23.72},{"x":40.11,"y":22.94},{"x":40.11,"y":22.02},{"x":42.09,"y":22.02},{"x":42.09,"y":26.03},{"x":42.38,"y":26.32},{"x":42.28,"y":27.01},{"x":42.09,"y":27.13},{"x":42.09,"y":28.06},{"x":40.11,"y":28.06},{"x":40.11,"y":24.57},{"x":39.77,"y":24.25},{"x":39.63,"y":23.78}],"bounds":{"x":39.61,"y":22.02,"w":2.77,"h":6.04},"obscuring":true,"isObjective":false,"objectiveType":null},{"id":"DI-PF-A-T06","polygon":[{"x":16.69,"y":13.05},{"x":13.32,"y":13.05},{"x":12.13,"y":13.51},{"x":10.99,"y":13.14},{"x":10.24,"y":13.25},{"x":8.8,"y":13.05},{"x":8.17,"y":13.64},{"x":6.91,"y":13.37},{"x":6.44,"y":13.05},{"x":5.11,"y":13.05},{"x":5.11,"y":6.02},{"x":16.69,"y":6.02}],"bounds":{"x":5.11,"y":6.02,"w":11.58,"h":7.62},"obscuring":true,"isObjective":true,"objectiveType":"home"},{"id":"DI-PF-A-T07","polygon":[{"x":50.96,"y":14.61},{"x":47.76,"y":13.53},{"x":46.42,"y":13.57},{"x":45.58,"y":12.9},{"x":44.78,"y":12.74},{"x":43.48,"y":12.1},{"x":42.69,"y":12.46},{"x":41.62,"y":11.83},{"x":41.23,"y":11.35},{"x":39.97,"y":10.93},{"x":42.21,"y":4.26},{"x":53.19,"y":7.93}],"bounds":{"x":39.97,"y":4.26,"w":13.22,"h":10.35},"obscuring":true,"isObjective":true,"objectiveType":"expansion"},{"id":"DI-PF-A-T08","polygon":[{"x":16.32,"y":21.41},{"x":17.58,"y":21.97},{"x":18.13,"y":21.97},{"x":18.13,"y":24.56},{"x":12.62,"y":24.56},{"x":12.24,"y":25.1},{"x":11.32,"y":24.95},{"x":10.97,"y":24.56},{"x":8.11,"y":24.56},{"x":8.11,"y":21.97},{"x":10.48,"y":21.81},{"x":10.72,"y":21.97},{"x":15.53,"y":21.97},{"x":15.95,"y":21.48},{"x":16.26,"y":21.41}],"bounds":{"x":8.11,"y":21.41,"w":10.02,"h":3.69},"obscuring":true,"isObjective":false,"objectiveType":null},{"id":"DI-PF-A-T09","polygon":[{"x":36.18,"y":21.92},{"x":35.8,"y":22.74},{"x":35.8,"y":25.1},{"x":33.42,"y":24.62},{"x":31.59,"y":22.94},{"x":31.14,"y":22.83},{"x":27.67,"y":20.67},{"x":26.63,"y":19.53},{"x":24.22,"y":19.05},{"x":24.22,"y":17.01},{"x":35.8,"y":17.01},{"x":35.8,"y":21.12},{"x":36.19,"y":21.88}],"bounds":{"x":24.22,"y":17.01,"w":11.97,"h":8.09},"obscuring":true,"isObjective":true,"objectiveType":"centre"},{"id":"DI-PF-A-T10","polygon":[{"x":20.6,"y":20.29},{"x":20.11,"y":21.07},{"x":20.11,"y":21.99},{"x":18.12,"y":21.99},{"x":18.12,"y":17.98},{"x":17.84,"y":17.68},{"x":17.91,"y":17.06},{"x":18.12,"y":16.88},{"x":18.12,"y":15.95},{"x":20.11,"y":15.95},{"x":20.11,"y":19.43},{"x":20.59,"y":20.22}],"bounds":{"x":17.84,"y":15.95,"w":2.76,"h":6.04},"obscuring":true,"isObjective":false,"objectiveType":null},{"id":"DI-PF-A-T11","polygon":[{"x":22.17,"y":3.02},{"x":22.17,"y":4.29},{"x":22.42,"y":4.52},{"x":22.54,"y":5.03},{"x":22.17,"y":6.49},{"x":22.17,"y":9.06},{"x":21.27,"y":9.06},{"x":21.05,"y":9.41},{"x":20.68,"y":9.32},{"x":20.11,"y":9.61},{"x":19.25,"y":9.07},{"x":18.19,"y":9.06},{"x":18.19,"y":3.02}],"bounds":{"x":18.19,"y":3.02,"w":4.35,"h":6.59},"obscuring":true,"isObjective":false,"objectiveType":null},{"id":"DI-PF-A-T12","polygon":[{"x":27.43,"y":37.22},{"x":26.94,"y":38},{"x":26.94,"y":38.93},{"x":24.95,"y":38.93},{"x":24.95,"y":34.91},{"x":24.67,"y":34.62},{"x":24.74,"y":34},{"x":24.95,"y":33.81},{"x":24.95,"y":32.89},{"x":26.94,"y":32.89},{"x":26.94,"y":36.37},{"x":27.42,"y":37.16}],"bounds":{"x":24.67,"y":32.89,"w":2.76,"h":6.04},"obscuring":true,"isObjective":false,"objectiveType":null},{"id":"DI-PF-A-T12-fp12","polygon":[{"x":26.95,"y":31},{"x":28.23,"y":31},{"x":28.45,"y":30.75},{"x":29.03,"y":30.62},{"x":30.42,"y":31},{"x":32.99,"y":31},{"x":32.99,"y":31.89},{"x":33.36,"y":32.16},{"x":33.26,"y":32.49},{"x":33.54,"y":33.05},{"x":33,"y":33.92},{"x":32.99,"y":34.97},{"x":26.95,"y":34.97}],"bounds":{"x":26.95,"y":30.62,"w":6.59,"h":4.35},"obscuring":true,"isObjective":false,"objectiveType":null},{"id":"DI-PF-A-T13","polygon":[{"x":32.54,"y":6.6},{"x":33.03,"y":5.82},{"x":33.03,"y":4.89},{"x":35.02,"y":4.89},{"x":35.02,"y":8.91},{"x":35.31,"y":9.2},{"x":35.21,"y":9.89},{"x":35.02,"y":10.01},{"x":35.02,"y":10.93},{"x":33.03,"y":10.93},{"x":33.03,"y":7.45},{"x":32.55,"y":6.66}],"bounds":{"x":32.54,"y":4.89,"w":2.77,"h":6.04},"obscuring":true,"isObjective":false,"objectiveType":null},{"id":"DI-PF-A-T13-fp14","polygon":[{"x":33.02,"y":12.82},{"x":31.75,"y":12.82},{"x":31.52,"y":13.07},{"x":31.01,"y":13.19},{"x":29.55,"y":12.82},{"x":26.99,"y":12.82},{"x":26.99,"y":11.92},{"x":26.63,"y":11.7},{"x":26.72,"y":11.33},{"x":26.43,"y":10.76},{"x":26.99,"y":9.85},{"x":26.99,"y":8.84},{"x":33.02,"y":8.84}],"bounds":{"x":26.43,"y":8.84,"w":6.59,"h":4.35},"obscuring":true,"isObjective":false,"objectiveType":null},{"id":"DI-PF-A-T14","polygon":[{"x":9.29,"y":29.35},{"x":12.48,"y":30.43},{"x":13.82,"y":30.39},{"x":14.66,"y":31.06},{"x":15.52,"y":31.24},{"x":16.77,"y":31.86},{"x":17.55,"y":31.5},{"x":18.62,"y":32.13},{"x":19.01,"y":32.61},{"x":20.27,"y":33.03},{"x":18.04,"y":39.7},{"x":7.05,"y":36.02}],"bounds":{"x":7.05,"y":29.35,"w":13.22,"h":10.35},"obscuring":true,"isObjective":true,"objectiveType":"expansion"}],"terrainFeatures":[{"id":"DI-PF-A-T01-feat0","areaId":"DI-PF-A-T01","polygon":[{"x":51.52,"y":31.62},{"x":52.48,"y":31.4},{"x":53.47,"y":31.74},{"x":53.66,"y":31.48},{"x":54.13,"y":31.49},{"x":54.42,"y":31.77},{"x":54.16,"y":33.12},{"x":53.96,"y":33.22},{"x":53.79,"y":32.98},{"x":53.92,"y":31.97},{"x":53.57,"y":32.01},{"x":53.47,"y":31.81},{"x":53.21,"y":32.12},{"x":52.98,"y":31.9},{"x":52.44,"y":31.99},{"x":52.29,"y":31.82},{"x":52.17,"y":31.97},{"x":52.14,"y":31.79},{"x":51.88,"y":31.9},{"x":51.72,"y":31.7},{"x":51.53,"y":31.97},{"x":51.48,"y":31.79}],"bounds":{"x":51.48,"y":31.4,"w":2.94,"h":1.82},"color":"yellow","solid":false,"category":"light"},{"id":"DI-PF-A-T01-feat1","areaId":"DI-PF-A-T01","polygon":[{"x":46.49,"y":37.6},{"x":44.8,"y":37.82},{"x":43.87,"y":37.68},{"x":43.92,"y":34.04},{"x":43.71,"y":33.28},{"x":43.89,"y":33.04},{"x":43.75,"y":32.37},{"x":43.93,"y":31.36},{"x":44.11,"y":31.36},{"x":44.11,"y":31.76},{"x":44.27,"y":31.84},{"x":44.11,"y":32.05},{"x":44.39,"y":32.96},{"x":44.3,"y":33.49},{"x":44.59,"y":33.55},{"x":44.77,"y":33.37},{"x":44.7,"y":33.54},{"x":44.91,"y":33.56},{"x":45.2,"y":33.3},{"x":45.67,"y":33.45},{"x":45.68,"y":33.2},{"x":45.84,"y":33.2},{"x":45.87,"y":33.56},{"x":45.95,"y":33.42},{"x":46.11,"y":33.64},{"x":46.16,"y":33.42},{"x":46.39,"y":34.08},{"x":46.87,"y":34.12},{"x":46.55,"y":34.29},{"x":46.75,"y":34.98},{"x":46.58,"y":34.95},{"x":46.7,"y":35.22},{"x":46.51,"y":35.24},{"x":46.57,"y":35.64},{"x":46.93,"y":35.74},{"x":46.5,"y":35.86},{"x":46.5,"y":36.29},{"x":46.21,"y":36.6},{"x":46.36,"y":36.67},{"x":46.27,"y":36.86},{"x":46.53,"y":36.78},{"x":46.3,"y":36.94},{"x":46.56,"y":37.49}],"bounds":{"x":43.71,"y":31.36,"w":3.22,"h":6.46},"color":"green","solid":true,"category":"dense"},{"id":"DI-PF-A-T02-feat0","areaId":"DI-PF-A-T02","polygon":[{"x":52.21,"y":20.5},{"x":52.15,"y":21.55},{"x":52.01,"y":21.52},{"x":51.96,"y":20.84},{"x":48.7,"y":20.84},{"x":48.66,"y":21.51},{"x":48.45,"y":21.51},{"x":48.58,"y":20.32},{"x":50.17,"y":20.32},{"x":50.31,"y":20.52},{"x":50.49,"y":20.32},{"x":52.08,"y":20.32}],"bounds":{"x":48.45,"y":20.32,"w":3.76,"h":1.23},"color":"yellow","solid":false,"category":"light"},{"id":"DI-PF-A-T02-feat1","areaId":"DI-PF-A-T02","polygon":[{"x":45.93,"y":20.5},{"x":45.87,"y":21.55},{"x":45.73,"y":21.52},{"x":45.68,"y":20.84},{"x":42.42,"y":20.84},{"x":42.37,"y":21.51},{"x":42.17,"y":21.51},{"x":42.3,"y":20.32},{"x":43.89,"y":20.32},{"x":44.03,"y":20.52},{"x":44.21,"y":20.32},{"x":45.8,"y":20.32}],"bounds":{"x":42.17,"y":20.32,"w":3.76,"h":1.23},"color":"yellow","solid":false,"category":"light"},{"id":"DI-PF-A-T02-feat2","areaId":"DI-PF-A-T02","polygon":[{"x":46.06,"y":19.49},{"x":46.31,"y":19.56},{"x":46.38,"y":20.13},{"x":47.79,"y":20.13},{"x":47.86,"y":19.55},{"x":48.14,"y":19.53},{"x":48.3,"y":20.25},{"x":48.19,"y":20.6},{"x":48.79,"y":20.82},{"x":48.19,"y":20.93},{"x":48.45,"y":20.98},{"x":48.49,"y":21.17},{"x":48.17,"y":21.39},{"x":48.09,"y":22.05},{"x":47.86,"y":21.97},{"x":47.79,"y":21.39},{"x":46.37,"y":21.39},{"x":46.3,"y":21.97},{"x":46.02,"y":21.98},{"x":45.95,"y":20.93},{"x":45.38,"y":20.75},{"x":45.97,"y":20.59},{"x":45.7,"y":20.53},{"x":45.68,"y":20.35},{"x":45.99,"y":20.13},{"x":46,"y":19.59}],"bounds":{"x":45.38,"y":19.49,"w":3.41,"h":2.56},"color":"green","solid":true,"category":"dense"},{"id":"DI-PF-A-T03-feat0","areaId":"DI-PF-A-T03","polygon":[{"x":40.76,"y":39.01},{"x":40.88,"y":40.5},{"x":40.72,"y":40.77},{"x":38.85,"y":40.65},{"x":38.01,"y":40.79},{"x":38.01,"y":40.59},{"x":38.51,"y":40.5},{"x":38.61,"y":40.18},{"x":39.78,"y":40.18},{"x":39.93,"y":40.52},{"x":40,"y":40.3},{"x":40.38,"y":40.35},{"x":40.3,"y":39.53},{"x":40.43,"y":39.14},{"x":40.72,"y":38.97}],"bounds":{"x":38.01,"y":38.97,"w":2.87,"h":1.82},"color":"yellow","solid":false,"category":"light"},{"id":"DI-PF-A-T03-feat1","areaId":"DI-PF-A-T03","polygon":[{"x":37.52,"y":36.81},{"x":37.24,"y":35.87},{"x":37.39,"y":35.23},{"x":38.06,"y":35.23},{"x":38.21,"y":35.49},{"x":40.32,"y":35.43},{"x":40.32,"y":35.77},{"x":39.98,"y":35.82},{"x":38.03,"y":35.82},{"x":37.96,"y":35.63},{"x":37.7,"y":35.63},{"x":37.89,"y":36.21},{"x":37.69,"y":36.89}],"bounds":{"x":37.24,"y":35.23,"w":3.08,"h":1.66},"color":"yellow","solid":false,"category":"light"},{"id":"DI-PF-A-T04-feat0","areaId":"DI-PF-A-T04","polygon":[{"x":26.52,"y":26.39},{"x":25.36,"y":26.67},{"x":24.98,"y":26.5},{"x":24.72,"y":26.01},{"x":25.02,"y":25.04},{"x":25.26,"y":25.52},{"x":25.25,"y":26.15},{"x":26.55,"y":26.29}],"bounds":{"x":24.72,"y":25.04,"w":1.83,"h":1.63},"color":"yellow","solid":false,"category":"light"},{"id":"DI-PF-A-T05-feat0","areaId":"DI-PF-A-T05","polygon":[{"x":41.24,"y":27.32},{"x":41.06,"y":26.71},{"x":40.62,"y":26.7},{"x":40.64,"y":26.35},{"x":41.09,"y":26.29},{"x":41.1,"y":25.2},{"x":40.36,"y":25.1},{"x":40.36,"y":24.76},{"x":41.1,"y":24.66},{"x":41.08,"y":23.52},{"x":40.4,"y":23.52},{"x":40.36,"y":23.16},{"x":41.06,"y":23.16},{"x":41.17,"y":22.55},{"x":41.37,"y":22.66},{"x":41.43,"y":23.17},{"x":41.79,"y":23.14},{"x":41.93,"y":23.32},{"x":41.37,"y":23.58},{"x":41.37,"y":24.7},{"x":41.93,"y":24.92},{"x":41.79,"y":25.12},{"x":41.37,"y":25.17},{"x":41.37,"y":26.27},{"x":41.93,"y":26.55},{"x":41.79,"y":26.72},{"x":41.44,"y":26.69},{"x":41.3,"y":27.22}],"bounds":{"x":40.36,"y":22.55,"w":1.57,"h":4.77},"color":"yellow","solid":false,"category":"light"},{"id":"DI-PF-A-T06-feat0","areaId":"DI-PF-A-T06","polygon":[{"x":8.56,"y":12.39},{"x":7.6,"y":12.61},{"x":6.61,"y":12.27},{"x":6.41,"y":12.53},{"x":5.95,"y":12.52},{"x":5.66,"y":12.24},{"x":5.83,"y":11.08},{"x":5.98,"y":10.79},{"x":6.29,"y":11.03},{"x":6.16,"y":12.04},{"x":6.51,"y":12},{"x":6.61,"y":12.2},{"x":6.87,"y":11.89},{"x":7.09,"y":12.11},{"x":7.63,"y":12.02},{"x":7.79,"y":12.19},{"x":7.9,"y":12.04},{"x":7.94,"y":12.22},{"x":8.19,"y":12.11},{"x":8.36,"y":12.31},{"x":8.55,"y":12.04},{"x":8.6,"y":12.22}],"bounds":{"x":5.66,"y":10.79,"w":2.94,"h":1.82},"color":"yellow","solid":false,"category":"light"},{"id":"DI-PF-A-T06-feat1","areaId":"DI-PF-A-T06","polygon":[{"x":13.59,"y":6.53},{"x":14.66,"y":6.53},{"x":15.29,"y":6.33},{"x":16.22,"y":6.48},{"x":16.13,"y":10.12},{"x":16.33,"y":10.88},{"x":16.15,"y":11.13},{"x":16.29,"y":11.79},{"x":16.1,"y":12.8},{"x":15.91,"y":12.8},{"x":15.92,"y":12.4},{"x":15.76,"y":12.32},{"x":15.93,"y":12.11},{"x":15.66,"y":11.2},{"x":15.75,"y":10.67},{"x":15.45,"y":10.61},{"x":15.28,"y":10.79},{"x":15.35,"y":10.62},{"x":15.13,"y":10.59},{"x":14.85,"y":10.85},{"x":14.38,"y":10.69},{"x":14.36,"y":10.94},{"x":14.2,"y":10.94},{"x":14.18,"y":10.58},{"x":14.09,"y":10.73},{"x":13.94,"y":10.5},{"x":13.88,"y":10.73},{"x":13.66,"y":10.06},{"x":13.18,"y":10.02},{"x":13.51,"y":9.85},{"x":13.31,"y":9.16},{"x":13.48,"y":9.19},{"x":13.36,"y":8.92},{"x":13.55,"y":8.9},{"x":13.5,"y":8.5},{"x":13.14,"y":8.39},{"x":13.57,"y":8.28},{"x":13.57,"y":7.85},{"x":13.87,"y":7.55},{"x":13.71,"y":7.47},{"x":13.81,"y":7.29},{"x":13.55,"y":7.36},{"x":13.78,"y":7.2},{"x":13.53,"y":6.65}],"bounds":{"x":13.14,"y":6.33,"w":3.19,"h":6.47},"color":"green","solid":true,"category":"dense"},{"id":"DI-PF-A-T07-feat0","areaId":"DI-PF-A-T07","polygon":[{"x":44.95,"y":11.97},{"x":43.96,"y":11.66},{"x":43.51,"y":11.74},{"x":40.67,"y":10.91},{"x":40.36,"y":10.63},{"x":41.64,"y":6.54},{"x":42.02,"y":6.08},{"x":42.41,"y":5.01},{"x":42.63,"y":4.88},{"x":42.84,"y":5.16},{"x":42.23,"y":6.72},{"x":42.27,"y":7.14},{"x":42.43,"y":7.19},{"x":42.48,"y":6.92},{"x":42.68,"y":7.7},{"x":43.44,"y":8.33},{"x":43.42,"y":8.51},{"x":43.61,"y":8.46},{"x":43.33,"y":8.75},{"x":43.58,"y":8.9},{"x":43.23,"y":9.06},{"x":43.49,"y":9.08},{"x":43.24,"y":9.19},{"x":43.52,"y":9.29},{"x":43.57,"y":9.51},{"x":43.17,"y":9.48},{"x":43.41,"y":10.04},{"x":43.21,"y":10.53},{"x":43.44,"y":10.6},{"x":43.33,"y":11.13},{"x":43.54,"y":11.02},{"x":43.68,"y":11.28},{"x":44.25,"y":11.36},{"x":45,"y":11.78},{"x":44.98,"y":11.96}],"bounds":{"x":40.36,"y":4.88,"w":4.64,"h":7.09},"color":"green","solid":true,"category":"dense"},{"id":"DI-PF-A-T07-feat1","areaId":"DI-PF-A-T07","polygon":[{"x":46.84,"y":6.17},{"x":47.43,"y":6.25},{"x":47.64,"y":6.62},{"x":49.67,"y":7},{"x":52.81,"y":8.1},{"x":51.84,"y":11.01},{"x":51.43,"y":10.87},{"x":51.55,"y":10.13},{"x":50.75,"y":9.76},{"x":50.55,"y":9.84},{"x":50.66,"y":9.71},{"x":50.13,"y":9.49},{"x":50.13,"y":9.18},{"x":49.75,"y":8.82},{"x":48.8,"y":8.45},{"x":48.99,"y":7.46},{"x":47.34,"y":6.91},{"x":47.39,"y":6.52},{"x":47.15,"y":6.56},{"x":46.96,"y":6.36},{"x":46.73,"y":6.7},{"x":46.72,"y":6.45}],"bounds":{"x":46.72,"y":6.17,"w":6.09,"h":4.84},"color":"green","solid":true,"category":"dense"},{"id":"DI-PF-A-T08-feat0","areaId":"DI-PF-A-T08","polygon":[{"x":7.99,"y":23.51},{"x":8.05,"y":22.46},{"x":8.19,"y":22.49},{"x":8.24,"y":23.17},{"x":11.49,"y":23.17},{"x":11.54,"y":22.5},{"x":11.74,"y":22.5},{"x":11.62,"y":23.69},{"x":10.03,"y":23.69},{"x":9.89,"y":23.49},{"x":9.7,"y":23.69},{"x":8.11,"y":23.69}],"bounds":{"x":7.99,"y":22.46,"w":3.75,"h":1.23},"color":"yellow","solid":false,"category":"light"},{"id":"DI-PF-A-T08-feat1","areaId":"DI-PF-A-T08","polygon":[{"x":14.27,"y":23.51},{"x":14.33,"y":22.46},{"x":14.47,"y":22.49},{"x":14.52,"y":23.17},{"x":17.77,"y":23.17},{"x":17.82,"y":22.5},{"x":18.02,"y":22.5},{"x":17.9,"y":23.69},{"x":16.31,"y":23.69},{"x":16.17,"y":23.49},{"x":15.98,"y":23.69},{"x":14.39,"y":23.69}],"bounds":{"x":14.27,"y":22.46,"w":3.75,"h":1.23},"color":"yellow","solid":false,"category":"light"},{"id":"DI-PF-A-T08-feat2","areaId":"DI-PF-A-T08","polygon":[{"x":14.13,"y":24.52},{"x":13.89,"y":24.45},{"x":13.82,"y":23.88},{"x":12.41,"y":23.88},{"x":12.34,"y":24.46},{"x":12.05,"y":24.48},{"x":11.9,"y":23.76},{"x":12.01,"y":23.41},{"x":11.41,"y":23.19},{"x":12.01,"y":23.08},{"x":11.75,"y":23.03},{"x":11.71,"y":22.84},{"x":12.02,"y":22.62},{"x":12.11,"y":21.96},{"x":12.34,"y":22.04},{"x":12.41,"y":22.62},{"x":13.82,"y":22.62},{"x":13.89,"y":22.04},{"x":14.18,"y":22.03},{"x":14.25,"y":23.08},{"x":14.82,"y":23.26},{"x":14.23,"y":23.42},{"x":14.5,"y":23.48},{"x":14.52,"y":23.66},{"x":14.21,"y":23.88},{"x":14.19,"y":24.42}],"bounds":{"x":11.41,"y":21.96,"w":3.41,"h":2.56},"color":"green","solid":true,"category":"dense"},{"id":"DI-PF-A-T09-feat0","areaId":"DI-PF-A-T09","polygon":[{"x":33.55,"y":17.62},{"x":34.71,"y":17.34},{"x":35.1,"y":17.51},{"x":35.35,"y":18},{"x":35.05,"y":18.97},{"x":34.81,"y":18.49},{"x":34.82,"y":17.86},{"x":33.52,"y":17.72}],"bounds":{"x":33.52,"y":17.34,"w":1.83,"h":1.63},"color":"yellow","solid":false,"category":"light"},{"id":"DI-PF-A-T09-feat1","areaId":"DI-PF-A-T09","polygon":[{"x":25.31,"y":22.44},{"x":25.3,"y":21.43},{"x":25,"y":20.37},{"x":25.24,"y":19.82},{"x":25.24,"y":18.4},{"x":25,"y":18.06},{"x":25.16,"y":17.64},{"x":25.67,"y":17.47},{"x":26.16,"y":17.69},{"x":27.16,"y":17.69},{"x":28.14,"y":17.47},{"x":29.49,"y":17.76},{"x":29.49,"y":17.92},{"x":28.74,"y":17.92},{"x":28.48,"y":18.12},{"x":28.47,"y":19.06},{"x":28.32,"y":19.06},{"x":28.31,"y":18.84},{"x":28.23,"y":19.42},{"x":27.99,"y":19.49},{"x":28,"y":19.79},{"x":27.58,"y":20.14},{"x":27.69,"y":20.33},{"x":27.47,"y":20.17},{"x":27.37,"y":20.42},{"x":27.52,"y":20.52},{"x":27.33,"y":20.53},{"x":27.53,"y":20.9},{"x":26.37,"y":20.86},{"x":26.39,"y":20.71},{"x":26.69,"y":20.72},{"x":26.28,"y":20.58},{"x":26.33,"y":20.45},{"x":25.72,"y":20.62},{"x":25.41,"y":20.47},{"x":25.41,"y":22.38}],"bounds":{"x":25,"y":17.47,"w":4.49,"h":4.97},"color":"green","solid":true,"category":"dense"},{"id":"DI-PF-A-T09-feat2","areaId":"DI-PF-A-T09","polygon":[{"x":34.87,"y":21.42},{"x":34.88,"y":22.43},{"x":35.18,"y":23.49},{"x":34.94,"y":24.04},{"x":34.94,"y":25.47},{"x":35.18,"y":25.81},{"x":35.02,"y":26.22},{"x":34.51,"y":26.39},{"x":34.02,"y":26.17},{"x":33.02,"y":26.17},{"x":32.04,"y":26.39},{"x":30.69,"y":26.1},{"x":30.69,"y":25.95},{"x":31.44,"y":25.94},{"x":31.7,"y":25.74},{"x":31.71,"y":24.8},{"x":31.86,"y":24.8},{"x":31.87,"y":25.02},{"x":31.95,"y":24.44},{"x":32.19,"y":24.38},{"x":32.17,"y":24.07},{"x":32.6,"y":23.72},{"x":32.49,"y":23.53},{"x":32.71,"y":23.69},{"x":32.81,"y":23.44},{"x":32.66,"y":23.34},{"x":32.85,"y":23.33},{"x":32.65,"y":22.96},{"x":33.81,"y":23},{"x":33.79,"y":23.15},{"x":33.49,"y":23.14},{"x":33.9,"y":23.28},{"x":33.85,"y":23.42},{"x":34.46,"y":23.25},{"x":34.77,"y":23.39},{"x":34.77,"y":21.48}],"bounds":{"x":30.69,"y":21.42,"w":4.49,"h":4.97},"color":"green","solid":true,"category":"dense"},{"id":"DI-PF-A-T10-feat0","areaId":"DI-PF-A-T10","polygon":[{"x":18.95,"y":16.69},{"x":19.14,"y":17.3},{"x":19.57,"y":17.31},{"x":19.56,"y":17.66},{"x":19.1,"y":17.72},{"x":19.14,"y":18.91},{"x":19.84,"y":18.91},{"x":19.84,"y":19.25},{"x":19.1,"y":19.35},{"x":19.12,"y":20.49},{"x":19.8,"y":20.49},{"x":19.84,"y":20.85},{"x":19.13,"y":20.85},{"x":19.02,"y":21.46},{"x":18.83,"y":21.35},{"x":18.76,"y":20.84},{"x":18.41,"y":20.87},{"x":18.27,"y":20.69},{"x":18.83,"y":20.43},{"x":18.83,"y":19.32},{"x":18.27,"y":19.09},{"x":18.41,"y":18.89},{"x":18.83,"y":18.84},{"x":18.83,"y":17.74},{"x":18.27,"y":17.46},{"x":18.41,"y":17.29},{"x":18.76,"y":17.32},{"x":18.9,"y":16.79}],"bounds":{"x":18.27,"y":16.69,"w":1.57,"h":4.77},"color":"yellow","solid":false,"category":"light"},{"id":"DI-PF-A-T11-feat0","areaId":"DI-PF-A-T11","polygon":[{"x":18.51,"y":5.05},{"x":18.39,"y":3.56},{"x":18.55,"y":3.3},{"x":20.42,"y":3.41},{"x":21.26,"y":3.28},{"x":21.26,"y":3.47},{"x":20.76,"y":3.56},{"x":20.66,"y":3.88},{"x":19.49,"y":3.88},{"x":19.34,"y":3.54},{"x":19.27,"y":3.76},{"x":18.89,"y":3.72},{"x":18.97,"y":4.54},{"x":18.84,"y":4.93},{"x":18.55,"y":5.09}],"bounds":{"x":18.39,"y":3.28,"w":2.87,"h":1.81},"color":"yellow","solid":false,"category":"light"},{"id":"DI-PF-A-T11-feat1","areaId":"DI-PF-A-T11","polygon":[{"x":21.75,"y":7.25},{"x":22.03,"y":8.19},{"x":21.88,"y":8.83},{"x":21.21,"y":8.83},{"x":21.07,"y":8.58},{"x":18.95,"y":8.63},{"x":18.95,"y":8.29},{"x":19.29,"y":8.24},{"x":21.24,"y":8.24},{"x":21.31,"y":8.43},{"x":21.57,"y":8.43},{"x":21.39,"y":7.85},{"x":21.58,"y":7.17}],"bounds":{"x":18.95,"y":7.17,"w":3.08,"h":1.66},"color":"yellow","solid":false,"category":"light"},{"id":"DI-PF-A-T12-feat0","areaId":"DI-PF-A-T12","polygon":[{"x":26.38,"y":31.56},{"x":26.41,"y":32.88},{"x":26.83,"y":33.16},{"x":26.79,"y":33.38},{"x":26.48,"y":33.38},{"x":26.41,"y":33.55},{"x":26.41,"y":34.72},{"x":26.48,"y":34.88},{"x":26.79,"y":34.88},{"x":26.83,"y":35.1},{"x":26.41,"y":35.38},{"x":26.42,"y":36.62},{"x":26.79,"y":36.7},{"x":26.8,"y":37.03},{"x":26.48,"y":37.04},{"x":26.41,"y":37.21},{"x":26.41,"y":38.37},{"x":26.47,"y":38.53},{"x":26.79,"y":38.54},{"x":26.81,"y":38.83},{"x":26.43,"y":38.9},{"x":26.25,"y":39.52},{"x":26.01,"y":38.91},{"x":25.8,"y":39.48},{"x":25.69,"y":38.89},{"x":25.45,"y":39.6},{"x":25.28,"y":38.9},{"x":24.93,"y":38.88},{"x":24.93,"y":38.54},{"x":25.33,"y":38.39},{"x":25.31,"y":37.14},{"x":24.93,"y":37.04},{"x":24.93,"y":36.7},{"x":25.33,"y":36.55},{"x":25.32,"y":35.32},{"x":24.93,"y":35.21},{"x":24.93,"y":34.88},{"x":25.33,"y":34.73},{"x":25.33,"y":33.55},{"x":25.26,"y":33.38},{"x":24.93,"y":33.38},{"x":24.93,"y":33.05},{"x":25.28,"y":33.03},{"x":25.38,"y":32.83},{"x":25.18,"y":32.76},{"x":25.37,"y":32.72},{"x":25.18,"y":32.66},{"x":25.36,"y":32.61},{"x":25.18,"y":32.56},{"x":25.36,"y":32.51},{"x":25.18,"y":32.46},{"x":25.36,"y":32.41},{"x":25.18,"y":32.36},{"x":25.45,"y":32.32},{"x":25.79,"y":32.36},{"x":25.6,"y":32.41},{"x":25.79,"y":32.46},{"x":25.6,"y":32.51},{"x":25.79,"y":32.56},{"x":25.61,"y":32.74},{"x":25.78,"y":32.75},{"x":25.94,"y":32.44},{"x":26.06,"y":33.03},{"x":26.14,"y":31.56}],"bounds":{"x":24.93,"y":31.56,"w":1.9,"h":8.04},"color":"green","solid":true,"category":"dense"},{"id":"DI-PF-A-T12-feat1","areaId":"DI-PF-A-T12","polygon":[{"x":27.88,"y":33.37},{"x":28.16,"y":32.94},{"x":28.54,"y":32.8},{"x":29.26,"y":33.01},{"x":29.92,"y":32.74},{"x":30.69,"y":33.01},{"x":31.42,"y":32.8},{"x":31.94,"y":33.08},{"x":32.1,"y":33.59},{"x":31.84,"y":34.2},{"x":31.19,"y":34.36},{"x":30.69,"y":34.14},{"x":30.18,"y":34.46},{"x":29.78,"y":34.46},{"x":29.27,"y":34.14},{"x":28.47,"y":34.34},{"x":28.03,"y":34.1},{"x":27.88,"y":33.79}],"bounds":{"x":27.88,"y":32.74,"w":4.22,"h":1.72},"color":"green","solid":true,"category":"dense"},{"id":"DI-PF-A-T12-feat2","areaId":"DI-PF-A-T12","polygon":[{"x":28.64,"y":31.98},{"x":29.2,"y":31.62},{"x":29.93,"y":31.56},{"x":30.97,"y":31.67},{"x":31.32,"y":31.9},{"x":30.94,"y":32.3},{"x":30.47,"y":32.32},{"x":30.11,"y":32.88},{"x":30.2,"y":33.03},{"x":29.78,"y":33.03},{"x":29.87,"y":32.88},{"x":29.51,"y":32.31},{"x":29.06,"y":32.31},{"x":28.94,"y":32.06},{"x":28.7,"y":32.06}],"bounds":{"x":28.64,"y":31.56,"w":2.68,"h":1.47},"color":"green","solid":true,"category":"dense"},{"id":"DI-PF-A-T13-feat0","areaId":"DI-PF-A-T13","polygon":[{"x":33.57,"y":12.26},{"x":33.54,"y":10.94},{"x":33.12,"y":10.66},{"x":33.16,"y":10.43},{"x":33.47,"y":10.43},{"x":33.54,"y":10.27},{"x":33.54,"y":9.1},{"x":33.47,"y":8.94},{"x":33.16,"y":8.94},{"x":33.12,"y":8.72},{"x":33.55,"y":8.44},{"x":33.53,"y":7.2},{"x":33.16,"y":7.12},{"x":33.15,"y":6.79},{"x":33.47,"y":6.78},{"x":33.55,"y":6.61},{"x":33.55,"y":5.45},{"x":33.48,"y":5.28},{"x":33.16,"y":5.28},{"x":33.15,"y":4.99},{"x":33.52,"y":4.92},{"x":33.71,"y":4.3},{"x":33.94,"y":4.91},{"x":34.15,"y":4.34},{"x":34.27,"y":4.93},{"x":34.5,"y":4.22},{"x":34.68,"y":4.92},{"x":35.02,"y":4.94},{"x":35.02,"y":5.28},{"x":34.63,"y":5.43},{"x":34.64,"y":6.68},{"x":35.02,"y":6.78},{"x":35.02,"y":7.12},{"x":34.62,"y":7.27},{"x":34.63,"y":8.5},{"x":35.02,"y":8.61},{"x":35.02,"y":8.94},{"x":34.62,"y":9.09},{"x":34.62,"y":10.27},{"x":35.02,"y":10.44},{"x":35.02,"y":10.77},{"x":34.67,"y":10.79},{"x":34.57,"y":10.99},{"x":34.77,"y":11.06},{"x":34.58,"y":11.1},{"x":34.77,"y":11.16},{"x":34.59,"y":11.21},{"x":34.77,"y":11.26},{"x":34.59,"y":11.31},{"x":34.77,"y":11.36},{"x":34.59,"y":11.41},{"x":34.77,"y":11.46},{"x":34.5,"y":11.5},{"x":34.17,"y":11.46},{"x":34.35,"y":11.41},{"x":34.17,"y":11.36},{"x":34.35,"y":11.31},{"x":34.17,"y":11.26},{"x":34.34,"y":11.08},{"x":34.17,"y":11.07},{"x":34.01,"y":11.38},{"x":33.89,"y":10.79},{"x":33.81,"y":12.26}],"bounds":{"x":33.12,"y":4.22,"w":1.9,"h":8.04},"color":"green","solid":true,"category":"dense"},{"id":"DI-PF-A-T13-feat1","areaId":"DI-PF-A-T13","polygon":[{"x":32.07,"y":10.45},{"x":31.8,"y":10.88},{"x":31.41,"y":11.02},{"x":30.7,"y":10.8},{"x":30.03,"y":11.08},{"x":29.26,"y":10.8},{"x":28.53,"y":11.02},{"x":28.01,"y":10.74},{"x":27.85,"y":10.23},{"x":28.01,"y":9.74},{"x":28.36,"y":9.51},{"x":28.77,"y":9.46},{"x":29.26,"y":9.68},{"x":29.77,"y":9.36},{"x":30.17,"y":9.36},{"x":30.68,"y":9.68},{"x":31.49,"y":9.48},{"x":31.8,"y":9.6},{"x":32.07,"y":10.03}],"bounds":{"x":27.85,"y":9.36,"w":4.22,"h":1.72},"color":"green","solid":true,"category":"dense"},{"id":"DI-PF-A-T13-feat2","areaId":"DI-PF-A-T13","polygon":[{"x":31.32,"y":11.84},{"x":30.75,"y":12.2},{"x":30.02,"y":12.26},{"x":28.98,"y":12.15},{"x":28.63,"y":11.92},{"x":29.02,"y":11.52},{"x":29.49,"y":11.5},{"x":29.85,"y":10.94},{"x":29.75,"y":10.79},{"x":30.17,"y":10.79},{"x":30.08,"y":10.93},{"x":30.44,"y":11.5},{"x":30.89,"y":11.51},{"x":31.01,"y":11.76},{"x":31.25,"y":11.76}],"bounds":{"x":28.63,"y":10.79,"w":2.69,"h":1.47},"color":"green","solid":true,"category":"dense"},{"id":"DI-PF-A-T14-feat0","areaId":"DI-PF-A-T14","polygon":[{"x":15.27,"y":31.99},{"x":16.26,"y":32.3},{"x":16.71,"y":32.22},{"x":19.55,"y":33.05},{"x":19.86,"y":33.33},{"x":18.58,"y":37.42},{"x":17.6,"y":39.08},{"x":17.38,"y":38.8},{"x":17.99,"y":37.24},{"x":17.95,"y":36.82},{"x":17.79,"y":36.77},{"x":17.74,"y":37.04},{"x":17.54,"y":36.26},{"x":16.78,"y":35.63},{"x":16.8,"y":35.45},{"x":16.61,"y":35.5},{"x":16.89,"y":35.21},{"x":16.64,"y":35.06},{"x":16.99,"y":34.9},{"x":16.73,"y":34.88},{"x":16.98,"y":34.77},{"x":16.7,"y":34.67},{"x":16.65,"y":34.45},{"x":17.05,"y":34.49},{"x":16.81,"y":33.92},{"x":17.01,"y":33.43},{"x":16.78,"y":33.36},{"x":16.89,"y":32.83},{"x":16.68,"y":32.94},{"x":16.54,"y":32.68},{"x":15.98,"y":32.6},{"x":15.22,"y":32.18},{"x":15.24,"y":32}],"bounds":{"x":15.22,"y":31.99,"w":4.64,"h":7.09},"color":"green","solid":true,"category":"dense"},{"id":"DI-PF-A-T14-feat1","areaId":"DI-PF-A-T14","polygon":[{"x":13.38,"y":37.79},{"x":12.79,"y":37.71},{"x":12.59,"y":37.34},{"x":10.55,"y":36.96},{"x":7.41,"y":35.86},{"x":8.38,"y":32.95},{"x":8.8,"y":33.09},{"x":8.67,"y":33.83},{"x":9.47,"y":34.2},{"x":9.68,"y":34.13},{"x":9.56,"y":34.25},{"x":10.09,"y":34.47},{"x":10.09,"y":34.78},{"x":10.47,"y":35.14},{"x":11.42,"y":35.51},{"x":11.23,"y":36.5},{"x":12.88,"y":37.05},{"x":12.83,"y":37.45},{"x":12.93,"y":37.35},{"x":13.26,"y":37.6},{"x":13.46,"y":37.25},{"x":13.51,"y":37.51}],"bounds":{"x":7.41,"y":32.95,"w":6.1,"h":4.84},"color":"green","solid":true,"category":"dense"}],"objectives":[],"measurements":{"lines":[],"labels":[]}};

/* --- battleSim\layoutData\meatgrinder1.js --- */
/** Auto-generated from Rapid Ingress PF-PF-B — do not hand-edit polygons. */
const MEATGRINDER_1_LAYOUT = {"id":"meatgrinder-1","name":"Meatgrinder 1","page":2,"source":"Rapid Ingress PF-PF-B (Purge the Foe vs Purge the Foe Layout B)","width":60,"height":44,"deploymentZones":[{"id":"PF-PF-B-dz-atk-0","color":"red","role":"attacker","polygon":[{"x":0.19,"y":0.04},{"x":20.03,"y":0.04},{"x":20.03,"y":21.98},{"x":12.07,"y":21.98},{"x":12.07,"y":43.96},{"x":0.19,"y":43.96},{"x":0.19,"y":20.9}],"bounds":{"x":0.19,"y":0.04,"w":19.84,"h":43.92}},{"id":"PF-PF-B-dz-def-0","color":"blue","role":"defender","polygon":[{"x":59.88,"y":43.96},{"x":40.04,"y":43.96},{"x":40.04,"y":22.02},{"x":48,"y":22.02},{"x":48,"y":0.04},{"x":59.88,"y":0.04},{"x":59.88,"y":23.1}],"bounds":{"x":40.04,"y":0.04,"w":19.84,"h":43.92}}],"terrainAreas":[{"id":"PF-PF-B-T01","polygon":[{"x":33.98,"y":6.37},{"x":33.98,"y":9.75},{"x":34.44,"y":10.93},{"x":34.06,"y":12.13},{"x":34.17,"y":12.88},{"x":33.98,"y":14.26},{"x":34.57,"y":14.89},{"x":34.31,"y":16.11},{"x":33.98,"y":16.63},{"x":33.98,"y":17.96},{"x":26.95,"y":17.96},{"x":26.95,"y":6.37}],"bounds":{"x":26.95,"y":6.37,"w":7.62,"h":11.59},"obscuring":true,"isObjective":true,"objectiveType":"centre"},{"id":"PF-PF-B-T02","polygon":[{"x":14.04,"y":42.02},{"x":14.04,"y":38.65},{"x":13.58,"y":37.46},{"x":13.96,"y":36.32},{"x":13.85,"y":35.51},{"x":14.04,"y":34.11},{"x":13.45,"y":33.5},{"x":13.71,"y":32.28},{"x":14.04,"y":31.76},{"x":14.04,"y":30.44},{"x":21.07,"y":30.44},{"x":21.07,"y":42.02}],"bounds":{"x":13.45,"y":30.44,"w":7.62,"h":11.58},"obscuring":true,"isObjective":true,"objectiveType":"expansion"},{"id":"PF-PF-B-T03","polygon":[{"x":25.96,"y":37.64},{"x":25.96,"y":34.27},{"x":25.5,"y":33.09},{"x":25.88,"y":31.95},{"x":25.77,"y":31.14},{"x":25.96,"y":29.74},{"x":25.38,"y":29.13},{"x":25.63,"y":27.91},{"x":25.96,"y":27.39},{"x":25.96,"y":26.06},{"x":33,"y":26.06},{"x":33,"y":37.64}],"bounds":{"x":25.38,"y":26.06,"w":7.62,"h":11.58},"obscuring":true,"isObjective":true,"objectiveType":"centre"},{"id":"PF-PF-B-T04","polygon":[{"x":49.42,"y":11.28},{"x":49.91,"y":12.05},{"x":49.91,"y":12.98},{"x":51.9,"y":12.98},{"x":51.9,"y":8.97},{"x":52.18,"y":8.67},{"x":52.08,"y":7.99},{"x":51.9,"y":7.86},{"x":51.9,"y":6.94},{"x":49.91,"y":6.94},{"x":49.91,"y":10.42},{"x":49.43,"y":11.21}],"bounds":{"x":49.42,"y":6.94,"w":2.76,"h":6.04},"obscuring":true,"isObjective":false,"objectiveType":null},{"id":"PF-PF-B-T04-fp4","polygon":[{"x":49.38,"y":14.83},{"x":49.94,"y":13.57},{"x":49.94,"y":13.02},{"x":52.53,"y":13.02},{"x":52.53,"y":18.53},{"x":53.07,"y":18.91},{"x":52.92,"y":19.83},{"x":52.53,"y":20.18},{"x":52.53,"y":23.04},{"x":49.94,"y":23.04},{"x":49.78,"y":20.67},{"x":49.94,"y":20.42},{"x":49.94,"y":15.62},{"x":49.46,"y":15.2},{"x":49.38,"y":14.89}],"bounds":{"x":49.38,"y":13.02,"w":3.69,"h":10.02},"obscuring":true,"isObjective":false,"objectiveType":null},{"id":"PF-PF-B-T05","polygon":[{"x":37.07,"y":41.02},{"x":37.07,"y":39.74},{"x":36.82,"y":39.52},{"x":36.69,"y":39},{"x":37.07,"y":37.55},{"x":37.07,"y":34.98},{"x":37.96,"y":34.98},{"x":38.19,"y":34.62},{"x":38.56,"y":34.71},{"x":39.12,"y":34.43},{"x":40.03,"y":34.98},{"x":41.04,"y":34.98},{"x":41.04,"y":41.02}],"bounds":{"x":36.69,"y":34.43,"w":4.35,"h":6.59},"obscuring":true,"isObjective":false,"objectiveType":null},{"id":"PF-PF-B-T06","polygon":[{"x":35.73,"y":19.51},{"x":36.84,"y":18.87},{"x":36.95,"y":18.48},{"x":37.34,"y":18.14},{"x":38.73,"y":17.77},{"x":40.96,"y":16.49},{"x":41.41,"y":17.26},{"x":41.83,"y":17.28},{"x":41.9,"y":17.6},{"x":42.49,"y":18.03},{"x":42.44,"y":19.05},{"x":42.95,"y":19.93},{"x":37.72,"y":22.95}],"bounds":{"x":35.73,"y":16.49,"w":7.22,"h":6.46},"obscuring":true,"isObjective":false,"objectiveType":null},{"id":"PF-PF-B-T06-fp8","polygon":[{"x":35.4,"y":23.98},{"x":35.43,"y":23.06},{"x":34.97,"y":22.26},{"x":36.69,"y":21.26},{"x":38.7,"y":24.74},{"x":39.12,"y":24.9},{"x":39.34,"y":25.43},{"x":39.25,"y":25.69},{"x":39.71,"y":26.49},{"x":37.99,"y":27.49},{"x":36.25,"y":24.47},{"x":35.44,"y":24.03}],"bounds":{"x":34.97,"y":21.26,"w":4.74,"h":6.23},"obscuring":true,"isObjective":false,"objectiveType":null},{"id":"PF-PF-B-T07","polygon":[{"x":48.77,"y":26.57},{"x":49.67,"y":26.75},{"x":51.95,"y":26.18},{"x":52.05,"y":28.6},{"x":50.85,"y":30.82},{"x":50.87,"y":31.25},{"x":49.63,"y":35.1},{"x":48.76,"y":36.42},{"x":48.88,"y":38.87},{"x":46.9,"y":39.36},{"x":44.1,"y":28.13},{"x":48.09,"y":27.14},{"x":48.73,"y":26.58}],"bounds":{"x":44.1,"y":26.18,"w":7.95,"h":13.18},"obscuring":true,"isObjective":true,"objectiveType":"home"},{"id":"PF-PF-B-T08","polygon":[{"x":46.03,"y":2.03},{"x":46.03,"y":5.41},{"x":46.49,"y":6.59},{"x":46.11,"y":7.79},{"x":46.22,"y":8.54},{"x":46.03,"y":9.92},{"x":46.62,"y":10.55},{"x":46.36,"y":11.77},{"x":46.03,"y":12.29},{"x":46.03,"y":13.61},{"x":39,"y":13.61},{"x":39,"y":2.03}],"bounds":{"x":39,"y":2.03,"w":7.62,"h":11.58},"obscuring":true,"isObjective":true,"objectiveType":"expansion"},{"id":"PF-PF-B-T09","polygon":[{"x":23.05,"y":3.08},{"x":23.05,"y":4.36},{"x":23.3,"y":4.58},{"x":23.42,"y":5.1},{"x":23.05,"y":6.55},{"x":23.05,"y":9.12},{"x":22.15,"y":9.12},{"x":21.89,"y":9.49},{"x":21.55,"y":9.39},{"x":20.99,"y":9.67},{"x":20.13,"y":9.13},{"x":19.07,"y":9.12},{"x":19.07,"y":3.08}],"bounds":{"x":19.07,"y":3.08,"w":4.35,"h":6.59},"obscuring":true,"isObjective":false,"objectiveType":null},{"id":"PF-PF-B-T10","polygon":[{"x":10.57,"y":32.68},{"x":10.08,"y":31.9},{"x":10.08,"y":30.98},{"x":8.09,"y":30.98},{"x":8.09,"y":34.99},{"x":7.81,"y":35.28},{"x":7.88,"y":35.9},{"x":8.09,"y":36.09},{"x":8.09,"y":37.02},{"x":10.08,"y":37.02},{"x":10.08,"y":33.53},{"x":10.56,"y":32.74}],"bounds":{"x":7.81,"y":30.98,"w":2.76,"h":6.04},"obscuring":true,"isObjective":false,"objectiveType":null},{"id":"PF-PF-B-T10-fp12","polygon":[{"x":10.6,"y":29.13},{"x":10.05,"y":30.39},{"x":10.05,"y":30.94},{"x":7.46,"y":30.94},{"x":7.46,"y":25.43},{"x":6.92,"y":25.05},{"x":7.07,"y":24.13},{"x":7.46,"y":23.78},{"x":7.46,"y":20.92},{"x":10.05,"y":20.92},{"x":10.2,"y":23.29},{"x":10.05,"y":23.53},{"x":10.05,"y":28.34},{"x":10.46,"y":28.67},{"x":10.61,"y":29.06}],"bounds":{"x":6.92,"y":20.92,"w":3.69,"h":10.02},"obscuring":true,"isObjective":false,"objectiveType":null},{"id":"PF-PF-B-T11","polygon":[{"x":24.26,"y":24.37},{"x":23.16,"y":25.01},{"x":23.05,"y":25.4},{"x":22.66,"y":25.74},{"x":21.26,"y":26.11},{"x":19.04,"y":27.39},{"x":18.59,"y":26.62},{"x":18.17,"y":26.6},{"x":18.06,"y":26.23},{"x":17.53,"y":25.89},{"x":17.57,"y":24.88},{"x":17.05,"y":23.95},{"x":22.28,"y":20.93}],"bounds":{"x":17.05,"y":20.93,"w":7.21,"h":6.46},"obscuring":true,"isObjective":false,"objectiveType":null},{"id":"PF-PF-B-T11-fp14","polygon":[{"x":24.6,"y":19.9},{"x":24.56,"y":20.82},{"x":25.03,"y":21.62},{"x":23.31,"y":22.62},{"x":21.3,"y":19.14},{"x":20.9,"y":19.03},{"x":20.66,"y":18.45},{"x":20.75,"y":18.18},{"x":20.28,"y":17.38},{"x":22.01,"y":16.39},{"x":23.75,"y":19.41},{"x":24.56,"y":19.85}],"bounds":{"x":20.28,"y":16.39,"w":4.75,"h":6.23},"obscuring":true,"isObjective":false,"objectiveType":null},{"id":"PF-PF-B-T12","polygon":[{"x":11.31,"y":17.46},{"x":10.41,"y":17.29},{"x":8.13,"y":17.86},{"x":8.03,"y":15.43},{"x":9.23,"y":13.22},{"x":9.21,"y":12.79},{"x":10.45,"y":8.94},{"x":11.33,"y":7.58},{"x":11.2,"y":5.16},{"x":13.18,"y":4.67},{"x":15.98,"y":15.9},{"x":11.99,"y":16.9},{"x":11.35,"y":17.46}],"bounds":{"x":8.03,"y":4.67,"w":7.95,"h":13.19},"obscuring":true,"isObjective":true,"objectiveType":"home"}],"terrainFeatures":[{"id":"PF-PF-B-T01-feat0","areaId":"PF-PF-B-T01","polygon":[{"x":29.77,"y":17.55},{"x":28.7,"y":17.57},{"x":28.08,"y":17.78},{"x":27.15,"y":17.65},{"x":27.17,"y":14.01},{"x":26.95,"y":13.41},{"x":27.13,"y":13.01},{"x":26.98,"y":12.34},{"x":27.15,"y":11.33},{"x":27.34,"y":11.33},{"x":27.34,"y":11.72},{"x":27.5,"y":11.8},{"x":27.34,"y":12.02},{"x":27.62,"y":12.93},{"x":27.54,"y":13.46},{"x":27.84,"y":13.52},{"x":28.01,"y":13.33},{"x":27.94,"y":13.5},{"x":28.16,"y":13.52},{"x":28.44,"y":13.26},{"x":28.91,"y":13.41},{"x":28.92,"y":13.16},{"x":29.08,"y":13.16},{"x":29.11,"y":13.52},{"x":29.19,"y":13.37},{"x":29.35,"y":13.59},{"x":29.4,"y":13.37},{"x":29.64,"y":14.03},{"x":30.12,"y":14.06},{"x":29.79,"y":14.23},{"x":30.01,"y":14.92},{"x":29.83,"y":14.9},{"x":29.95,"y":15.16},{"x":29.77,"y":15.19},{"x":29.83,"y":15.58},{"x":30.19,"y":15.69},{"x":29.78,"y":15.78},{"x":29.77,"y":16.24},{"x":29.47,"y":16.55},{"x":29.63,"y":16.62},{"x":29.54,"y":16.81},{"x":29.8,"y":16.72},{"x":29.57,"y":16.89},{"x":29.83,"y":17.44}],"bounds":{"x":26.95,"y":11.33,"w":3.24,"h":6.45},"color":"green","solid":true,"category":"dense"},{"id":"PF-PF-B-T01-feat1","areaId":"PF-PF-B-T01","polygon":[{"x":27.44,"y":6.8},{"x":28.02,"y":6.7},{"x":28.34,"y":6.98},{"x":30.24,"y":6.7},{"x":32.69,"y":6.83},{"x":33.63,"y":6.7},{"x":33.72,"y":9.8},{"x":33.28,"y":9.8},{"x":33.16,"y":9.06},{"x":32.28,"y":8.97},{"x":32.12,"y":9.1},{"x":32.18,"y":8.95},{"x":31.61,"y":8.91},{"x":31.51,"y":8.61},{"x":31.04,"y":8.39},{"x":30.03,"y":8.34},{"x":29.88,"y":7.34},{"x":28.15,"y":7.34},{"x":28.07,"y":6.95},{"x":27.85,"y":7.08},{"x":27.64,"y":6.95},{"x":27.51,"y":7.34},{"x":27.41,"y":7.11}],"bounds":{"x":27.41,"y":6.7,"w":6.31,"h":3.1},"color":"green","solid":true,"category":"dense"},{"id":"PF-PF-B-T02-feat0","areaId":"PF-PF-B-T02","polygon":[{"x":17.31,"y":41.46},{"x":16.34,"y":41.69},{"x":15.35,"y":41.34},{"x":15.16,"y":41.6},{"x":14.7,"y":41.6},{"x":14.4,"y":41.31},{"x":14.66,"y":39.96},{"x":14.86,"y":39.86},{"x":15.03,"y":40.1},{"x":14.9,"y":41.11},{"x":15.25,"y":41.08},{"x":15.35,"y":41.27},{"x":15.61,"y":40.97},{"x":15.84,"y":41.19},{"x":16.38,"y":41.1},{"x":16.53,"y":41.26},{"x":16.65,"y":41.11},{"x":16.68,"y":41.3},{"x":16.94,"y":41.19},{"x":17.1,"y":41.38},{"x":17.29,"y":41.11},{"x":17.34,"y":41.29}],"bounds":{"x":14.4,"y":39.86,"w":2.94,"h":1.83},"color":"yellow","solid":false,"category":"light"},{"id":"PF-PF-B-T02-feat1","areaId":"PF-PF-B-T02","polygon":[{"x":15.91,"y":31.06},{"x":19.35,"y":30.75},{"x":20.3,"y":30.72},{"x":20.69,"y":30.88},{"x":20.77,"y":35.16},{"x":20.45,"y":36.48},{"x":20.53,"y":36.85},{"x":20.36,"y":37.05},{"x":20.08,"y":36.86},{"x":20.15,"y":35.18},{"x":19.98,"y":34.81},{"x":19.82,"y":34.79},{"x":19.85,"y":35.07},{"x":19.42,"y":34.39},{"x":18.5,"y":34.04},{"x":18.45,"y":33.86},{"x":18.3,"y":33.97},{"x":18.47,"y":33.6},{"x":18.19,"y":33.54},{"x":18.47,"y":33.28},{"x":18.21,"y":33.35},{"x":18.42,"y":33.16},{"x":18.11,"y":33.15},{"x":17.99,"y":32.96},{"x":18.39,"y":32.86},{"x":17.98,"y":32.4},{"x":18.01,"y":31.87},{"x":17.77,"y":31.87},{"x":17.86,"y":31.6},{"x":17.71,"y":31.35},{"x":17.54,"y":31.52},{"x":17.33,"y":31.32},{"x":16.81,"y":31.42},{"x":15.92,"y":31.26},{"x":15.88,"y":31.08}],"bounds":{"x":15.88,"y":30.72,"w":4.89,"h":6.33},"color":"green","solid":true,"category":"dense"},{"id":"PF-PF-B-T03-feat0","areaId":"PF-PF-B-T03","polygon":[{"x":29.97,"y":26.4},{"x":31.04,"y":26.39},{"x":31.66,"y":26.18},{"x":32.59,"y":26.33},{"x":32.54,"y":29.97},{"x":32.75,"y":30.72},{"x":32.57,"y":30.97},{"x":32.72,"y":31.64},{"x":32.53,"y":32.65},{"x":32.35,"y":32.65},{"x":32.35,"y":32.25},{"x":32.19,"y":32.17},{"x":32.35,"y":31.95},{"x":32.08,"y":31.04},{"x":32.16,"y":30.52},{"x":31.87,"y":30.46},{"x":31.69,"y":30.64},{"x":31.76,"y":30.47},{"x":31.6,"y":30.57},{"x":31.55,"y":30.44},{"x":31.26,"y":30.71},{"x":30.8,"y":30.55},{"x":30.78,"y":30.8},{"x":30.62,"y":30.8},{"x":30.59,"y":30.44},{"x":30.51,"y":30.59},{"x":30.35,"y":30.36},{"x":30.3,"y":30.59},{"x":30.07,"y":29.92},{"x":29.59,"y":29.89},{"x":29.92,"y":29.72},{"x":29.71,"y":29.03},{"x":29.88,"y":29.06},{"x":29.76,"y":28.79},{"x":29.95,"y":28.77},{"x":29.89,"y":28.37},{"x":29.54,"y":28.26},{"x":29.97,"y":28.15},{"x":29.96,"y":27.71},{"x":30.25,"y":27.41},{"x":30.1,"y":27.34},{"x":30.19,"y":27.15},{"x":29.93,"y":27.23},{"x":30.16,"y":27.07},{"x":29.9,"y":26.51}],"bounds":{"x":29.54,"y":26.18,"w":3.21,"h":6.47},"color":"green","solid":true,"category":"dense"},{"id":"PF-PF-B-T03-feat1","areaId":"PF-PF-B-T03","polygon":[{"x":32.55,"y":37.34},{"x":31.97,"y":37.44},{"x":31.65,"y":37.16},{"x":29.75,"y":37.44},{"x":26.36,"y":37.44},{"x":26.27,"y":34.34},{"x":26.71,"y":34.34},{"x":26.83,"y":35.08},{"x":27.71,"y":35.17},{"x":27.88,"y":35.04},{"x":27.81,"y":35.19},{"x":28.38,"y":35.23},{"x":28.48,"y":35.53},{"x":28.95,"y":35.75},{"x":29.97,"y":35.8},{"x":30.11,"y":36.8},{"x":31.85,"y":36.8},{"x":31.92,"y":37.19},{"x":32.14,"y":37.06},{"x":32.35,"y":37.19},{"x":32.48,"y":36.8},{"x":32.58,"y":37.03}],"bounds":{"x":26.27,"y":34.34,"w":6.31,"h":3.1},"color":"green","solid":true,"category":"dense"},{"id":"PF-PF-B-T04-feat0","areaId":"PF-PF-B-T04","polygon":[{"x":51.04,"y":7.59},{"x":50.85,"y":8.19},{"x":50.42,"y":8.2},{"x":50.43,"y":8.55},{"x":50.89,"y":8.61},{"x":50.89,"y":9.71},{"x":50.15,"y":9.8},{"x":50.15,"y":10.14},{"x":50.89,"y":10.24},{"x":50.87,"y":11.38},{"x":50.19,"y":11.38},{"x":50.15,"y":11.75},{"x":50.86,"y":11.75},{"x":50.97,"y":12.35},{"x":51.16,"y":12.25},{"x":51.23,"y":11.73},{"x":51.58,"y":11.76},{"x":51.72,"y":11.58},{"x":51.16,"y":11.32},{"x":51.17,"y":10.21},{"x":51.72,"y":9.98},{"x":51.17,"y":9.73},{"x":51.16,"y":8.63},{"x":51.72,"y":8.35},{"x":51.58,"y":8.18},{"x":51.23,"y":8.22},{"x":51.09,"y":7.68}],"bounds":{"x":50.15,"y":7.59,"w":1.57,"h":4.76},"color":"yellow","solid":false,"category":"light"},{"id":"PF-PF-B-T04-feat1","areaId":"PF-PF-B-T04","polygon":[{"x":50.96,"y":12.97},{"x":52.02,"y":13.04},{"x":51.97,"y":13.18},{"x":51.3,"y":13.24},{"x":51.3,"y":16.47},{"x":51.97,"y":16.53},{"x":51.98,"y":16.73},{"x":50.77,"y":16.61},{"x":50.77,"y":15.01},{"x":50.97,"y":14.86},{"x":50.77,"y":14.69},{"x":50.77,"y":13.09},{"x":50.93,"y":13.01}],"bounds":{"x":50.77,"y":12.97,"w":1.25,"h":3.76},"color":"yellow","solid":false,"category":"light"},{"id":"PF-PF-B-T04-feat2","areaId":"PF-PF-B-T04","polygon":[{"x":50.96,"y":19.25},{"x":52.02,"y":19.32},{"x":51.97,"y":19.46},{"x":51.3,"y":19.52},{"x":51.3,"y":22.76},{"x":51.97,"y":22.81},{"x":51.98,"y":23.02},{"x":50.77,"y":22.89},{"x":50.77,"y":21.29},{"x":50.97,"y":21.14},{"x":50.77,"y":20.98},{"x":50.77,"y":19.38},{"x":50.93,"y":19.3}],"bounds":{"x":50.77,"y":19.25,"w":1.25,"h":3.77},"color":"yellow","solid":false,"category":"light"},{"id":"PF-PF-B-T04-feat3","areaId":"PF-PF-B-T04","polygon":[{"x":49.94,"y":19.11},{"x":50.01,"y":18.87},{"x":50.58,"y":18.81},{"x":50.58,"y":17.39},{"x":50,"y":17.32},{"x":49.99,"y":17.04},{"x":50.72,"y":16.88},{"x":51.05,"y":16.99},{"x":51.28,"y":16.39},{"x":51.38,"y":16.99},{"x":51.6,"y":16.68},{"x":51.85,"y":17.01},{"x":52.51,"y":17.09},{"x":52.43,"y":17.32},{"x":51.84,"y":17.39},{"x":51.84,"y":18.81},{"x":52.43,"y":18.88},{"x":52.44,"y":19.16},{"x":51.38,"y":19.24},{"x":51.21,"y":19.8},{"x":51.04,"y":19.21},{"x":51,"y":19.47},{"x":50.8,"y":19.5},{"x":50.58,"y":19.19},{"x":50.06,"y":19.18}],"bounds":{"x":49.94,"y":16.39,"w":2.57,"h":3.41},"color":"green","solid":true,"category":"dense"},{"id":"PF-PF-B-T05-feat0","areaId":"PF-PF-B-T05","polygon":[{"x":39.35,"y":35.79},{"x":38.94,"y":36.06},{"x":38.8,"y":36.44},{"x":39.01,"y":37.19},{"x":38.74,"y":37.84},{"x":39.01,"y":38.63},{"x":38.79,"y":39.3},{"x":39.06,"y":39.86},{"x":39.59,"y":40.01},{"x":40.22,"y":39.73},{"x":40.37,"y":39.21},{"x":40.15,"y":38.61},{"x":40.46,"y":38.1},{"x":40.46,"y":37.7},{"x":40.15,"y":37.19},{"x":40.34,"y":36.39},{"x":40.21,"y":36.06},{"x":39.8,"y":35.79}],"bounds":{"x":38.74,"y":35.79,"w":1.72,"h":4.22},"color":"green","solid":true,"category":"dense"},{"id":"PF-PF-B-T05-feat1","areaId":"PF-PF-B-T05","polygon":[{"x":37.97,"y":36.56},{"x":37.62,"y":37.11},{"x":37.55,"y":37.84},{"x":37.67,"y":38.9},{"x":37.89,"y":39.23},{"x":38.3,"y":38.84},{"x":38.3,"y":38.4},{"x":38.88,"y":38.02},{"x":39.01,"y":38.11},{"x":39.01,"y":37.7},{"x":38.87,"y":37.79},{"x":38.3,"y":37.42},{"x":38.1,"y":36.7}],"bounds":{"x":37.55,"y":36.56,"w":1.46,"h":2.67},"color":"green","solid":true,"category":"dense"},{"id":"PF-PF-B-T06-feat0","areaId":"PF-PF-B-T06","polygon":[{"x":40.92,"y":20.62},{"x":42.28,"y":19.98},{"x":42.43,"y":19.7},{"x":41.51,"y":18.36},{"x":41.09,"y":17.34},{"x":40.92,"y":17.44},{"x":41.08,"y":17.94},{"x":40.86,"y":18.17},{"x":41.44,"y":19.18},{"x":41.82,"y":19.15},{"x":41.66,"y":19.31},{"x":41.89,"y":19.62},{"x":41.13,"y":19.97},{"x":40.85,"y":20.29},{"x":40.87,"y":20.6}],"bounds":{"x":40.85,"y":17.34,"w":1.58,"h":3.28},"color":"yellow","solid":false,"category":"light"},{"id":"PF-PF-B-T06-feat1","areaId":"PF-PF-B-T06","polygon":[{"x":37.45,"y":18.97},{"x":36.49,"y":19.19},{"x":36.01,"y":19.65},{"x":36.24,"y":20.14},{"x":36.63,"y":20.22},{"x":37.65,"y":22.09},{"x":37.95,"y":21.92},{"x":37.73,"y":21.41},{"x":36.85,"y":19.91},{"x":36.64,"y":19.95},{"x":36.51,"y":19.72},{"x":37.11,"y":19.59},{"x":37.6,"y":19.07}],"bounds":{"x":36.01,"y":18.97,"w":1.94,"h":3.12},"color":"yellow","solid":false,"category":"light"},{"id":"PF-PF-B-T06-feat2","areaId":"PF-PF-B-T06","polygon":[{"x":39.89,"y":27.94},{"x":39.25,"y":26.78},{"x":39.48,"y":26.33},{"x":39.33,"y":26.15},{"x":39.06,"y":26.31},{"x":38.92,"y":26.2},{"x":38.34,"y":25.19},{"x":38.59,"y":24.86},{"x":38.51,"y":24.65},{"x":38,"y":24.61},{"x":37.4,"y":23.54},{"x":37.66,"y":23.23},{"x":37.52,"y":22.99},{"x":37.23,"y":23.14},{"x":37.09,"y":23.03},{"x":36.5,"y":22.03},{"x":36.48,"y":21.85},{"x":36.76,"y":21.69},{"x":36.62,"y":21.43},{"x":36.29,"y":21.56},{"x":35.79,"y":21.11},{"x":35.9,"y":21.76},{"x":35.42,"y":21.37},{"x":35.62,"y":21.94},{"x":35.07,"y":21.44},{"x":35.26,"y":22.16},{"x":34.98,"y":22.33},{"x":35.14,"y":22.62},{"x":35.56,"y":22.55},{"x":36.17,"y":23.64},{"x":35.89,"y":23.92},{"x":36.06,"y":24.21},{"x":36.44,"y":24.09},{"x":37.09,"y":25.22},{"x":36.81,"y":25.5},{"x":36.97,"y":25.79},{"x":37.4,"y":25.72},{"x":37.99,"y":26.74},{"x":38.01,"y":26.92},{"x":37.72,"y":27.09},{"x":37.89,"y":27.37},{"x":38.2,"y":27.22},{"x":38.39,"y":27.34},{"x":38.25,"y":27.5},{"x":38.43,"y":27.44},{"x":38.3,"y":27.59},{"x":38.48,"y":27.54},{"x":38.35,"y":27.68},{"x":38.53,"y":27.62},{"x":38.39,"y":27.76},{"x":38.58,"y":27.71},{"x":38.44,"y":27.85},{"x":38.7,"y":27.75},{"x":38.97,"y":27.54},{"x":38.79,"y":27.59},{"x":38.92,"y":27.46},{"x":38.68,"y":27.39},{"x":38.83,"y":27.29},{"x":38.63,"y":27.3},{"x":39.07,"y":27.4},{"x":38.88,"y":26.83},{"x":39.68,"y":28.06}],"bounds":{"x":34.98,"y":21.11,"w":4.91,"h":6.95},"color":"green","solid":true,"category":"dense"},{"id":"PF-PF-B-T07-feat0","areaId":"PF-PF-B-T07","polygon":[{"x":48.65,"y":38.54},{"x":47.59,"y":39.09},{"x":47.18,"y":39.02},{"x":46.85,"y":38.8},{"x":46.86,"y":37.59},{"x":47.21,"y":38},{"x":47.36,"y":38.61},{"x":48.65,"y":38.43}],"bounds":{"x":46.85,"y":37.59,"w":1.8,"h":1.5},"color":"yellow","solid":false,"category":"light"},{"id":"PF-PF-B-T07-feat1","areaId":"PF-PF-B-T07","polygon":[{"x":45.78,"y":33.09},{"x":45.52,"y":32.11},{"x":45.01,"y":31.32},{"x":45.07,"y":30.57},{"x":44.73,"y":29.2},{"x":44.42,"y":28.92},{"x":44.46,"y":28.46},{"x":44.92,"y":28.18},{"x":45.47,"y":28.28},{"x":46.41,"y":28.05},{"x":47.31,"y":27.58},{"x":48.7,"y":27.54},{"x":48.74,"y":27.69},{"x":48,"y":27.88},{"x":47.8,"y":28.14},{"x":48.02,"y":29.05},{"x":47.87,"y":29.09},{"x":47.8,"y":28.87},{"x":47.87,"y":29.47},{"x":47.65,"y":29.58},{"x":47.74,"y":29.86},{"x":47.42,"y":30.31},{"x":47.57,"y":30.47},{"x":47.32,"y":30.38},{"x":47.29,"y":30.64},{"x":47.45,"y":30.7},{"x":47.26,"y":30.75},{"x":47.55,"y":31.06},{"x":46.51,"y":31.31},{"x":46.39,"y":31.16},{"x":46.7,"y":31.1},{"x":46.26,"y":31.05},{"x":46.28,"y":30.91},{"x":45.73,"y":31.22},{"x":45.39,"y":31.15},{"x":45.9,"y":32.92}],"bounds":{"x":44.42,"y":27.54,"w":4.32,"h":5.55},"color":"green","solid":true,"category":"dense"},{"id":"PF-PF-B-T08-feat0","areaId":"PF-PF-B-T08","polygon":[{"x":42.75,"y":2.59},{"x":43.71,"y":2.36},{"x":44.7,"y":2.71},{"x":44.9,"y":2.45},{"x":45.36,"y":2.46},{"x":45.65,"y":2.74},{"x":45.39,"y":4.09},{"x":45.19,"y":4.19},{"x":45.02,"y":3.95},{"x":45.15,"y":2.94},{"x":44.8,"y":2.97},{"x":44.7,"y":2.78},{"x":44.44,"y":3.08},{"x":44.21,"y":2.86},{"x":43.67,"y":2.96},{"x":43.52,"y":2.79},{"x":43.4,"y":2.94},{"x":43.37,"y":2.75},{"x":43.11,"y":2.86},{"x":42.95,"y":2.67},{"x":42.76,"y":2.94},{"x":42.71,"y":2.76}],"bounds":{"x":42.71,"y":2.36,"w":2.94,"h":1.83},"color":"yellow","solid":false,"category":"light"},{"id":"PF-PF-B-T08-feat1","areaId":"PF-PF-B-T08","polygon":[{"x":44.07,"y":13.03},{"x":40.63,"y":13.34},{"x":39.68,"y":13.37},{"x":39.29,"y":13.21},{"x":39.21,"y":8.93},{"x":39.53,"y":7.61},{"x":39.45,"y":7.24},{"x":39.62,"y":7.04},{"x":39.91,"y":7.23},{"x":39.83,"y":8.91},{"x":40,"y":9.28},{"x":40.16,"y":9.3},{"x":40.13,"y":9.02},{"x":40.56,"y":9.7},{"x":41.48,"y":10.05},{"x":41.53,"y":10.23},{"x":41.68,"y":10.12},{"x":41.52,"y":10.49},{"x":41.79,"y":10.55},{"x":41.52,"y":10.81},{"x":41.77,"y":10.74},{"x":41.57,"y":10.93},{"x":41.88,"y":10.94},{"x":41.99,"y":11.13},{"x":41.59,"y":11.23},{"x":42,"y":11.69},{"x":41.97,"y":12.22},{"x":42.21,"y":12.22},{"x":42.12,"y":12.49},{"x":42.27,"y":12.74},{"x":42.44,"y":12.57},{"x":42.66,"y":12.77},{"x":43.18,"y":12.67},{"x":44.06,"y":12.83},{"x":44.1,"y":13.01}],"bounds":{"x":39.21,"y":7.04,"w":4.89,"h":6.33},"color":"green","solid":true,"category":"dense"},{"id":"PF-PF-B-T09-feat0","areaId":"PF-PF-B-T09","polygon":[{"x":20.66,"y":3.85},{"x":21.08,"y":4.13},{"x":21.22,"y":4.51},{"x":21.01,"y":5.26},{"x":21.25,"y":6.18},{"x":21.01,"y":6.69},{"x":21.23,"y":7.37},{"x":20.96,"y":7.92},{"x":20.43,"y":8.07},{"x":19.8,"y":7.79},{"x":19.65,"y":7.28},{"x":19.87,"y":6.67},{"x":19.55,"y":6.17},{"x":19.55,"y":5.76},{"x":19.87,"y":5.26},{"x":19.68,"y":4.46},{"x":19.8,"y":4.13},{"x":20.22,"y":3.85}],"bounds":{"x":19.55,"y":3.85,"w":1.7,"h":4.22},"color":"green","solid":true,"category":"dense"},{"id":"PF-PF-B-T09-feat1","areaId":"PF-PF-B-T09","polygon":[{"x":22.05,"y":4.62},{"x":22.4,"y":5.18},{"x":22.47,"y":5.91},{"x":22.35,"y":6.97},{"x":22.13,"y":7.3},{"x":21.72,"y":6.91},{"x":21.72,"y":6.46},{"x":21.14,"y":6.08},{"x":21,"y":6.18},{"x":21,"y":5.76},{"x":21.15,"y":5.86},{"x":21.72,"y":5.49},{"x":21.92,"y":4.76}],"bounds":{"x":21,"y":4.62,"w":1.47,"h":2.68},"color":"green","solid":true,"category":"dense"},{"id":"PF-PF-B-T10-feat0","areaId":"PF-PF-B-T10","polygon":[{"x":8.93,"y":36.37},{"x":9.12,"y":35.77},{"x":9.55,"y":35.76},{"x":9.54,"y":35.41},{"x":9.08,"y":35.35},{"x":9.07,"y":34.25},{"x":9.81,"y":34.16},{"x":9.78,"y":33.8},{"x":9.07,"y":33.72},{"x":9.1,"y":32.58},{"x":9.78,"y":32.58},{"x":9.81,"y":32.21},{"x":9.11,"y":32.21},{"x":9,"y":31.61},{"x":8.81,"y":31.71},{"x":8.74,"y":32.23},{"x":8.39,"y":32.19},{"x":8.25,"y":32.37},{"x":8.38,"y":32.57},{"x":8.81,"y":32.64},{"x":8.8,"y":33.75},{"x":8.25,"y":33.97},{"x":8.38,"y":34.17},{"x":8.8,"y":34.23},{"x":8.81,"y":35.33},{"x":8.25,"y":35.61},{"x":8.39,"y":35.78},{"x":8.73,"y":35.74},{"x":8.88,"y":36.28}],"bounds":{"x":8.25,"y":31.61,"w":1.56,"h":4.76},"color":"yellow","solid":false,"category":"light"},{"id":"PF-PF-B-T10-feat1","areaId":"PF-PF-B-T10","polygon":[{"x":9.01,"y":30.99},{"x":7.95,"y":30.92},{"x":8,"y":30.78},{"x":8.67,"y":30.72},{"x":8.67,"y":27.48},{"x":7.99,"y":27.43},{"x":7.99,"y":27.22},{"x":9.19,"y":27.35},{"x":9.19,"y":28.95},{"x":8.99,"y":29.1},{"x":9.19,"y":29.26},{"x":9.19,"y":30.86},{"x":9.04,"y":30.94}],"bounds":{"x":7.95,"y":27.22,"w":1.24,"h":3.77},"color":"yellow","solid":false,"category":"light"},{"id":"PF-PF-B-T10-feat2","areaId":"PF-PF-B-T10","polygon":[{"x":9.01,"y":24.7},{"x":7.95,"y":24.64},{"x":8,"y":24.49},{"x":8.67,"y":24.43},{"x":8.67,"y":21.2},{"x":7.99,"y":21.14},{"x":7.99,"y":20.94},{"x":9.19,"y":21.06},{"x":9.19,"y":22.67},{"x":8.99,"y":22.81},{"x":9.19,"y":22.98},{"x":9.19,"y":24.58},{"x":9.04,"y":24.66}],"bounds":{"x":7.95,"y":20.94,"w":1.24,"h":3.76},"color":"yellow","solid":false,"category":"light"},{"id":"PF-PF-B-T10-feat3","areaId":"PF-PF-B-T10","polygon":[{"x":10.03,"y":24.84},{"x":9.96,"y":25.08},{"x":9.38,"y":25.15},{"x":9.38,"y":26.57},{"x":9.97,"y":26.64},{"x":9.98,"y":26.92},{"x":9.25,"y":27.08},{"x":8.92,"y":26.97},{"x":8.69,"y":27.57},{"x":8.59,"y":26.97},{"x":8.36,"y":27.27},{"x":8.12,"y":26.95},{"x":7.46,"y":26.87},{"x":7.54,"y":26.64},{"x":8.12,"y":26.56},{"x":8.12,"y":25.15},{"x":7.54,"y":25.08},{"x":7.53,"y":24.8},{"x":8.59,"y":24.72},{"x":8.76,"y":24.15},{"x":8.92,"y":24.75},{"x":8.97,"y":24.49},{"x":9.17,"y":24.46},{"x":9.38,"y":24.76},{"x":9.91,"y":24.78}],"bounds":{"x":7.46,"y":24.15,"w":2.57,"h":3.42},"color":"green","solid":true,"category":"dense"},{"id":"PF-PF-B-T11-feat0","areaId":"PF-PF-B-T11","polygon":[{"x":19.05,"y":23.27},{"x":17.7,"y":23.9},{"x":17.55,"y":24.18},{"x":18.39,"y":25.39},{"x":18.88,"y":26.54},{"x":19.05,"y":26.44},{"x":18.89,"y":25.94},{"x":19.1,"y":25.68},{"x":18.54,"y":24.7},{"x":18.15,"y":24.73},{"x":18.31,"y":24.57},{"x":18.09,"y":24.26},{"x":18.84,"y":23.91},{"x":19.12,"y":23.59},{"x":19.1,"y":23.28}],"bounds":{"x":17.55,"y":23.27,"w":1.57,"h":3.27},"color":"yellow","solid":false,"category":"light"},{"id":"PF-PF-B-T11-feat1","areaId":"PF-PF-B-T11","polygon":[{"x":22.53,"y":24.91},{"x":23.48,"y":24.69},{"x":23.97,"y":24.23},{"x":23.64,"y":23.65},{"x":23.34,"y":23.66},{"x":22.33,"y":21.79},{"x":22.03,"y":21.97},{"x":22.25,"y":22.47},{"x":23.13,"y":23.97},{"x":23.34,"y":23.93},{"x":23.47,"y":24.16},{"x":22.86,"y":24.29},{"x":22.38,"y":24.81}],"bounds":{"x":22.03,"y":21.79,"w":1.94,"h":3.12},"color":"yellow","solid":false,"category":"light"},{"id":"PF-PF-B-T11-feat2","areaId":"PF-PF-B-T11","polygon":[{"x":20.09,"y":15.94},{"x":20.72,"y":17.1},{"x":20.75,"y":17.27},{"x":20.47,"y":17.45},{"x":20.55,"y":17.64},{"x":21.06,"y":17.68},{"x":21.64,"y":18.69},{"x":21.39,"y":19.02},{"x":21.47,"y":19.23},{"x":21.98,"y":19.27},{"x":22.58,"y":20.34},{"x":22.32,"y":20.66},{"x":22.46,"y":20.89},{"x":22.74,"y":20.74},{"x":22.89,"y":20.85},{"x":23.47,"y":21.85},{"x":23.49,"y":22.03},{"x":23.22,"y":22.19},{"x":23.35,"y":22.45},{"x":23.69,"y":22.32},{"x":24.18,"y":22.77},{"x":24.08,"y":22.12},{"x":24.55,"y":22.51},{"x":24.35,"y":21.94},{"x":24.91,"y":22.44},{"x":24.71,"y":21.75},{"x":25,"y":21.55},{"x":24.83,"y":21.26},{"x":24.42,"y":21.33},{"x":23.8,"y":20.24},{"x":24.08,"y":19.97},{"x":23.91,"y":19.67},{"x":23.49,"y":19.74},{"x":22.88,"y":18.66},{"x":23.17,"y":18.38},{"x":23,"y":18.09},{"x":22.58,"y":18.16},{"x":21.99,"y":17.14},{"x":21.97,"y":16.96},{"x":22.25,"y":16.79},{"x":22.09,"y":16.51},{"x":21.77,"y":16.66},{"x":21.59,"y":16.54},{"x":21.73,"y":16.38},{"x":21.54,"y":16.43},{"x":21.68,"y":16.29},{"x":21.49,"y":16.34},{"x":21.63,"y":16.2},{"x":21.45,"y":16.26},{"x":21.58,"y":16.12},{"x":21.4,"y":16.17},{"x":21.53,"y":16.04},{"x":21.28,"y":16.13},{"x":21,"y":16.34},{"x":21.19,"y":16.29},{"x":21.05,"y":16.43},{"x":21.24,"y":16.38},{"x":21.1,"y":16.51},{"x":21.34,"y":16.58},{"x":20.91,"y":16.48},{"x":21.1,"y":17.05},{"x":20.29,"y":15.82}],"bounds":{"x":20.09,"y":15.82,"w":4.91,"h":6.95},"color":"green","solid":true,"category":"dense"},{"id":"PF-PF-B-T12-feat0","areaId":"PF-PF-B-T12","polygon":[{"x":11.41,"y":5.5},{"x":12.47,"y":4.95},{"x":12.88,"y":5.01},{"x":13.21,"y":5.24},{"x":13.2,"y":6.44},{"x":12.85,"y":6.04},{"x":12.7,"y":5.42},{"x":11.41,"y":5.6}],"bounds":{"x":11.41,"y":4.95,"w":1.8,"h":1.49},"color":"yellow","solid":false,"category":"light"},{"id":"PF-PF-B-T12-feat1","areaId":"PF-PF-B-T12","polygon":[{"x":14.29,"y":10.94},{"x":14.54,"y":11.92},{"x":15.05,"y":12.72},{"x":14.99,"y":13.47},{"x":15.33,"y":14.84},{"x":15.64,"y":15.11},{"x":15.6,"y":15.58},{"x":15.14,"y":15.86},{"x":14.59,"y":15.76},{"x":13.65,"y":15.99},{"x":12.75,"y":16.45},{"x":11.36,"y":16.5},{"x":11.33,"y":16.34},{"x":12.06,"y":16.15},{"x":12.26,"y":15.89},{"x":12.04,"y":14.99},{"x":12.19,"y":14.95},{"x":12.26,"y":15.16},{"x":12.19,"y":14.57},{"x":12.41,"y":14.46},{"x":12.32,"y":14.17},{"x":12.64,"y":13.73},{"x":12.49,"y":13.57},{"x":12.74,"y":13.66},{"x":12.77,"y":13.39},{"x":12.61,"y":13.34},{"x":12.8,"y":13.29},{"x":12.51,"y":12.97},{"x":13.55,"y":12.73},{"x":13.67,"y":12.87},{"x":13.36,"y":12.94},{"x":13.8,"y":12.98},{"x":13.78,"y":13.12},{"x":14.33,"y":12.81},{"x":14.67,"y":12.89},{"x":14.16,"y":11.11}],"bounds":{"x":11.33,"y":10.94,"w":4.31,"h":5.56},"color":"green","solid":true,"category":"dense"}],"objectives":[],"measurements":{"lines":[],"labels":[]}};

/* --- battleSim\layoutData\unstoppableForce.js --- */
/** Auto-generated from Rapid Ingress PF-TH-A — do not hand-edit polygons. */
const UNSTOPPABLE_FORCE_LAYOUT = {"id":"unstoppable-force","name":"Unstoppable Force","page":3,"source":"Rapid Ingress PF-TH-A (Purge the Foe vs Take and Hold Layout A)","width":60,"height":44,"deploymentZones":[{"id":"PF-TH-A-dz-atk-0","color":"red","role":"attacker","polygon":[{"x":30.03,"y":13.99},{"x":0.14,"y":13.99},{"x":0.14,"y":0.04},{"x":59.88,"y":0.04},{"x":59.88,"y":8.01},{"x":30.03,"y":8.01}],"bounds":{"x":0.14,"y":0.04,"w":59.74,"h":13.95}},{"id":"PF-TH-A-dz-def-0","color":"blue","role":"defender","polygon":[{"x":59.88,"y":43.96},{"x":0.13,"y":43.96},{"x":0.13,"y":35.98},{"x":30.03,"y":35.98},{"x":30.03,"y":30.01},{"x":59.88,"y":30.01}],"bounds":{"x":0.13,"y":30.01,"w":59.75,"h":13.95}}],"terrainAreas":[{"id":"PF-TH-A-T01","polygon":[{"x":42.5,"y":31.95},{"x":45.87,"y":31.95},{"x":47.05,"y":31.49},{"x":48.25,"y":31.87},{"x":48.95,"y":31.75},{"x":50.38,"y":31.95},{"x":51.01,"y":31.36},{"x":52.27,"y":31.63},{"x":52.75,"y":31.95},{"x":54.08,"y":31.95},{"x":54.08,"y":38.98},{"x":42.5,"y":38.98}],"bounds":{"x":42.5,"y":31.36,"w":11.58,"h":7.62},"obscuring":true,"isObjective":true,"objectiveType":"home"},{"id":"PF-TH-A-T02","polygon":[{"x":16.58,"y":34.03},{"x":13.21,"y":34.03},{"x":12.02,"y":34.49},{"x":10.82,"y":34.11},{"x":10.13,"y":34.23},{"x":8.69,"y":34.03},{"x":8.06,"y":34.62},{"x":6.84,"y":34.36},{"x":6.32,"y":34.03},{"x":5,"y":34.03},{"x":5,"y":27},{"x":16.58,"y":27}],"bounds":{"x":5,"y":27,"w":11.58,"h":7.62},"obscuring":true,"isObjective":true,"objectiveType":"expansion"},{"id":"PF-TH-A-T03","polygon":[{"x":26.75,"y":39.91},{"x":25.47,"y":40.42},{"x":25.08,"y":40.8},{"x":23.25,"y":38.97},{"x":27.14,"y":35.07},{"x":27.03,"y":34.42},{"x":27.79,"y":33.88},{"x":28.31,"y":33.91},{"x":30.33,"y":31.89},{"x":32.16,"y":33.72},{"x":30.6,"y":35.5},{"x":30.32,"y":35.57},{"x":26.92,"y":38.97},{"x":26.98,"y":39.49},{"x":26.8,"y":39.87}],"bounds":{"x":23.25,"y":31.89,"w":8.91,"h":8.91},"obscuring":true,"isObjective":false,"objectiveType":null},{"id":"PF-TH-A-T04","polygon":[{"x":34.85,"y":30.78},{"x":35.8,"y":31.63},{"x":36.13,"y":31.59},{"x":36.64,"y":31.88},{"x":37.42,"y":33.1},{"x":39.33,"y":34.82},{"x":38.73,"y":35.48},{"x":38.85,"y":35.89},{"x":38.53,"y":36.1},{"x":38.37,"y":36.71},{"x":37.39,"y":36.99},{"x":36.67,"y":37.77},{"x":32.19,"y":33.73}],"bounds":{"x":32.19,"y":30.78,"w":7.14,"h":6.99},"obscuring":true,"isObjective":false,"objectiveType":null},{"id":"PF-TH-A-T05","polygon":[{"x":23.84,"y":22.08},{"x":24.22,"y":21.26},{"x":24.22,"y":18.9},{"x":26.6,"y":19.38},{"x":28.43,"y":21.06},{"x":28.88,"y":21.17},{"x":32.35,"y":23.33},{"x":33.4,"y":24.47},{"x":35.8,"y":24.95},{"x":35.8,"y":26.99},{"x":24.22,"y":26.99},{"x":24.22,"y":22.88},{"x":23.83,"y":22.12}],"bounds":{"x":23.83,"y":18.9,"w":11.97,"h":8.09},"obscuring":true,"isObjective":true,"objectiveType":"centre"},{"id":"PF-TH-A-T05-fp10","polygon":[{"x":36.18,"y":21.85},{"x":35.8,"y":22.67},{"x":35.8,"y":25.03},{"x":33.42,"y":24.55},{"x":31.59,"y":22.87},{"x":31.14,"y":22.76},{"x":27.67,"y":20.6},{"x":26.6,"y":19.45},{"x":24.22,"y":18.98},{"x":24.22,"y":16.94},{"x":35.8,"y":16.94},{"x":35.8,"y":21.06},{"x":36.19,"y":21.82}],"bounds":{"x":24.22,"y":16.94,"w":11.97,"h":8.09},"obscuring":true,"isObjective":true,"objectiveType":"centre"},{"id":"PF-TH-A-T06","polygon":[{"x":19.05,"y":38.37},{"x":18.56,"y":39.15},{"x":18.56,"y":40.07},{"x":16.57,"y":40.07},{"x":16.57,"y":36.06},{"x":16.29,"y":35.77},{"x":16.36,"y":35.14},{"x":16.57,"y":34.96},{"x":16.57,"y":34.03},{"x":18.56,"y":34.03},{"x":18.56,"y":37.52},{"x":19.04,"y":38.31}],"bounds":{"x":16.29,"y":34.03,"w":2.76,"h":6.04},"obscuring":true,"isObjective":false,"objectiveType":null},{"id":"PF-TH-A-T07","polygon":[{"x":17.63,"y":12.1},{"x":14.24,"y":12.1},{"x":13.08,"y":12.55},{"x":11.94,"y":12.18},{"x":11.13,"y":12.29},{"x":9.73,"y":12.1},{"x":9.12,"y":12.68},{"x":7.86,"y":12.41},{"x":7.38,"y":12.1},{"x":6.05,"y":12.1},{"x":6.05,"y":5.06},{"x":17.63,"y":5.06}],"bounds":{"x":6.05,"y":5.06,"w":11.58,"h":7.62},"obscuring":true,"isObjective":true,"objectiveType":"home"},{"id":"PF-TH-A-T08","polygon":[{"x":43.44,"y":9.9},{"x":46.81,"y":9.9},{"x":48,"y":9.44},{"x":49.14,"y":9.82},{"x":49.95,"y":9.71},{"x":51.33,"y":9.9},{"x":51.96,"y":9.31},{"x":53.18,"y":9.57},{"x":53.7,"y":9.9},{"x":55.02,"y":9.9},{"x":55.02,"y":16.93},{"x":43.44,"y":16.93}],"bounds":{"x":43.44,"y":9.31,"w":11.58,"h":7.62},"obscuring":true,"isObjective":true,"objectiveType":"expansion"},{"id":"PF-TH-A-T09","polygon":[{"x":33.6,"y":3.91},{"x":34.88,"y":3.41},{"x":35.27,"y":3.02},{"x":37.1,"y":4.85},{"x":33.21,"y":8.75},{"x":33.32,"y":9.4},{"x":32.56,"y":9.95},{"x":32.04,"y":9.91},{"x":30.02,"y":11.93},{"x":28.18,"y":10.1},{"x":29.79,"y":8.28},{"x":30.03,"y":8.25},{"x":33.43,"y":4.86},{"x":33.38,"y":4.22},{"x":33.55,"y":3.95}],"bounds":{"x":28.18,"y":3.02,"w":8.92,"h":8.91},"obscuring":true,"isObjective":false,"objectiveType":null},{"id":"PF-TH-A-T10","polygon":[{"x":25.5,"y":13.05},{"x":24.56,"y":12.19},{"x":24.22,"y":12.23},{"x":23.71,"y":11.94},{"x":22.93,"y":10.73},{"x":21.02,"y":9.01},{"x":21.62,"y":8.34},{"x":21.5,"y":7.94},{"x":21.82,"y":7.72},{"x":21.98,"y":7.11},{"x":22.96,"y":6.83},{"x":23.68,"y":6.05},{"x":28.16,"y":10.09}],"bounds":{"x":21.02,"y":6.05,"w":7.14,"h":7.0},"obscuring":true,"isObjective":false,"objectiveType":null},{"id":"PF-TH-A-T11","polygon":[{"x":40.97,"y":5.56},{"x":41.46,"y":4.79},{"x":41.46,"y":3.86},{"x":43.45,"y":3.86},{"x":43.45,"y":7.88},{"x":43.73,"y":8.17},{"x":43.66,"y":8.79},{"x":43.45,"y":8.98},{"x":43.45,"y":9.9},{"x":41.46,"y":9.9},{"x":41.46,"y":6.42},{"x":40.98,"y":5.63}],"bounds":{"x":40.97,"y":3.86,"w":2.76,"h":6.04},"obscuring":true,"isObjective":false,"objectiveType":null},{"id":"PF-TH-A-T12","polygon":[{"x":48.53,"y":21.55},{"x":47.63,"y":21.37},{"x":46.95,"y":20.73},{"x":45.59,"y":22.17},{"x":48.5,"y":24.94},{"x":48.55,"y":25.38},{"x":49.02,"y":25.72},{"x":49.3,"y":25.69},{"x":49.97,"y":26.33},{"x":51.34,"y":24.89},{"x":48.81,"y":22.49},{"x":48.57,"y":21.6}],"bounds":{"x":45.59,"y":20.73,"w":5.75,"h":5.6},"obscuring":true,"isObjective":false,"objectiveType":null},{"id":"PF-TH-A-T12-fp13","polygon":[{"x":44.19,"y":21},{"x":43.31,"y":21.93},{"x":42.97,"y":21.92},{"x":42.45,"y":22.29},{"x":41.8,"y":23.52},{"x":40.03,"y":25.38},{"x":40.68,"y":26},{"x":40.6,"y":26.41},{"x":40.93,"y":26.6},{"x":41.14,"y":27.19},{"x":42.18,"y":27.42},{"x":42.91,"y":28.12},{"x":47.07,"y":23.74}],"bounds":{"x":40.03,"y":21,"w":7.04,"h":7.12},"obscuring":true,"isObjective":false,"objectiveType":null},{"id":"PF-TH-A-T13","polygon":[{"x":11.46,"y":22.46},{"x":12.36,"y":22.64},{"x":13.03,"y":23.28},{"x":14.4,"y":21.84},{"x":11.49,"y":19.07},{"x":11.47,"y":18.66},{"x":10.97,"y":18.29},{"x":10.69,"y":18.31},{"x":10.02,"y":17.68},{"x":8.65,"y":19.12},{"x":11.17,"y":21.52},{"x":11.42,"y":22.41}],"bounds":{"x":8.65,"y":17.68,"w":5.75,"h":5.6},"obscuring":true,"isObjective":false,"objectiveType":null},{"id":"PF-TH-A-T13-fp15","polygon":[{"x":15.8,"y":23.01},{"x":16.68,"y":22.08},{"x":17.01,"y":22.09},{"x":17.5,"y":21.76},{"x":18.18,"y":20.49},{"x":19.95,"y":18.63},{"x":19.31,"y":18.01},{"x":19.39,"y":17.6},{"x":19.06,"y":17.41},{"x":18.81,"y":16.78},{"x":17.8,"y":16.59},{"x":17.07,"y":15.89},{"x":12.91,"y":20.27}],"bounds":{"x":12.91,"y":15.89,"w":7.04,"h":7.12},"obscuring":true,"isObjective":false,"objectiveType":null}],"terrainFeatures":[{"id":"PF-TH-A-T01-feat0","areaId":"PF-TH-A-T01","polygon":[{"x":50.54,"y":32.64},{"x":51.51,"y":32.42},{"x":52.5,"y":32.77},{"x":52.69,"y":32.5},{"x":53.15,"y":32.51},{"x":53.45,"y":32.8},{"x":53.27,"y":33.96},{"x":53.12,"y":34.24},{"x":52.81,"y":34},{"x":52.94,"y":32.99},{"x":52.59,"y":33.03},{"x":52.5,"y":32.83},{"x":52.24,"y":33.14},{"x":52.01,"y":32.92},{"x":51.47,"y":33.01},{"x":51.32,"y":32.85},{"x":51.2,"y":32.99},{"x":51.16,"y":32.81},{"x":50.91,"y":32.92},{"x":50.74,"y":32.72},{"x":50.55,"y":32.99},{"x":50.51,"y":32.81}],"bounds":{"x":50.51,"y":32.42,"w":2.94,"h":1.82},"color":"yellow","solid":false,"category":"light"},{"id":"PF-TH-A-T01-feat1","areaId":"PF-TH-A-T01","polygon":[{"x":43.09,"y":34.99},{"x":43.08,"y":33.91},{"x":42.88,"y":33.31},{"x":43.02,"y":32.37},{"x":46.65,"y":32.43},{"x":47.41,"y":32.22},{"x":47.67,"y":32.4},{"x":48.37,"y":32.25},{"x":49.33,"y":32.43},{"x":49.33,"y":32.6},{"x":48.88,"y":32.75},{"x":48.63,"y":32.6},{"x":47.73,"y":32.88},{"x":47.19,"y":32.82},{"x":47.15,"y":33.11},{"x":47.32,"y":33.26},{"x":47.15,"y":33.2},{"x":47.13,"y":33.45},{"x":47.39,"y":33.71},{"x":47.24,"y":34.15},{"x":47.49,"y":34.18},{"x":47.49,"y":34.34},{"x":47.15,"y":34.35},{"x":47.27,"y":34.45},{"x":47.05,"y":34.62},{"x":47.27,"y":34.66},{"x":46.61,"y":34.89},{"x":46.56,"y":35.37},{"x":46.39,"y":35.03},{"x":45.72,"y":35.25},{"x":45.75,"y":35.08},{"x":45.48,"y":35.19},{"x":45.45,"y":35.02},{"x":45.06,"y":35.06},{"x":44.95,"y":35.43},{"x":44.83,"y":34.99},{"x":44.41,"y":35},{"x":44.08,"y":34.69},{"x":44.02,"y":34.85},{"x":43.84,"y":34.77},{"x":43.93,"y":35.02},{"x":43.76,"y":34.8},{"x":43.19,"y":35.05}],"bounds":{"x":42.88,"y":32.22,"w":6.45,"h":3.21},"color":"green","solid":true,"category":"dense"},{"id":"PF-TH-A-T02-feat0","areaId":"PF-TH-A-T02","polygon":[{"x":5.59,"y":32.1},{"x":5.57,"y":31.05},{"x":5.36,"y":30.76},{"x":5.25,"y":27.77},{"x":5.46,"y":27.28},{"x":9.69,"y":27.24},{"x":10.99,"y":27.56},{"x":11.38,"y":27.48},{"x":11.58,"y":27.65},{"x":11.39,"y":27.93},{"x":9.71,"y":27.86},{"x":9.34,"y":28.02},{"x":9.32,"y":28.19},{"x":9.6,"y":28.14},{"x":8.91,"y":28.6},{"x":8.57,"y":29.51},{"x":8.39,"y":29.56},{"x":8.49,"y":29.72},{"x":8.14,"y":29.54},{"x":8.07,"y":29.82},{"x":7.82,"y":29.54},{"x":7.88,"y":29.79},{"x":7.7,"y":29.59},{"x":7.51,"y":30.02},{"x":7.43,"y":29.61},{"x":6.93,"y":30.03},{"x":6.42,"y":29.99},{"x":6.4,"y":30.24},{"x":6.13,"y":30.14},{"x":5.87,"y":30.31},{"x":6.05,"y":30.48},{"x":5.84,"y":30.69},{"x":5.95,"y":31.21},{"x":5.79,"y":32.1},{"x":5.61,"y":32.13}],"bounds":{"x":5.25,"y":27.24,"w":6.33,"h":4.89},"color":"green","solid":true,"category":"dense"},{"id":"PF-TH-A-T02-feat1","areaId":"PF-TH-A-T02","polygon":[{"x":16.08,"y":27.44},{"x":16.19,"y":27.99},{"x":15.9,"y":28.27},{"x":16.19,"y":30.39},{"x":16.14,"y":33.7},{"x":13.08,"y":33.7},{"x":13.08,"y":33.27},{"x":13.82,"y":33.16},{"x":13.79,"y":32.11},{"x":13.94,"y":32.17},{"x":13.97,"y":31.6},{"x":14.28,"y":31.49},{"x":14.5,"y":31.04},{"x":14.54,"y":30.02},{"x":15.54,"y":29.86},{"x":15.54,"y":28.13},{"x":15.93,"y":28.06},{"x":15.8,"y":27.98},{"x":15.93,"y":27.61},{"x":15.54,"y":27.5},{"x":15.76,"y":27.41}],"bounds":{"x":13.08,"y":27.41,"w":3.11,"h":6.29},"color":"green","solid":true,"category":"dense"},{"id":"PF-TH-A-T03-feat0","areaId":"PF-TH-A-T03","polygon":[{"x":31.02,"y":32.5},{"x":31.73,"y":33.3},{"x":31.59,"y":33.37},{"x":31.18,"y":32.94},{"x":31.02,"y":32.98},{"x":28.78,"y":35.23},{"x":29.23,"y":35.74},{"x":29.08,"y":35.89},{"x":28.32,"y":34.95},{"x":29.45,"y":33.82},{"x":29.72,"y":33.83},{"x":29.67,"y":33.59},{"x":30.8,"y":32.46},{"x":30.97,"y":32.52}],"bounds":{"x":28.32,"y":32.46,"w":3.41,"h":3.43},"color":"yellow","solid":false,"category":"light"},{"id":"PF-TH-A-T03-feat1","areaId":"PF-TH-A-T03","polygon":[{"x":26.58,"y":36.95},{"x":27.29,"y":37.74},{"x":27.15,"y":37.81},{"x":26.58,"y":37.42},{"x":24.34,"y":39.67},{"x":24.79,"y":40.19},{"x":24.64,"y":40.33},{"x":23.88,"y":39.39},{"x":25.01,"y":38.26},{"x":25.28,"y":38.27},{"x":25.23,"y":38.04},{"x":26.36,"y":36.91},{"x":26.53,"y":36.96}],"bounds":{"x":23.88,"y":36.91,"w":3.41,"h":3.42},"color":"yellow","solid":false,"category":"light"},{"id":"PF-TH-A-T03-feat2","areaId":"PF-TH-A-T03","polygon":[{"x":25.96,"y":36.12},{"x":26.17,"y":36.01},{"x":26.63,"y":36.37},{"x":27.63,"y":35.37},{"x":27.27,"y":34.91},{"x":27.46,"y":34.7},{"x":28.06,"y":35.08},{"x":28.24,"y":35.42},{"x":28.83,"y":35.15},{"x":28.48,"y":35.65},{"x":28.71,"y":35.49},{"x":28.86,"y":35.6},{"x":28.8,"y":35.98},{"x":29.2,"y":36.52},{"x":28.98,"y":36.62},{"x":28.53,"y":36.26},{"x":27.52,"y":37.26},{"x":27.89,"y":37.73},{"x":27.78,"y":37.94},{"x":26.9,"y":37.24},{"x":26.37,"y":37.52},{"x":26.68,"y":36.98},{"x":26.45,"y":37.13},{"x":26.3,"y":37.02},{"x":26.36,"y":36.64},{"x":25.96,"y":36.22}],"bounds":{"x":25.96,"y":34.7,"w":3.24,"h":3.24},"color":"green","solid":true,"category":"dense"},{"id":"PF-TH-A-T04-feat0","areaId":"PF-TH-A-T04","polygon":[{"x":34.3,"y":34.77},{"x":33.09,"y":33.89},{"x":33,"y":33.58},{"x":34.3,"y":32.28},{"x":34.76,"y":31.53},{"x":34.91,"y":31.66},{"x":34.65,"y":32.12},{"x":34.82,"y":32.38},{"x":34.07,"y":33.26},{"x":33.7,"y":33.17},{"x":33.82,"y":33.35},{"x":33.54,"y":33.62},{"x":34.22,"y":34.1},{"x":34.43,"y":34.47},{"x":34.35,"y":34.77}],"bounds":{"x":33,"y":31.53,"w":1.91,"h":3.24},"color":"yellow","solid":false,"category":"light"},{"id":"PF-TH-A-T04-feat1","areaId":"PF-TH-A-T04","polygon":[{"x":37.48,"y":34.04},{"x":38.36,"y":34.48},{"x":38.72,"y":35.04},{"x":38.37,"y":35.47},{"x":37.98,"y":35.45},{"x":36.54,"y":37.01},{"x":36.29,"y":36.78},{"x":36.63,"y":36.34},{"x":37.84,"y":35.1},{"x":38.03,"y":35.18},{"x":38.22,"y":34.99},{"x":37.66,"y":34.72},{"x":37.32,"y":34.1}],"bounds":{"x":36.29,"y":34.04,"w":2.43,"h":2.97},"color":"yellow","solid":false,"category":"light"},{"id":"PF-TH-A-T05-feat0","areaId":"PF-TH-A-T05","polygon":[{"x":35.18,"y":25.05},{"x":35.45,"y":26.2},{"x":35.28,"y":26.59},{"x":34.79,"y":26.85},{"x":33.83,"y":26.55},{"x":34.3,"y":26.31},{"x":34.93,"y":26.33},{"x":35.07,"y":25.02}],"bounds":{"x":33.83,"y":25.02,"w":1.62,"h":1.83},"color":"yellow","solid":false,"category":"light"},{"id":"PF-TH-A-T05-feat1","areaId":"PF-TH-A-T05","polygon":[{"x":29.47,"y":26.53},{"x":28.46,"y":26.55},{"x":27.57,"y":26.84},{"x":26.85,"y":26.61},{"x":25.39,"y":26.62},{"x":25.1,"y":26.84},{"x":24.66,"y":26.69},{"x":24.5,"y":26.18},{"x":24.73,"y":25.66},{"x":24.73,"y":24.7},{"x":24.5,"y":23.71},{"x":24.79,"y":22.35},{"x":24.95,"y":22.35},{"x":24.96,"y":23.11},{"x":25.16,"y":23.37},{"x":26.09,"y":23.37},{"x":26.1,"y":23.53},{"x":25.87,"y":23.55},{"x":26.46,"y":23.63},{"x":26.52,"y":23.86},{"x":26.81,"y":23.84},{"x":27.17,"y":24.26},{"x":27.36,"y":24.16},{"x":27.21,"y":24.38},{"x":27.61,"y":24.36},{"x":27.56,"y":24.52},{"x":27.93,"y":24.32},{"x":27.92,"y":25.38},{"x":27.75,"y":25.47},{"x":27.76,"y":25.16},{"x":27.61,"y":25.57},{"x":27.48,"y":25.51},{"x":27.65,"y":26.13},{"x":27.49,"y":26.43},{"x":29.34,"y":26.37}],"bounds":{"x":24.5,"y":22.35,"w":4.97,"h":4.49},"color":"green","solid":true,"category":"dense"},{"id":"PF-TH-A-T05-feat2","areaId":"PF-TH-A-T05","polygon":[{"x":24.77,"y":18.87},{"x":24.49,"y":17.71},{"x":24.66,"y":17.32},{"x":25.16,"y":17.07},{"x":26.12,"y":17.37},{"x":25.65,"y":17.61},{"x":25.02,"y":17.59},{"x":24.88,"y":18.9}],"bounds":{"x":24.49,"y":17.07,"w":1.63,"h":1.83},"color":"yellow","solid":false,"category":"light"},{"id":"PF-TH-A-T05-feat3","areaId":"PF-TH-A-T05","polygon":[{"x":30.53,"y":17.51},{"x":31.54,"y":17.5},{"x":32.43,"y":17.2},{"x":33.15,"y":17.44},{"x":34.61,"y":17.42},{"x":34.9,"y":17.2},{"x":35.34,"y":17.36},{"x":35.5,"y":17.87},{"x":35.27,"y":18.38},{"x":35.27,"y":19.34},{"x":35.5,"y":20.34},{"x":35.21,"y":21.69},{"x":35.05,"y":21.69},{"x":35.04,"y":20.93},{"x":34.84,"y":20.68},{"x":33.91,"y":20.67},{"x":33.9,"y":20.52},{"x":34.13,"y":20.5},{"x":33.54,"y":20.42},{"x":33.48,"y":20.18},{"x":33.19,"y":20.2},{"x":32.83,"y":19.78},{"x":32.64,"y":19.89},{"x":32.79,"y":19.66},{"x":32.54,"y":19.57},{"x":32.44,"y":19.71},{"x":32.44,"y":19.52},{"x":32.07,"y":19.73},{"x":32.08,"y":18.66},{"x":32.25,"y":18.57},{"x":32.24,"y":18.89},{"x":32.39,"y":18.47},{"x":32.52,"y":18.53},{"x":32.35,"y":17.92},{"x":32.51,"y":17.61},{"x":30.66,"y":17.67}],"bounds":{"x":30.53,"y":17.2,"w":4.97,"h":4.49},"color":"green","solid":true,"category":"dense"},{"id":"PF-TH-A-T06-feat0","areaId":"PF-TH-A-T06","polygon":[{"x":17.04,"y":41.42},{"x":17.01,"y":40.1},{"x":16.59,"y":39.82},{"x":16.63,"y":39.6},{"x":16.94,"y":39.6},{"x":17.01,"y":39.43},{"x":17.01,"y":38.27},{"x":16.94,"y":38.1},{"x":16.63,"y":38.1},{"x":16.59,"y":37.88},{"x":17.02,"y":37.6},{"x":17,"y":36.36},{"x":16.63,"y":36.28},{"x":16.62,"y":35.95},{"x":16.94,"y":35.94},{"x":17.02,"y":35.77},{"x":17.02,"y":34.61},{"x":16.63,"y":34.44},{"x":16.62,"y":34.15},{"x":16.99,"y":34.08},{"x":17.17,"y":33.46},{"x":17.41,"y":34.07},{"x":17.62,"y":33.5},{"x":17.73,"y":34.09},{"x":17.97,"y":33.38},{"x":18.14,"y":34.08},{"x":18.49,"y":34.1},{"x":18.49,"y":34.44},{"x":18.1,"y":34.59},{"x":18.11,"y":35.84},{"x":18.49,"y":35.94},{"x":18.49,"y":36.28},{"x":18.09,"y":36.43},{"x":18.1,"y":37.66},{"x":18.49,"y":37.77},{"x":18.49,"y":38.1},{"x":18.09,"y":38.25},{"x":18.09,"y":39.43},{"x":18.16,"y":39.6},{"x":18.49,"y":39.6},{"x":18.49,"y":39.93},{"x":18.14,"y":39.95},{"x":18.04,"y":40.15},{"x":18.24,"y":40.22},{"x":18.05,"y":40.26},{"x":18.24,"y":40.32},{"x":18.06,"y":40.37},{"x":18.24,"y":40.42},{"x":18.06,"y":40.47},{"x":18.24,"y":40.52},{"x":18.06,"y":40.57},{"x":18.24,"y":40.62},{"x":17.97,"y":40.66},{"x":17.64,"y":40.62},{"x":17.82,"y":40.57},{"x":17.64,"y":40.52},{"x":17.82,"y":40.47},{"x":17.64,"y":40.42},{"x":17.81,"y":40.24},{"x":17.64,"y":40.23},{"x":17.48,"y":40.54},{"x":17.36,"y":39.95},{"x":17.28,"y":41.42}],"bounds":{"x":16.59,"y":33.38,"w":1.9,"h":8.04},"color":"green","solid":true,"category":"dense"},{"id":"PF-TH-A-T07-feat0","areaId":"PF-TH-A-T07","polygon":[{"x":9.47,"y":11.55},{"x":8.51,"y":11.78},{"x":7.52,"y":11.43},{"x":7.32,"y":11.69},{"x":6.86,"y":11.68},{"x":6.57,"y":11.4},{"x":6.74,"y":10.24},{"x":6.89,"y":9.95},{"x":7.2,"y":10.19},{"x":7.07,"y":11.2},{"x":7.42,"y":11.17},{"x":7.52,"y":11.36},{"x":7.78,"y":11.06},{"x":8,"y":11.28},{"x":8.54,"y":11.18},{"x":8.7,"y":11.35},{"x":8.81,"y":11.2},{"x":8.85,"y":11.39},{"x":9.1,"y":11.28},{"x":9.27,"y":11.47},{"x":9.46,"y":11.2},{"x":9.51,"y":11.38}],"bounds":{"x":6.57,"y":9.95,"w":2.94,"h":1.83},"color":"yellow","solid":false,"category":"light"},{"id":"PF-TH-A-T07-feat1","areaId":"PF-TH-A-T07","polygon":[{"x":17.02,"y":9.17},{"x":17.03,"y":10.25},{"x":17.23,"y":10.85},{"x":17.09,"y":11.78},{"x":13.46,"y":11.72},{"x":12.7,"y":11.94},{"x":12.44,"y":11.75},{"x":11.74,"y":11.91},{"x":10.78,"y":11.72},{"x":10.78,"y":11.55},{"x":11.23,"y":11.4},{"x":11.48,"y":11.55},{"x":12.38,"y":11.28},{"x":12.92,"y":11.34},{"x":12.79,"y":10.89},{"x":12.96,"y":10.95},{"x":12.98,"y":10.71},{"x":12.72,"y":10.45},{"x":12.87,"y":10},{"x":12.62,"y":9.97},{"x":12.62,"y":9.81},{"x":12.96,"y":9.8},{"x":12.84,"y":9.71},{"x":13.06,"y":9.54},{"x":12.84,"y":9.49},{"x":13.5,"y":9.26},{"x":13.55,"y":8.78},{"x":13.72,"y":9.12},{"x":14.39,"y":8.91},{"x":14.36,"y":9.07},{"x":14.63,"y":8.97},{"x":14.66,"y":9.14},{"x":15.05,"y":9.09},{"x":15.16,"y":8.72},{"x":15.28,"y":9.17},{"x":15.7,"y":9.15},{"x":16.02,"y":9.46},{"x":16.09,"y":9.31},{"x":16.27,"y":9.38},{"x":16.18,"y":9.14},{"x":16.35,"y":9.35},{"x":16.92,"y":9.11}],"bounds":{"x":10.78,"y":8.72,"w":6.45,"h":3.22},"color":"green","solid":true,"category":"dense"},{"id":"PF-TH-A-T08-feat0","areaId":"PF-TH-A-T08","polygon":[{"x":54.5,"y":11.87},{"x":54.84,"y":16.19},{"x":54.63,"y":16.68},{"x":50.4,"y":16.72},{"x":49.1,"y":16.4},{"x":48.71,"y":16.48},{"x":48.51,"y":16.31},{"x":48.69,"y":16.03},{"x":50.38,"y":16.1},{"x":50.75,"y":15.94},{"x":50.76,"y":15.77},{"x":50.49,"y":15.82},{"x":51.17,"y":15.36},{"x":51.51,"y":14.45},{"x":51.7,"y":14.4},{"x":51.6,"y":14.24},{"x":51.95,"y":14.42},{"x":52.02,"y":14.14},{"x":52.26,"y":14.42},{"x":52.21,"y":14.17},{"x":52.39,"y":14.37},{"x":52.58,"y":13.94},{"x":52.66,"y":14.35},{"x":53.16,"y":13.93},{"x":53.66,"y":13.97},{"x":53.69,"y":13.72},{"x":53.96,"y":13.82},{"x":54.22,"y":13.65},{"x":54.03,"y":13.48},{"x":54.24,"y":13.27},{"x":54.11,"y":13.07},{"x":54.3,"y":11.87},{"x":54.48,"y":11.83}],"bounds":{"x":48.51,"y":11.83,"w":6.33,"h":4.89},"color":"green","solid":true,"category":"dense"},{"id":"PF-TH-A-T08-feat1","areaId":"PF-TH-A-T08","polygon":[{"x":43.89,"y":16.52},{"x":43.78,"y":15.96},{"x":44.07,"y":15.68},{"x":43.78,"y":13.56},{"x":43.91,"y":12.94},{"x":43.83,"y":10.25},{"x":46.89,"y":10.25},{"x":46.89,"y":10.69},{"x":46.15,"y":10.79},{"x":46.18,"y":11.85},{"x":46.03,"y":11.78},{"x":46,"y":12.36},{"x":45.69,"y":12.46},{"x":45.47,"y":12.91},{"x":45.43,"y":13.93},{"x":44.43,"y":14.09},{"x":44.43,"y":15.82},{"x":44.04,"y":15.9},{"x":44.17,"y":15.98},{"x":44.04,"y":16.35},{"x":44.43,"y":16.45},{"x":44.21,"y":16.55}],"bounds":{"x":43.78,"y":10.25,"w":3.11,"h":6.3},"color":"green","solid":true,"category":"dense"},{"id":"PF-TH-A-T09-feat0","areaId":"PF-TH-A-T09","polygon":[{"x":29.31,"y":11.32},{"x":28.6,"y":10.53},{"x":28.74,"y":10.45},{"x":29.15,"y":10.88},{"x":29.31,"y":10.84},{"x":31.54,"y":8.6},{"x":31.1,"y":8.08},{"x":31.24,"y":7.94},{"x":32.01,"y":8.88},{"x":30.88,"y":10.01},{"x":30.64,"y":9.96},{"x":30.65,"y":10.23},{"x":29.52,"y":11.36},{"x":29.36,"y":11.31}],"bounds":{"x":28.6,"y":7.94,"w":3.41,"h":3.42},"color":"yellow","solid":false,"category":"light"},{"id":"PF-TH-A-T09-feat1","areaId":"PF-TH-A-T09","polygon":[{"x":33.75,"y":6.88},{"x":33.04,"y":6.08},{"x":33.18,"y":6.01},{"x":33.59,"y":6.44},{"x":33.75,"y":6.4},{"x":35.99,"y":4.15},{"x":35.54,"y":3.64},{"x":35.69,"y":3.49},{"x":36.45,"y":4.43},{"x":35.32,"y":5.56},{"x":35.05,"y":5.55},{"x":35.1,"y":5.79},{"x":33.97,"y":6.92},{"x":33.8,"y":6.87}],"bounds":{"x":33.04,"y":3.49,"w":3.41,"h":3.43},"color":"yellow","solid":false,"category":"light"},{"id":"PF-TH-A-T09-feat2","areaId":"PF-TH-A-T09","polygon":[{"x":34.37,"y":7.7},{"x":34.15,"y":7.82},{"x":33.7,"y":7.46},{"x":33.53,"y":7.62},{"x":32.7,"y":8.46},{"x":33.06,"y":8.91},{"x":32.87,"y":9.13},{"x":32.27,"y":8.74},{"x":32.09,"y":8.41},{"x":31.5,"y":8.67},{"x":31.85,"y":8.17},{"x":31.62,"y":8.33},{"x":31.47,"y":8.22},{"x":31.53,"y":7.85},{"x":31.13,"y":7.31},{"x":31.35,"y":7.2},{"x":31.8,"y":7.56},{"x":32.81,"y":6.56},{"x":32.44,"y":6.09},{"x":32.64,"y":5.89},{"x":33.43,"y":6.59},{"x":33.96,"y":6.31},{"x":33.65,"y":6.84},{"x":34.03,"y":6.8},{"x":33.97,"y":7.18},{"x":34.37,"y":7.61}],"bounds":{"x":31.13,"y":5.89,"w":3.24,"h":3.24},"color":"green","solid":true,"category":"dense"},{"id":"PF-TH-A-T10-feat0","areaId":"PF-TH-A-T10","polygon":[{"x":26.03,"y":9.05},{"x":27.24,"y":9.93},{"x":27.33,"y":10.24},{"x":26.17,"y":11.38},{"x":25.57,"y":12.29},{"x":25.42,"y":12.16},{"x":25.68,"y":11.7},{"x":25.5,"y":11.44},{"x":26.26,"y":10.56},{"x":26.63,"y":10.66},{"x":26.51,"y":10.47},{"x":26.79,"y":10.21},{"x":26.11,"y":9.72},{"x":25.9,"y":9.35},{"x":25.97,"y":9.05}],"bounds":{"x":25.42,"y":9.05,"w":1.91,"h":3.24},"color":"yellow","solid":false,"category":"light"},{"id":"PF-TH-A-T10-feat1","areaId":"PF-TH-A-T10","polygon":[{"x":22.84,"y":9.78},{"x":21.97,"y":9.34},{"x":21.61,"y":8.78},{"x":22.07,"y":8.29},{"x":22.35,"y":8.37},{"x":23.79,"y":6.81},{"x":24.04,"y":7.05},{"x":23.7,"y":7.48},{"x":22.49,"y":8.72},{"x":22.3,"y":8.64},{"x":22.11,"y":8.83},{"x":22.67,"y":9.1},{"x":23.01,"y":9.72}],"bounds":{"x":21.61,"y":6.81,"w":2.43,"h":2.97},"color":"yellow","solid":false,"category":"light"},{"id":"PF-TH-A-T11-feat0","areaId":"PF-TH-A-T11","polygon":[{"x":42.96,"y":2.51},{"x":42.99,"y":3.84},{"x":43.41,"y":4.11},{"x":43.37,"y":4.34},{"x":43.06,"y":4.34},{"x":42.99,"y":4.5},{"x":42.99,"y":5.67},{"x":43.06,"y":5.83},{"x":43.37,"y":5.83},{"x":43.41,"y":6.05},{"x":42.98,"y":6.34},{"x":43,"y":7.57},{"x":43.37,"y":7.66},{"x":43.38,"y":7.98},{"x":42.98,"y":8.16},{"x":42.98,"y":9.33},{"x":43.05,"y":9.49},{"x":43.37,"y":9.49},{"x":43.38,"y":9.79},{"x":43.01,"y":9.85},{"x":42.83,"y":10.47},{"x":42.59,"y":9.86},{"x":42.38,"y":10.44},{"x":42.27,"y":9.84},{"x":42.03,"y":10.55},{"x":41.86,"y":9.85},{"x":41.51,"y":9.83},{"x":41.51,"y":9.49},{"x":41.9,"y":9.35},{"x":41.89,"y":8.1},{"x":41.51,"y":8},{"x":41.51,"y":7.66},{"x":41.91,"y":7.51},{"x":41.9,"y":6.27},{"x":41.51,"y":6.16},{"x":41.51,"y":5.84},{"x":41.91,"y":5.68},{"x":41.91,"y":4.5},{"x":41.51,"y":4.33},{"x":41.51,"y":4},{"x":41.86,"y":3.98},{"x":41.96,"y":3.78},{"x":41.76,"y":3.71},{"x":41.95,"y":3.67},{"x":41.76,"y":3.61},{"x":41.94,"y":3.56},{"x":41.76,"y":3.51},{"x":41.94,"y":3.47},{"x":41.76,"y":3.42},{"x":41.94,"y":3.37},{"x":41.76,"y":3.32},{"x":42.03,"y":3.27},{"x":42.36,"y":3.32},{"x":42.18,"y":3.37},{"x":42.36,"y":3.42},{"x":42.18,"y":3.47},{"x":42.36,"y":3.51},{"x":42.19,"y":3.69},{"x":42.36,"y":3.7},{"x":42.52,"y":3.39},{"x":42.64,"y":3.98},{"x":42.72,"y":2.51}],"bounds":{"x":41.51,"y":2.51,"w":1.9,"h":8.04},"color":"green","solid":true,"category":"dense"},{"id":"PF-TH-A-T12-feat0","areaId":"PF-TH-A-T12","polygon":[{"x":46.72,"y":21.95},{"x":47.29,"y":22.22},{"x":47.59,"y":21.91},{"x":47.83,"y":22.16},{"x":47.57,"y":22.56},{"x":48.35,"y":23.3},{"x":48.93,"y":22.82},{"x":49.17,"y":23.1},{"x":48.7,"y":23.56},{"x":49.07,"y":23.98},{"x":49.61,"y":24.43},{"x":50.03,"y":23.95},{"x":50.34,"y":24.16},{"x":49.86,"y":24.66},{"x":50.17,"y":25.22},{"x":49.56,"y":24.93},{"x":49.4,"y":25.19},{"x":49.14,"y":25.19},{"x":49.34,"y":24.59},{"x":48.53,"y":23.84},{"x":47.99,"y":24.09},{"x":47.94,"y":23.85},{"x":48.18,"y":23.51},{"x":47.39,"y":22.75},{"x":46.8,"y":22.96},{"x":46.78,"y":22.74},{"x":47.04,"y":22.52},{"x":46.75,"y":22.04}],"bounds":{"x":46.72,"y":21.91,"w":3.62,"h":3.31},"color":"yellow","solid":false,"category":"light"},{"id":"PF-TH-A-T12-feat1","areaId":"PF-TH-A-T12","polygon":[{"x":42.46,"y":26.4},{"x":42.35,"y":25.91},{"x":42.51,"y":25.54},{"x":43.17,"y":25.14},{"x":43.64,"y":24.3},{"x":44.16,"y":24.1},{"x":44.47,"y":23.46},{"x":45.05,"y":23.24},{"x":45.53,"y":23.5},{"x":45.8,"y":24.14},{"x":45.55,"y":24.61},{"x":44.98,"y":24.9},{"x":44.83,"y":25.52},{"x":44.58,"y":25.78},{"x":44,"y":25.92},{"x":43.59,"y":26.64},{"x":43.27,"y":26.79},{"x":42.78,"y":26.7}],"bounds":{"x":42.35,"y":23.24,"w":3.45,"h":3.55},"color":"green","solid":true,"category":"dense"},{"id":"PF-TH-A-T12-feat2","areaId":"PF-TH-A-T12","polygon":[{"x":41.93,"y":24.74},{"x":42.68,"y":23.55},{"x":43.37,"y":22.97},{"x":43.77,"y":22.88},{"x":43.8,"y":23.46},{"x":43.49,"y":23.79},{"x":43.65,"y":24.44},{"x":44.87,"y":25.41},{"x":44.44,"y":25.74},{"x":43.48,"y":24.61},{"x":42.93,"y":24.49},{"x":42.5,"y":24.81},{"x":41.96,"y":24.87}],"bounds":{"x":41.93,"y":22.88,"w":2.94,"h":2.86},"color":"green","solid":true,"category":"dense"},{"id":"PF-TH-A-T13-feat0","areaId":"PF-TH-A-T13","polygon":[{"x":13.25,"y":22.06},{"x":12.68,"y":21.79},{"x":12.37,"y":22.1},{"x":12.13,"y":21.85},{"x":12.39,"y":21.45},{"x":11.61,"y":20.71},{"x":11.03,"y":21.19},{"x":10.8,"y":20.91},{"x":11.27,"y":20.45},{"x":10.89,"y":20.03},{"x":10.35,"y":19.58},{"x":9.93,"y":20.06},{"x":9.63,"y":19.85},{"x":10.11,"y":19.35},{"x":9.75,"y":18.84},{"x":9.95,"y":18.77},{"x":10.4,"y":19.08},{"x":10.57,"y":18.82},{"x":10.82,"y":18.82},{"x":10.63,"y":19.42},{"x":11.43,"y":20.17},{"x":11.98,"y":19.92},{"x":12.03,"y":20.16},{"x":11.78,"y":20.5},{"x":12.28,"y":20.99},{"x":12.73,"y":21.29},{"x":12.96,"y":21},{"x":13.17,"y":21.05},{"x":13.19,"y":21.27},{"x":12.93,"y":21.49},{"x":13.22,"y":21.97}],"bounds":{"x":9.63,"y":18.77,"w":3.62,"h":3.33},"color":"yellow","solid":false,"category":"light"},{"id":"PF-TH-A-T13-feat1","areaId":"PF-TH-A-T13","polygon":[{"x":17.5,"y":17.61},{"x":17.61,"y":18.1},{"x":17.45,"y":18.47},{"x":16.79,"y":18.87},{"x":16.54,"y":19.52},{"x":15.8,"y":19.91},{"x":15.49,"y":20.55},{"x":14.91,"y":20.77},{"x":14.43,"y":20.51},{"x":14.16,"y":19.87},{"x":14.41,"y":19.4},{"x":14.99,"y":19.11},{"x":15.11,"y":18.52},{"x":15.38,"y":18.23},{"x":15.96,"y":18.08},{"x":16.37,"y":17.37},{"x":16.69,"y":17.22},{"x":17.18,"y":17.31}],"bounds":{"x":14.16,"y":17.22,"w":3.45,"h":3.55},"color":"green","solid":true,"category":"dense"},{"id":"PF-TH-A-T13-feat2","areaId":"PF-TH-A-T13","polygon":[{"x":18.03,"y":19.27},{"x":17.28,"y":20.46},{"x":16.59,"y":21.04},{"x":16.19,"y":21.13},{"x":16.17,"y":20.55},{"x":16.47,"y":20.22},{"x":16.31,"y":19.57},{"x":15.09,"y":18.6},{"x":15.53,"y":18.26},{"x":16.49,"y":19.4},{"x":17.04,"y":19.52},{"x":17.47,"y":19.2},{"x":18,"y":19.14}],"bounds":{"x":15.09,"y":18.26,"w":2.94,"h":2.87},"color":"green","solid":true,"category":"dense"}],"objectives":[],"measurements":{"lines":[],"labels":[]}};

/* --- battleSim\layoutImport.js --- */
/**
 * Offline Rapid Ingress layout import — parse saved HTML / terrain-data JS,
 * convert to Battle Companion layout shape, persist in localStorage.
 */

const CUSTOM_LAYOUTS_KEY = 'wh40k-custom-layouts-v1';

/** @type {{ layoutsById: Map<string, object>, list: {id:string,label:string}[], suggestedId: string|null, suggestedName: string|null } | null} */
let importSession = null;

function rdp(points, epsilon) {
  if (!points || points.length < 3) return points || [];

  function perp(p, a, b) {
    const ax = a.x;
    const ay = a.y;
    const bx = b.x;
    const by = b.y;
    const px = p.x;
    const py = p.y;
    const dx = bx - ax;
    const dy = by - ay;
    if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function rec(pts) {
    if (pts.length < 3) return pts;
    const a = pts[0];
    const b = pts[pts.length - 1];
    let idx = 0;
    let dist = -1;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = perp(pts[i], a, b);
      if (d > dist) {
        dist = d;
        idx = i;
      }
    }
    if (dist > epsilon) {
      const left = rec(pts.slice(0, idx + 1));
      const right = rec(pts.slice(idx));
      return left.slice(0, -1).concat(right);
    }
    return [a, b];
  }

  let out = rec(points);
  if (
    out.length > 2 &&
    Math.abs(out[0].x - out[out.length - 1].x) < 1e-6 &&
    Math.abs(out[0].y - out[out.length - 1].y) < 1e-6
  ) {
    out = out.slice(0, -1);
  }
  return out;
}

function roundPts(pts, n = 2) {
  const f = 10 ** n;
  return (pts || []).map((p) => ({
    x: Math.round(p.x * f) / f,
    y: Math.round(p.y * f) / f,
  }));
}

function aabb(pts) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minx = Math.min(...xs);
  const maxx = Math.max(...xs);
  const miny = Math.min(...ys);
  const maxy = Math.max(...ys);
  return {
    x: Math.round(minx * 100) / 100,
    y: Math.round(miny * 100) / 100,
    w: Math.round((maxx - minx) * 100) / 100,
    h: Math.round((maxy - miny) * 100) / 100,
  };
}

function aabbTouch(a, b, gap = 0.35) {
  return !(
    a.x + a.w + gap < b.x ||
    b.x + b.w + gap < a.x ||
    a.y + a.h + gap < b.y ||
    b.y + b.h + gap < a.y
  );
}

/**
 * Rapid Ingress URL slug → data id.
 * Slug order follows the page title (e.g. pfdia = PF vs DI, Layout A),
 * but terrain IDs sort the two disposition codes alphabetically (DI-PF-A).
 */
function slugToRapidIngressId(slug) {
  const s = String(slug || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (!/^[a-z]{4}[a-c]$/.test(s)) return null;
  const a = s.slice(0, 2).toUpperCase();
  const b = s.slice(2, 4).toUpperCase();
  const v = s.slice(4).toUpperCase();
  const [first, second] = a <= b ? [a, b] : [b, a];
  return `${first}-${second}-${v}`;
}

/** Candidate RI ids for a slug (sorted + page-order). */
function slugCandidateIds(slug) {
  const s = String(slug || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (!/^[a-z]{4}[a-c]$/.test(s)) return [];
  const a = s.slice(0, 2).toUpperCase();
  const b = s.slice(2, 4).toUpperCase();
  const v = s.slice(4).toUpperCase();
  const sorted = slugToRapidIngressId(s);
  const pageOrder = `${a}-${b}-${v}`;
  return [...new Set([sorted, pageOrder].filter(Boolean))];
}

function extractLayoutHintFromHtml(html) {
  const text = String(html || '');
  let slug = null;
  const slugMatch =
    text.match(/layout-reference\/([a-z]{4}[a-c])/i) ||
    text.match(/saved from url=\([^)]*layout-reference\/([a-z]{4}[a-c])/i);
  if (slugMatch) slug = slugMatch[1];

  let suggestedName = null;
  const title = text.match(/<title>([^<]+)<\/title>/i);
  if (title) {
    suggestedName = title[1].split('|')[0].trim();
  }
  const mission = text.match(/Missions\s*[-–]\s*Both players:\s*([^."<]+)/i);
  if (mission && !suggestedName) {
    suggestedName = mission[1].trim();
  }
  return { slug, riCandidates: slugCandidateIds(slug), suggestedName };
}

function extractElevenELayouts(text) {
  const startMark = 'const ELEVEN_E_LAYOUTS = ';
  const endMark = 'const ELEVEN_E_MATCHUPS';
  const start = text.indexOf(startMark);
  if (start < 0) return null;
  const jsonStart = start + startMark.length;
  const end = text.indexOf(endMark, jsonStart);
  if (end < 0) return null;
  let json = text.slice(jsonStart, end).trim();
  if (json.endsWith(';')) json = json.slice(0, -1).trim();
  const layouts = JSON.parse(json);
  return Array.isArray(layouts) ? layouts : null;
}

/**
 * Convert one Rapid Ingress layout object into Battle Companion layout shape.
 */
function convertRapidIngressLayout(src, options = {}) {
  if (!src?.terrain) throw new Error('Invalid Rapid Ingress layout data');
  const name = String(options.name || src.id || 'Imported layout').trim() || 'Imported layout';
  const id =
    options.id ||
    `custom-${String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'layout'}`;

  const areas = [];
  const features = [];

  for (const t of src.terrain) {
    const pts = roundPts(rdp(t.points || [], 0.12));
    if (t.base) {
      const obj = t.objective || null;
      let otype = obj?.type || null;
      if (otype === 'central') otype = 'centre';
      const area = {
        id: t.areaId || t.id,
        polygon: pts,
        bounds: aabb(pts),
        obscuring: !!t.obscuring,
        isObjective: !!obj,
        objectiveType: otype,
      };
      if (areas.some((a) => a.id === area.id)) area.id = t.id;
      areas.push(area);
    } else if (t.feature) {
      const cat = String(t.category || 'LIGHT').toUpperCase();
      const color = cat === 'DENSE' ? 'green' : 'yellow';
      features.push({
        id: t.id,
        areaId: t.areaId,
        polygon: pts,
        bounds: aabb(pts),
        color,
        solid: color === 'green',
        category: color === 'green' ? 'dense' : 'light',
      });
    }
  }

  const centrals = areas.filter((a) => a.isObjective && a.objectiveType === 'centre');
  for (const a of areas) {
    if (a.isObjective) continue;
    if (centrals.some((c) => aabbTouch(a.bounds, c.bounds))) {
      a.isObjective = true;
      a.objectiveType = 'centre';
    }
  }

  const deploymentZones = [];
  for (const z of src.deploymentZones || []) {
    const pts = roundPts(rdp(z.points || [], 0.08));
    const color = z.type === 'opponent' ? 'red' : 'blue';
    deploymentZones.push({
      id: z.id,
      color,
      role: color === 'red' ? 'attacker' : 'defender',
      polygon: pts,
      bounds: aabb(pts),
    });
  }

  return {
    id,
    name,
    page: 100,
    custom: true,
    source: `Rapid Ingress ${src.id} (imported)`,
    rapidIngressId: src.id,
    width: src.boardWidth || 60,
    height: src.boardHeight || 44,
    deploymentZones,
    terrainAreas: areas,
    terrainFeatures: features,
    objectives: [],
    measurements: { lines: [], labels: [] },
  };
}

function loadCustomLayouts() {
  try {
    const raw = localStorage.getItem(CUSTOM_LAYOUTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((l) => l && l.id && l.name) : [];
  } catch (_) {
    return [];
  }
}

function saveCustomLayout(layout) {
  const all = loadCustomLayouts().filter((l) => l.id !== layout.id);
  all.push(layout);
  localStorage.setItem(CUSTOM_LAYOUTS_KEY, JSON.stringify(all));
  return layout;
}

function deleteCustomLayout(id) {
  const all = loadCustomLayouts().filter((l) => l.id !== id);
  localStorage.setItem(CUSTOM_LAYOUTS_KEY, JSON.stringify(all));
  return all;
}

function clearImportSession() {
  importSession = null;
}

function getImportSession() {
  return importSession;
}

/**
 * Read one or more saved Rapid Ingress files (HTML +/or terrain-data-11e.js).
 * @param {{ name: string, text: string }[]} files
 */
function beginImportSession(files) {
  clearImportSession();
  let layouts = null;
  let suggestedId = null;
  let suggestedName = null;
  let candidates = [];

  for (const f of files || []) {
    const name = (f.name || '').toLowerCase();
    const text = f.text || '';
    if (!layouts) {
      try {
        layouts = extractElevenELayouts(text);
      } catch (_) {
        layouts = null;
      }
    }
    if (
      name.endsWith('.html') ||
      name.endsWith('.htm') ||
      text.includes('<html') ||
      text.includes('layout-reference')
    ) {
      const hint = extractLayoutHintFromHtml(text);
      if (hint.riCandidates?.length) candidates = hint.riCandidates;
      if (hint.suggestedName) suggestedName = hint.suggestedName;
    }
  }

  if (!layouts?.length) {
    throw new Error(
      'Could not find terrain data. When you Save as Webpage, Complete, also select terrain-data-11e.js.download from the page’s _files folder (multi-select with the .html).',
    );
  }

  const layoutsById = new Map(layouts.map((l) => [l.id, l]));
  const list = layouts
    .map((l) => ({
      id: l.id,
      label: `${l.id}${l.name ? ` — ${l.name}` : ''}`,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const id of candidates) {
    if (layoutsById.has(id)) {
      suggestedId = id;
      break;
    }
  }
  if (!suggestedId && list.length === 1) suggestedId = list[0].id;

  importSession = { layoutsById, list, suggestedId, suggestedName };
  return { list, suggestedId, suggestedName };
}

/**
 * Convert the session’s selected RI layout and save as a custom layout.
 */
function commitImportSession(riId, title) {
  if (!importSession) throw new Error('No import in progress — choose files first.');
  const src = importSession.layoutsById.get(riId);
  if (!src) throw new Error(`Layout ${riId} not found in the terrain file.`);
  const name =
    String(title || '').trim() || importSession.suggestedName || riId || 'Imported layout';
  const baseId = `custom-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || String(riId).toLowerCase()}`;
  const layout = convertRapidIngressLayout(src, { id: baseId, name });
  saveCustomLayout(layout);
  clearImportSession();
  return layout;
}

function readFilesAsText(fileList) {
  const files = Array.from(fileList || []);
  return Promise.all(
    files.map(
      (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve({ name: file.name, text: String(reader.result || '') });
          reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
          reader.readAsText(file);
        }),
    ),
  );
}

/* --- battleSim\layouts.js --- */
/**
 * Terrain layouts for Battle Sim.
 */

const BLANK_LAYOUT = {
  id: 'blank',
  name: 'Blank Grid (60×44)',
  page: 0,
  width: 60,
  height: 44,
  deploymentZones: [],
  terrainAreas: [],
  terrainFeatures: [],
  objectives: [],
  measurements: { lines: [], labels: [] },
};

const BUILTIN_LAYOUTS = [
  BLANK_LAYOUT,
  SEARCH_AND_DESTROY_LAYOUT,
  MEATGRINDER_1_LAYOUT,
  UNSTOPPABLE_FORCE_LAYOUT,
];

/** Built-in layouts only (no custom). Prefer getAllLayouts() for UI. */
const BATTLE_LAYOUTS = BUILTIN_LAYOUTS;

function getAllLayouts() {
  const customs = loadCustomLayouts();
  return [...BUILTIN_LAYOUTS, ...customs];
}

function getLayoutById(id) {
  if (!id) return BLANK_LAYOUT;
  const customs = loadCustomLayouts();
  return (
    BUILTIN_LAYOUTS.find((l) => l.id === id) ||
    customs.find((l) => l.id === id) ||
    BLANK_LAYOUT
  );
}

/* --- battleSim\battleLos.js --- */
/**
 * Battle Sim shooting LoS — edge-to-edge rays with terrain area/feature rules.
 *
 * Preview (shoot phase):
 * - One ray if any attacker model has clear LoS (distance labeled); otherwise one clipped blocked ray.
 * - Attacking models that can see the target are bordered — not one line per model.
 *
 * Rules:
 * - Measure from any point on attacker base to any point on target base.
 * - Yellow (light) features never block.
 * - Green (dense) features block unless that attacking model touches/is inside that feature's area.
 * - Terrain areas with ≥1 yellow/green feature are solid buildings: cannot see THROUGH them
 *   (both endpoints outside). Can see INTO them (target inside) but features still apply.
 * - See-through/out is per model: only the attacking model that is inside/touching an area gets
 *   that exemption — teammates behind the same building do not.
 * - Touching centre-objective halves (objectiveType centre) merge into one LoS area:
 *   inside either half counts as inside both. Non-touching centre pieces stay separate.
 */

function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function edgePointToward(center, radius, toward) {
  const r = Math.max(0, Number(radius) || 0);
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: center.x + (dx / len) * r, y: center.y + (dy / len) * r };
}

function sampleCircle(cx, cy, r, n) {
  const pts = [];
  const rad = Math.max(0, Number(r) || 0);
  if (rad <= 0.01) {
    pts.push({ x: cx, y: cy });
    return pts;
  }
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad });
  }
  return pts;
}

function pointInFeature(point, feature) {
  if (feature?.polygon?.length >= 3) return pointInPolygon(point, feature.polygon);
  if (feature?.bounds) return pointInRect(point, feature.bounds);
  return false;
}

function modelTouchesArea(model, area) {
  if (!model || !area) return false;
  const r = Math.max(0, Number(model.radiusIn) || 0);
  if (pointInArea({ x: model.x, y: model.y }, area)) return true;
  if (r <= 0) return false;
  // Base circle samples — toes-in counts as inside
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    if (pointInArea({ x: model.x + Math.cos(a) * r, y: model.y + Math.sin(a) * r }, area)) {
      return true;
    }
  }
  return false;
}

function unitTouchesArea(models, area) {
  return (models || []).some((m) => modelTouchesArea(m, area));
}

function isYellowFeature(f) {
  return f?.color === 'yellow' || f?.category === 'light';
}

function isGreenFeature(f) {
  if (isYellowFeature(f)) return false;
  return f?.color === 'green' || f?.solid === true || f?.category === 'dense';
}

function areaIsSolidBuilding(area, features) {
  return (features || []).some(
    (f) => f.areaId === area.id && (isYellowFeature(f) || isGreenFeature(f)),
  );
}

function aabbTouch(a, b, gap = 0.35) {
  if (!a || !b) return false;
  return !(
    a.x + a.w + gap < b.x ||
    b.x + b.w + gap < a.x ||
    a.y + a.h + gap < b.y ||
    b.y + b.h + gap < a.y
  );
}

function isCentreObjectiveArea(area) {
  const t = area?.objectiveType;
  return !!area?.isObjective && (t === 'centre' || t === 'central' || t === 'center');
}

/**
 * Touching centre-objective halves count as one combined terrain area for LoS.
 * Separate (non-touching) centre pieces stay independent.
 * Returns Map<areaId, Set<areaId>> of full linked groups.
 */
function buildMergedCentreAreaGroups(areas) {
  const list = areas || [];
  const centrals = list.filter(isCentreObjectiveArea);
  const parent = new Map();

  const find = (id) => {
    if (!parent.has(id)) parent.set(id, id);
    let cur = id;
    while (parent.get(cur) !== cur) cur = parent.get(cur);
    let walk = id;
    while (parent.get(walk) !== cur) {
      const next = parent.get(walk);
      parent.set(walk, cur);
      walk = next;
    }
    return cur;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const c of centrals) parent.set(c.id, c.id);
  for (let i = 0; i < centrals.length; i++) {
    for (let j = i + 1; j < centrals.length; j++) {
      if (aabbTouch(centrals[i].bounds, centrals[j].bounds)) {
        union(centrals[i].id, centrals[j].id);
      }
    }
  }

  const groupsByRoot = new Map();
  for (const c of centrals) {
    const root = find(c.id);
    if (!groupsByRoot.has(root)) groupsByRoot.set(root, new Set());
    groupsByRoot.get(root).add(c.id);
  }

  const byArea = new Map();
  for (const a of list) {
    if (parent.has(a.id)) {
      byArea.set(a.id, groupsByRoot.get(find(a.id)));
    } else {
      byArea.set(a.id, new Set([a.id]));
    }
  }
  return byArea;
}

function expandInsideIds(seeds, areaGroups) {
  const out = new Set();
  for (const id of seeds) {
    const group = areaGroups.get(id) || new Set([id]);
    for (const g of group) out.add(g);
  }
  return out;
}

function pointInLinkedAreas(point, area, areasById, areaGroups) {
  const group = areaGroups.get(area.id) || new Set([area.id]);
  for (const id of group) {
    const a = areasById.get(id);
    if (a && pointInArea(point, a)) return true;
  }
  return false;
}

/**
 * Walk the segment and find the earliest obstruction for this attacking model.
 * Returns { t, point, kind } or null if clear.
 * Terrain inside/see-through uses only `attackerModel` (not the whole unit).
 */
function firstObstructionAlongRay(from, to, layout, attackerModel) {
  const features = layout?.terrainFeatures || [];
  const areas = layout?.terrainAreas || [];
  const areasById = new Map(areas.map((a) => [a.id, a]));
  const areaGroups = buildMergedCentreAreaGroups(areas);
  const solidAreas = areas.filter((a) => areaIsSolidBuilding(a, features));

  const touched = areas.filter((a) => modelTouchesArea(attackerModel, a)).map((a) => a.id);
  // Inside one centre half ⇒ inside the whole merged centre block (for this model only)
  const attackerInside = expandInsideIds(touched, areaGroups);

  const STEPS = 96;
  for (let i = 1; i <= STEPS; i++) {
    const t = i / STEPS;
    const p = lerp(from, to, t);

    // Green features block unless this model is inside that feature's area (or linked centre half)
    for (const f of features) {
      if (!isGreenFeature(f)) continue;
      if (attackerInside.has(f.areaId)) continue;
      if (pointInFeature(p, f)) {
        return { t, point: p, kind: 'feature', id: f.id };
      }
    }

    // Solid buildings: block seeing THROUGH (not into, not when this model is inside)
    for (const area of solidAreas) {
      if (!pointInArea(p, area)) continue;
      if (attackerInside.has(area.id)) continue;
      // Seeing into this building or any linked centre half — area itself doesn't block
      if (pointInLinkedAreas(to, area, areasById, areaGroups)) continue;
      return { t, point: p, kind: 'area', id: area.id };
    }
  }
  return null;
}

/**
 * Best edge-to-edge attempt from one attacker model to one target model.
 */
function rayBetweenModels(attacker, targetModel, layout) {
  const tSamples = sampleCircle(targetModel.x, targetModel.y, targetModel.radiusIn, 28);
  // Also try toward center for peeking edges
  tSamples.push({ x: targetModel.x, y: targetModel.y });

  let bestClear = null;
  let bestBlocked = null;

  for (const to of tSamples) {
    const from = edgePointToward(
      { x: attacker.x, y: attacker.y },
      attacker.radiusIn || 0,
      to,
    );
    const hit = firstObstructionAlongRay(from, to, layout, attacker);
    const dist = distance(from, to);
    if (!hit) {
      if (!bestClear || dist < bestClear.dist) {
        bestClear = { from, to, dist, blocked: false, targetModelId: targetModel.id };
      }
    } else {
      const travel = hit.t * dist;
      if (!bestBlocked || travel > bestBlocked.travel) {
        bestBlocked = {
          from,
          to: hit.point,
          blocked: true,
          travel,
          targetModelId: targetModel.id,
        };
      }
    }
  }

  return bestClear || bestBlocked;
}

/**
 * Compute shoot-phase LoS preview: one ray + which attacker models can see.
 * @returns {{
 *   lines: Array<{from,to,blocked,distanceIn?:number,attackerModelId?}>,
 *   anyClear: boolean,
 *   canSeeModelIds: string[],
 * } | null}
 */
function computeBattleLos(state, shooterKey, targetKey) {
  const shooter = state.battleMap?.unitsOnMap?.[shooterKey];
  const target = state.battleMap?.unitsOnMap?.[targetKey];
  if (!shooter?.models?.length || !target?.models?.length) return null;

  const layout = getLayoutById(state.battleMap?.layoutId || 'blank');
  const attackerModels = shooter.models;
  const targetModels = target.models;

  const canSeeModelIds = [];
  let bestClear = null;
  let bestBlocked = null;

  for (const atk of attackerModels) {
    let modelClear = null;
    let modelBlocked = null;
    for (const tgt of targetModels) {
      const ray = rayBetweenModels(atk, tgt, layout);
      if (!ray) continue;
      if (!ray.blocked) {
        if (!modelClear || ray.dist < modelClear.dist) {
          modelClear = { ...ray, attackerModelId: atk.id };
        }
      } else if (!modelBlocked || ray.travel > modelBlocked.travel) {
        modelBlocked = { ...ray, attackerModelId: atk.id };
      }
    }
    if (modelClear) {
      canSeeModelIds.push(atk.id);
      if (!bestClear || modelClear.dist < bestClear.dist) bestClear = modelClear;
    } else if (modelBlocked) {
      if (!bestBlocked || modelBlocked.travel > bestBlocked.travel) bestBlocked = modelBlocked;
    }
  }

  const anyClear = canSeeModelIds.length > 0;
  const lines = [];

  if (bestClear) {
    const distIn =
      typeof bestClear.dist === 'number' ? bestClear.dist : distance(bestClear.from, bestClear.to);
    lines.push({
      from: bestClear.from,
      to: bestClear.to,
      blocked: false,
      distanceIn: distIn,
      attackerModelId: bestClear.attackerModelId,
    });
  } else if (bestBlocked) {
    // Single clipped ray so blocked LoS is still visible without flooding the map
    lines.push({
      from: bestBlocked.from,
      to: bestBlocked.to,
      blocked: true,
      attackerModelId: bestBlocked.attackerModelId,
    });
  }

  return { lines, anyClear, canSeeModelIds };
}

/** Convenience: LoS from combat.active → combat.target during shooting. */
function computeLosFromCombat(state) {
  const step = state.flow?.[state.stepIndex];
  const isShoot =
    step && (step.phase === 'shooting' || String(step.id || '').includes('-shoot'));
  if (!isShoot) return null;
  const active = state.combat?.active;
  const target = state.combat?.target;
  if (!active || !target) return null;
  const shooterKey = `${active.player}:${active.unitId}`;
  const targetKey = `${target.player}:${target.unitId}`;
  return computeBattleLos(state, shooterKey, targetKey);
}

/* --- battleSim\mapView.js --- */
/**
 * SVG map rendering for Battle Sim — grid, terrain, models, radii, LOS.
 */

const PPI = 12; // pixels per inch in SVG user space

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function toPx(inches) {
  return inches * PPI;
}

function getPixelsPerInch() {
  return PPI;
}

function renderGrid(width, height) {
  const lines = [];
  for (let x = 0; x <= width; x++) {
    const bold = x === 0 || x === width || x === width / 2;
    lines.push(
      `<line x1="${toPx(x)}" y1="0" x2="${toPx(x)}" y2="${toPx(height)}" stroke="${bold ? '#555' : '#2a2a2a'}" stroke-width="${bold ? 2 : 1}" />`,
    );
  }
  for (let y = 0; y <= height; y++) {
    const bold = y === 0 || y === height || y === height / 2;
    lines.push(
      `<line x1="0" y1="${toPx(y)}" x2="${toPx(width)}" y2="${toPx(y)}" stroke="${bold ? '#555' : '#2a2a2a'}" stroke-width="${bold ? 2 : 1}" />`,
    );
  }
  return `<g class="map-grid">${lines.join('')}</g>`;
}

function polyPoints(polygon) {
  return polygon.map((p) => `${toPx(p.x)},${toPx(p.y)}`).join(' ');
}

function renderDeploymentZones(zones) {
  return (zones || [])
    .map((zone) => {
      const color = zone.color === 'red' ? '#dc2626' : '#2563eb';
      const fill = zone.color === 'red' ? 'rgba(220, 38, 38, 0.14)' : 'rgba(37, 99, 235, 0.14)';
      if (zone.polygon?.length >= 3) {
        return `<polygon points="${polyPoints(zone.polygon)}" fill="${fill}" stroke="${color}" stroke-width="3" stroke-opacity="0.95" />`;
      }
      const b = zone.bounds;
      if (!b) return '';
      return `<rect x="${toPx(b.x)}" y="${toPx(b.y)}" width="${toPx(b.w)}" height="${toPx(b.h)}" fill="${fill}" stroke="${color}" stroke-width="3" stroke-opacity="0.95" />`;
    })
    .join('');
}

function renderTerrainAreas(areas) {
  return (areas || [])
    .map((area) => {
      const fill = area.isObjective ? 'rgba(249, 115, 22, 0.42)' : 'rgba(70, 70, 70, 0.5)';
      const stroke = area.isObjective ? 'rgba(249, 115, 22, 0.95)' : 'rgba(130, 130, 130, 0.7)';
      const width = area.isObjective ? '2.5' : '1.5';
      if (area.polygon?.length >= 3) {
        return `<polygon points="${polyPoints(area.polygon)}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" />`;
      }
      const b = area.bounds;
      if (!b) return '';
      return `<rect x="${toPx(b.x)}" y="${toPx(b.y)}" width="${toPx(b.w)}" height="${toPx(b.h)}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" />`;
    })
    .join('');
}

function renderTerrainFeatures(features) {
  return (features || [])
    .map((f) => {
      const fill = f.color === 'green' ? 'rgba(22, 163, 74, 0.85)' : 'rgba(234, 179, 8, 0.75)';
      const stroke = f.color === 'green' ? '#15803d' : '#a16207';
      const attrs = `fill="${fill}" stroke="${stroke}" stroke-width="1" data-feature-id="${esc(f.id)}" data-solid="${f.solid ? '1' : '0'}"`;
      if (f.polygon?.length >= 3) {
        return `<polygon points="${polyPoints(f.polygon)}" ${attrs} />`;
      }
      const b = f.bounds;
      if (!b) return '';
      return `<rect x="${toPx(b.x)}" y="${toPx(b.y)}" width="${toPx(b.w)}" height="${toPx(b.h)}" ${attrs} />`;
    })
    .join('');
}

function renderObjectives(objectives) {
  return (objectives || [])
    .map((o) => {
      const x = toPx(o.x);
      const y = toPx(o.y);
      const type = o.type || 'centre';
      if (type === 'home') {
        const fill = o.owner === 'attacker' ? '#dc2626' : '#2563eb';
        const s = toPx(1.1);
        // castle-style square with battlements
        return `
          <g class="map-objective map-objective-home" pointer-events="none">
            <rect x="${x - s}" y="${y - s}" width="${s * 2}" height="${s * 2}" fill="${fill}" stroke="#fff" stroke-width="2" />
            <rect x="${x - s}" y="${y - s - toPx(0.35)}" width="${toPx(0.45)}" height="${toPx(0.4)}" fill="${fill}" stroke="#fff" stroke-width="1" />
            <rect x="${x - toPx(0.22)}" y="${y - s - toPx(0.35)}" width="${toPx(0.45)}" height="${toPx(0.4)}" fill="${fill}" stroke="#fff" stroke-width="1" />
            <rect x="${x + s - toPx(0.45)}" y="${y - s - toPx(0.35)}" width="${toPx(0.45)}" height="${toPx(0.4)}" fill="${fill}" stroke="#fff" stroke-width="1" />
          </g>`;
      }
      if (type === 'expansion') {
        const s = toPx(1.35);
        const diamond = `${x},${y - s} ${x + s},${y} ${x},${y + s} ${x - s},${y}`;
        return `
          <g class="map-objective map-objective-expansion" pointer-events="none">
            <polygon points="${diamond}" fill="#16a34a" stroke="#fff" stroke-width="2" />
            <circle cx="${x}" cy="${y}" r="${toPx(0.35)}" fill="#052e16" />
            <path d="M ${x - toPx(0.22)} ${y - toPx(0.08)} Q ${x} ${y - toPx(0.35)} ${x + toPx(0.22)} ${y - toPx(0.08)} Q ${x + toPx(0.18)} ${y + toPx(0.22)} ${x} ${y + toPx(0.28)} Q ${x - toPx(0.18)} ${y + toPx(0.22)} ${x - toPx(0.22)} ${y - toPx(0.08)} Z" fill="#fff" />
            <circle cx="${x - toPx(0.08)}" cy="${y - toPx(0.02)}" r="${toPx(0.06)}" fill="#052e16" />
            <circle cx="${x + toPx(0.08)}" cy="${y - toPx(0.02)}" r="${toPx(0.06)}" fill="#052e16" />
          </g>`;
      }
      // centre
      const r = toPx(1.35);
      return `
        <g class="map-objective map-objective-centre" pointer-events="none">
          <circle cx="${x}" cy="${y}" r="${r}" fill="#16a34a" stroke="#fff" stroke-width="2" />
          <circle cx="${x}" cy="${y}" r="${toPx(0.4)}" fill="#052e16" />
          <path d="M ${x - toPx(0.25)} ${y - toPx(0.1)} Q ${x} ${y - toPx(0.4)} ${x + toPx(0.25)} ${y - toPx(0.1)} Q ${x + toPx(0.2)} ${y + toPx(0.25)} ${x} ${y + toPx(0.32)} Q ${x - toPx(0.2)} ${y + toPx(0.25)} ${x - toPx(0.25)} ${y - toPx(0.1)} Z" fill="#fff" />
          <circle cx="${x - toPx(0.09)}" cy="${y - toPx(0.02)}" r="${toPx(0.07)}" fill="#052e16" />
          <circle cx="${x + toPx(0.09)}" cy="${y - toPx(0.02)}" r="${toPx(0.07)}" fill="#052e16" />
        </g>`;
    })
    .join('');
}

function renderMeasurements(measurements) {
  if (!measurements) return '';
  const lines = (measurements.lines || [])
    .map(
      (l) =>
        `<line x1="${toPx(l.x1)}" y1="${toPx(l.y1)}" x2="${toPx(l.x2)}" y2="${toPx(l.y2)}" stroke="#60a5fa" stroke-width="1.5" stroke-opacity="0.85" pointer-events="none" />`,
    )
    .join('');
  const labels = (measurements.labels || [])
    .map((lab) => {
      const x = toPx(lab.x);
      const y = toPx(lab.y);
      return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" fill="#3b82f6" stroke="#fff" stroke-width="3" paint-order="stroke" font-size="11" font-weight="700" pointer-events="none">${esc(lab.text)}</text>`;
    })
    .join('');
  return `<g class="map-measurements">${lines}${labels}</g>`;
}

function renderRadii(radii) {
  return (radii || [])
    .map((r) => {
      const stroke = r.kind === 'move' ? '#38bdf8' : '#fbbf24';
      return `<circle cx="${toPx(r.x)}" cy="${toPx(r.y)}" r="${toPx(r.radius)}" fill="${stroke}" fill-opacity="0.08" stroke="${stroke}" stroke-width="2" stroke-dasharray="6 4" pointer-events="none" />`;
    })
    .join('');
}

function formatInches(n) {
  const v = Math.round(Number(n) * 10) / 10;
  if (!Number.isFinite(v)) return '';
  return Number.isInteger(v) ? `${v}"` : `${v.toFixed(1)}"`;
}

function renderLos(los) {
  if (!los) return '';
  const lines = Array.isArray(los.lines) ? los.lines : los.from && los.to ? [los] : [];
  if (!lines.length) return '';
  return `<g class="map-los" pointer-events="none">${lines
    .map((line) => {
      const blocked = !!line.blocked;
      // Thin, vibrant red; blocked rays slightly dimmer / dashed
      const stroke = blocked ? '#ff2a2a' : '#ff1a1a';
      const width = blocked ? '1.25' : '1.75';
      const dash = blocked ? 'stroke-dasharray="5 4"' : '';
      const opacity = blocked ? '0.85' : '1';
      const seg = `<line x1="${toPx(line.from.x)}" y1="${toPx(line.from.y)}" x2="${toPx(line.to.x)}" y2="${toPx(line.to.y)}" stroke="${stroke}" stroke-width="${width}" stroke-opacity="${opacity}" ${dash} />`;
      // Distance label only when LoS connects (grid units = inches)
      if (blocked || line.distanceIn == null) return seg;
      const midX = toPx((line.from.x + line.to.x) / 2);
      const midY = toPx((line.from.y + line.to.y) / 2);
      const text = formatInches(line.distanceIn);
      if (!text) return seg;
      return `${seg}<text x="${midX}" y="${midY}" text-anchor="middle" dominant-baseline="middle" fill="#ff1a1a" stroke="#fff" stroke-width="3.5" paint-order="stroke" font-size="12" font-weight="700">${esc(text)}</text>`;
    })
    .join('')}</g>`;
}

function renderModels(unitsOnMap, selectedUnitKey, selectedModelId, highlights = {}) {
  const mustTest = highlights.mustTestKeys || new Set();
  const shocked = highlights.shockedKeys || new Set();
  const losCanSee = highlights.losCanSeeIds || new Set();
  return Object.entries(unitsOnMap || {})
    .flatMap(([key, entry]) =>
      (entry.models || []).map((m) => {
        const isUnitSel = key === selectedUnitKey;
        const isModelSel = m.id === selectedModelId;
        const fill = entry.player === 'player1' ? '#3b82f6' : '#22c55e';
        const r = toPx(m.radiusIn);
        const cx = toPx(m.x);
        const cy = toPx(m.y);
        const mustTestRing = mustTest.has(key)
          ? `<circle cx="${cx}" cy="${cy}" r="${r + 5}" fill="none" stroke="#5a8fd0" stroke-width="2.5" stroke-dasharray="5 3" pointer-events="none" />`
          : '';
        const shockedRing = shocked.has(key)
          ? `<circle cx="${cx}" cy="${cy}" r="${r + 3.5}" fill="rgba(45, 75, 130, 0.4)" stroke="#5a8fd0" stroke-width="2.5" pointer-events="none" />`
          : '';
        // Clear LoS: models that can shoot this target
        const losRing = losCanSee.has(m.id)
          ? `<circle cx="${cx}" cy="${cy}" r="${r + 4}" fill="none" stroke="#ff1a1a" stroke-width="2.25" pointer-events="none" />`
          : '';
        const ring = isUnitSel
          ? `<circle cx="${cx}" cy="${cy}" r="${r + 2}" fill="none" stroke="#f8fafc" stroke-width="1.5" pointer-events="none" />`
          : '';
        const sel = isModelSel
          ? `<circle cx="${cx}" cy="${cy}" r="${r + 3.5}" fill="none" stroke="#fbbf24" stroke-width="1.5" stroke-dasharray="3 2" pointer-events="none" />`
          : '';
        return `
          <g class="map-model" data-unit-key="${esc(key)}" data-model-id="${esc(m.id)}" data-player="${esc(entry.player)}" data-unit-id="${esc(entry.unitId)}" style="cursor:grab">
            ${mustTestRing}${shockedRing}${losRing}${ring}${sel}
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="#0a0a0a" stroke-width="1.5" />
          </g>`;
      }),
    )
    .join('');
}

function renderSpecialMarkers(markers, selectedModelId) {
  return (markers || [])
    .map((m) => {
      const r = toPx(m.radiusIn || 0.5);
      const sel =
        selectedModelId === m.id
          ? `<circle cx="${toPx(m.x)}" cy="${toPx(m.y)}" r="${r + 3}" fill="none" stroke="#fbbf24" stroke-width="1.5" />`
          : '';
      return `
        <g class="map-special" data-special-id="${esc(m.id)}" style="cursor:grab">
          ${sel}
          <circle cx="${toPx(m.x)}" cy="${toPx(m.y)}" r="${r}" fill="#a855f7" stroke="#fff" stroke-width="1.5" />
          <text x="${toPx(m.x)}" y="${toPx(m.y) - r - 4}" text-anchor="middle" fill="#e9d5ff" font-size="10">${esc(m.name || 'Marker')}</text>
        </g>`;
    })
    .join('');
}

function renderMapSvg(state, options = {}) {
  const layout = getLayoutById(state.battleMap?.layoutId || 'blank');
  const board = boardSizeForLayout(layout);
  const cam = state.battleMap?.camera || { x: 0, y: 0, zoom: 1 };
  const pad = 8; // inches of off-board staging visible
  const svgW = toPx(board.width + pad * 2);
  const svgH = toPx(board.height + pad * 2);
  const transform = `translate(${toPx(pad + (cam.x || 0))} ${toPx(pad + (cam.y || 0))}) scale(${cam.zoom || 1})`;
  const selectedSpecial = (state.battleMap?.specialMarkers || []).find(
    (m) => m.id === state.battleMap?.selectedModelId,
  );

  return `
    <div class="battle-map-viewport" data-map-viewport="1">
      <div class="battle-map-toolbar">
        <label class="battle-map-layout-label">Layout
          <select data-action="set-map-layout">
            ${(options.layouts || []).map((l) => `<option value="${esc(l.id)}" ${l.id === layout.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}
            <option value="__add_new__">Add new…</option>
          </select>
        </label>
        <button type="button" data-action="map-zoom" data-delta="0.15">Zoom +</button>
        <button type="button" data-action="map-zoom" data-delta="-0.15">Zoom −</button>
        <button type="button" data-action="map-reset-camera">Reset view</button>
        <button type="button" data-action="add-special-marker">Add special marker</button>
        ${
          selectedSpecial
            ? `<button type="button" class="remove-special-btn" data-action="remove-special-marker" data-special-id="${esc(selectedSpecial.id)}">Remove marker</button>`
            : ''
        }
      </div>
      ${options.reminderHtml || ''}
      <div class="battle-map-canvas-wrap">
        <svg class="battle-map-svg" width="100%" height="100%" viewBox="0 0 ${svgW} ${svgH}" data-board-w="${board.width}" data-board-h="${board.height}" data-ppi="${PPI}" data-pad="${pad}">
          <rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#0c0c0c" />
          <g class="battle-map-world" transform="${transform}">
            <rect x="0" y="0" width="${toPx(board.width)}" height="${toPx(board.height)}" fill="#111" stroke="#666" stroke-width="2" />
            ${renderGrid(board.width, board.height)}
            ${renderDeploymentZones(layout.deploymentZones)}
            ${renderTerrainAreas(layout.terrainAreas)}
            ${renderTerrainFeatures(layout.terrainFeatures)}
            ${renderRadii(options.radii)}
            ${renderModels(
              state.battleMap?.unitsOnMap,
              state.battleMap?.selectedUnitKey,
              state.battleMap?.selectedModelId,
              {
                ...(options.modelHighlights || {}),
                losCanSeeIds: new Set(state.battleMap?.losPreview?.canSeeModelIds || []),
              },
            )}
            ${renderSpecialMarkers(state.battleMap?.specialMarkers, state.battleMap?.selectedModelId)}
            ${renderLos(state.battleMap?.losPreview)}
          </g>
        </svg>
      </div>
    </div>`;
}

function clientToBoardInches(svgEl, clientX, clientY, camera) {
  const rect = svgEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return { x: 0, y: 0 };
  const vb = svgEl.viewBox.baseVal;
  const pad = Number(svgEl.dataset.pad || 8);
  const ppi = Number(svgEl.dataset.ppi || PPI);
  const zoom = camera?.zoom || 1;
  const sx = ((clientX - rect.left) / rect.width) * vb.width;
  const sy = ((clientY - rect.top) / rect.height) * vb.height;
  const x = (sx / ppi - pad - (camera?.x || 0)) / zoom;
  const y = (sy / ppi - pad - (camera?.y || 0)) / zoom;
  return { x, y };
}

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

function buildFullGuideFlow(player1Name, player2Name, firstPlayer = 'player1') {
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

function cleanRuleText(text) {
  if (!text) return '';
  return text
    .replace(/\*\*\^\^([^]+?)\^\^\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectTimingModifier(description, abilityName = '') {
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

function analyzeAbility(description, abilityName = '') {
  const desc = cleanRuleText(description || abilityName);
  const combined = `${abilityName} ${desc}`;
  const timing = detectTimingModifier(desc, abilityName);
  const slot = detectPhaseSlotExplicit(desc, abilityName) || detectPhaseSlotFromPatterns(combined.toLowerCase());
  return { slot, timing, description: desc };
}

function detectPhaseSlot(description, abilityName = '') {
  return analyzeAbility(description, abilityName).slot;
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

function extractArmyAbilities(roster) {
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
function getPhaseContext(step) {
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

function getSlotsForStep(step) {
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
function getAllAbilitiesForStep(state, step) {
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

/** All abilities from roster with phase slot (or null) — for army panel reference. */
function listAllAbilities(roster) {
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

function isArmyWideRule(rule) {
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

function formatUnitStatsLine(stats) {
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

function getUnitWoundsPerModel(unit) {
  if (unit?.woundsPerModel > 0) return unit.woundsPerModel;
  return parseWoundValue(unit?.stats?.W ?? unit?.stats?.Wounds);
}

function getUnitInitialModelCount(unit) {
  if (unit?.initialModelCount > 0) return unit.initialModelCount;
  return Math.max(1, unit?.modelCount ?? 1);
}

function indexKeywordRules(rules) {
  const index = {};
  for (const rule of rules || []) {
    if (!rule?.name || !rule.description) continue;
    index[rule.name] = { id: rule.id, name: rule.name, description: rule.description };
  }
  return index;
}

function findKeywordRule(keyword, ruleIndex) {
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

function getUnitKeywordRules(unit) {
  if (unit?.keywordRules && typeof unit.keywordRules === 'object') return unit.keywordRules;
  return indexKeywordRules(unit?.rules);
}

const UNIT_ABILITY_RULE_PATTERNS = [/^feel no pain/i, /^deadly demise/i, /^deep strike/i];

const UNIT_DISPLAY_KEYWORD_PATTERNS = [/^deep strike/i];

function isPromotedUnitAbilityRule(rule) {
  const name = rule?.name || '';
  if (!name || !rule?.description) return false;
  if (name === 'Leader' || name === 'Oath of Moment') return false;
  return UNIT_ABILITY_RULE_PATTERNS.some((pattern) => pattern.test(name));
}

/** Profile abilities plus unit-level rules like Feel No Pain and Deadly Demise. */
function getUnitDisplayAbilities(unit) {
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

function unitHasDeepStrike(unit) {
  if ((unit?.keywords || []).some((k) => /^deep strike$/i.test(k))) return true;
  if ((unit?.rules || []).some((r) => /^deep strike/i.test(r.name))) return true;
  if ((unit?.abilities || []).some((a) => /^deep strike/i.test(a.name))) return true;
  return getUnitDisplayAbilities(unit).some((a) => /^deep strike/i.test(a.name));
}

/** Unit keywords plus ability keywords like Deep Strike from rules/abilities. */
function getUnitDisplayKeywords(unit) {
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

function normalizeArmyDetachments(army) {
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

function normalizeArmy(army) {
  if (!army) return army;
  return normalizeArmyDetachments(normalizeArmyUnits(army));
}

function normalizeArmyUnits(army) {
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

function parseRosterJson(json) {
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

/* --- guide\weaponUi.js --- */
/**
 * Shared weapon table + clickable keyword chips (Companion + Battle Sim).
 */

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function splitKeywordString(keywordStr) {
  if (!keywordStr || keywordStr === '—') return [];
  return String(keywordStr)
    .split(/,\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function renderKeywordChip(keyword, ruleIndex, context) {
  const rule = findKeywordRule(keyword, ruleIndex);
  if (!rule) return `<span class="kw-plain">${esc(keyword)}</span>`;
  return `<button type="button" class="kw-inline-link" data-action="show-keyword-rule" data-player="${context.player}" data-unit-id="${esc(context.unitId)}" data-rule-name="${esc(keyword)}">${esc(keyword)}</button>`;
}

function renderKeywordList(keywords, ruleIndex, context, separator = ' · ') {
  if (!keywords?.length) return '';
  return keywords
    .map((kw, index) => {
      const chip = renderKeywordChip(kw, ruleIndex, context);
      return index < keywords.length - 1 ? `${chip}${separator}` : chip;
    })
    .join('');
}

function renderWeaponKeywords(keywordStr, ruleIndex, context) {
  const parts = splitKeywordString(keywordStr);
  if (!parts.length) return '—';
  return parts
    .map((kw, index) => {
      const chip = renderKeywordChip(kw, ruleIndex, context);
      return index < parts.length - 1 ? `${chip}, ` : chip;
    })
    .join('');
}

/**
 * @param {object[]} weapons
 * @param {'ranged'|'melee'} type
 * @param {object} keywordRuleIndex
 * @param {{ player: string, unitId: string } | null} context
 * @param {{ selectableRange?: boolean, selectedWeaponIndex?: number|null }} [options]
 */
function renderWeaponTable(weapons, type, keywordRuleIndex = {}, context = null, options = {}) {
  if (!weapons?.length) return '';
  const isRanged = type === 'ranged';
  const skillCol = isRanged ? 'BS' : 'WS';
  const selectable = !!options.selectableRange && isRanged && context;
  const selectedIndex = options.selectedWeaponIndex;

  const rows = weapons
    .map((w, i) => {
      const skill = isRanged ? w.bs : w.ws;
      const range = isRanged ? w.range : 'Melee';
      const kwCell = context
        ? renderWeaponKeywords(w.keywords, keywordRuleIndex, context)
        : esc(w.keywords || '—');
      let nameCell = `<td class="weapon-name">${esc(w.name)}</td>`;
      if (selectable) {
        const active = selectedIndex === i ? 'is-weapon-selected' : '';
        nameCell = `<td class="weapon-name">
          <button type="button" class="weapon-range-btn ${active}" data-action="map-select-weapon" data-player="${context.player}" data-unit-id="${esc(context.unitId)}" data-weapon-index="${i}" title="Show this weapon's range on the map">${esc(w.name)}</button>
        </td>`;
      }
      return `
      <tr class="${selectable && selectedIndex === i ? 'weapon-row-selected' : ''}">
        ${nameCell}
        <td>${esc(range)}</td>
        <td>${esc(w.a)}</td>
        <td>${esc(skill)}</td>
        <td>${esc(w.s)}</td>
        <td>${esc(w.ap)}</td>
        <td>${esc(w.d)}</td>
        <td class="weapon-kw">${kwCell}</td>
      </tr>`;
    })
    .join('');

  return `
    <table class="weapon-table">
      <thead>
        <tr>
          <th>Weapon</th>
          <th>Rng</th>
          <th>A</th>
          <th>${skillCol}</th>
          <th>S</th>
          <th>AP</th>
          <th>D</th>
          <th>Keywords</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderKeywordRulePopover(state) {
  const pop = state.keywordRulePopup;
  if (!pop) return '';
  return `
    <div class="keyword-rule-popover-backdrop" data-action="close-keyword-rule">
      <div class="keyword-rule-popover" role="dialog" aria-labelledby="keyword-rule-title">
        <button type="button" class="keyword-rule-popover-close" data-action="close-keyword-rule" aria-label="Close">×</button>
        <h4 id="keyword-rule-title">${esc(pop.name)}</h4>
        <p>${esc(pop.description)}</p>
      </div>
    </div>`;
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

function getDeadUnitIds(state, playerKey) {
  return new Set(state.deadUnits?.[playerKey] || []);
}

function isUnitDead(state, playerKey, unitId) {
  return getDeadUnitIds(state, playerKey).has(unitId);
}

function getUnitWoundsTaken(state, playerKey, unitId) {
  return state.unitWounds?.[playerKey]?.[unitId] ?? 0;
}

function getUnitWoundCapacity(unit) {
  return getUnitWoundsPerModel(unit) * getUnitInitialModelCount(unit);
}

function getRemainingModels(unit, woundsTaken) {
  const w = getUnitWoundsPerModel(unit);
  const initial = getUnitInitialModelCount(unit);
  const lost = Math.floor(woundsTaken / w);
  return Math.max(0, initial - lost);
}

/** Leader + bodyguard share one group when attached. Multiple leaders (e.g. Leader + Support) can attach to one bodyguard. */
function unitIsSupport(unit) {
  if (unit?.isSupport) return true;
  if ((unit?.keywords || []).some((k) => /^support$/i.test(k))) return true;
  if ((unit?.abilities || []).some((a) => /^support$/i.test(a.name))) return true;
  return (unit?.rules || []).some((r) => /^support$/i.test(r.name));
}

function unitCanLead(unit) {
  return !!unit?.isLeader || unitIsSupport(unit);
}

function getLeadersOnBodyguard(leaderAttachments, bodyguardId) {
  const leaders = [];
  for (const [leaderId, attachedId] of Object.entries(leaderAttachments || {})) {
    if (attachedId === bodyguardId) leaders.push(leaderId);
  }
  return leaders;
}

function canLeaderAttachTo(army, leaderAttachments, leaderId, bodyguardId) {
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

function getUnitGroupInfo(army, leaderAttachments, unitId) {
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

function getCombatDisplayUnits(army, leaderAttachments, unitId) {
  const group = getUnitGroupInfo(army, leaderAttachments, unitId);
  return group.unitIds.map((id) => army?.units?.find((u) => u.id === id)).filter(Boolean);
}

function isCombatActionStep(step) {
  if (!step?.player) return false;
  return step.id === `${step.player}-shoot` || step.id === `${step.player}-fight`;
}

function getGroupStrengthStats(state, playerKey, groupInfo, army) {
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

function isGroupBattleShockEligible(state, playerKey, groupInfo, army) {
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

function isGroupBattleShocked(state, playerKey, groupId) {
  return (state.battleShocked?.[playerKey] || []).includes(groupId);
}

function groupMustTakeBattleShockTest(state, playerKey, groupInfo, army) {
  const stats = getGroupStrengthStats(state, playerKey, groupInfo, army);
  if (stats.allDead) return false;
  if (isGroupBattleShocked(state, playerKey, groupInfo.groupId)) return true;
  return isGroupBattleShockEligible(state, playerKey, groupInfo, army);
}

function getBattleShockActivePlayer(state) {
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

function snapshotScoreSlice(score) {
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

function findUnitInArmy(army, unitId) {
  return army?.units?.find((u) => u.id === unitId) || null;
}

function getUnitPhaseKey(step) {
  if (!step?.player || !step?.phase || !step?.round) return null;
  return `${step.player}-${step.phase}-${step.round}`;
}

function isUnitChecklistStep(step) {
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

function rebuildFlow(state) {
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

function guideReducer(state, action) {
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

function getCurrentStep(state) {
  return state.flow[state.stepIndex] || null;
}

function getProgress(state) {
  if (!state.flow.length) return 0;
  return Math.round((state.stepIndex / (state.flow.length - 1)) * 100);
}

/* --- battleSim\battleSimRender.js --- */
/**
 * Battle Sim alternate view — map-focused UI sharing guide state.
 */

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

function renderBattleReadyBtn(state, playerKey) {
  const active = !!state.battleReady?.[playerKey];
  return `<button type="button" class="battle-ready-btn ${active ? 'active' : ''}" data-action="toggle-battle-ready" data-player="${playerKey}">Battle Ready Army</button>`;
}

function renderSimScoreboard(state) {
  const p1 = state.player1;
  const p2 = state.player2;
  const step = getCurrentStep(state);

  return `
    <header class="scoreboard sim-scoreboard">
      <div class="score-player score-left">
        <div class="score-player-name">${esc(p1.army?.name || p1.name)}</div>
        <div class="score-row">
          ${renderScoreCell(p1, 'cp', 'CP', p1.score.cp, 'player1')}
          ${renderScoreCell(p1, 'secondary', 'Sec', p1.score.secondary, 'player1')}
          ${renderScoreCell(p1, 'primary', 'Prim', p1.score.primary, 'player1')}
          <div class="score-cell score-total-cell">
            <span class="score-label">Total</span>
            <span class="score-total">${totalScore(p1.score)}</span>
          </div>
          ${renderBattleReadyBtn(state, 'player1')}
        </div>
      </div>
      <div class="score-center">
        <div class="score-vs">VS</div>
        <div class="turn-display">${esc(step?.turnLabel || 'Load armies to begin')}</div>
        <div class="view-mode-bar">
          <button type="button" class="view-mode-btn" data-action="set-view-mode" data-mode="companion">Companion</button>
          <button type="button" class="view-mode-btn active" data-action="set-view-mode" data-mode="battleSim">Battle Map</button>
        </div>
        ${state.started ? `
          <div class="sim-step-nav">
            <button type="button" data-action="prev-step" ${state.stepIndex === 0 ? 'disabled' : ''} aria-label="Previous step">←</button>
            <span class="step-counter" title="${esc(step?.label || '')}">${esc(step?.label || '')}</span>
            <button type="button" data-action="next-step" ${state.stepIndex >= state.flow.length - 1 ? 'disabled' : ''} aria-label="Next step">→</button>
          </div>` : ''}
      </div>
      <div class="score-player score-right">
        <div class="score-player-name">${esc(p2.army?.name || p2.name)}</div>
        <div class="score-row score-row-mirror">
          ${renderBattleReadyBtn(state, 'player2')}
          <div class="score-cell score-total-cell">
            <span class="score-label">Total</span>
            <span class="score-total">${totalScore(p2.score)}</span>
          </div>
          ${renderScoreCell(p2, 'primary', 'Prim', p2.score.primary, 'player2')}
          ${renderScoreCell(p2, 'secondary', 'Sec', p2.score.secondary, 'player2')}
          ${renderScoreCell(p2, 'cp', 'CP', p2.score.cp, 'player2')}
        </div>
      </div>
    </header>`;
}

function renderSimArmyList(state, playerKey) {
  const player = state[playerKey];
  const army = player?.army;
  if (!army) {
    return `
      <div class="sim-army-panel army-empty" data-player="${playerKey}">
        <h3>${playerKey === 'player1' ? 'Player 1' : 'Player 2'}</h3>
        <p class="hint">Load an army in Companion view first.</p>
        <button type="button" class="btn-small" data-action="set-view-mode" data-mode="companion">Open Companion</button>
      </div>`;
  }

  const attachments = state.leaderAttachments?.[playerKey] || {};
  const selected = parseMapUnitKey(state.battleMap?.selectedUnitKey);
  const units = army.units
    .map((u) => {
      const dead = isUnitDead(state, playerKey, u.id);
      const group = getUnitGroupInfo(army, attachments, u.id);
      const mapKey = mapUnitKey(playerKey, group.groupId);
      const onMap = !!state.battleMap?.unitsOnMap?.[mapKey];
      const woundsTaken = getUnitWoundsTaken(state, playerKey, u.id);
      const remaining = getRemainingModels(u, woundsTaken);
      const sel =
        selected?.player === playerKey &&
        (selected?.unitId === u.id || selected?.unitId === group.groupId)
          ? 'selected'
          : '';
      return `
        <div class="sim-unit-row ${dead ? 'is-dead' : ''} ${sel}" data-unit-key="${esc(mapUnitKey(playerKey, u.id))}">
          <button type="button" class="sim-unit-select" data-action="map-select-unit" data-player="${playerKey}" data-unit-id="${esc(u.id)}">
            <strong>${esc(u.name)}</strong>
            <span class="sim-unit-meta">${remaining} · ${esc(u.statsLine || '')}</span>
          </button>
          <button type="button" class="btn-small ${onMap ? 'withdraw-btn' : 'deploy-btn'}" data-action="${onMap ? 'map-withdraw-unit' : 'map-deploy-unit'}" data-player="${playerKey}" data-unit-id="${esc(u.id)}" ${dead ? 'disabled' : ''}>
            ${onMap ? 'Withdraw' : 'Deploy'}
          </button>
        </div>`;
    })
    .join('');

  return `
    <div class="sim-army-panel" data-player="${playerKey}">
      <div class="army-panel-header">
        <div>
          <h3>${esc(army.name)}</h3>
          <p class="army-meta">${esc(army.faction)} · ${army.points} pts</p>
        </div>
      </div>
      <div class="sim-unit-list">${units}</div>
      ${renderSimUnitCard(state, playerKey)}
      ${renderSimCombatOverlay(state, playerKey)}
    </div>`;
}

function renderSimWeaponBlocks(unit, playerKey, selectedWeapon, selectableRange) {
  const keywordRuleIndex = getUnitKeywordRules(unit);
  const kwContext = { player: playerKey, unitId: unit.id };
  const selectedIndex =
    selectedWeapon?.unitId === unit.id && Number.isInteger(selectedWeapon.weaponIndex)
      ? selectedWeapon.weaponIndex
      : null;
  const ranged = unit.rangedWeapons?.length
    ? `<div class="combat-weapons-block">
        <h5>Ranged${selectableRange ? ' <span class="hint-inline">(click weapon name for range)</span>' : ''}</h5>
        ${renderWeaponTable(unit.rangedWeapons, 'ranged', keywordRuleIndex, kwContext, {
          selectableRange: !!selectableRange,
          selectedWeaponIndex: selectedIndex,
        })}
      </div>`
    : '';
  const melee = unit.meleeWeapons?.length
    ? `<div class="combat-weapons-block">
        <h5>Melee</h5>
        ${renderWeaponTable(unit.meleeWeapons, 'melee', keywordRuleIndex, kwContext)}
      </div>`
    : '';
  return { ranged, melee };
}

function renderSimShockBtn(state, playerKey, unitId) {
  const army = state[playerKey]?.army;
  if (!army) return '';
  const attachments = state.leaderAttachments?.[playerKey] || {};
  const group = getUnitGroupInfo(army, attachments, unitId);
  if (isUnitDead(state, playerKey, unitId)) return '';
  const shocked = isGroupBattleShocked(state, playerKey, group.groupId);
  return `<button type="button" class="unit-shock-btn ${shocked ? 'shocked' : ''}" data-action="toggle-battle-shock" data-player="${playerKey}" data-group-id="${esc(group.groupId)}">BattleShocked</button>`;
}

function collectModelHighlights(state) {
  const mustTestKeys = new Set();
  const shockedKeys = new Set();
  const unitsOnMap = state.battleMap?.unitsOnMap || {};
  const activeShockPlayer = getBattleShockActivePlayer(state);

  for (const [key, entry] of Object.entries(unitsOnMap)) {
    const army = state[entry.player]?.army;
    if (!army) continue;
    const attachments = state.leaderAttachments?.[entry.player] || {};
    const group = getUnitGroupInfo(army, attachments, entry.unitId);
    if (isGroupBattleShocked(state, entry.player, group.groupId)) {
      shockedKeys.add(key);
    }
    if (
      activeShockPlayer === entry.player &&
      groupMustTakeBattleShockTest(state, entry.player, group, army)
    ) {
      mustTestKeys.add(key);
    }
  }
  return { mustTestKeys, shockedKeys };
}

function renderSimUnitCard(state, playerKey) {
  const step = getCurrentStep(state);
  if (isCombatActionStep(step) && state.combat?.active && state.combat.active.player === playerKey) return '';
  if (isCombatActionStep(step) && state.combat?.target && state.combat.target.player === playerKey) return '';

  const selected = parseMapUnitKey(state.battleMap?.selectedUnitKey);
  if (!selected || selected.player !== playerKey) return '';
  const attachments = state.leaderAttachments?.[playerKey] || {};
  const units = getCombatDisplayUnits(state[playerKey]?.army, attachments, selected.unitId);
  if (!units.length) return '';

  const selectedWeapon = state.battleMap?.selectedWeapon || null;
  const blocks = units
    .map((unit) => {
      const woundsTaken = getUnitWoundsTaken(state, playerKey, unit.id);
      const remaining = getRemainingModels(unit, woundsTaken);
      const woundCap = getUnitWoundCapacity(unit);
      const abilities = getUnitDisplayAbilities(unit)
        .slice(0, 6)
        .map(
          (a) => `
      <div class="combat-ability-item">
        <strong>${esc(a.name)}</strong>
        <p>${esc(a.description)}</p>
      </div>`,
        )
        .join('');
      const { ranged, melee } = renderSimWeaponBlocks(unit, playerKey, selectedWeapon, true);
      const roleTag = unit.isLeader ? 'Leader' : unitIsSupport(unit) ? 'Support' : '';
      return `
      <div class="combat-unit-block">
        <div class="combat-unit-header">
          <h3>${esc(unit.name)}${roleTag ? ` <span class="combat-role-tag">${roleTag}</span>` : ''}</h3>
          <p class="combat-unit-meta">${remaining} models · ${woundsTaken}/${woundCap} wounds</p>
          ${unit.statsLine ? `<p class="combat-unit-stats">${esc(unit.statsLine)}</p>` : ''}
        </div>
        <div class="combat-wounds-row">
          <span class="combat-wounds-label">Wounds</span>
          <div class="combat-wounds-controls">
            <button type="button" data-action="adjust-unit-wounds" data-player="${playerKey}" data-unit-id="${esc(unit.id)}" data-delta="-1">−</button>
            <span class="combat-wounds-value">${woundsTaken}</span>
            <button type="button" data-action="adjust-unit-wounds" data-player="${playerKey}" data-unit-id="${esc(unit.id)}" data-delta="1">+</button>
          </div>
          <span class="combat-wounds-cap">/ ${woundCap}</span>
          ${renderSimShockBtn(state, playerKey, unit.id)}
        </div>
        ${ranged || ''}
        ${melee || ''}
        ${abilities ? `<details class="combat-collapsed"><summary>Abilities</summary>${abilities}</details>` : ''}
      </div>`;
    })
    .join('');

  return `
    <div class="combat-overlay combat-overlay-selected">
      <button type="button" class="combat-overlay-close" data-action="map-clear-selection" aria-label="Close">×</button>
      <div class="combat-overlay-body">${blocks}</div>
    </div>`;
}

function renderSimCombatOverlay(state, playerKey) {
  const step = getCurrentStep(state);
  if (!isCombatActionStep(step) || !state.combat) return '';

  const army = state[playerKey]?.army;
  if (!army) return '';
  const attachments = state.leaderAttachments?.[playerKey] || {};

  let unitId = null;
  let variant = '';
  if (state.combat.active?.player === playerKey && state.combat.active.unitId) {
    unitId = state.combat.active.unitId;
    variant = 'combat-overlay-active';
  } else if (state.combat.target?.player === playerKey && state.combat.target.unitId) {
    unitId = state.combat.target.unitId;
    variant = 'combat-overlay-target';
  }
  if (!unitId) return '';

  const units = getCombatDisplayUnits(army, attachments, unitId);
  if (!units.length) return '';

  const selectedWeapon = state.battleMap?.selectedWeapon || null;
  // Only the controlling unit can pick a weapon for range rings — never the target (map clutter)
  const showWeaponPick = variant === 'combat-overlay-active';
  const blocks = units
    .map((unit) => {
      const woundsTaken = getUnitWoundsTaken(state, playerKey, unit.id);
      const remaining = getRemainingModels(unit, woundsTaken);
      const woundCap = getUnitWoundCapacity(unit);
      const abilities = getUnitDisplayAbilities(unit)
        .map(
          (a) => `
        <div class="combat-ability-item"><strong>${esc(a.name)}</strong><p>${esc(a.description)}</p></div>`,
        )
        .join('');
      const { ranged, melee } = renderSimWeaponBlocks(unit, playerKey, selectedWeapon, showWeaponPick);
      const roleTag = unit.isLeader ? 'Leader' : unitIsSupport(unit) ? 'Support' : '';
      return `
      <div class="combat-unit-block">
        <div class="combat-unit-header">
          <h3>${esc(unit.name)}${roleTag ? ` <span class="combat-role-tag">${roleTag}</span>` : ''}</h3>
          <p class="combat-unit-meta">${remaining} models · ${woundsTaken}/${woundCap} wounds · ${unit.points} pts</p>
          ${unit.statsLine ? `<p class="combat-unit-stats">${esc(unit.statsLine)}</p>` : ''}
        </div>
        <div class="combat-wounds-row">
          <span class="combat-wounds-label">Wounds</span>
          <div class="combat-wounds-controls">
            <button type="button" data-action="adjust-unit-wounds" data-player="${playerKey}" data-unit-id="${esc(unit.id)}" data-delta="-1">−</button>
            <span class="combat-wounds-value">${woundsTaken}</span>
            <button type="button" data-action="adjust-unit-wounds" data-player="${playerKey}" data-unit-id="${esc(unit.id)}" data-delta="1">+</button>
          </div>
          <span class="combat-wounds-cap">/ ${woundCap}</span>
          ${renderSimShockBtn(state, playerKey, unit.id)}
        </div>
        ${ranged || ''}
        ${melee || ''}
        ${abilities ? `<details class="combat-collapsed"><summary>Abilities</summary>${abilities}</details>` : ''}
      </div>`;
    })
    .join('');

  const closeAction = variant === 'combat-overlay-active' ? 'combat-select-active' : 'combat-select-target';
  return `
    <div class="combat-overlay ${variant}">
      <button type="button" class="combat-overlay-close" data-action="${closeAction}" data-unit-id="${esc(unitId)}" aria-label="Close">×</button>
      <div class="combat-overlay-body">${blocks}</div>
    </div>`;
}

function parseMoveInches(statsLine, stats) {
  if (stats?.M) {
    const n = parseFloat(String(stats.M).replace(/[^0-9.]/g, ''));
    if (!Number.isNaN(n)) return n;
  }
  const m = String(statsLine || '').match(/M\s*([0-9]+(?:\.[0-9]+)?)/i);
  return m ? parseFloat(m[1]) : 6;
}

function parseWeaponRange(rangeStr) {
  const m = String(rangeStr || '').match(/([0-9]+)/);
  return m ? parseFloat(m[1]) : 0;
}

function getSelectedRadii(state) {
  const step = getCurrentStep(state);
  const bm = state.battleMap;
  if (!bm) return [];

  const phase = step?.phase || '';
  const stepId = String(step?.id || '');
  const isShootStep = phase === 'shooting' || stepId.includes('-shoot');
  const isShootAction = isCombatActionStep(step) && isShootStep;
  const isFightAction = isCombatActionStep(step) && stepId.endsWith('-fight');
  const stepPlayerKey = step?.player === 'p1' ? 'player1' : step?.player === 'p2' ? 'player2' : null;

  // Shoot/Fight: keep radii on the controlling (active) unit while clicking targets.
  // Move / charge / pile-in / consolidate: follow map selection (enemy radii OK).
  let entry = null;
  let model = null;
  let groupUnitId = null;

  if ((isShootAction || isFightAction) && state.combat?.active) {
    const active = state.combat.active;
    const key = mapUnitKey(active.player, active.unitId);
    entry = bm.unitsOnMap?.[key] || null;
    if (!entry?.models?.length) return [];
    model =
      entry.models.find((m) => m.id === bm.selectedModelId) ||
      entry.models.find((m) => String(m.id).startsWith(`${active.unitId}-`)) ||
      entry.models[0];
    groupUnitId = active.unitId;
  } else {
    if (!bm.selectedUnitKey || !bm.selectedModelId) return [];
    entry = bm.unitsOnMap?.[bm.selectedUnitKey];
    model = entry?.models?.find((m) => m.id === bm.selectedModelId);
    if (!model || !entry) return [];
    groupUnitId = entry.unitId;
  }

  const army = state[entry.player]?.army;
  const attachments = state.leaderAttachments?.[entry.player] || {};
  const groupUnits = getCombatDisplayUnits(army, attachments, groupUnitId);
  const groupIds = new Set(groupUnits.map((u) => u.id));
  const sw = bm.selectedWeapon;

  const radii = [];
  const baseR = Number(model.radiusIn) || 0;
  if (phase === 'movement' || stepId.includes('-mov')) {
    const moveUnit = findUnitInArmy(army, groupUnitId);
    radii.push({
      kind: 'move',
      x: model.x,
      y: model.y,
      // Measure from base edge, not center
      radius: parseMoveInches(moveUnit?.statsLine, moveUnit?.stats) + baseR,
    });
  }

  // No enemy ranged rings during controlling player's shoot or fight actions
  const isEnemyOfActive = stepPlayerKey && entry.player !== stepPlayerKey;
  if (isEnemyOfActive && (isShootStep || isFightAction)) return radii;

  const pushWeapon = (unit, weapon, origin) => {
    const r = parseWeaponRange(weapon?.range);
    const originBase = Number(origin?.radiusIn) || 0;
    if (r > 0) {
      radii.push({
        kind: 'shoot',
        x: origin.x,
        y: origin.y,
        // Measure from base edge, not center
        radius: r + originBase,
        label: weapon.name,
      });
    }
  };

  const swInGroup = sw && Number.isInteger(sw.weaponIndex) && groupIds.has(sw.unitId);

  if (swInGroup) {
    const unit = findUnitInArmy(army, sw.unitId);
    const w = unit?.rangedWeapons?.[sw.weaponIndex];
    const origin = entry.models.find((m) => String(m.id).startsWith(`${sw.unitId}-`)) || model;
    if (w) pushWeapon(unit, w, origin);
  } else if (isShootAction || (isShootStep && !isFightAction)) {
    // Controlling unit keeps full range rings open while checking targets
    for (const unit of groupUnits) {
      const origin = entry.models.find((m) => String(m.id).startsWith(`${unit.id}-`)) || model;
      for (const w of unit.rangedWeapons || []) pushWeapon(unit, w, origin);
    }
  }
  return radii;
}

function renderReminderBar(state) {
  if (!state.started) {
    return `<div class="sim-reminder-bar sim-reminder-under-toolbar"><span class="sim-reminder-label">Reminder!</span><span class="sim-reminder-empty">Start the battle guide to see phase reminders</span></div>`;
  }
  const step = getCurrentStep(state);
  const abilities = getAllAbilitiesForStep(state, step);
  if (!abilities.length) {
    return `<div class="sim-reminder-bar sim-reminder-under-toolbar"><span class="sim-reminder-label">Reminder!</span><span class="sim-reminder-empty">No phase reminders</span></div>`;
  }

  const chips = abilities
    .map(
      (a) => `
      <button type="button" class="sim-reminder-chip ${a.player === 'p1' ? 'p1' : 'p2'}" data-action="show-reminder" data-rule-name="${esc(a.ruleName)}" data-rule-desc="${esc(a.description)}" data-unit-name="${esc(a.unitName)}">
        <span class="sim-reminder-unit">${esc(a.unitName)}</span>
        <span class="sim-reminder-rule">${esc(a.ruleName)}</span>
      </button>`,
    )
    .join('');

  return `
    <div class="sim-reminder-bar sim-reminder-under-toolbar">
      <span class="sim-reminder-label">Reminder!</span>
      <div class="sim-reminder-chips">${chips}</div>
    </div>`;
}

function renderLayoutImportDialog(state) {
  const dlg = state.layoutImport;
  if (!dlg?.open) return '';
  const customs = loadCustomLayouts();
  const session = getImportSession();
  const riOptions = (dlg.riList || session?.list || [])
    .map(
      (l) =>
        `<option value="${esc(l.id)}" ${l.id === (dlg.selectedRiId || '') ? 'selected' : ''}>${esc(l.label || l.id)}</option>`,
    )
    .join('');
  const customRows = customs.length
    ? customs
        .map(
          (l) => `
        <li class="layout-import-custom-row">
          <span>${esc(l.name)}${l.rapidIngressId ? ` <span class="layout-import-meta">(${esc(l.rapidIngressId)})</span>` : ''}</span>
          <button type="button" data-action="delete-custom-layout" data-layout-id="${esc(l.id)}">Remove</button>
        </li>`,
        )
        .join('')
    : '<li class="layout-import-empty">No imported layouts yet</li>';

  return `
    <div class="layout-import-backdrop" data-action="close-layout-import">
      <div class="layout-import-dialog" role="dialog" aria-labelledby="layout-import-title">
        <button type="button" class="keyword-rule-popover-close" data-action="close-layout-import" aria-label="Close">×</button>
        <h4 id="layout-import-title">Import Rapid Ingress layout</h4>
        <p class="layout-import-help">
          In the browser, use <strong>Save as → Webpage, Complete</strong> on the Rapid Ingress
          layout page. Then multi-select both files here:
          the saved <code>.html</code> and
          <code>terrain-data-11e.js.download</code> from the accompanying <code>_files</code> folder.
          Give it a display name and it stays in your local library.
        </p>
        <label class="layout-import-field">
          <span>Upload files</span>
          <input type="file" data-action="layout-import-files" multiple accept=".html,.htm,.js,.download,text/html,text/javascript,application/javascript" />
        </label>
        <label class="layout-import-field">
          <span>Rapid Ingress layout</span>
          <select data-layout-import-ri ${riOptions ? '' : 'disabled'}>
            ${riOptions || '<option value="">— load files first —</option>'}
          </select>
        </label>
        <label class="layout-import-field">
          <span>Display name</span>
          <input type="text" data-layout-import-name value="${esc(dlg.title || '')}" placeholder="e.g. Unstoppable Force" />
        </label>
        ${dlg.error ? `<p class="layout-import-error">${esc(dlg.error)}</p>` : ''}
        ${dlg.status ? `<p class="layout-import-status">${esc(dlg.status)}</p>` : ''}
        <div class="layout-import-actions">
          <button type="button" class="layout-import-primary" data-action="commit-layout-import" ${riOptions ? '' : 'disabled'}>Import &amp; use</button>
          <button type="button" data-action="close-layout-import">Cancel</button>
        </div>
        <div class="layout-import-customs">
          <h5>Imported layouts</h5>
          <ul>${customRows}</ul>
        </div>
      </div>
    </div>`;
}

function renderReminderPopup(state) {
  const pop = state.battleMap?.reminderPopup;
  if (!pop) return '';
  return `
    <div class="keyword-rule-popover-backdrop" data-action="close-reminder">
      <div class="keyword-rule-popover" role="dialog">
        <button type="button" class="keyword-rule-popover-close" data-action="close-reminder" aria-label="Close">×</button>
        <h4>${esc(pop.unitName)} — ${esc(pop.name)}</h4>
        <p>${esc(pop.description)}</p>
      </div>
    </div>`;
}

function renderBattleSim(root, state, dispatch) {
  const radii = getSelectedRadii(state);
  // Keep a live state pointer so pointer handlers don't use a stale closure after re-renders
  mapInteractionRuntime.state = state;
  mapInteractionRuntime.dispatch = dispatch;

  root.innerHTML = `
    <div class="guide-app battle-sim-app">
      ${renderSimScoreboard(state)}
      <main class="battle-sim-main">
        ${renderSimArmyList(state, 'player1')}
        <div class="battle-sim-center">
          ${renderMapSvg(state, {
            layouts: getAllLayouts(),
            radii,
            reminderHtml: renderReminderBar(state),
            modelHighlights: collectModelHighlights(state),
          })}
        </div>
        ${renderSimArmyList(state, 'player2')}
      </main>
      <footer class="guide-footer">
        <div class="guide-footer-bar">
          Warhammer 40,000 Battle Companion · Battle Sim
          <button type="button" class="btn-link" data-action="set-view-mode" data-mode="companion">Companion</button>
          <button type="button" class="btn-link" data-action="save-game">Save</button>
          <button type="button" class="btn-link" data-action="reset-game">Reset</button>
        </div>
      </footer>
      ${renderReminderPopup(state)}
      ${renderKeywordRulePopover(state)}
      ${renderLayoutImportDialog(state)}
    </div>`;

  bindBattleSimEvents(root, state, dispatch);
}

function bindBattleSimEvents(root, state, dispatch) {
  root.querySelectorAll('[data-action="set-view-mode"]').forEach((btn) => {
    btn.addEventListener('click', () => dispatch({ type: 'SET_VIEW_MODE', mode: btn.dataset.mode }));
  });
  root.querySelector('[data-action="next-step"]')?.addEventListener('click', () => dispatch({ type: 'NEXT_STEP' }));
  root.querySelector('[data-action="prev-step"]')?.addEventListener('click', () => dispatch({ type: 'PREV_STEP' }));
  root.querySelector('[data-action="save-game"]')?.addEventListener('click', () => dispatch({ type: 'SAVE' }));
  root.querySelector('[data-action="reset-game"]')?.addEventListener('click', () => {
    if (confirm('Reset the battle guide? Armies and scores will be cleared.')) dispatch({ type: 'RESET_GAME' });
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

  root.querySelectorAll('[data-action="toggle-battle-ready"]').forEach((btn) => {
    btn.addEventListener('click', () => dispatch({ type: 'TOGGLE_BATTLE_READY', player: btn.dataset.player }));
  });

  root.querySelectorAll('[data-action="map-deploy-unit"]').forEach((btn) => {
    btn.addEventListener('click', () =>
      dispatch({ type: 'MAP_DEPLOY_UNIT', player: btn.dataset.player, unitId: btn.dataset.unitId }),
    );
  });
  root.querySelectorAll('[data-action="map-withdraw-unit"]').forEach((btn) => {
    btn.addEventListener('click', () =>
      dispatch({ type: 'MAP_WITHDRAW_UNIT', player: btn.dataset.player, unitId: btn.dataset.unitId }),
    );
  });
  root.querySelectorAll('[data-action="map-select-unit"]').forEach((btn) => {
    btn.addEventListener('click', () =>
      dispatch({ type: 'MAP_SELECT_UNIT', player: btn.dataset.player, unitId: btn.dataset.unitId }),
    );
  });

  root.querySelectorAll('[data-action="map-select-weapon"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dispatch({
        type: 'MAP_SELECT_WEAPON',
        unitId: btn.dataset.unitId,
        weaponIndex: Number(btn.dataset.weaponIndex),
      });
    });
  });

  root.querySelectorAll('[data-action="show-keyword-rule"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dispatch({
        type: 'SHOW_KEYWORD_RULE',
        player: btn.dataset.player,
        unitId: btn.dataset.unitId,
        ruleName: btn.dataset.ruleName,
      });
    });
  });
  root.querySelector('.keyword-rule-popover-backdrop')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('keyword-rule-popover-backdrop')) {
      dispatch({ type: 'CLOSE_KEYWORD_RULE' });
    }
  });
  root.querySelector('.keyword-rule-popover')?.addEventListener('click', (e) => e.stopPropagation());
  root.querySelector('.keyword-rule-popover-close')?.addEventListener('click', () =>
    dispatch({ type: 'CLOSE_KEYWORD_RULE' }),
  );

  root.querySelectorAll('[data-action="combat-select-active"]').forEach((btn) => {
    btn.addEventListener('click', () =>
      dispatch({ type: 'COMBAT_SELECT_ACTIVE', unitId: btn.dataset.unitId }),
    );
  });
  root.querySelectorAll('[data-action="combat-select-target"]').forEach((btn) => {
    btn.addEventListener('click', () =>
      dispatch({ type: 'COMBAT_SELECT_TARGET', unitId: btn.dataset.unitId }),
    );
  });

  root.querySelectorAll('[data-action="adjust-unit-wounds"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dispatch({
        type: 'ADJUST_UNIT_WOUNDS',
        player: btn.dataset.player,
        unitId: btn.dataset.unitId,
        delta: Number(btn.dataset.delta),
      });
    });
  });

  root.querySelectorAll('[data-action="toggle-battle-shock"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dispatch({
        type: 'TOGGLE_BATTLE_SHOCK',
        player: btn.dataset.player,
        groupId: btn.dataset.groupId,
      });
    });
  });

  root.querySelectorAll('[data-action="map-clear-selection"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dispatch({ type: 'MAP_CLEAR_SELECTION' });
    });
  });

  root.querySelector('[data-action="set-map-layout"]')?.addEventListener('change', (e) => {
    const layoutId = e.target.value;
    if (layoutId === '__add_new__') {
      e.target.value = state.battleMap?.layoutId || 'blank';
      dispatch({ type: 'OPEN_LAYOUT_IMPORT' });
      return;
    }
    dispatch({ type: 'SET_MAP_LAYOUT', layoutId });
  });

  root.querySelector('.layout-import-dialog')?.addEventListener('click', (e) => e.stopPropagation());
  root.querySelectorAll('[data-action="close-layout-import"]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.dataset.action === 'close-layout-import') {
        clearImportSession();
        dispatch({ type: 'CLOSE_LAYOUT_IMPORT' });
      }
    });
  });

  root.querySelector('[data-action="layout-import-files"]')?.addEventListener('change', async (e) => {
    const input = e.target;
    try {
      const files = await readFilesAsText(input.files);
      if (!files.length) return;
      const meta = beginImportSession(files);
      dispatch({
        type: 'LAYOUT_IMPORT_PARSED',
        riList: meta.list,
        selectedRiId: meta.suggestedId || meta.list[0]?.id || '',
        title: meta.suggestedName || state.layoutImport?.title || '',
        status: `Loaded ${meta.list.length} Rapid Ingress layouts from file.`,
        error: null,
      });
    } catch (err) {
      clearImportSession();
      dispatch({
        type: 'LAYOUT_IMPORT_PARSED',
        riList: [],
        selectedRiId: '',
        title: state.layoutImport?.title || '',
        status: null,
        error: err?.message || String(err),
      });
    }
  });

  root.querySelector('[data-action="commit-layout-import"]')?.addEventListener('click', () => {
    const riSel = root.querySelector('[data-layout-import-ri]');
    const nameInput = root.querySelector('[data-layout-import-name]');
    const riId = riSel?.value;
    const title = nameInput?.value || '';
    if (!riId) {
      dispatch({
        type: 'LAYOUT_IMPORT_PARSED',
        error: 'Select a Rapid Ingress layout ID first.',
        riList: state.layoutImport?.riList || [],
        selectedRiId: '',
        title,
        status: state.layoutImport?.status || null,
      });
      return;
    }
    try {
      const layout = commitImportSession(riId, title);
      dispatch({ type: 'CLOSE_LAYOUT_IMPORT' });
      dispatch({ type: 'SET_MAP_LAYOUT', layoutId: layout.id });
    } catch (err) {
      dispatch({
        type: 'LAYOUT_IMPORT_PARSED',
        error: err?.message || String(err),
        riList: state.layoutImport?.riList || [],
        selectedRiId: riId,
        title,
        status: state.layoutImport?.status || null,
      });
    }
  });

  root.querySelectorAll('[data-action="delete-custom-layout"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.layoutId;
      if (!id) return;
      if (!confirm('Remove this imported layout from your library?')) return;
      deleteCustomLayout(id);
      const nextLayoutId =
        state.battleMap?.layoutId === id ? 'blank' : state.battleMap?.layoutId || 'blank';
      dispatch({ type: 'CUSTOM_LAYOUT_DELETED', layoutId: id, nextLayoutId });
    });
  });

  root.querySelectorAll('[data-action="map-zoom"]').forEach((btn) => {
    btn.addEventListener('click', () => dispatch({ type: 'MAP_ZOOM', delta: Number(btn.dataset.delta) }));
  });
  root.querySelector('[data-action="map-reset-camera"]')?.addEventListener('click', () =>
    dispatch({ type: 'MAP_RESET_CAMERA' }),
  );
  root.querySelector('[data-action="add-special-marker"]')?.addEventListener('click', () => {
    const name = prompt('Special marker name', 'OOM target');
    if (name) dispatch({ type: 'MAP_ADD_SPECIAL_MARKER', name });
  });
  root.querySelector('[data-action="remove-special-marker"]')?.addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.specialId;
    if (id) dispatch({ type: 'MAP_REMOVE_SPECIAL_MARKER', id });
  });

  root.querySelectorAll('[data-action="show-reminder"]').forEach((btn) => {
    btn.addEventListener('click', () =>
      dispatch({
        type: 'SHOW_REMINDER',
        name: btn.dataset.ruleName,
        description: btn.dataset.ruleDesc,
        unitName: btn.dataset.unitName,
      }),
    );
  });
  root.querySelectorAll('[data-action="close-reminder"]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.dataset.action === 'close-reminder') dispatch({ type: 'CLOSE_REMINDER' });
    });
  });
  root.querySelector('.keyword-rule-popover')?.addEventListener('click', (e) => e.stopPropagation());

  ensureMapPointerHandlers();
  mapInteractionRuntime.root = root;
  mapInteractionRuntime.svg = root.querySelector('.battle-map-svg');
  mapInteractionRuntime.wrap = root.querySelector('.battle-map-canvas-wrap');
}

/** Persistent pointer runtime — survives re-renders without stacking listeners. */
const mapInteractionRuntime = {
  root: null,
  svg: null,
  wrap: null,
  state: null,
  dispatch: null,
  drag: null,
  bound: false,
};

function findByDataAttr(root, attr, value) {
  if (!root || value == null) return null;
  return [...root.querySelectorAll(`[${attr}]`)].find((el) => el.getAttribute(attr) === value) || null;
}

function ensureMapPointerHandlers() {
  if (mapInteractionRuntime.bound) return;
  mapInteractionRuntime.bound = true;

  window.addEventListener(
    'wheel',
    (e) => {
      const wrap = mapInteractionRuntime.wrap;
      if (!wrap || !wrap.contains(e.target)) return;
      e.preventDefault();
      mapInteractionRuntime.dispatch?.({ type: 'MAP_ZOOM', delta: e.deltaY < 0 ? 0.1 : -0.1 });
    },
    { passive: false },
  );

  window.addEventListener('contextmenu', (e) => {
    if (mapInteractionRuntime.wrap?.contains(e.target)) e.preventDefault();
  });

  window.addEventListener('pointerdown', (e) => {
    const svg = mapInteractionRuntime.svg;
    const state = mapInteractionRuntime.state;
    const dispatch = mapInteractionRuntime.dispatch;
    if (!svg || !state || !dispatch) return;
    if (!svg.contains(e.target)) return;

    const cam = state.battleMap?.camera || { x: 0, y: 0, zoom: 1 };
    const modelEl = e.target.closest('.map-model');
    const specialEl = e.target.closest('.map-special');
    const boardPt = clientToBoardInches(svg, e.clientX, e.clientY, cam);

    if (specialEl) {
      const id = specialEl.dataset.specialId;
      const marker = (state.battleMap?.specialMarkers || []).find((m) => m.id === id);
      if (!marker) return;
      e.preventDefault();
      mapInteractionRuntime.drag = {
        type: 'special',
        id,
        startBoard: boardPt,
        origin: { x: marker.x, y: marker.y },
        radiusIn: marker.radiusIn || 0.5,
        moved: false,
        pointerId: e.pointerId,
      };
      // Select without waiting — special select does not break drag if we don't re-read svg from stale node
      // Defer select to pointerup to avoid mid-drag re-render
      return;
    }

    if (modelEl) {
      const unitKey = modelEl.dataset.unitKey;
      const modelId = modelEl.dataset.modelId;
      const entry = state.battleMap?.unitsOnMap?.[unitKey];
      if (!entry) return;
      e.preventDefault();
      mapInteractionRuntime.drag = {
        type: e.button === 2 ? 'unit' : 'model',
        unitKey,
        modelId,
        player: entry.player,
        unitId: entry.unitId,
        startBoard: boardPt,
        modelsOrigin: entry.models.map((m) => ({ id: m.id, x: m.x, y: m.y })),
        moved: false,
        pointerId: e.pointerId,
      };
      return;
    }

    if (e.button === 0) {
      mapInteractionRuntime.drag = {
        type: 'pan',
        startClient: { x: e.clientX, y: e.clientY },
        originCam: { x: cam.x || 0, y: cam.y || 0 },
        moved: false,
        pointerId: e.pointerId,
      };
    }
  });

  window.addEventListener('pointermove', (e) => {
    const drag = mapInteractionRuntime.drag;
    const svg = mapInteractionRuntime.svg;
    const state = mapInteractionRuntime.state;
    if (!drag || !svg || !state) return;
    if (drag.pointerId != null && e.pointerId !== drag.pointerId) return;

    const cam = state.battleMap?.camera || { x: 0, y: 0, zoom: 1 };
    const ppi = getPixelsPerInch();

    if (drag.type === 'pan') {
      const rect = svg.getBoundingClientRect();
      if (!rect.width) return;
      const scale = svg.viewBox.baseVal.width / rect.width / ppi / (cam.zoom || 1);
      const dx = (e.clientX - drag.startClient.x) * scale;
      const dy = (e.clientY - drag.startClient.y) * scale;
      if (Math.abs(dx) + Math.abs(dy) > 0.05) drag.moved = true;
      const world = svg.querySelector('.battle-map-world');
      const pad = Number(svg.dataset.pad || 8);
      if (world) {
        world.setAttribute(
          'transform',
          `translate(${(pad + drag.originCam.x + dx) * ppi} ${(pad + drag.originCam.y + dy) * ppi}) scale(${cam.zoom || 1})`,
        );
      }
      drag.liveCam = { x: drag.originCam.x + dx, y: drag.originCam.y + dy, zoom: cam.zoom || 1 };
      return;
    }

    const boardPt = clientToBoardInches(svg, e.clientX, e.clientY, cam);
    const dx = boardPt.x - drag.startBoard.x;
    const dy = boardPt.y - drag.startBoard.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.05) drag.moved = true;

    if (drag.type === 'special') {
      const x = drag.origin.x + dx;
      const y = drag.origin.y + dy;
      const g = findByDataAttr(svg, 'data-special-id', drag.id);
      g?.querySelectorAll('circle').forEach((c) => {
        c.setAttribute('cx', String(x * ppi));
        c.setAttribute('cy', String(y * ppi));
      });
      const text = g?.querySelector('text');
      if (text) {
        text.setAttribute('x', String(x * ppi));
        text.setAttribute('y', String((y - (drag.radiusIn || 0.5)) * ppi - 4));
      }
      drag.live = { x, y };
      return;
    }

    if (drag.type === 'model' || drag.type === 'unit') {
      const moves = [];
      for (const m of drag.modelsOrigin) {
        if (drag.type === 'model' && m.id !== drag.modelId) continue;
        const nx = m.x + dx;
        const ny = m.y + dy;
        moves.push({ id: m.id, x: nx, y: ny });
        const g = findByDataAttr(svg, 'data-model-id', m.id);
        g?.querySelectorAll('circle').forEach((c) => {
          c.setAttribute('cx', String(nx * ppi));
          c.setAttribute('cy', String(ny * ppi));
        });
      }
      drag.liveMoves = moves;
    }
  });

  window.addEventListener('pointerup', (e) => {
    const drag = mapInteractionRuntime.drag;
    const dispatch = mapInteractionRuntime.dispatch;
    const state = mapInteractionRuntime.state;
    if (!drag || !dispatch || !state) return;
    if (drag.pointerId != null && e.pointerId !== drag.pointerId) return;

    if (drag.type === 'pan' && drag.liveCam && drag.moved) {
      dispatch({ type: 'MAP_SET_CAMERA', camera: drag.liveCam });
    } else if (drag.type === 'pan' && !drag.moved) {
      dispatch({ type: 'MAP_CLEAR_SELECTION' });
    } else if (drag.type === 'special') {
      if (drag.moved && drag.live) {
        dispatch({ type: 'MAP_MOVE_SPECIAL', id: drag.id, x: drag.live.x, y: drag.live.y });
      }
      // Select special marker (shows Remove button)
      dispatch({ type: 'MAP_SELECT_SPECIAL', id: drag.id });
    } else if (drag.type === 'model' || drag.type === 'unit') {
      if (drag.moved && drag.liveMoves?.length) {
        dispatch({ type: 'MAP_MOVE_MODELS', unitKey: drag.unitKey, moves: drag.liveMoves });
      }
      dispatch({
        type: 'MAP_SELECT_UNIT',
        player: drag.player,
        unitId: drag.unitId,
        modelId: drag.modelId,
      });
      // LoS is computed inside MAP_SELECT_UNIT when both combat sides are set during shooting
    }

    mapInteractionRuntime.drag = null;
  });

  window.addEventListener('pointercancel', () => {
    mapInteractionRuntime.drag = null;
  });
}

// Helpers re-exported for tests / external use

/* --- guideRender.js --- */
const SLOT_LABELS = {
  'setup-pre-battle': 'Pre-battle',
  'setup-deploy': 'Deploy',
  'setup-redeploy': 'Redeploy',
  'setup-formations': 'Formations',
  'cmd-start': 'Cmd start',
  'cmd-end': 'Cmd end',
  cmd: 'Command',
  shoot: 'Shoot',
  charge: 'Charge',
  fight: 'Fight',
  passive: 'Always on',
};

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function renderNewRecruitHint() {
  return `<p class="hint newrecruit-hint">Upload Army JSON from NewRecruit. If you haven't created your army or have exported in a different format, create your army and export as JSON <a class="external-link" href="https://www.newrecruit.eu" target="_blank" rel="noopener noreferrer">here</a>.</p>`;
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

function renderBattleReadyBtn(state, playerKey) {
  const active = !!state.battleReady?.[playerKey];
  return `<button type="button" class="battle-ready-btn ${active ? 'active' : ''}" data-action="toggle-battle-ready" data-player="${playerKey}">Battle Ready Army</button>`;
}

function renderScoreboard(state) {
  const p1 = state.player1;
  const p2 = state.player2;

  const renderFirstTurnBadge = (key) =>
    state.firstPlayer === key ? '<span class="first-turn-badge">Goes first</span>' : '';

  const renderPlayerLeft = (p, key) => `
    <div class="score-player score-left">
      <div class="score-player-name">${esc(p.army?.name || p.name)}${renderFirstTurnBadge(key)}</div>
      <div class="score-row">
        ${renderScoreCell(p, 'cp', 'CP', p.score.cp, key)}
        ${renderScoreCell(p, 'secondary', 'Sec', p.score.secondary, key)}
        ${renderScoreCell(p, 'primary', 'Prim', p.score.primary, key)}
        <div class="score-cell score-total-cell">
          <span class="score-label">Total</span>
          <span class="score-total">${totalScore(p.score)}</span>
        </div>
        ${renderBattleReadyBtn(state, key)}
      </div>
    </div>`;

  const renderPlayerRight = (p, key) => `
    <div class="score-player score-right">
      <div class="score-player-name">${renderFirstTurnBadge(key)}${esc(p.army?.name || p.name)}</div>
      <div class="score-row score-row-mirror">
        ${renderBattleReadyBtn(state, key)}
        <div class="score-cell score-total-cell">
          <span class="score-label">Total</span>
          <span class="score-total">${totalScore(p.score)}</span>
        </div>
        ${renderScoreCell(p, 'primary', 'Prim', p.score.primary, key)}
        ${renderScoreCell(p, 'secondary', 'Sec', p.score.secondary, key)}
        ${renderScoreCell(p, 'cp', 'CP', p.score.cp, key)}
      </div>
    </div>`;

  return `
    <header class="scoreboard">
      ${renderPlayerLeft(p1, 'player1')}
      <div class="score-center">
        <div class="score-vs">VS</div>
        <div class="turn-display">${esc(getCurrentStep(state)?.turnLabel || 'Load armies to begin')}</div>
        <div class="view-mode-bar">
          <button type="button" class="view-mode-btn active" data-action="set-view-mode" data-mode="companion">Companion</button>
          <button type="button" class="view-mode-btn" data-action="set-view-mode" data-mode="battleSim">Battle Map</button>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${getProgress(state)}%"></div></div>
      </div>
      ${renderPlayerRight(p2, 'player2')}
    </header>`;
}

function renderUnitDetailModal(state) {
  const detail = state.unitDetail;
  if (!detail) return '';

  const player = state[detail.player];
  const unit = findUnitInArmy(player?.army, detail.unitId);
  if (!unit) return '';

  const woundsTaken = getUnitWoundsTaken(state, detail.player, unit.id);
  const remainingModels = getRemainingModels(unit, woundsTaken);
  const woundCap = getUnitWoundCapacity(unit);
  const keywordRuleIndex = getUnitKeywordRules(unit);
  const kwContext = { player: detail.player, unitId: unit.id };
  const displayKeywords = getUnitDisplayKeywords(unit);

  const abilityItems = getUnitDisplayAbilities(unit)
    .map(
      (a) => `
      <div class="unit-detail-ability">
        <strong>${esc(a.name)}</strong>
        <p>${esc(a.description)}</p>
      </div>`,
    )
    .join('');

  const rangedBlock = unit.rangedWeapons?.length
    ? `<details class="weapon-dropdown" open>
        <summary>Ranged Weapons (${unit.rangedWeapons.length})</summary>
        ${renderWeaponTable(unit.rangedWeapons, 'ranged', keywordRuleIndex, kwContext)}
      </details>`
    : '';

  const meleeBlock = unit.meleeWeapons?.length
    ? `<details class="weapon-dropdown" open>
        <summary>Melee Weapons (${unit.meleeWeapons.length})</summary>
        ${renderWeaponTable(unit.meleeWeapons, 'melee', keywordRuleIndex, kwContext)}
      </details>`
    : '';

  return `
    <div class="unit-modal-backdrop" data-action="close-unit-detail">
      <div class="unit-modal" role="dialog" aria-modal="true" aria-labelledby="unit-modal-title">
        <div class="unit-modal-header">
          <div>
            <h2 id="unit-modal-title">${esc(unit.name)}</h2>
            <p class="unit-modal-meta">${remainingModels} model${remainingModels !== 1 ? 's' : ''} · ${unit.points} pts${unit.isWarlord ? ' · Warlord' : ''} · ${woundsTaken}/${woundCap} wounds</p>
            ${unit.statsLine ? `<p class="unit-modal-stats">${esc(unit.statsLine)}</p>` : ''}
          </div>
          <button type="button" class="unit-modal-close" data-action="close-unit-detail" aria-label="Close">×</button>
        </div>
        <div class="unit-modal-body">
          ${displayKeywords.length ? `<div class="unit-detail-section"><h4>Keywords</h4><p class="unit-detail-kw">${renderKeywordList(displayKeywords, keywordRuleIndex, kwContext)}</p></div>` : ''}
          ${abilityItems ? `<div class="unit-detail-section"><h4>Abilities</h4>${abilityItems}</div>` : ''}
          ${rangedBlock || meleeBlock ? `<div class="unit-detail-section"><h4>Weapons</h4>${rangedBlock}${meleeBlock}</div>` : ''}
        </div>
      </div>
    </div>`;
}

function renderCombatCondensedUnit(unit, state, playerKey) {
  const woundsTaken = getUnitWoundsTaken(state, playerKey, unit.id);
  const remainingModels = getRemainingModels(unit, woundsTaken);
  const woundCap = getUnitWoundCapacity(unit);
  const keywordRuleIndex = getUnitKeywordRules(unit);
  const kwContext = { player: playerKey, unitId: unit.id };
  const displayKeywords = getUnitDisplayKeywords(unit);
  const woundControls = `
    <div class="combat-wounds-row">
      <span class="combat-wounds-label">Wounds</span>
      <div class="combat-wounds-controls">
        <button type="button" data-action="adjust-unit-wounds" data-player="${playerKey}" data-unit-id="${esc(unit.id)}" data-delta="-1">−</button>
        <span class="combat-wounds-value">${woundsTaken}</span>
        <button type="button" data-action="adjust-unit-wounds" data-player="${playerKey}" data-unit-id="${esc(unit.id)}" data-delta="1">+</button>
      </div>
      <span class="combat-wounds-cap">/ ${woundCap}</span>
    </div>`;

  const abilityItems = getUnitDisplayAbilities(unit)
    .map(
      (a) => `
      <div class="combat-ability-item">
        <strong>${esc(a.name)}</strong>
        <p>${esc(a.description)}</p>
      </div>`,
    )
    .join('');

  const kwBlock = displayKeywords.length
    ? `<details class="combat-collapsed">
        <summary>Keywords (${displayKeywords.length})</summary>
        <p class="combat-kw">${renderKeywordList(displayKeywords, keywordRuleIndex, kwContext)}</p>
      </details>`
    : '';

  const abilityBlock = abilityItems
    ? `<details class="combat-collapsed">
        <summary>Abilities</summary>
        ${abilityItems}
      </details>`
    : '';

  const rangedBlock = unit.rangedWeapons?.length
    ? `<div class="combat-weapons-block">
        <h5>Ranged</h5>
        ${renderWeaponTable(unit.rangedWeapons, 'ranged', keywordRuleIndex, kwContext)}
      </div>`
    : '';

  const meleeBlock = unit.meleeWeapons?.length
    ? `<div class="combat-weapons-block">
        <h5>Melee</h5>
        ${renderWeaponTable(unit.meleeWeapons, 'melee', keywordRuleIndex, kwContext)}
      </div>`
    : '';

  const roleTag = unit.isLeader ? 'Leader' : unitIsSupport(unit) ? 'Support' : '';

  return `
    <div class="combat-unit-block">
      <div class="combat-unit-header">
        <h3>${esc(unit.name)}${roleTag ? ` <span class="combat-role-tag">${roleTag}</span>` : ''}</h3>
        <p class="combat-unit-meta">${remainingModels} model${remainingModels !== 1 ? 's' : ''} · ${woundsTaken}/${woundCap} wounds · ${unit.points} pts</p>
        ${unit.statsLine ? `<p class="combat-unit-stats">${esc(unit.statsLine)}</p>` : ''}
      </div>
      ${woundControls}
      ${kwBlock}
      ${abilityBlock}
      ${rangedBlock}
      ${meleeBlock}
    </div>`;
}

function renderCombatOverlay(state, playerKey) {
  const combat = state.combat;
  if (!combat) return '';

  const army = state[playerKey]?.army;
  if (!army) return '';

  const attachments = state.leaderAttachments?.[playerKey] || {};
  let unitId = null;
  let variant = '';

  if (combat.active?.player === playerKey && combat.active.unitId) {
    unitId = combat.active.unitId;
    variant = 'combat-overlay-active';
  } else if (combat.target?.player === playerKey && combat.target.unitId) {
    unitId = combat.target.unitId;
    variant = 'combat-overlay-target';
  }

  if (!unitId) return '';

  const units = getCombatDisplayUnits(army, attachments, unitId);
  if (!units.length) return '';

  const blocks = units.map((u) => renderCombatCondensedUnit(u, state, playerKey)).join('');
  const closeAction = variant === 'combat-overlay-active' ? 'combat-select-active' : 'combat-select-target';

  return `
    <div class="combat-overlay ${variant}">
      <button type="button" class="combat-overlay-close" data-action="${closeAction}" data-unit-id="${esc(unitId)}" aria-label="Close">×</button>
      <div class="combat-overlay-body">${blocks}</div>
    </div>`;
}

function renderCombatUI(state, step) {
  if (!isCombatActionStep(step)) return '';

  const playerKey = step.player === 'p1' ? 'player1' : 'player2';
  const enemyKey = playerKey === 'player1' ? 'player2' : 'player1';
  const army = state[playerKey]?.army;
  const enemyArmy = state[enemyKey]?.army;
  if (!army?.units?.length) return '';

  const phaseLabel = step.id.endsWith('-shoot') ? 'Shooting' : 'Fighting';
  const activeId = state.combat?.active?.unitId || null;
  const targetId = state.combat?.target?.unitId || null;

  const liveUnits = army.units.filter((u) => !isUnitDead(state, playerKey, u.id));
  if (!liveUnits.length) return '';

  const activeButtons = liveUnits
    .map((u) => {
      const selected = activeId === u.id;
      const remaining = getRemainingModels(u, getUnitWoundsTaken(state, playerKey, u.id));
      return `<button type="button" class="combat-btn combat-btn-active ${selected ? 'selected' : ''}" data-action="combat-select-active" data-unit-id="${esc(u.id)}">
        <span class="combat-btn-name">${esc(u.name)}</span>
        <span class="combat-btn-meta">${remaining} model${remaining !== 1 ? 's' : ''}</span>
      </button>`;
    })
    .join('');

  let targetSection = '';
  if (activeId && enemyArmy?.units?.length) {
    const enemyLive = enemyArmy.units.filter((u) => !isUnitDead(state, enemyKey, u.id));
    const targetButtons = enemyLive
      .map((u) => {
        const selected = targetId === u.id;
        const remaining = getRemainingModels(u, getUnitWoundsTaken(state, enemyKey, u.id));
        return `<button type="button" class="combat-btn combat-btn-target ${selected ? 'selected' : ''}" data-action="combat-select-target" data-unit-id="${esc(u.id)}">
          <span class="combat-btn-name">${esc(u.name)}</span>
          <span class="combat-btn-meta">${remaining} model${remaining !== 1 ? 's' : ''}</span>
        </button>`;
      })
      .join('');

    targetSection = `
      <div class="combat-ui-target">
        <h5 class="combat-target-label">TARGET:</h5>
        <div class="combat-ui-buttons">${targetButtons}</div>
      </div>`;
  }

  return `
    <div class="combat-ui">
      <h4>${phaseLabel} — select your unit</h4>
      <p class="combat-ui-hint">Select an active unit, then pick a target. Unit details appear over each army list.</p>
      <div class="combat-ui-buttons">${activeButtons}</div>
      ${targetSection}
    </div>`;
}

function renderLeaderAttach(u, key, armyUnits, state) {
  if (!unitCanLead(u)) return '';

  const attachedId = state.leaderAttachments?.[key]?.[u.id] || '';
  const label = unitIsSupport(u) ? 'Support:' : 'Leading:';
  const options = armyUnits
    .filter((other) => other.id !== u.id)
    .map(
      (other) =>
        `<option value="${esc(other.id)}" ${other.id === attachedId ? 'selected' : ''}>${esc(other.name)}</option>`,
    )
    .join('');

  return `<label class="leader-attach">
    <em class="leader-label">${label}</em>
    <select class="leader-select" data-action="set-leader-attach" data-player="${key}" data-leader-id="${esc(u.id)}">
      <option value="">—</option>
      ${options}
    </select>
  </label>`;
}

function renderBattleShockBtn(key, groupId, shocked, show) {
  if (!show) return '';
  return `<button type="button" class="unit-shock-btn ${shocked ? 'shocked' : ''}" data-action="toggle-battle-shock" data-player="${key}" data-group-id="${esc(groupId)}">BattleShocked</button>`;
}

function renderUnitWounds(u, key, state, armyUnits) {
  const woundsTaken = getUnitWoundsTaken(state, key, u.id);
  const capacity = getUnitWoundCapacity(u);
  const attachments = state.leaderAttachments?.[key] || {};
  const groupInfo = getUnitGroupInfo({ units: armyUnits }, attachments, u.id);

  const dead = isUnitDead(state, key, u.id);
  const shocked = isGroupBattleShocked(state, key, groupInfo.groupId);
  const shockBtn = renderBattleShockBtn(key, groupInfo.groupId, shocked, !dead);

  const controls = `
      <span class="unit-wounds-label">Wounds</span>
      <div class="unit-wounds-controls">
        <button type="button" data-action="adjust-unit-wounds" data-player="${key}" data-unit-id="${esc(u.id)}" data-delta="-1">−</button>
        <span class="unit-wounds-value">${woundsTaken}</span>
        <button type="button" data-action="adjust-unit-wounds" data-player="${key}" data-unit-id="${esc(u.id)}" data-delta="1">+</button>
      </div>
      <span class="unit-wounds-cap">/ ${capacity}</span>`;

  if (key === 'player2') {
    return `<div class="unit-wounds-row unit-wounds-row-mirror">${shockBtn}${controls}</div>`;
  }
  return `<div class="unit-wounds-row">${controls}${shockBtn}</div>`;
}

function renderUnitCard(u, key, unitAbilities, state, unitIndex, unitCount, armyUnits) {
  const dead = isUnitDead(state, key, u.id);
  const attachments = state.leaderAttachments?.[key] || {};
  const groupInfo = getUnitGroupInfo({ units: armyUnits }, attachments, u.id);
  const battleShocked = !dead && isGroupBattleShocked(state, key, groupInfo.groupId);
  const wrapClass = dead ? 'is-dead' : battleShocked ? 'is-battle-shocked' : '';
  const canUp = unitIndex > 0;
  const canDown = unitIndex < unitCount - 1;
  const woundsTaken = getUnitWoundsTaken(state, key, u.id);
  const remainingModels = getRemainingModels(u, woundsTaken);
  const leaderAttach = renderLeaderAttach(u, key, armyUnits, state);
  const displayKw = getUnitDisplayKeywords(u);

  const abilityHtml =
    !dead && unitAbilities.length
      ? `<div class="unit-abilities">${unitAbilities
          .map((a) => {
            const phase = a.slot ? `<span class="ability-phase-tag">${esc(SLOT_LABELS[a.slot] || a.slot)}</span>` : '';
            return `<div class="unit-ability" title="${esc(a.description)}"><strong>${esc(a.ruleName)}</strong>${phase}</div>`;
          })
          .join('')}</div>`
      : '';

  const mainBtn = `
      <div class="unit-card unit-card-shell">
        <div class="unit-card-header">
          <div class="unit-card-title-block">
            <span class="unit-card-name">${esc(u.name)}</span>
            ${leaderAttach}
          </div>
          <span class="unit-card-pts">${u.points} pts</span>
        </div>
        <button type="button" class="unit-card-body" data-action="open-unit-detail" data-player="${key}" data-unit-id="${esc(u.id)}">
          ${u.statsLine ? `<div class="unit-card-stats">${esc(u.statsLine)}</div>` : ''}
          <div class="unit-card-meta">${remainingModels} model${remainingModels !== 1 ? 's' : ''}${u.isWarlord ? ' · Warlord' : ''}</div>
          ${displayKw.length ? `<div class="unit-card-kw">${displayKw.slice(0, 6).map(esc).join(' · ')}</div>` : ''}
          ${abilityHtml}
        </button>
        ${renderUnitWounds(u, key, state, armyUnits)}
      </div>`;

  const reorderBtns = `
      <div class="unit-reorder-btns">
        <button type="button" class="unit-reorder-btn" data-action="reorder-unit" data-player="${key}" data-unit-id="${esc(u.id)}" data-direction="up" ${canUp ? '' : 'disabled'} aria-label="Move up">▲</button>
        <button type="button" class="unit-reorder-btn" data-action="reorder-unit" data-player="${key}" data-unit-id="${esc(u.id)}" data-direction="down" ${canDown ? '' : 'disabled'} aria-label="Move down">▼</button>
      </div>`;

  const deadBtn = `<button type="button" class="unit-flag-btn unit-dead-btn ${dead ? 'dead' : ''}" data-action="toggle-unit-dead" data-player="${key}" data-unit-id="${esc(u.id)}">Dead</button>`;

  if (key === 'player2') {
    return `<div class="unit-card-wrap ${wrapClass}">${deadBtn}${mainBtn}${reorderBtns}</div>`;
  }
  return `<div class="unit-card-wrap ${wrapClass}">${mainBtn}${reorderBtns}${deadBtn}</div>`;
}

function renderArmyRuleItem(a) {
  const sourceTag =
    a.source === 'detachment'
      ? '<span class="ability-phase-tag detachment-tag">Detachment</span>'
      : '<span class="ability-phase-tag army-tag">Army</span>';
  const slotTag = `<span class="ability-phase-tag">${esc(SLOT_LABELS[a.slot] || a.slot || 'Rule')}</span>`;

  return `
    <details class="army-rule-dropdown">
      <summary class="army-rule-summary">
        <span class="army-rule-summary-text">
          <strong>${esc(a.ruleName)}</strong>
          ${sourceTag}
          ${slotTag}
        </span>
      </summary>
      <div class="army-rule-body"><p>${esc(a.description)}</p></div>
    </details>`;
}

function renderDetachmentBlock(det) {
  const rules = det.rules || [];
  const rulesHtml = rules.length
    ? rules
        .map(
          (r) => `
        <div class="detachment-rule-item">
          <strong>${esc(r.name)}</strong>
          <p>${esc(r.description)}</p>
        </div>`,
        )
        .join('')
    : '<p class="army-rules-empty">No rules found for this detachment.</p>';

  return `
    <details class="army-rule-dropdown detachment-block">
      <summary class="army-rule-summary">
        <span class="army-rule-summary-text">
          <strong>${esc(det.name)}</strong>
          <span class="ability-phase-tag detachment-tag">Detachment</span>
        </span>
      </summary>
      <div class="army-rule-body">${rulesHtml}</div>
    </details>`;
}

function renderArmyRulesBlock(army, armyRuleAbilities) {
  const detachments = army.detachments?.length
    ? army.detachments
    : army.detachment || army.detachmentRules?.length
      ? [{ name: army.detachment || 'Detachment', rules: army.detachmentRules || [] }]
      : [];

  const armyOnly = armyRuleAbilities.filter((a) => a.source === 'army');
  const hasMeta = army.forceDisposition || detachments.length > 0;
  const hasArmyRules = armyOnly.length > 0;
  if (!hasMeta && !hasArmyRules) return '';

  const dispositionLine = army.forceDisposition
    ? `<p class="army-rules-meta"><span class="army-rules-meta-label">Force Disposition:</span> ${esc(army.forceDisposition)}</p>`
    : '';
  const detachmentBlocks = detachments.map((d) => renderDetachmentBlock(d)).join('');
  const armyRules = armyOnly.map((a) => renderArmyRuleItem(a)).join('');

  return `
    <div class="army-rules-block">
      <h4>Army &amp; Detachment Rules</h4>
      ${dispositionLine}
      ${detachmentBlocks ? `<div class="army-detachments-list">${detachmentBlocks}</div>` : ''}
      ${armyRules ? `<div class="army-rules-list">${armyRules}</div>` : ''}
    </div>`;
}

function renderArmyPanel(player, key, state) {
  const army = player.army;
  if (!army) {
    return `
      <div class="army-panel army-empty" data-player="${key}">
        <h3>${key === 'player1' ? 'Player 1' : 'Player 2'}</h3>
        <label class="file-btn">
          Load Army (.json)
          <input type="file" accept=".json,application/json" data-action="load-army" data-player="${key}" hidden />
        </label>
        ${renderNewRecruitHint()}
      </div>`;
  }

  const allAbilities = listAllAbilities(army);
  const abilitiesByUnit = new Map();
  for (const a of allAbilities) {
    const list = abilitiesByUnit.get(a.unitName) || [];
    list.push(a);
    abilitiesByUnit.set(a.unitName, list);
  }

  const armyRuleAbilities = allAbilities.filter((a) => a.source === 'army' || a.source === 'detachment');

  const units = army.units
    .map((u, i) => {
      const unitAbilities = abilitiesByUnit.get(u.name) || [];
      return renderUnitCard(u, key, unitAbilities, state, i, army.units.length, army.units);
    })
    .join('');

  return `
    <div class="army-panel" data-player="${key}">
      <div class="army-panel-header">
        <div>
          <h3>${esc(army.name)}</h3>
          <p class="army-meta">${esc(army.faction)} · ${army.points}/${army.pointsLimit} pts</p>
        </div>
        <button type="button" class="btn-small" data-action="clear-army" data-player="${key}">Clear</button>
      </div>
      <label class="file-btn btn-small">
        Replace
        <input type="file" accept=".json,application/json" data-action="load-army" data-player="${key}" hidden />
      </label>
      ${renderArmyRulesBlock(army, armyRuleAbilities)}
      <div class="unit-list">${units}</div>
      ${renderCombatOverlay(state, key)}
    </div>`;
}

function renderUnitPhaseChecklist(state, step) {
  if (!isUnitChecklistStep(step)) return '';

  const player = step.player === 'p1' ? state.player1 : state.player2;
  const army = player?.army;
  if (!army?.units?.length) return '';

  const phaseKey = getUnitPhaseKey(step);
  const usedSet = new Set(state.unitPhaseUsed?.[phaseKey] || []);
  const phaseNames = { movement: 'Movement', shooting: 'Shooting', charge: 'Charge', fight: 'Fight' };

  const playerKey = step.player === 'p1' ? 'player1' : 'player2';
  const liveUnits = army.units.filter((u) => !isUnitDead(state, playerKey, u.id));
  if (!liveUnits.length) return '';

  const buttons = liveUnits
    .map((u) => {
      const used = usedSet.has(u.id);
      const remaining = getRemainingModels(u, getUnitWoundsTaken(state, playerKey, u.id));
      return `<button type="button" class="unit-phase-btn ${used ? 'used' : ''}" data-action="toggle-unit-used" data-unit-id="${esc(u.id)}">
        <span class="unit-phase-btn-name">${esc(u.name)}</span>
        <span class="unit-phase-btn-meta">${remaining} model${remaining !== 1 ? 's' : ''}</span>
      </button>`;
    })
    .join('');

  return `
    <div class="unit-phase-checklist">
      <h4>${phaseNames[step.phase] || step.phase} — mark units as you go</h4>
      <p class="unit-phase-hint">Tap each unit when you've finished with it this phase. Optional — not required to advance.</p>
      <div class="unit-phase-buttons">${buttons}</div>
    </div>`;
}

function renderFullChecklist(state) {
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
    <details class="checklist-panel checklist-bottom">
      <summary>Full checklist (${state.flow.length} steps)</summary>
      <div class="checklist">${checklist}</div>
    </details>`;
}

function renderSummaryPlayerCol(slice, align) {
  if (!slice) {
    return `<td class="summary-col summary-${align}"><span class="summary-empty">—</span></td>`;
  }
  return `<td class="summary-col summary-${align}">
    <span class="summary-stat">SEC: <strong>${slice.secondary}</strong></span>
    <span class="summary-stat">PRIM: <strong>${slice.primary}</strong></span>
    <span class="summary-stat summary-total-stat">TOTAL: <strong>${slice.total}</strong></span>
  </td>`;
}

function renderBattleSummary(state) {
  const p1Name = esc(state.player1.army?.name || state.player1.name);
  const p2Name = esc(state.player2.army?.name || state.player2.name);
  const finalP1 = totalScore(state.player1.score);
  const finalP2 = totalScore(state.player2.score);
  const snapshots = state.roundSnapshots || {};

  const roundRows = [];
  for (let r = 1; r <= MAX_BATTLE_ROUNDS; r++) {
    const snap = snapshots[r];
    roundRows.push(`
      <tr class="summary-round-row">
        <th class="summary-round-label" colspan="3">Round ${r}</th>
      </tr>
      <tr class="summary-score-row">
        ${renderSummaryPlayerCol(snap?.player1, 'left')}
        <td class="summary-vs-col"></td>
        ${renderSummaryPlayerCol(snap?.player2, 'right')}
      </tr>`);
  }

  const battleReadyRow =
    state.battleReady?.player1 || state.battleReady?.player2
      ? `
      <tr class="summary-battle-ready-row">
        <td class="summary-col summary-left">${state.battleReady?.player1 ? '<em>Battle Ready?</em> <strong>+10 VP</strong>' : ''}</td>
        <td class="summary-vs-col"></td>
        <td class="summary-col summary-right">${state.battleReady?.player2 ? '<em>Battle Ready?</em> <strong>+10 VP</strong>' : ''}</td>
      </tr>`
      : '';

  return `
    <div class="guide-center guide-summary">
      <div class="step-nav step-nav-top">
        <button type="button" data-action="prev-step">← Previous</button>
        <span class="step-counter">Game Summary</span>
        <button type="button" class="btn-primary" data-action="next-step" disabled>Next Step →</button>
      </div>
      <div class="summary-panel">
        <h2 class="summary-title">Game Summary</h2>
        <div class="summary-army-names">
          <span class="summary-army-p1">${p1Name}</span>
          <span class="summary-final-score">${finalP1} <span class="summary-v">v</span> ${finalP2}</span>
          <span class="summary-army-p2">${p2Name}</span>
        </div>
        <div class="summary-final-breakdown">
          <div class="summary-breakdown-p1">
            <span>SEC: <strong>${state.player1.score.secondary}</strong></span>
            <span>PRIM: <strong>${state.player1.score.primary}</strong></span>
          </div>
          <div class="summary-breakdown-p2">
            <span>PRIM: <strong>${state.player2.score.primary}</strong></span>
            <span>SEC: <strong>${state.player2.score.secondary}</strong></span>
          </div>
        </div>
        <table class="summary-table">
          <thead>
            <tr>
              <th class="summary-col summary-left">${p1Name}</th>
              <th class="summary-vs-col"></th>
              <th class="summary-col summary-right">${p2Name}</th>
            </tr>
          </thead>
          <tbody>
            ${roundRows.join('')}
            ${battleReadyRow}
          </tbody>
        </table>
        <p class="summary-footnote">Round totals are snapshots taken when you complete each <strong>End of Battle Round</strong> step. VP changes during a round appear in that round’s row once the round ends.</p>
      </div>
    </div>`;
}

function renderFormationsDeepStrike(state) {
  const step = getCurrentStep(state);
  if (step?.id !== 'setup-formations') return '';

  function renderPlayerList(player, label) {
    const army = player?.army;
    if (!army?.units?.length) return '';

    const units = army.units.filter((u) => unitHasDeepStrike(u));
    if (!units.length) {
      return `
        <div class="formations-ds-player">
          <h5>${esc(label)}</h5>
          <p class="formations-ds-empty">No Deep Strike units</p>
        </div>`;
    }

    const items = units
      .map((u) => `<li class="formations-ds-unit">${esc(u.name)}</li>`)
      .join('');

    return `
      <div class="formations-ds-player">
        <h5>${esc(label)}</h5>
        <ul class="formations-ds-list">${items}</ul>
      </div>`;
  }

  const p1Block = renderPlayerList(state.player1, state.player1.army?.name || 'Player 1');
  const p2Block = renderPlayerList(state.player2, state.player2.army?.name || 'Player 2');

  return `
    <div class="formations-deep-strike">
      <h4>Deep Strike units</h4>
      <p class="formations-ds-hint">These units can be placed in Strategic Reserves during Declare Battle Formations.</p>
      <div class="formations-ds-players">${p1Block}${p2Block}</div>
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
        ${renderNewRecruitHint()}
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

  if (step.id === 'battle-summary') {
    return renderBattleSummary(state);
  }

  const phaseLabel = getPhaseGroupLabel(step);
  const firstTurnPicker =
    step.id === 'setup-first-turn'
      ? `
      <div class="first-turn-picker">
        <h4>Who takes the first turn each battle round?</h4>
        <p class="first-turn-hint">This sets turn order for all 5 battle rounds.</p>
        <div class="first-turn-options">
          <button type="button" class="first-turn-btn ${state.firstPlayer === 'player1' ? 'selected' : ''}" data-action="set-first-player" data-player="player1">
            <span class="first-turn-side">Left</span>
            <strong>${esc(state.player1.army?.name || state.player1.name)}</strong>
          </button>
          <button type="button" class="first-turn-btn ${state.firstPlayer === 'player2' ? 'selected' : ''}" data-action="set-first-player" data-player="player2">
            <span class="first-turn-side">Right</span>
            <strong>${esc(state.player2.army?.name || state.player2.name)}</strong>
          </button>
        </div>
      </div>`
      : '';

  const stepAbilities = getAllAbilitiesForStep(state, step);
  const abilities = stepAbilities
    .map(
      (a) => `
      <div class="ability-reminder ${a.player === 'p1' ? 'p1' : 'p2'}">
        <div class="ability-header">
          <span class="ability-player">${a.player === 'p1' ? 'P1' : 'P2'}</span>
          <strong>${esc(a.unitName)}</strong> — ${esc(a.ruleName)}
          ${a.source === 'army' || a.source === 'detachment' ? '<span class="ability-army-tag">Army rule</span>' : ''}
          ${a.timing === 'either' ? '<span class="ability-timing-tag">Either player</span>' : ''}
          ${a.timing === 'opponent' ? '<span class="ability-timing-tag opponent">Opponent\'s phase</span>' : ''}
        </div>
        <p>${esc(a.description)}</p>
      </div>`,
    )
    .join('');

  const unitChecklist = renderUnitPhaseChecklist(state, step);
  const combatUI = renderCombatUI(state, step);
  const formationsDeepStrike = renderFormationsDeepStrike(state);

  return `
    <div class="guide-center">
      <div class="step-nav step-nav-top">
        <button type="button" data-action="prev-step" ${state.stepIndex === 0 ? 'disabled' : ''}>← Previous</button>
        <span class="step-counter">Step ${state.stepIndex + 1} of ${state.flow.length}</span>
        <button type="button" class="btn-primary" data-action="next-step" ${state.stepIndex >= state.flow.length - 1 ? 'disabled' : ''}>Next Step →</button>
      </div>
      <div class="step-content">
        <div class="step-card">
          <div class="step-phase">${esc(phaseLabel)}</div>
          <h2 class="step-title">${esc(step.label)}</h2>
          <p class="step-detail">${esc(step.detail)}</p>
          <p class="step-ref">${esc(step.ruleRef || '')}</p>
          ${firstTurnPicker}
          ${abilities ? `<div class="ability-list"><h4>Abilities to use now (${stepAbilities.length})</h4>${abilities}</div>` : ''}
        </div>
        ${unitChecklist}
        ${formationsDeepStrike}
        ${combatUI}
      </div>
    </div>`;
}

function saveArmyPanelScroll(root) {
  const saved = {};
  if (!root) return saved;
  for (const el of root.querySelectorAll('.army-panel[data-player]')) {
    saved[el.dataset.player] = el.scrollTop;
  }
  return saved;
}

function restoreArmyPanelScroll(root, saved) {
  if (!root || !saved) return;
  requestAnimationFrame(() => {
    for (const el of root.querySelectorAll('.army-panel[data-player]')) {
      const top = saved[el.dataset.player];
      if (top != null) el.scrollTop = top;
    }
  });
}

function renderGuide(root, state, dispatch) {
  if (state.viewMode === 'battleSim') {
    renderBattleSim(root, state, dispatch);
    return;
  }

  const armyScroll = saveArmyPanelScroll(root);
  const step = getCurrentStep(state);
  const isSummary = step?.id === 'battle-summary';

  root.innerHTML = `
    <div class="guide-app">
      ${renderScoreboard(state)}
      <main class="guide-main${isSummary ? ' guide-main-summary' : ''}">
        ${renderArmyPanel(state.player1, 'player1', state)}
        ${renderGuideCenter(state)}
        ${renderArmyPanel(state.player2, 'player2', state)}
      </main>
      <footer class="guide-footer">
        ${state.started ? renderFullChecklist(state) : ''}
        <div class="guide-footer-bar">
          Warhammer 40,000 Battle Companion · Step ${state.stepIndex + 1}/${state.flow.length || '—'}
          <button type="button" class="btn-link" data-action="set-view-mode" data-mode="battleSim">Battle Map</button>
          <button type="button" class="btn-link" data-action="reset-game">Reset</button>
          <button type="button" class="btn-link" data-action="save-game">Save</button>
        </div>
      </footer>
      ${renderUnitDetailModal(state)}
      ${renderKeywordRulePopover(state)}
    </div>`;

  bindGuideEvents(root, dispatch);
  restoreArmyPanelScroll(root, armyScroll);
}

function bindGuideEvents(root, dispatch) {
  root.querySelector('[data-action="start-game"]')?.addEventListener('click', () => dispatch({ type: 'START_GAME' }));
  root.querySelector('[data-action="next-step"]')?.addEventListener('click', () => dispatch({ type: 'NEXT_STEP' }));
  root.querySelector('[data-action="prev-step"]')?.addEventListener('click', () => dispatch({ type: 'PREV_STEP' }));
  root.querySelector('[data-action="reset-game"]')?.addEventListener('click', () => {
    if (confirm('Reset the battle guide? Armies and scores will be cleared.')) dispatch({ type: 'RESET_GAME' });
  });
  root.querySelector('[data-action="save-game"]')?.addEventListener('click', () => dispatch({ type: 'SAVE' }));

  root.querySelectorAll('[data-action="set-view-mode"]').forEach((btn) => {
    btn.addEventListener('click', () => dispatch({ type: 'SET_VIEW_MODE', mode: btn.dataset.mode }));
  });

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

  root.querySelectorAll('[data-action="set-first-player"]').forEach((btn) => {
    btn.addEventListener('click', () => dispatch({ type: 'SET_FIRST_PLAYER', player: btn.dataset.player }));
  });

  root.querySelectorAll('[data-action="set-leader-attach"]').forEach((sel) => {
    sel.addEventListener('click', (e) => e.stopPropagation());
    sel.addEventListener('mousedown', (e) => e.stopPropagation());
    sel.addEventListener('change', (e) => {
      e.stopPropagation();
      dispatch({
        type: 'SET_LEADER_ATTACHMENT',
        player: sel.dataset.player,
        leaderId: sel.dataset.leaderId,
        attachedUnitId: sel.value || null,
      });
    });
  });

  root.querySelectorAll('[data-action="toggle-battle-shock"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dispatch({ type: 'TOGGLE_BATTLE_SHOCK', player: btn.dataset.player, groupId: btn.dataset.groupId });
    });
  });

  root.querySelectorAll('[data-action="adjust-unit-wounds"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dispatch({
        type: 'ADJUST_UNIT_WOUNDS',
        player: btn.dataset.player,
        unitId: btn.dataset.unitId,
        delta: Number(btn.dataset.delta),
      });
    });
  });

  root.querySelectorAll('[data-action="toggle-battle-ready"]').forEach((btn) => {
    btn.addEventListener('click', () => dispatch({ type: 'TOGGLE_BATTLE_READY', player: btn.dataset.player }));
  });

  root.querySelectorAll('[data-action="reorder-unit"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dispatch({
        type: 'REORDER_UNIT',
        player: btn.dataset.player,
        unitId: btn.dataset.unitId,
        direction: btn.dataset.direction,
      });
    });
  });

  root.querySelectorAll('[data-action="toggle-unit-dead"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dispatch({ type: 'TOGGLE_UNIT_DEAD', player: btn.dataset.player, unitId: btn.dataset.unitId });
    });
  });

  root.querySelectorAll('[data-action="toggle-unit-used"]').forEach((btn) => {
    btn.addEventListener('click', () => dispatch({ type: 'TOGGLE_UNIT_USED', unitId: btn.dataset.unitId }));
  });

  root.querySelectorAll('[data-action="combat-select-active"]').forEach((btn) => {
    btn.addEventListener('click', () => dispatch({ type: 'COMBAT_SELECT_ACTIVE', unitId: btn.dataset.unitId }));
  });

  root.querySelectorAll('[data-action="combat-select-target"]').forEach((btn) => {
    btn.addEventListener('click', () => dispatch({ type: 'COMBAT_SELECT_TARGET', unitId: btn.dataset.unitId }));
  });

  root.querySelectorAll('[data-action="open-unit-detail"]').forEach((btn) => {
    btn.addEventListener('click', () =>
      dispatch({ type: 'OPEN_UNIT_DETAIL', player: btn.dataset.player, unitId: btn.dataset.unitId }),
    );
  });

  root.querySelector('.unit-modal-backdrop')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('unit-modal-backdrop')) {
      dispatch({ type: 'CLOSE_UNIT_DETAIL' });
    }
  });
  root.querySelector('.unit-modal-close')?.addEventListener('click', () => dispatch({ type: 'CLOSE_UNIT_DETAIL' }));
  root.querySelector('.unit-modal')?.addEventListener('click', (e) => e.stopPropagation());

  root.querySelectorAll('[data-action="show-keyword-rule"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dispatch({
        type: 'SHOW_KEYWORD_RULE',
        player: btn.dataset.player,
        unitId: btn.dataset.unitId,
        ruleName: btn.dataset.ruleName,
      });
    });
  });

  root.querySelector('.keyword-rule-popover-backdrop')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('keyword-rule-popover-backdrop')) {
      dispatch({ type: 'CLOSE_KEYWORD_RULE' });
    }
  });
  root.querySelector('.keyword-rule-popover')?.addEventListener('click', (e) => e.stopPropagation());
  root.querySelector('.keyword-rule-popover-close')?.addEventListener('click', () =>
    dispatch({ type: 'CLOSE_KEYWORD_RULE' }),
  );

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
      '<h2 style="color:#fbbf24">Battle Companion failed to start</h2>' +
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