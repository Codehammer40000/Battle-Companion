/**
 * SVG map rendering for Battle Sim — grid, terrain, models, radii, LOS.
 */

import { getLayoutById } from './layouts.js';
import { boardSizeForLayout } from './battleMapState.js';

const PPI = 12; // pixels per inch in SVG user space

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function toPx(inches) {
  return inches * PPI;
}

export function getPixelsPerInch() {
  return PPI;
}

function renderGrid(width, height) {
  const lines = [];
  for (let x = 0; x <= width; x++) {
    const bold = x === 0 || x === width || x === width / 2;
    lines.push(
      `<line x1="${toPx(x)}" y1="0" x2="${toPx(x)}" y2="${toPx(height)}" stroke="${bold ? '#555' : '#2a2a2a'}" stroke-width="${bold ? 2 : 1}" />`,
    );
  }
  for (let y = 0; y <= height; y++) {
    const bold = y === 0 || y === height || y === height / 2;
    lines.push(
      `<line x1="0" y1="${toPx(y)}" x2="${toPx(width)}" y2="${toPx(y)}" stroke="${bold ? '#555' : '#2a2a2a'}" stroke-width="${bold ? 2 : 1}" />`,
    );
  }
  return `<g class="map-grid">${lines.join('')}</g>`;
}

function polyPoints(polygon) {
  return polygon.map((p) => `${toPx(p.x)},${toPx(p.y)}`).join(' ');
}

function renderDeploymentZones(zones) {
  return (zones || [])
    .map((zone) => {
      const color = zone.color === 'red' ? '#dc2626' : '#2563eb';
      const fill = zone.color === 'red' ? 'rgba(220, 38, 38, 0.14)' : 'rgba(37, 99, 235, 0.14)';
      if (zone.polygon?.length >= 3) {
        return `<polygon points="${polyPoints(zone.polygon)}" fill="${fill}" stroke="${color}" stroke-width="3" stroke-opacity="0.95" />`;
      }
      const b = zone.bounds;
      if (!b) return '';
      return `<rect x="${toPx(b.x)}" y="${toPx(b.y)}" width="${toPx(b.w)}" height="${toPx(b.h)}" fill="${fill}" stroke="${color}" stroke-width="3" stroke-opacity="0.95" />`;
    })
    .join('');
}

function renderTerrainAreas(areas) {
  return (areas || [])
    .map((area) => {
      const fill = area.isObjective ? 'rgba(249, 115, 22, 0.42)' : 'rgba(70, 70, 70, 0.5)';
      const stroke = area.isObjective ? 'rgba(249, 115, 22, 0.95)' : 'rgba(130, 130, 130, 0.7)';
      const width = area.isObjective ? '2.5' : '1.5';
      if (area.polygon?.length >= 3) {
        return `<polygon points="${polyPoints(area.polygon)}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" />`;
      }
      const b = area.bounds;
      if (!b) return '';
      return `<rect x="${toPx(b.x)}" y="${toPx(b.y)}" width="${toPx(b.w)}" height="${toPx(b.h)}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" />`;
    })
    .join('');
}

function renderTerrainFeatures(features) {
  return (features || [])
    .map((f) => {
      const fill = f.color === 'green' ? 'rgba(22, 163, 74, 0.85)' : 'rgba(234, 179, 8, 0.75)';
      const stroke = f.color === 'green' ? '#15803d' : '#a16207';
      const attrs = `fill="${fill}" stroke="${stroke}" stroke-width="1" data-feature-id="${esc(f.id)}" data-solid="${f.solid ? '1' : '0'}"`;
      if (f.polygon?.length >= 3) {
        return `<polygon points="${polyPoints(f.polygon)}" ${attrs} />`;
      }
      const b = f.bounds;
      if (!b) return '';
      return `<rect x="${toPx(b.x)}" y="${toPx(b.y)}" width="${toPx(b.w)}" height="${toPx(b.h)}" ${attrs} />`;
    })
    .join('');
}

function renderObjectives(objectives) {
  return (objectives || [])
    .map((o) => {
      const x = toPx(o.x);
      const y = toPx(o.y);
      const type = o.type || 'centre';
      if (type === 'home') {
        const fill = o.owner === 'attacker' ? '#dc2626' : '#2563eb';
        const s = toPx(1.1);
        // castle-style square with battlements
        return `
          <g class="map-objective map-objective-home" pointer-events="none">
            <rect x="${x - s}" y="${y - s}" width="${s * 2}" height="${s * 2}" fill="${fill}" stroke="#fff" stroke-width="2" />
            <rect x="${x - s}" y="${y - s - toPx(0.35)}" width="${toPx(0.45)}" height="${toPx(0.4)}" fill="${fill}" stroke="#fff" stroke-width="1" />
            <rect x="${x - toPx(0.22)}" y="${y - s - toPx(0.35)}" width="${toPx(0.45)}" height="${toPx(0.4)}" fill="${fill}" stroke="#fff" stroke-width="1" />
            <rect x="${x + s - toPx(0.45)}" y="${y - s - toPx(0.35)}" width="${toPx(0.45)}" height="${toPx(0.4)}" fill="${fill}" stroke="#fff" stroke-width="1" />
          </g>`;
      }
      if (type === 'expansion') {
        const s = toPx(1.35);
        const diamond = `${x},${y - s} ${x + s},${y} ${x},${y + s} ${x - s},${y}`;
        return `
          <g class="map-objective map-objective-expansion" pointer-events="none">
            <polygon points="${diamond}" fill="#16a34a" stroke="#fff" stroke-width="2" />
            <circle cx="${x}" cy="${y}" r="${toPx(0.35)}" fill="#052e16" />
            <path d="M ${x - toPx(0.22)} ${y - toPx(0.08)} Q ${x} ${y - toPx(0.35)} ${x + toPx(0.22)} ${y - toPx(0.08)} Q ${x + toPx(0.18)} ${y + toPx(0.22)} ${x} ${y + toPx(0.28)} Q ${x - toPx(0.18)} ${y + toPx(0.22)} ${x - toPx(0.22)} ${y - toPx(0.08)} Z" fill="#fff" />
            <circle cx="${x - toPx(0.08)}" cy="${y - toPx(0.02)}" r="${toPx(0.06)}" fill="#052e16" />
            <circle cx="${x + toPx(0.08)}" cy="${y - toPx(0.02)}" r="${toPx(0.06)}" fill="#052e16" />
          </g>`;
      }
      // centre
      const r = toPx(1.35);
      return `
        <g class="map-objective map-objective-centre" pointer-events="none">
          <circle cx="${x}" cy="${y}" r="${r}" fill="#16a34a" stroke="#fff" stroke-width="2" />
          <circle cx="${x}" cy="${y}" r="${toPx(0.4)}" fill="#052e16" />
          <path d="M ${x - toPx(0.25)} ${y - toPx(0.1)} Q ${x} ${y - toPx(0.4)} ${x + toPx(0.25)} ${y - toPx(0.1)} Q ${x + toPx(0.2)} ${y + toPx(0.25)} ${x} ${y + toPx(0.32)} Q ${x - toPx(0.2)} ${y + toPx(0.25)} ${x - toPx(0.25)} ${y - toPx(0.1)} Z" fill="#fff" />
          <circle cx="${x - toPx(0.09)}" cy="${y - toPx(0.02)}" r="${toPx(0.07)}" fill="#052e16" />
          <circle cx="${x + toPx(0.09)}" cy="${y - toPx(0.02)}" r="${toPx(0.07)}" fill="#052e16" />
        </g>`;
    })
    .join('');
}

function renderMeasurements(measurements) {
  if (!measurements) return '';
  const lines = (measurements.lines || [])
    .map(
      (l) =>
        `<line x1="${toPx(l.x1)}" y1="${toPx(l.y1)}" x2="${toPx(l.x2)}" y2="${toPx(l.y2)}" stroke="#60a5fa" stroke-width="1.5" stroke-opacity="0.85" pointer-events="none" />`,
    )
    .join('');
  const labels = (measurements.labels || [])
    .map((lab) => {
      const x = toPx(lab.x);
      const y = toPx(lab.y);
      return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" fill="#3b82f6" stroke="#fff" stroke-width="3" paint-order="stroke" font-size="11" font-weight="700" pointer-events="none">${esc(lab.text)}</text>`;
    })
    .join('');
  return `<g class="map-measurements">${lines}${labels}</g>`;
}

function renderRadii(radii) {
  return (radii || [])
    .map((r) => {
      const stroke = r.kind === 'move' ? '#38bdf8' : '#fbbf24';
      return `<circle cx="${toPx(r.x)}" cy="${toPx(r.y)}" r="${toPx(r.radius)}" fill="${stroke}" fill-opacity="0.08" stroke="${stroke}" stroke-width="2" stroke-dasharray="6 4" pointer-events="none" />`;
    })
    .join('');
}

function formatInches(n) {
  const v = Math.round(Number(n) * 10) / 10;
  if (!Number.isFinite(v)) return '';
  return Number.isInteger(v) ? `${v}"` : `${v.toFixed(1)}"`;
}

function renderLos(los) {
  if (!los) return '';
  const lines = Array.isArray(los.lines) ? los.lines : los.from && los.to ? [los] : [];
  if (!lines.length) return '';
  return `<g class="map-los" pointer-events="none">${lines
    .map((line) => {
      const blocked = !!line.blocked;
      // Thin, vibrant red; blocked rays slightly dimmer / dashed
      const stroke = blocked ? '#ff2a2a' : '#ff1a1a';
      const width = blocked ? '1.25' : '1.75';
      const dash = blocked ? 'stroke-dasharray="5 4"' : '';
      const opacity = blocked ? '0.85' : '1';
      const seg = `<line x1="${toPx(line.from.x)}" y1="${toPx(line.from.y)}" x2="${toPx(line.to.x)}" y2="${toPx(line.to.y)}" stroke="${stroke}" stroke-width="${width}" stroke-opacity="${opacity}" ${dash} />`;
      // Distance label only when LoS connects (grid units = inches)
      if (blocked || line.distanceIn == null) return seg;
      const midX = toPx((line.from.x + line.to.x) / 2);
      const midY = toPx((line.from.y + line.to.y) / 2);
      const text = formatInches(line.distanceIn);
      if (!text) return seg;
      return `${seg}<text x="${midX}" y="${midY}" text-anchor="middle" dominant-baseline="middle" fill="#ff1a1a" stroke="#fff" stroke-width="3.5" paint-order="stroke" font-size="12" font-weight="700">${esc(text)}</text>`;
    })
    .join('')}</g>`;
}

function renderModels(unitsOnMap, selectedUnitKey, selectedModelId, highlights = {}) {
  const mustTest = highlights.mustTestKeys || new Set();
  const shocked = highlights.shockedKeys || new Set();
  const losCanSee = highlights.losCanSeeIds || new Set();
  return Object.entries(unitsOnMap || {})
    .flatMap(([key, entry]) =>
      (entry.models || []).map((m) => {
        const isUnitSel = key === selectedUnitKey;
        const isModelSel = m.id === selectedModelId;
        const fill = entry.player === 'player1' ? '#3b82f6' : '#22c55e';
        const r = toPx(m.radiusIn);
        const cx = toPx(m.x);
        const cy = toPx(m.y);
        const mustTestRing = mustTest.has(key)
          ? `<circle cx="${cx}" cy="${cy}" r="${r + 5}" fill="none" stroke="#5a8fd0" stroke-width="2.5" stroke-dasharray="5 3" pointer-events="none" />`
          : '';
        const shockedRing = shocked.has(key)
          ? `<circle cx="${cx}" cy="${cy}" r="${r + 3.5}" fill="rgba(45, 75, 130, 0.4)" stroke="#5a8fd0" stroke-width="2.5" pointer-events="none" />`
          : '';
        // Clear LoS: models that can shoot this target
        const losRing = losCanSee.has(m.id)
          ? `<circle cx="${cx}" cy="${cy}" r="${r + 4}" fill="none" stroke="#ff1a1a" stroke-width="2.25" pointer-events="none" />`
          : '';
        const ring = isUnitSel
          ? `<circle cx="${cx}" cy="${cy}" r="${r + 2}" fill="none" stroke="#f8fafc" stroke-width="1.5" pointer-events="none" />`
          : '';
        const sel = isModelSel
          ? `<circle cx="${cx}" cy="${cy}" r="${r + 3.5}" fill="none" stroke="#fbbf24" stroke-width="1.5" stroke-dasharray="3 2" pointer-events="none" />`
          : '';
        return `
          <g class="map-model" data-unit-key="${esc(key)}" data-model-id="${esc(m.id)}" data-player="${esc(entry.player)}" data-unit-id="${esc(entry.unitId)}" style="cursor:grab">
            ${mustTestRing}${shockedRing}${losRing}${ring}${sel}
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="#0a0a0a" stroke-width="1.5" />
          </g>`;
      }),
    )
    .join('');
}

function renderSpecialMarkers(markers, selectedModelId) {
  return (markers || [])
    .map((m) => {
      const r = toPx(m.radiusIn || 0.5);
      const sel =
        selectedModelId === m.id
          ? `<circle cx="${toPx(m.x)}" cy="${toPx(m.y)}" r="${r + 3}" fill="none" stroke="#fbbf24" stroke-width="1.5" />`
          : '';
      return `
        <g class="map-special" data-special-id="${esc(m.id)}" style="cursor:grab">
          ${sel}
          <circle cx="${toPx(m.x)}" cy="${toPx(m.y)}" r="${r}" fill="#a855f7" stroke="#fff" stroke-width="1.5" />
          <text x="${toPx(m.x)}" y="${toPx(m.y) - r - 4}" text-anchor="middle" fill="#e9d5ff" font-size="10">${esc(m.name || 'Marker')}</text>
        </g>`;
    })
    .join('');
}

export function renderMapSvg(state, options = {}) {
  const layout = getLayoutById(state.battleMap?.layoutId || 'blank');
  const board = boardSizeForLayout(layout);
  const cam = state.battleMap?.camera || { x: 0, y: 0, zoom: 1 };
  const pad = 8; // inches of off-board staging visible
  const svgW = toPx(board.width + pad * 2);
  const svgH = toPx(board.height + pad * 2);
  const transform = `translate(${toPx(pad + (cam.x || 0))} ${toPx(pad + (cam.y || 0))}) scale(${cam.zoom || 1})`;
  const selectedSpecial = (state.battleMap?.specialMarkers || []).find(
    (m) => m.id === state.battleMap?.selectedModelId,
  );

  return `
    <div class="battle-map-viewport" data-map-viewport="1">
      <div class="battle-map-toolbar">
        <label class="battle-map-layout-label">Layout
          <select data-action="set-map-layout">
            ${(options.layouts || []).map((l) => `<option value="${esc(l.id)}" ${l.id === layout.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}
            <option value="__add_new__">Add new…</option>
          </select>
        </label>
        <button type="button" data-action="map-zoom" data-delta="0.15">Zoom +</button>
        <button type="button" data-action="map-zoom" data-delta="-0.15">Zoom −</button>
        <button type="button" data-action="map-reset-camera">Reset view</button>
        <button type="button" data-action="add-special-marker">Add special marker</button>
        ${
          selectedSpecial
            ? `<button type="button" class="remove-special-btn" data-action="remove-special-marker" data-special-id="${esc(selectedSpecial.id)}">Remove marker</button>`
            : ''
        }
      </div>
      ${options.reminderHtml || ''}
      <div class="battle-map-canvas-wrap">
        <svg class="battle-map-svg" width="100%" height="100%" viewBox="0 0 ${svgW} ${svgH}" data-board-w="${board.width}" data-board-h="${board.height}" data-ppi="${PPI}" data-pad="${pad}">
          <rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#0c0c0c" />
          <g class="battle-map-world" transform="${transform}">
            <rect x="0" y="0" width="${toPx(board.width)}" height="${toPx(board.height)}" fill="#111" stroke="#666" stroke-width="2" />
            ${renderGrid(board.width, board.height)}
            ${renderDeploymentZones(layout.deploymentZones)}
            ${renderTerrainAreas(layout.terrainAreas)}
            ${renderTerrainFeatures(layout.terrainFeatures)}
            ${renderRadii(options.radii)}
            ${renderModels(
              state.battleMap?.unitsOnMap,
              state.battleMap?.selectedUnitKey,
              state.battleMap?.selectedModelId,
              {
                ...(options.modelHighlights || {}),
                losCanSeeIds: new Set(state.battleMap?.losPreview?.canSeeModelIds || []),
              },
            )}
            ${renderSpecialMarkers(state.battleMap?.specialMarkers, state.battleMap?.selectedModelId)}
            ${renderLos(state.battleMap?.losPreview)}
          </g>
        </svg>
      </div>
    </div>`;
}

export function clientToBoardInches(svgEl, clientX, clientY, camera) {
  const rect = svgEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return { x: 0, y: 0 };
  const vb = svgEl.viewBox.baseVal;
  const pad = Number(svgEl.dataset.pad || 8);
  const ppi = Number(svgEl.dataset.ppi || PPI);
  const zoom = camera?.zoom || 1;
  const sx = ((clientX - rect.left) / rect.width) * vb.width;
  const sy = ((clientY - rect.top) / rect.height) * vb.height;
  const x = (sx / ppi - pad - (camera?.x || 0)) / zoom;
  const y = (sy / ppi - pad - (camera?.y || 0)) / zoom;
  return { x, y };
}
