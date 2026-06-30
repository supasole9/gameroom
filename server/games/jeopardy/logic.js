// Pure, socket-free helpers for the Jeopardy game. Everything here is unit-tested.

export const TILE_VALUES = [100, 200, 300, 400, 500];

export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// categories: [{ id, name, emoji, questions:[{q,choices,answer,audio?}] }]
export function buildBoard(categories, rng = Math.random) {
  return {
    columns: categories.map((cat) => {
      const picked = shuffle(cat.questions, rng).slice(0, TILE_VALUES.length);
      return {
        id: cat.id,
        name: cat.name,
        emoji: cat.emoji,
        tiles: TILE_VALUES.map((value, i) => {
          const q = picked[i];
          return {
            value,
            q: q.q,
            choices: q.choices,
            answer: q.answer,
            audio: q.audio || null,
            done: false,
          };
        }),
      };
    }),
  };
}

export function tileId(colId, value) {
  return `${colId}:${value}`;
}

export function parseTileId(str) {
  const [colId, value] = String(str).split(':');
  return { colId, value: Number(value) };
}

export function findTile(board, colId, value) {
  const col = board.columns.find((c) => c.id === colId);
  if (!col) return null;
  return col.tiles.find((t) => t.value === value) || null;
}

export function boardEmpty(board) {
  return board.columns.every((c) => c.tiles.every((t) => t.done));
}

export function canBuzz(state, pid) {
  return state.buzzedBy == null && !(state.lockedOut || []).includes(pid);
}

export function applyScore(current, delta) {
  return Math.max(0, (current || 0) + delta);
}

export function computeWinner(players) {
  let best = null;
  for (const p of players) if (!best || p.score > best.score) best = p;
  return best ? best.id : null;
}

export function revealMsFor(text) {
  const words = String(text).trim().split(/\s+/).length;
  return Math.max(1200, Math.round((words / 3) * 1000));
}
