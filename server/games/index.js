// The arcade catalogue. Add a new game = drop a module here and register it.
import snakes from './snakes.js';
import story from './story.js';
import draw from './draw.js';

const games = [snakes, story, draw];

export const registry = new Map(games.map((g) => [g.id, g]));

// Lightweight list for the TV's arcade menu.
export function catalogue() {
  return games.map((g) => ({
    id: g.id,
    name: g.name,
    emoji: g.emoji,
    blurb: g.blurb,
    minPlayers: g.minPlayers,
    maxPlayers: g.maxPlayers,
  }));
}

export function getGame(id) {
  return registry.get(id);
}
