import type { Model, Point, TerrainArea, TerrainFeature, Unit } from '../types/game';
import { HIDDEN_DETECTION_RANGE } from '../types/game';
import {
  crossesRect,
  distanceBetweenModels,
  lineIntersectsSolidFeature,
  modelInTerrainArea,
  pointInRect,
} from './geometry';

function isInfantryLike(model: Model): boolean {
  return model.keywords.some((k) => ['INFANTRY', 'BEASTS', 'SWARM'].includes(k));
}

function modelInDenseArea(model: Model, areas: TerrainArea[]): boolean {
  return areas.some((a) => a.category === 'dense' && modelInTerrainArea(model, a));
}

export function hasLineOfSight(
  observer: Model,
  target: Model,
  observerUnit: Unit,
  targetUnit: Unit,
  terrainAreas: TerrainArea[],
  terrainFeatures: TerrainFeature[],
  allUnits: Unit[],
): boolean {
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

  if (isHidden(target, targetUnit, terrainAreas) && !isInfantryLike(observer)) {
    return false;
  }

  if (isHidden(target, targetUnit, terrainAreas) && isInfantryLike(observer)) {
    const dist = distanceBetweenModels(observer, target);
    if (dist > HIDDEN_DETECTION_RANGE) return false;
  }

  for (const unit of allUnits) {
    if (unit.id === observerUnit.id || unit.id === targetUnit.id) continue;
    for (const m of unit.models) {
      if (m.woundsRemaining <= 0) continue;
      const d = distanceBetweenModels(observer, m);
      if (d < 0.01) continue;
      const blocks = lineBlockedByModel(p1, p2, m);
      if (blocks) return false;
    }
  }

  return true;
}

function lineBlockedByModel(p1: Point, p2: Point, blocker: Model): boolean {
  const d = distanceBetweenModels(
    { ...blocker, position: p1 },
    blocker,
  );
  void d;
  const mid = blocker.position;
  const distToLine =
    Math.abs((p2.y - p1.y) * mid.x - (p2.x - p1.x) * mid.y + p2.x * p1.y - p2.y * p1.x) /
    Math.sqrt((p2.y - p1.y) ** 2 + (p2.x - p1.x) ** 2);
  return distToLine < blocker.baseRadius;
}

function isHidden(model: Model, unit: Unit, areas: TerrainArea[]): boolean {
  if (!isInfantryLike(model)) return false;
  if (!modelInDenseArea(model, areas)) return false;
  if (unit.shotThisTurn) return false;
  return true;
}

export function unitIsVisibleToUnit(
  shooterUnit: Unit,
  targetUnit: Unit,
  terrainAreas: TerrainArea[],
  terrainFeatures: TerrainFeature[],
  allUnits: Unit[],
): boolean {
  const aliveShooters = shooterUnit.models.filter((m) => m.woundsRemaining > 0);
  const aliveTargets = targetUnit.models.filter((m) => m.woundsRemaining > 0);
  return aliveShooters.some((s) =>
    aliveTargets.some((t) =>
      hasLineOfSight(s, t, shooterUnit, targetUnit, terrainAreas, terrainFeatures, allUnits),
    ),
  );
}

export function modelHasBenefitOfCover(
  target: Model,
  attacker: Model,
  terrainAreas: TerrainArea[],
  terrainFeatures: TerrainFeature[],
): boolean {
  if (isInfantryLike(target) && terrainAreas.some((a) => modelInTerrainArea(target, a))) {
    return true;
  }
  if (!isFullyVisible(attacker, target, terrainAreas, terrainFeatures)) {
    return true;
  }
  return false;
}

function isFullyVisible(
  observer: Model,
  target: Model,
  terrainAreas: TerrainArea[],
  terrainFeatures: TerrainFeature[],
): boolean {
  const p1 = observer.position;
  const p2 = target.position;
  for (const feature of terrainFeatures) {
    if (lineIntersectsSolidFeature(p1, p2, feature)) return false;
  }
  for (const area of terrainAreas) {
    if (!area.isObscuring) continue;
    if (crossesRect(p1, p2, area.bounds)) return false;
  }
  return true;
}

export function getLosPreview(
  observer: Model,
  target: Model,
  observerUnit: Unit,
  targetUnit: Unit,
  terrainAreas: TerrainArea[],
  terrainFeatures: TerrainFeature[],
  allUnits: Unit[],
): { from: Point; to: Point; visible: boolean } {
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
