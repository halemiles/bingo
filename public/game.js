// Pure game logic for a 90-ball bingo caller. No DOM access, so it runs
// unchanged in the browser and under `node --test`.
//
// A game is one shuffled sequence of 1..90 plus how many balls have been
// drawn from the front of it. Drawing, undoing and restoring after a reload
// are all just changes to `drawnCount`.
//
// `log` records what happened, in order, for the game history: each ball,
// undo, stage change and claim check. It only ever grows, so an undo shows
// up as an event rather than quietly rewriting the past.

export const TOTAL_BALLS = 90;
export const RECENT_COUNT = 3;

// The prizes a game plays for, in order. `lines` is how many ticket lines a
// claim at that stage covers. The game never advances on its own: several
// people can win on the same ball, so the caller moves on.
export const STAGES = Object.freeze([
  Object.freeze({ name: '1 line', lines: 1 }),
  Object.freeze({ name: '2 lines', lines: 2 }),
  Object.freeze({ name: 'Full house', lines: 3 }),
]);

// Uniform random integer in [0, maxExclusive) from the platform CSPRNG.
// Rejection sampling avoids the modulo bias of `random % max`.
export function secureRandomInt(maxExclusive) {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 2 ** 32) {
    throw new RangeError(`maxExclusive must be an integer in 1..2^32, got ${maxExclusive}`);
  }
  const limit = 2 ** 32 - (2 ** 32 % maxExclusive);
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % maxExclusive;
}

// Fisher–Yates shuffle of 1..TOTAL_BALLS. `randomInt` is injectable for tests.
export function shuffledBalls(randomInt = secureRandomInt) {
  const balls = Array.from({ length: TOTAL_BALLS }, (_, i) => i + 1);
  for (let i = balls.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [balls[i], balls[j]] = [balls[j], balls[i]];
  }
  return balls;
}

export function newGame(randomInt = secureRandomInt) {
  return { sequence: shuffledBalls(randomInt), drawnCount: 0, stage: 0, log: [] };
}

const withEntry = (state, entry) => [...(state.log ?? []), entry];

export function draw(state) {
  if (isFinished(state)) return state;
  const ball = state.sequence[state.drawnCount];
  return { ...state, drawnCount: state.drawnCount + 1, log: withEntry(state, { type: 'ball', ball }) };
}

export function undo(state) {
  if (state.drawnCount === 0) return state;
  const ball = currentBall(state);
  return { ...state, drawnCount: state.drawnCount - 1, log: withEntry(state, { type: 'undo', ball }) };
}

// Notes a checked claim in the log: the numbers entered and what
// checkClaim (claims.js) made of them, at the stage being played for.
export function recordClaim(state, lines, { won, missing, completedBy, ballsAgo }) {
  const entry = { type: 'claim', stage: state.stage, lines, won, missing, completedBy, ballsAgo };
  return { ...state, log: withEntry(state, entry) };
}

export function isValidStage(stage) {
  return Number.isInteger(stage) && stage >= 0 && stage < STAGES.length;
}

export function setStage(state, stage) {
  if (!isValidStage(stage) || stage === state.stage) return state;
  return { ...state, stage, log: withEntry(state, { type: 'stage', stage }) };
}

export function isLastStage(state) {
  return state.stage === STAGES.length - 1;
}

export function nextStage(state) {
  return isLastStage(state) ? state : setStage(state, state.stage + 1);
}

export function isFinished(state) {
  return state.drawnCount >= TOTAL_BALLS;
}

export function currentBall(state) {
  return state.drawnCount > 0 ? state.sequence[state.drawnCount - 1] : null;
}

// The balls drawn before the current one, most recent first.
export function recentBalls(state, count = RECENT_COUNT) {
  const end = Math.max(state.drawnCount - 1, 0);
  const start = Math.max(end - count, 0);
  return state.sequence.slice(start, end).reverse();
}

export function calledBalls(state) {
  return new Set(state.sequence.slice(0, state.drawnCount));
}

// Guards state loaded from storage: anything that isn't a full permutation
// of 1..90 with a sane drawnCount is rejected rather than half-trusted.
// The stage isn't checked here; restoreGame defaults it.
export function isValidState(value) {
  if (!value || typeof value !== 'object') return false;
  const { sequence, drawnCount } = value;
  if (!Array.isArray(sequence) || sequence.length !== TOTAL_BALLS) return false;
  if (!Number.isInteger(drawnCount) || drawnCount < 0 || drawnCount > TOTAL_BALLS) return false;
  const seen = new Set();
  for (const n of sequence) {
    if (!Number.isInteger(n) || n < 1 || n > TOTAL_BALLS || seen.has(n)) return false;
    seen.add(n);
  }
  return true;
}

const isBall = (n) => Number.isInteger(n) && n >= 1 && n <= TOTAL_BALLS;
const isBallList = (list) => Array.isArray(list) && list.every(isBall);

function isValidLogEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  switch (entry.type) {
    case 'ball':
    case 'undo':
      return isBall(entry.ball);
    case 'stage':
      return isValidStage(entry.stage);
    case 'claim':
      return (
        isValidStage(entry.stage) &&
        Array.isArray(entry.lines) &&
        entry.lines.every(isBallList) &&
        typeof entry.won === 'boolean' &&
        isBallList(entry.missing) &&
        (entry.completedBy === null || isBall(entry.completedBy)) &&
        (entry.ballsAgo === null || (Number.isInteger(entry.ballsAgo) && entry.ballsAgo >= 0))
      );
    default:
      return false;
  }
}

// Plays the ball and undo entries back. True only if they come out in the
// sequence's order and end with exactly the balls drawn.
function logMatchesBalls(log, sequence, drawnCount) {
  let count = 0;
  for (const entry of log) {
    if (entry.type === 'ball') {
      if (entry.ball !== sequence[count]) return false;
      count++;
    } else if (entry.type === 'undo') {
      if (count === 0 || entry.ball !== sequence[count - 1]) return false;
      count--;
    }
  }
  return count === drawnCount;
}

// A saved log is kept if it agrees with the balls, minus any entries that
// make no sense. Otherwise (a save from before the log existed, or one that
// was tampered with) the history is rebuilt from the balls alone.
function restoreLog(log, sequence, drawnCount) {
  const entries = Array.isArray(log) ? log.filter(isValidLogEntry) : [];
  if (Array.isArray(log) && logMatchesBalls(entries, sequence, drawnCount)) return entries;
  return sequence.slice(0, drawnCount).map((ball) => ({ type: 'ball', ball }));
}

// Turns a saved game back into state, or null if it can't be trusted.
// Fields added since the first version are defaulted rather than rejected:
// a missing or nonsense stage starts at 1 line, and a missing or broken log
// is rebuilt from the balls, so an older save never loses its game.
export function restoreGame(value) {
  if (!isValidState(value)) return null;
  const { sequence, drawnCount, stage, log } = value;
  return {
    sequence,
    drawnCount,
    stage: isValidStage(stage) ? stage : 0,
    log: restoreLog(log, sequence, drawnCount),
  };
}
