// House bingo calls: a map of ball number -> the exact phrase read aloud.
// The data lives in data/calls.json so it can be edited (or bind-mounted)
// without touching code.

import { TOTAL_BALLS } from './game.js';

export const CALLS_URL = 'data/calls.json';

// Turns parsed JSON into a Map<number, string>, skipping bad entries so one
// typo in the file never takes the whole game down.
export function parseCalls(data, warn = console.warn) {
  const calls = new Map();
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    warn('calls.json should be an object of "number": "phrase" pairs; ignoring it.');
    return calls;
  }
  for (const [key, value] of Object.entries(data)) {
    const number = /^\d+$/.test(key) ? Number(key) : NaN;
    if (!Number.isInteger(number) || number < 1 || number > TOTAL_BALLS) {
      warn(`calls.json: "${key}" is not a ball number between 1 and ${TOTAL_BALLS}; skipping.`);
      continue;
    }
    if (typeof value !== 'string' || value.trim() === '') {
      warn(`calls.json: the call for ${number} should be non-empty text; skipping.`);
      continue;
    }
    calls.set(number, value.trim());
  }
  return calls;
}

// Missing or malformed file means "no calls": the game still works.
export async function loadCalls(url = CALLS_URL, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(url, { cache: 'no-cache' });
    if (!response.ok) return new Map();
    return parseCalls(await response.json());
  } catch (error) {
    console.warn(`Could not load ${url}; continuing without calls.`, error);
    return new Map();
  }
}
