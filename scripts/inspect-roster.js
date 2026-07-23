import fs from 'fs';
const p = process.argv[2];
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const force = d.roster.forces[0];

function walk(sel, fn) {
  fn(sel);
  for (const c of sel.selections || []) walk(c, fn);
}

const units = [];
walk(force, (s) => {
  if (s.type === 'model' || (s.categories || []).some((c) => c.name === 'Unit')) {
    units.push(s);
  }
});

console.log('Units/models:', units.map((u) => u.name).join(', '));

const phaseRules = [];
walk(force, (s) => {
  const unitName = s.name;
  for (const r of s.rules || []) {
    const desc = r.description || '';
    if (/command phase|movement phase|shooting phase|charge phase|fight phase|deploy|set up|start of|end of|after shooting|after moving|battle round/i.test(desc)) {
      phaseRules.push({ unit: unitName, type: s.type, rule: r.name, desc });
    }
  }
});

console.log('\n=== Phase-triggered rules ===');
for (const r of phaseRules) {
  console.log(`\n[${r.unit}] ${r.rule}`);
  console.log(r.desc.slice(0, 400));
}

// Detachment rules
console.log('\n=== Force-level rules ===');
for (const r of force.rules || []) {
  console.log(`\n${r.name}`);
  console.log((r.description || '').slice(0, 400));
}

// All top-level unit selections
console.log('\n=== Top selections ===');
for (const s of force.selections || []) {
  if (s.type === 'model' || s.categories?.some((c) => c.name === 'Unit')) {
    console.log(s.name, s.type, 'cost', s.costs);
  }
}
