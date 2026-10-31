import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, parseConfig, loadConfig, clampSpeed } from '../../public/config.js';

const silent = () => {};

test('parseConfig accepts a valid config and fills gaps with defaults', () => {
  assert.deepEqual(parseConfig({ autoMinSeconds: 2, autoMaxSeconds: 30, autoDefaultSeconds: 8 }, silent), {
    autoMinSeconds: 2,
    autoMaxSeconds: 30,
    autoDefaultSeconds: 8,
    autoStepSeconds: 1,
  });
});

test('parseConfig falls back to defaults for an inconsistent config', () => {
  const bad = [
    { autoMinSeconds: 10, autoMaxSeconds: 5 },
    { autoDefaultSeconds: 20 },
    { autoMinSeconds: 0 },
    { autoStepSeconds: 0.5 },
    { autoMaxSeconds: '15' },
    null,
    [],
  ];
  for (const value of bad) assert.deepEqual(parseConfig(value, silent), DEFAULT_CONFIG, JSON.stringify(value));
});

test('loadConfig reads and validates config.json', async () => {
  const body = { autoMinSeconds: 2, autoMaxSeconds: 20, autoDefaultSeconds: 6, autoStepSeconds: 2 };
  const ok = async () => ({ ok: true, json: async () => body });
  assert.deepEqual(await loadConfig('x', ok), body);
});

test('loadConfig uses defaults when config.json is absent, broken or unreachable', async () => {
  const missing = async () => ({ ok: false });
  const broken = async () => ({ ok: true, json: async () => JSON.parse('{oops') });
  const offline = async () => {
    throw new TypeError('network down');
  };
  for (const fetchImpl of [missing, broken, offline]) {
    assert.deepEqual(await loadConfig('x', fetchImpl), DEFAULT_CONFIG);
  }
});

test('clampSpeed keeps a remembered speed inside the configured range', () => {
  assert.equal(clampSpeed(1, DEFAULT_CONFIG), 3);
  assert.equal(clampSpeed(99, DEFAULT_CONFIG), 15);
  assert.equal(clampSpeed(7, DEFAULT_CONFIG), 7);
  assert.equal(clampSpeed(NaN, DEFAULT_CONFIG), 5);
});
