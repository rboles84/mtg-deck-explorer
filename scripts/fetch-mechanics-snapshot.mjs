// Public, read-only Scryfall requests. Writes only a new audit snapshot directory.
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url));
const headers = { 'User-Agent': 'DeckExplorerCoverageAudit/1.0 (local deterministic metadata validation)', Accept: 'application/json' };
const requests = [];
let last = 0;
async function get(url, maxBytes) {
  const u = new URL(url);
  assert.equal(u.protocol, 'https:');
  assert.ok(['api.scryfall.com', 'data.scryfall.io'].includes(u.hostname));
  await new Promise(resolve => setTimeout(resolve, Math.max(0, 550 - (Date.now() - last))));
  last = Date.now();
  const started_at = new Date().toISOString();
  const response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(120000) });
  assert.equal(response.status, 200, `HTTP ${response.status}: ${url}; no automatic retry`);
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length; assert.ok(bytes <= maxBytes, 'Response exceeds audit bound'); chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  requests.push({ url, started_at, completed_at: new Date().toISOString(), status: response.status, bytes,
    sha256: createHash('sha256').update(buffer).digest('hex'), headers: Object.fromEntries(['date', 'etag', 'last-modified', 'content-type', 'content-encoding'].map(k => [k, response.headers.get(k)])) });
  return buffer;
}
const indexBytes = await get('https://api.scryfall.com/bulk-data', 1024 * 1024);
const index = JSON.parse(indexBytes);
assert.equal(index.has_more, false);
const bulk = index.data.find(r => r.type === 'oracle_cards');
assert.ok(bulk);
const url = bulk.jsonl_download_uri ?? bulk.download_uri;
assert.ok(url, 'No supported bulk download URL');
const stamp = bulk.updated_at.replace(/[^0-9]/g, '').slice(0, 14);
const dest = path.join(root, 'reports/mechanics-coverage/snapshots', stamp);
await mkdir(path.dirname(dest), { recursive: true });
await mkdir(dest); // Refuse to overwrite an existing pinned snapshot.
await writeFile(path.join(dest, 'bulk-index.json'), indexBytes);
const catalogs = {};
for (const kind of ['keyword-abilities', 'keyword-actions', 'ability-words']) {
  const bytes = await get(`https://api.scryfall.com/catalog/${kind}`, 1024 * 1024);
  const data = JSON.parse(bytes);
  assert.equal(data.object, 'catalog'); assert.equal(data.total_values, data.data.length);
  catalogs[kind] = kind + '.json';
  await writeFile(path.join(dest, catalogs[kind]), bytes);
}
const filename = url.endsWith('.gz') ? 'oracle-cards.jsonl.gz' : 'oracle-cards.json';
const bytes = await get(url, 200 * 1024 * 1024);
if (bulk.compressed_size && filename.endsWith('.gz')) assert.equal(bytes.length, bulk.compressed_size);
await writeFile(path.join(dest, filename), bytes);
const manifest = { version: 1, provider: 'Scryfall', bulk, catalogs, corpus_file: filename, requests,
  completed_at: new Date().toISOString(), note: 'Immutable raw public responses. Hashes attest retained bytes, not independent correctness of provider tagging.' };
await writeFile(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ snapshot: path.relative(root, dest).replaceAll('\\', '/'), corpus_bytes: bytes.length, requests: requests.length, updated_at: bulk.updated_at }, null, 2));
