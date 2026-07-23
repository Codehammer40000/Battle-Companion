import { HIDDEN_DETECTION_RANGE } from './constants.js';
import {
  crossesRect,
  distanceBetweenModels,
  lineIntersectsSolidFeature,
  modelInTerrainArea,
  pointInRect,
} from './geometry.js';

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

export function hasLineOfSight(
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

export function unitIsVisibleToUnit(shooterUnit, targetUnit, terrainAreas, terrainFeatures, allUnits) {
  const aliveShooters = shooterUnit.models.filter((m) => m.woundsRemaining > 0);
  const aliveTargets = targetUnit.models.filter((m) => m.woundsRemaining > 0);
  return aliveShooters.some((s) =>
    aliveTargets.some((t) =>
      hasLineOfSight(s, t, shooterUnit, targetUnit, terrainAreas, terrainFeatures, allUnits),
    ),
  );
}

export function getLosPreview(
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
