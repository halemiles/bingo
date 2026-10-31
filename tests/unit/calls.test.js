import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseCalls, loadCalls } from '../../public/calls.js';

const silent = () => {};

test('the bundled calls.json is valid with no skipped entries', async () => {
  const raw = JSON.parse(await readFile(new URL('../../public/data/calls.json', import.meta.url), 'utf8'));
  const warnings = [];
  const calls = parseCalls(raw, (message) => warnings.push(message));
  assert.deepEqual(warnings, []);
  assert.equal(calls.size, Object.keys(raw).length);
  assert.equal(calls.get(88), 'Two fat ladies 88');
});

test('parseCalls keeps good entries and skips bad ones', () => {
  const warnings = [];
  const calls = parseCalls(
    {
      4: 'Number 4 on his own',
      11: '  Legs 11  ',
      0: 'zero',
      91: 'too high',
      '07': 'leading zero is fine',
      '1.5': 'not whole',
      abc: 'not a number',
      22: '',
      33: 42,
    },
    (message) => warnings.push(message),
  );
  assert.deepEqual(
    [...calls].sort(([a], [b]) => a - b),
    [
      [4, 'Number 4 on his own'],
      [7, 'leading zero is fine'],
      [11, 'Legs 11'],
    ],
  );
  assert.equal(warnings.length, 6);
});

test('parseCalls treats a non-object as no calls', () => {
  for (const value of [null, [], 'x', 3]) assert.equal(parseCalls(value, silent).size, 0);
});

test('loadCalls returns no calls when the file is missing or broken', async () => {
  const missing = async () => ({ ok: false, json: async () => ({}) });
  const broken = async () => ({ ok: true, json: async () => JSON.parse('{oops') });
  const offline = async () => {
    throw new TypeError('network down');
  };
  const originalWarn = console.warn;
  console.warn = silent;
  try {
    for (const fetchImpl of [missing, broken, offline]) {
      assert.equal((await loadCalls('x', fetchImpl)).size, 0);
    }
  } finally {
    console.warn = originalWarn;
  }
});
