import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draw, undo, nextStage, recordClaim, TOTAL_BALLS } from '../../public/game.js';
import { checkClaim } from '../../public/claims.js';
import { timeline, summary, historyText, historyFileName } from '../../public/history.js';

const oneToNinety = Array.from({ length: TOTAL_BALLS }, (_, i) => i + 1);
const start = () => ({ sequence: [...oneToNinety], drawnCount: 0, stage: 0, log: [] });
const drawN = (state, n) => {
  for (let i = 0; i < n; i++) state = draw(state);
  return state;
};
const claim = (state, lines) => recordClaim(state, lines, checkClaim(lines, state));

// 5 balls, a winning line checked late, on to 2 lines, a ball undone and
// drawn again, then a failed claim.
function sampleGame() {
  let state = drawN(start(), 7);
  state = claim(state, [[1, 2, 3, 4, 5]]);
  state = nextStage(state);
  state = undo(state);
  state = draw(state);
  return claim(state, [
    [1, 2, 3, 4, 5],
    [6, 7, 8, 9, 10],
  ]);
}

test('timeline numbers the balls as they came out', () => {
  const rows = timeline(drawN(start(), 3));
  assert.deepEqual(rows, [
    { kind: 'ball', position: 1, ball: 1 },
    { kind: 'ball', position: 2, ball: 2 },
    { kind: 'ball', position: 3, ball: 3 },
  ]);
});

test('timeline shows stage changes, claims and undos where they happened', () => {
  const rows = timeline(sampleGame());
  assert.deepEqual(
    rows.map((row) => row.kind),
    ['ball', 'ball', 'ball', 'ball', 'ball', 'ball', 'ball', 'claim', 'stage', 'undo', 'ball', 'claim'],
  );
  assert.deepEqual(rows[7], {
    kind: 'claim',
    won: true,
    text: 'Claim for 1 line: 1 line! ✅',
    note: 'Complete since 5, 2 balls ago.',
    lines: [[1, 2, 3, 4, 5]],
  });
  assert.equal(rows[8].text, 'Now playing for 2 lines');
  assert.deepEqual(rows[9], { kind: 'undo', ball: 7, text: 'Ball 7 undone: back in the machine' });
  // The ball drawn again after the undo takes the same place.
  assert.deepEqual(rows[10], { kind: 'ball', position: 7, ball: 7 });
  assert.equal(rows[11].text, 'Claim for 2 lines: Not yet: 8, 9 and 10 not called');
  assert.equal(rows[11].won, false);
});

test('summary says how far the game has got', () => {
  assert.equal(summary(sampleGame()), '7 of 90 balls called. Playing for 2 lines.');
});

test('historyText is a readable copy of the timeline', () => {
  const text = historyText(sampleGame(), '31 Oct 2026, 19:42');
  assert.equal(
    text,
    [
      'Bingo: game history',
      'Exported 31 Oct 2026, 19:42',
      '7 of 90 balls called. Playing for 2 lines.',
      '',
      ' 1. 1',
      ' 2. 2',
      ' 3. 3',
      ' 4. 4',
      ' 5. 5',
      ' 6. 6',
      ' 7. 7',
      '* Claim for 1 line: 1 line! ✅',
      '  Complete since 5, 2 balls ago.',
      '    1 2 3 4 5',
      '* Now playing for 2 lines',
      '* Ball 7 undone: back in the machine',
      ' 7. 7',
      '* Claim for 2 lines: Not yet: 8, 9 and 10 not called',
      '    1 2 3 4 5',
      '    6 7 8 9 10',
      '',
    ].join('\n'),
  );
});

test('historyText for a game with nothing called yet', () => {
  assert.match(historyText(start(), 'now'), /No balls called yet\.\n$/);
});

test('historyText for a full house', () => {
  let state = nextStage(nextStage(drawN(start(), 15)));
  state = claim(state, [
    [1, 2, 3, 4, 5],
    [6, 7, 8, 9, 10],
    [11, 12, 13, 14, 15],
  ]);
  assert.match(historyText(state, 'now'), /\* Claim for Full house: Full house! 🎉\n {4}1 2 3 4 5\n/);
});

test('historyFileName uses the local date and time', () => {
  assert.equal(historyFileName(new Date(2026, 9, 31, 19, 42)), 'bingo-2026-10-31-1942.txt');
  assert.equal(historyFileName(new Date(2027, 0, 5, 9, 7)), 'bingo-2027-01-05-0907.txt');
});
