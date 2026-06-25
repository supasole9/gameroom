// Room management: the arcade is a collection of rooms. Each room has one TV
// (the host/shared screen) and many phone controllers (the players).

const ROOM_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no easily-confused chars (O/0, I/1, L)
const ROOM_CODE_LEN = 4;

// A friendly pool of avatars so each kid gets a recognisable token on the TV.
export const AVATARS = ['🦊', '🐢', '🐸', '🦄', '🐙', '🐝', '🦁', '🐧', '🦖', '🐬', '🐼', '🦉'];

const rooms = new Map();

function makeCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < ROOM_CODE_LEN; i++) {
      // Math.random is fine here: codes are short-lived and non-secret.
      code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
    }
  } while (rooms.has(code));
  return code;
}

export function createRoom(hostSocketId) {
  const code = makeCode();
  const room = {
    code,
    hostSocketId,
    players: new Map(), // socketId -> { id, name, avatar, connected, score }
    phase: 'lobby', // 'lobby' | 'game'
    gameId: null,
    game: null, // the loaded game module
    state: null, // game-specific state
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code) {
  return rooms.get((code || '').toUpperCase());
}

export function deleteRoom(code) {
  rooms.delete(code);
}

export function addPlayer(room, socketId, name) {
  const used = new Set([...room.players.values()].map((p) => p.avatar));
  const avatar = AVATARS.find((a) => !used.has(a)) || '🎮';
  const player = {
    id: socketId,
    name: (name || 'Player').slice(0, 14),
    avatar,
    connected: true,
    score: 0,
  };
  room.players.set(socketId, player);
  return player;
}

export function publicPlayers(room) {
  return [...room.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    connected: p.connected,
    score: p.score,
  }));
}

// Find whichever room a socket belongs to (as host or player) — used on disconnect.
export function findRoomBySocket(socketId) {
  for (const room of rooms.values()) {
    if (room.hostSocketId === socketId || room.players.has(socketId)) return room;
  }
  return null;
}

export function allRooms() {
  return rooms;
}
