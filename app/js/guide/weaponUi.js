/**
 * Weapon table + clickable keyword chips for Battle Map unit cards.
 */

import { findKeywordRule } from './rosterParser.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

export function splitKeywordString(keywordStr) {
  if (!keywordStr || keywordStr === '—') return [];
  return String(keywordStr)
    .split(/,\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function renderKeywordChip(keyword, ruleIndex, context) {
  const rule = findKeywordRule(keyword, ruleIndex);
  if (!rule) return `<span class="kw-plain">${esc(keyword)}</span>`;
  return `<button type="button" class="kw-inline-link" data-action="show-keyword-rule" data-player="${context.player}" data-unit-id="${esc(context.unitId)}" data-rule-name="${esc(keyword)}">${esc(keyword)}</button>`;
}

export function renderKeywordList(keywords, ruleIndex, context, separator = ' · ') {
  if (!keywords?.length) return '';
  return keywords
    .map((kw, index) => {
      const chip = renderKeywordChip(kw, ruleIndex, context);
      return index < keywords.length - 1 ? `${chip}${separator}` : chip;
    })
    .join('');
}

export function renderWeaponKeywords(keywordStr, ruleIndex, context) {
  const parts = splitKeywordString(keywordStr);
  if (!parts.length) return '—';
  return parts
    .map((kw, index) => {
      const chip = renderKeywordChip(kw, ruleIndex, context);
      return index < parts.length - 1 ? `${chip}, ` : chip;
    })
    .join('');
}

/**
 * @param {object[]} weapons
 * @param {'ranged'|'melee'} type
 * @param {object} keywordRuleIndex
 * @param {{ player: string, unitId: string } | null} context
 * @param {{ selectableRange?: boolean, selectedWeaponIndex?: number|null }} [options]
 */
export function renderWeaponTable(weapons, type, keywordRuleIndex = {}, context = null, options = {}) {
  if (!weapons?.length) return '';
  const isRanged = type === 'ranged';
  const skillCol = isRanged ? 'BS' : 'WS';
  const selectable = !!options.selectableRange && isRanged && context;
  const selectedIndex = options.selectedWeaponIndex;
  // Datasheet side panels: put keywords on a full-width row so Blast / [CLOSE-QUARTERS] etc. stay readable
  const keywordsBelow = !!options.keywordsBelow;
  const colCount = keywordsBelow ? 7 : 8;

  const rows = weapons
    .map((w, i) => {
      const skill = isRanged ? w.bs : w.ws;
      const range = isRanged ? w.range : 'Melee';
      const kwParts = splitKeywordString(w.keywords);
      const kwCell = context
        ? renderWeaponKeywords(w.keywords, keywordRuleIndex, context)
        : esc(w.keywords || '—');
      const hasKeywords = kwParts.length > 0;
      let nameCell = `<td class="weapon-name">${esc(w.name)}</td>`;
      if (selectable) {
        const active = selectedIndex === i ? 'is-weapon-selected' : '';
        nameCell = `<td class="weapon-name">
          <button type="button" class="weapon-range-btn ${active}" data-action="map-select-weapon" data-player="${context.player}" data-unit-id="${esc(context.unitId)}" data-weapon-index="${i}" title="Show this weapon's range on the map">${esc(w.name)}</button>
        </td>`;
      }
      const selectedClass = selectable && selectedIndex === i ? 'weapon-row-selected' : '';
      const statsRow = `
      <tr class="${selectedClass}">
        ${nameCell}
        <td>${esc(range)}</td>
        <td>${esc(w.a)}</td>
        <td>${esc(skill)}</td>
        <td>${esc(w.s)}</td>
        <td>${esc(w.ap)}</td>
        <td>${esc(w.d)}</td>
        ${keywordsBelow ? '' : `<td class="weapon-kw">${kwCell}</td>`}
      </tr>`;
      if (!keywordsBelow || !hasKeywords) return statsRow;
      return `${statsRow}
      <tr class="weapon-kw-row ${selectedClass}"><td colspan="${colCount}" class="weapon-kw">${kwCell}</td></tr>`;
    })
    .join('');

  return `
    <table class="weapon-table ${keywordsBelow ? 'weapon-table-stacked-kw' : ''}">
      <thead>
        <tr>
          <th>Weapon</th>
          <th>Rng</th>
          <th>A</th>
          <th>${skillCol}</th>
          <th>S</th>
          <th>AP</th>
          <th>D</th>
          ${keywordsBelow ? '' : '<th>Keywords</th>'}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

export function renderKeywordRulePopover(state) {
  const pop = state.keywordRulePopup;
  if (!pop) return '';
  return `
    <div class="keyword-rule-popover-backdrop" data-action="close-keyword-rule">
      <div class="keyword-rule-popover" role="dialog" aria-labelledby="keyword-rule-title">
        <button type="button" class="keyword-rule-popover-close" data-action="close-keyword-rule" aria-label="Close">×</button>
        <h4 id="keyword-rule-title">${esc(pop.name)}</h4>
        <p>${esc(pop.description)}</p>
      </div>
    </div>`;
}
