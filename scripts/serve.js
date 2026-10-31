// Minimal static file server for local development and the Playwright tests.
// Production uses nginx (see Dockerfile); this just avoids a dev dependency.
//
//   npm start            -> http://localhost:8080
//   PORT=3000 npm start
//
// It also serves dev/ at /dev/: a page of ready-made games (scenarios) for
// trying things out. That's dev only; the Docker image serves public/ alone.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const devRoot = fileURLToPath(new URL('../dev/', import.meta.url));
const DEV_PREFIX = '/dev/';
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '127.0.0.1';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

async function resolveFile(base, urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const path = normalize(join(base, decoded));
  if (path !== base.slice(0, -1) && !path.startsWith(base)) return null; // path traversal
  const info = await stat(path).catch(() => null);
  if (info?.isDirectory()) return resolveFile(base, join(decoded, 'index.html'));
  return info?.isFile() ? path : null;
}

createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname === '/dev') {
      res.writeHead(301, { Location: DEV_PREFIX }).end();
      return;
    }
    const file = pathname.startsWith(DEV_PREFIX)
      ? await resolveFile(devRoot, pathname.slice(DEV_PREFIX.length - 1))
      : await resolveFile(root, pathname);
    if (!file || (req.method !== 'GET' && req.method !== 'HEAD')) {
      res.writeHead(file ? 405 : 404, { 'Content-Type': 'text/plain' }).end(file ? 'Method not allowed' : 'Not found');
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': types[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Bad request');
  }
}).listen(port, host, () => {
  console.log(`Bingo running at http://${host}:${port} (serving ${root.split(sep).slice(-2).join(sep)})`);
  console.log(`Scenarios for testing: http://${host}:${port}${DEV_PREFIX}`);
});
