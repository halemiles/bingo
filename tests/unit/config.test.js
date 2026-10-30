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

test('loadConfig uses defaults when config.json is absent', async () => {
  const missing = async () => ({ ok: false });
  assert.deepEqual(await loadConfig('x', missing), DEFAULT_CONFIG);
});

test('clampSpeed keeps a remembered speed inside the configured range', () => {
  assert.equal(clampSpeed(1, DEFAULT_CONFIG), 3);
  assert.equal(clampSpeed(99, DEFAULT_CONFIG), 15);
  assert.equal(clampSpeed(7, DEFAULT_CONFIG), 7);
  assert.equal(clampSpeed(NaN, DEFAULT_CONFIG), 5);
});
