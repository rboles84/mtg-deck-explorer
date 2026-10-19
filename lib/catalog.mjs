import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import vocabulary from '../public/mechanics-vocabulary.mjs';
import {validateRegistry} from './mechanic-discovery.mjs';
import {SHORTLIST_LABELS, SHORTLIST_REVIEW} from '../public/mechanic-supplement.mjs';
import {VARIANT_LABELS, VARIANT_REVIEW} from '../public/mechanic-variants.mjs';
import {CATALOG_GAPS} from '../public/catalog-gap-data.mjs';
import {validateCatalogGapRegistry} from './catalog-gap-registry.mjs';

const categories = new Map([
  ['Keyword abilities', 'keyword_ability'], ['Keyword actions', 'keyword_action'],
  ['Ability words', 'ability_word'], ['Acorn ability words', 'acorn_ability_word'],
  ['Additional rules concepts', 'additional_rules_concept'], ['Digital-only mechanics', 'digital_only_mechanic'],
  ['Miscellaneous mechanics', 'miscellaneous_mechanic'], ['Acorn mechanics', 'acorn_mechanic'],
  ['Playtest mechanics', 'playtest_mechanic'], ['Unreleased mechanics', 'unreleased_mechanic'],
  ['Former mechanics', 'former_mechanic'],
]);
export const LEGACY_IDS = Object.freeze([
  'keyword-index-flying', 'keyword-index-trample', 'keyword-index-deathtouch', 'keyword-index-vigilance',
  'keyword-index-haste', 'keyword-index-menace', 'keyword-index-reach', 'keyword-index-lifelink',
]);
export const BASELINE_ID = 'baseline-contract-commander-deck-card-pool-the-default-baseline';
const SOURCE_NAMES = ['mtg-mechanics-master-list.md', 'atlas_v2.0.json', 'mechanical-color-pie.runtime.json', 'MECHANICS-CONTRACT.md', 'atlas_v2.1.json', 'mechanic-discovery.v1.json', 'mechanic-discovery.shortlist.json', 'mechanic-discovery.variants.json'];

export function validateShortlistRegistry(supplement, atlas) {
  return validateSupplementRegistry(supplement,atlas,SHORTLIST_LABELS,SHORTLIST_REVIEW);
}
export function validateVariantRegistry(supplement, atlas) {
  return validateSupplementRegistry(supplement,atlas,VARIANT_LABELS,VARIANT_REVIEW);
}
function validateSupplementRegistry(supplement, atlas, reviewedLabels, review) {
  const labels=reviewedLabels.filter(l=>l.discovery==='reviewed-search');
  if(!Array.isArray(supplement.rows)||supplement.rows.length!==labels.length)throw new Error('Supplement recipe scope mismatch.');
  const combined={...atlas,rows:[...atlas.rows,...supplement.rows],row_count:atlas.rows.length+supplement.rows.length,
    tier_counts:{...atlas.tier_counts,Review:atlas.tier_counts.Review+supplement.rows.length}};
  validateAtlas(combined); // Includes duplicate IDs, schema, and tier checks.
  validateRegistry(supplement,combined,{version:review.version,auditSha256:review.evidenceSha256,labels});
  // Every addition owns a new row, and only the reviewed exact native expression
  // is executable. A card-specific flavor label never acquires a generic search.
  for(const mapping of supplement.records){
    const row=supplement.rows.find(r=>r.id===mapping.atlasRowId);
    if(!row||row.label!==mapping.label||row.query!==`kw:${JSON.stringify(mapping.label)}`||row.tier!=='Review')throw new Error('Supplement recipe is not the reviewed exact-label search.');
  }
  return supplement;
}

export function parseMaster(text) {
  const entries = [], categoryIndexes = [], counts = {};
  let category = null;
  for (const line of text.split(/\r?\n/)) {
    if (/^#{1,3} /.test(line)) {
      const title = line.startsWith('## ') ? line.slice(3).split(' —')[0] : '';
      category = categories.get(title) ?? null;
    } else if (category && line.startsWith('- ')) {
      const [rawName, reference] = line.slice(2).split(' — ');
      const name = rawName.replace(/^\*|\*$/g, '');
      const entry = { name, category, inventoryReference: reference ?? null, sourceLabel: 'MTG Wiki-derived inventory' };
      counts[category] = (counts[category] ?? 0) + 1;
      (category === 'playtest_mechanic' ? categoryIndexes : entries).push(entry);
    }
  }
  // Category membership is retained; the same spelling is not counted twice as an independent identity.
  const byName = new Map();
  for (const entry of entries) {
    const key = entry.name.toLocaleLowerCase('en').replace(/[!*]/g, '');
    const record = byName.get(key) ?? { name: entry.name, classifications: [] };
    record.classifications.push(entry);
    byName.set(key, record);
  }
  return { entries, categoryIndexes, counts, byName: [...byName.values()] };
}

export function validateAtlas(atlas) {
  const expected = { 'Production-ready': 684, Review: 353, Semantic: 27, 'Do-not-emit': 22 };
  if (!['2.0','2.1'].includes(atlas.version)||!Array.isArray(atlas.rows)||atlas.rows.length!==atlas.row_count||atlas.version==='2.0'&&atlas.row_count!==1086) throw new Error('Atlas row count or version does not match the source.');
  const fields=['id','section','group','label','query','parameters','tier','auto_execute','live_count','validated','technique','fallback','fallback_count','blind_spot','assumption','baseline_case','baseline_relation','rules','flags','expect_zero'];
  const nullable=['fallback','assumption','baseline_case','baseline_relation','rules','flags'];
  const counts = {}, ids = new Set();
  for (const row of atlas.rows) {
    if(Object.keys(row).length!==20||fields.some(k=>!Object.hasOwn(row,k)))throw new Error('Atlas recipe must use the 20-field schema.');
    for(const field of fields){
      const value=row[field];
      if(field==='parameters'){if(!Array.isArray(value)||value.some(p=>typeof p!=='string'))throw new Error('Invalid Atlas parameters.');}
      else if(['auto_execute','expect_zero'].includes(field)){if(typeof value!=='boolean')throw new Error('Invalid Atlas boolean.');}
      else if(['live_count','fallback_count'].includes(field)){if(!(field==='fallback_count'&&value===null)&&(!Number.isSafeInteger(value)||value<0))throw new Error('Invalid Atlas count.');}
      else if(!(nullable.includes(field)&&value===null)&&typeof value!=='string')throw new Error('Invalid Atlas field type.');
    }
    // Three historical IDs were length-truncated after a hyphen; retain them.
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*-?$/.test(row.id)||!Object.hasOwn(expected,row.tier))throw new Error('Invalid Atlas ID or tier.');
    if (ids.has(row.id)) throw new Error('Duplicate Atlas row ID.');
    ids.add(row.id);
    counts[row.tier] = (counts[row.tier] ?? 0) + 1;
    if (row.auto_execute !== (row.tier === 'Production-ready')) throw new Error('Atlas tier / auto-execute invariant failed.');
  }
  for (const tier of Object.keys(expected)) {
    if (counts[tier] !== atlas.tier_counts[tier] || atlas.version==='2.0'&&counts[tier]!==expected[tier]) throw new Error(`Atlas tier count failed: ${tier}`);
  }
  if (atlas.validity_census?.summary?.rows !== 623) throw new Error('Unexpected historical Atlas validity census.');
  return counts;
}

export async function loadCatalog(root) {
  const loaded = await Promise.all(SOURCE_NAMES.map(async name => {
    const bytes = await readFile(path.join(root, 'inputs', name));
    return { path: `inputs/${name}`, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), text: bytes.toString('utf8') };
  }));
  const master = parseMaster(loaded[0].text), historicalAtlas = JSON.parse(loaded[1].text), rosewater = JSON.parse(loaded[2].text), atlas=JSON.parse(loaded[4].text);
  validateAtlas(historicalAtlas);
  const tierCounts = validateAtlas(atlas);
  const registry=validateRegistry(JSON.parse(loaded[5].text),atlas,vocabulary);
  const supplement=validateShortlistRegistry(JSON.parse(loaded[6].text),atlas);
  const variants=validateVariantRegistry(JSON.parse(loaded[7].text),{
    ...atlas,rows:[...atlas.rows,...supplement.rows],row_count:atlas.rows.length+supplement.rows.length,
    tier_counts:{...atlas.tier_counts,Review:atlas.tier_counts.Review+supplement.rows.length},
  });
  const gapBytes=await readFile(path.join(root,'lib/mechanic-discovery.catalog-gaps.json'));
  const gaps=validateCatalogGapRegistry(JSON.parse(gapBytes),{...atlas,rows:[...atlas.rows,...supplement.rows,...variants.rows]});
  validateAtlas({...atlas,rows:[...atlas.rows,...supplement.rows,...variants.rows,...gaps.rows],row_count:atlas.rows.length+supplement.rows.length+variants.rows.length+gaps.rows.length,tier_counts:{...atlas.tier_counts,Review:atlas.tier_counts.Review+supplement.rows.length+variants.rows.length+gaps.rows.length}});
  if (master.entries.length !== 524 || master.categoryIndexes.length !== 3) throw new Error('Master taxonomy entry counts differ from the frozen source.');
  if (Object.keys(rosewater.byMechanic).length !== 216 || rosewater.meta.snapshot_date !== '2021-10-18') throw new Error('Frozen Rosewater runtime invariants failed.');
  if (!loaded[3].text.includes('SOURCE LAYER STATUS: **FROZEN**')) throw new Error('Mechanics contract is missing its frozen source declaration.');
  const crosswalk = JSON.parse(await readFile(path.join(root, 'crosswalk.json'), 'utf8'));
  if (crosswalk.records.length !== 8 || new Set(crosswalk.records.map(r => r.atlas_row_id)).size !== 8) throw new Error('The reviewed crosswalk must contain exactly eight unique rows.');
  const historicalRecords = crosswalk.records.map(record => {
    const row = historicalAtlas.rows.find(r => r.id === record.atlas_row_id);
    const inventory = master.entries.find(r => r.name === record.master_name && r.category === record.master_category);
    if (!LEGACY_IDS.includes(record.atlas_row_id) || !inventory || record.master_category !== 'keyword_ability') throw new Error('Crosswalk has an unapproved inventory mapping.');
    if (!row || row.tier !== 'Production-ready' || !row.auto_execute || row.parameters.length || row.query !== `kw:${record.master_name}` || row.blind_spot !== record.blind_spot) throw new Error('Reviewed Atlas recipe has drifted.');
    const placement = record.rosewater_id ? rosewater.byMechanic[record.rosewater_id] : null;
    if (record.rosewater_id && (!placement || placement.label !== record.master_name || record.link_review_status !== 'reviewed-exact-label-and-scope')) throw new Error('Unreviewed Rosewater mapping.');
    return { ...record, atlas: row, placement: placement ? { id: record.rosewater_id, ...placement } : null };
  });
  const allRows=[...atlas.rows,...supplement.rows,...variants.rows,...gaps.rows];
  const records=[...registry.records,...supplement.records,...variants.records,...gaps.records].map(mapping=>{
    const historical=historicalRecords.find(r=>r.atlas_row_id===mapping.atlasRowId);
    const row=allRows.find(r=>r.id===mapping.atlasRowId);
    const classification=vocabulary.labels.find(l=>l.key===mapping.key)||SHORTLIST_LABELS.find(l=>l.key===mapping.key)||VARIANT_LABELS.find(l=>l.key===mapping.key)||CATALOG_GAPS.find(l=>l.key===mapping.key);
    return {...historical,master_name:mapping.label,master_category:historical?.master_category??classification.category.replaceAll(' ','_'),
      atlas_row_id:row.id,atlas:row,blind_spot:row.blind_spot,placement:historical?.placement??null,discovery:mapping};
  });
  const baseline = atlas.rows.find(r => r.id === BASELINE_ID);
  if (!baseline || baseline.query !== 'f:commander id<=[COLORS]' || baseline.tier !== 'Production-ready' || !baseline.auto_execute || JSON.stringify(baseline.parameters) !== '["[COLORS]"]') throw new Error('Commander baseline is not the reviewed recipe.');
  const searchPolicy = {
    identityMode: 'within', authorization: 'Explicit user correction: retain the original commander identity ceiling, including all colors within WUBRG.',
    sourceBaselineId: baseline.id, sourceBaselineQuery: baseline.query,
    effectiveBaselineId: baseline.id, effectiveBaselineQuery: baseline.query,
    note: 'Uses the original frozen Atlas commander identity ceiling. Cards may use any subset of the selected colors, including colorless cards; frozen source rows are unchanged.'
  };
  return {
    version: registry.version, atlasVersion:atlas.version, records, historicalRecords, baseline, searchPolicy, rosewaterMeta: rosewater.meta,
    unknownLabelPolicy:registry.unknownLabelPolicy,
    sources: [...loaded.map(({ text, ...metadata }) => metadata),{path:'lib/mechanic-discovery.catalog-gaps.json',bytes:gapBytes.length,sha256:createHash('sha256').update(gapBytes).digest('hex')}],
    stats: { masterListedEntries: 524, playtestCategoryIndexes: 3, masterUniqueNames: master.byName.length, categories: master.counts, atlasRows: atlas.rows.length, atlasTierCounts: tierCounts, supplementalRows:supplement.rows.length+variants.rows.length+gaps.rows.length, catalogGapRows:gaps.rows.length, historicalCensusRows: 623, atlasGenerated: atlas.generated, rosewaterProjectionMechanics: 216, supported: records.length, displayLabels:vocabulary.labels.length, reviewedSupplementalLabels:SHORTLIST_LABELS.length+VARIANT_LABELS.length+CATALOG_GAPS.length, historicalLinks:historicalRecords.length },
    caution: 'The inventory is partly MTG Wiki-derived. Discovery has a separate versioned registry; the eight historical placements do not authorize searches. The 623-row validity census remains historical. Current card data is a separate source.'
  };
}
