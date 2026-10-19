import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {parseDeck, resolveDeck, validateCommanderImport, analyzeFlavor, commanderContext, selectReferencePrinting} from '../public/core.mjs';
import {safeCard, createScryfallClient, matchesIdentifier} from '../lib/scryfall.mjs';
import {getCardFaces, getCardImageUrl, hasSeparateCardSides} from '../public/card-preview.mjs';
import {indexMechanics} from '../public/mechanics.mjs';
import {resolveImport} from '../public/import-resolution.mjs';

const read = file => JSON.parse(fs.readFileSync(new URL(`fixtures/imports/commander-shortlist/${file}`, import.meta.url), 'utf8'));
const decks = read('decks.json'), witnesses = read('cards.json');
const cards = witnesses.map(witness => witness.card);
const named = name => cards.find(card => card.name === name);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const cleanPackNotes = text => text.split(/\r?\n/).filter(line => !line.startsWith('#')).join('\n');
const csv = rows => rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
const exactInput = (selected, oracleIds = []) => csv([
  ['Quantity', 'Name', 'Scryfall ID', 'Oracle ID'],
  ...selected.map((card, i) => [1, card.name, card.id, oracleIds[i] || '']),
]);
const reversible = cards.filter(card => card.layout === 'reversible_card');
const oracleIds = [
  '0895c9b7-ae7d-4bb3-af17-3b75deb50a25',
  '5c58353a-fd60-4528-bf0d-669626cda0b2',
  'f1750962-a87c-49f6-b731-02ae971ac6ea',
  '17039058-822d-409f-938c-b727a366ba63',
];

test('shortlist excerpts retain original deck bytes and unmodified captured card objects', () => {
  assert.equal(decks.length, 28);
  for (const deck of decks) {
    assert.equal(sha256(deck.text), deck.sha256, deck.sourceFile);
    if (deck.alternative) assert.equal(sha256(deck.alternative.text), deck.alternative.sha256);
  }
  for (const witness of witnesses) assert.equal(sha256(JSON.stringify(witness.card)), witness.cardSha256, witness.card.id);
});

for (const fixture of decks) test(`shortlist ${fixture.id}: ${fixture.title} preserves quantities and explicit placement`, () => {
  // Pack annotations are removed only in this fixture adapter, not by the product parser.
  const parsed = parseDeck(cleanPackNotes(fixture.text));
  assert.equal(parsed.counts.playableQuantity, fixture.expected.playableQuantity);
  assert.equal(parsed.counts.excludedQuantity, fixture.expected.excludedQuantity);
  assert.equal(parsed.rows.filter(row => row.section === 'Commander').length, fixture.expected.commanderCount);
  assert.equal(validateCommanderImport(parsed).valid, ![2, 3].includes(fixture.id));
  if (fixture.id <= 12) {
    const original = parseDeck(fixture.text);
    assert.equal(original.rows.filter(row => row.parseIssues.length).length, 4);
    assert.equal(validateCommanderImport(original).valid, false);
  }
});

test('source inclusion and named-board alternatives remain different; repeated quantities are not repaired', () => {
  for (const [id, quantity] of [[13, 95], [16, 98]]) {
    const alternative = parseDeck(decks.find(deck => deck.id === id).alternative.text);
    assert.equal(alternative.counts.playableQuantity, quantity);
    assert.equal(validateCommanderImport(alternative).valid, false);
  }
  const pokemon = parseDeck(decks.find(deck => deck.id === 19).text);
  assert.equal(pokemon.rows.find(row => row.name === 'Command Tower').quantity, 29);
});

test('official corrected export changes only its three documented names and carries its commander', () => {
  const fixture = decks.find(deck => deck.id === 28);
  const native = parseDeck(fixture.text), corrected = parseDeck(fixture.alternative.text);
  const corrections = new Map(['Sol Ring', 'Command Tower', 'Arcane Signet'].map(name => [`${name} Lorwyn`, name]));
  const quantities = rows => rows.map(row => `${row.quantity}:${row.name}`).sort();
  assert.equal(native.rows.filter(row => corrections.has(row.name)).length, 3);
  assert.deepEqual(quantities(native.rows.map(row => ({...row, name: corrections.get(row.name) || row.name}))), quantities(corrected.rows));
  assert.equal(corrected.rows.filter(row => row.section === 'Commander').length, 1);
  assert.equal(validateCommanderImport(corrected).valid, true);
});

test('all four captured reversible printings accept their agreed face Oracle ID through the import pipeline', async () => {
  const before = JSON.stringify(reversible);
  const client = createScryfallClient({minimumGap: 0, fetchImpl: async (_url, options) => {
    const identifiers = JSON.parse(options.body).identifiers;
    return new Response(JSON.stringify({object: 'list', data: reversible.filter(card => identifiers.some(id => matchesIdentifier(card, id))), not_found: []}));
  }});
  const result = await resolveImport(parseDeck(exactInput(reversible, oracleIds)), (_route, {identifiers}) => client.resolve(identifiers));
  assert.deepEqual(result.deck.rows.map(row => row.status), ['resolved', 'resolved', 'resolved', 'resolved']);
  assert.deepEqual(result.deck.rows.map(row => row.card.oracle_id), oracleIds);
  assert.deepEqual(result.deck.rows.map(row => row.card.id), reversible.map(card => card.id));
  assert.equal(JSON.stringify(reversible), before);
  const wrong = resolveDeck(parseDeck(exactInput([reversible[0]], [oracleIds[1]])), [safeCard(reversible[0])]);
  assert.equal(wrong.rows[0].status, 'mismatch');
  assert.match(wrong.rows[0].issues.join(' '), /Oracle ID/);
});

test('face identity is retained, but conflicting, missing, malformed or unrelated faces never establish a shared identity', () => {
  const original = reversible[0];
  assert.deepEqual(safeCard(original).card_faces.map(face => face.oracle_id), [oracleIds[0], oracleIds[0]]);
  for (const replacement of [oracleIds[1], undefined, 'invalid']) {
    const candidate = structuredClone(original);
    candidate.card_faces[1].oracle_id = replacement;
    assert.equal(safeCard(candidate).oracle_id, undefined);
  }
  for (const candidate of [
    {...original, layout: 'modal_dfc'},
    {...original, card_faces: [original.card_faces[0]]},
    {...original, card_faces: []},
    {...original, oracle_id: 'invalid'},
  ]) assert.equal(safeCard(candidate).oracle_id, undefined);
  assert.equal(safeCard({...original, oracle_id: oracleIds[1]}).oracle_id, oracleIds[1]);
});

test('ordinary and reversible Command Tower are one card for flavor evidence and verified edition changes', () => {
  const selected = [named('Command Tower'), reversible[0]].map(safeCard);
  const deck = resolveDeck(parseDeck(exactInput(selected)), selected);
  const flavor = analyzeFlavor(deck);
  assert.equal(new Set(flavor.passages.map(passage => passage.cardIdentity)).size, 1);
  assert.equal(flavor.passages.length, 3);
  assert.equal(flavor.observations.some(observation => observation.term === 'enough'), false);
  const assumed = resolveDeck(parseDeck('1 Command Tower'), [selected[1]]);
  const changed = resolveDeck(selectReferencePrinting(assumed, 'row-1', selected[0].id), [selected[0]]);
  assert.equal(changed.rows[0].status, 'resolved');
  assert.equal(changed.rows[0].printingProvenance.kind, 'user-selected');
});

test('prepare cards share their exact printing image and keep both text parts without a flip control', () => {
  const card = safeCard(named('Sanar, Unfinished Genius // Wild Idea'));
  assert.deepEqual(getCardFaces(card).map(face => face.name), ['Sanar, Unfinished Genius', 'Wild Idea']);
  assert.equal(hasSeparateCardSides(card), false);
  for (const face of [0, 1]) assert.equal(getCardImageUrl(card, face), card.image_uris.normal);
  assert.equal(getCardImageUrl(card, 2), null);
  assert.equal(getCardImageUrl({...card, image_uris: {normal: named('Command Tower').image_uris.normal}}), null);
  const esika = safeCard(named('Esika, God of the Tree // The Prismatic Bridge'));
  assert.equal(hasSeparateCardSides(esika), true);
  assert.notEqual(getCardImageUrl(esika, 0), getCardImageUrl(esika, 1));
});

test('captured Japanese, Phyrexian and French printings require exact identity without an English substitution', () => {
  const foreign = cards.filter(card => card.lang !== 'en');
  assert.deepEqual(foreign.map(card => card.lang), ['ja', 'ja', 'ph', 'fr']);
  const deck = resolveDeck(parseDeck(exactInput(foreign)), foreign.map(safeCard));
  assert.equal(deck.rows.every(row => row.status === 'resolved' && row.printingProvenance.kind === 'supplied'), true);
  for (const card of foreign) assert.equal(matchesIdentifier(card, {set: card.set, collector_number: card.collector_number}), false);
});

test('real mechanic witnesses retain reported labels, exclude extras and do not infer themes or commander roles', () => {
  const names = ['Veyran, Voice of Duality', 'Shorikai, Genesis Engine', 'Printlifter Ooze', 'Sanar, Unfinished Genius // Wild Idea'];
  const selected = names.map(named).map(safeCard);
  const text = csv([
    ['Quantity', 'Name', 'Scryfall ID', 'Section'],
    ...selected.map(card => [1, card.name, card.id, 'Deck']),
    [1, 'Esika, God of the Tree // The Prismatic Bridge', named('Esika, God of the Tree // The Prismatic Bridge').id, 'Sideboard'],
  ]);
  const deck = resolveDeck(parseDeck(text), [...selected, safeCard(named('Esika, God of the Tree // The Prismatic Bridge'))]);
  const index = indexMechanics(deck);
  assert.deepEqual(index.terms.map(term => term.label).sort(), ['Crew', 'Deathtouch', 'Disguise', 'Magecraft', 'Prepared', 'Treasure']);
  assert.equal(index.terms.find(term => term.label === 'Prepared').audited, false);
  assert.equal(commanderContext(deck).colorIdentity, null);
  const pair = ['Zndrsplt, Eye of Wisdom', 'Okaun, Eye of Chaos'].map(named).map(safeCard);
  const pairText = csv([['Quantity', 'Name', 'Scryfall ID', 'Section'], ...pair.map(card => [1, card.name, card.id, 'Commander'])]);
  const context = commanderContext(resolveDeck(parseDeck(pairText), pair));
  assert.deepEqual(context.colorIdentity, ['U', 'R']);
  assert.equal(context.provisional, true);
});
