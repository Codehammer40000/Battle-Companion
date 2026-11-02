/**
 * Battle Sim alternate view — map-focused UI sharing guide state.
 */

import {
  getCurrentStep,
  totalScore,
  isUnitDead,
  getUnitWoundsTaken,
  getRemainingModels,
  getUnitWoundCapacity,
  isCombatActionStep,
  findUnitInArmy,
  getUnitGroupInfo,
  getCombatDisplayUnits,
  unitIsSupport,
  unitCanLead,
  getLeadersOnBodyguard,
  isGroupBattleShocked,
  getBattleShockActivePlayer,
  groupMustTakeBattleShockTest,
} from '../guide/guideState.js';
import { getAllAbilitiesForStep } from '../guide/abilityMapper.js';
import { getUnitDisplayAbilities, buildKeywordRuleIndex } from '../guide/rosterParser.js';
import { renderWeaponTable, renderKeywordRulePopover } from '../guide/weaponUi.js';
import { renderStratagemsBtn, renderStratagemPanel, bindStratagemEvents } from '../guide/stratagemUi.js';
import { renderHelpQuestionBtn, renderHelpGuidePanel, bindHelpGuideEvents } from '../guide/helpGuideUi.js';
import { BATTLE_LAYOUTS, getAllLayouts, getLayoutById } from './layouts.js';
import {
  beginImportSession,
  clearImportSession,
  commitImportSession,
  deleteCustomLayout,
  getImportSession,
  loadCustomLayouts,
  readFilesAsText,
} from './layoutImport.js';
import {
  mapUnitKey,
  parseMapUnitKey,
  modelBelongsToUnit,
  migrateBattleMapModelIds,
} from './battleMapState.js';
import { renderMapSvg, clientToBoardInches, getPixelsPerInch } from './mapView.js';

/** Which army drawers are open — survives remounts. */
const openArmyDrawers = new Set();
let armyDrawersBootstrapped = false;

function bootstrapArmyDrawers(state) {
  if (armyDrawersBootstrapped) return;
  armyDrawersBootstrapped = true;
  for (const key of ['player1', 'player2']) {
    // Pre-game or missing army: open so load/deploy is obvious. In battle: closed for map space.
    if (!state.started || !state[key]?.army) openArmyDrawers.add(key);
  }
}

function isArmyDrawerOpen(playerKey, state) {
  bootstrapArmyDrawers(state);
  return openArmyDrawers.has(playerKey);
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function renderScoreCell(player, field, label, value, playerKey) {
  return `
    <div class="score-cell">
      <span class="score-label">${label}</span>
      <div class="score-controls">
        <button type="button" class="ui-icon-btn" data-action="score" data-player="${playerKey}" data-field="${field}" data-delta="-1" aria-label="Decrease ${label}">−</button>
        <span class="score-value" data-score-player="${playerKey}" data-score-field="${field}">${value}</span>
        <button type="button" class="ui-icon-btn" data-action="score" data-player="${playerKey}" data-field="${field}" data-delta="1" aria-label="Increase ${label}">+</button>
      </div>
    </div>`;
}

function renderBattleReadyBtn(state, playerKey) {
  const active = !!state.battleReady?.[playerKey];
  return `<button type="button" class="ui-btn ui-btn-ghost battle-ready-btn ${active ? 'active' : ''}" data-action="toggle-battle-ready" data-player="${playerKey}" title="Battle Ready Army (+10 Primary)">${active ? 'Ready ✓' : 'Ready'}</button>`;
}

function renderFirstTurnBadge(state, key) {
  return state.firstPlayer === key ? '<span class="first-turn-badge">1st</span>' : '';
}

function renderArmyDrawerToggle(state, playerKey) {
  const open = isArmyDrawerOpen(playerKey, state);
  const short = playerKey === 'player1' ? 'P1' : 'P2';
  const needsLoad = !state[playerKey]?.army;
  const label = needsLoad ? `${short} Load` : `${short} Army`;
  return `<button type="button" class="ui-btn ui-btn-ghost army-drawer-toggle ${open ? 'is-active' : ''} ${needsLoad ? 'needs-attention' : ''}" data-action="toggle-army-drawer" data-player="${playerKey}" aria-pressed="${open ? 'true' : 'false'}">${esc(label)}</button>`;
}

function renderSimChrome(state) {
  const p1 = state.player1;
  const p2 = state.player2;
  const step = getCurrentStep(state);
  const turnLabel = state.started
    ? step?.turnLabel || ''
    : p1.army && p2.army
      ? 'Choose who goes first'
      : 'Load armies to begin';
  const phaseLabel = state.started ? step?.label || '' : '';

  return `
    <header class="sim-chrome">
      <div class="sim-chrome-scores">
        <div class="score-player score-left">
          <div class="score-player-name">${esc(p1.army?.name || p1.name)}${renderFirstTurnBadge(state, 'player1')}</div>
          <div class="score-row">
            ${renderScoreCell(p1, 'cp', 'CP', p1.score.cp, 'player1')}
            ${renderScoreCell(p1, 'secondary', 'Sec', p1.score.secondary, 'player1')}
            ${renderScoreCell(p1, 'primary', 'Prim', p1.score.primary, 'player1')}
            <div class="score-cell score-total-cell">
              <span class="score-label">Total</span>
              <span class="score-total" data-score-total="player1">${totalScore(p1.score)}</span>
            </div>
          </div>
          <div class="score-player-actions">
            ${renderArmyDrawerToggle(state, 'player1')}
            ${renderStratagemsBtn(state, 'player1')}
            ${renderBattleReadyBtn(state, 'player1')}
          </div>
        </div>
        <div class="score-center">
          <div class="sim-brand">Battle Map</div>
          <div class="turn-display">${esc(turnLabel)}</div>
          ${
            state.started
              ? `<div class="sim-step-nav">
            <button type="button" class="ui-icon-btn" data-action="prev-step" ${state.stepIndex === 0 ? 'disabled' : ''} aria-label="Previous step">←</button>
            <span class="step-counter" title="${esc(phaseLabel)}">${esc(phaseLabel)}</span>
            <button type="button" class="ui-icon-btn" data-action="next-step" ${state.stepIndex >= state.flow.length - 1 ? 'disabled' : ''} aria-label="Next step">→</button>
          </div>`
              : ''
          }
        </div>
        <div class="score-player score-right">
          <div class="score-player-name">${renderFirstTurnBadge(state, 'player2')}${esc(p2.army?.name || p2.name)}</div>
          <div class="score-row score-row-mirror">
            <div class="score-cell score-total-cell">
              <span class="score-label">Total</span>
              <span class="score-total" data-score-total="player2">${totalScore(p2.score)}</span>
            </div>
            ${renderScoreCell(p2, 'primary', 'Prim', p2.score.primary, 'player2')}
            ${renderScoreCell(p2, 'secondary', 'Sec', p2.score.secondary, 'player2')}
            ${renderScoreCell(p2, 'cp', 'CP', p2.score.cp, 'player2')}
          </div>
          <div class="score-player-actions score-player-actions-mirror">
            ${renderBattleReadyBtn(state, 'player2')}
            ${renderStratagemsBtn(state, 'player2')}
            ${renderArmyDrawerToggle(state, 'player2')}
          </div>
        </div>
      </div>
      <div class="sim-chrome-tools">
        ${renderHelpQuestionBtn('help-q-btn-chrome')}
        <button type="button" class="ui-btn ui-btn-ghost" data-action="save-game">Save</button>
        <button type="button" class="ui-btn ui-btn-danger" data-action="reset-game">Reset</button>
      </div>
    </header>`;
}

function renderNewRecruitHint() {
  return `<p class="hint newrecruit-hint">Upload Army JSON from New Recruit. Create/export as JSON <a class="external-link" href="https://www.newrecruit.eu" target="_blank" rel="noopener noreferrer">here</a>.</p>`;
}

function renderSimPregame(state) {
  if (state.started) return '';
  const canStart = !!(state.player1.army && state.player2.army);
  return `
    <div class="sim-pregame">
      <div class="sim-pregame-inner">
        <h3>Start battle</h3>
        <p class="sim-pregame-hint">Open <strong>P1 Load</strong> / <strong>P2 Load</strong> above, pick who goes first, then begin. The map stays full-screen underneath.</p>
        <div class="first-turn-picker sim-first-turn">
          <h4>Who goes first?</h4>
          <div class="first-turn-options">
            <button type="button" class="first-turn-btn ${state.firstPlayer === 'player1' ? 'selected' : ''}" data-action="set-first-player" data-player="player1" ${state.player1.army ? '' : 'disabled'}>
              <span class="first-turn-side">Left</span>
              <strong>${esc(state.player1.army?.name || 'Player 1')}</strong>
            </button>
            <button type="button" class="first-turn-btn ${state.firstPlayer === 'player2' ? 'selected' : ''}" data-action="set-first-player" data-player="player2" ${state.player2.army ? '' : 'disabled'}>
              <span class="first-turn-side">Right</span>
              <strong>${esc(state.player2.army?.name || 'Player 2')}</strong>
            </button>
          </div>
        </div>
        <button type="button" class="ui-btn ui-btn-primary btn-primary" data-action="start-game" ${canStart ? '' : 'disabled'}>
          ${canStart ? 'Begin Battle' : 'Load both armies first'}
        </button>
      </div>
    </div>`;
}

function renderSimLeaderAttach(unit, playerKey, armyUnits, state) {
  if (!unitCanLead(unit)) return '';
  const attachedId = state.leaderAttachments?.[playerKey]?.[unit.id] || '';
  const label = unitIsSupport(unit) ? 'Support:' : 'Leading:';
  const options = armyUnits
    .filter((other) => other.id !== unit.id)
    .map(
      (other) =>
        `<option value="${esc(other.id)}" ${other.id === attachedId ? 'selected' : ''}>${esc(other.name)}</option>`,
    )
    .join('');
  return `<label class="leader-attach sim-leader-attach">
    <em class="leader-label">${label}</em>
    <select class="leader-select" data-action="set-leader-attach" data-player="${playerKey}" data-leader-id="${esc(unit.id)}">
      <option value="">—</option>
      ${options}
    </select>
  </label>`;
}

function renderSimArmyList(state, playerKey) {
  const player = state[playerKey];
  const army = player?.army;
  const sideLabel = playerKey === 'player1' ? 'Player 1' : 'Player 2';
  const side = playerKey === 'player1' ? 'left' : 'right';
  const open = isArmyDrawerOpen(playerKey, state) ? 'is-open' : '';

  if (!army) {
    return `
      <aside class="sim-army-drawer sim-army-panel army-empty ${side} ${open}" data-player="${playerKey}" aria-hidden="${open ? 'false' : 'true'}">
        <div class="army-panel-header">
          <div>
            <h3>${sideLabel}</h3>
            <p class="army-meta">No army loaded</p>
          </div>
          <div class="army-panel-header-actions">
            <button type="button" class="ui-icon-btn" data-action="toggle-army-drawer" data-player="${playerKey}" aria-label="Close army panel">×</button>
          </div>
        </div>
        <div class="sim-army-panel-body">
          <label class="file-btn ui-btn ui-btn-primary">
            Load Army (.json)
            <input type="file" accept=".json,application/json" data-action="load-army" data-player="${playerKey}" hidden />
          </label>
          ${renderNewRecruitHint()}
        </div>
      </aside>`;
  }

  const attachments = state.leaderAttachments?.[playerKey] || {};
  const selected = parseMapUnitKey(state.battleMap?.selectedUnitKey);
  const units = army.units
    .map((u) => {
      const dead = isUnitDead(state, playerKey, u.id);
      const group = getUnitGroupInfo(army, attachments, u.id);
      const mapKey = mapUnitKey(playerKey, group.groupId);
      const onMap = !!state.battleMap?.unitsOnMap?.[mapKey];
      const woundsTaken = getUnitWoundsTaken(state, playerKey, u.id);
      const remaining = getRemainingModels(u, woundsTaken);
      const attachedToId = attachments[u.id];
      const attachedTo = attachedToId ? army.units.find((x) => x.id === attachedToId) : null;
      const ledBy = getLeadersOnBodyguard(attachments, u.id)
        .map((id) => army.units.find((x) => x.id === id)?.name)
        .filter(Boolean);
      const attachHint = attachedTo
        ? unitIsSupport(u)
          ? `Supporting ${attachedTo.name}`
          : `Leading ${attachedTo.name}`
        : ledBy.length
          ? `With ${ledBy.join(', ')}`
          : '';
      const baseHint = u.baseLabel ? ` · ${u.baseLabel}` : '';
      const sel =
        selected?.player === playerKey &&
        (selected?.unitId === u.id || selected?.unitId === group.groupId)
          ? 'selected'
          : '';
      return `
        <div class="sim-unit-row ${dead ? 'is-dead' : ''} ${sel}" data-unit-key="${esc(mapUnitKey(playerKey, u.id))}">
          <button type="button" class="sim-unit-select" data-action="map-select-unit" data-player="${playerKey}" data-unit-id="${esc(u.id)}">
            <strong>${esc(u.name)}</strong>
            <span class="sim-unit-meta">${remaining}${baseHint}${attachHint ? ` · ${esc(attachHint)}` : ''} · ${esc(u.statsLine || '')}</span>
          </button>
          <button type="button" class="ui-btn ui-btn-tiny ${onMap ? 'withdraw-btn' : 'deploy-btn'}" data-action="${onMap ? 'map-withdraw-unit' : 'map-deploy-unit'}" data-player="${playerKey}" data-unit-id="${esc(u.id)}" ${dead ? 'disabled' : ''} title="${onMap ? 'Withdraw from map' : 'Deploy to map'}">
            ${onMap ? 'Withdraw' : 'Deploy'}
          </button>
        </div>`;
    })
    .join('');

  return `
    <aside class="sim-army-drawer sim-army-panel ${side} ${open}" data-player="${playerKey}" aria-hidden="${open ? 'false' : 'true'}">
      <div class="army-panel-header">
        <div>
          <h3>${esc(army.name)}</h3>
          <p class="army-meta">${esc(army.faction)} · ${army.points}${army.pointsLimit ? `/${army.pointsLimit}` : ''} pts</p>
        </div>
        <div class="army-panel-header-actions">
          <label class="ui-btn ui-btn-ghost ui-btn-tiny file-btn">
            Replace
            <input type="file" accept=".json,application/json" data-action="load-army" data-player="${playerKey}" hidden />
          </label>
          <button type="button" class="ui-btn ui-btn-ghost ui-btn-tiny" data-action="clear-army" data-player="${playerKey}">Clear</button>
          <button type="button" class="ui-icon-btn" data-action="toggle-army-drawer" data-player="${playerKey}" aria-label="Close army panel">×</button>
        </div>
      </div>
      <div class="sim-army-panel-body">
        <div class="sim-unit-list">${units}</div>
        ${renderSimUnitCard(state, playerKey)}
        ${renderSimCombatOverlay(state, playerKey)}
      </div>
    </aside>`;
}

function renderSimWeaponBlocks(unit, playerKey, selectedWeapon, selectableRange, army) {
  const keywordRuleIndex = buildKeywordRuleIndex(unit, army);
  const kwContext = { player: playerKey, unitId: unit.id };
  const selectedIndex =
    selectedWeapon?.unitId === unit.id && Number.isInteger(selectedWeapon.weaponIndex)
      ? selectedWeapon.weaponIndex
      : null;
  const ranged = unit.rangedWeapons?.length
    ? `<div class="combat-weapons-block">
        <h5>Ranged${selectableRange ? ' <span class="hint-inline">(click weapon name for range)</span>' : ''}</h5>
        ${renderWeaponTable(unit.rangedWeapons, 'ranged', keywordRuleIndex, kwContext, {
          selectableRange: !!selectableRange,
          selectedWeaponIndex: selectedIndex,
        })}
      </div>`
    : '';
  const melee = unit.meleeWeapons?.length
    ? `<div class="combat-weapons-block">
        <h5>Melee</h5>
        ${renderWeaponTable(unit.meleeWeapons, 'melee', keywordRuleIndex, kwContext)}
      </div>`
    : '';
  return { ranged, melee };
}

function renderSimShockBtn(state, playerKey, unitId) {
  const army = state[playerKey]?.army;
  if (!army) return '';
  const attachments = state.leaderAttachments?.[playerKey] || {};
  const group = getUnitGroupInfo(army, attachments, unitId);
  if (isUnitDead(state, playerKey, unitId)) return '';
  const shocked = isGroupBattleShocked(state, playerKey, group.groupId);
  return `<button type="button" class="unit-shock-btn ${shocked ? 'shocked' : ''}" data-action="toggle-battle-shock" data-player="${playerKey}" data-group-id="${esc(group.groupId)}">BattleShocked</button>`;
}

function collectModelHighlights(state) {
  const mustTestKeys = new Set();
  const shockedKeys = new Set();
  const unitsOnMap = state.battleMap?.unitsOnMap || {};
  const activeShockPlayer = getBattleShockActivePlayer(state);

  for (const [key, entry] of Object.entries(unitsOnMap)) {
    const army = state[entry.player]?.army;
    if (!army) continue;
    const attachments = state.leaderAttachments?.[entry.player] || {};
    const group = getUnitGroupInfo(army, attachments, entry.unitId);
    if (isGroupBattleShocked(state, entry.player, group.groupId)) {
      shockedKeys.add(key);
    }
    if (
      activeShockPlayer === entry.player &&
      groupMustTakeBattleShockTest(state, entry.player, group, army)
    ) {
      mustTestKeys.add(key);
    }
  }
  return { mustTestKeys, shockedKeys };
}

function renderSimUnitCard(state, playerKey) {
  const step = getCurrentStep(state);
  if (isCombatActionStep(step) && state.combat?.active && state.combat.active.player === playerKey) return '';
  if (isCombatActionStep(step) && state.combat?.target && state.combat.target.player === playerKey) return '';

  const selected = parseMapUnitKey(state.battleMap?.selectedUnitKey);
  if (!selected || selected.player !== playerKey) return '';
  const attachments = state.leaderAttachments?.[playerKey] || {};
  const units = getCombatDisplayUnits(state[playerKey]?.army, attachments, selected.unitId);
  if (!units.length) return '';

  const selectedWeapon = state.battleMap?.selectedWeapon || null;
  const blocks = units
    .map((unit) => {
      const woundsTaken = getUnitWoundsTaken(state, playerKey, unit.id);
      const remaining = getRemainingModels(unit, woundsTaken);
      const woundCap = getUnitWoundCapacity(unit);
      const abilities = getUnitDisplayAbilities(unit)
        .slice(0, 6)
        .map(
          (a) => `
      <div class="combat-ability-item">
        <strong>${esc(a.name)}</strong>
        <p>${esc(a.description)}</p>
      </div>`,
        )
        .join('');
      const army = state[playerKey]?.army;
      const { ranged, melee } = renderSimWeaponBlocks(unit, playerKey, selectedWeapon, true, army);
      const roleTag = unit.isLeader ? 'Leader' : unitIsSupport(unit) ? 'Support' : '';
      const attachedToId = attachments[unit.id];
      const attachedTo = attachedToId ? army?.units?.find((x) => x.id === attachedToId) : null;
      const attachLine = attachedTo
        ? `<p class="combat-unit-attach">${unitIsSupport(unit) ? 'Supporting' : 'Leading'} ${esc(attachedTo.name)}</p>`
        : '';
      const leaderAttach = renderSimLeaderAttach(unit, playerKey, army?.units || [], state);
      return `
      <div class="combat-unit-block">
        <div class="combat-unit-header">
          <h3>${esc(unit.name)}${roleTag ? ` <span class="combat-role-tag">${roleTag}</span>` : ''}</h3>
          <p class="combat-unit-meta">${remaining} models · ${woundsTaken}/${woundCap} wounds${unit.baseLabel ? ` · ${esc(unit.baseLabel)}` : ''}</p>
          ${leaderAttach}
          ${attachLine}
          ${unit.statsLine ? `<p class="combat-unit-stats">${esc(unit.statsLine)}</p>` : ''}
        </div>
        <div class="combat-wounds-row">
          <span class="combat-wounds-label">Wounds</span>
          <div class="combat-wounds-controls">
            <button type="button" data-action="adjust-unit-wounds" data-player="${playerKey}" data-unit-id="${esc(unit.id)}" data-delta="-1">−</button>
            <span class="combat-wounds-value">${woundsTaken}</span>
            <button type="button" data-action="adjust-unit-wounds" data-player="${playerKey}" data-unit-id="${esc(unit.id)}" data-delta="1">+</button>
          </div>
          <span class="combat-wounds-cap">/ ${woundCap}</span>
          ${renderSimShockBtn(state, playerKey, unit.id)}
        </div>
        ${ranged || ''}
        ${melee || ''}
        ${abilities ? `<details class="combat-collapsed"><summary>Abilities</summary>${abilities}</details>` : ''}
      </div>`;
    })
    .join('');

  return `
    <div class="combat-overlay combat-overlay-selected">
      <button type="button" class="combat-overlay-close" data-action="map-clear-selection" aria-label="Close">×</button>
      <div class="combat-overlay-body">${blocks}</div>
    </div>`;
}

function renderSimCombatOverlay(state, playerKey) {
  const step = getCurrentStep(state);
  if (!isCombatActionStep(step) || !state.combat) return '';

  const army = state[playerKey]?.army;
  if (!army) return '';
  const attachments = state.leaderAttachments?.[playerKey] || {};

  let unitId = null;
  let variant = '';
  if (state.combat.active?.player === playerKey && state.combat.active.unitId) {
    unitId = state.combat.active.unitId;
    variant = 'combat-overlay-active';
  } else if (state.combat.target?.player === playerKey && state.combat.target.unitId) {
    unitId = state.combat.target.unitId;
    variant = 'combat-overlay-target';
  }
  if (!unitId) return '';

  const units = getCombatDisplayUnits(army, attachments, unitId);
  if (!units.length) return '';

  const selectedWeapon = state.battleMap?.selectedWeapon || null;
  // Only the controlling unit can pick a weapon for range rings — never the target (map clutter)
  const showWeaponPick = variant === 'combat-overlay-active';
  const blocks = units
    .map((unit) => {
      const woundsTaken = getUnitWoundsTaken(state, playerKey, unit.id);
      const remaining = getRemainingModels(unit, woundsTaken);
      const woundCap = getUnitWoundCapacity(unit);
      const abilities = getUnitDisplayAbilities(unit)
        .map(
          (a) => `
        <div class="combat-ability-item"><strong>${esc(a.name)}</strong><p>${esc(a.description)}</p></div>`,
        )
        .join('');
      const { ranged, melee } = renderSimWeaponBlocks(
        unit,
        playerKey,
        selectedWeapon,
        showWeaponPick,
        army,
      );
      const roleTag = unit.isLeader ? 'Leader' : unitIsSupport(unit) ? 'Support' : '';
      return `
      <div class="combat-unit-block">
        <div class="combat-unit-header">
          <h3>${esc(unit.name)}${roleTag ? ` <span class="combat-role-tag">${roleTag}</span>` : ''}</h3>
          <p class="combat-unit-meta">${remaining} models · ${woundsTaken}/${woundCap} wounds · ${unit.points} pts${unit.baseLabel ? ` · ${esc(unit.baseLabel)}` : ''}</p>
          ${unit.statsLine ? `<p class="combat-unit-stats">${esc(unit.statsLine)}</p>` : ''}
        </div>
        <div class="combat-wounds-row">
          <span class="combat-wounds-label">Wounds</span>
          <div class="combat-wounds-controls">
            <button type="button" data-action="adjust-unit-wounds" data-player="${playerKey}" data-unit-id="${esc(unit.id)}" data-delta="-1">−</button>
            <span class="combat-wounds-value">${woundsTaken}</span>
            <button type="button" data-action="adjust-unit-wounds" data-player="${playerKey}" data-unit-id="${esc(unit.id)}" data-delta="1">+</button>
          </div>
          <span class="combat-wounds-cap">/ ${woundCap}</span>
          ${renderSimShockBtn(state, playerKey, unit.id)}
        </div>
        ${ranged || ''}
        ${melee || ''}
        ${abilities ? `<details class="combat-collapsed"><summary>Abilities</summary>${abilities}</details>` : ''}
      </div>`;
    })
    .join('');

  const closeAction = variant === 'combat-overlay-active' ? 'combat-select-active' : 'combat-select-target';
  return `
    <div class="combat-overlay ${variant}">
      <button type="button" class="combat-overlay-close" data-action="${closeAction}" data-unit-id="${esc(unitId)}" aria-label="Close">×</button>
      <div class="combat-overlay-body">${blocks}</div>
    </div>`;
}

function parseMoveInches(statsLine, stats) {
  if (stats?.M) {
    const n = parseFloat(String(stats.M).replace(/[^0-9.]/g, ''));
    if (!Number.isNaN(n)) return n;
  }
  const m = String(statsLine || '').match(/M\s*([0-9]+(?:\.[0-9]+)?)/i);
  return m ? parseFloat(m[1]) : 6;
}

function parseWeaponRange(rangeStr) {
  const m = String(rangeStr || '').match(/([0-9]+)/);
  return m ? parseFloat(m[1]) : 0;
}

function getSelectedRadii(state) {
  const step = getCurrentStep(state);
  const bm = state.battleMap;
  if (!bm) return [];

  const phase = step?.phase || '';
  const stepId = String(step?.id || '');
  const isShootStep = phase === 'shooting' || stepId.includes('-shoot');
  const isShootAction = isCombatActionStep(step) && isShootStep;
  const isFightAction = isCombatActionStep(step) && stepId.endsWith('-fight');
  const stepPlayerKey = step?.player === 'p1' ? 'player1' : step?.player === 'p2' ? 'player2' : null;

  // Shoot/Fight: keep radii on the controlling (active) unit while clicking targets.
  // Move / charge / pile-in / consolidate: follow map selection (enemy radii OK).
  let entry = null;
  let model = null;
  let groupUnitId = null;

  if ((isShootAction || isFightAction) && state.combat?.active) {
    const active = state.combat.active;
    const key = mapUnitKey(active.player, active.unitId);
    entry = bm.unitsOnMap?.[key] || null;
    if (!entry?.models?.length) return [];
    model =
      entry.models.find((m) => m.id === bm.selectedModelId) ||
      entry.models.find((m) => modelBelongsToUnit(m, active.unitId)) ||
      entry.models[0];
    groupUnitId = active.unitId;
  } else {
    if (!bm.selectedUnitKey || !bm.selectedModelId) return [];
    entry = bm.unitsOnMap?.[bm.selectedUnitKey];
    model = entry?.models?.find((m) => m.id === bm.selectedModelId);
    if (!model || !entry) return [];
    groupUnitId = entry.unitId;
  }

  const army = state[entry.player]?.army;
  const attachments = state.leaderAttachments?.[entry.player] || {};
  const groupUnits = getCombatDisplayUnits(army, attachments, groupUnitId);
  const groupIds = new Set(groupUnits.map((u) => u.id));
  const sw = bm.selectedWeapon;

  const radii = [];
  const baseR = Number(model.radiusIn) || 0;
  if (phase === 'movement' || stepId.includes('-mov')) {
    const moveUnit = findUnitInArmy(army, groupUnitId);
    radii.push({
      kind: 'move',
      x: model.x,
      y: model.y,
      // Measure from base edge, not center
      radius: parseMoveInches(moveUnit?.statsLine, moveUnit?.stats) + baseR,
    });
  }

  // No enemy ranged rings during controlling player's shoot or fight actions
  const isEnemyOfActive = stepPlayerKey && entry.player !== stepPlayerKey;
  if (isEnemyOfActive && (isShootStep || isFightAction)) return radii;

  const pushWeapon = (unit, weapon, origin) => {
    const r = parseWeaponRange(weapon?.range);
    const originBase = Number(origin?.radiusIn) || 0;
    if (r > 0) {
      radii.push({
        kind: 'shoot',
        x: origin.x,
        y: origin.y,
        // Measure from base edge, not center
        radius: r + originBase,
        label: weapon.name,
      });
    }
  };

  const swInGroup = sw && Number.isInteger(sw.weaponIndex) && groupIds.has(sw.unitId);

  if (swInGroup) {
    const unit = findUnitInArmy(army, sw.unitId);
    const w = unit?.rangedWeapons?.[sw.weaponIndex];
    const origin = entry.models.find((m) => modelBelongsToUnit(m, sw.unitId)) || model;
    if (w) pushWeapon(unit, w, origin);
  } else if (isShootAction || (isShootStep && !isFightAction)) {
    // Controlling unit keeps full range rings open while checking targets
    for (const unit of groupUnits) {
      const origin = entry.models.find((m) => modelBelongsToUnit(m, unit.id)) || model;
      for (const w of unit.rangedWeapons || []) pushWeapon(unit, w, origin);
    }
  }
  return radii;
}

function renderReminderBar(state) {
  if (!state.started) {
    return `<div class="sim-reminder-bar sim-reminder-under-toolbar"><span class="sim-reminder-label">Reminder!</span><span class="sim-reminder-empty">Start the battle guide to see phase reminders</span></div>`;
  }
  const step = getCurrentStep(state);
  const abilities = getAllAbilitiesForStep(state, step);
  if (!abilities.length) {
    return `<div class="sim-reminder-bar sim-reminder-under-toolbar"><span class="sim-reminder-label">Reminder!</span><span class="sim-reminder-empty">No phase reminders</span></div>`;
  }

  const chips = abilities
    .map(
      (a) => `
      <button type="button" class="sim-reminder-chip ${a.player === 'p1' ? 'p1' : 'p2'}" data-action="show-reminder" data-rule-name="${esc(a.ruleName)}" data-rule-desc="${esc(a.description)}" data-unit-name="${esc(a.unitName)}">
        <span class="sim-reminder-unit">${esc(a.unitName)}</span>
        <span class="sim-reminder-rule">${esc(a.ruleName)}</span>
      </button>`,
    )
    .join('');

  return `
    <div class="sim-reminder-bar sim-reminder-under-toolbar">
      <span class="sim-reminder-label">Reminder!</span>
      <div class="sim-reminder-chips">${chips}</div>
    </div>`;
}

function renderLayoutImportDialog(state) {
  const dlg = state.layoutImport;
  if (!dlg?.open) return '';
  const customs = loadCustomLayouts();
  const session = getImportSession();
  const riOptions = (dlg.riList || session?.list || [])
    .map(
      (l) =>
        `<option value="${esc(l.id)}" ${l.id === (dlg.selectedRiId || '') ? 'selected' : ''}>${esc(l.label || l.id)}</option>`,
    )
    .join('');
  const customRows = customs.length
    ? customs
        .map(
          (l) => `
        <li class="layout-import-custom-row">
          <span>${esc(l.name)}${l.rapidIngressId ? ` <span class="layout-import-meta">(${esc(l.rapidIngressId)})</span>` : ''}</span>
          <button type="button" data-action="delete-custom-layout" data-layout-id="${esc(l.id)}">Remove</button>
        </li>`,
        )
        .join('')
    : '<li class="layout-import-empty">No imported layouts yet</li>';

  return `
    <div class="layout-import-backdrop" data-action="close-layout-import">
      <div class="layout-import-dialog" role="dialog" aria-labelledby="layout-import-title">
        <button type="button" class="keyword-rule-popover-close" data-action="close-layout-import" aria-label="Close">×</button>
        <h4 id="layout-import-title">Import Rapid Ingress layout</h4>
        <p class="layout-import-help">
          In the browser, use <strong>Save as → Webpage, Complete</strong>, or export a
          <code>RapidIngress-xxxxx.png</code>. Multi-select that file plus
          <code>terrain-data-11e.js.download</code> from a saved page’s <code>_files</code> folder
          (the PNG only identifies which layout; polygons come from the terrain file).
          Give it a display name and it stays in your local library.
        </p>
        <label class="layout-import-field">
          <span>Upload files</span>
          <input type="file" data-action="layout-import-files" multiple accept=".html,.htm,.js,.download,.png,.jpg,.jpeg,.webp,text/html,text/javascript,application/javascript,image/png,image/jpeg" />
        </label>
        <label class="layout-import-field">
          <span>Rapid Ingress layout</span>
          <select data-layout-import-ri ${riOptions ? '' : 'disabled'}>
            ${riOptions || '<option value="">— load files first —</option>'}
          </select>
        </label>
        <label class="layout-import-field">
          <span>Display name</span>
          <input type="text" data-layout-import-name value="${esc(dlg.title || '')}" placeholder="e.g. Unstoppable Force" />
        </label>
        ${dlg.error ? `<p class="layout-import-error">${esc(dlg.error)}</p>` : ''}
        ${dlg.status ? `<p class="layout-import-status">${esc(dlg.status)}</p>` : ''}
        <div class="layout-import-actions">
          <button type="button" class="layout-import-primary" data-action="commit-layout-import" ${riOptions ? '' : 'disabled'}>Import &amp; use</button>
          <button type="button" data-action="close-layout-import">Cancel</button>
        </div>
        <div class="layout-import-customs">
          <h5>Imported layouts</h5>
          <ul>${customRows}</ul>
        </div>
      </div>
    </div>`;
}

function renderReminderPopup(state) {
  const pop = state.battleMap?.reminderPopup;
  if (!pop) return '';
  return `
    <div class="keyword-rule-popover-backdrop" data-action="close-reminder">
      <div class="keyword-rule-popover" role="dialog">
        <button type="button" class="keyword-rule-popover-close" data-action="close-reminder" aria-label="Close">×</button>
        <h4>${esc(pop.unitName)} — ${esc(pop.name)}</h4>
        <p>${esc(pop.description)}</p>
      </div>
    </div>`;
}

export function syncMapInteractionRuntime(state, dispatch) {
  mapInteractionRuntime.state = state;
  mapInteractionRuntime.dispatch = dispatch;
}

/** Apply camera transform to the live SVG without remounting the board. */
export function applyMapCamera(root, state) {
  const svg = root?.querySelector?.('.battle-map-svg');
  const world = svg?.querySelector('.battle-map-world');
  if (!svg || !world) return false;
  const cam = state.battleMap?.camera || { x: 0, y: 0, zoom: 1 };
  const pad = Number(svg.dataset.pad || 8);
  const ppi = Number(svg.dataset.ppi || getPixelsPerInch());
  world.setAttribute(
    'transform',
    `translate(${(pad + (cam.x || 0)) * ppi} ${(pad + (cam.y || 0)) * ppi}) scale(${cam.zoom || 1})`,
  );
  return true;
}

function patchScoreboardValues(root, state) {
  for (const key of ['player1', 'player2']) {
    const score = state[key]?.score;
    if (!score) continue;
    for (const field of ['cp', 'secondary', 'primary']) {
      const el = root.querySelector(`[data-score-player="${key}"][data-score-field="${field}"]`);
      if (el) el.textContent = String(score[field] ?? 0);
    }
    const total = root.querySelector(`[data-score-total="${key}"]`);
    if (total) total.textContent = String(totalScore(score));
  }
}

function patchReminderPopup(root, state, dispatch) {
  const existing = root.querySelector('.keyword-rule-popover-backdrop[data-action="close-reminder"]');
  const html = renderReminderPopup(state);
  if (!html) {
    existing?.remove();
    return;
  }
  if (existing) {
    existing.outerHTML = html;
  } else {
    root.querySelector('.guide-app')?.insertAdjacentHTML('beforeend', html);
  }
  root.querySelectorAll('[data-action="close-reminder"]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.dataset.action === 'close-reminder') dispatch({ type: 'CLOSE_REMINDER' });
    });
  });
  root.querySelector('.keyword-rule-popover')?.addEventListener('click', (e) => e.stopPropagation());
}

function patchStratagemPanel(root, state, dispatch) {
  const existing = root.querySelector('.strat-panel-backdrop');
  const html = renderStratagemPanel(state);
  if (!html) {
    existing?.remove();
    return;
  }
  if (existing) {
    existing.outerHTML = html;
  } else {
    root.querySelector('.guide-app')?.insertAdjacentHTML('beforeend', html);
  }
  bindStratagemEvents(root, dispatch);
}

/**
 * Patch chrome without remounting the SVG board.
 * @returns {boolean} true if handled
 */
export function patchSimChrome(root, state, dispatch, action) {
  if (!root?.querySelector?.('.battle-sim-app')) return false;
  const type = action?.type;
  if (type === 'ADJUST_SCORE') {
    patchScoreboardValues(root, state);
    return true;
  }
  if (type === 'SHOW_REMINDER' || type === 'CLOSE_REMINDER') {
    patchReminderPopup(root, state, dispatch);
    return true;
  }
  if (type === 'SPEND_STRATAGEM' || type === 'UNSPEND_STRATAGEM') {
    patchScoreboardValues(root, state);
    patchStratagemPanel(root, state, dispatch);
    return true;
  }
  return false;
}

export function renderBattleSim(root, state, dispatch) {
  const radii = getSelectedRadii(state);
  syncMapInteractionRuntime(state, dispatch);

  // One-shot migrate for games already open on Battle Map with legacy colliding model ids
  if (state.battleMap) {
    const migrated = migrateBattleMapModelIds(state.battleMap);
    if (migrated !== state.battleMap) {
      queueMicrotask(() => dispatch({ type: 'MAP_MIGRATE_MODEL_IDS' }));
    }
  }

  const drawerOpen = isArmyDrawerOpen('player1', state) || isArmyDrawerOpen('player2', state);

  root.innerHTML = `
    <div class="guide-app battle-sim-app">
      ${renderSimChrome(state)}
      <main class="battle-sim-stage">
        <div class="battle-sim-center">
          ${renderMapSvg(state, {
            layouts: getAllLayouts(),
            radii,
            reminderHtml: renderReminderBar(state),
            modelHighlights: collectModelHighlights(state),
          })}
          ${renderSimPregame(state)}
        </div>
        ${renderSimArmyList(state, 'player1')}
        ${renderSimArmyList(state, 'player2')}
        <button type="button" class="sim-drawer-scrim ${drawerOpen ? 'is-visible' : ''}" data-action="close-army-drawers" aria-label="Close army panels" tabindex="-1"></button>
      </main>
      ${renderReminderPopup(state)}
      ${renderKeywordRulePopover(state)}
      ${renderLayoutImportDialog(state)}
      ${renderStratagemPanel(state)}
      ${renderHelpGuidePanel(state)}
    </div>`;

  bindBattleSimEvents(root, state, dispatch);
  rebuildModelElementIndex(root.querySelector('.battle-map-svg'));
}

function bindBattleSimEvents(root, state, dispatch) {
  root.querySelector('[data-action="start-game"]')?.addEventListener('click', () => {
    openArmyDrawers.clear();
    dispatch({ type: 'START_GAME' });
  });
  root.querySelector('[data-action="next-step"]')?.addEventListener('click', () => dispatch({ type: 'NEXT_STEP' }));
  root.querySelector('[data-action="prev-step"]')?.addEventListener('click', () => dispatch({ type: 'PREV_STEP' }));
  root.querySelector('[data-action="save-game"]')?.addEventListener('click', () => dispatch({ type: 'SAVE' }));
  root.querySelector('[data-action="reset-game"]')?.addEventListener('click', () => {
    if (confirm('Reset the battle? Armies and scores will be cleared.')) dispatch({ type: 'RESET_GAME' });
  });

  function syncArmyDrawerUi() {
    const anyOpen = openArmyDrawers.has('player1') || openArmyDrawers.has('player2');
    root.querySelector('.sim-drawer-scrim')?.classList.toggle('is-visible', anyOpen);
    for (const key of ['player1', 'player2']) {
      const open = openArmyDrawers.has(key);
      const drawer = root.querySelector(`.sim-army-drawer[data-player="${key}"]`);
      drawer?.classList.toggle('is-open', open);
      drawer?.setAttribute('aria-hidden', open ? 'false' : 'true');
      root.querySelectorAll(`[data-action="toggle-army-drawer"][data-player="${key}"]`).forEach((btn) => {
        if (btn.classList.contains('army-drawer-toggle')) {
          btn.classList.toggle('is-active', open);
          btn.setAttribute('aria-pressed', open ? 'true' : 'false');
        }
      });
    }
  }

  root.querySelectorAll('[data-action="toggle-army-drawer"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const player = btn.dataset.player;
      if (!player) return;
      bootstrapArmyDrawers(state);
      if (openArmyDrawers.has(player)) openArmyDrawers.delete(player);
      else openArmyDrawers.add(player);
      syncArmyDrawerUi();
    });
  });

  root.querySelector('[data-action="close-army-drawers"]')?.addEventListener('click', () => {
    openArmyDrawers.clear();
    syncArmyDrawerUi();
  });

  root.querySelectorAll('[data-action="set-first-player"]').forEach((btn) => {
    btn.addEventListener('click', () => dispatch({ type: 'SET_FIRST_PLAYER', player: btn.dataset.player }));
  });

  root.querySelectorAll('[data-action="clear-army"]').forEach((btn) => {
    btn.addEventListener('click', () => dispatch({ type: 'CLEAR_ARMY', player: btn.dataset.player }));
  });

  root.querySelectorAll('input[data-action="load-army"]').forEach((input) => {
    input.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          dispatch({ type: 'LOAD_ARMY', player: input.dataset.player, json: reader.result });
        } catch (err) {
          alert('Failed to load roster: ' + err.message);
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
  });

  root.querySelectorAll('[data-action="set-leader-attach"]').forEach((sel) => {
    sel.addEventListener('click', (e) => e.stopPropagation());
    sel.addEventListener('mousedown', (e) => e.stopPropagation());
    sel.addEventListener('change', (e) => {
      e.stopPropagation();
      dispatch({
        type: 'SET_LEADER_ATTACHMENT',
        player: sel.dataset.player,
        leaderId: sel.dataset.leaderId,
        attachedUnitId: sel.value || null,
      });
    });
  });

  root.querySelectorAll('[data-action="score"]').forEach((btn) => {
    btn.addEventListener('click', () =>
      dispatch({
        type: 'ADJUST_SCORE',
        player: btn.dataset.player,
        field: btn.dataset.field,
        delta: Number(btn.dataset.delta),
      }),
    );
  });

  root.querySelectorAll('[data-action="toggle-battle-ready"]').forEach((btn) => {
    btn.addEventListener('click', () => dispatch({ type: 'TOGGLE_BATTLE_READY', player: btn.dataset.player }));
  });

  bindStratagemEvents(root, dispatch);
  bindHelpGuideEvents(root, dispatch);

  root.querySelectorAll('[data-action="map-deploy-unit"]').forEach((btn) => {
    btn.addEventListener('click', () =>
      dispatch({ type: 'MAP_DEPLOY_UNIT', player: btn.dataset.player, unitId: btn.dataset.unitId }),
    );
  });
  root.querySelectorAll('[data-action="map-withdraw-unit"]').forEach((btn) => {
    btn.addEventListener('click', () =>
      dispatch({ type: 'MAP_WITHDRAW_UNIT', player: btn.dataset.player, unitId: btn.dataset.unitId }),
    );
  });
  root.querySelectorAll('[data-action="map-select-unit"]').forEach((btn) => {
    btn.addEventListener('click', () =>
      dispatch({ type: 'MAP_SELECT_UNIT', player: btn.dataset.player, unitId: btn.dataset.unitId }),
    );
  });

  root.querySelectorAll('[data-action="map-select-weapon"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dispatch({
        type: 'MAP_SELECT_WEAPON',
        unitId: btn.dataset.unitId,
        weaponIndex: Number(btn.dataset.weaponIndex),
      });
    });
  });

  root.querySelectorAll('[data-action="show-keyword-rule"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dispatch({
        type: 'SHOW_KEYWORD_RULE',
        player: btn.dataset.player,
        unitId: btn.dataset.unitId,
        ruleName: btn.dataset.ruleName,
      });
    });
  });
  root.querySelector('.keyword-rule-popover-backdrop')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('keyword-rule-popover-backdrop')) {
      dispatch({ type: 'CLOSE_KEYWORD_RULE' });
    }
  });
  root.querySelector('.keyword-rule-popover')?.addEventListener('click', (e) => e.stopPropagation());
  root.querySelector('.keyword-rule-popover-close')?.addEventListener('click', () =>
    dispatch({ type: 'CLOSE_KEYWORD_RULE' }),
  );

  root.querySelectorAll('[data-action="combat-select-active"]').forEach((btn) => {
    btn.addEventListener('click', () =>
      dispatch({ type: 'COMBAT_SELECT_ACTIVE', unitId: btn.dataset.unitId }),
    );
  });
  root.querySelectorAll('[data-action="combat-select-target"]').forEach((btn) => {
    btn.addEventListener('click', () =>
      dispatch({ type: 'COMBAT_SELECT_TARGET', unitId: btn.dataset.unitId }),
    );
  });

  root.querySelectorAll('[data-action="adjust-unit-wounds"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dispatch({
        type: 'ADJUST_UNIT_WOUNDS',
        player: btn.dataset.player,
        unitId: btn.dataset.unitId,
        delta: Number(btn.dataset.delta),
      });
    });
  });

  root.querySelectorAll('[data-action="toggle-battle-shock"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dispatch({
        type: 'TOGGLE_BATTLE_SHOCK',
        player: btn.dataset.player,
        groupId: btn.dataset.groupId,
      });
    });
  });

  root.querySelectorAll('[data-action="map-clear-selection"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dispatch({ type: 'MAP_CLEAR_SELECTION' });
    });
  });

  root.querySelector('[data-action="set-map-layout"]')?.addEventListener('change', (e) => {
    const layoutId = e.target.value;
    if (layoutId === '__add_new__') {
      e.target.value = state.battleMap?.layoutId || 'blank';
      dispatch({ type: 'OPEN_LAYOUT_IMPORT' });
      return;
    }
    dispatch({ type: 'SET_MAP_LAYOUT', layoutId });
  });

  root.querySelector('.layout-import-dialog')?.addEventListener('click', (e) => e.stopPropagation());
  root.querySelectorAll('[data-action="close-layout-import"]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.dataset.action === 'close-layout-import') {
        clearImportSession();
        dispatch({ type: 'CLOSE_LAYOUT_IMPORT' });
      }
    });
  });

  root.querySelector('[data-action="layout-import-files"]')?.addEventListener('change', async (e) => {
    const input = e.target;
    try {
      const files = await readFilesAsText(input.files);
      if (!files.length) return;
      const meta = beginImportSession(files);
      dispatch({
        type: 'LAYOUT_IMPORT_PARSED',
        riList: meta.list,
        selectedRiId: meta.suggestedId || meta.list[0]?.id || '',
        title: meta.suggestedName || state.layoutImport?.title || '',
        status: `Loaded ${meta.list.length} Rapid Ingress layouts from file.`,
        error: null,
      });
    } catch (err) {
      clearImportSession();
      dispatch({
        type: 'LAYOUT_IMPORT_PARSED',
        riList: [],
        selectedRiId: '',
        title: state.layoutImport?.title || '',
        status: null,
        error: err?.message || String(err),
      });
    }
  });

  root.querySelector('[data-action="commit-layout-import"]')?.addEventListener('click', () => {
    const riSel = root.querySelector('[data-layout-import-ri]');
    const nameInput = root.querySelector('[data-layout-import-name]');
    const riId = riSel?.value;
    const title = nameInput?.value || '';
    if (!riId) {
      dispatch({
        type: 'LAYOUT_IMPORT_PARSED',
        error: 'Select a Rapid Ingress layout ID first.',
        riList: state.layoutImport?.riList || [],
        selectedRiId: '',
        title,
        status: state.layoutImport?.status || null,
      });
      return;
    }
    try {
      const layout = commitImportSession(riId, title);
      dispatch({ type: 'CLOSE_LAYOUT_IMPORT' });
      dispatch({ type: 'SET_MAP_LAYOUT', layoutId: layout.id });
    } catch (err) {
      dispatch({
        type: 'LAYOUT_IMPORT_PARSED',
        error: err?.message || String(err),
        riList: state.layoutImport?.riList || [],
        selectedRiId: riId,
        title,
        status: state.layoutImport?.status || null,
      });
    }
  });

  root.querySelectorAll('[data-action="delete-custom-layout"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.layoutId;
      if (!id) return;
      if (!confirm('Remove this imported layout from your library?')) return;
      deleteCustomLayout(id);
      const nextLayoutId =
        state.battleMap?.layoutId === id ? 'blank' : state.battleMap?.layoutId || 'blank';
      dispatch({ type: 'CUSTOM_LAYOUT_DELETED', layoutId: id, nextLayoutId });
    });
  });

  root.querySelectorAll('[data-action="map-zoom"]').forEach((btn) => {
    btn.addEventListener('click', () => dispatch({ type: 'MAP_ZOOM', delta: Number(btn.dataset.delta) }));
  });
  root.querySelector('[data-action="map-reset-camera"]')?.addEventListener('click', () =>
    dispatch({ type: 'MAP_RESET_CAMERA' }),
  );
  root.querySelector('[data-action="map-flip-horizontal"]')?.addEventListener('click', () =>
    dispatch({ type: 'MAP_FLIP_HORIZONTAL' }),
  );
  root.querySelector('[data-action="map-rotate-90"]')?.addEventListener('click', () =>
    dispatch({ type: 'MAP_ROTATE_90' }),
  );
  root.querySelector('[data-action="map-reset-orientation"]')?.addEventListener('click', () =>
    dispatch({ type: 'MAP_RESET_ORIENTATION' }),
  );
  root.querySelector('[data-action="add-special-marker"]')?.addEventListener('click', () => {
    const name = prompt('Special marker name', 'OOM target');
    if (name) dispatch({ type: 'MAP_ADD_SPECIAL_MARKER', name });
  });
  root.querySelector('[data-action="remove-special-marker"]')?.addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.specialId;
    if (id) dispatch({ type: 'MAP_REMOVE_SPECIAL_MARKER', id });
  });

  root.querySelectorAll('[data-action="show-reminder"]').forEach((btn) => {
    btn.addEventListener('click', () =>
      dispatch({
        type: 'SHOW_REMINDER',
        name: btn.dataset.ruleName,
        description: btn.dataset.ruleDesc,
        unitName: btn.dataset.unitName,
      }),
    );
  });
  root.querySelectorAll('[data-action="close-reminder"]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.dataset.action === 'close-reminder') dispatch({ type: 'CLOSE_REMINDER' });
    });
  });
  root.querySelector('.keyword-rule-popover')?.addEventListener('click', (e) => e.stopPropagation());

  ensureMapPointerHandlers();
  mapInteractionRuntime.root = root;
  mapInteractionRuntime.svg = root.querySelector('.battle-map-svg');
  mapInteractionRuntime.wrap = root.querySelector('.battle-map-canvas-wrap');
}

/** Persistent pointer runtime — survives re-renders without stacking listeners. */
const mapInteractionRuntime = {
  root: null,
  svg: null,
  wrap: null,
  state: null,
  dispatch: null,
  drag: null,
  bound: false,
  modelEls: new Map(),
};

function modelElKey(unitKey, modelId) {
  return `${unitKey}\0${modelId}`;
}

function rebuildModelElementIndex(svg) {
  const map = new Map();
  if (svg) {
    svg.querySelectorAll('.map-model').forEach((el) => {
      const unitKey = el.getAttribute('data-unit-key');
      const modelId = el.getAttribute('data-model-id');
      if (unitKey != null && modelId != null) map.set(modelElKey(unitKey, modelId), el);
    });
  }
  mapInteractionRuntime.modelEls = map;
}

function findByDataAttr(root, attr, value) {
  if (!root || value == null) return null;
  try {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return root.querySelector(`[${attr}="${CSS.escape(String(value))}"]`);
    }
  } catch (_) {}
  return [...root.querySelectorAll(`[${attr}]`)].find((el) => el.getAttribute(attr) === value) || null;
}

function findModelGroup(root, unitKey, modelId) {
  if (!unitKey || modelId == null) return null;
  const cached = mapInteractionRuntime.modelEls.get(modelElKey(unitKey, modelId));
  if (cached && (!root || root.contains(cached))) return cached;
  if (!root) return null;
  return (
    [...root.querySelectorAll('.map-model')].find(
      (el) => el.getAttribute('data-unit-key') === unitKey && el.getAttribute('data-model-id') === modelId,
    ) || null
  );
}

/** Frame nose faces local -Y; SVG rotate(θ) maps that to board angle atan2(sinθ, -cosθ). */
function boardAngleToFrameRotation(dx, dy) {
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

function ensureMapPointerHandlers() {
  if (mapInteractionRuntime.bound) return;
  mapInteractionRuntime.bound = true;

  window.addEventListener(
    'wheel',
    (e) => {
      const wrap = mapInteractionRuntime.wrap;
      if (!wrap || !wrap.contains(e.target)) return;
      e.preventDefault();
      mapInteractionRuntime.dispatch?.({ type: 'MAP_ZOOM', delta: e.deltaY < 0 ? 0.1 : -0.1 });
    },
    { passive: false },
  );

  window.addEventListener('contextmenu', (e) => {
    if (mapInteractionRuntime.wrap?.contains(e.target)) e.preventDefault();
  });

  window.addEventListener('pointerdown', (e) => {
    const svg = mapInteractionRuntime.svg;
    const state = mapInteractionRuntime.state;
    const dispatch = mapInteractionRuntime.dispatch;
    if (!svg || !state || !dispatch) return;
    if (!svg.contains(e.target)) return;

    const cam = state.battleMap?.camera || { x: 0, y: 0, zoom: 1 };
    const rotateHandle = e.target.closest('[data-rotate-handle]');
    const modelEl = e.target.closest('.map-model');
    const specialEl = e.target.closest('.map-special');
    const boardPt = clientToBoardInches(svg, e.clientX, e.clientY, cam);

    if (specialEl) {
      const id = specialEl.dataset.specialId;
      const marker = (state.battleMap?.specialMarkers || []).find((m) => m.id === id);
      if (!marker) return;
      e.preventDefault();
      mapInteractionRuntime.drag = {
        type: 'special',
        id,
        startBoard: boardPt,
        origin: { x: marker.x, y: marker.y },
        radiusIn: marker.radiusIn || 0.5,
        moved: false,
        pointerId: e.pointerId,
      };
      // Select without waiting — special select does not break drag if we don't re-read svg from stale node
      // Defer select to pointerup to avoid mid-drag re-render
      return;
    }

    // Frame orientation: drag the selected handle about the hull center
    if (rotateHandle && modelEl && e.button === 0) {
      const unitKey = modelEl.dataset.unitKey;
      const modelId = modelEl.dataset.modelId;
      const entry = state.battleMap?.unitsOnMap?.[unitKey];
      const model = entry?.models?.find((m) => m.id === modelId);
      if (!entry || !model) return;
      e.preventDefault();
      mapInteractionRuntime.drag = {
        type: 'rotate',
        unitKey,
        modelId,
        player: entry.player,
        unitId: entry.unitId,
        center: { x: model.x, y: model.y },
        moved: false,
        pointerId: e.pointerId,
      };
      return;
    }

    if (modelEl) {
      const unitKey = modelEl.dataset.unitKey;
      const modelId = modelEl.dataset.modelId;
      const entry = state.battleMap?.unitsOnMap?.[unitKey];
      if (!entry) return;
      e.preventDefault();
      mapInteractionRuntime.drag = {
        type: e.button === 2 ? 'unit' : 'model',
        unitKey,
        modelId,
        player: entry.player,
        unitId: entry.unitId,
        startBoard: boardPt,
        modelsOrigin: entry.models.map((m) => ({
          id: m.id,
          x: m.x,
          y: m.y,
          rotation: Number(m.rotation) || 0,
          shape: m.shape,
        })),
        moved: false,
        pointerId: e.pointerId,
      };
      return;
    }

    if (e.button === 0) {
      mapInteractionRuntime.drag = {
        type: 'pan',
        startClient: { x: e.clientX, y: e.clientY },
        originCam: { x: cam.x || 0, y: cam.y || 0 },
        moved: false,
        pointerId: e.pointerId,
      };
    }
  });

  window.addEventListener('pointermove', (e) => {
    const drag = mapInteractionRuntime.drag;
    const svg = mapInteractionRuntime.svg;
    const state = mapInteractionRuntime.state;
    if (!drag || !svg || !state) return;
    if (drag.pointerId != null && e.pointerId !== drag.pointerId) return;

    const cam = state.battleMap?.camera || { x: 0, y: 0, zoom: 1 };
    const ppi = getPixelsPerInch();

    if (drag.type === 'pan') {
      const rect = svg.getBoundingClientRect();
      if (!rect.width) return;
      const scale = svg.viewBox.baseVal.width / rect.width / ppi / (cam.zoom || 1);
      const dx = (e.clientX - drag.startClient.x) * scale;
      const dy = (e.clientY - drag.startClient.y) * scale;
      if (Math.abs(dx) + Math.abs(dy) > 0.05) drag.moved = true;
      const world = svg.querySelector('.battle-map-world');
      const pad = Number(svg.dataset.pad || 8);
      if (world) {
        world.setAttribute(
          'transform',
          `translate(${(pad + drag.originCam.x + dx) * ppi} ${(pad + drag.originCam.y + dy) * ppi}) scale(${cam.zoom || 1})`,
        );
      }
      drag.liveCam = { x: drag.originCam.x + dx, y: drag.originCam.y + dy, zoom: cam.zoom || 1 };
      return;
    }

    if (drag.type === 'rotate') {
      const boardPt = clientToBoardInches(svg, e.clientX, e.clientY, cam);
      const dx = boardPt.x - drag.center.x;
      const dy = boardPt.y - drag.center.y;
      if (Math.hypot(dx, dy) > 0.05) drag.moved = true;
      const rotation = boardAngleToFrameRotation(dx, dy);
      const g = findModelGroup(svg, drag.unitKey, drag.modelId);
      if (g) {
        g.setAttribute(
          'transform',
          `translate(${drag.center.x * ppi} ${drag.center.y * ppi}) rotate(${rotation})`,
        );
        g.dataset.rotation = String(rotation);
      }
      drag.liveRotation = rotation;
      return;
    }

    const boardPt = clientToBoardInches(svg, e.clientX, e.clientY, cam);
    const dx = boardPt.x - drag.startBoard.x;
    const dy = boardPt.y - drag.startBoard.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.05) drag.moved = true;

    if (drag.type === 'special') {
      const x = drag.origin.x + dx;
      const y = drag.origin.y + dy;
      const g = findByDataAttr(svg, 'data-special-id', drag.id);
      g?.querySelectorAll('circle').forEach((c) => {
        c.setAttribute('cx', String(x * ppi));
        c.setAttribute('cy', String(y * ppi));
      });
      const text = g?.querySelector('text');
      if (text) {
        text.setAttribute('x', String(x * ppi));
        text.setAttribute('y', String((y - (drag.radiusIn || 0.5)) * ppi - 4));
      }
      drag.live = { x, y };
      return;
    }

    if (drag.type === 'model' || drag.type === 'unit') {
      const moves = [];
      for (const m of drag.modelsOrigin) {
        if (drag.type === 'model' && m.id !== drag.modelId) continue;
        const nx = m.x + dx;
        const ny = m.y + dy;
        moves.push({ id: m.id, x: nx, y: ny });
        const g = findModelGroup(svg, drag.unitKey, m.id);
        if (!g) continue;
        const rot = Number(m.rotation) || 0;
        if (m.shape === 'rect' || g.dataset.shape === 'rect') {
          g.setAttribute('transform', `translate(${nx * ppi} ${ny * ppi}) rotate(${rot})`);
        } else {
          g.setAttribute('transform', `translate(${nx * ppi} ${ny * ppi})`);
        }
      }
      drag.liveMoves = moves;
    }
  });

  window.addEventListener('pointerup', (e) => {
    const drag = mapInteractionRuntime.drag;
    const dispatch = mapInteractionRuntime.dispatch;
    const state = mapInteractionRuntime.state;
    if (!drag || !dispatch || !state) return;
    if (drag.pointerId != null && e.pointerId !== drag.pointerId) return;

    if (drag.type === 'pan' && drag.liveCam && drag.moved) {
      dispatch({ type: 'MAP_SET_CAMERA', camera: drag.liveCam });
    } else if (drag.type === 'pan' && !drag.moved) {
      dispatch({ type: 'MAP_CLEAR_SELECTION' });
    } else if (drag.type === 'special') {
      if (drag.moved && drag.live) {
        dispatch({ type: 'MAP_MOVE_SPECIAL', id: drag.id, x: drag.live.x, y: drag.live.y });
      }
      // Select special marker (shows Remove button)
      dispatch({ type: 'MAP_SELECT_SPECIAL', id: drag.id });
    } else if (drag.type === 'rotate') {
      if (drag.moved && Number.isFinite(drag.liveRotation)) {
        dispatch({
          type: 'MAP_ROTATE_MODEL',
          unitKey: drag.unitKey,
          modelId: drag.modelId,
          rotation: drag.liveRotation,
        });
      }
      dispatch({
        type: 'MAP_SELECT_UNIT',
        player: drag.player,
        unitId: drag.unitId,
        modelId: drag.modelId,
      });
    } else if (drag.type === 'model' || drag.type === 'unit') {
      if (drag.moved && drag.liveMoves?.length) {
        dispatch({ type: 'MAP_MOVE_MODELS', unitKey: drag.unitKey, moves: drag.liveMoves });
      }
      dispatch({
        type: 'MAP_SELECT_UNIT',
        player: drag.player,
        unitId: drag.unitId,
        modelId: drag.modelId,
      });
      // LoS is computed inside MAP_SELECT_UNIT when both combat sides are set during shooting
    }

    mapInteractionRuntime.drag = null;
  });

  window.addEventListener('pointercancel', () => {
    mapInteractionRuntime.drag = null;
  });
}

// Helpers re-exported for tests / external use
export { mapUnitKey, BATTLE_LAYOUTS, getAllLayouts, getLayoutById };
