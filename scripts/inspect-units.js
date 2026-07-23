import fs from 'fs';
const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const force = d.roster.forces[0];

function types(sel, depth = 0) {
  const cats = (sel.categories || []).map((c) => c.name).join(',');
  console.log('  '.repeat(depth) + sel.name, '| type:', sel.type, '| cats:', cats);
  for (const c of sel.selections || []) types(c, depth + 1);
}

for (const s of force.selections) {
  types(s);
}
