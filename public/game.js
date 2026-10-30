// Pure game logic for a 90-ball bingo caller. No DOM access, so it runs
// unchanged in the browser and under `node --test`.
//
// A game is one shuffled sequence of 1..90 plus how many balls have been
// drawn from the front of it. Drawing, undoing and restoring after a reload
// are all just changes to `drawnCount`.

export const TOTAL_BALLS = 90;
export const RECENT_COUNT = 3;

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
  return { sequence: shuffledBalls(randomInt), drawnCount: 0 };
}

export function draw(state) {
  if (isFinished(state)) return state;
  return { ...state, drawnCount: state.drawnCount + 1 };
}

export function undo(state) {
  if (state.drawnCount === 0) return state;
  return { ...state, drawnCount: state.drawnCount - 1 };
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
