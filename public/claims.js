// Checking a player's claim against the balls drawn so far. Pure functions,
// no DOM, so they run under `node --test` as well as in the browser.
//
// A claim is typed or pasted one ticket line per line of text, 5 numbers to
// a line. How many lines depends on the stage being played for.

import { TOTAL_BALLS, STAGES } from './game.js';

export const NUMBERS_PER_LINE = 5;
// Beyond this many, "not called" gives a count instead of listing them all.
const MAX_LISTED = 5;

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

// "4", "4 and 9", "4, 9 and 23".
export function formatList(numbers) {
  if (numbers.length <= 1) return numbers.join('');
  return `${numbers.slice(0, -1).join(', ')} and ${numbers.at(-1)}`;
}

// Splits the text into lines of numbers and checks the shape of the claim.
// Returns { lines, errors }; the claim is usable only when errors is empty.
// Every problem is reported at once, so the caller can fix them in one go.
export function parseClaim(text, expectedLines) {
  const rows = String(text)
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter((row) => row !== '');
  const errors = [];
  const wanted = `Enter ${plural(expectedLines, 'line')} of ${NUMBERS_PER_LINE} numbers${expectedLines > 1 ? ', one per line' : ''}.`;

  if (rows.length === 0) {
    errors.push(wanted);
  } else if (rows.length !== expectedLines) {
    errors.push(`${wanted} There ${rows.length === 1 ? 'is' : 'are'} ${plural(rows.length, 'line')}.`);
  }

  const lines = rows.map((row, i) => {
    const label = `Line ${i + 1}`;
    const tokens = row.split(/[\s,;]+/).filter((token) => token !== '');
    const numbers = [];
    for (const token of tokens) {
      if (!/^\d+$/.test(token)) {
        errors.push(`${label}: "${token}" is not a number.`);
      } else if (Number(token) < 1 || Number(token) > TOTAL_BALLS) {
        errors.push(`${label}: ${Number(token)} is not between 1 and ${TOTAL_BALLS}.`);
      } else {
        numbers.push(Number(token));
      }
    }
    if (tokens.length !== NUMBERS_PER_LINE) {
      errors.push(`${label} has ${plural(tokens.length, 'number')}; a line has ${NUMBERS_PER_LINE}.`);
    }
    return numbers;
  });

  // A ticket never repeats a number, so a repeat anywhere is a typo.
  const seen = new Set();
  const repeated = new Set();
  for (const n of lines.flat()) {
    if (seen.has(n)) repeated.add(n);
    seen.add(n);
  }
  for (const n of repeated) errors.push(`${n} is entered more than once.`);

  return { lines, errors };
}

// Checks claimed numbers against the game. `missing` lists the numbers not
// called yet, in the order entered. For a win, `completedBy` is the ball that
// finished the claim and `ballsAgo` how many balls have been drawn since,
// so a late claim can be spotted without being refused.
export function checkClaim(lines, state) {
  const drawnAt = new Map(state.sequence.map((n, i) => [n, i + 1]));
  const numbers = lines.flat();
  const missing = numbers.filter((n) => drawnAt.get(n) > state.drawnCount);
  if (numbers.length === 0 || missing.length > 0) {
    return { won: false, missing, completedBy: null, ballsAgo: null };
  }
  const finishedAt = Math.max(...numbers.map((n) => drawnAt.get(n)));
  return {
    won: true,
    missing,
    completedBy: state.sequence[finishedAt - 1],
    ballsAgo: state.drawnCount - finishedAt,
  };
}

// The words shown for a result: a headline, plus a note for late claims.
export function describeResult(result, stage) {
  const { name } = STAGES[stage];
  if (result.won) {
    const title = stage === STAGES.length - 1 ? `${name}! 🎉` : `${name}! ✅`;
    const note =
      result.ballsAgo > 0
        ? `Complete since ${result.completedBy}, ${plural(result.ballsAgo, 'ball')} ago.`
        : '';
    return { title, note };
  }
  const { missing } = result;
  const what = missing.length <= MAX_LISTED ? formatList(missing) : `${missing.length} numbers`;
  return { title: `Not yet: ${what} not called`, note: '' };
}
