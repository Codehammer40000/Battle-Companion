import fs from 'fs';

const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

function find(sel, name) {
  if (sel.name === name) return sel;
  for (const c of sel.selections || []) {
    const f = find(c, name);
    if (f) return f;
  }
  return null;
}

function walkProfiles(sel, out = []) {
  for (const p of sel.profiles || []) {
    const chars = {};
    for (const c of p.characteristics || []) {
      chars[c.name] = c.$text ?? c.value ?? '';
    }
    out.push({ name: p.name, typeName: p.typeName, chars, number: sel.number });
  }
  for (const child of sel.selections || []) walkProfiles(child, out);
  return out;
}

for (const unitName of process.argv.slice(3)) {
  const u = find({ selections: d.roster.forces[0].selections }, unitName);
  if (!u) continue;
  console.log('\n===', unitName, '===');
  const profs = walkProfiles(u);
  for (const p of profs) {
    if (['Unit', 'Ranged Weapons', 'Melee Weapons', 'Abilities'].includes(p.typeName)) {
      console.log(p.typeName, '-', p.name, p.chars);
    }
  }
}
