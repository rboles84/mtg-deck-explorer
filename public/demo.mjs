import { parseDeck, resolveDeck, deepFreeze } from './core.mjs';

// Authored fixture prose and invented cards. No real Magic printing or flavor claims.
export const DEMO_TEXT = `Commander
1 Synthetic Lantern Keeper (DEMO) 001

Deck
1 Synthetic River Map (DEMO) 002
2 Synthetic Brass Heron (DEMO) 003
1 Synthetic Blank Tablet (DEMO) 004
1 Synthetic Dawn // Synthetic Dusk (DEMO) 005
1 Synthetic Uncatalogued Leaf

Considering
1 Synthetic Margin Note (DEMO) 006`;

const card = (number, name, extra = {}) => ({
  id: `synthetic-printing-${number}`, oracle_id: `synthetic-card-${number}`, synthetic: true,
  name, set: 'demo', collector_number: number, lang: 'en', color_identity: ['W', 'U'],
  legalities: { commander: 'legal' }, keywords: [], scryfall_uri: null, ...extra,
});

export const DEMO_CARDS = deepFreeze([
  card('001', 'Synthetic Lantern Keeper', { flavor_text: 'Beyond the silent river, a lantern waits for dawn.', keywords: ['Vigilance'], oracle_text: 'Vigilance' }),
  card('002', 'Synthetic River Map', { flavor_text: 'We followed the silent river until the brass bells answered.' }),
  card('003', 'Synthetic Brass Heron', { flavor_text: 'A brass wing catches dawn above the river.', keywords: ['Flying'], oracle_text: 'Flying' }),
  card('004', 'Synthetic Blank Tablet', { color_identity: [] }),
  card('005', 'Synthetic Dawn // Synthetic Dusk', { card_faces: [
    { name: 'Synthetic Dawn', flavor_text: 'At dawn the lantern casts a narrow circle.', oracle_text: '' },
    { name: 'Synthetic Dusk', flavor_text: 'The bells settle into silence.', oracle_text: '' },
  ] }),
  card('006', 'Synthetic Margin Note', { flavor_text: 'This excluded margin never enters the archive.' }),
]);

export const createDemoDeck = () => deepFreeze({ ...resolveDeck(parseDeck(DEMO_TEXT), DEMO_CARDS), synthetic: true });
