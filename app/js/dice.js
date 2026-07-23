export function rollD6() {
  return Math.floor(Math.random() * 6) + 1;
}

export function roll2D6() {
  return rollD6() + rollD6();
}

export function requiredWoundRoll(strength, toughness) {
  if (strength >= toughness * 2) return 2;
  if (strength > toughness) return 3;
  if (strength === toughness) return 4;
  if (strength * 2 > toughness) return 5;
  return 6;
}

export function leadershipRoll(leadership) {
  const rolls = [rollD6(), rollD6()];
  const total = rolls[0] + rolls[1];
  return { rolls, total, success: total >= leadership };
}
