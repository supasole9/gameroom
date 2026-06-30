import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE_VALUES, shuffle, buildBoard, tileId, parseTileId, findTile,
  boardEmpty, canBuzz, applyScore, computeWinner, revealMsFor,
} from './logic.js';
import { CATEGORIES, getCategory } from './packs.js';

// A deterministic rng for repeatable shuffles in tests.
function seededRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

test('every category is well-formed (>=5 Qs, 4 choices, valid answer)', () => {
  assert.ok(CATEGORIES.length >= 2);
  for (const c of CATEGORIES) {
    assert.ok(c.id && c.name && c.emoji, `meta for ${c.id}`);
    assert.ok(c.questions.length >= 5, `${c.id} needs >=5 questions`);
    for (const q of c.questions) {
      assert.equal(q.choices.length, 4, `${c.id}: "${q.q}" needs 4 choices`);
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 3, `${c.id}: bad answer index`);
    }
  }
});

test('shuffle is a permutation and is deterministic with a seeded rng', () => {
  const input = [1, 2, 3, 4, 5, 6];
  const out = shuffle(input, seededRng(42));
  assert.deepEqual([...out].sort((a, b) => a - b), input);
  assert.deepEqual(out, shuffle(input, seededRng(42)));
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6]); // input not mutated
});

test('buildBoard makes one column per category with 5 valued tiles', () => {
  const cats = [getCategory('cars'), getCategory('animals')];
  const board = buildBoard(cats, seededRng(7));
  assert.equal(board.columns.length, 2);
  for (const col of board.columns) {
    assert.equal(col.tiles.length, 5);
    assert.deepEqual(col.tiles.map((t) => t.value), TILE_VALUES);
    assert.ok(col.tiles.every((t) => t.done === false));
    assert.ok(col.tiles.every((t) => t.choices.length === 4));
    // questions within a column are distinct
    const qs = col.tiles.map((t) => t.q);
    assert.equal(new Set(qs).size, qs.length);
  }
});

test('tileId / parseTileId round-trip', () => {
  assert.equal(tileId('cars', 300), 'cars:300');
  assert.deepEqual(parseTileId('cars:300'), { colId: 'cars', value: 300 });
});

test('findTile + boardEmpty', () => {
  const board = buildBoard([getCategory('cars')], seededRng(1));
  const t = findTile(board, 'cars', 200);
  assert.ok(t && t.value === 200);
  assert.equal(findTile(board, 'nope', 200), null);
  assert.equal(boardEmpty(board), false);
  board.columns[0].tiles.forEach((tile) => { tile.done = true; });
  assert.equal(boardEmpty(board), true);
});

test('canBuzz respects first-buzz and lockout', () => {
  assert.equal(canBuzz({ buzzedBy: null, lockedOut: [] }, 'a'), true);
  assert.equal(canBuzz({ buzzedBy: 'b', lockedOut: [] }, 'a'), false); // someone already buzzed
  assert.equal(canBuzz({ buzzedBy: null, lockedOut: ['a'] }, 'a'), false); // locked out
});

test('applyScore floors at 0', () => {
  assert.equal(applyScore(300, 200), 500);
  assert.equal(applyScore(100, -300), 0);
  assert.equal(applyScore(0, -100), 0);
});

test('computeWinner returns highest score, first on tie', () => {
  assert.equal(computeWinner([{ id: 'a', score: 3 }, { id: 'b', score: 7 }]), 'b');
  assert.equal(computeWinner([{ id: 'a', score: 5 }, { id: 'b', score: 5 }]), 'a');
  assert.equal(computeWinner([]), null);
});

test('revealMsFor scales with word count and has a floor', () => {
  assert.ok(revealMsFor('one two three') >= 1200);
  assert.ok(revealMsFor('a b c d e f g h i j k l') > revealMsFor('a b c'));
});
