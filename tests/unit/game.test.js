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
  STAGES,
  setStage,
  nextStage,
  isLastStage,
  restoreGame,
  recordClaim,
} from '../../public/game.js';

const oneToNinety = Array.from({ length: TOTAL_BALLS }, (_, i) => i + 1);
const inOrder = () => ({ sequence: [...oneToNinety], drawnCount: 0, stage: 0, log: [] });
const ballsLog = (...balls) => balls.map((ball) => ({ type: 'ball', ball }));
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

test('newGame starts with nothing drawn, playing for 1 line', () => {
  const state = newGame();
  assert.equal(state.drawnCount, 0);
  assert.equal(state.stage, 0);
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

test('the stages are 1 line, 2 lines, then full house', () => {
  assert.deepEqual(
    STAGES.map(({ name, lines }) => [name, lines]),
    [
      ['1 line', 1],
      ['2 lines', 2],
      ['Full house', 3],
    ],
  );
});

test('nextStage moves through the stages and stops at full house', () => {
  let state = inOrder();
  assert.equal(isLastStage(state), false);
  state = nextStage(state);
  assert.equal(state.stage, 1);
  state = nextStage(state);
  assert.equal(state.stage, 2);
  assert.ok(isLastStage(state));
  assert.equal(nextStage(state), state);
});

test('stage moves keep the balls and do not mutate the previous state', () => {
  const before = drawN(inOrder(), 7);
  const after = nextStage(before);
  assert.equal(before.stage, 0);
  assert.equal(after.drawnCount, 7);
  assert.equal(after.sequence, before.sequence);
});

test('draw and undo keep the stage', () => {
  const state = nextStage(drawN(inOrder(), 3));
  assert.equal(draw(state).stage, 1);
  assert.equal(undo(state).stage, 1);
});

test('setStage picks a stage directly, ignoring anything out of range', () => {
  const state = inOrder();
  assert.equal(setStage(state, 2).stage, 2);
  assert.equal(setStage(setStage(state, 2), 0).stage, 0);
  assert.equal(setStage(state, 0), state);
  for (const bad of [-1, 3, 1.5, '1', null]) assert.equal(setStage(state, bad), state, String(bad));
});

test('restoreGame keeps a saved game as it is', () => {
  const saved = nextStage(nextStage(drawN(inOrder(), 12)));
  assert.deepEqual(restoreGame(JSON.parse(JSON.stringify(saved))), saved);
});

test('restoreGame loads a game saved before stages existed at 1 line', () => {
  const restored = restoreGame({ sequence: oneToNinety, drawnCount: 3 });
  assert.deepEqual(restored, { sequence: oneToNinety, drawnCount: 3, stage: 0, log: ballsLog(1, 2, 3) });
});

test('restoreGame keeps the balls when the saved stage makes no sense', () => {
  for (const stage of [-1, 3, 'Full house', null, 0.5]) {
    const restored = restoreGame({ sequence: oneToNinety, drawnCount: 4, stage });
    assert.equal(restored.stage, 0, String(stage));
    assert.equal(restored.drawnCount, 4);
  }
});

test('restoreGame rejects a save that is not a valid game, and drops unknown fields', () => {
  assert.equal(restoreGame({ sequence: [1, 2, 3], drawnCount: 0 }), null);
  assert.equal(restoreGame(null), null);
  assert.deepEqual(Object.keys(restoreGame({ sequence: oneToNinety, drawnCount: 0, extra: 1 })), [
    'sequence',
    'drawnCount',
    'stage',
    'log',
  ]);
});

test('newGame starts with an empty log', () => {
  assert.deepEqual(newGame().log, []);
});

test('the log records balls, undos and stage changes in order', () => {
  let state = drawN(inOrder(), 2);
  state = nextStage(state);
  state = undo(state);
  state = draw(state);
  assert.deepEqual(state.log, [
    { type: 'ball', ball: 1 },
    { type: 'ball', ball: 2 },
    { type: 'stage', stage: 1 },
    { type: 'undo', ball: 2 },
    { type: 'ball', ball: 2 },
  ]);
});

test('moves that change nothing add nothing to the log', () => {
  const start = inOrder();
  assert.equal(undo(start), start);
  assert.equal(setStage(start, 0), start);
  const finished = drawN(inOrder(), TOTAL_BALLS);
  assert.equal(draw(finished), finished);
  assert.equal(finished.log.length, TOTAL_BALLS);
});

test('the log copes with a state that has none yet', () => {
  const { log, ...noLog } = inOrder();
  assert.deepEqual(draw(noLog).log, ballsLog(1));
});

test('recordClaim notes the numbers, the result and the stage', () => {
  const state = nextStage(drawN(inOrder(), 5));
  const result = { won: false, missing: [7], completedBy: null, ballsAgo: null };
  const after = recordClaim(state, [[1, 2, 3, 4, 7]], result);
  assert.deepEqual(after.log.at(-1), { type: 'claim', stage: 1, lines: [[1, 2, 3, 4, 7]], ...result });
  assert.equal(after.drawnCount, 5);
  assert.equal(state.log.length, 6, 'previous state untouched');
});

test('restoreGame keeps claim entries, late wins included', () => {
  const won = { won: true, missing: [], completedBy: 5, ballsAgo: 2 };
  const saved = recordClaim(drawN(inOrder(), 7), [[1, 2, 3, 4, 5]], won);
  assert.deepEqual(restoreGame(JSON.parse(JSON.stringify(saved))).log.at(-1).completedBy, 5);
});

test('restoreGame drops log entries that make no sense but keeps the rest', () => {
  const log = [
    ...ballsLog(1, 2),
    { type: 'stage', stage: 1 },
    { type: 'stage', stage: 9 },
    { type: 'claim', stage: 1, lines: [[1, 2, 'x']], won: false, missing: [], completedBy: null, ballsAgo: null },
    { type: 'claim', stage: 1, lines: [[1, 2]], won: 'yes', missing: [], completedBy: null, ballsAgo: null },
    { type: 'claim', stage: 1, lines: [[1, 2]], won: true, missing: [], completedBy: 99, ballsAgo: 0 },
    { type: 'claim', stage: 1, lines: [[1, 2]], won: true, missing: [], completedBy: 2, ballsAgo: -1 },
    { type: 'claim', stage: 1, lines: 'nope', won: true, missing: [], completedBy: 2, ballsAgo: 0 },
    { type: 'mystery' },
    null,
    'ball',
  ];
  const restored = restoreGame({ sequence: oneToNinety, drawnCount: 2, stage: 1, log });
  assert.deepEqual(restored.log, [...ballsLog(1, 2), { type: 'stage', stage: 1 }]);
});

test('restoreGame rebuilds a log that does not match the balls', () => {
  const rebuilt = ballsLog(1, 2, 3);
  const cases = [
    ballsLog(1, 2), // too few
    ballsLog(1, 3, 2), // wrong order
    [...ballsLog(1, 2, 3), { type: 'undo', ball: 1 }], // undoes a ball that wasn't last
    [{ type: 'undo', ball: 1 }, ...ballsLog(1, 2, 3)], // undoes before anything was drawn
    'not a list',
    undefined,
  ];
  for (const log of cases) {
    const restored = restoreGame({ sequence: oneToNinety, drawnCount: 3, log });
    assert.deepEqual(restored.log, rebuilt, JSON.stringify(log));
  }
});

test('restoreGame accepts a log with undos that replays to the balls drawn', () => {
  const log = [...ballsLog(1, 2), { type: 'undo', ball: 2 }, ...ballsLog(2, 3)];
  assert.deepEqual(restoreGame({ sequence: oneToNinety, drawnCount: 3, log }).log, log);
});
