import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseDeck, validateCommanderImport, resolveDeck, commanderContext, extractPassages, analyzeFlavor, detectMechanics, LEXICAL_RULES } from '../public/core.mjs';
import { createDemoDeck, DEMO_CARDS } from '../public/demo.mjs';

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const makeCard = (number, options = {}) => ({ object: 'card', id: uuid(number), oracle_id: uuid(number + 1000), name: `Test Card ${number}`, set: 'tst', collector_number: String(number), lang: 'en', color_identity: ['W', 'U'], keywords: [], legalities: { commander: 'legal' }, scryfall_uri: `https://scryfall.com/card/tst/${number}`, ...options });
const makeDeck = cards => resolveDeck(parseDeck(cards.map(card => `1 ${card.name} (${card.set}) ${card.collector_number}`).join('\n')), cards);
const csvRow = cells => cells.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(',');
const csv = rows => [csvRow(['Quantity', 'Name', 'Set', 'Collector Number', 'Scryfall ID', 'Language', 'Section']), ...rows.map(csvRow)].join('\n');

test('Commander import requires 100 physical cards including commanders and counts extras separately', () => {
  const source = 'Commander\n1 Leader (tst) 1\nDeck\n99 Forest (tst) 2\nSideboard\n3 Side (tst) 3\nMaybeboard\n4 Maybe (tst) 4\nConsidering\n2 Later (tst) 5\nCompanion\n1 Companion (tst) 6';
  const parsed = parseDeck(source);
  assert.equal(parsed.counts.playableQuantity, 100);
  assert.equal(parsed.counts.playableEntries, 2);
  assert.equal(parsed.counts.excludedQuantity, 10);
  assert.equal(parsed.counts.excludedEntries, 4);
  assert.equal(validateCommanderImport(parsed).valid, true);
  for (const quantity of [98, 100]) {
    const check = validateCommanderImport(parseDeck(source.replace('99 Forest', `${quantity} Forest`)));
    assert.equal(check.valid, false);
    assert.match(check.issues.join(' '), new RegExp(`contains ${quantity + 1} cards; exactly 100`));
  }
  assert.equal(validateCommanderImport(parseDeck('Commander\n1 Leader\n1 Partner\nDeck\n98 Forest')).valid, true);
  assert.equal(validateCommanderImport(parseDeck(source + '\nDeck\n100 Forest (tst) 2')).valid, false);
});

test('invalid lines and appended garbage block import even with exactly 100 cards', () => {
  const source = 'Commander\n1 Leader (tst) 1\nDeck\n99 Forest (tst) 2';
  for (const text of [source + '\naksjfl;)(*>?', source + ' aksjfl;)(*>?', source + '\nSideboard\ngibberish']) {
    const check = validateCommanderImport(parseDeck(text));
    assert.equal(check.valid, false);
    assert.match(check.issues.join(' '), /invalid import line/);
    assert.match(check.issues.join(' '), /Line \d+:/);
  }
  const unknownSection = parseDeck(csv([[100, 'Forest', 'tst', '2', '', 'en', 'Dcek']]));
  assert.match(validateCommanderImport(unknownSection).issues.join(' '), /Unrecognized section/);
  assert.equal(validateCommanderImport(parseDeck(csv([[1, 'Leader', 'tst', '1', '', 'en', 'Commander'], [99, 'Forest', 'tst', '2', '', 'en', 'Deck'], [5, 'Extra', 'tst', '3', '', 'en', 'Sideboard']]))).valid, true);
});

test('plain parser preserves source lines, zero padding, suffix, tags, sections, bad rows and duplicate quantities', () => {
  const source = 'Commander\r\n1x Test Card 1 (TST) 001a [Commander{top}]\r\n\r\nDeck\r\n2 Test Card 2 (TST) 2\r\n3 Test Card 2 (tst) 2\r\nbroken line\r\n1 Unknown Printing\r\nSideboard\r\n1 Side Card (tst) 3\r\nMaybeboard\r\n1 Maybe (tst) 4\r\nConsidering\r\n1 Later (tst) 5';
  const deck = parseDeck(source);
  assert.equal(deck.sourceText, source);
  assert.equal(deck.rows[0].originalLine, '1x Test Card 1 (TST) 001a [Commander{top}]');
  assert.equal(deck.rows[0].collectorNumber, '001a');
  assert.equal(deck.rows[0].section, 'Commander');
  assert.deepEqual(deck.rows[0].tags, ['Commander{top}']);
  assert.equal(deck.rows[3].status, 'invalid');
  assert.equal(deck.rows[4].status, 'pending');
  assert.deepEqual(deck.rows[4].identifier, {name:'Unknown Printing'});
  assert.equal(deck.rows[5].playable, false);
  assert.equal(deck.counts.entries, 8);
  assert.equal(deck.counts.excludedEntries, 3);
  assert.equal(deck.identifiers.length, 6);
  assert.ok(Object.isFrozen(deck.rows[0]));
});

test('owner supplied fixture is parsed without changing original text or printing coordinates', async () => {
  const source = await readFile(new URL('../fixtures/cosmicspiderman.txt', import.meta.url), 'utf8');
  const deck = parseDeck(source);
  assert.equal(deck.sourceText, source);
  assert.equal(deck.rows.length, 84);
  assert.equal(deck.counts.quantity, 100);
  assert.equal(deck.rows.filter(row => row.section === 'Commander').length, 1);
  assert.equal(deck.rows.find(row => row.section === 'Commander').name, 'Cosmic Spider-Man');
  assert.equal(deck.rows.find(row => row.name === 'Coat of Arms').collectorNumber, 'DDS-58');
  assert.equal(deck.rows.find(row => row.name === 'Forest').quantity, 6);
  assert.ok(deck.rows.every(row => row.status === 'pending'));
});

test('CSV supports all quoted columns, commas, escaped quotes and multiline original records', () => {
  const source = csv([[2, 'Test, "Quoted"\nCard', 'TST', '001a', uuid(1), 'en', 'Commander'], [1, 'Unknown', '', '', '', '', 'Considering']]);
  const deck = parseDeck(source);
  assert.equal(deck.format, 'csv');
  assert.equal(deck.rows[0].name, 'Test, "Quoted"\nCard');
  assert.equal(deck.rows[0].collectorNumber, '001a');
  assert.deepEqual(deck.identifiers, [{ id: uuid(1) }, {name:'Unknown'}]);
  assert.ok(deck.rows[0].originalLine.includes('"Test, ""Quoted""\nCard"'));
  assert.equal(deck.rows[1].lineNumber, 4);
  assert.equal(deck.rows[1].playable, false);
});

test('malformed CSV, invalid UUID and non-English coordinates remain visible unresolved rows', () => {
  const malformed = parseDeck('Quantity,Name,Set\n1,"unterminated,tst');
  assert.ok(malformed.rows[0].issues.length);
  assert.equal(malformed.rows[0].status, 'invalid');
  const parsed = parseDeck(csv([[1, 'A', 'tst', '1', 'invalid', 'en', 'Deck'], [1, 'B', 'tst', '2', '', 'ja', 'Deck'], [1, 'C', '', '', uuid(3), 'ja', 'Deck']]));
  assert.deepEqual(parsed.rows.map(row => row.status), ['invalid', 'language-unsupported', 'pending']);
  assert.deepEqual(parsed.identifiers, [{ id: uuid(3) }]);
});

test('resolution joins reordered data, honors not-found, preserves source and accepts equivalent zero padding', () => {
  const source = 'Commander\n1 Test Card 1 (tst) 001a\nDeck\n2 Test Card 2 (tst) 2\n1 Test Card 3 (tst) 3';
  const parsed = parseDeck(source);
  const cards = [makeCard(2, { flavor_text: 'Raw\ntext — untouched.' }), makeCard(1, { collector_number: '1a' })];
  const deck = resolveDeck(parsed, cards, [{ set: 'tst', collector_number: '3' }]);
  assert.deepEqual(deck.rows.map(row => row.status), ['resolved', 'resolved', 'unresolved']);
  assert.equal(deck.rows[0].collectorNumber, '001a');
  assert.equal(deck.sourceText, source);
  assert.equal(deck.rows[1].card.flavor_text, 'Raw\ntext — untouched.');
  assert.equal(parsed.rows[0].card, null);
  cards[0].name = 'External mutation';
  assert.equal(deck.rows[1].card.name, 'Test Card 2');
  assert.throws(() => { deck.rows[1].card.name = 'Mutation'; }, TypeError);
});

test('UUID takes precedence but set, collector, supplied name and language conflicts are flagged', () => {
  const parsed = parseDeck(csv([[1, 'Wrong Name', 'oth', '99', uuid(1), 'ja', 'Commander']]));
  const deck = resolveDeck(parsed, [makeCard(1)]);
  assert.deepEqual(parsed.identifiers, [{ id: uuid(1) }]);
  assert.equal(deck.rows[0].status, 'mismatch');
  assert.match(deck.rows[0].issues.join(' '), /set, collector number, supplied name, language/);
  assert.equal(deck.rows[0].card, null);
  assert.deepEqual(extractPassages(deck), []);
  assert.equal(commanderContext(deck).colorIdentity, null);
});

test('exact non-English UUID resolves only that language and printed name; analysis excludes it', () => {
  const parsed = parseDeck(csv([[1, '印刷名', '', '', uuid(1), 'ja', 'Deck']]));
  const deck = resolveDeck(parsed, [makeCard(1, { printed_name: '印刷名', lang: 'ja', flavor_text: 'Original non-English text.' })]);
  assert.equal(deck.rows[0].status, 'resolved');
  assert.equal(extractPassages(deck)[0].language, 'ja');
  assert.equal(analyzeFlavor(deck).counts.excludedLanguagePassages, 1);
  const noLanguage = parseDeck(csv([[1, 'Test Card 1', '', '', uuid(1), '', 'Deck']]));
  assert.equal(noLanguage.rows[0].language, null);
  assert.equal(resolveDeck(noLanguage, [makeCard(1, { lang: 'ja' })]).rows[0].status, 'resolved');
});

test('ambiguous coordinates and a wrong UUID are never treated as exact data', () => {
  const parsed = parseDeck('1 Test Card 1 (tst) 1');
  const deck = resolveDeck(parsed, [makeCard(1), makeCard(2, { collector_number: '1', name: 'Test Card 1' })]);
  assert.equal(deck.rows[0].status, 'ambiguous');
  const uuidDeck = parseDeck(csv([[1, 'Test Card 1', '', '', uuid(1), 'en', 'Deck']]));
  assert.equal(resolveDeck(uuidDeck, [makeCard(2)]).rows[0].status, 'unresolved');
});

test('same Oracle card in two printings keeps absent flavor absent; faces remain separate', () => {
  const cards = [makeCard(1, { name: 'Shared Name', flavor_text: 'Edition one text.' }), makeCard(2, { name: 'Shared Name', oracle_id: uuid(1001) }), makeCard(3, { name: 'Front // Back', card_faces: [{ name: 'Front', flavor_text: 'Face one.' }, { name: 'Back', flavor_text: 'Face two.' }] })];
  const deck = makeDeck(cards);
  assert.equal(deck.counts.flavorAbsentEntries, 1);
  assert.equal(deck.counts.distinctPrintings, 3);
  assert.deepEqual(extractPassages(deck).map(p => [p.printingId, p.faceName, p.text]), [[uuid(1), 'Shared Name', 'Edition one text.'], [uuid(3), 'Front', 'Face one.'], [uuid(3), 'Back', 'Face two.']]);
});

test('Commander identity comes only from explicit section or selection; pair union is provisional', () => {
  const deck = makeDeck([makeCard(1, { color_identity: ['W'] }), makeCard(2, { color_identity: ['U'] }), makeCard(3, { color_identity: ['R'], legalities: { commander: 'banned' } })]);
  assert.equal(commanderContext(deck).colorIdentity, null);
  const chosen = commanderContext(deck, ['row-1', 'row-2']);
  assert.deepEqual(chosen.colorIdentity, ['W', 'U']);
  assert.equal(chosen.label, 'Azorius');
  assert.equal(chosen.provisional, true);
  assert.deepEqual(chosen.offIdentityRowIds, ['row-3']);
  assert.deepEqual(chosen.nonLegalRowIds, ['row-3']);
  assert.equal(deck.rows.length, 3);
  assert.equal(commanderContext(deck, []).colorIdentity, null);
});

test('colorless is an empty color identity, and excluded side sections cannot become commanders', () => {
  const parsed = parseDeck('Commander\n1 Test Card 1 (tst) 1\nSideboard\n1 Test Card 2 (tst) 2');
  const deck = resolveDeck(parsed, [makeCard(1, { color_identity: [] }), makeCard(2)]);
  assert.equal(commanderContext(deck).label, 'Colorless');
  assert.deepEqual(commanderContext(deck).colorIdentity, []);
  assert.equal(commanderContext(deck, ['row-2']).colorIdentity, null);
  assert.equal(extractPassages(deck).length, 0);
});

test('literal analysis distinguishes word boundaries and records exact original spans and rules', () => {
  const deck = makeDeck([makeCard(1, { flavor_text: 'WAR beside the silent river.' }), makeCard(2, { flavor_text: 'War follows a silent river at dawn.' }), makeCard(3, { flavor_text: 'A ward protects the hillside. War2 is a token; war_ward is another.' })]);
  const result = analyzeFlavor(deck);
  const war = result.observations.find(item => item.term === 'war');
  assert.equal(war.distinctCards, 2);
  assert.deepEqual(war.evidence.map(item => item.printingId), [uuid(1), uuid(2)]);
  assert.equal(war.evidence[0].matchedText, 'WAR');
  assert.equal(war.evidence[0].text.slice(war.evidence[0].start, war.evidence[0].end), 'WAR');
  assert.equal(war.ruleId, LEXICAL_RULES.wordRule);
  assert.ok(result.observations.some(item => item.term === 'silent river' && item.kind === 'phrase'));
  assert.equal(result.abstained, false);
  assert.deepEqual(result, analyzeFlavor(deck));
});

test('analysis uses Unicode whole words, exact spans and deterministic alphabetic ties', () => {
  const result = analyzeFlavor(makeDeck([makeCard(1, { flavor_text: 'Étoile azure beacon opens.' }), makeCard(2, { flavor_text: 'Étoile azure beacon closes.' })]));
  const etoile = result.observations.find(item => item.term === 'étoile');
  assert.equal(etoile.evidence[0].matchedText, 'Étoile');
  const words = result.observations.filter(item => item.kind === 'word').map(item => item.term);
  assert.deepEqual(words, ['azure', 'beacon', 'étoile']);
});

test('physical copies and repeated editions do not supply distinct card identity or independent evidence', () => {
  const card = makeCard(1, { flavor_text: 'River river returns.' });
  const deck = resolveDeck(parseDeck('3 Test Card 1 (tst) 1\n2 Test Card 1 (tst) 1'), [card]);
  assert.equal(analyzeFlavor(deck).abstained, true);
  const copiesAcrossCards = makeDeck([card, makeCard(2, { flavor_text: 'River river returns.' })]);
  assert.equal(analyzeFlavor(copiesAcrossCards).abstained, true);
  const editions = makeDeck([card, makeCard(2, { oracle_id: card.oracle_id, flavor_text: 'River answers the dawn.' })]);
  assert.equal(analyzeFlavor(editions).abstained, true);
});

test('analysis separately counts raw hits, physical quantities, printings and distinct supporting cards', () => {
  const cards = [makeCard(1, { flavor_text: 'River river returns.' }), makeCard(2, { flavor_text: 'River answers the dawn.' })];
  const deck = resolveDeck(parseDeck('3 Test Card 1 (tst) 1\n2 Test Card 1 (tst) 1\n1 Test Card 2 (tst) 2'), cards);
  const river = analyzeFlavor(deck).observations.find(item => item.term === 'river');
  assert.deepEqual([river.rawHits, river.physicalCopies, river.distinctPrintings, river.distinctCards, river.independentPassages], [5, 6, 2, 2, 2]);
});

test('stopwords, sparse evidence and punctuation boundaries do not manufacture a theme', () => {
  const deck = makeDeck([makeCard(1, { flavor_text: 'The and with.' }), makeCard(2, { flavor_text: 'The and with!' })]);
  assert.match(analyzeFlavor(deck).summary, /^Not enough distinct repeated language/);
  const phrases = analyzeFlavor(makeDeck([makeCard(1, { flavor_text: 'Silver, dawn arrives.' }), makeCard(2, { flavor_text: 'Silver dawn departs.' })])).observations;
  assert.ok(!phrases.some(item => item.term === 'silver dawn'));
});

test('documented generic auxiliaries and quantifiers abstain without suppressing concrete literal evidence', () => {
  const generic = makeDeck([makeCard(1, { flavor_text: 'One can always do anything.' }), makeCard(2, { flavor_text: 'One can always do something.' })]);
  assert.equal(analyzeFlavor(generic).abstained, true);
  assert.deepEqual(analyzeFlavor(generic).observations, []);
  const concrete = makeDeck([makeCard(1, { flavor_text: 'One can always follow the river.' }), makeCard(2, { flavor_text: 'One can always hear the river.' })]);
  const result = analyzeFlavor(concrete);
  assert.equal(result.abstained, false);
  assert.deepEqual(result.observations.map(item => item.term), ['river']);
  assert.equal(result.observations[0].evidence[0].matchedText, 'river');
});

test('mechanic detection is actual record keyword evidence with no face or inherent-possession inference', () => {
  const cards = [makeCard(1, { keywords: ['Flying'], oracle_text: 'Other creatures you control have flying.' }), makeCard(2, { oracle_text: 'Flying' }), makeCard(3, { keywords: ['Scry'], oracle_text: 'Scry 1.' })];
  const catalog = [{ master_name: 'Flying', master_category: 'keyword_ability', atlas_row_id: 'keyword-index-flying' }, { master_name: 'Flying', master_category: 'keyword_ability', atlas_row_id: 'duplicate' }, { master_name: 'Scry', master_category: 'keyword_action', atlas_row_id: 'keyword-index-scry' }, { master_name: 'Trample', master_category: 'keyword_ability', atlas_row_id: 'keyword-index-trample' }];
  const detected = detectMechanics(makeDeck(cards), catalog);
  assert.equal(detected.length, 1);
  assert.equal(detected[0].evidence.length, 1);
  assert.equal(detected[0].evidence[0].printingId, uuid(1));
  assert.equal(detected[0].evidence[0].faceName, null);
  assert.match(detected[0].evidence[0].qualification, /granted ability/);
  assert.equal(detected[0].method, 'Detected via Scryfall keywords');
});

test('synthetic demonstration is explicitly identified, has mixed archive states and no real URLs', () => {
  const demo = createDemoDeck();
  assert.equal(demo.synthetic, true);
  assert.ok(DEMO_CARDS.every(card => card.synthetic && !card.scryfall_uri));
  assert.equal(demo.counts.flavorAbsentEntries, 1);
  assert.equal(demo.counts.unresolvedEntries, 1);
  assert.equal(analyzeFlavor(demo).abstained, false);
  assert.ok(extractPassages(demo).every(passage => passage.sourceType.startsWith('Synthetic')));
});

test('XSS-like text is preserved as literal source data and parser rejects oversized decks', () => {
  const card = makeCard(1, { name: '<img src=x onerror=alert(1)>', flavor_text: '<script>alert(1)</script>' });
  const deck = makeDeck([card]);
  assert.equal(deck.rows[0].name, card.name);
  assert.equal(extractPassages(deck)[0].text, card.flavor_text);
  assert.throws(() => parseDeck('x'.repeat(200001)), /limited/);
  assert.throws(() => parseDeck(Array.from({ length: 501 }, () => '1 A').join('\n')), /500 entries/);
});
