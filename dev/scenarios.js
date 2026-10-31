// Ready-made games for trying things out by hand (the dev server's /dev/
// page) and for the Playwright tests (tests/e2e/helpers.js), so both set up
// exactly the same game. Plain data, no DOM, no imports: it runs in the
// browser and under Node.
//
// Only the dev server serves this. It isn't in public/, so it never ships
// in the Docker image, and a stray URL on the night can't replace the game.

export const GAME_KEY = 'bingo.game.v1';

// A known draw order: `first` comes out in that order, then the rest ascending.
export function sequenceStartingWith(...first) {
  const rest = [];
  for (let n = 1; n <= 90; n++) if (!first.includes(n)) rest.push(n);
  return [...first, ...rest];
}

// One made-up ticket, three lines of five, for the claim scenarios.
export const TICKET = [
  [4, 23, 45, 61, 88],
  [7, 19, 32, 50, 77],
  [2, 16, 38, 64, 81],
];

const game = (first, drawnCount, stage = 0) => ({ sequence: sequenceStartingWith(...first), drawnCount, stage });

const balls = (...numbers) => numbers.map((ball) => ({ type: 'ball', ball }));

// A game with a bit of everything in its history: a late 1-line win, the
// move to 2 lines, a ball undone and drawn again, and a 2-line claim that
// isn't there yet.
const historySample = {
  sequence: sequenceStartingWith(...TICKET[0], 70, 71, 7, 19, 32),
  drawnCount: 10,
  stage: 1,
  log: [
    ...balls(...TICKET[0], 70, 71),
    { type: 'claim', stage: 0, lines: [TICKET[0]], won: true, missing: [], completedBy: 88, ballsAgo: 2 },
    { type: 'stage', stage: 1 },
    ...balls(7, 19),
    { type: 'undo', ball: 19 },
    ...balls(19, 32),
    { type: 'claim', stage: 1, lines: TICKET.slice(0, 2), won: false, missing: [50, 77], completedBy: null, ballsAgo: null },
  ],
};

// `game` is what's saved under GAME_KEY; null clears the saved game.
// `claim` lists ticket lines to type into the claim checker, where useful.
export const SCENARIOS = [
  {
    id: 'fresh',
    title: 'New game',
    description: 'Nothing drawn, playing for 1 line. The next balls are 1, 2, 3 and so on.',
    game: game([], 0),
  },
  {
    id: 'house-call-next',
    title: 'House call next',
    description: 'Three balls out; the next ball is 88, which has a house call ("Two fat ladies 88").',
    game: game([5, 12, 47, 88], 3),
  },
  {
    id: 'traditional-next',
    title: 'Traditional readings next',
    description: 'The next balls are 47, 50, 5 and 90: two digits, a round ten, a single digit, and 90.',
    game: game([47, 50, 5, 90], 0),
  },
  {
    id: 'one-line-ready',
    title: '1 line ready to claim',
    description: 'The first ticket line has been called, playing for 1 line.',
    game: game(TICKET[0], 5, 0),
    claim: TICKET.slice(0, 1),
  },
  {
    id: 'one-line-late',
    title: '1 line, claimed late',
    description: 'The first ticket line was complete three balls ago (finished by 88).',
    game: game([...TICKET[0], 70, 71, 72], 8, 0),
    claim: TICKET.slice(0, 1),
  },
  {
    id: 'two-lines-one-short',
    title: '2 lines, one ball short',
    description: 'Playing for 2 lines; nine of the ten numbers are out and 77 is next.',
    game: game([...TICKET[0], ...TICKET[1]], 9, 1),
    claim: TICKET.slice(0, 2),
  },
  {
    id: 'full-house-next',
    title: 'Full house on the next ball',
    description: 'Playing for a full house; 14 of the 15 numbers are out and 81 is next.',
    game: game(TICKET.flat(), 14, 2),
    claim: TICKET,
  },
  {
    id: 'history-sample',
    title: 'A game with some history',
    description: 'Ten balls in: a late 1-line win, the move to 2 lines, a ball undone, and a 2-line claim not there yet. Press H.',
    game: historySample,
  },
  {
    id: 'last-ball',
    title: 'Last ball',
    description: '89 balls out; the next one ends the game.',
    game: game([], 89, 2),
  },
  {
    id: 'old-save',
    title: 'Game saved by an older version',
    description: 'A save from before prize stages and history (no stage or log). It loads at 1 line, with the balls as its history.',
    game: { sequence: sequenceStartingWith(88, 47, 12), drawnCount: 3 },
  },
  {
    id: 'clear',
    title: 'No saved game',
    description: 'Removes the saved game, as on a first visit. Settings such as speed and voice are kept.',
    game: null,
  },
];

export function findScenario(id) {
  const scenario = SCENARIOS.find((s) => s.id === id);
  if (!scenario) throw new Error(`Unknown scenario "${id}"`);
  return scenario;
}
