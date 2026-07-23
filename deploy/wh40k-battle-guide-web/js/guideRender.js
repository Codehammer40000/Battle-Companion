import {
  getCurrentStep,
  getProgress,
  totalScore,
  getUnitPhaseKey,
  isUnitChecklistStep,
  findUnitInArmy,
  isUnitDead,
  getUnitWoundsTaken,
  getRemainingModels,
  getUnitWoundCapacity,
  getUnitGroupInfo,
  isGroupBattleShocked,
  unitCanLead,
  unitIsSupport,
  isCombatActionStep,
  getCombatDisplayUnits,
} from './guide/guideState.js';
import { getPhaseGroupLabel, MAX_BATTLE_ROUNDS } from './guide/phaseFlow.js';
import { getAllAbilitiesForStep, listAllAbilities } from './guide/abilityMapper.js';
import { getUnitKeywordRules, getUnitDisplayAbilities, getUnitDisplayKeywords, unitHasDeepStrike } from './guide/rosterParser.js';
import {
  renderKeywordList,
  renderWeaponTable,
  renderKeywordRulePopover,
} from './guide/weaponUi.js';
import { renderBattleSim } from './battleSim/battleSimRender.js';

const SLOT_LABELS = {
  'setup-pre-battle': 'Pre-battle',
  'setup-deploy': 'Deploy',
  'setup-redeploy': 'Redeploy',
  'setup-formations': 'Formations',
  'cmd-start': 'Cmd start',
  'cmd-end': 'Cmd end',
  cmd: 'Command',
  shoot: 'Shoot',
  charge: 'Charge',
  fight: 'Fight',
  passive: 'Always on',
};

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function renderNewRecruitHint() {
  return `<p class="hint newrecruit-hint">Upload Army JSON from NewRecruit. If you haven't created your army or have exported in a different format, create your army and export as JSON <a class="external-link" href="https://www.newrecruit.eu" target="_blank" rel="noopener noreferrer">here</a>.</p>`;
}

function renderScoreCell(player, field, label, value, playerKey) {
  return `
    <div class="score-cell">
      <span class="score-label">${label}</span>
      <div class="score-controls">
        <button type="button" data-action="score" data-player="${playerKey}" data-field="${field}" data-delta="-1">−</button>
        <span class="score-value">${value}</span>
        <button type="button" data-action="score" data-player="${playerKey}" data-field="${field}" data-delta="1">+</button>
      </div>
    </div>`;
}

function renderBattleReadyBtn(state, playerKey) {
  const active = !!state.battleReady?.[playerKey];
  return `<button type="button" class="battle-ready-btn ${active ? 'active' : ''}" data-action="toggle-battle-ready" data-player="${playerKey}">Battle Ready Army</button>`;
}

function renderScoreboard(state) {
  const p1 = state.player1;
  const p2 = state.player2;

  const renderFirstTurnBadge = (key) =>
    state.firstPlayer === key ? '<span class="first-turn-badge">Goes first</span>' : '';

  const renderPlayerLeft = (p, key) => `
    <div class="score-player score-left">
      <div class="score-player-name">${esc(p.army?.name || p.name)}${renderFirstTurnBadge(key)}</div>
      <div class="score-row">
        ${renderScoreCell(p, 'cp', 'CP', p.score.cp, key)}
        ${renderScoreCell(p, 'secondary', 'Sec', p.score.secondary, key)}
        ${renderScoreCell(p, 'primary', 'Prim', p.score.primary, key)}
        <div class="score-cell score-total-cell">
          <span class="score-label">Total</span>
          <span class="score-total">${totalScore(p.score)}</span>
        </div>
        ${renderBattleReadyBtn(state, key)}
      </div>
    </div>`;

  const renderPlayerRight = (p, key) => `
    <div class="score-player score-right">
      <div class="score-player-name">${renderFirstTurnBadge(key)}${esc(p.army?.name || p.name)}</div>
      <div class="score-row score-row-mirror">
        ${renderBattleReadyBtn(state, key)}
        <div class="score-cell score-total-cell">
          <span class="score-label">Total</span>
          <span class="score-total">${totalScore(p.score)}</span>
        </div>
        ${renderScoreCell(p, 'primary', 'Prim', p.score.primary, key)}
        ${renderScoreCell(p, 'secondary', 'Sec', p.score.secondary, key)}
        ${renderScoreCell(p, 'cp', 'CP', p.score.cp, key)}
      </div>
    </div>`;

  return `
    <header class="scoreboard">
      ${renderPlayerLeft(p1, 'player1')}
      <div class="score-center">
        <div class="score-vs">VS</div>
        <div class="turn-display">${esc(getCurrentStep(state)?.turnLabel || 'Load armies to begin')}</div>
        <div class="view-mode-bar">
          <button type="button" class="view-mode-btn active" data-action="set-view-mode" data-mode="companion">Companion</button>
          <button type="button" class="view-mode-btn" data-action="set-view-mode" data-mode="battleSim">Battle Map</button>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${getProgress(state)}%"></div></div>
      </div>
      ${renderPlayerRight(p2, 'player2')}
    </header>`;
}

function renderUnitDetailModal(state) {
  const detail = state.unitDetail;
  if (!detail) return '';

  const player = state[detail.player];
  const unit = findUnitInArmy(player?.army, detail.unitId);
  if (!unit) return '';

  const woundsTaken = getUnitWoundsTaken(state, detail.player, unit.id);
  const remainingModels = getRemainingModels(unit, woundsTaken);
  const woundCap = getUnitWoundCapacity(unit);
  const keywordRuleIndex = getUnitKeywordRules(unit);
  const kwContext = { player: detail.player, unitId: unit.id };
  const displayKeywords = getUnitDisplayKeywords(unit);

  const abilityItems = getUnitDisplayAbilities(unit)
    .map(
      (a) => `
      <div class="unit-detail-ability">
        <strong>${esc(a.name)}</strong>
        <p>${esc(a.description)}</p>
      </div>`,
    )
    .join('');

  const rangedBlock = unit.rangedWeapons?.length
    ? `<details class="weapon-dropdown" open>
        <summary>Ranged Weapons (${unit.rangedWeapons.length})</summary>
        ${renderWeaponTable(unit.rangedWeapons, 'ranged', keywordRuleIndex, kwContext)}
      </details>`
    : '';

  const meleeBlock = unit.meleeWeapons?.length
    ? `<details class="weapon-dropdown" open>
        <summary>Melee Weapons (${unit.meleeWeapons.length})</summary>
        ${renderWeaponTable(unit.meleeWeapons, 'melee', keywordRuleIndex, kwContext)}
      </details>`
    : '';

  return `
    <div class="unit-modal-backdrop" data-action="close-unit-detail">
      <div class="unit-modal" role="dialog" aria-modal="true" aria-labelledby="unit-modal-title">
        <div class="unit-modal-header">
          <div>
            <h2 id="unit-modal-title">${esc(unit.name)}</h2>
            <p class="unit-modal-meta">${remainingModels} model${remainingModels !== 1 ? 's' : ''} · ${unit.points} pts${unit.isWarlord ? ' · Warlord' : ''} · ${woundsTaken}/${woundCap} wounds</p>
            ${unit.statsLine ? `<p class="unit-modal-stats">${esc(unit.statsLine)}</p>` : ''}
          </div>
          <button type="button" class="unit-modal-close" data-action="close-unit-detail" aria-label="Close">×</button>
        </div>
        <div class="unit-modal-body">
          ${displayKeywords.length ? `<div class="unit-detail-section"><h4>Keywords</h4><p class="unit-detail-kw">${renderKeywordList(displayKeywords, keywordRuleIndex, kwContext)}</p></div>` : ''}
          ${abilityItems ? `<div class="unit-detail-section"><h4>Abilities</h4>${abilityItems}</div>` : ''}
          ${rangedBlock || meleeBlock ? `<div class="unit-detail-section"><h4>Weapons</h4>${rangedBlock}${meleeBlock}</div>` : ''}
        </div>
      </div>
    </div>`;
}

function renderCombatCondensedUnit(unit, state, playerKey) {
  const woundsTaken = getUnitWoundsTaken(state, playerKey, unit.id);
  const remainingModels = getRemainingModels(unit, woundsTaken);
  const woundCap = getUnitWoundCapacity(unit);
  const keywordRuleIndex = getUnitKeywordRules(unit);
  const kwContext = { player: playerKey, unitId: unit.id };
  const displayKeywords = getUnitDisplayKeywords(unit);
  const woundControls = `
    <div class="combat-wounds-row">
      <span class="combat-wounds-label">Wounds</span>
      <div class="combat-wounds-controls">
        <button type="button" data-action="adjust-unit-wounds" data-player="${playerKey}" data-unit-id="${esc(unit.id)}" data-delta="-1">−</button>
        <span class="combat-wounds-value">${woundsTaken}</span>
        <button type="button" data-action="adjust-unit-wounds" data-player="${playerKey}" data-unit-id="${esc(unit.id)}" data-delta="1">+</button>
      </div>
      <span class="combat-wounds-cap">/ ${woundCap}</span>
    </div>`;

  const abilityItems = getUnitDisplayAbilities(unit)
    .map(
      (a) => `
      <div class="combat-ability-item">
        <strong>${esc(a.name)}</strong>
        <p>${esc(a.description)}</p>
      </div>`,
    )
    .join('');

  const kwBlock = displayKeywords.length
    ? `<details class="combat-collapsed">
        <summary>Keywords (${displayKeywords.length})</summary>
        <p class="combat-kw">${renderKeywordList(displayKeywords, keywordRuleIndex, kwContext)}</p>
      </details>`
    : '';

  const abilityBlock = abilityItems
    ? `<details class="combat-collapsed">
        <summary>Abilities</summary>
        ${abilityItems}
      </details>`
    : '';

  const rangedBlock = unit.rangedWeapons?.length
    ? `<div class="combat-weapons-block">
        <h5>Ranged</h5>
        ${renderWeaponTable(unit.rangedWeapons, 'ranged', keywordRuleIndex, kwContext)}
      </div>`
    : '';

  const meleeBlock = unit.meleeWeapons?.length
    ? `<div class="combat-weapons-block">
        <h5>Melee</h5>
        ${renderWeaponTable(unit.meleeWeapons, 'melee', keywordRuleIndex, kwContext)}
      </div>`
    : '';

  const roleTag = unit.isLeader ? 'Leader' : unitIsSupport(unit) ? 'Support' : '';

  return `
    <div class="combat-unit-block">
      <div class="combat-unit-header">
        <h3>${esc(unit.name)}${roleTag ? ` <span class="combat-role-tag">${roleTag}</span>` : ''}</h3>
        <p class="combat-unit-meta">${remainingModels} model${remainingModels !== 1 ? 's' : ''} · ${woundsTaken}/${woundCap} wounds · ${unit.points} pts</p>
        ${unit.statsLine ? `<p class="combat-unit-stats">${esc(unit.statsLine)}</p>` : ''}
      </div>
      ${woundControls}
      ${kwBlock}
      ${abilityBlock}
      ${rangedBlock}
      ${meleeBlock}
    </div>`;
}

function renderCombatOverlay(state, playerKey) {
  const combat = state.combat;
  if (!combat) return '';

  const army = state[playerKey]?.army;
  if (!army) return '';

  const attachments = state.leaderAttachments?.[playerKey] || {};
  let unitId = null;
  let variant = '';

  if (combat.active?.player === playerKey && combat.active.unitId) {
    unitId = combat.active.unitId;
    variant = 'combat-overlay-active';
  } else if (combat.target?.player === playerKey && combat.target.unitId) {
    unitId = combat.target.unitId;
    variant = 'combat-overlay-target';
  }

  if (!unitId) return '';

  const units = getCombatDisplayUnits(army, attachments, unitId);
  if (!units.length) return '';

  const blocks = units.map((u) => renderCombatCondensedUnit(u, state, playerKey)).join('');
  const closeAction = variant === 'combat-overlay-active' ? 'combat-select-active' : 'combat-select-target';

  return `
    <div class="combat-overlay ${variant}">
      <button type="button" class="combat-overlay-close" data-action="${closeAction}" data-unit-id="${esc(unitId)}" aria-label="Close">×</button>
      <div class="combat-overlay-body">${blocks}</div>
    </div>`;
}

function renderCombatUI(state, step) {
  if (!isCombatActionStep(step)) return '';

  const playerKey = step.player === 'p1' ? 'player1' : 'player2';
  const enemyKey = playerKey === 'player1' ? 'player2' : 'player1';
  const army = state[playerKey]?.army;
  const enemyArmy = state[enemyKey]?.army;
  if (!army?.units?.length) return '';

  const phaseLabel = step.id.endsWith('-shoot') ? 'Shooting' : 'Fighting';
  const activeId = state.combat?.active?.unitId || null;
  const targetId = state.combat?.target?.unitId || null;

  const liveUnits = army.units.filter((u) => !isUnitDead(state, playerKey, u.id));
  if (!liveUnits.length) return '';

  const activeButtons = liveUnits
    .map((u) => {
      const selected = activeId === u.id;
      const remaining = getRemainingModels(u, getUnitWoundsTaken(state, playerKey, u.id));
      return `<button type="button" class="combat-btn combat-btn-active ${selected ? 'selected' : ''}" data-action="combat-select-active" data-unit-id="${esc(u.id)}">
        <span class="combat-btn-name">${esc(u.name)}</span>
        <span class="combat-btn-meta">${remaining} model${remaining !== 1 ? 's' : ''}</span>
      </button>`;
    })
    .join('');

  let targetSection = '';
  if (activeId && enemyArmy?.units?.length) {
    const enemyLive = enemyArmy.units.filter((u) => !isUnitDead(state, enemyKey, u.id));
    const targetButtons = enemyLive
      .map((u) => {
        const selected = targetId === u.id;
        const remaining = getRemainingModels(u, getUnitWoundsTaken(state, enemyKey, u.id));
        return `<button type="button" class="combat-btn combat-btn-target ${selected ? 'selected' : ''}" data-action="combat-select-target" data-unit-id="${esc(u.id)}">
          <span class="combat-btn-name">${esc(u.name)}</span>
          <span class="combat-btn-meta">${remaining} model${remaining !== 1 ? 's' : ''}</span>
        </button>`;
      })
      .join('');

    targetSection = `
      <div class="combat-ui-target">
        <h5 class="combat-target-label">TARGET:</h5>
        <div class="combat-ui-buttons">${targetButtons}</div>
      </div>`;
  }

  return `
    <div class="combat-ui">
      <h4>${phaseLabel} — select your unit</h4>
      <p class="combat-ui-hint">Select an active unit, then pick a target. Unit details appear over each army list.</p>
      <div class="combat-ui-buttons">${activeButtons}</div>
      ${targetSection}
    </div>`;
}

function renderLeaderAttach(u, key, armyUnits, state) {
  if (!unitCanLead(u)) return '';

  const attachedId = state.leaderAttachments?.[key]?.[u.id] || '';
  const label = unitIsSupport(u) ? 'Support:' : 'Leading:';
  const options = armyUnits
    .filter((other) => other.id !== u.id)
    .map(
      (other) =>
        `<option value="${esc(other.id)}" ${other.id === attachedId ? 'selected' : ''}>${esc(other.name)}</option>`,
    )
    .join('');

  return `<label class="leader-attach">
    <em class="leader-label">${label}</em>
    <select class="leader-select" data-action="set-leader-attach" data-player="${key}" data-leader-id="${esc(u.id)}">
      <option value="">—</option>
      ${options}
    </select>
  </label>`;
}

function renderBattleShockBtn(key, groupId, shocked, show) {
  if (!show) return '';
  return `<button type="button" class="unit-shock-btn ${shocked ? 'shocked' : ''}" data-action="toggle-battle-shock" data-player="${key}" data-group-id="${esc(groupId)}">BattleShocked</button>`;
}

function renderUnitWounds(u, key, state, armyUnits) {
  const woundsTaken = getUnitWoundsTaken(state, key, u.id);
  const capacity = getUnitWoundCapacity(u);
  const attachments = state.leaderAttachments?.[key] || {};
  const groupInfo = getUnitGroupInfo({ units: armyUnits }, attachments, u.id);

  const dead = isUnitDead(state, key, u.id);
  const shocked = isGroupBattleShocked(state, key, groupInfo.groupId);
  const shockBtn = renderBattleShockBtn(key, groupInfo.groupId, shocked, !dead);

  const controls = `
      <span class="unit-wounds-label">Wounds</span>
      <div class="unit-wounds-controls">
        <button type="button" data-action="adjust-unit-wounds" data-player="${key}" data-unit-id="${esc(u.id)}" data-delta="-1">−</button>
        <span class="unit-wounds-value">${woundsTaken}</span>
        <button type="button" data-action="adjust-unit-wounds" data-player="${key}" data-unit-id="${esc(u.id)}" data-delta="1">+</button>
      </div>
      <span class="unit-wounds-cap">/ ${capacity}</span>`;

  if (key === 'player2') {
    return `<div class="unit-wounds-row unit-wounds-row-mirror">${shockBtn}${controls}</div>`;
  }
  return `<div class="unit-wounds-row">${controls}${shockBtn}</div>`;
}

function renderUnitCard(u, key, unitAbilities, state, unitIndex, unitCount, armyUnits) {
  const dead = isUnitDead(state, key, u.id);
  const attachments = state.leaderAttachments?.[key] || {};
  const groupInfo = getUnitGroupInfo({ units: armyUnits }, attachments, u.id);
  const battleShocked = !dead && isGroupBattleShocked(state, key, groupInfo.groupId);
  const wrapClass = dead ? 'is-dead' : battleShocked ? 'is-battle-shocked' : '';
  const canUp = unitIndex > 0;
  const canDown = unitIndex < unitCount - 1;
  const woundsTaken = getUnitWoundsTaken(state, key, u.id);
  const remainingModels = getRemainingModels(u, woundsTaken);
  const leaderAttach = renderLeaderAttach(u, key, armyUnits, state);
  const displayKw = getUnitDisplayKeywords(u);

  const abilityHtml =
    !dead && unitAbilities.length
      ? `<div class="unit-abilities">${unitAbilities
          .map((a) => {
            const phase = a.slot ? `<span class="ability-phase-tag">${esc(SLOT_LABELS[a.slot] || a.slot)}</span>` : '';
            return `<div class="unit-ability" title="${esc(a.description)}"><strong>${esc(a.ruleName)}</strong>${phase}</div>`;
          })
          .join('')}</div>`
      : '';

  const mainBtn = `
      <div class="unit-card unit-card-shell">
        <div class="unit-card-header">
          <div class="unit-card-title-block">
            <span class="unit-card-name">${esc(u.name)}</span>
            ${leaderAttach}
          </div>
          <span class="unit-card-pts">${u.points} pts</span>
        </div>
        <button type="button" class="unit-card-body" data-action="open-unit-detail" data-player="${key}" data-unit-id="${esc(u.id)}">
          ${u.statsLine ? `<div class="unit-card-stats">${esc(u.statsLine)}</div>` : ''}
          <div class="unit-card-meta">${remainingModels} model${remainingModels !== 1 ? 's' : ''}${u.isWarlord ? ' · Warlord' : ''}</div>
          ${displayKw.length ? `<div class="unit-card-kw">${displayKw.slice(0, 6).map(esc).join(' · ')}</div>` : ''}
          ${abilityHtml}
        </button>
        ${renderUnitWounds(u, key, state, armyUnits)}
      </div>`;

  const reorderBtns = `
      <div class="unit-reorder-btns">
        <button type="button" class="unit-reorder-btn" data-action="reorder-unit" data-player="${key}" data-unit-id="${esc(u.id)}" data-direction="up" ${canUp ? '' : 'disabled'} aria-label="Move up">▲</button>
        <button type="button" class="unit-reorder-btn" data-action="reorder-unit" data-player="${key}" data-unit-id="${esc(u.id)}" data-direction="down" ${canDown ? '' : 'disabled'} aria-label="Move down">▼</button>
      </div>`;

  const deadBtn = `<button type="button" class="unit-flag-btn unit-dead-btn ${dead ? 'dead' : ''}" data-action="toggle-unit-dead" data-player="${key}" data-unit-id="${esc(u.id)}">Dead</button>`;

  if (key === 'player2') {
    return `<div class="unit-card-wrap ${wrapClass}">${deadBtn}${mainBtn}${reorderBtns}</div>`;
  }
  return `<div class="unit-card-wrap ${wrapClass}">${mainBtn}${reorderBtns}${deadBtn}</div>`;
}

function renderArmyRuleItem(a) {
  const sourceTag =
    a.source === 'detachment'
      ? '<span class="ability-phase-tag detachment-tag">Detachment</span>'
      : '<span class="ability-phase-tag army-tag">Army</span>';
  const slotTag = `<span class="ability-phase-tag">${esc(SLOT_LABELS[a.slot] || a.slot || 'Rule')}</span>`;

  return `
    <details class="army-rule-dropdown">
      <summary class="army-rule-summary">
        <span class="army-rule-summary-text">
          <strong>${esc(a.ruleName)}</strong>
          ${sourceTag}
          ${slotTag}
        </span>
      </summary>
      <div class="army-rule-body"><p>${esc(a.description)}</p></div>
    </details>`;
}

function renderDetachmentBlock(det) {
  const rules = det.rules || [];
  const rulesHtml = rules.length
    ? rules
        .map(
          (r) => `
        <div class="detachment-rule-item">
          <strong>${esc(r.name)}</strong>
          <p>${esc(r.description)}</p>
        </div>`,
        )
        .join('')
    : '<p class="army-rules-empty">No rules found for this detachment.</p>';

  return `
    <details class="army-rule-dropdown detachment-block">
      <summary class="army-rule-summary">
        <span class="army-rule-summary-text">
          <strong>${esc(det.name)}</strong>
          <span class="ability-phase-tag detachment-tag">Detachment</span>
        </span>
      </summary>
      <div class="army-rule-body">${rulesHtml}</div>
    </details>`;
}

function renderArmyRulesBlock(army, armyRuleAbilities) {
  const detachments = army.detachments?.length
    ? army.detachments
    : army.detachment || army.detachmentRules?.length
      ? [{ name: army.detachment || 'Detachment', rules: army.detachmentRules || [] }]
      : [];

  const armyOnly = armyRuleAbilities.filter((a) => a.source === 'army');
  const hasMeta = army.forceDisposition || detachments.length > 0;
  const hasArmyRules = armyOnly.length > 0;
  if (!hasMeta && !hasArmyRules) return '';

  const dispositionLine = army.forceDisposition
    ? `<p class="army-rules-meta"><span class="army-rules-meta-label">Force Disposition:</span> ${esc(army.forceDisposition)}</p>`
    : '';
  const detachmentBlocks = detachments.map((d) => renderDetachmentBlock(d)).join('');
  const armyRules = armyOnly.map((a) => renderArmyRuleItem(a)).join('');

  return `
    <div class="army-rules-block">
      <h4>Army &amp; Detachment Rules</h4>
      ${dispositionLine}
      ${detachmentBlocks ? `<div class="army-detachments-list">${detachmentBlocks}</div>` : ''}
      ${armyRules ? `<div class="army-rules-list">${armyRules}</div>` : ''}
    </div>`;
}

function renderArmyPanel(player, key, state) {
  const army = player.army;
  if (!army) {
    return `
      <div class="army-panel army-empty" data-player="${key}">
        <h3>${key === 'player1' ? 'Player 1' : 'Player 2'}</h3>
        <label class="file-btn">
          Load Army (.json)
          <input type="file" accept=".json,application/json" data-action="load-army" data-player="${key}" hidden />
        </label>
        ${renderNewRecruitHint()}
      </div>`;
  }

  const allAbilities = listAllAbilities(army);
  const abilitiesByUnit = new Map();
  for (const a of allAbilities) {
    const list = abilitiesByUnit.get(a.unitName) || [];
    list.push(a);
    abilitiesByUnit.set(a.unitName, list);
  }

  const armyRuleAbilities = allAbilities.filter((a) => a.source === 'army' || a.source === 'detachment');

  const units = army.units
    .map((u, i) => {
      const unitAbilities = abilitiesByUnit.get(u.name) || [];
      return renderUnitCard(u, key, unitAbilities, state, i, army.units.length, army.units);
    })
    .join('');

  return `
    <div class="army-panel" data-player="${key}">
      <div class="army-panel-header">
        <div>
          <h3>${esc(army.name)}</h3>
          <p class="army-meta">${esc(army.faction)} · ${army.points}/${army.pointsLimit} pts</p>
        </div>
        <button type="button" class="btn-small" data-action="clear-army" data-player="${key}">Clear</button>
      </div>
      <label class="file-btn btn-small">
        Replace
        <input type="file" accept=".json,application/json" data-action="load-army" data-player="${key}" hidden />
      </label>
      ${renderArmyRulesBlock(army, armyRuleAbilities)}
      <div class="unit-list">${units}</div>
      ${renderCombatOverlay(state, key)}
    </div>`;
}

function renderUnitPhaseChecklist(state, step) {
  if (!isUnitChecklistStep(step)) return '';

  const player = step.player === 'p1' ? state.player1 : state.player2;
  const army = player?.army;
  if (!army?.units?.length) return '';

  const phaseKey = getUnitPhaseKey(step);
  const usedSet = new Set(state.unitPhaseUsed?.[phaseKey] || []);
  const phaseNames = { movement: 'Movement', shooting: 'Shooting', charge: 'Charge', fight: 'Fight' };

  const playerKey = step.player === 'p1' ? 'player1' : 'player2';
  const liveUnits = army.units.filter((u) => !isUnitDead(state, playerKey, u.id));
  if (!liveUnits.length) return '';

  const buttons = liveUnits
    .map((u) => {
      const used = usedSet.has(u.id);
      const remaining = getRemainingModels(u, getUnitWoundsTaken(state, playerKey, u.id));
      return `<button type="button" class="unit-phase-btn ${used ? 'used' : ''}" data-action="toggle-unit-used" data-unit-id="${esc(u.id)}">
        <span class="unit-phase-btn-name">${esc(u.name)}</span>
        <span class="unit-phase-btn-meta">${remaining} model${remaining !== 1 ? 's' : ''}</span>
      </button>`;
    })
    .join('');

  return `
    <div class="unit-phase-checklist">
      <h4>${phaseNames[step.phase] || step.phase} — mark units as you go</h4>
      <p class="unit-phase-hint">Tap each unit when you've finished with it this phase. Optional — not required to advance.</p>
      <div class="unit-phase-buttons">${buttons}</div>
    </div>`;
}

function renderFullChecklist(state) {
  const checklist = state.flow
    .map((s, i) => {
      const done = state.completedSteps[s.id] || i < state.stepIndex;
      const current = i === state.stepIndex;
      const cls = `check-item ${done ? 'done' : ''} ${current ? 'current' : ''}`;
      return `<button type="button" class="${cls}" data-action="goto-step" data-index="${i}">
        <span class="check-dot"></span>
        <span class="check-text">${esc(s.label)}</span>
      </button>`;
    })
    .join('');

  return `
    <details class="checklist-panel checklist-bottom">
      <summary>Full checklist (${state.flow.length} steps)</summary>
      <div class="checklist">${checklist}</div>
    </details>`;
}

function renderSummaryPlayerCol(slice, align) {
  if (!slice) {
    return `<td class="summary-col summary-${align}"><span class="summary-empty">—</span></td>`;
  }
  return `<td class="summary-col summary-${align}">
    <span class="summary-stat">SEC: <strong>${slice.secondary}</strong></span>
    <span class="summary-stat">PRIM: <strong>${slice.primary}</strong></span>
    <span class="summary-stat summary-total-stat">TOTAL: <strong>${slice.total}</strong></span>
  </td>`;
}

function renderBattleSummary(state) {
  const p1Name = esc(state.player1.army?.name || state.player1.name);
  const p2Name = esc(state.player2.army?.name || state.player2.name);
  const finalP1 = totalScore(state.player1.score);
  const finalP2 = totalScore(state.player2.score);
  const snapshots = state.roundSnapshots || {};

  const roundRows = [];
  for (let r = 1; r <= MAX_BATTLE_ROUNDS; r++) {
    const snap = snapshots[r];
    roundRows.push(`
      <tr class="summary-round-row">
        <th class="summary-round-label" colspan="3">Round ${r}</th>
      </tr>
      <tr class="summary-score-row">
        ${renderSummaryPlayerCol(snap?.player1, 'left')}
        <td class="summary-vs-col"></td>
        ${renderSummaryPlayerCol(snap?.player2, 'right')}
      </tr>`);
  }

  const battleReadyRow =
    state.battleReady?.player1 || state.battleReady?.player2
      ? `
      <tr class="summary-battle-ready-row">
        <td class="summary-col summary-left">${state.battleReady?.player1 ? '<em>Battle Ready?</em> <strong>+10 VP</strong>' : ''}</td>
        <td class="summary-vs-col"></td>
        <td class="summary-col summary-right">${state.battleReady?.player2 ? '<em>Battle Ready?</em> <strong>+10 VP</strong>' : ''}</td>
      </tr>`
      : '';

  return `
    <div class="guide-center guide-summary">
      <div class="step-nav step-nav-top">
        <button type="button" data-action="prev-step">← Previous</button>
        <span class="step-counter">Game Summary</span>
        <button type="button" class="btn-primary" data-action="next-step" disabled>Next Step →</button>
      </div>
      <div class="summary-panel">
        <h2 class="summary-title">Game Summary</h2>
        <div class="summary-army-names">
          <span class="summary-army-p1">${p1Name}</span>
          <span class="summary-final-score">${finalP1} <span class="summary-v">v</span> ${finalP2}</span>
          <span class="summary-army-p2">${p2Name}</span>
        </div>
        <div class="summary-final-breakdown">
          <div class="summary-breakdown-p1">
            <span>SEC: <strong>${state.player1.score.secondary}</strong></span>
            <span>PRIM: <strong>${state.player1.score.primary}</strong></span>
          </div>
          <div class="summary-breakdown-p2">
            <span>PRIM: <strong>${state.player2.score.primary}</strong></span>
            <span>SEC: <strong>${state.player2.score.secondary}</strong></span>
          </div>
        </div>
        <table class="summary-table">
          <thead>
            <tr>
              <th class="summary-col summary-left">${p1Name}</th>
              <th class="summary-vs-col"></th>
              <th class="summary-col summary-right">${p2Name}</th>
            </tr>
          </thead>
          <tbody>
            ${roundRows.join('')}
            ${battleReadyRow}
          </tbody>
        </table>
        <p class="summary-footnote">Round totals are snapshots taken when you complete each <strong>End of Battle Round</strong> step. VP changes during a round appear in that round’s row once the round ends.</p>
      </div>
    </div>`;
}

function renderFormationsDeepStrike(state) {
  const step = getCurrentStep(state);
  if (step?.id !== 'setup-formations') return '';

  function renderPlayerList(player, label) {
    const army = player?.army;
    if (!army?.units?.length) return '';

    const units = army.units.filter((u) => unitHasDeepStrike(u));
    if (!units.length) {
      return `
        <div class="formations-ds-player">
          <h5>${esc(label)}</h5>
          <p class="formations-ds-empty">No Deep Strike units</p>
        </div>`;
    }

    const items = units
      .map((u) => `<li class="formations-ds-unit">${esc(u.name)}</li>`)
      .join('');

    return `
      <div class="formations-ds-player">
        <h5>${esc(label)}</h5>
        <ul class="formations-ds-list">${items}</ul>
      </div>`;
  }

  const p1Block = renderPlayerList(state.player1, state.player1.army?.name || 'Player 1');
  const p2Block = renderPlayerList(state.player2, state.player2.army?.name || 'Player 2');

  return `
    <div class="formations-deep-strike">
      <h4>Deep Strike units</h4>
      <p class="formations-ds-hint">These units can be placed in Strategic Reserves during Declare Battle Formations.</p>
      <div class="formations-ds-players">${p1Block}${p2Block}</div>
    </div>`;
}

function renderGuideCenter(state) {
  const step = getCurrentStep(state);
  if (!state.started || !step) {
    const canStart = state.player1.army && state.player2.army;
    return `
      <div class="guide-center guide-welcome">
        <h2>Battle Guide</h2>
        <p>Load both army rosters, then begin. This guide walks you through every phase and step from the Core Rules — click <strong>Next Step</strong> as you play on the tabletop.</p>
        ${renderNewRecruitHint()}
        <ul class="welcome-list">
          <li>Setup &amp; Deployment (12 steps)</li>
          <li>5 Battle Rounds with full turn sequence</li>
          <li>Army abilities auto-placed in the correct phase</li>
          <li>Scoreboard: CP · Secondary VP · Primary VP · Total</li>
        </ul>
        <button type="button" class="btn-primary" data-action="start-game" ${canStart ? '' : 'disabled'}>
          ${canStart ? 'Begin Battle Guide' : 'Load both armies first'}
        </button>
      </div>`;
  }

  if (step.id === 'battle-summary') {
    return renderBattleSummary(state);
  }

  const phaseLabel = getPhaseGroupLabel(step);
  const firstTurnPicker =
    step.id === 'setup-first-turn'
      ? `
      <div class="first-turn-picker">
        <h4>Who takes the first turn each battle round?</h4>
        <p class="first-turn-hint">This sets turn order for all 5 battle rounds.</p>
        <div class="first-turn-options">
          <button type="button" class="first-turn-btn ${state.firstPlayer === 'player1' ? 'selected' : ''}" data-action="set-first-player" data-player="player1">
            <span class="first-turn-side">Left</span>
            <strong>${esc(state.player1.army?.name || state.player1.name)}</strong>
          </button>
          <button type="button" class="first-turn-btn ${state.firstPlayer === 'player2' ? 'selected' : ''}" data-action="set-first-player" data-player="player2">
            <span class="first-turn-side">Right</span>
            <strong>${esc(state.player2.army?.name || state.player2.name)}</strong>
          </button>
        </div>
      </div>`
      : '';

  const stepAbilities = getAllAbilitiesForStep(state, step);
  const abilities = stepAbilities
    .map(
      (a) => `
      <div class="ability-reminder ${a.player === 'p1' ? 'p1' : 'p2'}">
        <div class="ability-header">
          <span class="ability-player">${a.player === 'p1' ? 'P1' : 'P2'}</span>
          <strong>${esc(a.unitName)}</strong> — ${esc(a.ruleName)}
          ${a.source === 'army' || a.source === 'detachment' ? '<span class="ability-army-tag">Army rule</span>' : ''}
          ${a.timing === 'either' ? '<span class="ability-timing-tag">Either player</span>' : ''}
          ${a.timing === 'opponent' ? '<span class="ability-timing-tag opponent">Opponent\'s phase</span>' : ''}
        </div>
        <p>${esc(a.description)}</p>
      </div>`,
    )
    .join('');

  const unitChecklist = renderUnitPhaseChecklist(state, step);
  const combatUI = renderCombatUI(state, step);
  const formationsDeepStrike = renderFormationsDeepStrike(state);

  return `
    <div class="guide-center">
      <div class="step-nav step-nav-top">
        <button type="button" data-action="prev-step" ${state.stepIndex === 0 ? 'disabled' : ''}>← Previous</button>
        <span class="step-counter">Step ${state.stepIndex + 1} of ${state.flow.length}</span>
        <button type="button" class="btn-primary" data-action="next-step" ${state.stepIndex >= state.flow.length - 1 ? 'disabled' : ''}>Next Step →</button>
      </div>
      <div class="step-content">
        <div class="step-card">
          <div class="step-phase">${esc(phaseLabel)}</div>
          <h2 class="step-title">${esc(step.label)}</h2>
          <p class="step-detail">${esc(step.detail)}</p>
          <p class="step-ref">${esc(step.ruleRef || '')}</p>
          ${firstTurnPicker}
          ${abilities ? `<div class="ability-list"><h4>Abilities to use now (${stepAbilities.length})</h4>${abilities}</div>` : ''}
        </div>
        ${unitChecklist}
        ${formationsDeepStrike}
        ${combatUI}
      </div>
    </div>`;
}

function saveArmyPanelScroll(root) {
  const saved = {};
  if (!root) return saved;
  for (const el of root.querySelectorAll('.army-panel[data-player]')) {
    saved[el.dataset.player] = el.scrollTop;
  }
  return saved;
}

function restoreArmyPanelScroll(root, saved) {
  if (!root || !saved) return;
  requestAnimationFrame(() => {
    for (const el of root.querySelectorAll('.army-panel[data-player]')) {
      const top = saved[el.dataset.player];
      if (top != null) el.scrollTop = top;
    }
  });
}

export function renderGuide(root, state, dispatch) {
  if (state.viewMode === 'battleSim') {
    renderBattleSim(root, state, dispatch);
    return;
  }

  const armyScroll = saveArmyPanelScroll(root);
  const step = getCurrentStep(state);
  const isSummary = step?.id === 'battle-summary';

  root.innerHTML = `
    <div class="guide-app">
      ${renderScoreboard(state)}
      <main class="guide-main${isSummary ? ' guide-main-summary' : ''}">
        ${renderArmyPanel(state.player1, 'player1', state)}
        ${renderGuideCenter(state)}
        ${renderArmyPanel(state.player2, 'player2', state)}
      </main>
      <footer class="guide-footer">
        ${state.started ? renderFullChecklist(state) : ''}
        <div class="guide-footer-bar">
          Warhammer 40,000 Battle Companion · Step ${state.stepIndex + 1}/${state.flow.length || '—'}
          <button type="button" class="btn-link" data-action="set-view-mode" data-mode="battleSim">Battle Map</button>
          <button type="button" class="btn-link" data-action="reset-game">Reset</button>
          <button type="button" class="btn-link" data-action="save-game">Save</button>
        </div>
      </footer>
      ${renderUnitDetailModal(state)}
      ${renderKeywordRulePopover(state)}
    </div>`;

  bindGuideEvents(root, dispatch);
  restoreArmyPanelScroll(root, armyScroll);
}

function bindGuideEvents(root, dispatch) {
  root.querySelector('[data-action="start-game"]')?.addEventListener('click', () => dispatch({ type: 'START_GAME' }));
  root.querySelector('[data-action="next-step"]')?.addEventListener('click', () => dispatch({ type: 'NEXT_STEP' }));
  root.querySelector('[data-action="prev-step"]')?.addEventListener('click', () => dispatch({ type: 'PREV_STEP' }));
  root.querySelector('[data-action="reset-game"]')?.addEventListener('click', () => {
    if (confirm('Reset the battle guide? Armies and scores will be cleared.')) dispatch({ type: 'RESET_GAME' });
  });
  root.querySelector('[data-action="save-game"]')?.addEventListener('click', () => dispatch({ type: 'SAVE' }));

  root.querySelectorAll('[data-action="set-view-mode"]').forEach((btn) => {
    btn.addEventListener('click', () => dispatch({ type: 'SET_VIEW_MODE', mode: btn.dataset.mode }));
  });

  root.querySelectorAll('[data-action="goto-step"]').forEach((btn) => {
    btn.addEventListener('click', () => dispatch({ type: 'GOTO_STEP', index: Number(btn.dataset.index) }));
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

  root.querySelectorAll('[data-action="clear-army"]').forEach((btn) => {
    btn.addEventListener('click', () => dispatch({ type: 'CLEAR_ARMY', player: btn.dataset.player }));
  });

  root.querySelectorAll('[data-action="set-first-player"]').forEach((btn) => {
    btn.addEventListener('click', () => dispatch({ type: 'SET_FIRST_PLAYER', player: btn.dataset.player }));
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

  root.querySelectorAll('[data-action="toggle-battle-shock"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dispatch({ type: 'TOGGLE_BATTLE_SHOCK', player: btn.dataset.player, groupId: btn.dataset.groupId });
    });
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

  root.querySelectorAll('[data-action="toggle-battle-ready"]').forEach((btn) => {
    btn.addEventListener('click', () => dispatch({ type: 'TOGGLE_BATTLE_READY', player: btn.dataset.player }));
  });

  root.querySelectorAll('[data-action="reorder-unit"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dispatch({
        type: 'REORDER_UNIT',
        player: btn.dataset.player,
        unitId: btn.dataset.unitId,
        direction: btn.dataset.direction,
      });
    });
  });

  root.querySelectorAll('[data-action="toggle-unit-dead"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dispatch({ type: 'TOGGLE_UNIT_DEAD', player: btn.dataset.player, unitId: btn.dataset.unitId });
    });
  });

  root.querySelectorAll('[data-action="toggle-unit-used"]').forEach((btn) => {
    btn.addEventListener('click', () => dispatch({ type: 'TOGGLE_UNIT_USED', unitId: btn.dataset.unitId }));
  });

  root.querySelectorAll('[data-action="combat-select-active"]').forEach((btn) => {
    btn.addEventListener('click', () => dispatch({ type: 'COMBAT_SELECT_ACTIVE', unitId: btn.dataset.unitId }));
  });

  root.querySelectorAll('[data-action="combat-select-target"]').forEach((btn) => {
    btn.addEventListener('click', () => dispatch({ type: 'COMBAT_SELECT_TARGET', unitId: btn.dataset.unitId }));
  });

  root.querySelectorAll('[data-action="open-unit-detail"]').forEach((btn) => {
    btn.addEventListener('click', () =>
      dispatch({ type: 'OPEN_UNIT_DETAIL', player: btn.dataset.player, unitId: btn.dataset.unitId }),
    );
  });

  root.querySelector('.unit-modal-backdrop')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('unit-modal-backdrop')) {
      dispatch({ type: 'CLOSE_UNIT_DETAIL' });
    }
  });
  root.querySelector('.unit-modal-close')?.addEventListener('click', () => dispatch({ type: 'CLOSE_UNIT_DETAIL' }));
  root.querySelector('.unit-modal')?.addEventListener('click', (e) => e.stopPropagation());

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
}
