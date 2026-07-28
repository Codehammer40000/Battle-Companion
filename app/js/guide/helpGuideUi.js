/**
 * In-app Instructions / Guides panel — searchable, shared by Companion + Battle Map.
 */

import { HELP_GUIDE_SECTIONS, searchHelpGuide } from './helpGuideData.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

/** Compact grey ? control used on toolbars / pages. */
export function renderHelpQuestionBtn(extraClass = '') {
  return `<button type="button" class="help-q-btn ${esc(extraClass)}" data-action="open-help-guide" title="Instructions / Guides" aria-label="Open instructions and guides">?</button>`;
}

/** Home landing CTA: ? + “Read Full Instructions/Guides”. */
export function renderHelpGuideCta() {
  return `
    <button type="button" class="help-guide-cta" data-action="open-help-guide">
      <span class="help-q-btn help-q-btn-inline" aria-hidden="true">?</span>
      <span class="help-guide-cta-label">Read Full Instructions/Guides</span>
    </button>`;
}

function renderHelpItem(item) {
  const paras = (item.body || []).map((p) => `<li>${esc(p)}</li>`).join('');
  return `
    <article class="help-item" id="help-item-${esc(item.id)}" data-help-item="${esc(item.id)}">
      <h4 class="help-item-title">${esc(item.title)}</h4>
      <ul class="help-item-bullets">${paras}</ul>
    </article>`;
}

function renderHelpSection(section) {
  if (!section.items?.length) return '';
  return `
    <section class="help-section" id="help-section-${esc(section.id)}" data-help-section="${esc(section.id)}">
      <header class="help-section-header">
        <h3>${esc(section.title)}</h3>
        ${section.blurb ? `<p class="help-section-blurb">${esc(section.blurb)}</p>` : ''}
      </header>
      <div class="help-section-items">
        ${section.items.map(renderHelpItem).join('')}
      </div>
    </section>`;
}

export function renderHelpGuidePanel(state) {
  const panel = state.helpGuide;
  if (!panel?.open) return '';

  const query = panel.query || '';
  const sections = searchHelpGuide(query);
  const jumpLinks = HELP_GUIDE_SECTIONS.map(
    (s) =>
      `<button type="button" class="help-jump ${panel.sectionId === s.id ? 'active' : ''}" data-action="help-jump-section" data-section="${esc(s.id)}">${esc(s.title)}</button>`,
  ).join('');

  const body = sections.length
    ? sections.map(renderHelpSection).join('')
    : `<p class="help-empty">No matching topics. Try “upload”, “stratagems”, “layout”, or “LoS”.</p>`;

  return `
    <div class="help-guide-backdrop" data-action="close-help-guide">
      <div class="help-guide-panel" role="dialog" aria-modal="true" aria-labelledby="help-guide-title">
        <div class="help-guide-header">
          <div>
            <h2 id="help-guide-title">Instructions / Guides</h2>
            <p class="help-guide-sub">Searchable help for General setup, Companion, and Battle Map.</p>
          </div>
          <button type="button" class="unit-modal-close" data-action="close-help-guide" aria-label="Close">×</button>
        </div>
        <div class="help-guide-toolbar">
          <label class="help-search-label">
            <span class="visually-hidden">Search instructions</span>
            <input type="search" class="help-search-input" data-action="help-guide-search" placeholder="Search instructions…" value="${esc(query)}" autocomplete="off" />
          </label>
          <div class="help-jump-row" role="navigation" aria-label="Guide sections">
            ${jumpLinks}
          </div>
        </div>
        <div class="help-guide-body" data-help-scroll="1">
          ${body}
        </div>
      </div>
    </div>`;
}

export function bindHelpGuideEvents(root, dispatch) {
  root.querySelectorAll('[data-action="open-help-guide"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dispatch({ type: 'OPEN_HELP_GUIDE' });
    });
  });

  root.querySelectorAll('[data-action="close-help-guide"]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (el.classList.contains('help-guide-backdrop') && e.target !== el) return;
      dispatch({ type: 'CLOSE_HELP_GUIDE' });
    });
  });

  root.querySelector('.help-guide-panel')?.addEventListener('click', (e) => e.stopPropagation());

  const search = root.querySelector('[data-action="help-guide-search"]');
  if (search) {
    search.addEventListener('input', () => {
      dispatch({ type: 'SET_HELP_GUIDE_QUERY', query: search.value });
    });
    // Keep focus after re-render
    if (document.activeElement === search || search.dataset.keepFocus === '1') {
      requestAnimationFrame(() => {
        const again = root.querySelector('[data-action="help-guide-search"]');
        if (again) {
          again.focus();
          const len = again.value.length;
          again.setSelectionRange(len, len);
        }
      });
    }
    search.addEventListener('focus', () => {
      search.dataset.keepFocus = '1';
    });
    search.addEventListener('blur', () => {
      search.dataset.keepFocus = '0';
    });
  }

  root.querySelectorAll('[data-action="help-jump-section"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.section;
      dispatch({ type: 'SET_HELP_GUIDE_SECTION', sectionId: id });
      requestAnimationFrame(() => {
        const safe = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
        const el = root.querySelector(`#help-section-${safe}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  });
}
