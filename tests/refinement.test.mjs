import test from 'node:test';
import assert from 'node:assert/strict';
import { clipboardPageView } from '../public/collection-view.mjs';
import { addClipboard, setClipboardQuantity, removeClipboard, exportClipboard, saveClipboard, loadClipboard } from '../public/clipboard.mjs';
import { createDemoDeck } from '../public/demo.mjs';

const printing = index => ({
  id: `70000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  name: `Gallery Card ${String(index + 1).padStart(2, '0')}`,
  set: index % 2 ? 'tst' : 'alt',
  collector_number: `${String(index + 1).padStart(3, '0')}a`,
  lang: 'en',
});

function collection() {
  let items = Object.freeze([]);
  for (let index = 0; index < 60; index++) items = addClipboard(items, printing(index), 'keyword-index-flying');
  return items;
}

test('sixty saved printings remain reachable exactly once across five bounded pages', () => {
  const items = collection(), before = JSON.stringify(items), visited = [];
  for (let page = 1; page <= 5; page++) {
    const view = clipboardPageView(items, '', page);
    assert.equal(view.page, page);
    assert.equal(view.pages, 5);
    assert.equal(view.total, 60);
    assert.equal(view.items.length, 12);
    visited.push(...view.items.map(item => item.id));
  }
  assert.deepEqual(visited, items.map(item => item.id));
  assert.equal(new Set(visited).size, 60);
  assert.equal(JSON.stringify(items), before);
  assert.ok(Object.isFrozen(items));
  assert.ok(items.every(Object.isFrozen));
});

test('name, edition, and collector searches change the view while export retains every printing', () => {
  const items = collection(), completeExport = exportClipboard(items);
  assert.equal(clipboardPageView(items, '  gAlLeRy CaRd 05  ').items[0].id, printing(4).id);
  assert.equal(clipboardPageView(items, '003a').items[0].id, printing(2).id);
  const edition = clipboardPageView(items, ' ALT ', 3);
  assert.equal(edition.total, 30);
  assert.equal(edition.pages, 3);
  assert.equal(edition.items.length, 6);
  assert.ok(edition.items.every(item => item.set === 'alt'));
  const noMatches = clipboardPageView(items, 'No Such Card', 5);
  assert.deepEqual(noMatches, { items: [], page: 1, pages: 1, total: 0 });
  assert.equal(exportClipboard(items), completeExport);
  const lines = completeExport.split('\n');
  assert.equal(lines.length, 60);
  assert.equal(lines[0], '1 Gallery Card 01 (ALT) 001a');
  assert.equal(lines.at(-1), '1 Gallery Card 60 (TST) 060a');
});

test('filtered quantity edits and removals update only the selected printing and preserve the imported deck', () => {
  const importedDeck = createDemoDeck(), importedBefore = JSON.stringify(importedDeck);
  const initial = collection(), initialExport = exportClipboard(initial);
  const selected = clipboardPageView(initial, 'tst', 2).items[3];
  const changed = setClipboardQuantity(initial, selected.id, 7);
  const another = clipboardPageView(changed, 'alt', 3).items[0];
  const remaining = removeClipboard(changed, another.id);
  assert.equal(remaining.length, 59);
  assert.equal(remaining.find(item => item.id === selected.id).quantity, 7);
  assert.equal(remaining.reduce((sum, item) => sum + item.quantity, 0), 65);
  assert.equal(clipboardPageView(remaining, 'alt').total, 29);
  assert.equal(clipboardPageView(remaining, 'tst').total, 30);
  for (const item of initial) {
    if (item.id === another.id) continue;
    assert.deepEqual(remaining.find(candidate => candidate.id === item.id), item.id === selected.id ? { ...item, quantity: 7 } : item);
  }
  assert.equal(exportClipboard(initial), initialExport);
  assert.equal(JSON.stringify(importedDeck), importedBefore);
  assert.ok(Object.isFrozen(importedDeck.rows));
});

test('removing the final page clamps the visible page without dropping earlier printings', () => {
  const initial = collection();
  const lastPageIds = clipboardPageView(initial, '', 5).items.map(item => item.id);
  const remaining = lastPageIds.reduce((items, id) => removeClipboard(items, id), initial);
  const view = clipboardPageView(remaining, '', 5);
  assert.equal(view.page, 4);
  assert.equal(view.pages, 4);
  assert.equal(view.total, 48);
  assert.deepEqual(view.items.map(item => item.id), initial.slice(36, 48).map(item => item.id));
  assert.equal(exportClipboard(remaining).split('\n').length, 48);
  assert.equal(initial.length, 60);
  assert.equal(clipboardPageView(initial, '', -20).page, 1);
  assert.equal(clipboardPageView(initial, '', 999).page, 5);
});

test('searching a repeated card name keeps separate editions and quantities independently exportable', () => {
  const initial = collection(), firstPrinting = printing(0);
  const anotherEdition = { ...printing(60), name: firstPrinting.name, set: 'oth', collector_number: '099b' };
  const items = addClipboard(addClipboard(initial, firstPrinting), anotherEdition);
  const view = clipboardPageView(items, firstPrinting.name, 999);
  assert.equal(items.length, 61);
  assert.equal(view.total, 2);
  assert.equal(view.page, 1);
  assert.deepEqual(view.items.map(item => [item.id, item.quantity, item.set, item.collectorNumber]), [
    [firstPrinting.id, 2, 'alt', '001a'],
    [anotherEdition.id, 1, 'oth', '099b'],
  ]);
  assert.ok(exportClipboard(items).includes('2 Gallery Card 01 (ALT) 001a'));
  assert.ok(exportClipboard(items).includes('1 Gallery Card 01 (OTH) 099b'));
  assert.equal(exportClipboard(items).split('\n').length, 61);
});

test('saving after browsing a filtered page restores the entire sixty-printing collection', () => {
  const items = setClipboardQuantity(collection(), printing(57).id, 4);
  const page = clipboardPageView(items, 'tst', 3);
  assert.equal(page.items.length, 6);
  const memory = new Map();
  const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  assert.equal(saveClipboard(items, storage).persistenceAvailable, true);
  const restored = loadClipboard(storage);
  assert.equal(restored.discarded, 0);
  assert.equal(restored.items.length, 60);
  assert.deepEqual(restored.items, items);
  assert.equal(exportClipboard(restored.items), exportClipboard(items));
  assert.equal(clipboardPageView(restored.items, '', 5).items.at(-1).id, printing(59).id);
});
