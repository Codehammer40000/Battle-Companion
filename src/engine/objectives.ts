import type { PlayerId, TerrainArea, Unit } from '../types/game';
import { modelInTerrainArea } from './geometry';

export interface ObjectiveControl {
  areaId: string;
  player1OC: number;
  player2OC: number;
  controller: PlayerId | null;
  label: string;
}

export function calculateObjectiveControl(
  areas: TerrainArea[],
  units: Unit[],
): ObjectiveControl[] {
  return areas
    .filter((a) => a.isObjective)
    .map((area) => {
      let player1OC = 0;
      let player2OC = 0;

      for (const unit of units) {
        if (unit.battleShocked) continue;
        for (const model of unit.models) {
          if (model.woundsRemaining <= 0) continue;
          if (model.profile.oc < 0) continue;
          if (!modelInTerrainArea(model, area)) continue;
          if (unit.player === 'player1') player1OC += model.profile.oc;
          else player2OC += model.profile.oc;
        }
      }

      let controller: PlayerId | null = null;
      if (player1OC > player2OC) controller = 'player1';
      else if (player2OC > player1OC) controller = 'player2';

      return {
        areaId: area.id,
        player1OC,
        player2OC,
        controller,
        label: area.label ?? area.id,
      };
    });
}
