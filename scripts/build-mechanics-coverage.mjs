// Offline matrix, enriched by a separately captured and audited Scryfall snapshot.
// Does not modify application/source data or make network/model calls.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'reports', 'mechanics-coverage');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourcePaths = ['inputs/mechanical-color-pie.runtime.json', 'inputs/mtg-mechanics-master-list.md', 'inputs/MECHANICS-CONTRACT.md'];
const sourceBytes = await Promise.all(sourcePaths.map(p => readFile(path.join(root, p))));
const sources = sourcePaths.map((p, i) => ({ path: p, sha256: hash(sourceBytes[i]), bytes: sourceBytes[i].length }));
const audit = JSON.parse(await readFile(path.join(root, 'evidence/source-audit.json'), 'utf8'));
for (const source of sources) {
  const original = audit.originalFiles.find(s => s.path === source.path);
  assert.ok(original, `Missing baseline: ${source.path}`);
  assert.equal(source.sha256, original.sha256, `Frozen source changed: ${source.path}`);
}
const runtime = JSON.parse(sourceBytes[0]);
const master = sourceBytes[1].toString('utf8');
const crosswalkBytes = await readFile(path.join(root, 'lib', 'data', 'crosswalk.json'));
const crosswalk = JSON.parse(crosswalkBytes);
const existing = new Set(crosswalk.records.map(r => r.master_name));
assert.equal(existing.size, 8);

const categories = new Map([
  ['Keyword abilities', 'keyword_ability'], ['Keyword actions', 'keyword_action'],
  ['Ability words', 'ability_word'], ['Acorn ability words', 'acorn_ability_word'],
  ['Additional rules concepts', 'additional_rules_concept'], ['Digital-only mechanics', 'digital_only_mechanic'],
  ['Miscellaneous mechanics', 'miscellaneous_mechanic'], ['Acorn mechanics', 'acorn_mechanic'],
  ['Playtest mechanics', 'playtest_mechanic'], ['Unreleased mechanics', 'unreleased_mechanic'],
  ['Former mechanics', 'former_mechanic'],
]);
const rows = [], variantNotes = [];
let category = null, subsection = null;
for (const [i, line] of master.split(/\r?\n/).entries()) {
  if (/^#{1,3} /.test(line)) {
    const title = line.startsWith('## ') ? line.slice(3).split(' —')[0] : '';
    category = categories.get(title) ?? null;
    subsection = /^### Keyword/.test(line) ? line.slice(4) : null;
  } else if (line.startsWith('- ') && category) {
    const [raw, reference] = line.slice(2).split(' — ');
    rows.push({ id: `master:${category}:${String(i + 1)}`, source: 'master', source_path: sourcePaths[1], source_line: i + 1,
      name: raw.replace(/^\*|\*$/g, ''), category, reference: reference ?? null });
  } else if (line.startsWith('- ') && subsection) {
    variantNotes.push({ section: subsection, source_line: i + 1, text: line.slice(2) });
  }
}
assert.equal(rows.filter(r => r.category !== 'playtest_mechanic').length, 524);
assert.equal(rows.filter(r => r.category === 'playtest_mechanic').length, 3);
assert.equal(Object.keys(runtime.byMechanic).length, 216);
for (const [key, value] of Object.entries(runtime.byMechanic)) rows.push({
  id: `color-pie:${key}`, source: 'color-pie', source_path: sourcePaths[0], source_key: key,
  name: value.label, category: value.family, reference: 'Mechanical Color Pie 2021',
  source_aliases: value.source_aliases, family_secondary: value.families_secondary, source_explanation: value.explanation,
});

// These are proposed detection specifications, not implemented recognizers.
// The dictionary is deliberately separate from frozen taxonomy and color assignments.
const profiles = {
  direct: ['keywords[]', 'Exact membership in a pinned provider keyword list. Preserve the returned string. Claim only provider-reported involvement; no possession, face, parameter, or completeness claim.', 'Require real provider fixtures for the label; test empty/missing keywords, case normalization, duplicate printings and card faces.'],
  family_alias: ['keywords[]; oracle_text; card_faces[].oracle_text', 'Use an explicitly reviewed variant/alias table; preserve variant and parameter. Do not derive aliases by fuzzy matching or punctuation stripping.', 'Positive and negative fixtures for each approved variant; distinguish shared family names from unrelated same-name entries.'],
  action: ['oracle_text; card_faces[].oracle_text', 'Parse the named action in an executable clause. Preserve actor, object, cost/effect role, conditions, quantities and zones. A word in a prohibition, trigger condition or reminder is a separate relationship.', 'Test performs / triggers on / prohibits / replaces / pays-as-cost / reminder-only uses; do not count all word occurrences as actions.'],
  stat_modification: ['oracle_text; type_line; card_faces[]', 'Parse signed power/toughness changes; preserve source type, affected objects, duration, one-shot versus ongoing and the exact source-label qualifiers.', 'Test each sign combination, team versus single targets, Auras versus spells/creatures, duration and counters versus direct stat changes.'],
  characteristic_change: ['oracle_text; type_line; card_faces[]', 'Parse explicit changes to type, color, land type or characteristics; preserve subject, duration and retained characteristics.', 'Test becoming versus already being a type, additions versus replacements, temporary versus persistent effects, and separate faces.'],
  removal: ['oracle_text; card_faces[].oracle_text', 'Parse destroy/exile/sacrifice clauses and their target restrictions, controller, scope and linked return conditions. Preserve every restriction in the source label.', 'Test destroy versus exile, self versus opponent sacrifice, one versus all, power thresholds, compensation and delayed returns.'],
  protection: ['oracle_text; card_faces[].oracle_text', 'Parse explicit prevention/prohibition or protection effects; preserve subject, target, duration and exceptions.', 'Test grants versus possesses versus removes, combat-only versus all damage, conditional versus unconditional and reminder-only text.'],
  evasion: ['oracle_text; card_faces[].oracle_text', 'Parse attack/block requirements or restrictions with quantifiers, exceptions and duration; distinguish an ability from its removal or reference.', 'Test cannot block versus cannot be blocked, must attack versus may attack, one blocker versus all and granted effects.'],
  win_condition: ['oracle_text; card_faces[].oracle_text', 'Parse explicit win/lose instructions or prohibitions, affected players and conditions. Never infer a strategy or a winning combination.', 'Test win versus cannot win, lose versus cannot lose, controller versus opponents, conditional triggers and replacement effects.'],
  card_flow: ['oracle_text; card_faces[].oracle_text', 'Parse draw/discard/reveal/look/exile/play permissions as ordered clauses with zones, controller, duration and costs; preserve label-specific restrictions.', 'Test draw-then-discard versus discard-then-draw, optional actions, opponent draw, delayed permissions and cost versus effect.'],
  graveyard: ['oracle_text; card_faces[].oracle_text', 'Parse exact source/destination zones, ownership, object restrictions and cast-versus-return actions; preserve label distinctions.', 'Test own versus any/opponent graveyard, hand versus battlefield destinations, exile actions and linked conditions.'],
  copying: ['oracle_text; card_faces[].oracle_text', 'Parse copy effects with copied object, copy recipient, modifications and duration.', 'Test spell versus permanent copies, token copies, copy prevention, temporary versus permanent and cross-references.'],
  control: ['oracle_text; card_faces[].oracle_text', 'Parse counter/restriction/tax clauses including target kind, payment, exceptions and controller.', 'Test counter a spell versus put a counter, abilities versus spells, unless payments, prohibitions and granted text.'],
  combat: ['oracle_text; card_faces[].oracle_text', 'Parse damage/fight clauses with source, recipients, amount expressions and combat restrictions.', 'Test damage versus life loss, fight versus one-way damage, multiple targets, power-derived amounts and qualifying triggers.'],
  sacrifice: ['oracle_text; card_faces[].oracle_text', 'Parse sacrifice/discard and cost boundaries; preserve actor, permitted objects, repeatability conditions and linked effects.', 'Test self-only sacrifice, another creature, forced opponent sacrifice, once-per-turn restrictions and death triggers.'],
  disruption: ['oracle_text; card_faces[].oracle_text', 'Parse discard, mill, hand/library manipulation and choices with actor, zone, quantity and ordering.', 'Test costs versus effects, self versus opponents, optional choices, replacement effects and negated instructions.'],
  life: ['oracle_text; card_faces[].oracle_text', 'Parse gain/lose/pay life with actor, quantity and cost/effect boundary; keep damage distinct.', 'Test each player versus you/opponents, paying versus losing, life-setting, replacement and linked gain/loss.'],
  tempo: ['oracle_text; card_faces[].oracle_text', 'Parse tap/untap, bounce, blink, phase/turn and combat-step clauses; preserve objects, destination, timing and linked returns.', 'Test enters tapped versus tap action, next-untap restrictions, extra turns versus end turn, temporary exile and self-only effects.'],
  theft: ['oracle_text; card_faces[].oracle_text', 'Parse control-changing clauses with controlled object/player, duration and follow-up conditions.', 'Test temporary versus indefinite control, exchanged control, player-turn control and merely referencing an opponent.'],
  counters: ['oracle_text; card_faces[].oracle_text', 'Parse counter/token placement, removal, movement and replacement separately; preserve kind, quantity and recipient.', 'Test counterspell homonyms, token versus counter doubling, cost removal, references versus production and replacement effects.'],
  mana: ['oracle_text; type_line; mana_cost; card_faces[]', 'Parse mana production, land-play/zone movement and land-count conditions; preserve restrictions, duration and cost/effect role.', 'Test costs versus mana production, restricted spending, conditional production, additional land plays versus putting lands and permanent versus temporary sources.'],
  rules_alteration: ['oracle_text; card_faces[].oracle_text', 'Parse a bounded registry of explicit permission/prohibition/replacement templates; keep unsupported wording unclassified.', 'Test scope, exceptions, timing, may versus cannot, replacement versus prevention and effects that grant rule text.'],
  cheat_into_play: ['oracle_text; card_faces[].oracle_text', 'Parse hand-to-battlefield instructions and exact permitted card types, restrictions and payments.', 'Test from hand versus library/graveyard, put versus cast, optional payments, and permanent-type restrictions.'],
  tokens: ['oracle_text; card_faces[].oracle_text', 'Parse token creation with kind, quantity, characteristics, controller and conditions; references to tokens are separate.', 'Test creates versus sacrifices/copies/references, replacement effects, variable numbers and named token definitions.'],
  tutoring: ['oracle_text; card_faces[].oracle_text', 'Parse library searches with actor, permitted types, destination, reveal and shuffle requirements.', 'Test search versus top-N look, any card versus specific types, opponent searches, failure-to-find and prohibitions.'],
  trigger: ['oracle_text; card_faces[].oracle_text', 'Parse a bounded trigger template with event, controller, qualifiers, frequency and resulting effect; record event and payoff separately.', 'Test triggers versus activation costs or effects, opponent versus own events, once-per-turn and multiple clauses.'],
  state: ['oracle_text; card_faces[].oracle_text', 'Parse explicit references to the named state/resource and classify establishes / consumes / checks / changes. A decklist does not establish current game state.', 'Test gaining versus checking state, resource generation versus expenditure, starting-game instructions and negation.'],
  modal: ['oracle_text; card_faces[].oracle_text', 'Parse explicit mode selection and bullet structure, choice counts, repeat permissions and additional costs.', 'Test modal choices versus reminder/list formatting and mutually exclusive versus repeatable choices.'],
  numeric: ['mana_cost; oracle_text; type_line; card_faces[]', 'Parse explicit numeric comparisons, X, mana-value references or characteristics; retain the measured object and comparison.', 'Test printed X versus variable effects, power versus mana value, thresholds, parity and hypothetical game-state values.'],
  lookup: ['reviewed definition + approved card IDs/templates', 'The supplied label does not establish a sufficiently precise executable definition. Add a reviewed definition first, then reusable rules or card-ID exceptions. No automatic card assignment.', 'Approved positive/negative examples and scope are required before activation. No similarity matching, color inference or generic catch-all.'],
  special: ['domain-specific card fields/text + approved exceptions', 'Requires a separate scoped definition for digital, Acorn or historical behavior. Prefer reusable templates where supported; use card-ID exceptions only where necessary.', 'Validate domain and printing/Oracle revision; do not derive card legality from this category. Main supported scope must opt in explicitly.'],
  unavailable: ['no supported released-card mapping in this inventory', 'Preserve the source entry as reference-only. Do not assign imported cards until a separately reviewed mapping is supplied.', 'No matches by default; test that identical words in unrelated card text do not activate the entry.'],
  index: ['none', 'This is a category-index pointer, not a mechanic. Retain it for source completeness and never activate a mechanic display from it.', 'Exactly three playtest category pointers remain separate from the 524 named entries.'],
};

const overrides = new Map();
function group(profile, names) { for (const name of names.split('|')) { assert.ok(!overrides.has(name), `Duplicate policy: ${name}`); overrides.set(name, profile); } }
group('removal', 'Artifact destruction|Board wipe|Edict|Land destruction|Removal|Cremate|Polymorph');
group('tempo', 'Bounce|Flicker|Freeze|Tuck|Manipulate time|Orochi ability');
group('combat', 'Bite|Biting|Direct damage|One-sided fight');
group('card_flow', 'Cantrip|Card filtering|Impulsive draw|Looting|Future Sight (mechanic)');
group('stat_modification', 'Creature pumping|Firebreathing|Power/Toughness switcher');
group('characteristic_change', 'Animate|Color changer|Land changer');
group('protection', 'Fog|Uncounterable');
group('evasion', 'Attack alone|Daunt|Lure|Stalking|Unblockable');
group('graveyard', 'Reanimation');
group('mana', 'Basic land counting|Mana acceleration|Mana washing');
group('tutoring', 'Tutor');
group('control', 'Taxing|Ghostly Prison effect');
group('copying', 'Copy');
group('tokens', 'Predefined token');
group('counters', 'Poison counter|Rad counter');
group('disruption', 'Wheel');
group('trigger', 'Curiosity|Enchantress|Rewards for death|Sengir ability|Spiritcraft|Die|Enter|Expend');
group('state', "City's blessing|Day and night|Energy|Initiative|Monarch|Starting player|Subgame|Coin flip|Dice roll");
group('numeric', 'Devotion|Hand size|Life threshold|Mana value|Odd or even|Power/Toughness threshold|X');
group('modal', 'Modal');
group('lookup', 'Alt con|Anchor word|Anti-discard|Balance|Batching|Bidding|Bloodlust|Clockwork creature|Commander storm|Crime|Devil\'s Deal|Dexterity card|Dilemma|Divvy|Draft ability|Free mechanic|Free spell|Gating|Grind|Growing permanent|Guess|Guildmage|Historic|Hoser|Illusion (mechanic)|Imprison|Intrinsic ability|Invoker|Keyword soup|Kindle|Lobotomy|Loner|Lucky charm|Meddling|Mix-and-match|Modal/Charms|Modal/Commands|Modal/Confluences|Modified|Outlaw|Party|Pawprint|Pitch spell|Punisher|Relentless|Reverse threshold|Rhystic|Rule-setting|Ruthless|Saboteur|Saga creature|Sleeping enchantment|Spellbook|Star creature|Timespiraling|Torment (mechanic)|Transformation|Unlocking a door|Vanilla|Wish');

const familyKeywords = new Set(['Landwalk', 'Protection', 'Cycling', 'Devour', 'Equip', 'Hexproof', 'Trample', 'Partner', 'Ninjutsu', 'Morph', 'Hidden Agenda', 'Ascend', 'Visit', 'Storied', 'Web-slinging', 'Start Your Engines!', 'Daybound and Nightbound', '∞ (Infinity)']);
const genericActions = new Set(['Activate', 'Attach', 'Cast', 'Counter', 'Create', 'Destroy', 'Discard', 'Double', 'Triple', 'Exchange', 'Exile', 'Play', 'Regenerate', 'Reveal', 'Sacrifice', 'Search', 'Shuffle', 'Tap and Untap']);
const pieExceptions = new Set(['friendly to artifacts', 'friendly to creatures', 'friendly to enchantments', 'friendly to instants and sorceries', 'friendly to lands', 'friendly to legendary permanents', 'friendly to low mana value cards', 'friendly to planeswalkers', 'devil\'s deal permanents', 'maro ability', 'polymorph', 'punisher effects', 'rules setting', 'super trample', 'torment ability', 'warlord', 'lobotomy']);
const pieKeywordNames = new Set(rows.filter(r => r.source === 'master' && r.category === 'keyword_ability').map(r => r.name.toLowerCase()));
const pieActionLabels = new Map([['fight', 'Fight'], ['scry', 'Scry'], ['milling', 'Mill']]);
const routeLabels = { direct: 'Direct metadata', rule: 'Deterministic rule', exception: 'Definition / exception review', excluded: 'Not a mechanic' };

for (const row of rows) {
  let profile, route, keyword = null;
  row.current_support = 'not_implemented_by_this_report';
  row.scope = 'source classification only; not a legality assertion';
  row.alias_work = 'none specified';
  if (row.source === 'color-pie') {
    const key = row.source_key;
    if (pieKeywordNames.has(key)) { profile = 'direct'; route = 'direct'; keyword = rows.find(r => r.source === 'master' && r.category === 'keyword_ability' && r.name.toLowerCase() === key).name; }
    else if (pieActionLabels.has(key)) { profile = 'direct'; route = 'direct'; keyword = pieActionLabels.get(key); row.alias_work = 'Proposed explicit label crosswalk; validate scope before enabling.'; }
    else if (pieExceptions.has(key)) { profile = 'lookup'; route = 'exception'; }
    else { profile = row.category; route = 'rule'; }
    // Source families organize navigation; explicitly override where that family
    // is not the appropriate detection profile. Never reinterpret the source family.
    if (['instant and/or sorcery triggers', 'curiosity', 'enchantress ability', 'rewards for death', 'illusion ability', 'sengir ability', 'specter ability'].includes(key)) { profile = 'trigger'; route = 'rule'; }
    if (key === 'daunt') { profile = 'evasion'; route = 'rule'; }
    if (key === 'gaseous form') { profile = 'protection'; route = 'rule'; }
    if (key === 'treasure creation') { profile = 'tokens'; route = 'rule'; }
    if (key === 'lhurgoyf' || key === 'variable creature') { profile = 'numeric'; route = 'rule'; }
    if (key === 'meddling') { profile = 'rules_alteration'; route = 'rule'; }
    if (key === 'ward (for life)' || key === 'ward (for mana)') { profile = 'family_alias'; route = 'rule'; row.alias_work = 'Ward alone is insufficient: parse and distinguish life versus mana payment.'; }
  } else if (row.category === 'keyword_ability' || row.category === 'ability_word' || row.category === 'acorn_ability_word') {
    profile = 'direct'; route = 'direct'; keyword = row.name;
    if (familyKeywords.has(row.name)) row.alias_work = 'Variant mapping required for exhaustive family coverage; exact reported label alone is partial.';
    if (['Daybound and Nightbound', '∞ (Infinity)'].includes(row.name)) { profile = 'family_alias'; route = 'rule'; keyword = null; }
  } else if (row.category === 'keyword_action') {
    if (genericActions.has(row.name)) { profile = 'action'; route = 'rule'; }
    else { profile = 'direct'; route = 'direct'; keyword = row.name; }
    if (['Manifest', 'Venture into the Dungeon', 'Open an Attraction', 'Roll to Visit Your Attractions'].includes(row.name)) row.alias_work = 'Source variant/framework notes require explicit cross-links; never substring-match a family.';
  } else if (row.category === 'miscellaneous_mechanic' || row.category === 'additional_rules_concept') {
    profile = overrides.get(row.name);
    assert.ok(profile, `Unclassified source entry: ${row.name}`);
    route = profile === 'lookup' ? 'exception' : 'rule';
  } else if (['digital_only_mechanic', 'acorn_mechanic', 'former_mechanic'].includes(row.category)) {
    profile = 'special'; route = 'exception'; row.scope = 'separate opt-in domain / historical terminology';
  } else if (row.category === 'unreleased_mechanic') {
    profile = 'unavailable'; route = 'exception'; row.scope = 'reference-only according to supplied inventory';
  } else if (row.category === 'playtest_mechanic') { profile = 'index'; route = 'excluded'; }
  assert.ok(profiles[profile], `No profile for ${row.id}: ${profile}`);
  row.route = route;
  row.profile = profile;
  row.fields = profiles[profile][0];
  row.detection_requirement = profiles[profile][1];
  row.validation_required = profiles[profile][2];
  row.provider_keyword_candidate = keyword;
  row.provider_label_status = keyword ? 'candidate_unverified_against_provider_snapshot' : 'not_applicable';
  row.extra_rule_required = route === 'direct' ? 'Oracle clause rules required for grants, inherent possession, face assignment, parameters and unreported occurrences.' : 'Retain exact source-label constraints; family assignment is not a matcher.';
  row.exception_requirement = route === 'exception' ? 'Required review before activation; may yield reusable rules rather than per-card mappings.' : route === 'excluded' ? 'Not applicable.' : 'Only for unsupported wording, provider aliases or card-specific behavior; no per-card exception count established.';
  row.safe_display = route === 'direct' ? `Cards with provider-reported ${keyword}` : route === 'rule' ? `${row.name}: show only cards with validated rule evidence and the preserved conditions` : 'No automatic mechanic display until the mapping is defined and verified';
  const existingRecord = crosswalk.records.find(r => row.source === 'master'
    ? r.master_category === row.category && r.master_name === row.name
    : r.rosewater_id === row.source_key);
  if (existingRecord) {
    row.current_support = 'existing_eight_keyword_crosswalk';
    row.provider_label_status = 'existing_reviewed_crosswalk_not_live_revalidated';
    row.existing_fixture_ids = existingRecord.test_fixture_ids;
  }
  if (row.category === 'ability_word' || row.category === 'acorn_ability_word') row.extra_rule_required += ' An ability-word label does not encode the full effect or its conditions.';
}

let metadataAudit = null, metadataAuditHash = null;
try {
  const auditBytes=await readFile(path.join(out,'metadata-validation.json'));
  metadataAudit=JSON.parse(auditBytes); metadataAuditHash=hash(auditBytes);
  const candidateManifest=rows.filter(r=>r.route==='direct').map(r=>[r.id,r.provider_keyword_candidate]).sort((a,b)=>a[0]<b[0]?-1:1);
  assert.equal(hash(JSON.stringify(candidateManifest)),metadataAudit.candidate_manifest_sha256,'Candidate set drifted; rerun the offline metadata audit.');
  const manifestBytes=await readFile(path.join(root,metadataAudit.snapshot_path,'manifest.json'));
  assert.equal(hash(manifestBytes),metadataAudit.manifest_sha256);
  assert.equal(metadataAudit.results.length,312);
  for(const row of rows.filter(r=>r.route==='direct')) {
    const result=metadataAudit.results.find(r=>r.term===row.provider_keyword_candidate);
    assert.ok(result,`Missing audit result: ${row.id}`);
    row.planned_route='direct';
    row.provider_label_status=result.status;
    row.provider_verification={
      audit_path:'reports/mechanics-coverage/metadata-validation.json',snapshot:metadataAudit.bulk_updated_at,
      all_card_count:result.all_card_count,paper_commander_legal_count:result.paper_commander_legal_count,
      multi_face_card_count:result.multi_face_card_count,listed_in_catalogs:result.listed_in_catalogs,
      catalog_category_agrees:result.catalog_category_agrees,original_keyword_spellings:result.original_keyword_spellings,
      examples:result.examples,literal_text_without_metadata_count:result.literal_text_without_metadata_count,
      literal_text_examples:result.literal_text_examples,claim:result.claim,
      source_link_status:row.current_support==='existing_eight_keyword_crosswalk'?'existing_reviewed_crosswalk':row.source==='color-pie'?'provider_label_verified_source_semantic_crosswalk_still_proposed':'provider_label_verified_source_category_only_if_catalog_agrees',
    };
    if(!result.all_card_count) {
      row.route=row.category==='acorn_ability_word'?'exception':'rule';
      row.profile=row.category==='acorn_ability_word'?'special':row.category==='keyword_action'?'action':'family_alias';
      row.fields=profiles[row.profile][0];
      row.detection_requirement=`Exact label absent from the pinned full card snapshot. ${profiles[row.profile][1]}`;
      row.validation_required=profiles[row.profile][2];
      row.safe_display='No direct metadata display for this label. Require separately validated text/variant evidence; absence is not proof the mechanic is absent.';
      row.route_change_reason='Direct-candidate assumption falsified for this snapshot: zero exact metadata matches.';
      if(row.name==='Descend 4'||row.name==='Descend 8')row.alias_work='Actual cards report Descend; parse the explicit threshold. Do not map every Descend card to both thresholds.';
    }
  }
} catch(error) { if(error.code!=='ENOENT'||error.path!==path.join(out,'metadata-validation.json'))throw error; }

assert.equal(rows.length, 743);
assert.equal(new Set(rows.map(r => r.id)).size, rows.length);
assert.equal(rows.filter(r => r.source === 'master' && r.current_support === 'existing_eight_keyword_crosswalk').length, 8);
// Preserve same-spelling source categories, e.g. official and Acorn Rampage.
assert.equal(rows.filter(r => r.source === 'master' && r.name === 'Rampage').length, 2);
const tally = values => values.reduce((a, v) => (a[v] = (a[v] ?? 0) + 1, a), {});
const summary = Object.fromEntries(['master', 'color-pie'].map(source => [source, tally(rows.filter(r => r.source === source).map(r => r.route))]));
const matrix = {
  schema_version: 2, policy_version: 'coverage-planning-2-metadata-audited', date: '2026-10-17',
  purpose: 'Offline deterministic coverage matrix with exact provider-label audit. No runtime detector expansion, no model calls. Public network acquisition is a separate script.',
  authority: 'Detection routes are proposed project policy, not statements made by the source authors. No source identities are merged.',
  scope: '524 master source entries + 216 color-pie entries + 3 category pointers. Overlap is retained; these are not 740 unique mechanics.',
  limits: [metadataAudit?'All 312 distinct direct-label candidates checked against the pinned complete Scryfall Oracle-card snapshot and three catalogs.':'No complete provider keyword catalog or card corpus was supplied or fetched for this report.',
    'Direct means an exact reported-label route, conditional on the provider returning it. Missing metadata is unknown, not absence.',
    'No percentage of cards covered, precision, recall or count of necessary card exceptions has been measured.',
    'Rule profiles specify work to implement; they are not executable or validated Oracle recognizers.',
    'Exception review includes undefined editorial scopes and opt-in domains; it does not mean each card needs manual mapping.',
    'Inventory category/rules reference is not proof of current card legality. Color ownership never supplies card evidence.'],
  sources, supporting_evidence: [{ path: 'lib/data/crosswalk.json', sha256: hash(crosswalkBytes), role: 'existing eight reviewed links only' },...(metadataAudit?[{path:'reports/mechanics-coverage/metadata-validation.json',sha256:metadataAuditHash,role:'full-corpus exact-label observations, counterexamples and sampled live consistency'}]:[])],
  metadata_validation:metadataAudit?{totals:metadataAudit.totals,tests:metadataAudit.tests,endpoint_check:metadataAudit.endpoint_check,snapshot:metadataAudit.bulk_updated_at,limits:metadataAudit.limits}:null,
  summary, source_variant_notes: variantNotes, profiles, rows,
};
const json = JSON.stringify(matrix, null, 2) + '\n';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cardEvidence=c=>`<li><a href="${esc(c.scryfall_uri)}">${esc(c.name)}</a><small>keywords: ${esc(JSON.stringify(c.keywords))}</small><small>Oracle ID: ${esc(c.oracle_id)}</small><small>${esc(c.oracle_text??c.card_faces.map(f=>`${f.name}: ${f.oracle_text??''}`).join('\n'))}</small></li>`;
const evidenceCell=r=>{const v=r.provider_verification;if(!v)return '<small>Outside this direct-label validation pass.</small>';return `<p><strong>${v.all_card_count?'Observed exact metadata':'FAILED direct route: zero matches'}</strong><br>${v.all_card_count} records · ${v.paper_commander_legal_count} paper / Commander-legal · ${v.multi_face_card_count} multi-face</p><small>Catalogs: ${esc(v.listed_in_catalogs.join(', ')||'not listed')}. Category agreement: ${v.catalog_category_agrees?'yes':'no; retain source distinction'}.</small><small>${esc(v.source_link_status)}</small><details><summary>Actual card evidence</summary><ul>${v.examples.map(cardEvidence).join('')}</ul><p>${v.literal_text_without_metadata_count} cards contain the literal bounded phrase without the metadata label. This is a diagnostic scan, not a mechanic detector.</p><ul>${v.literal_text_examples.map(cardEvidence).join('')}</ul><a href="metadata-validation.json">Full counts, matching IDs and provenance</a></details>`;};
const cells = rows.map(r => `<tr data-route="${r.route}" data-source="${r.source}" data-validation="${r.provider_verification?(r.provider_verification.all_card_count?'observed':'failed'):'outside'}"><td><strong>${esc(r.name)}</strong><small>${esc(r.category)} · ${esc(r.reference ?? '')}</small><small>${esc(r.id)}</small></td><td><span class="badge ${r.route}">${routeLabels[r.route]}</span><small>${esc(r.current_support === 'existing_eight_keyword_crosswalk' ? 'Existing reviewed application link' : 'Application support not added')}</small>${evidenceCell(r)}</td><td>${esc(r.fields)}<small>${esc(r.detection_requirement)}</small></td><td>${esc(r.alias_work)}<small>${esc(r.extra_rule_required)}</small><small>${esc(r.exception_requirement)}</small></td><td>${esc(r.safe_display)}<details><summary>Validation and source</summary><p>${esc(r.validation_required)}</p><p>${esc(r.scope)}</p><a href="../../${esc(r.source_path)}">${esc(r.source_path)}</a>${r.source_line ? ` line ${r.source_line}` : ` · key ${esc(r.source_key)}`}</details></td></tr>`).join('\n');
const auditSection=metadataAudit?`<h2>Actual Scryfall validation</h2><p><strong>${metadataAudit.totals.observed_labels} of ${metadataAudit.totals.distinct_candidate_labels} distinct candidate labels observed</strong> across ${metadataAudit.totals.card_records.toLocaleString('en-US')} Oracle card records: <strong>${metadataAudit.totals.observed_beyond_existing_eight} beyond the original eight</strong>. ${metadataAudit.totals.observed_paper_commander_labels} occur on at least one paper, Commander-legal record. Snapshot: ${esc(metadataAudit.bulk_updated_at)}. All three catalogs and raw card data are retained with SHA-256 hashes.</p><p><strong>${metadataAudit.totals.not_observed_labels} direct candidates failed:</strong> ${metadataAudit.results.filter(r=>!r.all_card_count).map(r=>esc(r.term)).join(', ')}. Their rows now require rules or scoped review. This does not mean those mechanics do not exist.</p><p><strong>Catalog disagreements:</strong> ${metadataAudit.results.filter(r=>r.all_card_count&&!r.catalog_category_agrees).map(r=>`${esc(r.term)} (${esc(r.listed_in_catalogs.join(', ')||'absent from catalogs')})`).join('; ')}. We preserve both sources and do not silently rewrite the inventory classification.</p><p>Verification: ${metadataAudit.tests.full_scan_label_comparisons} indexed results cross-checked by a separate full scan; ${metadataAudit.tests.challenge_assertions} real-card adversarial cases; ${metadataAudit.tests.metamorphic_assertions} mutation checks. ${metadataAudit.endpoint_check?`${metadataAudit.endpoint_check.card_count} witness cards fetched again through the live collection endpoint; ${metadataAudit.endpoint_check.mismatches.length} compared-field mismatches. This is same-provider consistency, not independent rules verification.`:'Live endpoint consistency check not yet recorded.'}</p><details><summary>Red-team card evidence and limits</summary><ul>${metadataAudit.challenges.map(c=>`<li><strong>${esc(c.finding)}</strong><ul>${cardEvidence(c.card)}</ul></li>`).join('')}</ul><ul>${metadataAudit.limits.map(s=>`<li>${esc(s)}</li>`).join('')}</ul></details><p><a href="metadata-validation.json">Full validation results</a> · <a href="snapshots/20261017090158/manifest.json">Raw acquisition manifest and hashes</a> · <a href="snapshots/20261017090158/endpoint-check.json">Live witness-check receipts</a></p>`:'';
const stats = Object.entries(summary).map(([source, counts]) => `<tr><th>${source === 'master' ? 'Master inventory' : 'Color-pie runtime'}</th>${['direct', 'rule', 'exception', 'excluded'].map(k => `<td>${counts[k] ?? 0}</td>`).join('')}</tr>`).join('');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Mechanics coverage matrix</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:28px;color:#18212b;background:#f7f8fa}h1{font-size:28px}h2{font-size:20px}p,li{max-width:1000px}a{color:#174caf}table{border-collapse:collapse;width:100%;background:white}th,td{text-align:left;vertical-align:top;padding:12px;border:1px solid #d9dfe8}thead{background:#e8edf4}small{display:block;color:#455469;margin-top:7px;overflow-wrap:anywhere}input,select{font:inherit;padding:9px;border:1px solid #8995a5;border-radius:4px;max-width:100%}.filters{display:flex;gap:14px;flex-wrap:wrap;margin:20px 0}.filters label{display:flex;flex-direction:column;gap:4px}input{min-width:260px}.badge{font-size:13px;font-weight:650;padding:4px 7px;border-radius:4px;display:inline-block}.direct{background:#d6eee2}.rule{background:#dfebff}.exception{background:#ffecd3}.excluded{background:#eee}details{margin-top:12px}summary{cursor:pointer;color:#174caf}.scroll{overflow:auto}.counts{max-width:850px}code{background:#e8edf4;padding:2px 4px}tr[hidden]{display:none}@media print{.filters{display:none}body{margin:8px;font-size:10px}td,th{padding:5px}details{display:block}}:focus-visible{outline:3px solid #2863d3;outline-offset:3px}</style>
<h1>Deck import → mechanics: coverage matrix</h1><p><strong>Frozen sources preserved. Direct labels tested against actual card data.</strong> Updated October 17, 2026. Acquisition uses public Scryfall endpoints; audit and report generation are offline, deterministic and use no model calls or probabilistic matching.</p>
<p>Every named source entry has a row: <strong>524 master entries + 216 color-pie entries</strong>. Three playtest category pointers are retained separately. Overlapping categories and source identities are deliberately not merged. The contract supplies constraints, not additional mechanics.</p>
<div class="scroll counts"><table><thead><tr><th>Source</th><th>Direct*</th><th>Rules</th><th>Review / exceptions</th><th>Category pointers</th></tr></thead><tbody>${stats}</tbody></table></div>
<p><strong>*Direct is a bounded claim:</strong> exact provider-reported keyword membership permits a neutral label display. It does not establish inherent possession, a particular face, parameters, every grant or every occurrence. Only <strong>8 unique mechanics</strong> are currently enabled by the application's reviewed crosswalk; this audit does not expand application support. Source overlap remains in these row counts.</p>
${auditSection}
<ul><li><strong>Rules:</strong> reusable, explicit text/field parsers; preserve conditions and reject unsupported forms. The matrix specifies them but does not implement them.</li><li><strong>Review / exceptions:</strong> define editorial labels, aliases or special domains first. Some will become reusable rules; unusual cards may need versioned ID exceptions. No claim that each needs manual card mapping.</li><li><strong>Verification boundary:</strong> exact metadata occurrence is measured. Semantic precision/recall and complete mechanic coverage remain unmeasured.</li></ul>
<p>Reproduce the retained-data audit without network access: <code>node scripts/audit-mechanics-metadata.mjs --check</code>. Then verify the matrix: <code>node scripts/build-mechanics-coverage.mjs --check</code>. The raw snapshots are immutable; acquisition scripts refuse to overwrite them.</p>
<h2>What to build from this</h2><p>Keep source identities and dated color information intact. Add a separate provider-label crosswalk, bounded rule recognizers, and explicit exception records. Compile against a pinned card snapshot. Import-time work becomes card-ID lookup, deduplication and fixed displays. Every match must retain rule ID, data revision, source field/excerpt and face when established.</p>
<p>First implement neutral reported-keyword displays and validate provider aliases. Next validate bounded effects such as token creation, counters, zone movement and sacrifice cost/effect distinctions. Keep unresolved definitions disabled. Missing evidence is unknown, not evidence of absence. No strategic inference, combination inference or color-based detection is included.</p>
<p><a href="coverage-matrix.json">Complete machine-readable matrix</a> · <a href="../../scripts/build-mechanics-coverage.mjs">Deterministic generator and classification policy</a>. Rebuild: <code>node scripts/build-mechanics-coverage.mjs</code>. Check without writing: <code>node scripts/build-mechanics-coverage.mjs --check</code>.</p>
<details><summary>Source integrity and scope limits</summary><ul>${sources.map(s => `<li>${esc(s.path)}<small>SHA-256 ${s.sha256}</small></li>`).join('')}</ul><ul>${matrix.limits.map(s => `<li>${esc(s)}</li>`).join('')}</ul><p>Baseline hashes are checked against the existing source audit. No frozen inputs, application code, crosswalk or source identities are rewritten.</p></details>
<details><summary>Preserved keyword variant notes (${variantNotes.length})</summary><ul>${variantNotes.map(n => `<li>${esc(n.text)} <small>Master source line ${n.source_line}</small></li>`).join('')}</ul></details>
<h2>All entries</h2><div class="filters"><label>Find mechanic or requirement<input id="search" type="search" placeholder="Treasure, Ward, sacrifice…"></label><label>Detection route<select id="route"><option value="">All routes</option>${Object.entries(routeLabels).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label><label>Validation<select id="validation"><option value="">All results</option><option value="observed">Observed exact metadata</option><option value="failed">Failed direct candidates</option><option value="outside">Outside validation scope</option></select></label><label>Source<select id="source"><option value="">Both sources</option><option value="master">Master inventory</option><option value="color-pie">Color-pie runtime</option></select></label></div><p id="count" aria-live="polite">${rows.length} rows shown</p>
<div class="scroll"><table id="matrix"><thead><tr><th>Mechanic / source identity</th><th>Route / present status</th><th>Data and required method</th><th>Aliases, extra rules and exceptions</th><th>Permitted display / verification</th></tr></thead><tbody>${cells}</tbody></table></div>
<script>const allRows=[...document.querySelectorAll('#matrix tbody tr')];const q=document.querySelector('#search'),r=document.querySelector('#route'),s=document.querySelector('#source'),v=document.querySelector('#validation');function filter(){let n=0;const term=q.value.toLowerCase().trim();for(const row of allRows){row.hidden=!!((r.value&&row.dataset.route!==r.value)||(s.value&&row.dataset.source!==s.value)||(v.value&&row.dataset.validation!==v.value)||(term&&!row.textContent.toLowerCase().includes(term)));if(!row.hidden)n++;}document.querySelector('#count').textContent=n+' of '+allRows.length+' rows shown';}for(const el of [q,r,s,v])el.addEventListener('input',filter);</script></html>\n`;

const outputs = [['coverage-matrix.json', json], ['index.html', html]];
if (process.argv.includes('--check')) {
  for (const [name, content] of outputs) assert.equal(await readFile(path.join(out, name), 'utf8'), content, `Stale artifact: ${name}`);
} else {
  await mkdir(out, { recursive: true });
  for (const [name, content] of outputs) await writeFile(path.join(out, name), content);
}
for (const source of sources) assert.equal(hash(await readFile(path.join(root, source.path))), source.sha256, `Source changed during build: ${source.path}`);
console.log(JSON.stringify({ mode: process.argv.includes('--check') ? 'checked' : 'built', rows: rows.length, summary, sourceIntegrity: 'all three hashes match original audit', outputs: outputs.map(([name]) => path.join(out, name)) }, null, 2));
