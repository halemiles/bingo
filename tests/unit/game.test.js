import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOTAL_BALLS,
  secureRandomInt,
  shuffledBalls,
  newGame,
  draw,
  undo,
  isFinished,
  currentBall,
  recentBalls,
  calledBalls,
  isValidState,
} from '../../public/game.js';

const oneToNinety = Array.from({ length: TOTAL_BALLS }, (_, i) => i + 1);
const inOrder = () => ({ sequence: [...oneToNinety], drawnCount: 0 });
const drawN = (state, n) => {
  for (let i = 0; i < n; i++) state = draw(state);
  return state;
};

test('secureRandomInt stays in range', () => {
  for (let i = 0; i < 2000; i++) {
    const n = secureRandomInt(90);
    assert.ok(Number.isInteger(n) && n >= 0 && n < 90);
  }
  assert.equal(secureRandomInt(1), 0);
  assert.throws(() => secureRandomInt(0), RangeError);
});

test('shuffledBalls is a permutation of 1..90', () => {
  const balls = shuffledBalls();
  assert.equal(balls.length, TOTAL_BALLS);
  assert.deepEqual([...balls].sort((a, b) => a - b), oneToNinety);
});

test('shuffledBalls actually shuffles', () => {
  // The chance of a fair shuffle landing in order is 1/90!, i.e. never.
  assert.notDeepEqual(shuffledBalls(), oneToNinety);
});

test('shuffledBalls uses the injected random source', () => {
  // Always picking j = 0 rotates the first element through: deterministic.
  assert.deepEqual(shuffledBalls(() => 0), shuffledBalls(() => 0));
});

test('newGame starts with nothing drawn', () => {
  const state = newGame();
  assert.equal(state.drawnCount, 0);
  assert.equal(currentBall(state), null);
  assert.deepEqual(recentBalls(state), []);
  assert.equal(calledBalls(state).size, 0);
  assert.ok(isValidState(state));
});

test('draw advances one ball at a time without repeats', () => {
  let state = newGame();
  const seen = new Set();
  for (let i = 1; i <= TOTAL_BALLS; i++) {
    state = draw(state);
    const ball = currentBall(state);
    assert.ok(!seen.has(ball), `ball ${ball} drawn twice`);
    seen.add(ball);
    assert.equal(state.drawnCount, i);
  }
  assert.equal(seen.size, TOTAL_BALLS);
});

test('draw does not mutate the previous state', () => {
  const before = inOrder();
  draw(before);
  assert.equal(before.drawnCount, 0);
});

test('draw past 90 is a no-op', () => {
  const finished = drawN(inOrder(), TOTAL_BALLS);
  assert.ok(isFinished(finished));
  assert.equal(draw(finished), finished);
});

test('undo reverses draw and stops at zero', () => {
  const state = drawN(inOrder(), 5);
  assert.equal(currentBall(undo(state)), 4);
  assert.equal(undo(inOrder()).drawnCount, 0);
});

test('recentBalls returns the balls before the current one, newest first', () => {
  const cases = [
    [0, null, []],
    [1, 1, []],
    [2, 2, [1]],
    [3, 3, [2, 1]],
    [4, 4, [3, 2, 1]],
    [5, 5, [4, 3, 2]],
    [90, 90, [89, 88, 87]],
  ];
  for (const [drawn, current, recent] of cases) {
    const state = drawN(inOrder(), drawn);
    assert.equal(currentBall(state), current, `current after ${drawn}`);
    assert.deepEqual(recentBalls(state), recent, `recent after ${drawn}`);
  }
});

test('calledBalls includes the current ball', () => {
  const called = calledBalls(drawN(inOrder(), 3));
  assert.deepEqual([...called].sort((a, b) => a - b), [1, 2, 3]);
});

test('isValidState rejects anything that is not a permutation with a sane count', () => {
  const bad = [
    null,
    'nope',
    {},
    { sequence: oneToNinety.slice(1), drawnCount: 0 },
    { sequence: [...oneToNinety.slice(1), 2], drawnCount: 0 },
    { sequence: [...oneToNinety.slice(1), 91], drawnCount: 0 },
    { sequence: [...oneToNinety.slice(1), '90'], drawnCount: 0 },
    { sequence: oneToNinety, drawnCount: -1 },
    { sequence: oneToNinety, drawnCount: 91 },
    { sequence: oneToNinety, drawnCount: 1.5 },
  ];
  for (const value of bad) assert.equal(isValidState(value), false, JSON.stringify(value));
  assert.ok(isValidState({ sequence: oneToNinety, drawnCount: 90 }));
});
