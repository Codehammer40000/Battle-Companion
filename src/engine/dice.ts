export function rollD6(): number {
  return Math.floor(Math.random() * 6) + 1;
}

export function roll2D6(): number {
  return rollD6() + rollD6();
}

export function rollD3(): number {
  return Math.ceil(rollD6() / 2);
}

export function rollOff(): { player1: number; player2: number; winner: 'player1' | 'player2' | 'draw' } {
  const player1 = rollD6();
  const player2 = rollD6();
  let winner: 'player1' | 'player2' | 'draw' = 'draw';
  if (player1 > player2) winner = 'player1';
  else if (player2 > player1) winner = 'player2';
  return { player1, player2, winner };
}

export function requiredWoundRoll(strength: number, toughness: number): number {
  if (strength >= toughness * 2) return 2;
  if (strength > toughness) return 3;
  if (strength === toughness) return 4;
  if (strength * 2 > toughness) return 5;
  return 6;
}

export function leadershipRoll(leadership: number): { rolls: [number, number]; total: number; success: boolean } {
  const rolls: [number, number] = [rollD6(), rollD6()];
  const total = rolls[0] + rolls[1];
  return { rolls, total, success: total >= leadership };
}
