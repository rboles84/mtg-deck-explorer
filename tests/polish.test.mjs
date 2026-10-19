import test from 'node:test';
import assert from 'node:assert/strict';
import { deepFreeze } from '../public/core.mjs';
import { getCardFaces, getCardImageUrl, placeCardPreview } from '../public/card-preview.mjs';
import { createDeckServer } from '../server.mjs';

const printingId = '10000000-0000-4000-8000-000000000001';
const otherPrintingId = '10000000-0000-4000-8000-000000000002';
const imageUrl = (face = 'front', id = printingId, size = 'normal') => `https://cards.scryfall.io/${size}/${face}/1/0/${id}.jpg?123`;
const frontImage = imageUrl();
const backImage = imageUrl('back');
const doubleFaced = () => ({
  id: printingId, name: 'First face // Second face', layout: 'transform',
  card_faces: [
    { name: 'First face', image_uris: { normal: frontImage } },
    { name: 'Second face', image_uris: { normal: backImage } },
  ],
});

test('preview helpers inspect frozen exact-printing data without adding presentation state', () => {
  const card = deepFreeze(doubleFaced());
  const before = JSON.stringify(card);
  assert.deepEqual(getCardFaces(card).map(face => face.name), ['First face', 'Second face']);
  assert.equal(getCardImageUrl(card, 0), frontImage);
  assert.equal(getCardImageUrl(card, 1), backImage);
  assert.equal(JSON.stringify(card), before);
  assert.ok(Object.isFrozen(card.card_faces[0].image_uris));
});

test('a missing double-faced image never borrows the opposite face or a card-level image', () => {
  const card = doubleFaced();
  card.image_uris = { normal: frontImage };
  delete card.card_faces[1].image_uris;
  assert.equal(getCardImageUrl(deepFreeze(card), 1), null);
  assert.equal(getCardImageUrl(card, 0), frontImage);
});

test('a shared-image split layout can show its exact combined printing for either face', () => {
  const card = deepFreeze({
    id: printingId, name: 'First half // Second half', layout: 'split',
    image_uris: { normal: frontImage },
    card_faces: [{ name: 'First half' }, { name: 'Second half' }],
  });
  assert.equal(getCardImageUrl(card, 0), frontImage);
  assert.equal(getCardImageUrl(card, 1), frontImage);
});

test('single-faced and image-absent printings retain usable face data', () => {
  const card = deepFreeze({ id: printingId, name: 'A printing', image_uris: { normal: frontImage } });
  assert.deepEqual(getCardFaces(card), [card]);
  assert.equal(getCardImageUrl(card), frontImage);
  assert.equal(getCardImageUrl({ id: printingId, name: 'No image' }), null);
});

test('synthetic previews never expose even an otherwise valid provider image', () => {
  const card = deepFreeze({ id: printingId, image_uris: { normal: frontImage } });
  assert.equal(getCardImageUrl(card, 0, { synthetic: true }), null);
  assert.equal(getCardImageUrl({ ...card, synthetic: true }), null);
});

test('preview image selection rejects unrelated printing and unsafe URL forms', () => {
  const unsafe = [
    imageUrl('front', otherPrintingId),
    frontImage.replace('https:', 'http:'),
    frontImage.replace('cards.scryfall.io', 'cards.scryfall.io.evil.example'),
    frontImage.replace('cards.scryfall.io', 'user:password@cards.scryfall.io'),
    frontImage.replace('cards.scryfall.io', 'cards.scryfall.io:8443'),
    'data:image/svg+xml,<svg onload="alert(1)"></svg>',
    'javascript:alert(1)',
    `https://cards.scryfall.io/art_crop/front/1/0/${printingId}.jpg`,
  ];
  for (const url of unsafe) {
    assert.equal(getCardImageUrl({ id: printingId, image_uris: { normal: url } }), null, url);
  }
});

test('preview placement fits within each viewport edge when its dimensions fit', () => {
  const size = { width: 240, height: 310 };
  const viewport = { width: 800, height: 600 };
  const anchors = [
    { left: 0, right: 100, top: 0, bottom: 30 },
    { left: 700, right: 800, top: 0, bottom: 30 },
    { left: 0, right: 100, top: 570, bottom: 600 },
    { left: 700, right: 800, top: 570, bottom: 600 },
    { left: -20, right: 40, top: -20, bottom: 10 },
    { left: 780, right: 840, top: 590, bottom: 630 },
  ];
  for (const anchor of anchors) {
    const result = placeCardPreview(anchor, size, viewport);
    assert.ok(Number.isFinite(result.left) && Number.isFinite(result.top));
    assert.ok(result.left >= 0 && result.top >= 0, JSON.stringify({ anchor, result }));
    assert.ok(result.left + size.width <= viewport.width, JSON.stringify({ anchor, result }));
    assert.ok(result.top + size.height <= viewport.height, JSON.stringify({ anchor, result }));
  }
});

test('preview placement leaves a roomy trigger unobscured and stays nonnegative in narrow views', () => {
  const anchor = { left: 300, right: 420, top: 200, bottom: 225 };
  const size = { width: 240, height: 310 };
  const result = placeCardPreview(anchor, size, { width: 1200, height: 900 });
  assert.ok(result.left >= anchor.right || result.left + size.width <= anchor.left);
  const narrow = placeCardPreview(anchor, size, { width: 180, height: 220 });
  assert.ok(narrow.left >= 0 && narrow.left < 180);
  assert.ok(narrow.top >= 0 && narrow.top < 220);
});

async function localServer(t) {
  const server = await createDeckServer({ fetchImpl: async () => { throw new Error('An asset request must not contact a provider.'); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('local symbol fonts are served as usable fonts, including versioned CSS URLs and HEAD requests', async t => {
  const base = await localServer(t);
  const fonts = [
    ['/vendor/mana/fonts/mana.woff2?v=1.17.1', 'font/woff2', 'wOF2'],
    ['/vendor/mana/fonts/mana.woff?v=1.17.1', 'font/woff', 'wOFF'],
    ['/vendor/mana/fonts/mplantin.woff?v=1.17.1', 'font/woff', 'wOFF'],
    ['/vendor/keyrune/fonts/keyrune.woff2?v=3.19.0', 'font/woff2', 'wOF2'],
    ['/vendor/keyrune/fonts/keyrune.woff?v=3.19.0', 'font/woff', 'wOFF'],
  ];
  for (const [route, type, signature] of fonts) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200, route);
    assert.equal(response.headers.get('content-type'), type, route);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0, 4).toString('ascii'), signature, route);
    assert.equal(Number(response.headers.get('content-length')), bytes.length);
    assert.ok(bytes.length > 1000, route);
  }
  for (const route of ['/vendor/mana/css/mana.css', '/vendor/keyrune/css/keyrune.css']) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get('content-type'), /^text\/css/);
    assert.match(await response.text(), /@font-face/);
  }
  const head = await fetch(base + fonts[0][0], { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-type'), 'font/woff2');
  assert.ok(Number(head.headers.get('content-length')) > 1000);
  assert.equal(await head.text(), '');
});

test('image-enabled page policy keeps fonts and connections local and source files private', async t => {
  const base = await localServer(t);
  const page = await fetch(base + '/');
  assert.equal(page.status, 200);
  const policy = new Map(page.headers.get('content-security-policy').split(';').map(value => {
    const [name, ...sources] = value.trim().split(/\s+/);
    return [name, sources];
  }));
  assert.deepEqual(policy.get('font-src'), ["'self'"]);
  assert.deepEqual(policy.get('connect-src'), ["'self'"]);
  assert.deepEqual(policy.get('img-src'), ["'self'", 'data:', 'https://cards.scryfall.io']);
  assert.deepEqual(policy.get('script-src'), ["'self'"]);
  assert.deepEqual(policy.get('object-src'), ["'none'"]);
  await page.text();
  for (const route of ['/lib/scryfall.mjs', '/inputs/atlas_v2.0.json', '/%2e%2e%5cserver.mjs']) {
    const response = await fetch(base + route);
    assert.equal(response.status, 404, route);
    await response.text();
  }
});
