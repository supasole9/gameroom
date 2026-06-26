// Room management: the arcade is a collection of rooms. Each room has one TV
// (the host/shared screen) and many phone controllers.
//
// A phone (identified by a stable `clientId` from localStorage) can hold one OR
// MORE players ("seats") — this is the pass-and-play / hotseat feature, handy
// for turn-based games where players share a device. Each seat is a full player
// with its own stable id (`pid`), avatar, and score. Many seats can share one
// `socketId` (the phone's live connection).

const ROOM_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no easily-confused chars (O/0, I/1, L)
const ROOM_CODE_LEN = 4;
export const MAX_PLAYERS = 6;

// A big, friendly pool of avatars to pick from (kids choose their own).
export const AVATARS = [
  '🦊', '🐢', '🐸', '🦄', '🐙', '🐝', '🦁', '🐧', '🦖', '🐬', '🐼', '🦉',
  '🐶', '🐱', '🐵', '🐯', '🐰', '🐨', '🐮', '🐷', '🐥', '🦋', '🐠', '🦈',
  '🦕', '🦒', '🦓', '🦔', '🦦', '🐲', '🦩', '🦜', '🐳', '🦭', '🦚', '🦦',
];

export function takenAvatars(room) {
  return new Set([...room.players.values()].map((p) => p.avatar));
}

// Change a seat's avatar. Refuses if another player already has that emoji
// (so tokens stay distinct on the board). Returns true on success.
export function setAvatar(room, pid, avatar) {
  // Allow a palette emoji OR an uploaded character image token.
  const valid = AVATARS.includes(avatar) || /^img:\/characters\/[\w.%-]+$/i.test(avatar);
  if (!valid) return false;
  const p = room.players.get(pid);
  if (!p) return false;
  for (const other of room.players.values()) {
    if (other.id !== pid && other.avatar === avatar) return false;
  }
  p.avatar = avatar;
  return true;
}

const rooms = new Map();

function makeCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < ROOM_CODE_LEN; i++) {
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
    players: new Map(), // pid -> { id, clientId, socketId, name, avatar, connected, score }
    phase: 'lobby', // 'lobby' | 'game'
    gameId: null,
    game: null,
    state: null,
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code) { return rooms.get((code || '').toUpperCase()); }
export function deleteRoom(code) { rooms.delete(code); }

// Reconcile the seats a phone owns. `seats` is [{ pid, name }]. Existing seats
// (matched by pid) are reconnected; new ones are created (up to the cap). When
// `allowStructureChange` is true (lobby only), seats this phone dropped are
// removed. Returns the phone's current seats and any that were rejected (full).
export function syncPhoneSeats(room, clientId, socketId, seats, allowStructureChange) {
  const incoming = new Set(seats.map((s) => s.pid));
  const accepted = [];
  let rejected = 0;

  for (const { pid, name, avatar: wanted } of seats) {
    let p = room.players.get(pid);
    if (p) {
      p.socketId = socketId;
      p.connected = true;
      if (allowStructureChange && name) p.name = name.slice(0, 14);
    } else {
      if (room.players.size >= MAX_PLAYERS) { rejected++; continue; }
      const used = new Set([...room.players.values()].map((x) => x.avatar));
      // Honour the player's chosen emoji if it's valid and free; else auto-pick.
      const avatar = (wanted && AVATARS.includes(wanted) && !used.has(wanted))
        ? wanted
        : (AVATARS.find((a) => !used.has(a)) || '🎮');
      p = {
        id: pid, clientId, socketId,
        name: (name || 'Player').slice(0, 14), avatar, connected: true, score: 0,
      };
      room.players.set(pid, p);
    }
    accepted.push(p);
  }

  if (allowStructureChange) {
    for (const [pid, p] of [...room.players]) {
      if (p.clientId === clientId && !incoming.has(pid)) room.players.delete(pid);
    }
  }
  return { accepted, rejected };
}

export function removePlayer(room, pid) { room.players.delete(pid); }
export function getPlayer(room, pid) { return room.players.get(pid); }
export function getPlayersBySocket(room, socketId) {
  return [...room.players.values()].filter((p) => p.socketId === socketId);
}

export function connectedCount(room) {
  let n = 0;
  for (const p of room.players.values()) if (p.connected) n++;
  return n;
}

export function publicPlayers(room) {
  return [...room.players.values()].map((p) => ({
    id: p.id, name: p.name, avatar: p.avatar, connected: p.connected, score: p.score,
  }));
}

export function findRoomBySocket(socketId) {
  for (const room of rooms.values()) {
    if (room.hostSocketId === socketId) return room;
    for (const p of room.players.values()) if (p.socketId === socketId) return room;
  }
  return null;
}

export function allRooms() { return rooms; }
