// Exact labels reviewed from the Commander shortlist. This supplements, rather
// than rewrites, the historical 296-label provider audit. No text detection.
import {deepFreeze} from './core.mjs';

export const FLAVOR_LABELS = Object.freeze([
  'Buy Information', 'Hire a Mercenary', 'Sell Contraband', 'Two-Headed Coin',
  'Warp Vortex', 'Berzerker', 'Death Ray', 'Disintegration Ray',
  'Mark of Chaos Ascendant', 'Mold Earth', "Scions' Secretary",
  'Sigil of Corruption', 'The Betrayer', 'Web Support', 'Wild Card',
]);
const groups = {
  'keyword action': ['Double', 'Regenerate', 'Triple'],
  'keyword ability variant': ['Partner with', 'Choose a background', 'Megamorph',
    'Forestwalk', 'Hexproof from', 'Islandwalk', 'Landcycling', 'Plainscycling', 'Typecycling'],
  'token and subtype concept': ['Treasure', 'Food', 'Role token'],
  designation: ['Prepared'],
  'flavor word': FLAVOR_LABELS,
  // Scryfall also reports Jump on Direct Current (Jump-start). The official
  // Cid citation verifies a card-specific use, not this label universally.
  'provider-reported term': ['Jump'],
};
export const SHORTLIST_LABELS = deepFreeze(Object.entries(groups).flatMap(([category, labels]) =>
  labels.map(term => ({key:term.toLowerCase(),term,category,review:'commander-shortlist-2026-10-18',
    discovery:category==='flavor word'||term==='Jump'?'card-specific':'reviewed-search'}))));

export const SHORTLIST_REVIEW = Object.freeze({version:'commander-shortlist-2026-10-18',evidenceSha256:'bf8370bc69ba8ea1ea01cbf7a2976ab928f16755bdda33fd53d2cc4e34b76dad'});
