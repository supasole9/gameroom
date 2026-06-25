// Room management: the arcade is a collection of rooms. Each room has one TV
// (the host/shared screen) and many phone controllers (the players).
//
// Players have a STABLE identity (`clientId`, stored in the phone's
// localStorage) that survives the phone sleeping / Wi-Fi dropping. The live
// socket id can change on every reconnect; the clientId never does. This is
// what lets a kid's phone lock mid-game and rejoin with the same avatar and
// score.

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
    players: new Map(), // clientId -> { id, socketId, name, avatar, connected, score }
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

// Add a brand-new player, or reconnect an existing one (same clientId).
// Returns { player, reconnected }.
export function upsertPlayer(room, clientId, socketId, name) {
  const existing = room.players.get(clientId);
  if (existing) {
    existing.socketId = socketId;
    existing.connected = true;
    if (name) existing.name = name.slice(0, 14);
    return { player: existing, reconnected: true };
  }
  const used = new Set([...room.players.values()].map((p) => p.avatar));
  const avatar = AVATARS.find((a) => !used.has(a)) || '🎮';
  const player = {
    id: clientId,
    socketId,
    name: (name || 'Player').slice(0, 14),
    avatar,
    connected: true,
    score: 0,
  };
  room.players.set(clientId, player);
  return { player, reconnected: false };
}

export function removePlayer(room, clientId) {
  room.players.delete(clientId);
}

export function getPlayer(room, clientId) {
  return room.players.get(clientId);
}

export function getPlayerBySocket(room, socketId) {
  for (const p of room.players.values()) if (p.socketId === socketId) return p;
  return null;
}

export function connectedCount(room) {
  let n = 0;
  for (const p of room.players.values()) if (p.connected) n++;
  return n;
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
    if (room.hostSocketId === socketId) return room;
    for (const p of room.players.values()) if (p.socketId === socketId) return room;
  }
  return null;
}

export function allRooms() {
  return rooms;
}
