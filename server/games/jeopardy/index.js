// Jeopardy "Buzz Room". The TV shows a category board and types out questions;
// phones are buzzers. First to buzz locks everyone out, then answers multiple
// choice. See docs/superpowers/specs/2026-06-29-jeopardy-buzz-room-design.md.
import {
  buildBoard, findTile, parseTileId, tileId, boardEmpty,
  canBuzz, applyScore, computeWinner, revealMsFor,
} from './logic.js';
import { categoryList, getCategory } from './packs.js';

const ANSWER_MS = 10000;   // answer clock after a buzz
const RESOLVED_MS = 3000;  // pause showing the result before the next pick
const REOPEN_GRACE_MS = 800;

// Real timers, keyed by room code so a game's pending transition can be cancelled.
const timers = new Map();
function setTimer(code, ms, fn) {
  clearTimer(code);
  const t = setTimeout(fn, ms);
  if (typeof t.unref === 'function') t.unref(); // don't keep the process alive
  timers.set(code, t);
}
function clearTimer(code) {
  const t = timers.get(code);
  if (t) { clearTimeout(t); timers.delete(code); }
}

function nameOf(ctx, pid) {
  return ctx.players.find((p) => p.id === pid)?.name || 'Someone';
}
function scoreOf(ctx, pid) {
  return ctx.players.find((p) => p.id === pid)?.score || 0;
}
function eligibleToBuzz(ctx) {
  // connected players who are not locked out of the current tile
  return ctx.players.filter((p) => !(ctx.state.lockedOut || []).includes(p.id));
}

function renderControllers(ctx) {
  const s = ctx.state;
  ctx.renderControllers((p) => {
    if (s.phase === 'setup') {
      return { title: '🧠 Buzz Room', subtitle: 'Pick the categories on the TV!', controls: [] };
    }
    if (s.phase === 'board') {
      if (p.id === s.pickerId) {
        const options = [];
        for (const col of s.board.columns) {
          for (const t of col.tiles) {
            if (!t.done) options.push({ id: tileId(col.id, t.value), label: `${col.emoji} ${col.name} ${t.value}` });
          }
        }
        return { title: 'Your pick!', subtitle: 'Choose a category & value', controls: [{ type: 'choices', id: 'tile', options }] };
      }
      return { title: 'Watch the TV', subtitle: `${nameOf(ctx, s.pickerId)} is choosing…`, controls: [] };
    }
    if (s.phase === 'reveal') {
      if ((s.lockedOut || []).includes(p.id)) {
        return { title: 'Locked out', subtitle: 'Someone else can answer this one.', controls: [] };
      }
      return { title: 'Read the TV…', subtitle: 'Tap BUZZ when you know it!', controls: [{ type: 'buzz', id: 'buzz', label: '🔴 BUZZ' }] };
    }
    if (s.phase === 'answer') {
      if (p.id === s.buzzedBy) {
        const opts = s.current.choices.map((label, i) => ({ id: String(i), label }));
        return { title: 'You buzzed — answer!', subtitle: 'Quick, pick one!', controls: [{ type: 'choices', id: 'answer', big: true, options: opts }] };
      }
      return { title: 'Hold on…', subtitle: `${nameOf(ctx, s.buzzedBy)} is answering`, controls: [] };
    }
    if (s.phase === 'resolved') {
      return { title: '⏱️', subtitle: 'Next pick coming up…', controls: [] };
    }
    // over
    const win = s.winner === p.id;
    return {
      title: win ? '🏆 You win!' : 'Good game!',
      subtitle: `Winner: ${nameOf(ctx, s.winner)}`,
      controls: [{ type: 'button', id: 'again', label: '🔁 Play Again', big: true, color: '#22c55e' }],
    };
  });
}

function pushAll(ctx, extra = {}) {
  ctx.renderTV(extra);
  renderControllers(ctx);
}

function startBoard(ctx) {
  const s = ctx.state;
  s.phase = 'board';
  s.current = null;
  s.buzzedBy = null;
  s.lockedOut = [];
  if (boardEmpty(s.board)) return endGame(ctx);
  // Keep the same picker; if the picker is gone, fall back to the first player.
  if (!ctx.players.some((p) => p.id === s.pickerId)) s.pickerId = ctx.players[0]?.id || null;
  pushAll(ctx);
}

function startReveal(ctx, colId, value) {
  const s = ctx.state;
  const tile = findTile(s.board, colId, value);
  if (!tile || tile.done) return;
  s.current = { colId, value, q: tile.q, choices: tile.choices, answer: tile.answer, audio: tile.audio };
  s.buzzedBy = null;
  s.lockedOut = [];
  s.phase = 'reveal';
  s.revealMs = revealMsFor(tile.q);
  pushAll(ctx, { startReveal: true });
  ctx.narrate(tile.q);
  // If nobody buzzes by the time the text finishes + grace, reveal the answer.
  setTimer(ctx.room.code, s.revealMs + REOPEN_GRACE_MS, () => {
    if (ctx.state && ctx.state.phase === 'reveal' && ctx.state.buzzedBy == null) {
      resolveNoBuzz(ctx);
    }
  });
}

function reopenReveal(ctx) {
  const s = ctx.state;
  s.buzzedBy = null;
  s.phase = 'reveal';
  s.revealMs = 0; // text already shown; show it instantly
  // If everyone is locked out, just reveal the answer.
  if (eligibleToBuzz(ctx).length === 0) return resolveNoBuzz(ctx);
  pushAll(ctx, { reopen: true });
  setTimer(ctx.room.code, 6000, () => {
    if (ctx.state && ctx.state.phase === 'reveal' && ctx.state.buzzedBy == null) resolveNoBuzz(ctx);
  });
}

function handleCorrect(ctx, pid) {
  const s = ctx.state;
  const value = s.current.value;
  ctx.addScore(pid, value);
  markDone(ctx);
  s.pickerId = pid;
  s.lastResult = { pid, correct: true, value, answer: s.current.answer };
  s.phase = 'resolved';
  pushAll(ctx, { result: 'correct' });
  ctx.narrate(`${nameOf(ctx, pid)} is right! Plus ${value}.`);
  setTimer(ctx.room.code, RESOLVED_MS, () => { if (ctx.state) startBoard(ctx); });
}

function handleWrong(ctx, pid) {
  const s = ctx.state;
  const value = s.current.value;
  const before = scoreOf(ctx, pid);
  const after = applyScore(before, -value);
  ctx.addScore(pid, after - before); // apply floored delta
  if (!s.lockedOut.includes(pid)) s.lockedOut.push(pid);
  s.lastResult = { pid, correct: false, value, answer: s.current.answer };
  ctx.narrate(`Sorry ${nameOf(ctx, pid)}, that's not it.`);
  reopenReveal(ctx);
}

function resolveNoBuzz(ctx) {
  const s = ctx.state;
  markDone(ctx);
  s.lastResult = { pid: null, correct: false, value: s.current.value, answer: s.current.answer };
  s.phase = 'resolved';
  pushAll(ctx, { result: 'timeout' });
  ctx.narrate(`The answer was ${s.current.choices[s.current.answer]}.`);
  setTimer(ctx.room.code, RESOLVED_MS, () => { if (ctx.state) startBoard(ctx); });
}

function markDone(ctx) {
  const s = ctx.state;
  const tile = findTile(s.board, s.current.colId, s.current.value);
  if (tile) tile.done = true;
}

function endGame(ctx) {
  const s = ctx.state;
  s.phase = 'over';
  s.winner = computeWinner(ctx.players.map((p) => ({ id: p.id, score: p.score })));
  pushAll(ctx, { over: true });
  ctx.narrate(`Game over! The winner is ${nameOf(ctx, s.winner)}!`);
}

function beginWithCategories(ctx, ids) {
  const cats = (Array.isArray(ids) ? ids : []).map(getCategory).filter(Boolean);
  if (cats.length < 2 || cats.length > 4) return; // need 2-4 valid categories
  const s = ctx.state;
  s.categoryIds = cats.map((c) => c.id);
  s.board = buildBoard(cats);
  s.pickerId = ctx.players[0]?.id || null;
  s.lastResult = null;
  s.winner = null;
  startBoard(ctx);
}

export default {
  id: 'jeopardy',
  name: 'Buzz Room',
  emoji: '🧠',
  minPlayers: 1,
  maxPlayers: 8,
  blurb: 'Jeopardy-style trivia. Read the TV, race to BUZZ, answer multiple choice!',

  sync(ctx) {
    // Re-push everything for a reconnecting phone / changed roster.
    if (!ctx.state) return;
    pushAll(ctx);
  },

  init(ctx) {
    ctx.state = {
      phase: 'setup',
      categoryIds: [],
      board: null,
      pickerId: null,
      current: null,
      revealMs: 0,
      buzzedBy: null,
      lockedOut: [],
      lastResult: null,
      winner: null,
      catalogue: categoryList(), // shown on the TV setup screen
    };
    clearTimer(ctx.room.code);
    pushAll(ctx);
    ctx.narrate('Buzz Room! Pick your categories on the TV.');
  },

  // The TV drives setup (and replay) via host:gameAction.
  onHostAction(ctx, action) {
    if (!ctx.state) return;
    if (ctx.state.phase === 'setup' && action.control === 'categories') {
      beginWithCategories(ctx, action.value);
    }
  },

  onAction(ctx, player, action) {
    const s = ctx.state;
    if (!s) return;

    if (s.phase === 'board' && action.control === 'tile') {
      if (player.id !== s.pickerId) return;
      const { colId, value } = parseTileId(action.value);
      startReveal(ctx, colId, value);
      return;
    }

    if (s.phase === 'reveal' && action.control === 'buzz') {
      if (!canBuzz(s, player.id)) return;
      s.buzzedBy = player.id;
      s.phase = 'answer';
      clearTimer(ctx.room.code);
      pushAll(ctx, { buzz: player.id });
      ctx.narrate(`${nameOf(ctx, player.id)} buzzed!`);
      setTimer(ctx.room.code, ANSWER_MS, () => {
        if (ctx.state && ctx.state.phase === 'answer' && ctx.state.buzzedBy === player.id) {
          handleWrong(ctx, player.id); // timeout = wrong
        }
      });
      return;
    }

    if (s.phase === 'answer' && action.control === 'answer') {
      if (player.id !== s.buzzedBy) return;
      clearTimer(ctx.room.code);
      const correct = Number(action.value) === s.current.answer;
      if (correct) handleCorrect(ctx, player.id);
      else handleWrong(ctx, player.id);
      return;
    }

    if (s.phase === 'over' && action.control === 'again') {
      beginWithCategories(ctx, s.categoryIds);
    }
  },
};
