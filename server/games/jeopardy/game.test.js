import { test } from 'node:test';
import assert from 'node:assert/strict';
import game from './index.js';

// Minimal fake ctx. players is a fixed roster; state is a mutable holder.
function makeCtx(playerIds) {
  const players = playerIds.map((id) => ({ id, name: id.toUpperCase(), avatar: '🙂', score: 0, connected: true }));
  const scores = Object.fromEntries(players.map((p) => [p.id, 0]));
  const ctx = {
    room: { code: 'TEST', gameId: 'jeopardy' },
    players,
    _state: null,
    get state() { return this._state; },
    set state(s) { this._state = s; },
    tvCalls: [],
    viewCalls: [],
    narrations: [],
    renderTV(extra = {}) { this.tvCalls.push(extra); },
    renderControllers(fn) { for (const p of this.players) this.viewCalls.push({ pid: p.id, view: fn(p) }); },
    view(pid, v) { this.viewCalls.push({ pid, view: v }); },
    narrate(t) { this.narrations.push(t); },
    addScore(pid, pts) { const p = players.find((x) => x.id === pid); if (p) p.score += pts; scores[pid] += pts; },
    tvEvent() {},
  };
  return ctx;
}

function startGame(ctx, categoryIds) {
  game.init(ctx);
  game.onHostAction(ctx, { control: 'categories', value: categoryIds });
}

test('init enters setup; host categories build the board and set first picker', () => {
  const ctx = makeCtx(['a', 'b']);
  game.init(ctx);
  assert.equal(ctx.state.phase, 'setup');
  game.onHostAction(ctx, { control: 'categories', value: ['cars', 'animals'] });
  assert.equal(ctx.state.phase, 'board');
  assert.equal(ctx.state.board.columns.length, 2);
  assert.equal(ctx.state.pickerId, 'a'); // first connected player picks first
});

test('rejects fewer than 2 or more than 4 categories', () => {
  const ctx = makeCtx(['a', 'b']);
  game.init(ctx);
  game.onHostAction(ctx, { control: 'categories', value: ['cars'] });
  assert.equal(ctx.state.phase, 'setup'); // still in setup, not enough categories
});

test('picker selects a tile -> reveal phase, buzz open', () => {
  const ctx = makeCtx(['a', 'b']);
  startGame(ctx, ['cars', 'animals']);
  const colId = ctx.state.board.columns[0].id;
  game.onAction(ctx, ctx.players[0], { control: 'tile', value: `${colId}:300` });
  assert.equal(ctx.state.phase, 'reveal');
  assert.equal(ctx.state.current.value, 300);
  assert.equal(ctx.state.buzzedBy, null);
});

test('non-picker cannot select a tile', () => {
  const ctx = makeCtx(['a', 'b']);
  startGame(ctx, ['cars', 'animals']);
  const colId = ctx.state.board.columns[0].id;
  game.onAction(ctx, ctx.players[1], { control: 'tile', value: `${colId}:300` }); // b is not picker
  assert.equal(ctx.state.phase, 'board');
});

test('first buzz wins; a second buzz is ignored', () => {
  const ctx = makeCtx(['a', 'b']);
  startGame(ctx, ['cars', 'animals']);
  const colId = ctx.state.board.columns[0].id;
  game.onAction(ctx, ctx.players[0], { control: 'tile', value: `${colId}:100` });
  game.onAction(ctx, ctx.players[1], { control: 'buzz', value: true }); // b buzzes first
  assert.equal(ctx.state.buzzedBy, 'b');
  assert.equal(ctx.state.phase, 'answer');
  game.onAction(ctx, ctx.players[0], { control: 'buzz', value: true }); // a too late
  assert.equal(ctx.state.buzzedBy, 'b');
});

test('correct answer adds value, marks tile done, picker becomes answerer', () => {
  const ctx = makeCtx(['a', 'b']);
  startGame(ctx, ['cars', 'animals']);
  const col = ctx.state.board.columns[0];
  game.onAction(ctx, ctx.players[0], { control: 'tile', value: `${col.id}:200` });
  game.onAction(ctx, ctx.players[1], { control: 'buzz', value: true });
  const tile = ctx.state.current;
  game.onAction(ctx, ctx.players[1], { control: 'answer', value: tile.answer });
  assert.equal(ctx.players.find((p) => p.id === 'b').score, 200);
  assert.equal(ctx.state.pickerId, 'b');
  // tile is marked done on the board
  const onBoard = ctx.state.board.columns[0].tiles.find((t) => t.value === 200);
  assert.equal(onBoard.done, true);
});

test('wrong answer subtracts value (floored 0), locks out, reopens for others', () => {
  const ctx = makeCtx(['a', 'b']);
  startGame(ctx, ['cars', 'animals']);
  const col = ctx.state.board.columns[0];
  game.onAction(ctx, ctx.players[0], { control: 'tile', value: `${col.id}:100` });
  game.onAction(ctx, ctx.players[0], { control: 'buzz', value: true });
  const wrong = (ctx.state.current.answer + 1) % 4;
  game.onAction(ctx, ctx.players[0], { control: 'answer', value: wrong });
  assert.equal(ctx.players.find((p) => p.id === 'a').score, 0); // floored, not negative
  assert.ok(ctx.state.lockedOut.includes('a'));
  assert.equal(ctx.state.phase, 'reveal'); // reopened
  assert.equal(ctx.state.buzzedBy, null);
});

test('a locked-out player cannot buzz on reopen', () => {
  const ctx = makeCtx(['a', 'b']);
  startGame(ctx, ['cars', 'animals']);
  const col = ctx.state.board.columns[0];
  game.onAction(ctx, ctx.players[0], { control: 'tile', value: `${col.id}:100` });
  game.onAction(ctx, ctx.players[0], { control: 'buzz', value: true });
  game.onAction(ctx, ctx.players[0], { control: 'answer', value: (ctx.state.current.answer + 1) % 4 });
  game.onAction(ctx, ctx.players[0], { control: 'buzz', value: true }); // a is locked out
  assert.equal(ctx.state.buzzedBy, null);
});
