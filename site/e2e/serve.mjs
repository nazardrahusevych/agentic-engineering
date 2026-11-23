// Static server that behaves like GitHub Pages for a project site:
// serves <dist> under /agentic-engineering/, directories through index.html, a 301 to add a missing
// trailing slash, and 404.html with status 404 for anything missing.
// Usage: node e2e/serve.mjs <dist> <port>
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

const BASE = '/agentic-engineering/';
const dist = resolve(process.argv[2] ?? 'dist-e2e');
const port = Number(process.argv[3] ?? 4321);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function statOrNull(path) {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

function send(res, status, file) {
  res.writeHead(status, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  createReadStream(file).pipe(res);
}

function notFound(res) {
  const page = join(dist, '404.html');
  if (statOrNull(page)) return send(res, 404, page);
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return notFound(res);
  }
  if (`${pathname}/` === BASE) {
    res.writeHead(301, { Location: BASE + url.search });
    return res.end();
  }
  if (!pathname.startsWith(BASE) || pathname.includes('\0')) return notFound(res);
  const target = resolve(dist, `.${pathname.slice(BASE.length - 1)}`);
  if (target !== dist && !target.startsWith(dist + sep)) return notFound(res);
  const info = statOrNull(target);
  if (info?.isDirectory()) {
    if (!pathname.endsWith('/')) {
      res.writeHead(301, { Location: `${url.pathname}/${url.search}` });
      return res.end();
    }
    const index = join(target, 'index.html');
    return statOrNull(index) ? send(res, 200, index) : notFound(res);
  }
  if (info?.isFile()) return send(res, 200, target);
  return notFound(res);
}).listen(port, '127.0.0.1', () => {
  console.log(`serving ${dist} at http://127.0.0.1:${port}${BASE}`);
});
