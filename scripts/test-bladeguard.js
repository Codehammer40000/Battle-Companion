import { parseRosterJson } from '../app/js/guide/rosterParser.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const downloads = path.join(process.env.USERPROFILE || '', 'Downloads');

for (const file of fs.readdirSync(downloads).filter((f) => f.endsWith('.json'))) {
  try {
    const r = parseRosterJson(fs.readFileSync(path.join(downloads, file), 'utf8'));
    const bg = r.units.find((u) => /bladeguard/i.test(u.name));
    if (bg) {
      console.log('File:', file);
      console.log({
        name: bg.name,
        modelCount: bg.modelCount,
        initialModelCount: bg.initialModelCount,
        woundsPerModel: bg.woundsPerModel,
        W: bg.stats.W,
        statsLine: bg.statsLine,
      });
    }
  } catch (_) {}
}
