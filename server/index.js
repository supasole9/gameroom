import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import os from 'node:os';
import { Server } from 'socket.io';

import {
  createRoom, getRoom, deleteRoom, addPlayer, publicPlayers, findRoomBySocket,
} from './rooms.js';
import { createContext } from './context.js';
import { catalogue, getGame } from './games/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.static(join(__dirname, '..', 'public')));

function sendLobby(room) {
  io.to(room.hostSocketId).emit('tv:lobby', {
    code: room.code,
    players: publicPlayers(room),
    games: catalogue(),
    phase: room.phase,
  });
}

function controllerLobby(room, socketId) {
  const p = room.players.get(socketId);
  io.to(socketId).emit('controller:lobby', {
    code: room.code,
    you: p ? { name: p.name, avatar: p.avatar } : null,
    phase: room.phase,
    gameName: room.game ? room.game.name : null,
  });
}

io.on('connection', (socket) => {
  // ---- TV / host ----
  socket.on('host:create', () => {
    const room = createRoom(socket.id);
    socket.emit('host:created', { code: room.code, games: catalogue() });
    sendLobby(room);
  });

  socket.on('host:selectGame', ({ gameId }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.hostSocketId !== socket.id) return;
    const game = getGame(gameId);
    if (!game) return;
    if (room.players.size < game.minPlayers) {
      io.to(room.hostSocketId).emit('tv:toast', { text: `Need at least ${game.minPlayers} player(s) for ${game.name}.` });
      return;
    }
    room.phase = 'game';
    room.gameId = gameId;
    room.game = game;
    room.state = null;
    const ctx = createContext(io, room);
    game.init(ctx);
    for (const id of room.players.keys()) controllerLobby(room, id);
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
    for (const id of room.players.keys()) controllerLobby(room, id);
  });

  // ---- Phone / controller ----
  socket.on('player:join', ({ code, name }) => {
    const room = getRoom(code);
    if (!room) {
      socket.emit('controller:error', { text: "Hmm, that room code wasn't found. Check the TV!" });
      return;
    }
    if (room.players.size >= 6 && !room.players.has(socket.id)) {
      socket.emit('controller:error', { text: 'This room is full (6 players max).' });
      return;
    }
    const player = addPlayer(room, socket.id, name);
    socket.emit('controller:joined', { code: room.code, name: player.name, avatar: player.avatar });
    sendLobby(room);
    controllerLobby(room, socket.id);

    // If a game is already running, give them a friendly holding view.
    if (room.phase === 'game' && room.game) {
      const ctx = createContext(io, room);
      if (typeof room.game.onPlayerJoin === 'function') {
        room.game.onPlayerJoin(ctx, player);
      } else {
        socket.emit('controller:view', {
          title: `${room.game.emoji} ${room.game.name}`,
          subtitle: 'Game in progress — you\'ll join the next round!',
          controls: [],
        });
      }
    }
  });

  socket.on('player:action', (action) => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.phase !== 'game' || !room.game) return;
    const player = room.players.get(socket.id);
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
      for (const id of room.players.keys()) {
        io.to(id).emit('controller:error', { text: 'The TV disconnected. Game over!' });
      }
      deleteRoom(room.code);
      return;
    }

    const player = room.players.get(socket.id);
    if (player) {
      player.connected = false;
      room.players.delete(socket.id);
      sendLobby(room);
      io.to(room.hostSocketId).emit('tv:toast', { text: `${player.name} left.` });
      // Let the active game refresh turn order / views if it cares.
      if (room.phase === 'game' && room.game && typeof room.game.onPlayerLeave === 'function') {
        const ctx = createContext(io, room);
        room.game.onPlayerLeave(ctx, player);
      }
    }
  });
});

httpServer.listen(PORT, () => {
  const nets = os.networkInterfaces();
  const lan = Object.values(nets).flat().find((n) => n && n.family === 'IPv4' && !n.internal);
  const ip = lan ? lan.address : 'localhost';
  console.log('\n  🎮  Family Arcade is running!\n');
  console.log(`  📺  On your TV / computer, open:   http://${ip}:${PORT}/tv.html`);
  console.log(`  📱  On each phone, open:           http://${ip}:${PORT}/`);
  console.log(`\n  (everyone must be on the same Wi-Fi)\n`);
});
