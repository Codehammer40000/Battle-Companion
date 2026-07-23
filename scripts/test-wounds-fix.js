import { parseRosterJson, normalizeArmyUnits, getUnitWoundsPerModel, getUnitInitialModelCount } from '../app/js/guide/rosterParser.js';
import { getUnitWoundCapacity, getRemainingModels } from '../app/js/guide/guideState.js';
import fs from 'fs';
import path from 'path';

const f = path.join(process.env.USERPROFILE, 'Downloads', "Vulkan's Zeal Incursion.json");
const army = normalizeArmyUnits(parseRosterJson(fs.readFileSync(f, 'utf8')));
const bg = army.units.find((u) => /bladeguard/i.test(u.name));

const stale = { ...bg };
delete stale.woundsPerModel;
delete stale.initialModelCount;

console.log('fresh cap', getUnitWoundCapacity(bg));
console.log('stale cap', getUnitWoundCapacity(stale));
console.log('stale at 1w', getRemainingModels(stale, 1), 'models');
console.log('stale at 3w', getRemainingModels(stale, 3), 'models');
console.log('W per model', getUnitWoundsPerModel(stale), 'models', getUnitInitialModelCount(stale));
