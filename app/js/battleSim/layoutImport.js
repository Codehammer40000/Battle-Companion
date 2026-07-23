/**
 * Offline Rapid Ingress layout import — parse saved HTML / terrain-data JS,
 * convert to Battle Companion layout shape, persist in localStorage.
 */

const CUSTOM_LAYOUTS_KEY = 'wh40k-custom-layouts-v1';

/** @type {{ layoutsById: Map<string, object>, list: {id:string,label:string}[], suggestedId: string|null, suggestedName: string|null } | null} */
let importSession = null;

function rdp(points, epsilon) {
  if (!points || points.length < 3) return points || [];

  function perp(p, a, b) {
    const ax = a.x;
    const ay = a.y;
    const bx = b.x;
    const by = b.y;
    const px = p.x;
    const py = p.y;
    const dx = bx - ax;
    const dy = by - ay;
    if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function rec(pts) {
    if (pts.length < 3) return pts;
    const a = pts[0];
    const b = pts[pts.length - 1];
    let idx = 0;
    let dist = -1;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = perp(pts[i], a, b);
      if (d > dist) {
        dist = d;
        idx = i;
      }
    }
    if (dist > epsilon) {
      const left = rec(pts.slice(0, idx + 1));
      const right = rec(pts.slice(idx));
      return left.slice(0, -1).concat(right);
    }
    return [a, b];
  }

  let out = rec(points);
  if (
    out.length > 2 &&
    Math.abs(out[0].x - out[out.length - 1].x) < 1e-6 &&
    Math.abs(out[0].y - out[out.length - 1].y) < 1e-6
  ) {
    out = out.slice(0, -1);
  }
  return out;
}

function roundPts(pts, n = 2) {
  const f = 10 ** n;
  return (pts || []).map((p) => ({
    x: Math.round(p.x * f) / f,
    y: Math.round(p.y * f) / f,
  }));
}

function aabb(pts) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minx = Math.min(...xs);
  const maxx = Math.max(...xs);
  const miny = Math.min(...ys);
  const maxy = Math.max(...ys);
  return {
    x: Math.round(minx * 100) / 100,
    y: Math.round(miny * 100) / 100,
    w: Math.round((maxx - minx) * 100) / 100,
    h: Math.round((maxy - miny) * 100) / 100,
  };
}

function aabbTouch(a, b, gap = 0.35) {
  return !(
    a.x + a.w + gap < b.x ||
    b.x + b.w + gap < a.x ||
    a.y + a.h + gap < b.y ||
    b.y + b.h + gap < a.y
  );
}

/**
 * Rapid Ingress URL slug → data id.
 * Slug order follows the page title (e.g. pfdia = PF vs DI, Layout A),
 * but terrain IDs sort the two disposition codes alphabetically (DI-PF-A).
 */
export function slugToRapidIngressId(slug) {
  const s = String(slug || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (!/^[a-z]{4}[a-c]$/.test(s)) return null;
  const a = s.slice(0, 2).toUpperCase();
  const b = s.slice(2, 4).toUpperCase();
  const v = s.slice(4).toUpperCase();
  const [first, second] = a <= b ? [a, b] : [b, a];
  return `${first}-${second}-${v}`;
}

/** Candidate RI ids for a slug (sorted + page-order). */
function slugCandidateIds(slug) {
  const s = String(slug || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (!/^[a-z]{4}[a-c]$/.test(s)) return [];
  const a = s.slice(0, 2).toUpperCase();
  const b = s.slice(2, 4).toUpperCase();
  const v = s.slice(4).toUpperCase();
  const sorted = slugToRapidIngressId(s);
  const pageOrder = `${a}-${b}-${v}`;
  return [...new Set([sorted, pageOrder].filter(Boolean))];
}

export function extractLayoutHintFromHtml(html) {
  const text = String(html || '');
  let slug = null;
  const slugMatch =
    text.match(/layout-reference\/([a-z]{4}[a-c])/i) ||
    text.match(/saved from url=\([^)]*layout-reference\/([a-z]{4}[a-c])/i);
  if (slugMatch) slug = slugMatch[1];

  let suggestedName = null;
  const title = text.match(/<title>([^<]+)<\/title>/i);
  if (title) {
    suggestedName = title[1].split('|')[0].trim();
  }
  const mission = text.match(/Missions\s*[-–]\s*Both players:\s*([^."<]+)/i);
  if (mission && !suggestedName) {
    suggestedName = mission[1].trim();
  }
  return { slug, riCandidates: slugCandidateIds(slug), suggestedName };
}

/** RapidIngress-pfthc.png / RapidIngress-pfthc → slug pfthc */
export function extractLayoutHintFromFilename(filename) {
  const name = String(filename || '');
  const m =
    name.match(/RapidIngress[-_]?([a-z]{4}[a-c])/i) ||
    name.match(/\b([a-z]{4}[a-c])(?:\.(?:png|jpe?g|webp|html?))?$/i);
  if (!m) return { slug: null, riCandidates: [], suggestedName: null };
  const slug = m[1].toLowerCase();
  return {
    slug,
    riCandidates: slugCandidateIds(slug),
    suggestedName: null,
  };
}

export function extractElevenELayouts(text) {
  const startMark = 'const ELEVEN_E_LAYOUTS = ';
  const endMark = 'const ELEVEN_E_MATCHUPS';
  const start = text.indexOf(startMark);
  if (start < 0) return null;
  const jsonStart = start + startMark.length;
  const end = text.indexOf(endMark, jsonStart);
  if (end < 0) return null;
  let json = text.slice(jsonStart, end).trim();
  if (json.endsWith(';')) json = json.slice(0, -1).trim();
  const layouts = JSON.parse(json);
  return Array.isArray(layouts) ? layouts : null;
}

/**
 * Convert one Rapid Ingress layout object into Battle Companion layout shape.
 */
export function convertRapidIngressLayout(src, options = {}) {
  if (!src?.terrain) throw new Error('Invalid Rapid Ingress layout data');
  const name = String(options.name || src.id || 'Imported layout').trim() || 'Imported layout';
  const id =
    options.id ||
    `custom-${String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'layout'}`;

  const areas = [];
  const features = [];

  for (const t of src.terrain) {
    const pts = roundPts(rdp(t.points || [], 0.12));
    if (t.base) {
      const obj = t.objective || null;
      let otype = obj?.type || null;
      if (otype === 'central') otype = 'centre';
      const area = {
        id: t.areaId || t.id,
        polygon: pts,
        bounds: aabb(pts),
        obscuring: !!t.obscuring,
        isObjective: !!obj,
        objectiveType: otype,
      };
      if (areas.some((a) => a.id === area.id)) area.id = t.id;
      areas.push(area);
    } else if (t.feature) {
      const cat = String(t.category || 'LIGHT').toUpperCase();
      const color = cat === 'DENSE' ? 'green' : 'yellow';
      features.push({
        id: t.id,
        areaId: t.areaId,
        polygon: pts,
        bounds: aabb(pts),
        color,
        solid: color === 'green',
        category: color === 'green' ? 'dense' : 'light',
      });
    }
  }

  const centrals = areas.filter((a) => a.isObjective && a.objectiveType === 'centre');
  for (const a of areas) {
    if (a.isObjective) continue;
    if (centrals.some((c) => aabbTouch(a.bounds, c.bounds))) {
      a.isObjective = true;
      a.objectiveType = 'centre';
    }
  }

  const deploymentZones = [];
  for (const z of src.deploymentZones || []) {
    const pts = roundPts(rdp(z.points || [], 0.08));
    const color = z.type === 'opponent' ? 'red' : 'blue';
    deploymentZones.push({
      id: z.id,
      color,
      role: color === 'red' ? 'attacker' : 'defender',
      polygon: pts,
      bounds: aabb(pts),
    });
  }

  return {
    id,
    name,
    page: 100,
    custom: true,
    source: `Rapid Ingress ${src.id} (imported)`,
    rapidIngressId: src.id,
    width: src.boardWidth || 60,
    height: src.boardHeight || 44,
    deploymentZones,
    terrainAreas: areas,
    terrainFeatures: features,
    objectives: [],
    measurements: { lines: [], labels: [] },
  };
}

export function loadCustomLayouts() {
  try {
    const raw = localStorage.getItem(CUSTOM_LAYOUTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((l) => l && l.id && l.name) : [];
  } catch (_) {
    return [];
  }
}

export function saveCustomLayout(layout) {
  const all = loadCustomLayouts().filter((l) => l.id !== layout.id);
  all.push(layout);
  localStorage.setItem(CUSTOM_LAYOUTS_KEY, JSON.stringify(all));
  return layout;
}

export function deleteCustomLayout(id) {
  const all = loadCustomLayouts().filter((l) => l.id !== id);
  localStorage.setItem(CUSTOM_LAYOUTS_KEY, JSON.stringify(all));
  return all;
}

export function clearImportSession() {
  importSession = null;
}

export function getImportSession() {
  return importSession;
}

/**
 * Read one or more saved Rapid Ingress files (HTML +/or terrain-data-11e.js).
 * @param {{ name: string, text: string }[]} files
 */
export function beginImportSession(files) {
  clearImportSession();
  let layouts = null;
  let suggestedId = null;
  let suggestedName = null;
  let candidates = [];

  for (const f of files || []) {
    const name = (f.name || '').toLowerCase();
    const text = f.text || '';
    if (!layouts) {
      try {
        layouts = extractElevenELayouts(text);
      } catch (_) {
        layouts = null;
      }
    }
    // PNG/JPG exports: RapidIngress-pfthc.png — slug only, no polygon payload
    if (/\.(png|jpe?g|webp)$/i.test(name) || /rapidingress[-_]?[a-z]{4}[a-c]/i.test(name)) {
      const hint = extractLayoutHintFromFilename(f.name || name);
      if (hint.riCandidates?.length) candidates = hint.riCandidates;
    }
    if (
      name.endsWith('.html') ||
      name.endsWith('.htm') ||
      text.includes('<html') ||
      text.includes('layout-reference')
    ) {
      const hint = extractLayoutHintFromHtml(text);
      if (hint.riCandidates?.length) candidates = hint.riCandidates;
      if (hint.suggestedName) suggestedName = hint.suggestedName;
    }
  }

  if (!layouts?.length) {
    throw new Error(
      'Could not find terrain data. When you Save as Webpage, Complete, also select terrain-data-11e.js.download from the page’s _files folder (multi-select with the .html).',
    );
  }

  const layoutsById = new Map(layouts.map((l) => [l.id, l]));
  const list = layouts
    .map((l) => ({
      id: l.id,
      label: `${l.id}${l.name ? ` — ${l.name}` : ''}`,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const id of candidates) {
    if (layoutsById.has(id)) {
      suggestedId = id;
      break;
    }
  }
  if (!suggestedId && list.length === 1) suggestedId = list[0].id;

  importSession = { layoutsById, list, suggestedId, suggestedName };
  return { list, suggestedId, suggestedName };
}

/**
 * Convert the session’s selected RI layout and save as a custom layout.
 */
export function commitImportSession(riId, title) {
  if (!importSession) throw new Error('No import in progress — choose files first.');
  const src = importSession.layoutsById.get(riId);
  if (!src) throw new Error(`Layout ${riId} not found in the terrain file.`);
  const name =
    String(title || '').trim() || importSession.suggestedName || riId || 'Imported layout';
  const baseId = `custom-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || String(riId).toLowerCase()}`;
  const layout = convertRapidIngressLayout(src, { id: baseId, name });
  saveCustomLayout(layout);
  clearImportSession();
  return layout;
}

export function readFilesAsText(fileList) {
  const files = Array.from(fileList || []);
  return Promise.all(
    files.map(
      (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve({ name: file.name, text: String(reader.result || '') });
          reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
          reader.readAsText(file);
        }),
    ),
  );
}
