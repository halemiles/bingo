// Turns the raw V8 coverage written by tests/e2e/fixtures.js into a per-line
// report for the browser code, with no dependencies.
//
//   node scripts/e2e-coverage.js clean   -> delete old coverage data
//   node scripts/e2e-coverage.js         -> print the report
//
// V8 reports nested byte ranges with execution counts; the innermost range
// containing a byte decides its count. A line counts as covered if any of
// its code ran in any test.

import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

const dir = join(process.cwd(), 'coverage', 'e2e');

if (process.argv[2] === 'clean') {
  await rm(dir, { recursive: true, force: true });
  process.exit(0);
}

const files = await readdir(dir).catch(() => []);
if (files.length === 0) {
  console.error('No coverage data. Run: npm run test:e2e:coverage');
  process.exit(1);
}

// url -> { source, covered: Uint8Array per byte, executable: Uint8Array per byte }
const scripts = new Map();

for (const file of files) {
  for (const { url, source, functions } of JSON.parse(await readFile(join(dir, file), 'utf8'))) {
    const name = new URL(url).pathname.replace(/^\//, '');
    if (!scripts.has(name)) {
      scripts.set(name, { source, covered: new Uint8Array(source.length) });
    }
    const counts = new Int32Array(source.length).fill(-1);
    // Outer ranges first, so inner ranges overwrite them.
    const ranges = functions.flatMap((fn) => fn.ranges).sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
    for (const { startOffset, endOffset, count } of ranges) counts.fill(count, startOffset, endOffset);
    const { covered } = scripts.get(name);
    counts.forEach((count, i) => {
      if (count > 0) covered[i] = 1;
    });
  }
}

const rows = [];
for (const [name, { source, covered }] of [...scripts].sort()) {
  let offset = 0;
  let total = 0;
  const uncovered = [];
  source.split('\n').forEach((line, index) => {
    const start = offset;
    offset += line.length + 1;
    const code = line.trim();
    // Skip lines with nothing executable on them.
    if (!code || /^(\/\/|\/?\*|[}\])]+[;,)]*$|import |export \{|} from )/.test(code)) return;
    total++;
    const firstChar = start + line.indexOf(code[0]);
    if (!covered[firstChar]) uncovered.push(index + 1);
  });
  const pct = total ? (100 * (total - uncovered.length)) / total : 100;
  rows.push({ name, pct, total, uncovered });
}

const ranges = (lines) =>
  lines
    .reduce((acc, n) => {
      const last = acc.at(-1);
      if (last && n === last[1] + 1) last[1] = n;
      else acc.push([n, n]);
      return acc;
    }, [])
    .map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`))
    .join(', ');

console.log('\nE2E coverage (Chromium, browser code)\n');
for (const { name, pct, total, uncovered } of rows) {
  console.log(`${name.padEnd(12)} ${pct.toFixed(1).padStart(5)}% of ${String(total).padStart(3)} lines`);
  if (uncovered.length) console.log(`             uncovered: ${ranges(uncovered)}`);
}
console.log();
