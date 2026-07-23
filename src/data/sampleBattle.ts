import type { Battlefield, Model, PlayerId, Point, Unit, Weapon } from '../types/game';

const boltRifle: Weapon = {
  id: 'bolt-rifle',
  name: 'Bolt Rifle',
  range: 24,
  attacks: 2,
  skill: 3,
  strength: 4,
  ap: -1,
  damage: 1,
};

const boltPistol: Weapon = {
  id: 'bolt-pistol',
  name: 'Bolt Pistol',
  range: 12,
  attacks: 1,
  skill: 3,
  strength: 4,
  ap: 0,
  damage: 1,
  keywords: ['CLOSE-QUARTERS'],
};

const chainsword: Weapon = {
  id: 'chainsword',
  name: 'Chainsword',
  range: 'melee',
  attacks: 4,
  skill: 3,
  strength: 4,
  ap: -1,
  damage: 1,
};

const shoota: Weapon = {
  id: 'shoota',
  name: 'Shoota',
  range: 18,
  attacks: 2,
  skill: 5,
  strength: 4,
  ap: 0,
  damage: 1,
  keywords: ['RAPID FIRE 1'],
};

const choppa: Weapon = {
  id: 'choppa',
  name: 'Choppa',
  range: 'melee',
  attacks: 3,
  skill: 3,
  strength: 4,
  ap: -1,
  damage: 1,
};

const kustomShoota: Weapon = {
  id: 'kustom-shoota',
  name: 'Kustom Shoota',
  range: 18,
  attacks: 4,
  skill: 5,
  strength: 4,
  ap: 0,
  damage: 1,
  keywords: ['RAPID FIRE 2'],
};

const bigChoppa: Weapon = {
  id: 'big-choppa',
  name: 'Big Choppa',
  range: 'melee',
  attacks: 3,
  skill: 3,
  strength: 7,
  ap: -1,
  damage: 2,
};

function marineModel(id: string, name: string, pos: Point, isSergeant = false): Model {
  return {
    id,
    name,
    position: pos,
    baseRadius: 1.25,
    woundsRemaining: isSergeant ? 2 : 1,
    isCharacter: isSergeant,
    keywords: ['INFANTRY', 'BATTLELINE'],
    profile: {
      move: 6,
      toughness: 4,
      save: 3,
      wounds: isSergeant ? 2 : 1,
      leadership: 6,
      oc: 2,
    },
    weapons: isSergeant
      ? [boltRifle, boltPistol, chainsword]
      : [boltRifle, boltPistol, chainsword],
  };
}

function orkModel(
  id: string,
  name: string,
  pos: Point,
  isNob: boolean,
): Model {
  return {
    id,
    name,
    position: pos,
    baseRadius: 1.125,
    woundsRemaining: isNob ? 2 : 1,
    isCharacter: isNob,
    keywords: ['INFANTRY', 'BATTLELINE', 'MOB'],
    profile: {
      move: 6,
      toughness: 5,
      save: 5,
      wounds: isNob ? 2 : 1,
      leadership: 7,
      oc: 2,
    },
    weapons: isNob ? [kustomShoota, bigChoppa] : [shoota, choppa],
  };
}

function createMarineSquad(player: PlayerId): Unit {
  const baseX = player === 'player1' ? 8 : 8;
  const baseY = player === 'player1' ? 6 : 52;
  const models: Model[] = [];
  for (let i = 0; i < 5; i++) {
    const row = Math.floor(i / 5);
    const col = i % 5;
    models.push(
      marineModel(
        `sm-${player}-${i}`,
        i === 0 ? 'Sergeant' : `Marine ${i}`,
        { x: baseX + col * 2.5, y: baseY + row * 2 },
        i === 0,
      ),
    );
  }
  return {
    id: `intercessors-${player}`,
    name: 'Intercessor Squad',
    player,
    models,
    keywords: ['INFANTRY', 'BATTLELINE', 'ADEPTUS ASTARTES'],
    startingModelCount: 5,
    advancedThisTurn: false,
    fellBackThisTurn: false,
    chargedThisTurn: false,
    shotThisTurn: false,
    movedThisTurn: false,
    fightsFirst: false,
    battleShocked: false,
    remainingStationary: false,
    hasActedThisPhase: false,
  };
}

function createOrkMob(player: PlayerId): Unit {
  const baseX = player === 'player1' ? 30 : 30;
  const baseY = player === 'player1' ? 6 : 52;
  const models: Model[] = [];
  for (let i = 0; i < 10; i++) {
    const row = Math.floor(i / 5);
    const col = i % 5;
    models.push(
      orkModel(
        `ork-${player}-${i}`,
        i === 0 ? 'Boss Nob' : `Boy ${i}`,
        { x: baseX + col * 2, y: baseY + row * 2 },
        i === 0,
      ),
    );
  }
  return {
    id: `boyz-${player}`,
    name: 'Boyz Mob',
    player,
    models,
    keywords: ['INFANTRY', 'BATTLELINE', 'MOB', 'ORKS'],
    startingModelCount: 10,
    advancedThisTurn: false,
    fellBackThisTurn: false,
    chargedThisTurn: false,
    shotThisTurn: false,
    movedThisTurn: false,
    fightsFirst: false,
    battleShocked: false,
    remainingStationary: false,
    hasActedThisPhase: false,
  };
}

export function createBattlefield(): Battlefield {
  return {
    width: 44,
    height: 60,
    deploymentZones: [
      {
        player: 'player2',
        role: 'defender',
        bounds: { x: 0, y: 48, w: 44, h: 12 },
      },
      {
        player: 'player1',
        role: 'attacker',
        bounds: { x: 0, y: 0, w: 44, h: 12 },
      },
    ],
    terrainAreas: [
      {
        id: 'obj-p1-home',
        bounds: { x: 2, y: 2, w: 8, h: 6 },
        category: 'dense',
        isObscuring: true,
        isObjective: true,
        objectiveType: 'home',
        label: 'P1 Home',
      },
      {
        id: 'obj-p2-home',
        bounds: { x: 34, y: 52, w: 8, h: 6 },
        category: 'dense',
        isObscuring: true,
        isObjective: true,
        objectiveType: 'home',
        label: 'P2 Home',
      },
      {
        id: 'obj-central-left',
        bounds: { x: 4, y: 26, w: 10, h: 8 },
        category: 'dense',
        isObscuring: true,
        isObjective: true,
        objectiveType: 'central',
        label: 'Central L',
      },
      {
        id: 'obj-central-right',
        bounds: { x: 30, y: 26, w: 10, h: 8 },
        category: 'dense',
        isObscuring: true,
        isObjective: true,
        objectiveType: 'central',
        label: 'Central R',
      },
      {
        id: 'terrain-mid',
        bounds: { x: 16, y: 24, w: 12, h: 12 },
        category: 'dense',
        isObscuring: true,
        label: 'Mid Ruins',
      },
      {
        id: 'terrain-left',
        bounds: { x: 2, y: 14, w: 8, h: 10 },
        category: 'light',
        isObscuring: true,
        label: 'Barricades L',
      },
      {
        id: 'terrain-right',
        bounds: { x: 34, y: 36, w: 8, h: 10 },
        category: 'light',
        isObscuring: true,
        label: 'Barricades R',
      },
    ],
    terrainFeatures: [
      {
        id: 'ruin-central',
        areaId: 'terrain-mid',
        bounds: { x: 17, y: 25, w: 10, h: 10 },
        category: 'dense',
        solid: true,
        label: 'Ruins',
      },
      {
        id: 'ruin-left',
        areaId: 'obj-central-left',
        bounds: { x: 5, y: 27, w: 8, h: 6 },
        category: 'dense',
        solid: true,
      },
      {
        id: 'ruin-right',
        areaId: 'obj-central-right',
        bounds: { x: 31, y: 27, w: 8, h: 6 },
        category: 'dense',
        solid: true,
      },
      {
        id: 'barricade-left',
        areaId: 'terrain-left',
        bounds: { x: 3, y: 16, w: 6, h: 2 },
        category: 'light',
        solid: false,
      },
      {
        id: 'barricade-right',
        areaId: 'terrain-right',
        bounds: { x: 35, y: 38, w: 6, h: 2 },
        category: 'light',
        solid: false,
      },
    ],
  };
}

export function createSampleUnits(): Unit[] {
  return [createMarineSquad('player1'), createOrkMob('player2')];
}

export const PLAYER_LABELS: Record<PlayerId, string> = {
  player1: 'Ultramarines (Attacker)',
  player2: 'Orks (Defender)',
};
