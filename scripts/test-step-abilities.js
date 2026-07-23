import fs from 'fs';
import { parseRosterJson } from '../app/js/guide/rosterParser.js';
import { getAllAbilitiesForStep, getSlotsForStep } from '../app/js/guide/abilityMapper.js';
import { buildFullGuideFlow } from '../app/js/guide/phaseFlow.js';

const roster = parseRosterJson(fs.readFileSync(process.argv[2], 'utf8'));
const flow = buildFullGuideFlow('P1 Army', 'P2 Army');
const state = { player1: { army: roster }, player2: { army: null } };

const tests = ['p1-cmd-start', 'p1-cmd-cp', 'p1-shoot', 'p1-fight', 'setup-deploy'];
for (const id of tests) {
  const step = flow.find((s) => s.id === id);
  const abs = getAllAbilitiesForStep(state, step);
  console.log(`\n${id} slots=${getSlotsForStep(step).join(',')} abilities=${abs.length}`);
  abs.forEach((a) => console.log(`  [${a.player}] ${a.unitName} — ${a.ruleName}`));
}
