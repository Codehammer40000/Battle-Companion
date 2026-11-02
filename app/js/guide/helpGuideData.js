/**
 * Searchable in-app instructions for Battle Map.
 * Sections: General, Play, Battle Map.
 */

export const HELP_GUIDE_SECTIONS = [
  {
    id: 'general',
    title: 'General',
    blurb: 'Getting started, uploads, official app tips, and saving your game.',
    items: [
      {
        id: 'gen-what',
        title: 'What this app is',
        keywords: 'overview battle map browser play aid online',
        body: [
          'Battle Map is a browser play surface for Warhammer 40,000: load armies, deploy models, track scores, and advance phases.',
          'Place models on terrain layouts, check ranges, and preview line of sight during shooting.',
          'Reminder! chips surface army/unit rules for the current phase. Stratagem decks are available from the scoreboard.',
        ],
      },
      {
        id: 'gen-official-app',
        title: 'Best practice: official 40k app for missions + secondaries',
        keywords: 'official app warhammer app secondaries mission draw cards primary',
        body: [
          'Create and run the matched play / Event Companion game in the official Warhammer 40,000 app when you can.',
          'Use that app to set the mission, draw or choose secondaries, and keep the official mission card flow.',
          'This Battle Map does not replace mission generation or secondary draws — enter Secondary and Primary VP on the scoreboard as you score them.',
          'Keep both apps open: official app for mission/secondaries, Battle Map for armies, stratagems, board, and phase tracking.',
        ],
      },
      {
        id: 'gen-upload-army',
        title: 'Upload army lists (.json)',
        keywords: 'upload army roster json newrecruit load replace clear',
        body: [
          'On each side panel, use Load Army (.json) for Player 1 and Player 2.',
          'Export your list as JSON from New Recruit (newrecruit.eu) or a compatible army builder.',
          'After loading, use Replace or Clear on that side’s panel header.',
          'Load both armies, pick who goes first in the Start battle card, then Begin Battle.',
        ],
      },
      {
        id: 'gen-upload-stratagems',
        title: 'Upload stratagem decks (.html)',
        keywords: 'stratagems deck html upload cp cost export',
        body: [
          'Click Stratagems next to Battle Ready Army on either side.',
          'Export your stratagems as HTML from your army builder, then Upload deck (.html).',
          'The panel lists each stratagem with CP cost, timing, phases, and full rules text.',
          'Decks are per side and stay loaded if you replace an army JSON. Use Clear inside the Stratagems panel to remove a deck.',
        ],
      },
      {
        id: 'gen-scoreboard',
        title: 'Scoreboard controls',
        keywords: 'cp secondary primary total battle ready vp score',
        body: [
          'Top bar tracks CP, Sec (secondary VP), Prim (primary VP), and Total for each player.',
          'Use − / + to adjust scores as you play.',
          'Each Command Phase awards 1 Core CP to both players automatically.',
          'Battle Ready Army toggles +10 primary VP for that side when marked battle-ready.',
          'Stratagems opens that player’s stratagem deck viewer (reference — spend CP on the scoreboard when you use one).',
        ],
      },
      {
        id: 'gen-save-reset',
        title: 'Save, restore, and reset',
        keywords: 'save reset localstorage browser refresh',
        body: [
          'Save stores the current game in this browser (armies, scores, map, progress).',
          'Refresh or reopen the same browser to continue a saved game when restore runs on load.',
          'Reset clears the battle session (armies and scores) after confirmation — use carefully.',
        ],
      },
      {
        id: 'gen-offline',
        title: 'Offline / local play',
        keywords: 'offline launch-offline bat play.html file',
        body: [
          'On a local copy of the project, double-click launch-offline.bat to rebuild and open the single-file play.html.',
          'The live GitHub Pages site works in any modern browser; core play does not need a server once the page is loaded.',
        ],
      },
    ],
  },
  {
    id: 'play',
    title: 'Play',
    blurb: 'Phases, armies, attachments, wounds, and combat on the map.',
    items: [
      {
        id: 'play-start',
        title: 'Start a battle',
        keywords: 'begin battle first player next previous phase',
        body: [
          'Load both army JSONs in the side panels.',
          'Pick who goes first, then press Begin Battle.',
          'Advance with ← / → under the turn label: short setup, then Command / Movement / Shooting / Charge / Fight each turn.',
        ],
      },
      {
        id: 'play-phases',
        title: 'Phases and Reminder!',
        keywords: 'command movement shooting charge fight battle round reminder',
        body: [
          'Reminder! chips show army and unit rules that usually matter in the current phase.',
          'Dead units (0 wounds remaining) do not show Reminder! chips.',
          'During Command Phase, battle-shock highlights can mark units that must test.',
        ],
      },
      {
        id: 'play-army',
        title: 'Army panels, attach, wounds',
        keywords: 'unit card weapons abilities wounds attach leader support battleshock',
        body: [
          'Select a unit in the side list or on the map to open its card (weapons, abilities, wounds).',
          'Attach leaders/support to bodyguards with the Leading / Support dropdown on the unit card.',
          'Adjust wounds with − / +. Hitting 0 hides models but keeps attachments — healing restores them by the leader.',
          'Toggle BattleShocked when a group fails (or is affected by) battle-shock.',
        ],
      },
      {
        id: 'play-combat',
        title: 'Shooting and fight on the map',
        keywords: 'combat active target overlay shoot fight select los range',
        body: [
          'In Shooting or Fight, click your unit then an enemy on the map to set active/target.',
          'Click a ranged weapon name for a range ring. LoS preview appears when both sides are set in shooting.',
          'Resolve dice on the table (or however you play); the map is the board and measure aid.',
        ],
      },
    ],
  },
  {
    id: 'battle-map',
    title: 'Battle Map',
    blurb: 'Layouts, deploy/move models, camera, ranges, LoS, and custom terrain import.',
    items: [
      {
        id: 'map-layouts',
        title: 'Choose a terrain layout',
        keywords: 'layout terrain deployment zones priority assets search destroy meatgrinder flip rotate mirror',
        body: [
          'Use the Layout dropdown to pick a built-in board (blank grid or Event Companion-style layouts).',
          'Flip mirrors left/right; Rotate 90° turns clockwise; Reset orient restores facing. Models move with terrain.',
          'Choose Add new… to import a Rapid Ingress layout.',
        ],
      },
      {
        id: 'map-deploy',
        title: 'Deploy and withdraw units',
        keywords: 'deploy withdraw staging models markers',
        body: [
          'Press Deploy on a unit to place its models in off-board staging for that player.',
          'Attached leaders deploy with their bodyguard group.',
          'Withdraw removes that unit’s models from the map.',
          'Player 1 models are blue; Player 2 models are green.',
        ],
      },
      {
        id: 'map-move',
        title: 'Select and move models',
        keywords: 'drag move pan select unit right click rotate frame',
        body: [
          'Left-drag a model to move that model. Right-drag moves the whole unit group.',
          'Click empty board space (without dragging) to clear selection. Drag empty space to pan.',
          'Frame hulls: select one, then drag the yellow handle ahead of the nose to set facing.',
        ],
      },
      {
        id: 'map-ranges',
        title: 'Move and weapon range rings',
        keywords: 'range ring move charge shoot weapon select',
        body: [
          'With a model selected in Movement, a ring shows approximate reach from the base edge.',
          'In Shooting, click a ranged weapon name on the unit card for that weapon’s range ring.',
        ],
      },
      {
        id: 'map-los',
        title: 'Line of sight preview',
        keywords: 'los line of sight obscure terrain shooting see',
        body: [
          'In Shooting, with active shooter and target set, LoS rays highlight attackers with a clear shot.',
          'Treat the preview as a play aid, not a tournament judge.',
        ],
      },
      {
        id: 'map-markers',
        title: 'Special markers',
        keywords: 'special marker objective token reminder',
        body: [
          'Add special marker places a purple token you can drag.',
          'Select a marker to show Remove marker.',
        ],
      },
      {
        id: 'map-import',
        title: 'Import custom layout (Rapid Ingress)',
        keywords: 'import add new rapid ingress html terrain-data-11e custom layout',
        body: [
          'Choose Add new… in the Layout dropdown.',
          'Upload a saved Rapid Ingress layout page (Complete webpage), preferably with terrain-data-11e.js from the _files folder.',
          'Pick the RI layout id, name it, then Import & use. Customs are stored in this browser.',
        ],
      },
    ],
  },
];

export function searchHelpGuide(query) {
  const q = String(query || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!q) {
    return HELP_GUIDE_SECTIONS.map((s) => ({
      ...s,
      items: s.items.slice(),
    }));
  }
  const terms = q.split(' ').filter(Boolean);
  return HELP_GUIDE_SECTIONS.map((section) => {
    const items = section.items.filter((item) => {
      const hay = `${section.title} ${item.title} ${(item.body || []).join(' ')} ${item.keywords || ''}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
    return { ...section, items };
  }).filter((s) => s.items.length > 0);
}
