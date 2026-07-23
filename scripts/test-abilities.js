import { parseRosterJson } from '../app/js/guide/rosterParser.js';
import { extractArmyAbilities } from '../app/js/guide/abilityMapper.js';
import fs from 'fs';

const json = fs.readFileSync(process.argv[2], 'utf8');
const roster = parseRosterJson(json);
const abilities = extractArmyAbilities(roster);

console.log('Units:', roster.units.length);
console.log('Army rules:', roster.armyRules?.length);
console.log('Profile abilities per unit:', roster.units.map((u) => `${u.name}: ${u.abilities?.length || 0}`).join(', '));
console.log('\nMapped abilities by slot:');
const bySlot = {};
for (const a of abilities) {
  bySlot[a.slot] = bySlot[a.slot] || [];
  bySlot[a.slot].push(`${a.unitName} — ${a.ruleName}`);
}
for (const [slot, list] of Object.entries(bySlot).sort()) {
  console.log(`\n[${slot}] (${list.length})`);
  list.forEach((x) => console.log('  ', x));
}

const unmapped = [];
for (const u of roster.units) {
  for (const ab of u.abilities || []) {
    const found = abilities.some((a) => a.ruleName === ab.name && a.unitName === u.name);
    if (!found) unmapped.push(`${u.name} — ${ab.name}`);
  }
}
if (unmapped.length) {
  console.log('\nUnmapped profile abilities:');
  for (const u of roster.units) {
    for (const ab of u.abilities || []) {
      const found = abilities.some((a) => a.ruleName === ab.name && a.unitName === u.name);
      if (!found) console.log(`  ${u.name} — ${ab.name}: ${ab.description.slice(0, 180)}`);
    }
  }
}
