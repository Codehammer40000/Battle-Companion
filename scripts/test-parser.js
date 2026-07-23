import { parseRosterJson } from '../app/js/guide/rosterParser.js';
import { extractArmyAbilities } from '../app/js/guide/abilityMapper.js';
import fs from 'fs';

const army = parseRosterJson(fs.readFileSync(process.argv[2], 'utf8'));
console.log('Army:', army.name, army.points, 'pts');
console.log('Units:', army.units.length);
console.log('Detachment:', army.detachment);
const abilities = extractArmyAbilities(army);
console.log('Phase abilities:', abilities.length);
abilities.forEach((a) => console.log(`  [${a.slot}] ${a.unitName} - ${a.ruleName}`));
