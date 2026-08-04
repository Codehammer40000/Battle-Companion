/**
 * Terrain layouts for Battle Sim.
 */

import { SEARCH_AND_DESTROY_LAYOUT } from './layoutData/searchAndDestroy.js';
import { MEATGRINDER_1_LAYOUT } from './layoutData/meatgrinder1.js';
import { UNSTOPPABLE_FORCE_LAYOUT } from './layoutData/unstoppableForce.js';
import { PURGE_VS_TAKE_AND_HOLD_C_LAYOUT } from './layoutData/purgeVsTakeAndHoldC.js';
import { PRIORITY_ASSETS_VS_PRIORITY_ASSETS_B_LAYOUT } from './layoutData/priorityAssetsVsPriorityAssetsB.js';
import { PRIORITY_ASSETS_VS_TAKE_AND_HOLD_B_LAYOUT } from './layoutData/priorityAssetsVsTakeAndHoldB.js';
import { PRIORITY_ASSETS_VS_PURGE_THE_FOE_A_LAYOUT } from './layoutData/priorityAssetsVsPurgeTheFoeA.js';
import { loadCustomLayouts } from './layoutImport.js';
import { applyLayoutTransform, identityLayoutTransform } from './layoutTransform.js';

export const BLANK_LAYOUT = {
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

export const BUILTIN_LAYOUTS = [
  BLANK_LAYOUT,
  SEARCH_AND_DESTROY_LAYOUT,
  MEATGRINDER_1_LAYOUT,
  UNSTOPPABLE_FORCE_LAYOUT,
  PURGE_VS_TAKE_AND_HOLD_C_LAYOUT,
  PRIORITY_ASSETS_VS_PRIORITY_ASSETS_B_LAYOUT,
  PRIORITY_ASSETS_VS_TAKE_AND_HOLD_B_LAYOUT,
  PRIORITY_ASSETS_VS_PURGE_THE_FOE_A_LAYOUT,
];

/** Built-in layouts only (no custom). Prefer getAllLayouts() for UI. */
export const BATTLE_LAYOUTS = BUILTIN_LAYOUTS;

export function getAllLayouts() {
  const customs = loadCustomLayouts();
  return [...BUILTIN_LAYOUTS, ...customs];
}

export function getLayoutById(id) {
  if (!id) return BLANK_LAYOUT;
  const customs = loadCustomLayouts();
  return (
    BUILTIN_LAYOUTS.find((l) => l.id === id) ||
    customs.find((l) => l.id === id) ||
    BLANK_LAYOUT
  );
}

/** Base layout + current flip/rotate orientation for map display & LoS. */
export function getActiveBattleLayout(battleMap) {
  const base = getLayoutById(battleMap?.layoutId || 'blank');
  return applyLayoutTransform(base, battleMap?.layoutTransform || identityLayoutTransform());
}
