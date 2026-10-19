const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLORS = ['W', 'U', 'B', 'R', 'G'];
export const DISCOVERY_PAGE_SIZE = 24;
const PROVIDER_PAGE_SIZE = 175;
const MAX_DISCOVERY_PAGE = 10000;
export class HttpError extends Error {
  constructor(status, message, retryAfter = null) { super(message); this.status = status; this.retryAfter = retryAfter; }
}
export function exactKeys(value, allowed) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(k => allowed.includes(k));
}
export function normalizeCollector(value) { return value.toLowerCase().replace(/^0+(?=\d)/, ''); }
export function identifierKey(identifier) {
  return identifier.id ? `id:${identifier.id.toLowerCase()}` : `printing:${identifier.set.toLowerCase()}:${normalizeCollector(identifier.collector_number)}`;
}
export function validateIdentifiers(input) {
  if (!Array.isArray(input) || !input.length || input.length > 1000) throw new HttpError(400, 'Supply between 1 and 1,000 printing identifiers, with at most 500 distinct printings.');
  const identifiers = new Map();
  for (const item of input) {
    if (!exactKeys(item, ['id', 'set', 'collector_number', 'lang'])) throw new HttpError(400, 'Only printing ID or set and collector number are accepted.');
    let identifier;
    if (item.id !== undefined) {
      if (!UUID.test(item.id) || Object.keys(item).some(k => k !== 'id')) throw new HttpError(400, 'A Scryfall printing ID must be a UUID and supplied by itself.');
      identifier = { id: item.id.toLowerCase() };
    } else {
      if (typeof item.set !== 'string' || !/^[a-z0-9]{2,8}$/i.test(item.set) || typeof item.collector_number !== 'string' || !/^[a-z0-9★†*.-]{1,32}$/i.test(item.collector_number)) throw new HttpError(400, 'Invalid set or collector number.');
      if (item.lang !== undefined && item.lang !== 'en') throw new HttpError(422, 'Non-English printings require an exact Scryfall printing UUID. No English replacement was requested.');
      identifier = { set: item.set.toLowerCase(), collector_number: item.collector_number };
    }
    identifiers.set(identifierKey(identifier), identifier);
  }
  if (identifiers.size > 500) throw new HttpError(400, 'At most 500 distinct printing identifiers may be resolved per import.');
  return [...identifiers.values()];
}
export function validateIdentity(identity) {
  if (!Array.isArray(identity) || identity.length > 5 || identity.some(c => !COLORS.includes(c)) || new Set(identity).size !== identity.length) throw new HttpError(502, 'Provider returned invalid color identity.');
  return COLORS.filter(c => identity.includes(c));
}
function safeText(value, field, limit = 24000) {
  if (value !== undefined && (typeof value !== 'string' || value.length > limit)) throw new HttpError(502, `Provider returned invalid ${field}.`);
  return value;
}
export function safeImageUris(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const images = {};
  for (const size of ['small', 'normal', 'large']) {
    const candidate = value[size];
    if (typeof candidate !== 'string' || candidate.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(candidate)) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === 'https:' && url.hostname === 'cards.scryfall.io' && !url.port && !url.username && !url.password && !url.hash) images[size] = url.href;
    } catch {}
  }
  return Object.keys(images).length ? images : undefined;
}
export function safeCard(card) {
  if (!card || card.object !== 'card' || !UUID.test(card.id) || typeof card.name !== 'string' || !card.name || typeof card.set !== 'string' || !/^[a-z0-9]{2,8}$/i.test(card.set) || typeof card.collector_number !== 'string' || card.collector_number.length > 64 || typeof card.lang !== 'string' || card.lang.length > 8) throw new HttpError(502, 'Provider returned an invalid printing record.');
  const result = { object: 'card', id: card.id.toLowerCase(), name: safeText(card.name, 'name', 500), set: card.set, collector_number: card.collector_number, lang: card.lang, color_identity: validateIdentity(card.color_identity), keywords: [], legalities: { commander: typeof card.legalities?.commander === 'string' ? card.legalities.commander : 'unknown' } };
  if (UUID.test(card.oracle_id)) result.oracle_id = card.oracle_id;
  for (const field of ['flavor_text', 'oracle_text', 'type_line', 'layout', 'mana_cost', 'printed_name', 'released_at', 'set_name']) {
    if (card[field] !== undefined) result[field] = safeText(card[field], field);
  }
  if (typeof card.artist === 'string' && card.artist.length <= 500) result.artist = card.artist;
  if (['common', 'uncommon', 'rare', 'mythic', 'special', 'bonus'].includes(card.rarity)) result.rarity = card.rarity;
  const images = safeImageUris(card.image_uris);
  if (images) result.image_uris = images;
  if (Array.isArray(card.keywords) && card.keywords.length <= 100 && card.keywords.every(k => typeof k === 'string' && k.length <= 150)) result.keywords = [...card.keywords];
  if (card.card_faces !== undefined) {
    if (!Array.isArray(card.card_faces) || card.card_faces.length > 8) throw new HttpError(502, 'Provider returned invalid card faces.');
    result.card_faces = card.card_faces.map(face => {
      if (!face || typeof face !== 'object' || Array.isArray(face)) throw new HttpError(502, 'Provider returned an invalid card face.');
      const output = {};
      for (const key of ['name', 'flavor_text', 'oracle_text', 'type_line', 'mana_cost', 'printed_name']) if (face[key] !== undefined) output[key] = safeText(face[key], key);
      if (typeof face.artist === 'string' && face.artist.length <= 500) output.artist = face.artist;
      const faceImages = safeImageUris(face.image_uris);
      if (faceImages) output.image_uris = faceImages;
      return output;
    });
  }
  if (typeof card.scryfall_uri === 'string') {
    try { const url = new URL(card.scryfall_uri); if (url.protocol === 'https:' && url.hostname === 'scryfall.com' && !url.username && !url.password && url.pathname.startsWith('/card/')) result.scryfall_uri = url.href; } catch {}
  }
  return result;
}
export function matchesIdentifier(card, identifier) {
  return identifier.id ? card.id === identifier.id.toLowerCase() : card.set.toLowerCase() === identifier.set.toLowerCase() && normalizeCollector(card.collector_number) === normalizeCollector(identifier.collector_number) && card.lang === 'en';
}

export function buildQuery(catalog, atlasRowId, identity) {
  const record = catalog.records.find(r => r.atlas_row_id === atlasRowId);
  if (!record || record.atlas.tier !== 'Production-ready' || record.atlas.auto_execute !== true || record.atlas.parameters.length !== 0 || !/^kw:[A-Za-z]+$/.test(record.atlas.query)) throw new HttpError(400, 'This Atlas row is not in the reviewed discovery whitelist.');
  const colors = validateIdentity(identity);
  const baseline = catalog.baseline;
  if (!baseline || baseline.query !== 'f:commander id<=[COLORS]' || baseline.tier !== 'Production-ready' || baseline.auto_execute !== true || JSON.stringify(baseline.parameters) !== '["[COLORS]"]') throw new HttpError(400, 'Commander identity search requires the reviewed Atlas baseline.');
  // Scryfall c denotes zero colors in color identity comparisons; it is not a sixth color.
  const binding = colors.length ? colors.join('').toLowerCase() : 'c';
  return `(${baseline.query.replace('[COLORS]', binding)}) (${record.atlas.query})`;
}

export function validateDiscoveryPage(page = 1) {
  if (!Number.isSafeInteger(page) || page < 1 || page > MAX_DISCOVERY_PAGE) throw new HttpError(400, `Discovery page must be an integer from 1 to ${MAX_DISCOVERY_PAGE}.`);
  return page;
}

// Preserve provider positions while collapsing unexpected reprints. Keeping empty
// slots prevents one removed record from shifting every subsequent 24-card page.
export function distinctDiscoverySlots(cards) {
  const slots = cards.map(() => null), byOracle = new Map(), byName = new Map();
  let duplicates = 0;
  const release = card => /^\d{4}-\d{2}-\d{2}$/.test(card.released_at ?? '') ? card.released_at : '';
  for (let index = 0; index < cards.length; index++) {
    const card = cards[index];
    if (!card) continue;
    const oracle = card.oracle_id?.toLowerCase();
    const name = card.name.normalize('NFKC').trim().toLowerCase();
    const matches = [...new Set([byOracle.get(oracle), byName.get(name)].filter(value => value !== undefined))];
    const position = matches.length ? Math.min(...matches) : index;
    let newest = card;
    for (const match of matches) {
      const previous = slots[match];
      if (previous && (release(previous) > release(newest) || release(previous) === release(newest) && previous.id < newest.id)) newest = previous;
      if (match !== position) {
        slots[match] = null;
        for (const [key, value] of byOracle) if (value === match) byOracle.set(key, position);
        for (const [key, value] of byName) if (value === match) byName.set(key, position);
      }
    }
    if (matches.length) duplicates += matches.length;
    slots[position] = newest;
    if (oracle) byOracle.set(oracle, position);
    byName.set(name, position);
  }
  return { slots, duplicates };
}

export function createScryfallClient({ fetchImpl = fetch, minimumGap = 120, timeoutMs = 15000, cacheTtl = 300000 } = {}) {
  let queue = Promise.resolve(), lastStart = 0, blockedUntil = 0, pending = 0;
  const cache = new Map(), inFlight = new Map(), searchTotals = new Map();
  async function perform(pathname, body) {
    if (pending >= 30) throw new HttpError(503, 'Provider queue is busy. Please wait before trying again.');
    pending++;
    const task = queue.catch(() => {}).then(async () => {
      if (blockedUntil > Date.now()) throw new HttpError(429, 'Scryfall has asked us to wait. No automatic retry was made.', String(Math.ceil((blockedUntil - Date.now()) / 1000)));
      const url = new URL(pathname, 'https://api.scryfall.com');
      if (url.origin !== 'https://api.scryfall.com' || !['/cards/collection', '/cards/search'].includes(url.pathname)) throw new HttpError(400, 'Outbound operation is not allowed.');
      // Search is documented at two requests/second. Explicit zero spacing is
      // retained for injected test providers; normal collection calls use 120ms.
      const gap = url.pathname === '/cards/search' && minimumGap !== 0 ? Math.max(500, minimumGap) : minimumGap;
      const delay = Math.max(0, lastStart + gap - Date.now());
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      lastStart = Date.now();
      let response;
      try { response = await fetchImpl(url.href, { method: body ? 'POST' : 'GET', headers: { 'User-Agent': 'DeckExplorerLocalPrototype/1.0 (printing research; user-initiated requests)', Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) }); }
      catch { throw new HttpError(502, 'Scryfall could not be reached or timed out. Your deck has not been replaced with fixture data.'); }
      if (response.status === 429) {
        const retry = response.headers.get('retry-after');
        const milliseconds = /^\d+$/.test(retry ?? '') ? Number(retry) * 1000 : Date.parse(retry ?? '') - Date.now();
        blockedUntil = Date.now() + Math.max(1000, Math.min(Number.isFinite(milliseconds) ? milliseconds : 60000, 3600000));
        throw new HttpError(429, 'Scryfall rate limit reached. No automatic retry was made.', String(Math.ceil((blockedUntil - Date.now()) / 1000)));
      }
      if (response.status === 404 && url.pathname === '/cards/search') return { object: 'list', data: [], total_cards: 0, has_more: false };
      if (!response.ok) throw new HttpError(502, `Scryfall returned HTTP ${response.status}. No substitute data was used.`);
      let size = 0, chunks = [];
      try {
        for await (const chunk of response.body) { size += chunk.length; if (size > 5 * 1024 * 1024) throw new Error('oversized'); chunks.push(chunk); }
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch { throw new HttpError(502, 'Scryfall returned an oversized or unreadable response.'); }
    });
    queue = task;
    try { return await task; } finally { pending--; }
  }
  async function request(pathname, body) {
    const key = pathname + (body ? JSON.stringify(body) : '');
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) return structuredClone(cached.value);
    if (!inFlight.has(key)) {
      const task = perform(pathname, body).then(data => {
        if (cache.size >= 64) cache.delete(cache.keys().next().value);
        cache.set(key, { value: data, expires: Date.now() + cacheTtl });
        return data;
      }).finally(() => inFlight.delete(key));
      inFlight.set(key, task);
    }
    return structuredClone(await inFlight.get(key));
  }
  return {
    async resolve(input) {
      const identifiers = validateIdentifiers(input), cards = new Map(), notFound = [], warnings = [];
      for (let offset = 0; offset < identifiers.length; offset += 75) {
        const batch = identifiers.slice(offset, offset + 75);
        const response = await request('/cards/collection', { identifiers: batch });
        if (response.object !== 'list' || !Array.isArray(response.data) || response.data.length > 75 || !Array.isArray(response.not_found) || response.not_found.length > 75) throw new HttpError(502, 'Scryfall collection response did not match its expected schema.');
        const returned = response.data.map(safeCard);
        const providerMissing = response.not_found.map(item => {
          const [validated] = validateIdentifiers([item]);
          if (!batch.some(identifier => identifierKey(identifier) === identifierKey(validated))) throw new HttpError(502, 'Scryfall reported an unrequested missing identifier.');
          return validated;
        });
        for (const card of returned) {
          if (!batch.some(identifier => matchesIdentifier(card, identifier))) { warnings.push('An unrequested or mismatched provider printing was excluded.'); continue; }
          cards.set(card.id, card);
        }
        for (const identifier of batch) {
          const matching = returned.filter(card => matchesIdentifier(card, identifier));
          if (matching.length > 1) throw new HttpError(502, 'Scryfall returned ambiguous printings for one exact identifier.');
          if (matching.length && providerMissing.some(missing => identifierKey(missing) === identifierKey(identifier))) throw new HttpError(502, 'Scryfall returned a contradictory found / not-found identifier.');
          if (!matching.length) notFound.push(identifier);
        }
      }
      return { cards: [...cards.values()], notFound, warnings };
    },
    async discover(query, identity, requestedPage = 1) {
      const page = validateDiscoveryPage(requestedPage);
      const allowedIdentity = validateIdentity(identity);
      const providerQuery = `${query} prefer:newest`;
      const start = (page - 1) * DISCOVERY_PAGE_SIZE;
      const firstProviderPage = Math.floor(start / PROVIDER_PAGE_SIZE) + 1;
      const getPage = async number => {
        const params = new URLSearchParams({ q: providerQuery, unique: 'cards', order: 'name', dir: 'asc', include_extras: 'false', page: String(number) });
        const pathname = `/cards/search?${params}`;
        const response = await request(pathname);
        if (response.object !== 'list' || !Array.isArray(response.data) || response.data.length > PROVIDER_PAGE_SIZE || !Number.isSafeInteger(response.total_cards) || response.total_cards < 0 || response.total_cards > MAX_DISCOVERY_PAGE * DISCOVERY_PAGE_SIZE || typeof response.has_more !== 'boolean') throw new HttpError(502, 'Scryfall search returned an unexpected schema.');
        if (response.data.length !== Math.max(0, Math.min(PROVIDER_PAGE_SIZE, response.total_cards - (number - 1) * PROVIDER_PAGE_SIZE)) || response.has_more !== (response.total_cards > number * PROVIDER_PAGE_SIZE)) throw new HttpError(502, 'Scryfall search pagination metadata did not match its records.');
        return response;
      };
      const first = await getPage(firstProviderPage);
      const totalCards = first.total_cards, totalPages = Math.ceil(totalCards / DISCOVERY_PAGE_SIZE);
      if (page > Math.max(1, totalPages)) throw new HttpError(400, 'This discovery page is beyond the matching cards. Return to the first page and search again.');
      const responses = [first];
      const end = Math.min(start + DISCOVERY_PAGE_SIZE, totalCards);
      if (end > firstProviderPage * PROVIDER_PAGE_SIZE) responses.push(await getPage(firstProviderPage + 1));
      const previous = searchTotals.get(providerQuery);
      if (responses.some(response => response.total_cards !== totalCards) || previous && previous.expires > Date.now() && previous.totalCards !== totalCards) {
        for (const pathname of cache.keys()) if (pathname.startsWith('/cards/search?') && new URL(pathname, 'https://api.scryfall.com').searchParams.get('q') === providerQuery) cache.delete(pathname);
        searchTotals.delete(providerQuery);
        throw new HttpError(409, 'Scryfall results changed while this page was loading. Search again to refresh the results.');
      }
      if (!previous || previous.expires <= Date.now()) {
        if (searchTotals.size >= 64) searchTotals.delete(searchTotals.keys().next().value);
        searchTotals.set(providerQuery, { totalCards, expires: Date.now() + cacheTtl });
      }
      const compatible = responses.flatMap(response => response.data).map(item => {
        let card;
        try { card = safeCard(item); } catch { return null; }
        if (card.legalities.commander !== 'legal' || !card.color_identity.every(c => allowedIdentity.includes(c))) return null;
        return card;
      });
      const { slots } = distinctDiscoverySlots(compatible);
      const offset = start % PROVIDER_PAGE_SIZE;
      const pageCandidates = compatible.slice(offset, offset + DISCOVERY_PAGE_SIZE);
      const cards = slots.slice(offset, offset + DISCOVERY_PAGE_SIZE).filter(Boolean);
      const skipped = pageCandidates.filter(card => !card).length;
      return {
        cards, totalCards, page, pageSize: DISCOVERY_PAGE_SIZE, totalPages,
        hasPrevious: page > 1, hasMore: page < totalPages,
        skipped, duplicatesCollapsed: pageCandidates.length - skipped - cards.length, pageCards: pageCandidates.length,
        compatibleOnPage: cards.length, displayedCards: cards.length,
        providerHasMore: responses.at(-1).has_more, providerQuery, unique: 'cards', printingPreference: 'newest',
        scryfallUrl: `https://scryfall.com/search?${new URLSearchParams({ q: providerQuery, unique: 'cards', order: 'name', dir: 'asc' })}`
      };
    }
  };
}

export function isUuid(value) { return typeof value === 'string' && UUID.test(value); }
