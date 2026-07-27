/**
 * Parses New Recruit / army-builder stratagem HTML exports
 * (e.g. "Strike Force Black Anvil.html") into a deck list.
 */

const PHASE_CLASS_MAP = [
  { className: 'strMovement', label: 'Movement' },
  { className: 'strShooting', label: 'Shooting' },
  { className: 'strCharge', label: 'Charge' },
  { className: 'strFight', label: 'Fight' },
  { className: 'strCommand', label: 'Command' },
  { className: 'strAny', label: 'Any' },
];

const TURN_LABELS = {
  player: 'Your turn',
  opponent: "Opponent's turn",
  either: 'Either turn',
};

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

/** Allow only simple formatting tags from stratagem exports. */
export function sanitizeStratagemHtml(html) {
  return String(html || '')
    .replace(/<(?!\/?(?:b|br|strong|i|em)\b)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '');
}

function detectTurn(stratEl) {
  if (!stratEl) return 'player';
  if (stratEl.classList.contains('opponentTurn')) return 'opponent';
  if (stratEl.classList.contains('eitherTurn')) return 'either';
  return 'player';
}

function detectPhases(container) {
  const phases = [];
  for (const { className, label } of PHASE_CLASS_MAP) {
    if (container.querySelector(`.${className}`)) phases.push(label);
  }
  return phases;
}

/**
 * @param {string} html
 * @returns {{ name: string, cp: number, turn: string, turnLabel: string, phases: string[], descriptionHtml: string, descriptionText: string, id: string }[]}
 */
export function parseStratagemHtml(html) {
  if (!html || typeof html !== 'string') {
    throw new Error('Stratagem file is empty.');
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const containers = [...doc.querySelectorAll('.container')];
  if (!containers.length) {
    throw new Error('No stratagems found. Export the stratagem deck as HTML from your army builder.');
  }

  const deck = [];
  const seen = new Map();

  for (let i = 0; i < containers.length; i++) {
    const el = containers[i];
    const name = el.querySelector('.name')?.textContent?.trim();
    if (!name) continue;

    const stratEl = el.querySelector('.stratagem');
    const descEl = el.querySelector('.description');
    const cpRaw = el.querySelector('.strCP')?.textContent?.trim() || '0';
    const cp = Math.max(0, parseInt(cpRaw, 10) || 0);
    const turn = detectTurn(stratEl);
    const phases = detectPhases(el);
    const descriptionHtml = sanitizeStratagemHtml(descEl?.innerHTML || '');
    const descriptionText = (descEl?.textContent || '').replace(/\s+/g, ' ').trim();

    const baseId = `strat-${slugify(name) || i}`;
    const count = (seen.get(baseId) || 0) + 1;
    seen.set(baseId, count);
    const id = count > 1 ? `${baseId}-${count}` : baseId;

    deck.push({
      id,
      name,
      cp,
      turn,
      turnLabel: TURN_LABELS[turn] || TURN_LABELS.player,
      phases,
      descriptionHtml,
      descriptionText,
    });
  }

  if (!deck.length) {
    throw new Error('No stratagems found in that HTML file.');
  }

  return deck;
}

export function normalizeStratagemDeck(deck) {
  if (!Array.isArray(deck)) return [];
  return deck
    .filter((s) => s && typeof s === 'object' && s.name)
    .map((s, i) => ({
      id: String(s.id || `strat-${i}`),
      name: String(s.name),
      cp: Math.max(0, Number(s.cp) || 0),
      turn: s.turn === 'opponent' || s.turn === 'either' ? s.turn : 'player',
      turnLabel: String(s.turnLabel || TURN_LABELS[s.turn] || TURN_LABELS.player),
      phases: Array.isArray(s.phases) ? s.phases.map(String) : [],
      descriptionHtml: sanitizeStratagemHtml(s.descriptionHtml || ''),
      descriptionText: String(s.descriptionText || ''),
    }));
}
