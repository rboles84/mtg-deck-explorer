import test from 'node:test';
import assert from 'node:assert/strict';
import { createScryfallClient, distinctDiscoverySlots } from '../lib/scryfall.mjs';
import { createDeckServer } from '../server.mjs';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const card = (n, extra = {}) => ({ object: 'card', id: id(n), oracle_id: id(n + 10000), name: `Card ${String(n).padStart(4, '0')}`, set: 'tst', collector_number: String(n), lang: 'en', color_identity: ['W'], keywords: ['Flying'], legalities: { commander: 'legal' }, released_at: '2026-10-01', ...extra });
const query = '(f:commander id<=wu) (kw:Flying)';
const list = value => new Response(JSON.stringify(value), { status: 200 });
function providerPage(cards, page, extra = {}) {
  return list({ object: 'list', data: cards.slice((page - 1) * 175, page * 175), total_cards: cards.length, has_more: page * 175 < cards.length, next_page: 'https://untrusted.example/never-follow', ...extra });
}

test('24-card pages traverse the full distinct result set, including provider boundaries and final partial page', async () => {
  const data = Array.from({ length: 416 }, (_, index) => card(index + 1)), calls = [];
  const client = createScryfallClient({ minimumGap: 0, fetchImpl: async raw => {
    const url = new URL(raw); calls.push(url);
    assert.equal(url.origin, 'https://api.scryfall.com'); assert.equal(url.pathname, '/cards/search');
    assert.equal(url.searchParams.get('q'), `${query} prefer:newest`);
    assert.equal(url.searchParams.get('unique'), 'cards'); assert.equal(url.searchParams.get('order'), 'name');
    return providerPage(data, Number(url.searchParams.get('page')));
  } });
  const seen = [];
  for (let page = 1; page <= 18; page++) {
    const result = await client.discover(query, ['W', 'U'], page);
    assert.equal(result.page, page); assert.equal(result.pageSize, 24); assert.equal(result.totalCards, 416); assert.equal(result.totalPages, 18);
    assert.equal(result.hasPrevious, page > 1); assert.equal(result.hasMore, page < 18);
    assert.equal(result.cards.length, page === 18 ? 8 : 24);
    assert.deepEqual(result.cards.map(item => item.id), data.slice((page - 1) * 24, page * 24).map(item => item.id));
    seen.push(...result.cards.map(item => item.oracle_id));
  }
  assert.equal(new Set(seen).size, 416);
  assert.deepEqual(calls.map(url => url.searchParams.get('page')), ['1', '2', '3']);
  const link = new URL((await client.discover(query, ['W', 'U'])).scryfallUrl);
  assert.equal(link.searchParams.get('unique'), 'cards'); assert.equal(link.searchParams.get('q'), `${query} prefer:newest`);
});

test('arbitrary page jumps use at most two numeric provider requests and concurrent identical requests share the cache', async () => {
  const data = Array.from({ length: 400 }, (_, index) => card(index + 1)), calls = [];
  const client = createScryfallClient({ minimumGap: 0, fetchImpl: async raw => {
    const page = Number(new URL(raw).searchParams.get('page')); calls.push(page);
    await new Promise(resolve => setTimeout(resolve, 5));
    return providerPage(data, page);
  } });
  const [a, b] = await Promise.all([client.discover(query, ['W', 'U'], 8), client.discover(query, ['W', 'U'], 8)]);
  assert.deepEqual(a.cards.map(item => item.id), data.slice(168, 192).map(item => item.id));
  assert.deepEqual(a, b); assert.deepEqual(calls, [1, 2]);
  await client.discover(query, ['W', 'U'], 17);
  assert.deepEqual(calls, [1, 2, 3]);
});

test('defensive duplicate collapse uses Oracle or name and chooses the newest printing without moving other page positions', async () => {
  const cards = [card(1, { released_at: '1999-01-01' }), card(2), card(3, { name: 'Card 0001', oracle_id: id(10001), released_at: '2026-10-15' }), card(4, { name: '  CARD 0002  ', released_at: '2026-10-16' }), card(5, { name: 'No Oracle', oracle_id: undefined, released_at: '2020-01-01' }), card(6, { name: 'No Oracle', oracle_id: undefined, released_at: '2025-01-01' })];
  const { slots, duplicates } = distinctDiscoverySlots(cards);
  assert.equal(duplicates, 3); assert.deepEqual(slots.map(item => item?.id ?? null), [id(3), id(4), null, null, id(6), null]);
  const client = createScryfallClient({ minimumGap: 0, fetchImpl: async () => providerPage(cards, 1) });
  const result = await client.discover(query, ['W', 'U']);
  assert.deepEqual(result.cards.map(item => item.id), [id(3), id(4), id(6)]); assert.equal(result.duplicatesCollapsed, 3);
});

test('page bounds reject invalid values before provider work and empty search has no next page', async () => {
  let calls = 0;
  const client = createScryfallClient({ minimumGap: 0, fetchImpl: async () => { calls++; return providerPage([], 1); } });
  for (const page of [0, -1, 1.5, '2', null, {}, 10001, Number.MAX_SAFE_INTEGER, Infinity, NaN]) await assert.rejects(client.discover(query, ['W'], page), error => error.status === 400);
  assert.equal(calls, 0);
  const empty = await client.discover(query, ['W']);
  assert.equal(empty.page, 1); assert.equal(empty.totalPages, 0); assert.equal(empty.hasMore, false); assert.deepEqual(empty.cards, []);
  await assert.rejects(client.discover(query, ['W'], 2), error => error.status === 400);
});

test('postfilter and duplicate diagnostics describe only the requested UI page', async () => {
  const data = Array.from({ length: 50 }, (_, index) => card(index + 1));
  data[30] = card(31, { color_identity: ['R'] });
  data[40] = card(41, { oracle_id: data[0].oracle_id, name: data[0].name, released_at: '2026-10-16' });
  const client = createScryfallClient({ minimumGap: 0, fetchImpl: async () => providerPage(data, 1) });
  const first = await client.discover(query, ['W', 'U'], 1);
  const second = await client.discover(query, ['W', 'U'], 2);
  assert.equal(first.cards.length, 24); assert.equal(first.skipped, 0); assert.equal(first.duplicatesCollapsed, 0);
  assert.equal(first.cards[0].id, id(41));
  assert.equal(second.cards.length, 22); assert.equal(second.skipped, 1); assert.equal(second.duplicatesCollapsed, 1);
  assert.equal(new Set([...first.cards, ...second.cards].map(item => item.oracle_id)).size, 46);
  await assert.rejects(client.discover(query, ['W', 'U'], 4), error => error.status === 400);
});

test('only a valid first-page Scryfall no-match response becomes an empty discovery', async () => {
  const noMatch={object:'error',code:'not_found',details:'No cards found matching your query.'};
  const client=createScryfallClient({minimumGap:0,fetchImpl:async()=>Response.json(noMatch,{status:404})});
  const empty=await client.discover('(f:commander id<=c) (kw:Devoid)',[]);
  assert.equal(empty.totalCards,0);assert.equal(empty.totalPages,0);assert.deepEqual(empty.cards,[]);
  const failures=[
    async()=>new Response('<html>Not Found</html>',{status:404}),
    async()=>Response.json({},{status:404}),
    async()=>Response.json(null,{status:404}),
    async()=>Response.json({object:'error',code:'bad_request'},{status:404}),
    async()=>Response.json({object:'error',code:'bad_request'},{status:400}),
    async()=>Response.json({object:'error',code:'unprocessable_entity'},{status:422}),
    async()=>new Response('unavailable',{status:503}),
    async()=>{throw new Error('network disconnected');}
  ];
  for(const fetchImpl of failures){
    const failed=createScryfallClient({minimumGap:0,fetchImpl});
    await assert.rejects(failed.discover('(f:commander id<=c) (kw:Devoid)',[]),error=>error.status===502);
  }
});

test('a no-match 404 for a later provider page remains a pagination failure', async () => {
  const data=Array.from({length:200},(_,i)=>card(i+1)),calls=[];
  const client=createScryfallClient({minimumGap:0,fetchImpl:async raw=>{
    const page=Number(new URL(raw).searchParams.get('page'));calls.push(page);
    return page===1?providerPage(data,1):Response.json({object:'error',code:'not_found',details:'No cards found matching your query.'},{status:404});
  }});
  const first=await client.discover(query,['W']);assert.equal(first.totalCards,200);
  await assert.rejects(client.discover(query,['W'],8),error=>error.status===502&&/404/.test(error.message));
  assert.deepEqual(calls,[1,2]);
  assert.deepEqual(await client.discover(query,['W']),first);
});

test('changed provider totals cannot combine stale pages and clear cached search pages for a fresh retry', async () => {
  const data = Array.from({ length: 200 }, (_, index) => card(index + 1));
  let calls = 0, changed = false;
  const client = createScryfallClient({ minimumGap: 0, fetchImpl: async raw => {
    calls++; const page = Number(new URL(raw).searchParams.get('page'));
    return providerPage(changed ? [...data, card(201)] : data, page);
  } });
  await client.discover(query, ['W'], 1); changed = true;
  await assert.rejects(client.discover(query, ['W'], 8), error => error.status === 409 && /changed/.test(error.message));
  const refreshed = await client.discover(query, ['W'], 1);
  assert.equal(refreshed.totalCards, 201); assert.equal(calls, 3);
  const final = await client.discover(query, ['W'], 9);
  assert.equal(final.cards.length, 9); assert.equal(final.totalCards, 201);
});

test('malformed pagination metadata cannot silently truncate the matching set', async () => {
  const client = createScryfallClient({ minimumGap: 0, fetchImpl: async () => list({ object: 'list', data: [card(1)], total_cards: 200, has_more: true }) });
  await assert.rejects(client.discover(query, ['W']), error => error.status === 502 && /pagination/.test(error.message));
});

test('search calls honor the documented 500ms interval and cached pages do not repeat requests', async () => {
  const starts = [], data = Array.from({ length: 200 }, (_, index) => card(index + 1));
  const client = createScryfallClient({ fetchImpl: async raw => { starts.push(Date.now()); return providerPage(data, Number(new URL(raw).searchParams.get('page'))); } });
  await client.discover(query, ['W'], 8); await client.discover(query, ['W'], 8);
  assert.equal(starts.length, 2); assert.ok(starts[1] - starts[0] >= 499);
});

test('HTTP pages retain context validation, reject client URLs and isolate commander/mechanic queries', async t => {
  const calls = [], data = Array.from({ length: 50 }, (_, index) => card(index + 100));
  const server = await createDeckServer({ minimumGap: 0, fetchImpl: async (raw, options) => {
    const url = new URL(raw);
    if (url.pathname === '/cards/collection') return list({ object: 'list', data: JSON.parse(options.body).identifiers.map(item => card(Number(item.id.slice(-12)), { color_identity: item.id === id(1) ? ['W'] : ['U'] })), not_found: [] });
    calls.push(url.searchParams.get('q')); return providerPage(data, Number(url.searchParams.get('page')));
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const post = body => fetch(`http://127.0.0.1:${server.address().port}/api/discover`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const resolved = await (await fetch(`http://127.0.0.1:${server.address().port}/api/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifiers: [{ id: id(1) }, { id: id(2) }] }) })).json();
  const payload = { contextToken: resolved.contextToken, commanderIds: [id(1)], atlasRowId: 'keyword-index-flying', page: 2 };
  const page = await (await post(payload)).json();
  assert.equal(page.page, 2); assert.equal(page.cards.length, 24); assert.equal(page.totalPages, 3);
  assert.equal(page.queryProvenance.identityMode, 'within'); assert.equal(page.queryProvenance.printingPreference, 'newest');
  assert.equal(page.providerQuery, '(f:commander id<=w) (kw:Flying) prefer:newest');
  for (const invalid of [{ page: '2' }, { page: null }, { page: 0 }, { page: 10001 }, { pageSize: 200 }, { nextPage: 'https://evil.example' }, { query: 'kw:Trample' }, { commanderIds: [id(99)] }]) assert.equal((await post({ ...payload, ...invalid })).status, 400);
  assert.equal(calls.length, 1);
  await post({ ...payload, commanderIds: [id(2)] });
  await post({ ...payload, atlasRowId: 'keyword-index-haste' });
  assert.deepEqual(calls, ['(f:commander id<=w) (kw:Flying) prefer:newest', '(f:commander id<=u) (kw:Flying) prefer:newest', '(f:commander id<=w) (kw:Haste) prefer:newest']);
});

test('a context that expires during a provider request cannot return stale discovery results', async t => {
  let searches = 0;
  const server = await createDeckServer({ minimumGap: 0, contextTtl: 100, fetchImpl: async raw => {
    if (new URL(raw).pathname === '/cards/collection') return list({ object: 'list', data: [card(1)], not_found: [] });
    searches++; await new Promise(resolve => setTimeout(resolve, 120)); return providerPage([card(2)], 1);
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const post = (route, payload) => fetch(`http://127.0.0.1:${server.address().port}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const resolved = await (await post('/api/resolve', { identifiers: [{ id: id(1) }] })).json();
  const response = await post('/api/discover', { contextToken: resolved.contextToken, commanderIds: [id(1)], atlasRowId: 'keyword-index-flying', page: 1 });
  assert.equal(response.status, 409); assert.equal(searches, 1); assert.match((await response.json()).error, /expired while searching/);
});
