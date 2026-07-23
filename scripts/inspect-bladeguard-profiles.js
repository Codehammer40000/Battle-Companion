import fs from 'fs';
import path from 'path';

const downloads = path.join(process.env.USERPROFILE || '', 'Downloads');
const file = fs.readdirSync(downloads).find((f) => f.includes('Vulkan'));
const data = JSON.parse(fs.readFileSync(path.join(downloads, file), 'utf8'));
const force = data.roster.forces[0];

function findUnit(sel, name) {
  if (sel.name?.includes(name)) return sel;
  for (const c of sel.selections || []) {
    const f = findUnit(c, name);
    if (f) return f;
  }
  return null;
}

const bg = findUnit(force, 'Bladeguard');
for (const p of bg.profiles || []) {
  if (p.typeName === 'Unit') {
    console.log('Profile:', p.name);
    console.log(p.characteristics?.map((c) => ({ name: c.name, val: c.$text ?? c.value })));
  }
}
