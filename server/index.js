import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import os from 'node:os';
import { Server } from 'socket.io';
import QRCode from 'qrcode';

import {
  createRoom, getRoom, deleteRoom, upsertPlayer, removePlayer, getPlayer,
  getPlayerBySocket, publicPlayers, findRoomBySocket, connectedCount,
} from './rooms.js';
import { createContext } from './context.js';
import { catalogue, getGame } from './games/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 6;

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

function controllerLobby(room, player) {
  io.to(player.socketId).emit('controller:lobby', {
    code: room.code,
    you: { name: player.name, avatar: player.avatar },
    phase: room.phase,
    gameName: room.game ? room.game.name : null,
  });
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
    for (const p of room.players.values()) controllerLobby(room, p);
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
    for (const p of room.players.values()) controllerLobby(room, p);
  });

  // Host removes a player (e.g. a kid who wandered off and left a stale slot).
  socket.on('host:removePlayer', ({ clientId }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.hostSocketId !== socket.id) return;
    const p = getPlayer(room, clientId);
    if (!p) return;
    io.to(p.socketId).emit('controller:error', { text: 'You were removed from the game.' });
    removePlayer(room, clientId);
    sendLobby(room);
  });

  // ---- Phone / controller ----
  socket.on('player:join', ({ code, name, clientId }) => {
    const room = getRoom(code);
    if (!room) {
      socket.emit('controller:error', { text: "Hmm, that room code wasn't found. Check the TV!" });
      return;
    }
    if (!clientId) {
      socket.emit('controller:error', { text: 'Could not start your controller — try reloading.' });
      return;
    }
    if (!room.players.has(clientId) && room.players.size >= MAX_PLAYERS) {
      socket.emit('controller:error', { text: `This room is full (${MAX_PLAYERS} players max).` });
      return;
    }

    const { player, reconnected } = upsertPlayer(room, clientId, socket.id, name);
    socket.emit('controller:joined', { code: room.code, name: player.name, avatar: player.avatar });
    sendLobby(room);
    controllerLobby(room, player);

    // If a game is running, restore this phone's view (and refresh others so the
    // scoreboard / turn indicator show them as back online).
    if (room.phase === 'game' && room.game) {
      const ctx = createContext(io, room);
      if (typeof room.game.sync === 'function') {
        room.game.sync(ctx);
      } else {
        io.to(player.socketId).emit('controller:view', {
          title: `${room.game.emoji} ${room.game.name}`,
          subtitle: "Game in progress — you'll join the next round!",
          controls: [],
        });
      }
    }
    if (reconnected) io.to(room.hostSocketId).emit('tv:toast', { text: `${player.name} reconnected.` });
  });

  socket.on('player:action', (action) => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.phase !== 'game' || !room.game) return;
    const player = getPlayerBySocket(room, socket.id);
    if (!player) return;
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

    const player = getPlayerBySocket(room, socket.id);
    if (player) {
      // Keep the player record so they can reconnect with the same avatar/score.
      player.connected = false;
      sendLobby(room);
      io.to(room.hostSocketId).emit('tv:toast', { text: `${player.name} went offline…` });
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
