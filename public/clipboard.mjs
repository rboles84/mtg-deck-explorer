/** Discovery Clipboard data is independent from the immutable imported deck. */
import { deepFreeze } from './core.mjs';

export const CLIPBOARD_STORAGE_KEY = 'mtg-deck-explorer.discovery-printings.v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validQuantity = value => Number.isSafeInteger(value) && value >= 1 && value <= 999;
const validText = (value, maximum) => typeof value === 'string' && value.length > 0 && value.length <= maximum && !/[\r\n\u0000-\u001f\u007f]/.test(value);

function validateEntry(entry) {
  return entry && UUID.test(entry.id) && validText(entry.name, 500) && /^[a-z0-9]{2,8}$/.test(entry.set)
    && validText(entry.collectorNumber, 32) && /^[\p{L}\p{N}._★☆†-]{1,32}$/u.test(entry.collectorNumber)
    && (entry.language === null || /^[a-z]{2,5}$/.test(entry.language))
    && (entry.queryId === null || /^keyword-index-[a-z-]{1,60}$/.test(entry.queryId)) && validQuantity(entry.quantity);
}

function normalizedEntry(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entry = { id: typeof value.id === 'string' ? value.id.toLowerCase() : '', name: value.name,
    set: value.set, collectorNumber: value.collectorNumber, language: value.language ?? null, queryId: value.queryId ?? null, quantity: value.quantity };
  return validateEntry(entry) ? entry : null;
}

export function addClipboard(items, card, queryId = null) {
  if (!card || card.synthetic) throw new TypeError('Only an actual selected Scryfall printing can be collected.');
  const entry = normalizedEntry({ id: card.id, name: card.name, set: card.set, collectorNumber: card.collector_number, language: card.lang || null, queryId, quantity: 1 });
  if (!entry) throw new TypeError('The selected card is missing valid exact-printing data.');
  const current = items.find(item => item.id === entry.id);
  if (current && current.quantity >= 999) throw new RangeError('Clipboard quantities are limited to 999.');
  return deepFreeze(current ? items.map(item => item.id === entry.id ? { ...item, quantity: item.quantity + 1 } : { ...item }) : [...items.map(item => ({ ...item })), entry]);
}

export function setClipboardQuantity(items, id, quantity) {
  if (!validQuantity(quantity)) throw new RangeError('Quantity must be a positive integer from 1 to 999.');
  return deepFreeze(items.map(item => item.id === id ? { ...item, quantity } : { ...item }));
}

export const removeClipboard = (items, id) => deepFreeze(items.filter(item => item.id !== id).map(item => ({ ...item })));
export const clearClipboard = () => Object.freeze([]);

export function exportClipboard(items, { namesOnly = false } = {}) {
  return items.map(item => `${item.quantity} ${item.name}${namesOnly ? '' : ` (${item.set.toUpperCase()}) ${item.collectorNumber}`}`).join('\n');
}

export function restoreClipboard(rawString) {
  if (rawString === null || rawString === undefined || rawString === '') return deepFreeze({ items: [], discarded: 0, error: null });
  try {
    if (typeof rawString !== 'string' || rawString.length > 500000) throw new Error('Saved clipboard data is too large or invalid.');
    const decoded = JSON.parse(rawString);
    if (!decoded || decoded.version !== 1 || !Array.isArray(decoded.items) || decoded.items.length > 500) throw new Error('Saved clipboard format is unsupported.');
    const items = [], seen = new Set();
    let discarded = 0;
    for (const value of decoded.items) {
      const entry = normalizedEntry(value);
      if (!entry || seen.has(entry.id)) { discarded++; continue; }
      seen.add(entry.id); items.push(entry);
    }
    return deepFreeze({ items, discarded, error: null });
  } catch (error) { return deepFreeze({ items: [], discarded: 0, error: error.message }); }
}

export function loadClipboard(storage) {
  try {
    const target = storage ?? globalThis.sessionStorage;
    if (!target) throw new Error('Session storage is unavailable.');
    const result = restoreClipboard(target.getItem(CLIPBOARD_STORAGE_KEY));
    return deepFreeze({ ...result, persistenceAvailable: true, message: result.error || (result.discarded ? `${result.discarded} invalid saved clipboard entries were discarded.` : '') });
  } catch { return deepFreeze({ items: [], discarded: 0, error: null, persistenceAvailable: false, message: 'Session storage is unavailable; the Clipboard will stay in memory until this page is closed or refreshed.' }); }
}

export function saveClipboard(items, storage) {
  try {
    const target = storage ?? globalThis.sessionStorage;
    if (!target) throw new Error('Session storage is unavailable.');
    if (!items.every(validateEntry)) throw new Error('Invalid clipboard entries.');
    target.setItem(CLIPBOARD_STORAGE_KEY, JSON.stringify({ version: 1, items }));
    return { persistenceAvailable: true, message: '' };
  } catch { return { persistenceAvailable: false, message: 'Session storage is unavailable; the Clipboard is kept in memory only.' }; }
}
