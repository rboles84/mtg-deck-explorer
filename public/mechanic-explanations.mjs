import {FLAVOR_LABELS} from './mechanic-supplement.mjs';
import {deepFreeze} from './core.mjs';
import {ADDITIONAL_EXPLANATIONS} from './mechanic-reference-supplement.mjs';
import {VARIANT_EXPLANATIONS} from './mechanic-variants.mjs';

// Excerpts only: never paraphrase or fill gaps. Article excerpts are verbatim,
// at most 25 words per source, and checked in reports/mechanic-sourcing/verification.json.
// Numbered rules are rendered directly from the independently pinned CR data.
const officialSource = (title, path, section) => ({
  title, url: `https://magic.wizards.com/en/news/${path}`, section, verifiedOn: '2026-10-18',
});
const gathererSource = (card, path) => ({
  title: 'Gatherer', url: `https://gatherer.wizards.com/${path}`, section: card, verifiedOn: '2026-10-18',
});
const article = (title, quote, source) => [title.toLowerCase(), {
  title, quote, source, rules: ['207.2c'], verification: 'verified',
}];
const rule = (title, rules) => [title.toLowerCase(), {title, rules, verification: 'verified'}];

// Existing Devoid search help, replaced with exact excerpts from the same CR.
// This does not add a mechanic, detection rule, or discovery recipe.
export const DEVOID_SEARCH_REFERENCE = deepFreeze({
  sourceUrl: 'https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt',
  excerpts: [
    {number: '702.114a', text: '“Devoid” means “This object is colorless.”'},
    {number: '903.4', text: 'The color identity of a card is the color or colors of any mana symbols in that card’s mana cost or rules text, plus any colors defined by its characteristic-defining abilities (see rule 604.3) or color indicator (see rule 204).'},
  ],
});

const flavorSources = {
  'Buy Information': gathererSource('Black Market Connections', 'CLB/en-us/669/black-market-connections'),
  'Hire a Mercenary': gathererSource('Black Market Connections', 'CLB/en-us/669/black-market-connections'),
  'Sell Contraband': gathererSource('Black Market Connections', 'CLB/en-us/669/black-market-connections'),
  'Death Ray': gathererSource('Ghastly Death Tyrant', 'CLB/en-us/127/ghastly-death-tyrant'),
  'Disintegration Ray': gathererSource('Ghastly Death Tyrant', 'CLB/en-us/127/ghastly-death-tyrant'),
  'Mold Earth': gathererSource('Deep Gnome Terramancer', 'CLB/en-us/658/deep-gnome-terramancer'),
  'Mark of Chaos Ascendant': gathererSource('Abaddon the Despoiler', '40K/en-us/171/abaddon-the-despoiler'),
  'Web Support': gathererSource('Guy in the Chair', 'SPM/en-us/102/guy-in-the-chair'),
  'Eternity Gate': gathererSource('Necron Monolith', '40K/en-us/161/necron-monolith'),
  'Two-Headed Coin': officialSource('Magic: The Gathering—FINAL FANTASY Release Notes', 'feature/final-fantasy-release-notes', 'Edgar, King of Figaro'),
  'Jump': officialSource('Magic: The Gathering—FINAL FANTASY Release Notes', 'feature/final-fantasy-release-notes', 'Cid, Freeflier Pilot'),
  "Scions' Secretary": officialSource('Magic: The Gathering—FINAL FANTASY Release Notes', 'feature/final-fantasy-release-notes', 'Tataru Taru'),
  'Warp Vortex': officialSource('Warhammer 40,000 Commander Release Notes', 'feature/warhammer-40000-commander-release-notes-2022-09-19', 'Mutalith Vortex Beast'),
  'Berzerker': officialSource('Warhammer 40,000 Commander Release Notes', 'feature/warhammer-40000-commander-release-notes-2022-09-19', 'Khârn the Betrayer'),
  'Sigil of Corruption': officialSource('Warhammer 40,000 Commander Release Notes', 'feature/warhammer-40000-commander-release-notes-2022-09-19', 'Khârn the Betrayer'),
  'The Betrayer': officialSource('Warhammer 40,000 Commander Release Notes', 'feature/warhammer-40000-commander-release-notes-2022-09-19', 'Khârn the Betrayer'),
  'Wild Card': officialSource('Magic: The Gathering—Fallout Release Notes', 'feature/magic-the-gathering-fallout-release-notes', 'Yes Man, Personal Securitron'),
};

export const MECHANIC_EXPLANATIONS = deepFreeze(Object.fromEntries([
  article('Adamant', 'To wit, new adamant cards include bonuses if you spend at least three of a particular color of mana to cast them.',
    officialSource('Throne of Eldraine Mechanics', 'feature/throne-eldraine-mechanics-2019-09-04', 'Adamant')),
  article('Alliance', 'Alliance is an ability word that highlights triggered abilities that trigger whenever another creature enters the battlefield under your control.',
    officialSource('Streets of New Capenna Mechanics', 'feature/streets-of-new-capenna-mechanics-2022-04-07', 'Alliance')),
  article('Channel', 'Each channel ability allows you to discard the card with the ability from your hand for an effect.',
    officialSource('Kamigawa: Neon Dynasty Mechanics', 'feature/kamigawa-neon-dynasty-mechanics-2022-01-27', 'Channel')),
  article('Corrupted', 'Corrupted is a new ability word that highlights abilities that care whether an opponent has three or more poison counters.',
    officialSource('MTG Arena Release Notes – Phyrexia: All Will Be One', 'mtg-arena/mtg-arena-release-notes-phyrexia-all-will-be-one', 'Corrupted')),
  article('Delirium', 'Delirium is a new ability word that highlights cards that get better if you have four or more card types represented in your graveyard.',
    officialSource('Shadows over Innistrad Mechanics', 'feature/shadows-over-innistrad-mechanics', 'Delirium')),
  article('Enrage', 'Their signature mechanic is enrage, an ability word that encompasses abilities that trigger whenever the Dinosaurs with them are dealt damage.',
    officialSource('Ixalan Mechanics', 'feature/ixalan-mechanics', 'The Sun Empire (And Their Enraged Dinosaurs!)')),
  article('Imprint', 'Imprint is an ability word denoting an ability that exiles one or more cards.',
    officialSource('Scars of Mirrodin Mechanics', 'feature/scars-of-mirrodin-mechanics', 'Imprint')),
  article('Landfall', 'Landfall is an ability word found on abilities that trigger whenever a land enters the battlefield under your control.',
    officialSource('Zendikar Rising Mechanics', 'feature/zendikar-rising-mechanics-2020-09-01', 'Landfall')),
  article('Lieutenant', 'Lieutenant is an ability word that appears in italics on a cycle of creatures that become more powerful if you control your commander.',
    officialSource('Commander (2014 Edition) Release Notes', 'feature/release-notes-2014-11-10', 'New Ability Word: Lieutenant')),
  article('Magecraft', 'Magecraft is a new ability word that highlights abilities that reward you for casting or copying instant and sorcery spells.',
    officialSource('Strixhaven: School of Mages and Commander (2021 Edition) Release Notes', 'feature/strixhaven-school-mages-and-commander-2021-edition-release-notes-2021-04-16', 'New Ability Word: Magecraft')),
  article('Metalcraft', 'The returning ability word metalcraft gives you a bonus for controlling three or more artifacts.',
    officialSource('Mirrodin Besieged Mechanics', 'feature/mirrodin-besieged-mechanics', 'Metalcraft')),
  article('Morbid', 'The morbid ability word indicates an ability that checks whether a creature died this turn.',
    officialSource('Innistrad Mechanics', 'feature/innistrad-mechanics', 'Morbid')),
  article('Paradox', "Paradox is an ability word that's used to highlight abilities that care about casting spells from anywhere other than your hand.",
    officialSource('Magic: The Gathering – Doctor Who Mechanics', 'feature/magic-the-gathering-doctor-who-mechanics', 'Paradox')),
  article('Parley', 'Parley abilities instruct each player to reveal the top card of his or her library.',
    officialSource('Magic: The Gathering–Conspiracy Mechanics', 'feature/conspiracy-mechanics', 'Parley')),
  article('Vivid', 'Vivid is an ability word that highlights abilities that care in some way about the number of colors among permanents you control.',
    officialSource('Lorwyn Eclipsed Mechanics', 'feature/lorwyn-eclipsed-mechanics', 'Vivid')),
  // CR 207.2d explains flavor words as a class; it does not verify these names.
  // An official card citation verifies only the named card, not every Scryfall use.
  ...[...FLAVOR_LABELS, 'Eternity Gate'].map(title => [title.toLowerCase(), {
    title, rules: ['207.2d'], generalReference: true,
    verification: flavorSources[title] ? 'verified' : 'unverified',
    ...(flavorSources[title] ? {source: flavorSources[title]} : {}),
  }]),
  ['jump', {title:'Jump', rules:[], referenceKind:'card-example', verification:'verified',
    cardOracleIds:['d3bdfb25-dfb2-4df4-b502-ef0909a39f86'],
    source:{...flavorSources.Jump,kind:'card-example'}}],
  rule('Food', ['111.10b','111.10','205.3g']),
  rule('Treasure', ['111.10a','111.10','205.3g']),
  rule('Role token', ['111.10j','111.10k','111.10m','111.10n','111.10p','111.10q','111.10r','303.7a']),
  rule('Prepared', ['722.3a','722.3b','722.3c','601.2f']),
  rule('Partner with', ['702.124j','702.124f']),
  rule('Choose a background', ['702.124k','702.124f']),
  rule('Megamorph', ['702.37b','702.37e']),
  rule('Hexproof from', ['702.11d','702.11e','702.11f','702.11g']),
  rule('Forestwalk', ['702.14a','702.14b','702.14c']),
  rule('Islandwalk', ['702.14a','702.14b','702.14c']),
  rule('Typecycling', ['702.29e']),
  rule('Landcycling', ['702.29e']),
  rule('Plainscycling', ['702.29e']),
  ...Object.entries(ADDITIONAL_EXPLANATIONS),
  ...Object.entries(VARIANT_EXPLANATIONS),
]));
