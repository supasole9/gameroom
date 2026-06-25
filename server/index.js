import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import os from 'node:os';
import { Server } from 'socket.io';
import QRCode from 'qrcode';

import {
  createRoom, getRoom, deleteRoom, syncPhoneSeats, removePlayer, getPlayer,
  getPlayersBySocket, publicPlayers, findRoomBySocket, connectedCount, MAX_PLAYERS,
  AVATARS, takenAvatars, setAvatar,
} from './rooms.js';
import { createContext } from './context.js';
import { catalogue, getGame } from './games/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5858;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.static(join(__dirname, '..', 'public')));

// The LAN address phones should use, computed once at startup. The TV can
// override this with its own origin (what it's actually being served from).
function lanBase() {
  const nets = os.networkInterfaces();
  const lan = Object.values(nets).flat().find((n) => n && n.family === 'IPv4' && !n.internal);
  return `http://${lan ? lan.address : 'localhost'}:${PORT}`;
}

async function makeQR(url) {
  try {
    return await QRCode.toDataURL(url, {
      margin: 1, width: 260, color: { dark: '#1a1033', light: '#ffffff' },
    });
  } catch {
    return null;
  }
}

function sendLobby(room) {
  io.to(room.hostSocketId).emit('tv:lobby', {
    code: room.code,
    players: publicPlayers(room),
    games: catalogue(),
    phase: room.phase,
  });
}

// Tell every phone which emojis are currently taken (so pickers can disable them).
function sendRosterAll(room) {
  const taken = [...takenAvatars(room)];
  const seen = new Set();
  for (const p of room.players.values()) {
    if (seen.has(p.socketId)) continue;
    seen.add(p.socketId);
    io.to(p.socketId).emit('controller:roster', { taken });
  }
}

// Notify each distinct phone (socket) once about the lobby/game phase.
function controllerLobbyAll(room) {
  const seen = new Set();
  for (const p of room.players.values()) {
    if (seen.has(p.socketId)) continue;
    seen.add(p.socketId);
    io.to(p.socketId).emit('controller:lobby', {
      code: room.code,
      phase: room.phase,
      gameName: room.game ? room.game.name : null,
    });
  }
}

io.on('connection', (socket) => {
  // ---- TV / host ----
  socket.on('host:create', async ({ origin } = {}) => {
    const room = createRoom(socket.id);
    const base = (typeof origin === 'string' && origin.startsWith('http')) ? origin : lanBase();
    const joinUrl = base.replace(/\/$/, '') + '/';
    const qr = await makeQR(joinUrl);
    socket.emit('host:created', { code: room.code, games: catalogue(), joinUrl, qr });
    sendLobby(room);
  });

  socket.on('host:selectGame', ({ gameId }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.hostSocketId !== socket.id) return;
    const game = getGame(gameId);
    if (!game) return;
    if (connectedCount(room) < game.minPlayers) {
      io.to(room.hostSocketId).emit('tv:toast', { text: `Need at least ${game.minPlayers} player(s) for ${game.name}.` });
      return;
    }
    room.phase = 'game';
    room.gameId = gameId;
    room.game = game;
    room.state = null;
    const ctx = createContext(io, room);
    game.init(ctx);
    controllerLobbyAll(room);
  });

  // Return to the arcade menu (end current game).
  socket.on('host:arcade', () => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.hostSocketId !== socket.id) return;
    room.phase = 'lobby';
    room.gameId = null;
    room.game = null;
    room.state = null;
    sendLobby(room);
    controllerLobbyAll(room);
  });

  // Host removes a player seat (e.g. a stale slot left behind).
  socket.on('host:removePlayer', ({ clientId, pid }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.hostSocketId !== socket.id) return;
    const id = pid || clientId; // backward compatible
    const p = getPlayer(room, id);
    if (!p) return;
    io.to(p.socketId).emit('controller:removed', { pid: id });
    removePlayer(room, id);
    sendLobby(room);
    sendRosterAll(room);
  });

  // ---- Phone / controller ----
  // A phone joins with one or more seats: { code, clientId, seats:[{pid,name}] }.
  socket.on('player:join', ({ code, clientId, seats, name }) => {
    const room = getRoom(code);
    if (!room) {
      socket.emit('controller:error', { text: "Hmm, that room code wasn't found. Check the TV!" });
      return;
    }
    if (!clientId) {
      socket.emit('controller:error', { text: 'Could not start your controller — try reloading.' });
      return;
    }
    // Normalise to a seat list (supports legacy single-name join).
    let seatList = Array.isArray(seats) ? seats.filter((s) => s && s.pid) : [];
    if (!seatList.length && name) seatList = [{ pid: clientId, name }];
    if (!seatList.length) {
      socket.emit('controller:error', { text: 'Add at least one player name.' });
      return;
    }

    const wasReconnect = seatList.some((s) => room.players.has(s.pid));
    const allowStructureChange = room.phase === 'lobby';
    const { accepted, rejected } = syncPhoneSeats(room, clientId, socket.id, seatList, allowStructureChange);
    if (!accepted.length) {
      socket.emit('controller:error', { text: `This room is full (${MAX_PLAYERS} players max).` });
      return;
    }
    if (rejected) io.to(socket.id).emit('controller:toast', { text: `Room is full — only ${accepted.length} of your players joined.` });

    socket.emit('controller:joined', {
      code: room.code,
      seats: accepted.map((p) => ({ pid: p.id, name: p.name, avatar: p.avatar })),
      palette: AVATARS,
    });
    sendLobby(room);
    sendRosterAll(room);
    io.to(socket.id).emit('controller:lobby', {
      code: room.code, phase: room.phase, gameName: room.game ? room.game.name : null,
    });

    // If a game is running, restore views for this phone's seats.
    if (room.phase === 'game' && room.game) {
      const ctx = createContext(io, room);
      if (typeof room.game.sync === 'function') {
        room.game.sync(ctx);
      } else {
        for (const p of accepted) {
          io.to(p.socketId).emit('controller:view', {
            seat: { pid: p.id, name: p.name, avatar: p.avatar },
            view: { title: `${room.game.emoji} ${room.game.name}`, subtitle: "Game in progress — you'll join the next round!", controls: [] },
          });
        }
      }
    }
    if (wasReconnect) io.to(room.hostSocketId).emit('tv:toast', { text: `${accepted[0].name} reconnected.` });
  });

  // A player picks a different emoji.
  socket.on('player:setAvatar', ({ pid, avatar }) => {
    const room = findRoomBySocket(socket.id);
    if (!room) return;
    const p = getPlayer(room, pid);
    if (!p || p.socketId !== socket.id) return; // must own this seat
    if (!setAvatar(room, pid, avatar)) {
      io.to(socket.id).emit('controller:toast', { text: 'That emoji is taken — pick another!' });
      sendRosterAll(room);
      return;
    }
    // Reflect the change everywhere: this phone's seats, the TV, and pickers.
    const mySeats = getPlayersBySocket(room, socket.id)
      .map((s) => ({ pid: s.id, name: s.name, avatar: s.avatar }));
    io.to(socket.id).emit('controller:seats', { seats: mySeats });
    sendLobby(room);
    sendRosterAll(room);
    if (room.phase === 'game' && room.game && typeof room.game.sync === 'function') {
      room.game.sync(createContext(io, room));
    }
  });

  socket.on('player:action', (action) => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.phase !== 'game' || !room.game) return;
    // Resolve which seat is acting; must belong to this phone (socket).
    const pid = action && action.pid;
    const player = pid ? getPlayer(room, pid) : getPlayersBySocket(room, socket.id)[0];
    if (!player || player.socketId !== socket.id) return;
    const ctx = createContext(io, room);
    room.game.onAction(ctx, player, action || {});
  });

  // ---- Disconnect ----
  socket.on('disconnect', () => {
    const room = findRoomBySocket(socket.id);
    if (!room) return;

    if (room.hostSocketId === socket.id) {
      // TV left — close the room.
      for (const p of room.players.values()) {
        io.to(p.socketId).emit('controller:error', { text: 'The TV disconnected. Game over!' });
      }
      deleteRoom(room.code);
      return;
    }

    const seats = getPlayersBySocket(room, socket.id);
    if (seats.length) {
      // Keep the records so the phone can reconnect with the same avatars/scores.
      for (const p of seats) p.connected = false;
      sendLobby(room);
      io.to(room.hostSocketId).emit('tv:toast', { text: `${seats[0].name} went offline…` });
      if (room.phase === 'game' && room.game && typeof room.game.sync === 'function') {
        room.game.sync(createContext(io, room));
      }
    }
  });
});

httpServer.listen(PORT, () => {
  const base = lanBase();
  console.log('\n  🎮  Family Arcade is running!\n');
  console.log(`  📺  On your TV / computer, open:   ${base}/tv.html`);
  console.log(`  📱  On each phone, open:           ${base}/`);
  console.log('\n  (everyone must be on the same Wi-Fi)\n');
});
