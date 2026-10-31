import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOTAL_BALLS } from '../../public/game.js';
import { NUMBERS_PER_LINE, formatList, parseClaim, checkClaim, describeResult } from '../../public/claims.js';

// A game where `first` came out in that order, then everything else.
function gameStartingWith(first, drawnCount = first.length) {
  const rest = [];
  for (let n = 1; n <= TOTAL_BALLS; n++) if (!first.includes(n)) rest.push(n);
  return { sequence: [...first, ...rest], drawnCount, stage: 0 };
}

test('formatList joins numbers the way you would say them', () => {
  assert.equal(formatList([]), '');
  assert.equal(formatList([4]), '4');
  assert.equal(formatList([4, 9]), '4 and 9');
  assert.equal(formatList([4, 9, 23]), '4, 9 and 23');
});

test('parseClaim reads one ticket line per line of text', () => {
  const { lines, errors } = parseClaim('4 23 45 61 88\n 7, 19,32;50  77 \n', 2);
  assert.deepEqual(errors, []);
  assert.deepEqual(lines, [
    [4, 23, 45, 61, 88],
    [7, 19, 32, 50, 77],
  ]);
});

test('parseClaim takes a pasted block with Windows line endings and blank lines', () => {
  const block = '\r\n1 12 23 34 45\r\n\r\n2 13 24 35 46\r\n3 14 25 36 47\r\n';
  const { lines, errors } = parseClaim(block, 3);
  assert.deepEqual(errors, []);
  assert.equal(lines.length, 3);
  assert.ok(lines.every((line) => line.length === NUMBERS_PER_LINE));
});

test('parseClaim accepts leading zeros', () => {
  assert.deepEqual(parseClaim('01 02 03 04 090', 1).lines, [[1, 2, 3, 4, 90]]);
});

test('parseClaim asks for the right number of lines', () => {
  assert.deepEqual(parseClaim('  \n ', 1).errors, ['Enter 1 line of 5 numbers.']);
  assert.deepEqual(parseClaim('', 3).errors, ['Enter 3 lines of 5 numbers, one per line.']);
  assert.deepEqual(parseClaim('1 2 3 4 5', 2).errors, ['Enter 2 lines of 5 numbers, one per line. There is 1 line.']);
  assert.deepEqual(parseClaim('1 2 3 4 5\n6 7 8 9 10', 1).errors, ['Enter 1 line of 5 numbers. There are 2 lines.']);
});

test('parseClaim needs exactly 5 numbers on each line', () => {
  assert.deepEqual(parseClaim('1 2 3 4\n5 6 7 8 9 10', 2).errors, [
    'Line 1 has 4 numbers; a line has 5.',
    'Line 2 has 6 numbers; a line has 5.',
  ]);
  assert.deepEqual(parseClaim('1\n2 3 4 5 6', 2).errors, ['Line 1 has 1 number; a line has 5.']);
});

test('parseClaim rejects anything that is not a ball number', () => {
  assert.deepEqual(parseClaim('0 91 4x -5 6', 1).errors, [
    'Line 1: 0 is not between 1 and 90.',
    'Line 1: 91 is not between 1 and 90.',
    'Line 1: "4x" is not a number.',
    'Line 1: "-5" is not a number.',
  ]);
  assert.deepEqual(parseClaim('1 2 3 4 5.0', 1).errors, ['Line 1: "5.0" is not a number.']);
});

test('parseClaim rejects a number entered twice, on one line or across lines', () => {
  assert.deepEqual(parseClaim('1 2 3 3 5', 1).errors, ['3 is entered more than once.']);
  assert.deepEqual(parseClaim('1 2 3 4 5\n6 7 8 9 1', 2).errors, ['1 is entered more than once.']);
  // Entered three times is still one message.
  assert.deepEqual(parseClaim('7 7 7 8 9', 1).errors, ['7 is entered more than once.']);
});

test('parseClaim treats odd input as text, not code', () => {
  const { errors } = parseClaim('<b>1</b> 2 3 4 5', 1);
  assert.deepEqual(errors, ['Line 1: "<b>1</b>" is not a number.']);
  assert.ok(parseClaim(undefined, 1).errors.length > 0);
});

test('checkClaim: a win on the last ball', () => {
  const state = gameStartingWith([4, 23, 45, 61, 88]);
  assert.deepEqual(checkClaim([[4, 23, 45, 61, 88]], state), {
    won: true,
    missing: [],
    completedBy: 88,
    ballsAgo: 0,
  });
});

test('checkClaim: not yet, listing what is missing in the order entered', () => {
  const state = gameStartingWith([4, 45, 88]);
  const result = checkClaim([[61, 4, 23, 45, 88]], state);
  assert.equal(result.won, false);
  assert.deepEqual(result.missing, [61, 23]);
  assert.equal(result.completedBy, null);
});

test('checkClaim: only drawn balls count, not ones further down the sequence', () => {
  const state = gameStartingWith([1, 2, 3, 4, 5], 4);
  assert.deepEqual(checkClaim([[1, 2, 3, 4, 5]], state).missing, [5]);
});

test('checkClaim: a claim complete a few balls ago says which ball finished it', () => {
  // 61 (the 5th ball) finished the line; 70, 71 and 72 came after it.
  const state = gameStartingWith([1, 4, 23, 45, 61, 70, 71, 72]);
  const result = checkClaim([[4, 23, 45, 61, 1]], state);
  assert.equal(result.won, true);
  assert.equal(result.completedBy, 61);
  assert.equal(result.ballsAgo, 3);
});

test('checkClaim: two lines and a full house need every number', () => {
  const ticket = [
    [1, 12, 23, 34, 45],
    [2, 13, 24, 35, 46],
    [3, 14, 25, 36, 47],
  ];
  // Every ticket number comes out, 47 last.
  const state = gameStartingWith(ticket.flat(), 14);
  assert.equal(checkClaim(ticket.slice(0, 2), state).won, true);
  assert.deepEqual(checkClaim(ticket, state).missing, [47]);
  assert.deepEqual(checkClaim(ticket, { ...state, drawnCount: 15 }), {
    won: true,
    missing: [],
    completedBy: 47,
    ballsAgo: 0,
  });
});

test('checkClaim: an empty claim never wins', () => {
  assert.equal(checkClaim([], gameStartingWith([1, 2, 3])).won, false);
});

test('describeResult: wins at each stage', () => {
  const win = { won: true, missing: [], completedBy: 88, ballsAgo: 0 };
  assert.deepEqual(describeResult(win, 0), { title: '1 line! ✅', note: '' });
  assert.deepEqual(describeResult(win, 1), { title: '2 lines! ✅', note: '' });
  assert.deepEqual(describeResult(win, 2), { title: 'Full house! 🎉', note: '' });
});

test('describeResult: a late win gets a gentle note', () => {
  assert.equal(
    describeResult({ won: true, missing: [], completedBy: 61, ballsAgo: 3 }, 0).note,
    'Complete since 61, 3 balls ago.',
  );
  assert.equal(
    describeResult({ won: true, missing: [], completedBy: 61, ballsAgo: 1 }, 1).note,
    'Complete since 61, 1 ball ago.',
  );
});

test('describeResult: not yet names the missing numbers, or counts a long list', () => {
  const notYet = (missing) => describeResult({ won: false, missing, completedBy: null, ballsAgo: null }, 0);
  assert.deepEqual(notYet([23, 61]), { title: 'Not yet: 23 and 61 not called', note: '' });
  assert.equal(notYet([7]).title, 'Not yet: 7 not called');
  assert.equal(notYet([1, 2, 3, 4, 5]).title, 'Not yet: 1, 2, 3, 4 and 5 not called');
  assert.equal(notYet([1, 2, 3, 4, 5, 6]).title, 'Not yet: 6 numbers not called');
});
