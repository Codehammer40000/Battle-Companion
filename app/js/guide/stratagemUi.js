/**
 * Stratagem deck button + panel UI shared by Companion and Battle Map views.
 */

import { parseStratagemHtml } from './stratagemParser.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

export function renderStratagemsBtn(state, playerKey) {
  const count = state.stratagems?.[playerKey]?.length || 0;
  const open = state.stratagemPanel?.player === playerKey;
  const label = count ? `Stratagems (${count})` : 'Stratagems';
  return `<button type="button" class="stratagems-btn ${open ? 'active' : ''} ${count ? 'has-deck' : ''}" data-action="open-stratagems" data-player="${playerKey}">${esc(label)}</button>`;
}

function renderPhasePips(phases) {
  if (!phases?.length) return '';
  return phases.map((p) => `<span class="strat-phase-pip" title="${esc(p)}">${esc(p[0] || '?')}</span>`).join('');
}

function renderStratagemCard(s) {
  const phases = s.phases?.length
    ? `<div class="strat-card-phases">${s.phases.map((p) => `<span class="strat-phase-tag">${esc(p)}</span>`).join('')}</div>`
    : '';
  const body = s.descriptionHtml
    ? `<div class="strat-card-body">${s.descriptionHtml}</div>`
    : `<div class="strat-card-body">${esc(s.descriptionText)}</div>`;

  return `
    <article class="strat-card turn-${esc(s.turn)}">
      <div class="strat-card-head">
        <div class="strat-card-icon" aria-hidden="true">
          <div class="strat-card-pips">${renderPhasePips(s.phases)}</div>
          <div class="strat-card-cp"><span>${esc(s.cp)}</span></div>
        </div>
        <div class="strat-card-titles">
          <h3 class="strat-card-name">${esc(s.name)}</h3>
          <p class="strat-card-meta">${esc(s.turnLabel)}${s.phases?.length ? ` · ${esc(s.phases.join(', '))}` : ''}</p>
        </div>
      </div>
      ${phases}
      ${body}
    </article>`;
}

export function renderStratagemPanel(state) {
  const panel = state.stratagemPanel;
  if (!panel?.player) return '';

  const playerKey = panel.player;
  const player = state[playerKey];
  const deck = state.stratagems?.[playerKey] || [];
  const armyName = player?.army?.name || player?.name || (playerKey === 'player1' ? 'Player 1' : 'Player 2');
  const sideLabel = playerKey === 'player1' ? 'Player 1' : 'Player 2';

  const cards = deck.length
    ? `<div class="strat-card-list">${deck.map(renderStratagemCard).join('')}</div>`
    : `<div class="strat-empty">
        <p>No stratagem deck loaded for ${esc(sideLabel)}.</p>
        <p class="hint">Export your stratagems as HTML from your army builder, then upload the file here.</p>
      </div>`;

  return `
    <div class="strat-panel-backdrop" data-action="close-stratagems">
      <div class="strat-panel" role="dialog" aria-modal="true" aria-labelledby="strat-panel-title">
        <div class="strat-panel-header">
          <div>
            <h2 id="strat-panel-title">Stratagems</h2>
            <p class="strat-panel-meta">${esc(armyName)} · ${deck.length} stratagem${deck.length === 1 ? '' : 's'}</p>
          </div>
          <button type="button" class="unit-modal-close" data-action="close-stratagems" aria-label="Close">×</button>
        </div>
        <div class="strat-panel-toolbar">
          <label class="file-btn btn-small">
            ${deck.length ? 'Replace deck (.html)' : 'Upload deck (.html)'}
            <input type="file" accept=".html,.htm,text/html" data-action="load-stratagems" data-player="${playerKey}" hidden />
          </label>
          ${deck.length ? `<button type="button" class="btn-small" data-action="clear-stratagems" data-player="${playerKey}">Clear</button>` : ''}
        </div>
        <div class="strat-panel-body">
          ${cards}
        </div>
      </div>
    </div>`;
}

export function bindStratagemEvents(root, dispatch) {
  root.querySelectorAll('[data-action="open-stratagems"]').forEach((btn) => {
    btn.addEventListener('click', () => dispatch({ type: 'OPEN_STRATAGEMS', player: btn.dataset.player }));
  });

  root.querySelectorAll('[data-action="close-stratagems"]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (el.classList.contains('strat-panel-backdrop') && e.target !== el) return;
      dispatch({ type: 'CLOSE_STRATAGEMS' });
    });
  });

  root.querySelector('.strat-panel')?.addEventListener('click', (e) => e.stopPropagation());

  root.querySelectorAll('[data-action="clear-stratagems"]').forEach((btn) => {
    btn.addEventListener('click', () => dispatch({ type: 'CLEAR_STRATAGEMS', player: btn.dataset.player }));
  });

  root.querySelectorAll('input[data-action="load-stratagems"]').forEach((input) => {
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const deck = parseStratagemHtml(String(reader.result || ''));
          dispatch({ type: 'LOAD_STRATAGEMS', player: input.dataset.player, deck });
        } catch (err) {
          alert(err?.message || 'Could not read stratagem HTML.');
        }
        input.value = '';
      };
      reader.onerror = () => {
        alert('Could not read that file.');
        input.value = '';
      };
      reader.readAsText(file);
    });
  });
}
