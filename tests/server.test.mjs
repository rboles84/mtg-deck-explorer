import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createDeckServer } from '../server.mjs';
import { loadCatalog, parseMaster, validateAtlas, LEGACY_IDS } from '../lib/catalog.mjs';
import { createScryfallClient, validateIdentifiers, buildQuery, safeCard } from '../lib/scryfall.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const card = (n, extra = {}) => ({ object: 'card', id: id(n), oracle_id: id(9000 + n), name: `Synthetic card ${n}`, set: 'tst', collector_number: String(n), lang: 'en', color_identity: ['W'], keywords: ['Flying'], legalities: { commander: 'legal' }, scryfall_uri: `https://scryfall.com/card/tst/${n}/synthetic`, ...extra });
const list = (data, extra = {}) => new Response(JSON.stringify({ object: 'list', data, not_found: [], ...extra }), { status: 200 });
const catalog = await loadCatalog(ROOT);
async function start(t, options = {}) {
  const server = await createDeckServer({ minimumGap: 0, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (route, body, headers = {}) => fetch(url + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { server, url, post };
}

test('frozen sources: 524 concrete entries plus 3 playtest indexes; classifications remain distinct', async () => {
  const source = parseMaster(await readFile(path.join(ROOT, 'inputs/mtg-mechanics-master-list.md'), 'utf8'));
  assert.equal(source.entries.length, 524);
  assert.equal(source.categoryIndexes.length, 3);
  assert.equal(source.counts.keyword_ability, 194);
  assert.equal(source.counts.keyword_action, 70);
  assert.equal(source.counts.ability_word, 64);
  assert.deepEqual(source.byName.find(r => r.name === 'Rampage').classifications.map(r => r.category), ['keyword_ability', 'acorn_mechanic']);
  assert.equal(source.entries.find(r => r.name === 'Conjure').category, 'digital_only_mechanic');
  assert.equal(source.entries.find(r => r.name === 'Bury').category, 'former_mechanic');
  assert.equal(source.entries.find(r => r.name === 'Landfall').category, 'ability_word');
  assert.ok(source.entries.every(r => r.sourceLabel === 'MTG Wiki-derived inventory'));
});

test('all Atlas tier/auto-execute counts and separate historical census are enforced', async () => {
  const atlas = JSON.parse(await readFile(path.join(ROOT, 'inputs/atlas_v2.0.json'), 'utf8'));
  assert.deepEqual(validateAtlas(atlas), { 'Production-ready': 684, 'Do-not-emit': 22, Review: 353, Semantic: 27 });
  assert.equal(catalog.stats.historicalCensusRows, 623);
  atlas.rows.find(r => r.tier === 'Review').auto_execute = true;
  assert.throws(() => validateAtlas(atlas), /auto-execute/);
});

test('eight explicit crosswalks retain exact Atlas rows and Rosewater explanation and color ownership', () => {
  assert.equal(catalog.historicalRecords.length, 8);
  for (const record of catalog.historicalRecords) {
    assert.equal(record.master_category, 'keyword_ability');
    assert.equal(record.placement.label, record.master_name);
    assert.equal(record.atlas.query, `kw:${record.master_name}`);
    assert.equal(record.rules_reference.date, '2026-09-25');
    assert.equal(record.blind_spot, record.atlas.blind_spot);
    assert.ok(record.test_fixture_ids.length);
    assert.ok(record.placement.explanation.length);
  }
  const flying = catalog.records.find(r => r.master_name === 'Flying');
  assert.equal(flying.placement.colors.W.tier, 'primary');
  assert.equal(flying.placement.colors.G.tier, 'tertiary');
  assert.match(flying.placement.explanation, /Dragons and Phoenixes/);
  assert.equal(catalog.records.find(r => r.master_name === 'Trample').rosewater_id, 'trample');
  assert.ok(catalog.records.some(r => r.master_name === 'Ward'));
  assert.ok(!catalog.historicalRecords.some(r => r.master_name === 'Ward'));
});

test('reviewed keyword recipes use the original Commander identity ceiling after the user correction', () => {
  for (const approved of LEGACY_IDS) {
    const query = buildQuery(catalog, approved, ['U', 'W']);
    assert.match(query, /^\(f:commander id<=wu\) \(kw:[A-Za-z]+\)$/);
    assert.ok(!query.includes('id=wu'));
  }
  assert.equal(buildQuery(catalog, 'keyword-index-flying', []), '(f:commander id<=c) (kw:Flying)');
  assert.equal(buildQuery(catalog, 'keyword-index-flying', ['G', 'R', 'B', 'U', 'W']), '(f:commander id<=wubrg) (kw:Flying)');
  assert.equal(catalog.baseline.query, 'f:commander id<=[COLORS]');
  assert.equal(catalog.exactIdentityBaseline, undefined);
  assert.equal(catalog.searchPolicy.identityMode, 'within');
  assert.match(catalog.searchPolicy.authorization, /Explicit user correction/);
  assert.equal(catalog.searchPolicy.sourceBaselineQuery, catalog.baseline.query);
  assert.equal(catalog.searchPolicy.effectiveBaselineQuery, catalog.baseline.query);
  for (const forbidden of ['keyword-index-underdog','keyword-index-set-in-motion','role-library-self-recurring-creatures','keyword-index-future-label', 'kw:Flying or id=R', 'https://example.com', '../inputs']) assert.throws(() => buildQuery(catalog, forbidden, ['W']), /whitelist/);
  assert.throws(() => buildQuery(catalog, 'keyword-index-flying', ['W', 'id:R']), /identity/);
  const modified = structuredClone(catalog);
  modified.records.find(r=>r.master_name==='Flying').atlas.parameters = ['[QUERY]'];
  assert.throws(() => buildQuery(modified, 'keyword-index-flying', ['W']), /whitelist/);
  const drifted = structuredClone(catalog);
  drifted.baseline.query = 'f:commander id=[COLORS]';
  assert.throws(() => buildQuery(drifted, 'keyword-index-flying', ['W']), /reviewed Atlas baseline/);
});

test('bounded identifiers preserve suffixes, normalize duplicate keys, and require UUID for foreign printings', () => {
  assert.deepEqual(validateIdentifiers([{ set: 'TST', collector_number: '001a' }, { set: 'tst', collector_number: '1a' }]), [{ set: 'tst', collector_number: '1a' }]);
  assert.throws(() => validateIdentifiers([{ set: 'tst', collector_number: '1', lang: 'ja' }]), /Non-English/);
  assert.throws(() => validateIdentifiers([{ id: id(1), set: 'tst' }]), /by itself/);
  assert.deepEqual(validateIdentifiers([{ name: 'name only' }]), [{name:'name only'}]);
  assert.deepEqual(validateIdentifiers([{name:'name only',set:'tst'}]), [{name:'name only',set:'tst'}]);
  assert.throws(() => validateIdentifiers(Array.from({ length: 501 }, (_, i) => ({ id: id(i) }))), /500 distinct/);
  assert.throws(() => validateIdentifiers([{ set: 'tst', collector_number: '1 OR o:/x/' }]), /Invalid/);
});

test('collection resolves 100 identifiers in sequential 75 + 25 batches, dedupes, tolerates reordering and not_found', async () => {
  const batches = []; let inflight = 0, maxInflight = 0;
  const client = createScryfallClient({ minimumGap: 0, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.scryfall.com/cards/collection');
    assert.equal(options.redirect, 'error');
    assert.ok(options.headers['User-Agent']); assert.equal(options.headers.Accept, 'application/json');
    inflight++; maxInflight = Math.max(inflight, maxInflight);
    const body = JSON.parse(options.body); batches.push(body.identifiers.length);
    await new Promise(resolve => setTimeout(resolve, 2)); inflight--;
    const data = body.identifiers.filter(item => item.id !== id(5)).map(item => card(Number(item.id.slice(-12)))).reverse();
    return list(data, { not_found: body.identifiers.filter(item => item.id === id(5)) });
  } });
  const result = await client.resolve([...Array.from({ length: 100 }, (_, i) => ({ id: id(i + 1) })), { id: id(1) }]);
  assert.deepEqual(batches, [75, 25]); assert.equal(maxInflight, 1); assert.equal(result.cards.length, 99);
  assert.deepEqual(result.notFound, [{ id: id(5) }]); assert.equal(new Set(result.cards.map(c => c.id)).size, 99);
});

test('mismatched returned UUID is excluded, same-Oracle editions retain distinct flavor, faces remain separate, absent text stays absent', async () => {
  const original = 'A quoted passage.\n—A witness';
  const a = card(1, { oracle_id: id(99), flavor_text: original });
  const b = card(2, { oracle_id: id(99) });
  const c = card(3, { card_faces: [{ name: 'Front', flavor_text: 'Front passage.' }, { name: 'Back', flavor_text: 'Back passage.' }] });
  const client = createScryfallClient({ minimumGap: 0, fetchImpl: async () => list([card(8), b, c, a]) });
  const result = await client.resolve([1, 2, 3, 4].map(n => ({ id: id(n) })));
  assert.equal(result.cards.length, 3); assert.deepEqual(result.notFound, [{ id: id(4) }]);
  assert.equal(result.cards.find(c => c.id === id(1)).flavor_text, original);
  assert.ok(!('flavor_text' in result.cards.find(c => c.id === id(2))));
  assert.equal(result.cards.find(c => c.id === id(3)).card_faces.length, 2);
  assert.equal(result.warnings.length, 1);
  assert.equal(safeCard(card(4, { name: '<img src=x onerror=alert(1)>', flavor_text: '<script>alert(1)</script>', scryfall_uri: 'javascript:alert(1)' })).name, '<img src=x onerror=alert(1)>');
  assert.ok(!safeCard(card(4, { scryfall_uri: 'https://evil.example/card/x' })).scryfall_uri);
});

test('provider failures and 429 are surfaced without retry; retry-after blocks subsequent requests', async () => {
  let calls = 0;
  const limited = createScryfallClient({ minimumGap: 0, fetchImpl: async () => { calls++; return new Response('{}', { status: 429, headers: { 'Retry-After': '60' } }); } });
  await assert.rejects(limited.resolve([{ id: id(1) }]), e => e.status === 429 && Number(e.retryAfter) > 0);
  await assert.rejects(limited.resolve([{ id: id(2) }]), e => e.status === 429);
  assert.equal(calls, 1);
  const disconnected = createScryfallClient({ fetchImpl: async () => { throw new Error('network'); } });
  await assert.rejects(disconnected.resolve([{ id: id(1) }]), /could not be reached/);
});

test('minimum 120ms request spacing and small repeated-request cache', async () => {
  const starts = [];
  const client = createScryfallClient({ fetchImpl: async (url, options) => { starts.push(Date.now()); const identifiers = JSON.parse(options.body).identifiers; return list(identifiers.map(item => card(Number(item.id.slice(-12))))); } });
  await client.resolve([{ id: id(1) }]);
  await client.resolve([{ id: id(2) }]);
  await client.resolve([{ id: id(1) }]);
  assert.equal(starts.length, 2); assert.ok(starts[1] - starts[0] >= 119);
});

test('WU discovery includes mono-color and colorless cards, excludes outside colors and banned cards, and fetches one page', async () => {
  const calls = [];
  const client = createScryfallClient({ minimumGap: 0, fetchImpl: async url => { calls.push(url); return list([card(1), card(2, { color_identity: ['U'] }), card(3, { color_identity: [] }), card(4, { color_identity: ['R'] }), card(5, { color_identity: ['W', 'U'], legalities: { commander: 'banned' } }), card(6, { color_identity: ['X'] }), card(7, { color_identity: ['W', 'U'] }), card(8, { color_identity: ['U', 'W'] })], { total_cards: 8, has_more: false, next_page: 'https://evil.example' }); } });
  const result = await client.discover('(f:commander id<=wu) (kw:Flying)', ['W', 'U']);
  assert.equal(result.totalCards, 8); assert.deepEqual(result.cards.map(c => c.id), [id(1), id(2), id(3), id(7), id(8)]); assert.equal(result.skipped, 3); assert.equal(calls.length, 1);
  const url = new URL(calls[0]); assert.equal(url.searchParams.get('q'), '(f:commander id<=wu) (kw:Flying) prefer:newest'); assert.equal(url.searchParams.get('unique'), 'cards');
  const empty = createScryfallClient({ minimumGap: 0, fetchImpl: async () => Response.json({ object: 'error', code: 'not_found', details: 'No cards found matching your query.' }, { status: 404 }) });
  assert.equal((await empty.discover('fixed query', [])).totalCards, 0);
});

test('WUBRG discovery allows every color subset while colorless identity allows only colorless cards', async () => {
  const candidates = [card(1), card(2, { color_identity: [] }), card(3, { color_identity: ['W', 'U'] }), card(4, { color_identity: ['W', 'U', 'B', 'R'] }), card(5, { color_identity: ['W', 'U', 'B', 'R', 'G'] })];
  const client = createScryfallClient({ minimumGap: 0, fetchImpl: async () => list(candidates, { total_cards: 5, has_more: false }) });
  const allColors = await client.discover('(f:commander id<=wubrg) (kw:Flying)', ['W', 'U', 'B', 'R', 'G']);
  assert.deepEqual(allColors.cards.map(c => c.id), [id(1), id(2), id(3), id(4), id(5)]);
  const colorless = await client.discover('(f:commander id<=c) (kw:Flying)', []);
  assert.deepEqual(colorless.cards.map(c => c.id), [id(2)]);
});

test('HTTP context derives only selected commanders; caller identities/queries and IDs from another import are rejected', async t => {
  const { post } = await start(t, { fetchImpl: async (url, options) => url.includes('/collection') ? list(JSON.parse(options.body).identifiers.map(item => card(Number(item.id.slice(-12)), { color_identity: item.id === id(1) ? ['W'] : ['U'] }))) : list([card(3)], { total_cards: 1, has_more: false }) });
  const response = await post('/api/resolve', { identifiers: [{ id: id(1) }, { id: id(2) }] });
  assert.equal(response.status, 200); const resolved = await response.json();
  const payload = { atlasRowId: 'keyword-index-flying', contextToken: resolved.contextToken, commanderIds: [id(1), id(2)] };
  const good = await post('/api/discover', payload); assert.equal(good.status, 200);
  const discovered = await good.json(); assert.deepEqual(discovered.identity, ['W', 'U']); assert.equal(discovered.provisional, true); assert.equal(discovered.query, '(f:commander id<=wu) (kw:Flying)');
  assert.equal(discovered.cards.length, 1);
  assert.equal(discovered.queryProvenance.identityMode, 'within');
  assert.equal(discovered.queryProvenance.sourceBaselineQuery, 'f:commander id<=[COLORS]');
  assert.equal(discovered.queryProvenance.effectiveBaselineQuery, 'f:commander id<=[COLORS]');
  assert.equal(discovered.queryProvenance.boundIdentity, 'wu');
  assert.equal(discovered.queryProvenance.appliedQuery, discovered.query);
  assert.equal((await post('/api/discover', { ...payload, colorIdentity: ['R'] })).status, 400);
  assert.equal((await post('/api/discover', { ...payload, query: 'o:/x/' })).status, 400);
  assert.equal((await post('/api/discover', { ...payload, commanderIds: [id(5)] })).status, 400);
  assert.equal((await post('/api/discover', { ...payload, commanderIds: [] })).status, 400);
  assert.equal((await post('/api/discover', { ...payload, atlasRowId: 'keyword-index-underdog' })).status, 400);
});

test('HTTP security: source files unreachable, local host/origin enforced, JSON and size bounds enforced', async t => {
  const { post, url } = await start(t, { fetchImpl: async () => list([]) });
  assert.equal((await fetch(url + '/api/catalog')).status, 200);
  assert.equal((await fetch(url + '/inputs/atlas_v2.0.json')).status, 404);
  assert.equal((await fetch(url + '/%2e%2e%5cinputs%5catlas_v2.0.json')).status, 404);
  assert.equal((await fetch(url + '/server.mjs')).status, 404);
  const hostileHostStatus = await new Promise((resolve, reject) => {
    http.get(url + '/api/catalog', { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
  });
  assert.equal(hostileHostStatus, 403);
  assert.equal((await post('/api/resolve', { identifiers: [{ id: id(1) }] }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await fetch(url + '/api/resolve', { method: 'POST', body: '{}' })).status, 415);
  assert.equal((await fetch(url + '/api/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
  assert.equal((await post('/api/resolve', { identifiers: [], padding: 'x'.repeat(140000) })).status, 413);
  assert.equal((await post('/api/resolve', { identifiers: [{ id: id(1) }], endpoint: 'https://evil.example' })).status, 400);
});

test('missing source catalog fails visibly while independent printing resolution remains available', async t => {
  const { url, post } = await start(t, { root: path.join(ROOT, 'tests/nonexistent'), fetchImpl: async () => list([card(1)]) });
  assert.equal((await fetch(url + '/api/catalog')).status, 503);
  assert.equal((await post('/api/resolve', { identifiers: [{ id: id(1) }] })).status, 200);
});

test('expired commander context requires a fresh import', async t => {
  const { post } = await start(t, { contextTtl: -1, fetchImpl: async () => list([card(1)]) });
  const resolved = await (await post('/api/resolve', { identifiers: [{ id: id(1) }] })).json();
  assert.equal((await post('/api/discover', { atlasRowId: 'keyword-index-flying', contextToken: resolved.contextToken, commanderIds: [id(1)] })).status, 409);
});
