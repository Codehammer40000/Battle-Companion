import {
  BATTLEFIELD_HEIGHT,
  BATTLEFIELD_WIDTH,
  COHERENCY_CLOSE,
  COHERENCY_MAX,
  ENGAGEMENT_RANGE,
} from './constants.js';

export function distance(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function distanceBetweenModels(a, b) {
  return Math.max(0, distance(a.position, b.position) - a.baseRadius - b.baseRadius);
}

export function isWithinEngagementRange(a, b) {
  return distanceBetweenModels(a, b) <= ENGAGEMENT_RANGE;
}

export function unitIsEngaged(unit, enemyUnits) {
  return enemyUnits.some((enemy) =>
    unit.models.some((m) => enemy.models.some((em) => isWithinEngagementRange(m, em))),
  );
}

export function unitIsUnengaged(unit, enemyUnits) {
  return !unitIsEngaged(unit, enemyUnits);
}

export function isInCoherency(models) {
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

export function pointInRect(point, rect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.w &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.h
  );
}

/** Ray-cast point-in-polygon. polygon = [{x,y}, ...] */
export function pointInPolygon(point, polygon) {
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

export function pointInArea(point, area) {
  if (!area) return false;
  if (area.polygon?.length >= 3) return pointInPolygon(point, area.polygon);
  if (area.bounds) return pointInRect(point, area.bounds);
  return false;
}

export function modelInTerrainArea(model, area) {
  return pointInArea(model.position, area);
}

export function crossesRect(p1, p2, rect) {
  const samples = 20;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
    if (pointInRect(p, rect)) return true;
  }
  return false;
}

export function crossesPolygon(p1, p2, polygon) {
  if (!polygon || polygon.length < 3) return false;
  const samples = 28;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
    if (pointInPolygon(p, polygon)) return true;
  }
  return false;
}

export function lineIntersectsSolidFeature(p1, p2, feature) {
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

export function unitAtHalfStrength(unit) {
  const alive = unit.models.filter((m) => m.woundsRemaining > 0).length;
  return alive <= Math.ceil(unit.startingModelCount / 2);
}

export function isWithinBounds(point, radius) {
  return (
    point.x - radius >= 0 &&
    point.x + radius <= BATTLEFIELD_WIDTH &&
    point.y - radius >= 0 &&
    point.y + radius <= BATTLEFIELD_HEIGHT
  );
}
