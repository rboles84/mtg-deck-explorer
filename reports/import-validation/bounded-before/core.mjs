import {parseDeckInput} from './deck-import.mjs';
import {normalizeCardName as cleanName, canonicalCollector, identifierKey, cardNames} from './import-model.mjs';
export {identifierKey} from './import-model.mjs';
/** Pure, immutable import and evidence helpers. No network or storage side effects. */
export const LEXICAL_RULES = Object.freeze({
  version: 'literal-language-v1',
  sourceType: 'Site-authored search/analysis rule',
  language: 'en',
  wordRule: 'literal.word.v1',
  phraseRule: 'literal.phrase.2-3.v1',
  minimumDistinctCards: 2,
  minimumIndependentPassages: 2,
  // A deliberately small, documented English function-word list; no lore lexicon.
  stopwords: Object.freeze('a an and are as at be been but by for from had has have he her him his i if in into is it its me my no not of on or our she so than that the their them there these they this to was we were what when which who will with you your'.split(' ')),
  // Exact literal suppression of common auxiliaries/quantifiers; not semantic classification.
  genericWords: Object.freeze('always anything something everything nothing one can could would should do does did any all some most more many much each every other only then also too just again very'.split(' ')),
});

export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const COLORS = ['W', 'U', 'B', 'R', 'G'];

function deckCounts(rows) {
  const playable = rows.filter(row => row.playable);
  const resolved = playable.filter(row => row.status === 'resolved');
  return {
    entries: rows.length,
    quantity: rows.reduce((n, row) => n + (Number.isSafeInteger(row.quantity) && row.quantity > 0 ? row.quantity : 0), 0),
    playableEntries: playable.length,
    playableQuantity: playable.reduce((n, row) => n + (Number.isSafeInteger(row.quantity) && row.quantity > 0 ? row.quantity : 0), 0),
    excludedEntries: rows.length - playable.length,
    excludedQuantity: rows.filter(row => !row.playable).reduce((n, row) => n + (Number.isSafeInteger(row.quantity) && row.quantity > 0 ? row.quantity : 0), 0),
    resolvedEntries: resolved.length,
    unresolvedEntries: playable.filter(row => row.status !== 'resolved').length,
    ambiguousEntries: playable.filter(row => row.status === 'ambiguous').length,
    printingUnknownEntries: playable.filter(row => row.status === 'printing-unknown').length,
    assumedEntries: resolved.filter(row => row.printingProvenance?.kind === 'assumed').length,
    suppliedEntries: resolved.filter(row => row.printingProvenance?.kind === 'supplied').length,
    chosenEntries: resolved.filter(row => row.printingProvenance?.kind === 'user-selected').length,
    distinctPrintings: new Set(resolved.map(row => row.card.id)).size,
    flavorAbsentEntries: resolved.filter(row => flavorParts(row.card).length === 0).length,
    exactPassages: resolved.filter(row => row.printingProvenance?.kind === 'supplied').reduce((n, row) => n + flavorParts(row.card).length, 0),
  };
}

export function parseDeck(text, options) {
  const parsed = parseDeckInput(text, options);
  return deepFreeze({...parsed, counts: deckCounts(parsed.rows)});
}

/** Change a reference edition while preserving the original imported source. */
export function selectReferencePrinting(deck, rowId, printingId) {
  if (typeof printingId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(printingId)) throw new Error('Enter a Scryfall printing UUID.');
  const target = deck.rows.find(row => row.id === rowId);
  if (!target || !['assumed', 'user-selected'].includes(target.printingProvenance?.kind)) throw new Error('Only reference editions can be changed here. Supplied coordinates must be corrected in your source list.');
  if(!target.card?.oracle_id)throw new Error('The existing edition has no Oracle identity; a replacement cannot be verified.');
  const rows = deck.rows.map(row => row.id !== rowId ? row : {...row, identifier: {id:printingId.toLowerCase()}, lookup:{kind:'printing-id',id:printingId.toLowerCase()}, selectionOverride:printingId.toLowerCase(), selectionOracleId:target.card.oracle_id, status:'pending',card:null,issues:[],printingProvenance:null});
  return deepFreeze({...deck,rows,identifiers:[...new Map(rows.filter(row=>row.identifier).map(row=>[identifierKey(row.identifier),row.identifier])).values()],counts:deckCounts(rows)});
}

// Keep parsing available for fragments and diagnostics; enforce construction at import.
export function validateCommanderImport(parsed) {
  const issues = [...parsed.issues];
  if (parsed.counts.playableQuantity !== 100) issues.push(`Deck + Commander contains ${parsed.counts.playableQuantity} cards; exactly 100 are required (including commanders). Extras are counted separately: ${parsed.counts.excludedQuantity} cards.`);
  const invalid = parsed.rows.filter(row => row.parseIssues.length);
  const commanders=parsed.rows.filter(row=>row.section==='Commander');
  if(commanders.length>2)issues.push('This app supports one or two commander entries. Review your Commander section.');
  if(commanders.some(row=>row.quantity!==1))issues.push('Each commander entry must have quantity 1.');
  const identities=commanders.filter(row=>row.card).map(row=>row.card.oracle_id||cleanName(row.card.name));
  if(new Set(identities).size!==identities.length)issues.push('Commander entries resolve to the same card identity. Keep one commander entry for that card.');
  if (parsed.rows.some(row => !Number.isSafeInteger(row.quantity) || row.quantity < 1 || row.quantity > 999)) issues.unshift('Card total is incomplete because one or more quantities are invalid.');
  if (invalid.length) {
    issues.push(`${invalid.length} invalid import ${invalid.length === 1 ? 'line' : 'lines'}. Correct the following before importing:`);
    for (const row of invalid.slice(0, 5)) issues.push(`Line ${row.lineNumber}: ${row.issues.join(' ')} Source: ${row.originalLine.slice(0, 160)}`);
    if (invalid.length > 5) issues.push(`And ${invalid.length - 5} more invalid lines.`);
  }
  return deepFreeze({ valid: issues.length === 0, issues });
}

function flavorParts(card) {
  const parts = [];
  if (typeof card?.flavor_text === 'string' && card.flavor_text.length) parts.push({ text: card.flavor_text, faceName: card.name, faceIndex: null });
  for (const [index, face] of (card?.card_faces || []).entries()) {
    if (typeof face.flavor_text === 'string' && face.flavor_text.length) parts.push({ text: face.flavor_text, faceName: face.name || card.name, faceIndex: index });
  }
  return parts;
}

export function resolveDeck(parsed, cards, notFound = [], outcomes = [], resolution = parsed.resolution || null) {
  if (!Array.isArray(cards) || !Array.isArray(notFound)) throw new TypeError('Resolution requires card and not-found arrays.');
  const byId = new Map(), byPrinting = new Map(), byName = new Map();
  for (const original of cards) {
    if (!original || typeof original.id !== 'string') continue;
    const card = structuredClone(original);
    const idKey = identifierKey({ id: card.id });
    const printKey = identifierKey({ set: card.set, collector_number: card.collector_number });
    for (const [map, key] of [[byId, idKey], [byPrinting, printKey], ...cardNames(card).map(name => [byName, identifierKey({name})])]) {
      if (!key) continue;
      const items = map.get(key) || [];
      if (!items.some(item => item.id === card.id)) items.push(card);
      map.set(key, items);
    }
  }
  const missing = new Set(notFound.map(identifierKey));
  const rows = parsed.rows.map(original => {
    const row = { ...original, card: null, printingProvenance: null, returnedPrinting: null, issues: [...(original.parseIssues || original.issues)] };
    if (!row.identifier) return row;
    const key = identifierKey(row.identifier);
    let matches = (row.identifier.name ? byName : row.identifier.id ? byId : byPrinting).get(key) || [];
    const outcome = outcomes.find(item => item.lookupKey === key);
    if (outcome?.status === 'ambiguous') { row.status = 'ambiguous'; row.issues.push('The name matches more than one card identity; supply an exact printing.'); return row; }
    if (outcome) matches = outcome.status === 'matched' ? matches.filter(card => card.id === outcome.cardId) : [];
    if (!matches.length) {
      row.status = 'unresolved';
      row.issues.push(row.identifier.name ? `Card name not found: ${row.name}. Check spelling or supply printing coordinates.` : missing.has(key) ? 'Scryfall reported this exact printing not found.' : 'The response did not contain the requested exact printing.');
    } else if (matches.length > 1) {
      row.status = 'ambiguous'; row.issues.push('More than one returned printing matched these coordinates; choose a printing UUID.');
    } else {
      const card = matches[0];
      const mismatch = [];
      if (row.scryfallId && row.scryfallId !== card.id.toLowerCase()) mismatch.push('printing UUID');
      if (row.set && row.set !== String(card.set).toLowerCase()) mismatch.push('set');
      if (row.collectorNumber && canonicalCollector(row.collectorNumber) !== canonicalCollector(card.collector_number)) mismatch.push('collector number');
      const names = cardNames(card);
      if(row.selectionOverride){if(!row.selectionOracleId||card.oracle_id!==row.selectionOracleId)mismatch.push('card Oracle identity');}
      else if (!names.includes(cleanName(row.name))) mismatch.push('supplied name');
      if (row.language !== null && row.language !== card.lang) mismatch.push('language');
      if (mismatch.length) {
        row.status = 'mismatch'; row.issues.push(`Returned printing disagrees with ${mismatch.join(', ')}; no flavor or mechanic evidence is attributed to this entry.`);
        row.returnedPrinting = { id: card.id, name: card.name, set: card.set, collectorNumber: card.collector_number, language: card.lang };
      } else {
        row.status = 'resolved'; row.card = card;
        row.printingProvenance = row.selectionOverride ? {kind:'user-selected'} : row.identifier.name ? {kind: 'assumed', policy: 'scryfall-collection-reference-v1'} : {kind: 'supplied'};
        if (row.finish !== 'unspecified' && Array.isArray(card.finishes) && !card.finishes.includes(row.finish)) row.issues.push(`Requested ${row.finish} finish is not reported for this edition; finish remains unverified.`);
      }
    }
    return row;
  });
  return deepFreeze({ ...parsed, rows, counts: deckCounts(rows), notFound: structuredClone(notFound), resolution });
}

export function commanderContext(deck, selectedRowIds) {
  const requested = selectedRowIds === undefined ? deck.rows.filter(row => row.section === 'Commander').map(row => row.id) : selectedRowIds;
  const selected = deck.rows.filter(row => requested.includes(row.id));
  const commanders = selected.filter(row => row.playable && row.status === 'resolved' && Array.isArray(row.card.color_identity) && row.card.color_identity.every(color => COLORS.includes(color)));
  const issues = [];
  if (!selected.length) issues.push('Select a resolved commander to establish color identity. Deck colors are never used to infer it.');
  if (commanders.length !== selected.length) issues.push('One or more selected commanders is unresolved or has no usable color identity.');
  const known = commanders.length > 0 && commanders.length === selected.length;
  const colorIdentity = known ? COLORS.filter(color => commanders.some(row => row.card.color_identity.includes(color))) : null;
  const code = colorIdentity ? colorIdentity.join('') : null;
  const provisional = commanders.length > 1;
  if (provisional) issues.push('Multiple commanders: provisional union; pair eligibility is unverified.');
  const resolved = deck.rows.filter(row => row.playable && row.status === 'resolved');
  const labels = { '': 'Colorless', W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', WU: 'Azorius' };
  return deepFreeze({ rowIds: commanders.map(row => row.id), colorIdentity, code, label: code === null ? 'Commander not selected' : (labels[code] || code), provisional, issues,
    offIdentityRowIds: known ? resolved.filter(row => Array.isArray(row.card.color_identity) && row.card.color_identity.some(color => !colorIdentity.includes(color))).map(row => row.id) : [],
    nonLegalRowIds: resolved.filter(row => row.card.legalities?.commander && row.card.legalities.commander !== 'legal').map(row => row.id),
  });
}

export function extractPassages(deck) {
  return deepFreeze(deck.rows.filter(row => row.playable && row.status === 'resolved').flatMap(row => flavorParts(row.card).map(part => ({
    id: `${row.id}:${part.faceIndex === null ? 'card' : `face-${part.faceIndex}`}`,
    rowId: row.id, printingId: row.card.id, cardIdentity: row.card.oracle_id || `name:${cleanName(row.card.name)}`,
    name: row.card.name, faceName: part.faceName, faceIndex: part.faceIndex, text: part.text,
    language: row.card.lang, quantity: row.quantity, set: row.card.set, collectorNumber: row.card.collector_number,
    printingProvenance: row.printingProvenance,
    scryfallUri: row.card.scryfall_uri || null, sourceType: row.card.synthetic ? 'Synthetic fixture — not Scryfall data' : 'Scryfall card data',
  }))));
}

export function analyzeFlavor(deck) {
  const passages = extractPassages(deck);
  const eligible = passages.filter(passage => passage.language === 'en');
  const stopwords = new Set([...LEXICAL_RULES.stopwords, ...LEXICAL_RULES.genericWords]);
  const groups = new Map();
  for (const passage of eligible) {
    const tokens = [...passage.text.matchAll(/[\p{L}\p{N}_][\p{L}\p{N}\p{M}_'’]*/gu)].map(match => ({ text: match[0].normalize('NFKC').toLowerCase().replace(/’/g, "'"), start: match.index, end: match.index + match[0].length }));
    const meaningful = token => token.text.length >= 3 && /^[\p{L}\p{M}'’]+$/u.test(token.text) && !stopwords.has(token.text);
    const independentKey = passage.text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
    const add = (term, kind, start, end) => {
      const key = `${kind}:${term}`;
      const group = groups.get(key) || { id: key, term, kind, ruleId: kind === 'word' ? LEXICAL_RULES.wordRule : LEXICAL_RULES.phraseRule, evidence: [] };
      group.evidence.push({ passageId: passage.id, rowId: passage.rowId, printingId: passage.printingId, cardIdentity: passage.cardIdentity, name: passage.name, faceName: passage.faceName, faceIndex: passage.faceIndex, start, end, matchedText: passage.text.slice(start, end), text: passage.text, quantity: passage.quantity, independentKey });
      groups.set(key, group);
    };
    tokens.forEach((token, index) => {
      if (meaningful(token)) add(token.text, 'word', token.start, token.end);
      for (const size of [2, 3]) {
        const phrase = tokens.slice(index, index + size);
        if (phrase.length !== size || phrase.filter(meaningful).length < 2) continue;
        if (phrase.slice(1).some((item, offset) => !/^\s+$/.test(passage.text.slice(phrase[offset].end, item.start)))) continue;
        add(phrase.map(item => item.text).join(' '), 'phrase', phrase[0].start, phrase.at(-1).end);
      }
    });
  }
  const observations = [...groups.values()].map(group => {
    const rowQuantities = new Map(group.evidence.map(item => [item.rowId, item.quantity]));
    return { ...group, distinctCards: new Set(group.evidence.map(item => item.cardIdentity)).size, independentPassages: new Set(group.evidence.map(item => item.independentKey)).size,
      distinctPrintings: new Set(group.evidence.map(item => item.printingId)).size, rawHits: group.evidence.length, physicalCopies: [...rowQuantities.values()].reduce((sum, quantity) => sum + quantity, 0),
      evidence: group.evidence.map(({ independentKey, ...item }) => ({ ...item, ruleId: group.ruleId })),
    };
  }).filter(group => group.distinctCards >= LEXICAL_RULES.minimumDistinctCards && group.independentPassages >= LEXICAL_RULES.minimumIndependentPassages)
    .sort((a, b) => b.distinctCards - a.distinctCards || b.independentPassages - a.independentPassages || b.rawHits - a.rawHits || a.term.localeCompare(b.term, 'en') || a.kind.localeCompare(b.kind, 'en'));
  const leadingWords = observations.filter(item => item.kind === 'word').slice(0, 3);
  const abstained = leadingWords.length === 0;
  const assumedPassages = passages.filter(passage => passage.printingProvenance?.kind === 'assumed').length;
  const chosenPassages = passages.filter(passage => passage.printingProvenance?.kind === 'user-selected').length;
  const coverage = `${assumedPassages} passages use assumed printings; ${passages.length - assumedPassages - chosenPassages} use supplied editions; ${chosenPassages} use user-selected editions.`;
  const summary = (abstained ? 'Not enough distinct repeated language for a reliable summary.' : `Of ${eligible.length} English flavor passages, the recurring literal terms are ${leadingWords.map(item => `“${item.term}” (${item.distinctCards} distinct cards)`).join(', ')}.`) + ` ${coverage}`;
  return deepFreeze({ passages, observations, summary, abstained, rules: LEXICAL_RULES, counts: {
    exactPassages: passages.length - assumedPassages - chosenPassages, assumedPassages, chosenPassages, englishPassages: eligible.length, excludedLanguagePassages: passages.length - eligible.length,
    independentPassages: new Set(eligible.map(passage => passage.text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim())).size,
    distinctCards: new Set(eligible.map(passage => passage.cardIdentity)).size,
  } });
}

export function detectMechanics(deck, catalog) {
  const records = Array.isArray(catalog) ? catalog : (catalog?.records || []);
  const found = [];
  const seenNames = new Set();
  for (const record of records) {
    const key = cleanName(record.master_name);
    if (!key || seenNames.has(key) || record.master_category !== 'keyword_ability') continue;
    seenNames.add(key);
    const evidence = deck.rows.filter(row => row.playable && row.status === 'resolved').flatMap(row => {
      const reported = (row.card.keywords || []).filter(keyword => cleanName(keyword) === key);
      if (!reported.length) return [];
      return [{ rowId: row.id, printingId: row.card.id, name: row.card.name, keyword: reported[0], keywords: [...row.card.keywords], oracleText: row.card.oracle_text || null,
        faceOracleText: (row.card.card_faces || []).map(face => ({ name: face.name, oracleText: face.oracle_text || '' })),
        faceName: null, method: 'Detected via Scryfall keywords', qualification: 'Record-level keyword evidence; this may describe a granted ability. Inherent possession and a specific face are not inferred.',
      }];
    });
    if (evidence.length) found.push({ master_name: record.master_name, atlas_row_id: record.atlas_row_id, sourceType: 'Computed from imported cards', method: 'Detected via Scryfall keywords', evidence, distinctCards: new Set(evidence.map(item => deck.rows.find(row => row.id === item.rowId).card.oracle_id || cleanName(item.name))).size });
  }
  return deepFreeze(found);
}
