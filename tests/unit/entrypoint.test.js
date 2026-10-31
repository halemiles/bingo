// Runs the container's config script directly with sh, so CI covers it
// without needing Docker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../docker/40-bingo-config.sh', import.meta.url));

function run(env) {
  const dir = mkdtempSync(join(tmpdir(), 'bingo-config-'));
  try {
    const result = spawnSync('sh', [script], {
      env: { PATH: process.env.PATH, BINGO_CONFIG_DIR: dir, ...env },
      encoding: 'utf8',
    });
    let config = null;
    try {
      config = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));
    } catch {
      // No file written.
    }
    return { status: result.status, stderr: result.stderr, config };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('defaults when no env vars are set', () => {
  const { status, config } = run({});
  assert.equal(status, 0);
  assert.deepEqual(config, { autoMinSeconds: 3, autoMaxSeconds: 15, autoDefaultSeconds: 5, autoStepSeconds: 1 });
});

test('custom values, with leading zeros normalised', () => {
  const { status, config } = run({ AUTO_MIN_SECONDS: '05', AUTO_MAX_SECONDS: '30', AUTO_DEFAULT_SECONDS: '08' });
  assert.equal(status, 0);
  assert.deepEqual(config, { autoMinSeconds: 5, autoMaxSeconds: 30, autoDefaultSeconds: 8, autoStepSeconds: 1 });
});

test('an empty value means the default', () => {
  const { status, config } = run({ AUTO_MIN_SECONDS: '' });
  assert.equal(status, 0);
  assert.equal(config.autoMinSeconds, 3);
});

test('bad values fail with a clear message and write nothing', () => {
  const cases = [
    [{ AUTO_MIN_SECONDS: '20', AUTO_MAX_SECONDS: '10' }, /greater than AUTO_MAX_SECONDS/],
    [{ AUTO_DEFAULT_SECONDS: '20' }, /must be between 3 and 15/],
    [{ AUTO_DEFAULT_SECONDS: 'fast' }, /whole number/],
    [{ AUTO_STEP_SECONDS: '1.5' }, /whole number/],
    [{ AUTO_MIN_SECONDS: '0' }, /at least 1/],
    [{ AUTO_MAX_SECONDS: '99999' }, /at most 3600/],
    [{ AUTO_MAX_SECONDS: '1; rm -rf /' }, /whole number/],
  ];
  for (const [env, message] of cases) {
    const { status, stderr, config } = run(env);
    assert.notEqual(status, 0, JSON.stringify(env));
    assert.match(stderr, message, JSON.stringify(env));
    assert.equal(config, null, JSON.stringify(env));
  }
});
