import fs from 'fs';

const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const force = d.roster.forces[0];

function walk(sel, depth = 0, path = '') {
  const p = path ? `${path} > ${sel.name}` : sel.name;
  
  if (sel.profiles?.length) {
    for (const prof of sel.profiles) {
      const chars = prof.characteristics || [];
      for (const c of chars) {
        const name = (c.name || '').toLowerCase();
        if (name.includes('ability') || name.includes('abilities') || (c.$text && c.$text.length > 30)) {
          console.log(`\n[${p}] profile "${prof.name}" char "${c.name}":`);
          console.log((c.$text || '').slice(0, 500));
        }
      }
    }
  }

  if (sel.rules?.length) {
    for (const r of sel.rules) {
      if (r.name && !['Leader', 'Pistol', 'Torrent', 'Ignores Cover', 'Heavy', 'Devastating Wounds'].includes(r.name)) {
        if ((r.description || '').length > 50) {
          console.log(`\n[${p}] rule "${r.name}":`);
          console.log((r.description || '').slice(0, 300));
        }
      }
    }
  }

  for (const c of sel.selections || []) {
    if (depth < 4) walk(c, depth + 1, p);
  }
}

// Find specific units
function find(sel, term) {
  if ((sel.name || '').includes(term)) return sel;
  for (const c of sel.selections || []) {
    const f = find(c, term);
    if (f) return f;
  }
  return null;
}

console.log('=== FULL DUMP for Vulkan ===');
const v = find({ selections: force.selections }, "Vulkan");
if (v) console.log(JSON.stringify(v, null, 2).slice(0, 15000));

console.log('\n=== FULL DUMP for Intercessor Squad ===');
const i = find({ selections: force.selections }, 'Intercessor Squad');
if (i) console.log(JSON.stringify(i, null, 2).slice(0, 8000));
