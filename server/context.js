// GameContext: the only surface a game module uses to talk to the screens.
// This keeps individual games decoupled from socket.io plumbing.
import { publicPlayers } from './rooms.js';

export function createContext(io, room) {
  const toHost = (event, payload) => io.to(room.hostSocketId).emit(event, payload);

  return {
    room,
    // Live array of connected, public-safe player records (turn order is the
    // insertion order of the Map).
    get players() {
      return publicPlayers(room).filter((p) => p.connected);
    },
    get state() {
      return room.state;
    },
    set state(s) {
      room.state = s;
    },

    // Send the full game state to the TV. The TV renders per-gameId.
    // Players (with live scores) ride along so the TV scoreboard stays fresh.
    renderTV(extra = {}) {
      toHost('tv:game', { gameId: room.gameId, state: room.state, players: publicPlayers(room), ...extra });
    },
    // Fire a custom event at the TV (e.g. live drawing strokes, confetti).
    tvEvent(event, payload) {
      toHost(event, payload);
    },
    // Have the TV speak text aloud (Web Speech API). The soul of Story mode.
    narrate(text) {
      toHost('tv:narrate', { text });
    },

    // Push a controller UI description to one phone. See public/js/controller.js
    // for the little declarative view protocol.
    view(playerId, viewObj) {
      io.to(playerId).emit('controller:view', viewObj);
    },
    // Convenience: render every connected player's controller from a function.
    renderControllers(fn) {
      for (const p of this.players) this.view(p.id, fn(p));
    },

    // Update a player's score and reflect it everywhere.
    addScore(playerId, points) {
      const p = room.players.get(playerId);
      if (p) p.score += points;
    },
  };
}
