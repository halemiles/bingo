// The dev scenarios are used by the /dev/ page and the Playwright helpers,
// so a broken one would quietly test the wrong thing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restoreGame, isValidState, TOTAL_BALLS } from '../../public/game.js';
import { checkClaim } from '../../public/claims.js';
import { SCENARIOS, TICKET, findScenario, sequenceStartingWith } from '../../dev/scenarios.js';

test('sequenceStartingWith puts the given balls first, then the rest ascending', () => {
  const sequence = sequenceStartingWith(88, 5);
  assert.deepEqual(sequence.slice(0, 4), [88, 5, 1, 2]);
  assert.ok(isValidState({ sequence, drawnCount: 0 }));
});

test('every scenario has a unique id, a title and a description', () => {
  const ids = SCENARIOS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of SCENARIOS) assert.ok(s.title && s.description, s.id);
});

test('every scenario game loads as it is', () => {
  for (const { id, game } of SCENARIOS) {
    if (game === null) continue;
    const restored = restoreGame(game);
    assert.ok(restored, `${id} does not load`);
    assert.equal(restored.drawnCount, game.drawnCount, id);
  }
});

test('the old-save scenario really has no stage', () => {
  assert.equal('stage' in findScenario('old-save').game, false);
});

test('claim scenarios say what their description promises', () => {
  const at = (id) => findScenario(id);
  assert.equal(checkClaim(at('one-line-ready').claim, at('one-line-ready').game).ballsAgo, 0);
  assert.equal(checkClaim(at('one-line-late').claim, at('one-line-late').game).ballsAgo, 3);
  assert.deepEqual(checkClaim(at('two-lines-one-short').claim, at('two-lines-one-short').game).missing, [77]);
  assert.deepEqual(checkClaim(at('full-house-next').claim, at('full-house-next').game).missing, [81]);
  assert.deepEqual(new Set(TICKET.flat()).size, 15);
});

test('the next-ball scenarios have the promised balls next', () => {
  const next = (id, count = 1) => {
    const { game } = findScenario(id);
    return game.sequence.slice(game.drawnCount, game.drawnCount + count);
  };
  assert.deepEqual(next('house-call-next'), [88]);
  assert.deepEqual(next('traditional-next', 4), [47, 50, 5, 90]);
  assert.equal(findScenario('last-ball').game.drawnCount, TOTAL_BALLS - 1);
});

test('findScenario rejects an unknown id', () => {
  assert.throws(() => findScenario('nope'), /Unknown scenario "nope"/);
});
