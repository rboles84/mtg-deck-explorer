// Authoring inputs for the versioned discovery registry. Never imported by the browser.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import vocabulary from '../public/mechanics-vocabulary.mjs';

export const read = p => JSON.parse(fs.readFileSync(new URL('../'+p, import.meta.url), 'utf8'));
export const sha = value => createHash('sha256').update(value).digest('hex');
export const baseline = read('inputs/atlas_v2.0.json');
export const audit = read('reports/mechanics-coverage/metadata-validation.json');
export {vocabulary};
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const native = s => `kw:${/^[A-Za-z]+$/.test(s)?s:JSON.stringify(s)}`;

// These are adjudicated aliases/partial relationships, never fuzzy matching.
export const historicalLinks = {
  Companion: ['alternate-name','partner-commanderzone-companion-cards'],
  Devoid: ['alternate-name','evasion-interaction-devoid-colourless-despite-coloured-mana'],
  Partner: ['alternate-name','partner-commanderzone-generic-partner-only-pairs-with-any-other-partner'],
  Escape: ['broader-only','role-library-self-recurring-creatures'],
  Eternalize: ['broader-only','role-library-self-recurring-creatures'],
  'Descend 4': ['broader-only','keyword-index-descend'],
  'Descend 8': ['broader-only','keyword-index-descend'],
  'Gear up': ['broader-only','keyword-index-gear-up-sponsored-by-wizards-of-the-coast'],
  Visit: ['broader-only','keyword-index-roll-to-visit-your-attractions'],
  'Gotcha!': ['alternate-name','keyword-index-gotcha'],
};
// Non-display candidates have no exact metadata witnesses. These deliberate text
// recipes describe actions/references/grants, not exact provider-label membership.
const candidateText = {
  Abandon: {query:'o:/\\babandon (this|that|a|the) scheme\\b/', positive:['Because I Have Willed It'], negative:['Reckless Abandon']},
  Absorb: {query:'o:/\\babsorb [0-9]+/', positive:['Lymph Sliver'], negative:['Absorb']},
  'Best in show': {query:'o:"best in show"', positive:['Blue Ribbon']},
  'Descend 4': {query:'o:/^descend 4 —/', positive:['Basking Capybara','Akawalli, the Seething Tower'], negative:['Bygone Marvels']},
  'Descend 8': {query:'o:/^descend 8 —/', positive:['Bygone Marvels','Akawalli, the Seething Tower'], negative:['Basking Capybara']},
  'Face a Villainous Choice': {query:'o:"villainous choice"', positive:['The Valeyard']},
  'Gear up': {query:'o:"Gear Up, sponsored by Wizards of the Coast"', positive:['Souvenir T-Shirt'], rowId:'keyword-index-gear-up-sponsored-by-wizards-of-the-coast'},
  'Gotcha!': {query:'o:/^gotcha —/', positive:['Cardpecker','Creature Guy'], rowId:'keyword-index-gotcha'},
  Harness: {query:'o:/: harness /', positive:['The Mind Stone','The Soul Stone'], negative:['Harness Infinity']},
  Planeswalk: {query:'o:/\\bplaneswalk\\b/', positive:['Path of the Animist','Path of the Enigma']},
  Poisonous: {query:'o:/\\bpoisonous [0-9]+/', positive:['Snake Cult Initiation','Virulent Sliver']},
  'Set in Motion': {query:'o:/\\bset (this scheme |a scheme |schemes |)in motion\\b/', positive:['All in Good Time']},
  'Space Sculptor': {query:'o:"space sculptor"', positive:['Space Beleren']},
  'The Ring Tempts You': {query:'o:"the Ring tempts you"', positive:['Aragorn, Company Leader','Bilbo, Retired Burglar']},
  Visit: {query:'o:/^visit —/', positive:['Balloon Stand'], negative:['"Lifetime" Pass Holder']},
  Vote: {query:'o:/\\b(vote|votes|voting)\\b/', positive:['Ballot Broker','Bite of the Black Rose']},
};
const specialNegatives = {
  Flying:['Hurricane','Odric, Lunarch Marshal'], Haste:['Lightning Greaves'], Reach:['Nightmare'],
  Shroud:['Lightning Greaves'], Escape:['Underworld Breach'], Eternalize:['The Scarab God'],
  Partner:['Adric, Mathematical Genius'],
  Devoid:['Kozilek, the Great Distortion'], Companion:['Adric, Mathematical Genius'],
};
export const specs = audit.results.map(result => {
  const display = vocabulary.labels.find(l=>l.key===result.term.toLowerCase());
  const exact = baseline.rows.filter(r=>r.label.toLowerCase()===result.term.toLowerCase());
  const indexRow = exact.find(r=>r.section==='Keyword_Index');
  const override = candidateText[result.term];
  const old = override?.rowId ? baseline.rows.find(r=>r.id===override.rowId) : indexRow;
  const rowId = old?.tier==='Do-not-emit'?`${old.id}-${display?'reported':'wording'}`:old?.id??`keyword-index-${slug(result.term)}`;
  const historical = exact.length ? {status:exact.some(r=>r.tier==='Production-ready')?'exact-production':exact.some(r=>r.tier==='Review')?'exact-review':'do-not-emit',rowIds:exact.map(r=>r.id)} : historicalLinks[result.term] ? {status:historicalLinks[result.term][0],rowIds:[historicalLinks[result.term][1]]} : {status:'missing',rowIds:[]};
  const category = display?.providerCategories?.length===1 ? display.providerCategories[0] : result.expected_catalogs[0];
  const group = {'keyword-abilities':'Keyword Ability','keyword-actions':'Keyword Action','ability-words':'Ability Word'}[category];
  if(!group)throw new Error(`Unclassified ${result.term}`);
  const qualifications={Partner:'Partner includes named and restricted variants in the provider index; these results are not a list of mutually compatible commanders. ',Companion:'A match does not establish that your deck satisfies its companion restriction. ',Devoid:'A colorless card can still have a colored identity; commander filtering uses identity. ',Underdog:'The verified witness is a playtest card that is not Commander-legal, so a Commander search may return zero cards. '};
  const coverage = display ? (qualifications[result.term]??'')+'Finds Scryfall-reported mechanic involvement using its keyword index. A match does not establish possession, a usable action, a particular face, or commander-pair eligibility. Grants and references without this reported label may be absent.' : 'Finds the stated Oracle wording, including actions, references or grants. Text coverage depends on current wording and is not proof that a card inherently has the ability. This candidate is outside the audited display vocabulary.';
  return {
    label:result.term,key:result.term.toLowerCase(),display:!!display,rowId,group,
    query:override?.query??native(result.term),
    tier:override||old?.tier==='Review'||result.term==='Underdog'?'Review':'Production-ready',
    relationship:display?'provider-reported-involvement':'oracle-wording',coverage,
    classification:{source:result.expected_catalogs,provider:result.listed_in_catalogs},
    historical,
    positive:override?.positive??[...result.examples.map(c=>c.name),...(result.term==='Partner'?['Pir, Imaginative Rascal']:[])],
    negative:[...new Set(['Island',...(override?(override.negative??[]):specialNegatives[result.term]??result.literal_text_examples.map(c=>c.name))])],
    oldFallback:old?.fallback??null,
  };
});
if(specs.length!==312||specs.filter(r=>r.display).length!==296)throw new Error('The pinned discovery scope changed; review required.');
