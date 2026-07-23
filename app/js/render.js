import {
  BATTLEFIELD_HEIGHT,
  BATTLEFIELD_WIDTH,
  PHASE_LABELS,
  PIXELS_PER_INCH,
  TURN_PHASES,
} from './constants.js';
import { getMeleeWeapons, getRangedWeapons } from './combat.js';
import { unitIsEngaged, unitIsUnengaged } from './geometry.js';
import { getLosPreview, unitIsVisibleToUnit } from './los.js';
import { calculateObjectiveControl } from './objectives.js';
import { PLAYER_LABELS } from './sampleBattle.js';

const SCALE = PIXELS_PER_INCH;
const toPx = (inches) => inches * SCALE;

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function renderBattlefield(state, dispatch) {
  const width = toPx(BATTLEFIELD_WIDTH);
  const height = toPx(BATTLEFIELD_HEIGHT);

  let losLine = null;
  if (state.showLos && state.selectedUnitId && state.selectedTargetUnitId) {
    const shooter = state.units.find((u) => u.id === state.selectedUnitId);
    const target = state.units.find((u) => u.id === state.selectedTargetUnitId);
    if (shooter && target) {
      const sModel = shooter.models.find((m) => m.woundsRemaining > 0);
      const tModel = target.models.find((m) => m.woundsRemaining > 0);
      if (sModel && tModel) {
        losLine = getLosPreview(sModel, tModel, shooter, target,
          state.battlefield.terrainAreas, state.battlefield.terrainFeatures, state.units);
      }
    }
  }

  const zones = state.battlefield.deploymentZones.map((zone) => `
    <rect x="${toPx(zone.bounds.x)}" y="${toPx(zone.bounds.y)}"
      width="${toPx(zone.bounds.w)}" height="${toPx(zone.bounds.h)}"
      fill="${zone.role === 'attacker' ? 'rgba(59,130,246,0.08)' : 'rgba(239,68,68,0.08)'}"
      stroke="${zone.role === 'attacker' ? 'rgba(59,130,246,0.3)' : 'rgba(239,68,68,0.3)'}"
      stroke-width="1" stroke-dasharray="6 4" />
  `).join('');

  const areas = state.battlefield.terrainAreas.map((area) => {
    const fill = area.isObjective ? 'rgba(234,179,8,0.12)' : area.category === 'dense' ? 'rgba(34,197,94,0.1)' : 'rgba(250,204,21,0.08)';
    const stroke = area.isObjective ? 'rgba(234,179,8,0.5)' : area.category === 'dense' ? 'rgba(34,197,94,0.35)' : 'rgba(250,204,21,0.3)';
    return `
      <g>
        <rect x="${toPx(area.bounds.x)}" y="${toPx(area.bounds.y)}"
          width="${toPx(area.bounds.w)}" height="${toPx(area.bounds.h)}"
          fill="${fill}" stroke="${stroke}" stroke-width="${area.isObjective ? 2 : 1}" rx="2" />
        ${area.label ? `<text x="${toPx(area.bounds.x + area.bounds.w / 2)}" y="${toPx(area.bounds.y + area.bounds.h / 2)}"
          text-anchor="middle" dominant-baseline="middle" fill="rgba(255,255,255,0.35)" font-size="8" font-family="Inter">${esc(area.label)}</text>` : ''}
      </g>`;
  }).join('');

  const solids = state.battlefield.terrainFeatures.filter((f) => f.solid).map((f) => `
    <rect x="${toPx(f.bounds.x)}" y="${toPx(f.bounds.y)}"
      width="${toPx(f.bounds.w)}" height="${toPx(f.bounds.h)}"
      fill="rgba(0,0,0,0.35)" stroke="rgba(34,197,94,0.5)" stroke-width="1" />
  `).join('');

  const losSvg = losLine ? `
    <line x1="${toPx(losLine.from.x)}" y1="${toPx(losLine.from.y)}"
      x2="${toPx(losLine.to.x)}" y2="${toPx(losLine.to.y)}"
      stroke="${losLine.visible ? '#4ade80' : '#ef4444'}" stroke-width="2"
      stroke-dasharray="${losLine.visible ? 'none' : '6 4'}" opacity="0.9" />
  ` : '';

  const models = state.units.flatMap((unit) => unit.models.map((model) => {
    if (model.woundsRemaining <= 0) return '';
    const isSelected = state.selectedUnitId === unit.id || state.selectedModelId === model.id;
    const color = unit.player === 'player1' ? '#3b82f6' : '#22c55e';
    const r = toPx(model.baseRadius);
    return `
      <g data-model-id="${model.id}" data-unit-id="${unit.id}">
        <circle cx="${toPx(model.position.x)}" cy="${toPx(model.position.y)}" r="${r}"
          fill="${color}" fill-opacity="0.35"
          stroke="${isSelected ? '#fbbf24' : color}" stroke-width="${isSelected ? 2.5 : 1.5}" />
        <text x="${toPx(model.position.x)}" y="${toPx(model.position.y)}"
          text-anchor="middle" dominant-baseline="middle" fill="white" font-size="7"
          font-family="Inter" font-weight="600" pointer-events="none">${model.isCharacter ? '★' : '●'}</text>
      </g>`;
  })).join('');

  return `
    <div class="battlefield-wrapper">
      <svg class="battlefield-canvas" viewBox="0 0 ${width} ${height}" id="battlefield-svg">
        <defs>
          <pattern id="grid" width="${toPx(1)}" height="${toPx(1)}" patternUnits="userSpaceOnUse">
            <path d="M ${toPx(1)} 0 L 0 0 0 ${toPx(1)}" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="0.5" />
          </pattern>
        </defs>
        <rect width="${width}" height="${height}" fill="#1a1410" />
        <rect width="${width}" height="${height}" fill="url(#grid)" />
        ${zones}
        <text x="${toPx(2)}" y="${toPx(6)}" fill="rgba(147,197,253,0.6)" font-size="10" font-family="Inter">ATTACKER DEPLOYMENT</text>
        <text x="${toPx(2)}" y="${toPx(56)}" fill="rgba(252,165,165,0.6)" font-size="10" font-family="Inter">DEFENDER DEPLOYMENT</text>
        <text x="${toPx(18)}" y="${toPx(30)}" fill="rgba(255,255,255,0.15)" font-size="12" font-family="Cinzel">NO MAN'S LAND</text>
        ${areas}${solids}${losSvg}${models}
      </svg>
      <div class="battlefield-scale">44" × 60" · 1" = ${SCALE}px</div>
    </div>`;
}

function renderPhaseTracker(state) {
  const currentIdx = TURN_PHASES.indexOf(state.phase);
  const steps = TURN_PHASES.map((phase, i) => {
    const isActive = state.phase === phase;
    const isPast = currentIdx > i && state.gameStarted;
    return `<div class="phase-step ${isActive ? 'active' : ''} ${isPast ? 'done' : ''}">
      <div class="phase-dot"></div>
      <span>${esc(PHASE_LABELS[phase].replace(' Phase', '').replace('Fight — ', ''))}</span>
    </div>`;
  }).join('');

  const activeLabel = state.gameStarted
    ? (state.activePlayer === 'player1' ? 'Ultramarines' : 'Orks')
    : 'Pre-battle';

  return `
    <div class="phase-tracker">
      <div class="phase-header">
        <span class="round-badge">Round ${state.battleRound || '—'} / ${state.maxBattleRounds}</span>
        <span class="active-player">${esc(activeLabel)}</span>
      </div>
      <div class="phase-steps">${steps}</div>
      <div class="current-phase-label">${esc(PHASE_LABELS[state.phase])}</div>
    </div>`;
}

function renderControlPanel(state, dispatch) {
  const selected = state.units.find((u) => u.id === state.selectedUnitId);
  const objectives = calculateObjectiveControl(state.battlefield.terrainAreas, state.units);
  const enemyUnits = state.units.filter((u) => u.player !== state.activePlayer);

  const unitButtons = state.units.map((unit) => {
    const alive = unit.models.filter((m) => m.woundsRemaining > 0).length;
    const isActive = unit.player === state.activePlayer;
    const sel = state.selectedUnitId === unit.id ? 'selected' : '';
    const inact = !isActive ? 'inactive' : '';
    return `<button type="button" class="unit-btn ${sel} ${inact}" data-action="select-unit" data-unit-id="${unit.id}">
      <span class="unit-name">${esc(unit.name)}</span>
      <span class="unit-meta">${esc(PLAYER_LABELS[unit.player].split(' ')[0])} · ${alive}/${unit.startingModelCount}${unit.battleShocked ? ' · Shocked' : ''}</span>
    </button>`;
  }).join('');

  let actions = '';
  if (selected) {
    let actionButtons = '';
    if (state.phase === 'movement' && selected.player === state.activePlayer) {
      actionButtons = `
        <button type="button" data-action="move-type" data-move-type="normal">Normal Move (M")</button>
        <button type="button" data-action="roll-advance">Advance (D6 + M")</button>
        ${unitIsEngaged(selected, enemyUnits) ? '<button type="button" data-action="move-type" data-move-type="fall_back">Fall Back</button>' : ''}
        <button type="button" data-action="remain-stationary">Remain Stationary</button>
        ${state.advanceRoll ? `<p class="hint">Advance roll: +${state.advanceRoll}" — click a model, then click destination</p>` : ''}
        ${state.pendingMoveType && state.pendingMoveType !== 'remain_stationary' ? `<p class="hint">Select a model, then click battlefield to move</p>` : ''}`;
    }
    if (state.phase === 'shooting' && selected.player === state.activePlayer) {
      if (unitIsUnengaged(selected, enemyUnits) && !selected.advancedThisTurn) {
        const targets = enemyUnits.filter((e) => unitIsVisibleToUnit(selected, e,
          state.battlefield.terrainAreas, state.battlefield.terrainFeatures, state.units));
        actionButtons = `<p class="hint">Normal Shooting — select target, then weapon:</p>`;
        actionButtons += targets.map((t) =>
          `<button type="button" class="${state.selectedTargetUnitId === t.id ? 'selected' : ''}" data-action="select-target" data-unit-id="${t.id}">Target: ${esc(t.name)}</button>`
        ).join('');
        if (state.selectedTargetUnitId) {
          actionButtons += getRangedWeapons(selected).map((w) =>
            `<button type="button" data-action="shoot" data-weapon-id="${w.id}">Fire ${esc(w.name)} (R${w.range}", ${w.attacks}A)</button>`
          ).join('');
        }
      } else if (selected.advancedThisTurn) {
        actionButtons = '<p class="hint">Unit advanced — only [ASSAULT] weapons eligible.</p>';
      } else if (unitIsEngaged(selected, enemyUnits)) {
        actionButtons = '<p class="hint">Engaged — use Close-quarters shooting for [CLOSE-QUARTERS] weapons.</p>';
      }
    }
    if (state.phase === 'charge' && selected.player === state.activePlayer) {
      actionButtons = `<p class="hint">Declare charge (within 12" of enemy):</p>`;
      actionButtons += enemyUnits.map((t) =>
        `<button type="button" data-action="declare-charge" data-unit-id="${t.id}">Charge ${esc(t.name)}</button>`
      ).join('');
      if (state.selectedTargetUnitId) actionButtons += '<button type="button" data-action="roll-charge">Roll Charge (2D6)</button>';
      if (state.chargeRoll) actionButtons += `<p class="hint">Charge roll: ${state.chargeRoll}" — move models toward target</p>`;
    }
    if ((state.phase === 'fight' || state.phase === 'fight_pile_in') && selected.player === state.activePlayer) {
      actionButtons = enemyUnits.filter((e) => unitIsEngaged(selected, [e])).map((t) =>
        `<button type="button" class="${state.selectedTargetUnitId === t.id ? 'selected' : ''}" data-action="select-target" data-unit-id="${t.id}">Fight: ${esc(t.name)}</button>`
      ).join('');
      if (state.selectedTargetUnitId) {
        actionButtons += getMeleeWeapons(selected).map((w) =>
          `<button type="button" data-action="fight" data-weapon-id="${w.id}">Attack with ${esc(w.name)}</button>`
        ).join('');
      }
    }
    actions = `<section class="panel-section actions"><h3>Actions — ${esc(selected.name)}</h3><div class="action-group">${actionButtons}</div></section>`;
  }

  const objRows = objectives.map((o) => `
    <div class="objective-row">
      <span>${esc(o.label)}</span>
      <span>${o.controller ? (o.controller === 'player1' ? 'P1' : 'P2') : 'Contested'} (${o.player1OC} vs ${o.player2OC} OC)</span>
    </div>`).join('');

  return `
    <div class="control-panel">
      <section class="panel-section">
        <h3>Command Points</h3>
        <div class="cp-row"><span>P1: ${state.cp.player1} CP</span><span>P2: ${state.cp.player2} CP</span></div>
      </section>
      <section class="panel-section"><h3>Units</h3>${unitButtons}</section>
      ${actions}
      <section class="panel-section"><h3>Objectives</h3>${objRows}</section>
      <section class="panel-section tools">
        <button type="button" class="${state.showLos ? 'active' : ''}" data-action="toggle-los">${state.showLos ? 'Hide' : 'Show'} Line of Sight</button>
        <button type="button" class="primary" data-action="advance-phase">Advance to Next Step →</button>
      </section>
    </div>`;
}

function renderGameLog(state) {
  const entries = [...state.log].reverse().map((e) => `
    <div class="log-entry"><span class="log-meta">R${e.round}</span><span class="log-text">${esc(e.message)}</span></div>
  `).join('');
  return `
    <div class="game-log">
      <h3>Battle Log</h3>
      <div class="log-entries">${entries || '<p class="log-empty">No events yet. Start the battle to begin.</p>'}</div>
    </div>`;
}

export function renderApp(root, state, dispatch) {
  const startBtn = !state.gameStarted
    ? '<button type="button" class="start-btn" data-action="start-game">Begin Battle</button>' : '';
  const gameOver = state.phase === 'game_over' ? '<span class="game-over">Battle Complete</span>' : '';

  root.innerHTML = `
    <div class="app">
      <header class="app-header">
        <div>
          <h1>Warhammer 40,000</h1>
          <p class="subtitle">Tabletop Companion — Core Rules Proof of Concept</p>
        </div>
        ${startBtn}${gameOver}
      </header>
      <div id="phase-tracker">${renderPhaseTracker(state)}</div>
      <main class="app-main">
        <div id="battlefield">${renderBattlefield(state, dispatch)}</div>
        <aside class="sidebar">
          <div id="control-panel">${renderControlPanel(state, dispatch)}</div>
          <div id="game-log">${renderGameLog(state)}</div>
        </aside>
      </main>
      <footer class="app-footer">Based on Warhammer 40,000 Core Rules &amp; Event Companion · 44"×60" battlefield · 5 battle rounds · No Node.js required</footer>
    </div>`;

  bindEvents(root, state, dispatch);
}

function bindEvents(root, state, dispatch) {
  root.querySelector('[data-action="start-game"]')?.addEventListener('click', () => dispatch({ type: 'START_GAME' }));
  root.querySelector('[data-action="advance-phase"]')?.addEventListener('click', () => dispatch({ type: 'ADVANCE_PHASE' }));
  root.querySelector('[data-action="toggle-los"]')?.addEventListener('click', () => dispatch({ type: 'TOGGLE_LOS' }));
  root.querySelector('[data-action="remain-stationary"]')?.addEventListener('click', () => dispatch({ type: 'REMAIN_STATIONARY' }));
  root.querySelector('[data-action="roll-advance"]')?.addEventListener('click', () => dispatch({ type: 'ROLL_ADVANCE' }));
  root.querySelector('[data-action="roll-charge"]')?.addEventListener('click', () => dispatch({ type: 'ROLL_CHARGE' }));

  root.querySelectorAll('[data-action="select-unit"]').forEach((btn) => {
    btn.addEventListener('click', () => dispatch({ type: 'SELECT_UNIT', unitId: btn.dataset.unitId }));
  });
  root.querySelectorAll('[data-action="select-target"]').forEach((btn) => {
    btn.addEventListener('click', () => dispatch({ type: 'SELECT_TARGET', unitId: btn.dataset.unitId }));
  });
  root.querySelectorAll('[data-action="declare-charge"]').forEach((btn) => {
    btn.addEventListener('click', () => dispatch({ type: 'DECLARE_CHARGE', targetUnitId: btn.dataset.unitId }));
  });
  root.querySelectorAll('[data-action="move-type"]').forEach((btn) => {
    btn.addEventListener('click', () => dispatch({ type: 'SET_MOVE_TYPE', moveType: btn.dataset.moveType }));
  });
  root.querySelectorAll('[data-action="shoot"]').forEach((btn) => {
    btn.addEventListener('click', () => dispatch({ type: 'SHOOT', weaponId: btn.dataset.weaponId }));
  });
  root.querySelectorAll('[data-action="fight"]').forEach((btn) => {
    btn.addEventListener('click', () => dispatch({ type: 'FIGHT', weaponId: btn.dataset.weaponId }));
  });

  const svg = root.querySelector('#battlefield-svg');
  if (svg) {
    svg.addEventListener('click', (e) => {
      const rect = svg.getBoundingClientRect();
      const scaleX = svg.viewBox.baseVal.width / rect.width;
      const scaleY = svg.viewBox.baseVal.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX / SCALE;
      const y = (e.clientY - rect.top) * scaleY / SCALE;

      if (state.selectedModelId && (state.phase === 'movement' || state.phase === 'charge')) {
        dispatch({ type: 'MOVE_MODEL', modelId: state.selectedModelId, position: { x, y } });
        return;
      }

      for (const unit of state.units) {
        for (const model of unit.models) {
          if (model.woundsRemaining <= 0) continue;
          const dx = x - model.position.x;
          const dy = y - model.position.y;
          if (Math.sqrt(dx * dx + dy * dy) <= model.baseRadius) {
            dispatch({ type: 'SELECT_UNIT', unitId: unit.id });
            dispatch({ type: 'SELECT_MODEL', modelId: model.id });
            return;
          }
        }
      }
    });
  }
}
