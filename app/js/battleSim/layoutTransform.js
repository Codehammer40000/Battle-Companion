/**
 * Flip / rotate helpers for battle map layouts and placed models.
 * Orientation is a list of display-space ops applied to the base layout.
 */

export function identityLayoutTransform() {
  return { ops: [] };
}

export function normalizeLayoutTransform(t) {
  const ops = Array.isArray(t?.ops)
    ? t.ops.filter((op) => op === 'flipH' || op === 'rotate90')
    : [];
  // Legacy { rotation, mirrorH } from early builds
  if (!ops.length && t && (t.rotation || t.mirrorH)) {
    const legacy = [];
    if (t.mirrorH) legacy.push('flipH');
    const turns = (((Number(t.rotation) || 0) % 360) + 360) % 360 / 90;
    for (let i = 0; i < turns; i++) legacy.push('rotate90');
    return { ops: legacy };
  }
  return { ops };
}

function aabbFromPolygon(pts) {
  if (!pts?.length) return { x: 0, y: 0, w: 0, h: 0 };
  let minx = pts[0].x;
  let maxx = pts[0].x;
  let miny = pts[0].y;
  let maxy = pts[0].y;
  for (const p of pts) {
    if (p.x < minx) minx = p.x;
    if (p.x > maxx) maxx = p.x;
    if (p.y < miny) miny = p.y;
    if (p.y > maxy) maxy = p.y;
  }
  return {
    x: Math.round(minx * 100) / 100,
    y: Math.round(miny * 100) / 100,
    w: Math.round((maxx - minx) * 100) / 100,
    h: Math.round((maxy - miny) * 100) / 100,
  };
}

/** Apply one display-space op to a point given the current board size. */
export function applyOpToPoint(x, y, boardWidth, boardHeight, op) {
  if (op === 'flipH') return { x: boardWidth - x, y };
  if (op === 'rotate90') return { x: boardHeight - y, y: x };
  return { x, y };
}

export function boardSizeAfterOp(boardWidth, boardHeight, op) {
  if (op === 'rotate90') return { width: boardHeight, height: boardWidth };
  return { width: boardWidth, height: boardHeight };
}

function mapPolygonThroughOps(pts, baseWidth, baseHeight, ops) {
  let w = baseWidth;
  let h = baseHeight;
  return (pts || []).map((p) => {
    let x = p.x;
    let y = p.y;
    w = baseWidth;
    h = baseHeight;
    for (const op of ops) {
      const next = applyOpToPoint(x, y, w, h, op);
      x = next.x;
      y = next.y;
      const size = boardSizeAfterOp(w, h, op);
      w = size.width;
      h = size.height;
    }
    return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
  });
}

function finalBoardSize(baseWidth, baseHeight, ops) {
  let w = baseWidth;
  let h = baseHeight;
  for (const op of ops) {
    const size = boardSizeAfterOp(w, h, op);
    w = size.width;
    h = size.height;
  }
  return { width: w, height: h };
}

function mapShape(shape, baseWidth, baseHeight, ops) {
  if (!shape) return shape;
  const polygon = mapPolygonThroughOps(shape.polygon, baseWidth, baseHeight, ops);
  return {
    ...shape,
    polygon,
    bounds: polygon.length ? aabbFromPolygon(polygon) : shape.bounds,
  };
}

/** Apply stored orientation ops to a base layout. */
export function applyLayoutTransform(layout, transform) {
  if (!layout) return layout;
  const { ops } = normalizeLayoutTransform(transform);
  if (!ops.length) return layout;

  const baseW = layout.width ?? 60;
  const baseH = layout.height ?? 44;
  const size = finalBoardSize(baseW, baseH, ops);

  return {
    ...layout,
    width: size.width,
    height: size.height,
    deploymentZones: (layout.deploymentZones || []).map((z) => mapShape(z, baseW, baseH, ops)),
    terrainAreas: (layout.terrainAreas || []).map((a) => mapShape(a, baseW, baseH, ops)),
    terrainFeatures: (layout.terrainFeatures || []).map((f) => mapShape(f, baseW, baseH, ops)),
    objectives: (layout.objectives || []).map((o) => {
      if (o.polygon) return mapShape(o, baseW, baseH, ops);
      if (o.x != null && o.y != null) {
        let x = o.x;
        let y = o.y;
        let w = baseW;
        let h = baseH;
        for (const op of ops) {
          const next = applyOpToPoint(x, y, w, h, op);
          x = next.x;
          y = next.y;
          const size = boardSizeAfterOp(w, h, op);
          w = size.width;
          h = size.height;
        }
        return { ...o, x, y };
      }
      return o;
    }),
    measurements: layout.measurements || { lines: [], labels: [] },
  };
}

/** Remap placed models/markers for one new display-space op. */
export function remapMapEntities(unitsOnMap, specialMarkers, boardWidth, boardHeight, op) {
  const nextUnits = {};
  for (const [key, entry] of Object.entries(unitsOnMap || {})) {
    if (!entry) {
      nextUnits[key] = entry;
      continue;
    }
    const models = (entry.models || []).map((m) => {
      const p = applyOpToPoint(m.x, m.y, boardWidth, boardHeight, op);
      return { ...m, x: p.x, y: p.y };
    });
    nextUnits[key] = { ...entry, models };
  }

  const nextMarkers = (specialMarkers || []).map((m) => {
    const p = applyOpToPoint(m.x, m.y, boardWidth, boardHeight, op);
    return { ...m, x: p.x, y: p.y };
  });

  return { unitsOnMap: nextUnits, specialMarkers: nextMarkers };
}

export function nextTransformAfterOp(transform, op) {
  const { ops } = normalizeLayoutTransform(transform);
  if (op !== 'flipH' && op !== 'rotate90') return { ops };
  return { ops: [...ops, op] };
}
