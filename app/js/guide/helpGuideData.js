/**
 * Searchable in-app instructions for Battle Companion.
 * Sections: General, Companion, Battle Map.
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
        keywords: 'overview companion battle map browser play aid',
        body: [
          'Battle Companion is a browser play aid for Warhammer 40,000 tabletop games.',
          'Use Companion to walk Core Rules phases, track scores, and see ability reminders.',
          'Use Battle Map to place models on terrain layouts, check ranges, and preview line of sight.',
          'Play on the physical table; use this app as your digital reference and tracker.',
        ],
      },
      {
        id: 'gen-official-app',
        title: 'Best practice: official 40k app for the game + secondaries',
        keywords: 'official app warhammer app secondaries mission draw cards primary',
        body: [
          'Create and run the matched play / Event Companion game in the official Warhammer 40,000 app when you can.',
          'Use that app to set the mission, draw or choose secondaries, and keep the official mission card flow.',
          'Battle Companion does not replace mission generation or secondary draws — enter Secondary and Primary VP on the scoreboard as you score them in the official flow.',
          'Keep both apps open: official app for mission/secondaries, Battle Companion for phase guide, armies, stratagems, and the map.',
        ],
      },
      {
        id: 'gen-upload-army',
        title: 'Upload army lists (.json)',
        keywords: 'upload army roster json newrecruit load replace clear',
        body: [
          'In Companion, use Load Army (.json) on Player 1 and Player 2.',
          'Export your list as JSON from New Recruit (newrecruit.eu) or a compatible army builder.',
          'After loading, you can Replace a side’s list or Clear it from the army panel.',
          'Load both armies before Begin Battle Guide. Battle Map uses the same loaded armies.',
        ],
      },
      {
        id: 'gen-upload-stratagems',
        title: 'Upload stratagem decks (.html)',
        keywords: 'stratagems deck html upload cp cost export',
        body: [
          'Click Stratagems next to Battle Ready Army on either side (Companion or Battle Map).',
          'Export your stratagems as HTML from your army builder, then Upload deck (.html).',
          'The panel lists each stratagem with CP cost, timing (your / opponent / either turn), phases, and full rules text.',
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
          'Battle Ready Army toggles +10 primary VP for that side when marked battle-ready.',
          'Stratagems opens that player’s stratagem deck viewer.',
        ],
      },
      {
        id: 'gen-views',
        title: 'Companion vs Battle Map',
        keywords: 'view mode companion battle map switch',
        body: [
          'Use the Companion / Battle Map buttons in the center of the top bar to switch views.',
          'Companion: phase steps, army cards, ability reminders, checklists.',
          'Battle Map: terrain layout, deploy/move models, ranges, LoS during shooting.',
          'Scores, armies, stratagems, and guide progress are shared between views.',
        ],
      },
      {
        id: 'gen-save-reset',
        title: 'Save, restore, and reset',
        keywords: 'save reset localstorage browser refresh',
        body: [
          'Save stores the current game in this browser (armies, scores, map, progress).',
          'Refresh or reopen the same browser to continue a saved game when restore runs on load.',
          'Reset clears the battle guide session (armies and scores) after confirmation — use carefully.',
        ],
      },
      {
        id: 'gen-offline',
        title: 'Offline / local play',
        keywords: 'offline launch-offline bat play.html file',
        body: [
          'On a local copy of the project, double-click launch-offline.bat to rebuild and open the single-file play.html.',
          'The live GitHub Pages site works in any modern browser with an internet connection for fonts; core play does not need a server once the page is loaded.',
        ],
      },
    ],
  },
  {
    id: 'companion',
    title: 'Companion',
    blurb: 'Phase guide, army panels, abilities, combat helpers, and score tracking.',
    items: [
      {
        id: 'comp-start',
        title: 'Start the Battle Guide',
        keywords: 'begin battle guide next step previous start',
        body: [
          'Load both army JSONs on the home screen.',
          'Press Begin Battle Guide when both sides are loaded.',
          'Advance with Next Step; go back with Previous. The top progress bar tracks where you are.',
          'Follow each step on the tabletop, then click Next Step when that rule step is done.',
        ],
      },
      {
        id: 'comp-phases',
        title: 'Phases, turns, and first player',
        keywords: 'command movement shooting charge fight battle round first turn',
        body: [
          'The guide covers setup/deployment, then five battle rounds with the full turn sequence.',
          'On the Who goes first step, pick Left or Right — that sets turn order for all five rounds.',
          'Ability reminders for army/detachment/unit rules appear on the steps where they usually matter.',
          'Optional unit checklists in some phases let you mark units finished for that phase (not required to advance).',
        ],
      },
      {
        id: 'comp-army-cards',
        title: 'Army panels and unit details',
        keywords: 'unit card keywords weapons abilities wounds dead reorder attach leader',
        body: [
          'Each side’s army list shows units, wounds remaining, and key stats.',
          'Open a unit for full keywords, abilities, and weapon profiles. Keyword links open short rule popovers when available.',
          'Adjust wounds with − / +, mark units destroyed, and reorder the list if needed.',
          'Attach leaders/support to bodyguards with the attach controls before or during deployment as your rules allow.',
          'Toggle BattleShocked on a unit/group when they fail (or pass via stratagem) battle-shock as needed for reminders.',
        ],
      },
      {
        id: 'comp-combat',
        title: 'Shooting / fight helpers in Companion',
        keywords: 'combat active target overlay shoot fight select',
        body: [
          'On combat action steps, pick an active unit then a target — overlays show weapons and details on the army columns.',
          'This tracks who is shooting/fighting whom for reference; resolve dice and wounds on the table (or use Battle Map LoS/ranges as a visual aid).',
        ],
      },
      {
        id: 'comp-formations',
        title: 'Deep Strike / Strategic Reserves reminder',
        keywords: 'deep strike formations reserves ingress',
        body: [
          'During Declare Battle Formations, the guide lists Deep Strike-capable units as a reminder for Strategic Reserves.',
          'Place reserves and ingresses on the table (and optionally on Battle Map) according to the Core Rules.',
        ],
      },
      {
        id: 'comp-summary',
        title: 'End of battle summary',
        keywords: 'summary battle ready rounds vp',
        body: [
          'After five rounds, the summary shows round VP snapshots and Battle Ready awards.',
          'Round totals lock when you complete each End of Battle Round step — keep entering VP as you go.',
        ],
      },
      {
        id: 'comp-stratagems',
        title: 'Using stratagems during Companion play',
        keywords: 'stratagems cp spend timing when target effect',
        body: [
          'Open Stratagems anytime from the top bar to read timing, target, effect, and CP cost.',
          'Spend CP on the scoreboard when you use a stratagem on the table.',
          'The deck is a reference — it does not auto-spend CP or enforce once-per-battle limits for you.',
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
        id: 'map-open',
        title: 'Open Battle Map',
        keywords: 'battle map view deploy companion first',
        body: [
          'Load armies in Companion first, then switch to Battle Map from the top bar or footer.',
          'Side panels list each army. Empty sides send you back to Companion to load lists.',
        ],
      },
      {
        id: 'map-layouts',
        title: 'Choose a terrain layout',
        keywords: 'layout terrain deployment zones priority assets search destroy meatgrinder',
        body: [
          'Use the Layout dropdown above the map to pick a built-in board (blank grid or Event Companion-style layouts such as Search and Destroy, Meatgrinder, Unstoppable Force, Purge vs Take and Hold C, Priority Assets Layout B, and more as added).',
          'Layouts show deployment zones, terrain footprints, and feature pieces used for LoS/obscuring.',
          'Choose Add new… to import another Rapid Ingress layout (see Import custom layout).',
        ],
      },
      {
        id: 'map-deploy',
        title: 'Deploy and withdraw units',
        keywords: 'deploy withdraw staging models markers',
        body: [
          'Press Deploy on a unit to place its models in the off-board staging area for that player.',
          'Attached leaders deploy with their bodyguard group.',
          'Withdraw removes that unit’s models from the map.',
          'Player 1 models are blue; Player 2 models are green. Mirror-match (same faction) units stay separate.',
        ],
      },
      {
        id: 'map-move',
        title: 'Select and move models',
        keywords: 'drag move pan select unit right click',
        body: [
          'Left-drag a model to move that model. Right-drag (or secondary button drag) moves the whole unit group.',
          'Click a model or use the side list to select a unit; the selected unit and model are highlighted.',
          'Click empty board space (without dragging) to clear selection.',
          'Drag empty space to pan. Use Zoom + / −, mouse wheel over the map, or Reset view for the camera.',
        ],
      },
      {
        id: 'map-ranges',
        title: 'Move, charge, and weapon range rings',
        keywords: 'range ring move charge shoot weapon select',
        body: [
          'With a model selected during movement/charge-style steps, a range ring shows approximate reach from the base edge.',
          'During shooting steps, click a ranged weapon name on the selected unit’s card to show that weapon’s range ring.',
          'While picking shoot/fight targets, controlling-unit ranges stay on the active unit; enemy target rings are suppressed so the board stays readable.',
        ],
      },
      {
        id: 'map-los',
        title: 'Line of sight preview',
        keywords: 'los line of sight obscure terrain shooting see',
        body: [
          'During shooting, when an active shooter and a target are set, the map can show LoS rays and highlight attacker models that have a clear shot.',
          'Dense/obscuring terrain and see-through rules follow the imported layout features; treat the preview as a play aid, not a tournament judge.',
          'Touching centre objective halves may merge for LoS as implemented in the map LoS helper.',
        ],
      },
      {
        id: 'map-markers',
        title: 'Special markers',
        keywords: 'special marker objective token reminder',
        body: [
          'Add special marker places a purple token you can drag (objectives tokens, reminders, etc.).',
          'Select a marker to show Remove marker.',
        ],
      },
      {
        id: 'map-shock-wounds',
        title: 'Battle-shock and wounds on the map',
        keywords: 'battleshock wounds remaining models highlight',
        body: [
          'Selected unit cards on the map support wound tracking and BattleShocked toggles like Companion.',
          'Map highlights can show units that must test battle-shock or are currently shocked during the relevant steps.',
        ],
      },
      {
        id: 'map-import',
        title: 'Import custom layout (Rapid Ingress)',
        keywords: 'import add new rapid ingress html terrain-data-11e custom layout',
        body: [
          'Choose Add new… in the Layout dropdown.',
          'Upload a saved Rapid Ingress layout page (Complete webpage). Prefer including terrain-data-11e.js.download from the page’s _files folder — multi-select with the .html when possible.',
          'You can also use a RapidIngress-*.png filename for slug detection; polygon data still needs the terrain JS/HTML export for a full board.',
          'Pick the matching RI layout id, name it, then Import & use. Customs are stored in this browser and appear in the Layout list.',
          'Delete imported customs from the import dialog’s Imported layouts list when you no longer need them.',
        ],
      },
      {
        id: 'map-steps',
        title: 'Step controls on Battle Map',
        keywords: 'next previous step nav guide progress',
        body: [
          'When the guide has started, Battle Map shows compact ← / → step controls under the turn label.',
          'You can keep advancing the Companion guide while looking at the map.',
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
