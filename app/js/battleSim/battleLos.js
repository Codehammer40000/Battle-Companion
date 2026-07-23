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

import { distance, pointInArea, pointInPolygon, pointInRect } from '../geometry.js';
import { getLayoutById } from './layouts.js';

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

export function modelTouchesArea(model, area) {
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

export function unitTouchesArea(models, area) {
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
export function buildMergedCentreAreaGroups(areas) {
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
export function firstObstructionAlongRay(from, to, layout, attackerModel) {
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
export function computeBattleLos(state, shooterKey, targetKey) {
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
export function computeLosFromCombat(state) {
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
