// Auto-mode speed settings. In Docker these come from environment variables
// rendered into config.json at container start (see docker/40-bingo-config.sh).
// Anywhere else the file is absent and the defaults below apply.

export const CONFIG_URL = 'config.json';

export const DEFAULT_CONFIG = Object.freeze({
  autoMinSeconds: 3,
  autoMaxSeconds: 15,
  autoDefaultSeconds: 5,
  autoStepSeconds: 1,
});

// All-or-nothing: a config that doesn't hang together falls back to the
// defaults entirely rather than mixing in some of its values.
export function parseConfig(data, warn = console.warn) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ...DEFAULT_CONFIG };
  const config = { ...DEFAULT_CONFIG };
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    if (key in data) config[key] = data[key];
  }
  const { autoMinSeconds: min, autoMaxSeconds: max, autoDefaultSeconds: def, autoStepSeconds: step } = config;
  const valid =
    [min, max, def, step].every((n) => Number.isInteger(n) && n >= 1) && min <= def && def <= max;
  if (!valid) {
    warn('config.json is invalid; using default auto speed settings.', data);
    return { ...DEFAULT_CONFIG };
  }
  return config;
}

export async function loadConfig(url = CONFIG_URL, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(url, { cache: 'no-cache' });
    if (!response.ok) return { ...DEFAULT_CONFIG };
    return parseConfig(await response.json());
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

// A remembered speed may predate a config change, so pull it back in range.
export function clampSpeed(seconds, config) {
  if (!Number.isFinite(seconds)) return config.autoDefaultSeconds;
  return Math.min(Math.max(Math.round(seconds), config.autoMinSeconds), config.autoMaxSeconds);
}
