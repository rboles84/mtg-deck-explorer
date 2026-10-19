import {resolveDeck, resolveExtras, validateCommanderImport} from './core.mjs';
import {identifierKey} from './import-model.mjs';

export async function resolveImport(parsed, request, isCurrent = () => true) {
  const identifiers = [...new Map(parsed.rows.filter(row => row.playable && row.identifier).map(row => [identifierKey(row.identifier),row.identifier])).values()];
  const main = await request('/api/resolve', {identifiers});
  if (!isCurrent()) return null;
  let deck = resolveDeck(parsed, main.cards, main.notFound, main.outcomes, {resolvedAt:main.resolvedAt || null,policy:'scryfall-collection-reference-v1'});
  const warnings = [...(main.warnings || [])];
  if (deck.rows.some(row => row.playable && row.status !== 'resolved') || !validateCommanderImport(deck).valid) {
    deck = resolveExtras(deck, {cards:[],outcomes:parsed.rows.filter(row=>!row.playable && row.identifier).map(row=>({lookupKey:identifierKey(row.identifier),status:'deferred'}))});
    return {deck, contextToken:main.contextToken, warnings};
  }
  const mainKeys = new Set(identifiers.map(identifierKey));
  const extraIdentifiers = [...new Map(parsed.rows.filter(row => !row.playable && row.identifier && !mainKeys.has(identifierKey(row.identifier))).map(row => [identifierKey(row.identifier),row.identifier])).values()];
  if (extraIdentifiers.length) {
    let extra;
    try { extra = await request('/api/resolve', {identifiers:extraIdentifiers}); }
    catch (error) {
      extra = {cards:[], notFound:[], outcomes:extraIdentifiers.map(identifier => ({lookupKey:identifierKey(identifier),status:'failed',error:error.message}))};
    }
    if (!isCurrent()) return null;
    // Main outcomes win when the same identifier appears on both boards. Pin
    // required rows even if a provider returns another edition for an extra.
    deck = resolveExtras(deck, {cards:[...main.cards,...extra.cards],notFound:[...(main.notFound || []),...(extra.notFound || [])],outcomes:[...(main.outcomes || []),...(extra.outcomes || [])]});
    warnings.push(...(extra.warnings || []));
  }
  return {deck, contextToken:main.contextToken, warnings};
}
