// Integration test: drive the game through the REAL createContext + a real room
// (rooms.js), with a fake socket.io that captures emits per socket id. This
// exercises context.js wiring (renderTV to the host, per-seat views, addScore
// mutating the room) the way the server does — without a network layer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom } from '../../rooms.js';
import { createContext } from '../../context.js';
import game from './index.js';

function makeIo() {
  const sent = new Map(); // socketId -> [{ event, payload }]
  return {
    sent,
    to(id) {
      return {
        emit(event, payload) {
          if (!sent.has(id)) sent.set(id, []);
          sent.get(id).push({ event, payload });
        },
      };
    },
    eventsFor(id) { return sent.get(id) || []; },
    lastTo(id, event) {
      const list = (sent.get(id) || []).filter((e) => e.event === event);
      return list[list.length - 1];
    },
  };
}

function setupRoom() {
  const room = createRoom('HOST');
  room.players.set('p1', { id: 'p1', clientId: 'c1', socketId: 'S1', name: 'Ann', avatar: '🦊', connected: true, score: 0 });
  room.players.set('p2', { id: 'p2', clientId: 'c2', socketId: 'S2', name: 'Bob', avatar: '🐢', connected: true, score: 0 });
  room.phase = 'game';
  room.gameId = 'jeopardy';
  room.game = game;
  return room;
}

test('end-to-end through real context: setup -> board -> reveal -> buzz -> correct', () => {
  const io = makeIo();
  const room = setupRoom();
  const ctx = createContext(io, room);

  game.init(ctx);
  // Host (TV) got a tv:game with the jeopardy id and the setup catalogue.
  const tvSetup = io.lastTo('HOST', 'tv:game');
  assert.ok(tvSetup, 'host received tv:game');
  assert.equal(tvSetup.payload.gameId, 'jeopardy');
  assert.equal(tvSetup.payload.state.phase, 'setup');
  assert.ok(tvSetup.payload.state.catalogue.length >= 2);

  // TV picks categories.
  game.onHostAction(ctx, { control: 'categories', value: ['cars', 'animals'] });
  assert.equal(room.state.phase, 'board');
  assert.equal(room.state.pickerId, 'p1');

  // Picker's phone (S1) got a controller:view with tile choices.
  const pickView = io.lastTo('S1', 'controller:view');
  assert.ok(pickView, 'picker received a view');
  const tileCtrl = pickView.payload.view.controls.find((c) => c.id === 'tile');
  assert.ok(tileCtrl && tileCtrl.options.length === 10, 'picker sees 10 tiles (2 cols x 5)');

  // Picker selects a tile -> reveal.
  game.onAction(ctx, room.players.get('p1'), { control: 'tile', value: tileCtrl.options[0].id });
  assert.equal(room.state.phase, 'reveal');

  // Bob buzzes first.
  game.onAction(ctx, room.players.get('p2'), { control: 'buzz', value: true });
  assert.equal(room.state.phase, 'answer');
  assert.equal(room.state.buzzedBy, 'p2');
  // Bob's phone now shows answer choices; the host got a buzz flag.
  const ansView = io.lastTo('S2', 'controller:view');
  assert.ok(ansView.payload.view.controls.some((c) => c.id === 'answer'));
  const tvBuzz = io.lastTo('HOST', 'tv:game');
  assert.equal(tvBuzz.payload.buzz, 'p2');

  // Bob answers correctly -> score reflected in the room AND in the TV payload.
  const answer = room.state.current.answer;
  game.onAction(ctx, room.players.get('p2'), { control: 'answer', value: answer });
  assert.equal(room.players.get('p2').score, room.state.lastResult.value);
  assert.equal(room.state.pickerId, 'p2');
  const tvResolved = io.lastTo('HOST', 'tv:game');
  const bobOnTv = tvResolved.payload.players.find((p) => p.id === 'p2');
  assert.equal(bobOnTv.score, room.players.get('p2').score, 'TV scorebar reflects the new score');
});
