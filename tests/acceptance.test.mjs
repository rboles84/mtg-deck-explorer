import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '../lib/catalog.mjs';
import { createScryfallClient, buildQuery, safeCard } from '../lib/scryfall.mjs';
import { parseDeck, resolveDeck, commanderContext, analyzeFlavor, detectMechanics } from '../public/core.mjs';
import { addClipboard, setClipboardQuantity, exportClipboard, saveClipboard, loadClipboard } from '../public/clipboard.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const card = (n, extra = {}) => ({ object: 'card', id: id(n), oracle_id: id(1000 + n), name: `Acceptance ${n}`, set: 'tst', collector_number: String(n), lang: 'en', color_identity: ['W', 'U'], keywords: [], legalities: { commander: 'legal' }, ...extra });
const catalog = await loadCatalog(ROOT);
const response = data => new Response(JSON.stringify(data), { status: 200 });

test('five original runtime/test inputs stay byte-identical; 13 retired design assets retain their audited hashes', async () => {
  const audit = JSON.parse(await readFile(new URL('../evidence/source-audit.json', import.meta.url), 'utf8'));
  const archive = JSON.parse(await readFile(new URL('../evidence/repository-archive.json', import.meta.url), 'utf8'));
  const archived = new Map(archive.files.map(entry => [entry.path, entry]));
  assert.equal(audit.originalFiles.length, 18);
  let retainedCount = 0, archivedCount = 0;
  for (const original of audit.originalFiles) {
    if (original.path.startsWith('references/') || original.path === 'inputs/PROBABLY_PARADISE_GDD_VISUAL_ATLAS_V3_1.html') {
      assert.deepEqual(archived.get(original.path), original, original.path);
      await assert.rejects(readFile(new URL(`../${original.path}`, import.meta.url)), { code: 'ENOENT' });
      archivedCount++;
      continue;
    }
    assert.equal(archived.has(original.path), false, original.path);
    const bytes = await readFile(new URL(`../${original.path}`, import.meta.url));
    assert.equal(bytes.length, original.bytes, original.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), original.sha256, original.path);
    retainedCount++;
  }
  assert.equal(retainedCount, 5);
  assert.equal(archivedCount, 13);
});

// Each named crosswalk fixture exercises the real loaded source schema against the
// actual detector and query builder, not an independent look-alike catalog.
for (const [index, record] of catalog.historicalRecords.entries()) {
  test(record.test_fixture_ids.join(' / '), () => {
    const reported = safeCard(card(index + 1, { keywords: [record.master_name], oracle_text: `Other creatures you control have ${record.master_name.toLowerCase()}.` }));
    const oracleOnly = safeCard(card(index + 101, { oracle_text: `Other creatures you control have ${record.master_name.toLowerCase()}.` }));
    const source = `Commander\n1 ${reported.name} (tst) ${reported.collector_number}\nDeck\n1 ${oracleOnly.name} (tst) ${oracleOnly.collector_number}`;
    const imported = resolveDeck(parseDeck(source), [oracleOnly, reported]);
    const detected = detectMechanics(imported, catalog);
    assert.equal(detected.length, 1);
    assert.equal(detected[0].master_name, record.master_name);
    assert.equal(detected[0].evidence.length, 1);
    assert.equal(detected[0].evidence[0].printingId, reported.id);
    assert.equal(detected[0].evidence[0].faceName, null);
    assert.match(detected[0].evidence[0].qualification, /granted ability/);
    const absent = resolveDeck(parseDeck(`1 ${oracleOnly.name} (tst) ${oracleOnly.collector_number}`), [oracleOnly]);
    assert.deepEqual(detectMechanics(absent, catalog), []);
    assert.equal(buildQuery(catalog, record.atlas_row_id, commanderContext(imported).colorIdentity), `(f:commander id<=wu) (kw:${record.master_name})`);
  });
}

test('whole deterministic product loop keeps search candidates out of immutable imported evidence', async () => {
  const importedCards = [
    card(1, { keywords: ['Flying'], flavor_text: 'A silver river remembers the dawn.' }),
    card(2, { flavor_text: 'The silver river carries a lantern.' }),
    card(3, { name: 'Acceptance 1', oracle_id: id(1001) }),
    card(4, { color_identity: ['R'], flavor_text: 'Excluded sideboard passage.' }),
  ];
  const candidate = card(90, { name: 'Discovery, Separate Printing', keywords: ['Trample'], flavor_text: 'Unrelated evidence never joins the deck.' });
  const calls = [];
  const provider = createScryfallClient({ minimumGap: 0, fetchImpl: async (url, options) => {
    calls.push({ url, body: options.body });
    return url.includes('/collection')
      ? response({ object: 'list', data: [...importedCards].reverse(), not_found: [] })
      : response({ object: 'list', data: [candidate], total_cards: 1, has_more: false });
  } });
  const text = 'Commander\n1 Acceptance 1 (tst) 001\nDeck\n2 Acceptance 2 (tst) 2\n1 Acceptance 1 (tst) 3\nSideboard\n1 Acceptance 4 (tst) 4';
  const parsed = parseDeck(text);
  const resolved = await provider.resolve(parsed.identifiers);
  const imported = resolveDeck(parsed, resolved.cards, resolved.notFound);
  const before = JSON.stringify(imported);
  assert.equal(imported.sourceText, text);
  assert.equal(imported.counts.playableQuantity, 4);
  assert.equal(imported.counts.flavorAbsentEntries, 1);
  assert.equal(imported.counts.excludedEntries, 1);
  const context = commanderContext(imported);
  assert.equal(context.label, 'Azorius');
  const analysisBefore = analyzeFlavor(imported);
  assert.ok(analysisBefore.observations.some(item => item.term === 'silver river'));
  assert.equal(analysisBefore.passages.length, 2);
  const search = await provider.discover(buildQuery(catalog, 'keyword-index-flying', context.colorIdentity), context.colorIdentity);
  const clipboard = setClipboardQuantity(addClipboard([], search.cards[0], 'keyword-index-flying'), candidate.id, 2);
  const memory = new Map();
  const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  assert.equal(saveClipboard(clipboard, storage).persistenceAvailable, true);
  assert.equal(exportClipboard(loadClipboard(storage).items), '2 Discovery, Separate Printing (TST) 90');
  assert.equal(JSON.stringify(imported), before);
  assert.deepEqual(analyzeFlavor(imported), analysisBefore);
  assert.deepEqual(detectMechanics(imported, catalog).map(item => item.master_name), ['Flying']);
  assert.equal(calls.length, 2);
});

test('a malformed provider face is classified as a provider failure', () => {
  assert.throws(() => safeCard(card(1, { card_faces: [null] })), error => error.status === 502);
});
