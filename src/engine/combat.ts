import type { CombatResult, Model, Unit, Weapon } from '../types/game';
import { leadershipRoll, requiredWoundRoll, rollD6 } from './dice';

export function resolveWeaponAttacks(
  weapon: Weapon,
  attackerModels: Model[],
  targetUnit: Unit,
  hitModifier = 0,
  cover = false,
): CombatResult {
  const diceLog: string[] = [];
  let totalAttacks = 0;
  for (const model of attackerModels) {
    if (model.woundsRemaining <= 0) continue;
    if (!model.weapons.some((w) => w.id === weapon.id)) continue;
    totalAttacks += weapon.attacks;
  }

  let hits = 0;
  const skill = weapon.skill + (cover ? 1 : 0) + hitModifier;
  for (let i = 0; i < totalAttacks; i++) {
    const roll = rollD6();
    if (roll === 6) {
      hits++;
      diceLog.push(`Hit roll ${roll}: CRITICAL HIT`);
    } else if (roll >= skill) {
      hits++;
      diceLog.push(`Hit roll ${roll}: HIT (need ${skill}+)`);
    } else {
      diceLog.push(`Hit roll ${roll}: MISS (need ${skill}+)`);
    }
  }

  const targetT = targetUnit.models.find((m) => m.woundsRemaining > 0)?.profile.toughness ?? 4;
  const woundNeeded = requiredWoundRoll(weapon.strength, targetT);
  let wounds = 0;
  for (let i = 0; i < hits; i++) {
    const roll = rollD6();
    if (roll === 6) {
      wounds++;
      diceLog.push(`Wound roll ${roll}: CRITICAL WOUND`);
    } else if (roll >= woundNeeded) {
      wounds++;
      diceLog.push(`Wound roll ${roll}: WOUND (need ${woundNeeded}+)`);
    } else {
      diceLog.push(`Wound roll ${roll}: FAIL (need ${woundNeeded}+)`);
    }
  }

  let failedSaves = 0;
  const modelsDestroyed: string[] = [];
  const targetModels = [...targetUnit.models].filter((m) => m.woundsRemaining > 0);

  for (let i = 0; i < wounds; i++) {
    if (targetModels.length === 0) break;
    const target = targetModels.find((m) => m.woundsRemaining > 0 && !m.isCharacter) ?? targetModels[0];
    const saveRoll = rollD6();
    const effectiveSave = target.profile.save + weapon.ap;
    const invuln = target.profile.invuln;
    let inflicts = true;
    if (saveRoll === 1) {
      inflicts = true;
      diceLog.push(`Save roll ${saveRoll}: FAIL (unmodified 1)`);
    } else if (invuln && saveRoll >= invuln) {
      inflicts = false;
      diceLog.push(`Save roll ${saveRoll}: SAVED (invuln ${invuln}+)`);
    } else if (saveRoll >= effectiveSave) {
      inflicts = false;
      diceLog.push(`Save roll ${saveRoll}: SAVED (${effectiveSave}+ after AP)`);
    } else {
      diceLog.push(`Save roll ${saveRoll}: FAILED`);
    }

    if (inflicts) {
      failedSaves++;
      target.woundsRemaining -= weapon.damage;
      diceLog.push(`${target.name} takes ${weapon.damage} damage (${target.woundsRemaining} W remaining)`);
      if (target.woundsRemaining <= 0) {
        modelsDestroyed.push(target.id);
        diceLog.push(`${target.name} DESTROYED`);
      }
    }
  }

  return { hits, wounds, failedSaves, modelsDestroyed, diceLog };
}

export function resolveBattleShock(unit: Unit): { success: boolean; rolls: [number, number]; total: number } {
  const ld = Math.min(...unit.models.map((m) => m.profile.leadership));
  const result = leadershipRoll(ld);
  return { success: result.success, rolls: result.rolls, total: result.total };
}

export function getRangedWeapons(unit: Unit): Weapon[] {
  const weapons = new Map<string, Weapon>();
  for (const model of unit.models) {
    for (const w of model.weapons) {
      if (w.range !== 'melee') weapons.set(w.id, w);
    }
  }
  return [...weapons.values()];
}

export function getMeleeWeapons(unit: Unit): Weapon[] {
  const weapons = new Map<string, Weapon>();
  for (const model of unit.models) {
    for (const w of model.weapons) {
      if (w.range === 'melee') weapons.set(w.id, w);
    }
  }
  return [...weapons.values()];
}

export function weaponInRange(weapon: Weapon, distanceInches: number): boolean {
  if (weapon.range === 'melee') return distanceInches <= 2;
  return distanceInches <= weapon.range;
}
