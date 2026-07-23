import type { Model, Point, TerrainArea, TerrainFeature, Unit } from '../types/game';
import {
  BATTLEFIELD_HEIGHT,
  BATTLEFIELD_WIDTH,
  COHERENCY_CLOSE,
  COHERENCY_MAX,
  ENGAGEMENT_RANGE,
} from '../types/game';

export function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function distanceBetweenModels(a: Model, b: Model): number {
  return Math.max(0, distance(a.position, b.position) - a.baseRadius - b.baseRadius);
}

export function isWithinEngagementRange(a: Model, b: Model): boolean {
  return distanceBetweenModels(a, b) <= ENGAGEMENT_RANGE;
}

export function unitIsEngaged(unit: Unit, enemyUnits: Unit[]): boolean {
  return enemyUnits.some((enemy) =>
    unit.models.some((m) => enemy.models.some((em) => isWithinEngagementRange(m, em))),
  );
}

export function unitIsUnengaged(unit: Unit, enemyUnits: Unit[]): boolean {
  return !unitIsEngaged(unit, enemyUnits);
}

export function isInCoherency(models: Model[]): boolean {
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

export function isWhollyWithin(
  point: Point,
  radius: number,
  bounds: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    point.x - radius >= bounds.x &&
    point.x + radius <= bounds.x + bounds.w &&
    point.y - radius >= bounds.y &&
    point.y + radius <= bounds.y + bounds.h
  );
}

export function isWithinBounds(point: Point, radius: number): boolean {
  return (
    point.x - radius >= 0 &&
    point.x + radius <= BATTLEFIELD_WIDTH &&
    point.y - radius >= 0 &&
    point.y + radius <= BATTLEFIELD_HEIGHT
  );
}

export function pointInRect(point: Point, rect: { x: number; y: number; w: number; h: number }): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}

export function modelInTerrainArea(model: Model, area: TerrainArea): boolean {
  return pointInRect(model.position, area.bounds);
}

export function getTerrainAreaAt(point: Point, areas: TerrainArea[]): TerrainArea | null {
  return areas.find((a) => pointInRect(point, a.bounds)) ?? null;
}

export function crossesRect(
  p1: Point,
  p2: Point,
  rect: { x: number; y: number; w: number; h: number },
): boolean {
  const samples = 20;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
    if (pointInRect(p, rect)) return true;
  }
  return false;
}

export function lineIntersectsSolidFeature(
  p1: Point,
  p2: Point,
  feature: TerrainFeature,
): boolean {
  if (!feature.solid || feature.category !== 'dense') return false;
  const gapTop = feature.bounds.y + 3;
  if (gapTop > feature.bounds.y + feature.bounds.h) return false;
  const groundGap = {
    x: feature.bounds.x,
    y: feature.bounds.y,
    w: feature.bounds.w,
    h: Math.min(3, feature.bounds.h),
  };
  return crossesRect(p1, p2, groundGap);
}

export function getUnitCenter(unit: Unit): Point {
  const x = unit.models.reduce((s, m) => s + m.position.x, 0) / unit.models.length;
  const y = unit.models.reduce((s, m) => s + m.position.y, 0) / unit.models.length;
  return { x, y };
}

export function unitAtHalfStrength(unit: Unit): boolean {
  const alive = unit.models.filter((m) => m.woundsRemaining > 0).length;
  return alive <= Math.ceil(unit.startingModelCount / 2);
}

export function clampMovePosition(
  from: Point,
  to: Point,
  maxDistance: number,
  radius: number,
): Point {
  const d = distance(from, to);
  if (d <= maxDistance) return to;
  const ratio = maxDistance / d;
  return {
    x: from.x + (to.x - from.x) * ratio,
    y: from.y + (to.y - from.y) * ratio,
  };
}
