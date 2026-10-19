import http from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from './lib/catalog.mjs';
import { createScryfallClient, exactKeys, HttpError, isUuid, validateIdentity, validateDiscoveryPage, buildQuery } from './lib/scryfall.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8', '.woff': 'font/woff', '.woff2': 'font/woff2' };
const SECURITY = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data: https://cards.scryfall.io; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'Cross-Origin-Resource-Policy': 'same-origin', 'Cache-Control': 'no-store'
};
function json(response, status, value, extra = {}) {
  response.writeHead(status, { ...SECURITY, 'Content-Type': 'application/json; charset=utf-8', ...extra });
  response.end(JSON.stringify(value));
}
async function readJson(request) {
  if (!(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) throw new HttpError(415, 'Use Content-Type: application/json.');
  if (Number(request.headers['content-length']) > 128 * 1024) throw new HttpError(413, 'Request body is too large.');
  let size = 0; const chunks = [];
  for await (const chunk of request) { size += chunk.length; if (size > 128 * 1024) throw new HttpError(413, 'Request body is too large.'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'Request body is not valid JSON.'); }
}
function checkOrigin(request, port) {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
  if (!hosts.has(request.headers.host)) throw new HttpError(403, 'Only this local server host is accepted.');
  if (request.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Cross-site requests are not accepted.');
  if (request.headers.origin && ![...hosts].some(host => request.headers.origin === `http://${host}`)) throw new HttpError(403, 'Only this local page may call its API.');
}

export async function createDeckServer({ root = ROOT, fetchImpl, minimumGap = 120, timeoutMs = 15000, contextTtl = 30 * 60 * 1000 } = {}) {
  let catalog, catalogError;
  try { catalog = await loadCatalog(root); } catch (error) { catalogError = error.message; }
  const provider = createScryfallClient({ fetchImpl, minimumGap, timeoutMs });
  const contexts = new Map();
  const publicRoot = path.resolve(root, 'public');
  let activeImports = 0;
  const server = http.createServer(async (request, response) => {
    try {
      checkOrigin(request, server.address().port);
      if (request.url.length > 2048) throw new HttpError(414, 'Request URL is too long.');
      const url = new URL(request.url, `http://127.0.0.1:${server.address().port}`);
      if (url.pathname.startsWith('/api/')) {
        if (url.search) throw new HttpError(400, 'API query parameters are not accepted.');
        if (url.pathname === '/api/catalog' && request.method === 'GET') {
          if (!catalog) throw new HttpError(503, `Source catalog unavailable: ${catalogError}`);
          return json(response, 200, catalog);
        }
        if (request.method !== 'POST') throw new HttpError(405, 'This API operation requires POST.');
        const payload = await readJson(request);
        if (url.pathname === '/api/resolve') {
          if (!exactKeys(payload, ['identifiers']) || !Array.isArray(payload.identifiers)) throw new HttpError(400, 'Only the identifiers array is accepted.');
          if (activeImports >= 3) throw new HttpError(503, 'There are already three imports in progress. Please wait.');
          activeImports++;
          let resolved;
          try { resolved = await provider.resolve(payload.identifiers); } finally { activeImports--; }
          for (const [token, context] of contexts) if (context.expires < Date.now()) contexts.delete(token);
          if (contexts.size >= 64) contexts.delete(contexts.keys().next().value);
          const contextToken = randomBytes(32).toString('base64url');
          contexts.set(contextToken, { expires: Date.now() + contextTtl, cards: new Map(resolved.cards.map(card => [card.id, { id: card.id, color_identity: card.color_identity }])) });
          return json(response, 200, { ...resolved, contextToken });
        }
        if (url.pathname === '/api/discover') {
          if (!catalog) throw new HttpError(503, `Source catalog unavailable: ${catalogError}`);
          if (!exactKeys(payload, ['atlasRowId', 'contextToken', 'commanderIds', 'page']) || typeof payload.atlasRowId !== 'string' || payload.atlasRowId.length > 100 || typeof payload.contextToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(payload.contextToken) || !Array.isArray(payload.commanderIds) || payload.commanderIds.length < 1 || payload.commanderIds.length > 2 || payload.commanderIds.some(id => !isUuid(id)) || new Set(payload.commanderIds.map(id => id.toLowerCase())).size !== payload.commanderIds.length) throw new HttpError(400, 'Select one or two resolved commanders and a supported Atlas row.');
          const page = validateDiscoveryPage(payload.page);
          const context = contexts.get(payload.contextToken);
          if (!context || context.expires < Date.now()) throw new HttpError(409, 'The resolved deck context has expired. Import the deck again before searching.');
          const selected = payload.commanderIds.map(id => context.cards.get(id.toLowerCase()));
          if (selected.some(card => !card)) throw new HttpError(400, 'Commander selection must come from this resolved import.');
          const identity = validateIdentity([...new Set(selected.flatMap(card => card.color_identity))]);
          const query = buildQuery(catalog, payload.atlasRowId, identity);
          const recipe=catalog.records.find(r=>r.atlas_row_id===payload.atlasRowId);
          const result = await provider.discover(query, identity, page);
          if (contexts.get(payload.contextToken) !== context || context.expires < Date.now()) throw new HttpError(409, 'The resolved deck context expired while searching. Import the deck again before searching.');
          return json(response, 200, { ...result, query, queryProvenance: { ...catalog.searchPolicy, atlasVersion:catalog.atlasVersion,mappingVersion:catalog.version,recipeId:recipe.atlas_row_id,tier:recipe.atlas.tier,coverage:recipe.discovery.coverage,validatedAt:recipe.discovery.validation.checkedAt, boundIdentity: identity.length ? identity.join('').toLowerCase() : 'c', appliedQuery: query, providerQuery: result.providerQuery, unique: result.unique, printingPreference: result.printingPreference }, atlasRowId: payload.atlasRowId, identity, provisional: selected.length > 1, identityNote: selected.length > 1 ? 'Cards within the provisional color union; commander pair eligibility is unverified.' : 'Cards within the selected commander color identity, including fewer-color and colorless cards. This is not a full deck legality check.' });
        }
        throw new HttpError(404, 'Unknown API operation.');
      }
      if (!['GET', 'HEAD'].includes(request.method)) throw new HttpError(405, 'Only GET or HEAD is accepted for page files.');
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { throw new HttpError(400, 'Invalid URL encoding.'); }
      if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(part => part.startsWith('.'))) throw new HttpError(404, 'File not found.');
      const candidate = path.resolve(publicRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!candidate.startsWith(publicRoot + path.sep)) throw new HttpError(404, 'File not found.');
      let file, bytes;
      try {
        file = await realpath(candidate);
        if (!file.startsWith(publicRoot + path.sep)) throw new Error('outside public');
        if (!MIME[path.extname(file)]) throw new Error('unsupported file type');
        bytes = await readFile(file);
      } catch { throw new HttpError(404, 'File not found.'); }
      response.writeHead(200, { ...SECURITY, 'Content-Type': MIME[path.extname(file)], 'Content-Length': bytes.length });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      if (!response.headersSent) json(response, error instanceof HttpError ? error.status : 500, { error: error instanceof HttpError ? error.message : 'The local server could not complete the request.' }, error.retryAfter ? { 'Retry-After': error.retryAfter } : {});
      else response.end();
    }
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4173);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  const server = await createDeckServer();
  server.listen(port, '127.0.0.1', () => console.log(`Deck Explorer is available at http://127.0.0.1:${port}`));
}
