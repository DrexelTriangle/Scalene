// Stub of the Triangle CMS API for Scalene's end-to-end smoke tests.
//
// Replay (default): serves recorded JSON from e2e/fixtures/, keyed by request
// path + query. A request with no fixture gets a 404 and is logged, which is
// what the CMS does for an unknown slug, so pages exercise their real fallbacks.
//
// Record: `E2E_RECORD=1 node e2e/stub-cms.mjs` proxies every /v1 request to
// E2E_UPSTREAM (default https://delta.thetriangle.org/v1, read-only GETs) and
// saves 200 JSON responses as fixtures. Run the suite once against it to
// refresh fixtures after an API change.
//
// Media (/wp-content/..., used through Scalene's /proxy route) always gets a
// 1x1 PNG so pages don't depend on the real media host.
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(here, 'fixtures');
const PORT = Number(process.env.E2E_CMS_PORT ?? 4010);
const RECORD = process.env.E2E_RECORD === '1';
const UPSTREAM = (process.env.E2E_UPSTREAM ?? 'https://delta.thetriangle.org/v1').replace(/\/$/, '');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

/** /v1/sections/news/articles?limit=20&offset=0 -> sections__news__articles@limit=20&offset=0.json */
export function fixtureName(pathAndQuery) {
  const [path, query = ''] = pathAndQuery.replace(/^\/v1\/?/, '').split('?');
  const params = [...new URLSearchParams(query)].sort(([a], [b]) => a.localeCompare(b));
  const q = params.map(([k, v]) => `${k}=${v}`).join('&');
  const base = (path || 'root').replace(/\/+$/, '').replace(/\//g, '__');
  return `${base}${q ? '@' + q : ''}`.replace(/[^A-Za-z0-9_@=&.-]/g, '_') + '.json';
}

mkdirSync(FIXTURES, { recursive: true });

const server = createServer(async (req, res) => {
  const url = req.url ?? '/';

  if (url.includes('/wp-content/')) {
    res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
    return res.end(PNG);
  }
  if (!url.startsWith('/v1')) {
    res.writeHead(404, { 'content-type': 'application/json' });
    return res.end('{"error":"not found"}');
  }

  const file = join(FIXTURES, fixtureName(url));

  if (RECORD && req.method === 'GET') {
    try {
      const upstream = await fetch(UPSTREAM + url.replace(/^\/v1/, ''), { headers: { accept: 'application/json' } });
      const body = await upstream.text();
      if (upstream.ok && (upstream.headers.get('content-type') ?? '').includes('json')) {
        writeFileSync(file, JSON.stringify(JSON.parse(body), null, 1) + '\n');
        console.log(`[stub-cms] recorded ${url}`);
      }
      res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json' });
      return res.end(body);
    } catch (err) {
      console.error(`[stub-cms] upstream failed for ${url}: ${err}`);
      res.writeHead(502, { 'content-type': 'application/json' });
      return res.end('{"error":"upstream failed"}');
    }
  }

  if (req.method === 'GET' && existsSync(file)) {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'max-age=60' });
    return res.end(readFileSync(file));
  }

  console.log(`[stub-cms] no fixture for ${req.method} ${url} (${fixtureName(url)})`);
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end('{"error":"not found"}');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[stub-cms] ${RECORD ? `recording from ${UPSTREAM}` : 'replaying fixtures'} on http://127.0.0.1:${PORT}/v1`);
});
