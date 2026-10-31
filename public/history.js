// The game history: the game's log (see game.js) turned into a timeline to
// show on screen and a plain-text file to download. Pure, no DOM, so it runs
// under `node --test`.

import { STAGES, TOTAL_BALLS } from './game.js';
import { describeResult } from './claims.js';

// One row per log entry, in order:
//   { kind: 'ball', position, ball }   position counts balls out, as on screen
//   { kind: 'undo', ball, text }
//   { kind: 'stage', text }
//   { kind: 'claim', won, text, note, lines }
export function timeline(state) {
  let position = 0;
  return state.log.map((entry) => {
    switch (entry.type) {
      case 'ball':
        position++;
        return { kind: 'ball', position, ball: entry.ball };
      case 'undo':
        position--;
        return { kind: 'undo', ball: entry.ball, text: `Ball ${entry.ball} undone: back in the machine` };
      case 'stage':
        return { kind: 'stage', text: `Now playing for ${STAGES[entry.stage].name}` };
      default: {
        // A claim check.
        const { title, note } = describeResult(entry, entry.stage);
        return {
          kind: 'claim',
          won: entry.won,
          text: `Claim for ${STAGES[entry.stage].name}: ${title}`,
          note,
          lines: entry.lines,
        };
      }
    }
  });
}

export function summary(state) {
  return `${state.drawnCount} of ${TOTAL_BALLS} balls called. Playing for ${STAGES[state.stage].name}.`;
}

// The downloadable copy. `exportedAt` is a ready-formatted date and time.
export function historyText(state, exportedAt) {
  const width = String(TOTAL_BALLS).length;
  const rows = timeline(state).map((row) => {
    switch (row.kind) {
      case 'ball':
        return `${String(row.position).padStart(width)}. ${row.ball}`;
      case 'claim': {
        const numbers = row.lines.map((line) => `    ${line.join(' ')}`);
        return [`* ${row.text}`, ...(row.note ? [`  ${row.note}`] : []), ...numbers].join('\n');
      }
      default:
        return `* ${row.text}`;
    }
  });
  return [
    'Bingo: game history',
    `Exported ${exportedAt}`,
    summary(state),
    '',
    ...(rows.length ? rows : ['No balls called yet.']),
    '',
  ].join('\n');
}

const pad = (n) => String(n).padStart(2, '0');

// e.g. bingo-2026-10-31-1942.txt, in local time.
export function historyFileName(date) {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `bingo-${day}-${pad(date.getHours())}${pad(date.getMinutes())}.txt`;
}
