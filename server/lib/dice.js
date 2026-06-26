// Shared dice helper. Reusable across games.
export function rollDie(sides = 6) {
  return 1 + Math.floor(Math.random() * sides);
}
