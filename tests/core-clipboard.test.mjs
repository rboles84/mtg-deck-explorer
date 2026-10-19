import test from 'node:test';
import assert from 'node:assert/strict';
import { addClipboard, setClipboardQuantity, removeClipboard, clearClipboard, exportClipboard, restoreClipboard, saveClipboard, loadClipboard, CLIPBOARD_STORAGE_KEY } from '../public/clipboard.mjs';
import { parseDeck, resolveDeck } from '../public/core.mjs';
import { DEMO_CARDS } from '../public/demo.mjs';

const card = { id: '00000000-0000-4000-8000-000000000001', name: 'Test, Exact Printing', set: 'tst', collector_number: '001a', lang: 'en', color_identity: [], keywords: [] };
const second = { ...card, id: '00000000-0000-4000-8000-000000000002', set: 'oth', collector_number: '002' };

test('manual add merges same printing quantity and keeps another printing of the same name separate', () => {
  const original = clearClipboard();
  const one = addClipboard(original, card, 'keyword-index-flying');
  const two = addClipboard(one, card);
  const three = addClipboard(two, second);
  assert.equal(original.length, 0);
  assert.equal(one[0].quantity, 1);
  assert.equal(two[0].quantity, 2);
  assert.equal(three.length, 2);
  assert.equal(three[0].queryId, 'keyword-index-flying');
  assert.equal(three[1].name, three[0].name);
  assert.ok(Object.isFrozen(three[0]));
});

test('quantity, removal, clear and print-aware export preserve exact entries and imported deck immutability', () => {
  const imported = resolveDeck(parseDeck(`1 ${card.name} (tst) 001a`), [card]);
  const before = JSON.stringify(imported);
  const state = addClipboard(addClipboard([], card), second);
  const updated = setClipboardQuantity(state, card.id, 7);
  assert.equal(exportClipboard(updated), '7 Test, Exact Printing (TST) 001a\n1 Test, Exact Printing (OTH) 002');
  assert.equal(exportClipboard(updated, { namesOnly: true }), '7 Test, Exact Printing\n1 Test, Exact Printing');
  assert.equal(removeClipboard(updated, card.id).length, 1);
  assert.equal(clearClipboard().length, 0);
  assert.equal(JSON.stringify(imported), before);
  assert.equal(state[0].quantity, 1);
  for (const value of [0, -1, 1.5, 1000, NaN, '2']) assert.throws(() => setClipboardQuantity(state, card.id, value), /positive integer/);
});

test('synthetic cards, invalid UUIDs, export newlines and hostile query IDs are rejected', () => {
  assert.throws(() => addClipboard([], DEMO_CARDS[0]), /actual selected/);
  assert.throws(() => addClipboard([], { ...card, id: 'not-a-uuid' }), /exact-printing/);
  assert.throws(() => addClipboard([], { ...card, name: 'Injected\n1 Other Card (set) 1' }), /exact-printing/);
  assert.throws(() => addClipboard([], card, 'https://untrusted.invalid'), /exact-printing/);
});

test('session restore validates objects, strips unknown properties, discards duplicates and malformed entries', () => {
  const items = addClipboard([], card);
  const saved = JSON.stringify({ version: 1, items: [{ ...items[0], unexpected: '<script>' }, items[0], { ...items[0], id: second.id, quantity: 0 }, { id: 'broken' }] });
  const restored = restoreClipboard(saved);
  assert.equal(restored.items.length, 1);
  assert.equal(restored.discarded, 3);
  assert.equal(restored.items[0].unexpected, undefined);
  assert.ok(restoreClipboard('{invalid').error);
  assert.ok(restoreClipboard(JSON.stringify([])).error);
  assert.ok(restoreClipboard('x'.repeat(500001)).error);
});

test('session storage uses its own key and falls back to memory when access is blocked', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const items = addClipboard([], card);
  assert.equal(saveClipboard(items, storage).persistenceAvailable, true);
  assert.deepEqual(loadClipboard(storage).items, items);
  assert.deepEqual([...data.keys()], [CLIPBOARD_STORAGE_KEY]);
  assert.match(CLIPBOARD_STORAGE_KEY, /^mtg-deck-explorer\./);
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(loadClipboard(blocked).persistenceAvailable, false);
  assert.equal(saveClipboard(items, blocked).persistenceAvailable, false);
});
