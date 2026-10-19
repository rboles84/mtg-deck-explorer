import test from 'node:test';
import assert from 'node:assert/strict';
import { safeCard, safeImageUris } from '../lib/scryfall.mjs';

const uri = 'https://cards.scryfall.io/normal/front/a/b/00000000-0000-4000-8000-000000000001.jpg?1731000000';
const card = { object: 'card', id: '00000000-0000-4000-8000-000000000001', name: 'Exact printing', set: 'tst', collector_number: '4a', lang: 'ja', color_identity: ['W'], legalities: { commander: 'legal' } };

test('preview imagery is constrained to supported sizes on the exact trusted HTTPS host', () => {
  assert.deepEqual(safeImageUris({ normal: uri, small: uri.replace('/normal/', '/small/'), large: uri.replace('/normal/', '/large/'), png: 'https://evil.test/image.png' }), { small: uri.replace('/normal/', '/small/'), normal: uri, large: uri.replace('/normal/', '/large/') });
  for (const hostile of [
    'http://cards.scryfall.io/image.jpg', '//cards.scryfall.io/image.jpg',
    'https://cards.scryfall.io.evil.test/image.jpg', 'https://evil.test/cards.scryfall.io/image.jpg',
    'https://user@cards.scryfall.io/image.jpg', 'https://user:pass@cards.scryfall.io/image.jpg',
    'https://cards.scryfall.io:8443/image.jpg', 'https://cards.scryfall.io./image.jpg',
    'https://cards.scryfall.io/image.jpg#fragment', 'https://cards.scryfall.io\\evil/image.jpg',
    ' https://cards.scryfall.io/image.jpg', 'data:image/png;base64,AA==', 'javascript:bad()',
    'https://cards.scryfall.io/' + 'x'.repeat(2048)
  ]) assert.equal(safeImageUris({ normal: hostile }), undefined, hostile);
  assert.equal(safeImageUris(null), undefined);
  assert.equal(safeImageUris([]), undefined);
});

test('exact card and face images and attribution survive sanitization without changing printing identity', () => {
  const input = { ...card, rarity: 'rare', artist: 'Original artist', image_uris: { normal: uri }, card_faces: [
    { name: 'Front', image_uris: { normal: uri }, artist: 'Front artist' },
    { name: 'Back', image_uris: { normal: uri.replace('/front/', '/back/'), small: 'https://evil.test/back.jpg' }, artist: 'Back artist' }
  ] };
  const before = structuredClone(input);
  const output = safeCard(input);
  assert.equal(output.id, input.id);
  assert.equal(output.collector_number, '4a');
  assert.equal(output.lang, 'ja');
  assert.deepEqual(output.image_uris, { normal: uri });
  assert.deepEqual(output.card_faces[1].image_uris, { normal: uri.replace('/front/', '/back/') });
  assert.equal(output.card_faces[1].artist, 'Back artist');
  assert.equal(output.rarity, 'rare');
  assert.equal(output.artist, 'Original artist');
  assert.deepEqual(input, before);
});

test('invalid optional image and attribution data does not invent or break an exact printing', () => {
  const output = safeCard({ ...card, rarity: 'rare<script>', artist: { name: 'Unsafe' }, image_uris: { normal: 'https://evil.test/image.jpg' }, card_faces: [{ name: 'Front', artist: 'x'.repeat(501), image_uris: ['https://cards.scryfall.io/image.jpg'] }] });
  assert.equal(output.image_uris, undefined);
  assert.equal(output.artist, undefined);
  assert.equal(output.rarity, undefined);
  assert.equal(output.card_faces[0].image_uris, undefined);
  assert.equal(output.card_faces[0].artist, undefined);
  assert.equal(output.id, card.id);
});
