// Deterministic audit of exact provider-reported labels. No semantic card classification.
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url));
const report = path.join(root, 'reports/mechanics-coverage');
const snapshotPath = 'reports/mechanics-coverage/snapshots/20261017090158';
const dir = path.join(root, snapshotPath);
const sha = b => createHash('sha256').update(b).digest('hex');
const manifestBytes = await readFile(path.join(dir, 'manifest.json'));
const manifest = JSON.parse(manifestBytes);
const fileMap = new Map([['https://api.scryfall.com/bulk-data', 'bulk-index.json'],
  ...Object.entries(manifest.catalogs).map(([k,v]) => [`https://api.scryfall.com/catalog/${k}`, v]),
  [manifest.bulk.jsonl_download_uri ?? manifest.bulk.download_uri, manifest.corpus_file]]);
for (const request of manifest.requests) {
  const bytes = await readFile(path.join(dir, fileMap.get(request.url)));
  assert.equal(bytes.length, request.bytes); assert.equal(sha(bytes), request.sha256, `Hash mismatch: ${request.url}`);
}
const compressed = await readFile(path.join(dir, manifest.corpus_file));
const decoded = manifest.corpus_file.endsWith('.gz') ? gunzipSync(compressed).toString('utf8') : compressed.toString('utf8');
const cards = manifest.corpus_file.endsWith('.gz') ? decoded.trim().split('\n').map(JSON.parse) : JSON.parse(decoded);
const sorted = [...cards].sort((a,b) => {
  const aLegal = a.games?.includes('paper') && a.legalities?.commander === 'legal';
  const bLegal = b.games?.includes('paper') && b.legalities?.commander === 'legal';
  return Number(bLegal) - Number(aLegal) || (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1);
});
const catalogs = Object.fromEntries(await Promise.all(Object.entries(manifest.catalogs).map(async ([k,v]) => [k, JSON.parse(await readFile(path.join(dir,v),'utf8')).data])));
const matrix = JSON.parse(await readFile(path.join(report,'coverage-matrix.json'),'utf8'));
// Original planned routes persist when a failed candidate has been demoted.
const candidates = matrix.rows.filter(r => (r.planned_route ?? r.route) === 'direct');
const terms = [...new Set(candidates.map(r => r.provider_keyword_candidate))].sort();
assert.equal(terms.length, 312);
assert.equal(candidates.length, 331);
const ids = new Set(), oracles = new Set(), index = new Map(), allById = new Map();
let multiface = 0, emptyKeywords = 0;
for (const card of sorted) {
  assert.equal(card.object, 'card'); assert.ok(card.id && card.oracle_id);
  assert.ok(!ids.has(card.id), `Duplicate printing ID ${card.id}`);
  assert.ok(!oracles.has(card.oracle_id), `Duplicate Oracle ID ${card.oracle_id}`);
  ids.add(card.id); oracles.add(card.oracle_id); allById.set(card.id, card);
  assert.ok(Array.isArray(card.keywords) && card.keywords.every(k => typeof k === 'string' && k.length > 0));
  if (card.card_faces) multiface++;
  if (!card.keywords.length) emptyKeywords++;
  for (const keyword of new Set(card.keywords.map(k => k.toLowerCase()))) {
    if (!index.has(keyword)) index.set(keyword, []);
    index.get(keyword).push(card);
  }
}
// Names are not unique across tokens and other Oracle identities. Never let a
// Map overwrite one silently: select a unique non-token witness and retain IDs.
const witnessByName = name => {
  const matches=cards.filter(c=>c.name===name && !/^(Token|Emblem)\b/.test(c.type_line??''));
  assert.equal(matches.length,1,`Ambiguous or missing non-token witness: ${name}`);
  return matches[0];
};
const projection = c => ({ id:c.id, oracle_id:c.oracle_id, name:c.name, scryfall_uri:c.scryfall_uri,
  uri:c.uri, keywords:c.keywords, oracle_text:c.oracle_text ?? null, type_line:c.type_line ?? null,
  layout:c.layout, card_faces:c.card_faces?.map(f=>({name:f.name,oracle_text:f.oracle_text,type_line:f.type_line})) ?? [],
  games:c.games, commander_legality:c.legalities?.commander ?? null });
const normalizedMembership = (card, term) => card.keywords.some(k => k.toLowerCase() === term.toLowerCase());
const sourceTexts = c => [c.oracle_text, ...(c.card_faces??[]).map(f=>f.oracle_text)].filter(Boolean);
const literalPattern = term => new RegExp('(?<![\\p{L}\\p{N}])' + term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '(?![\\p{L}\\p{N}])','iu');
const results = terms.map(term => {
  const matches = index.get(term.toLowerCase()) ?? [];
  // Independent full scan of raw records checks the index and all counts.
  const scanned = cards.filter(c=>normalizedMembership(c,term));
  assert.deepEqual(matches.map(c=>c.id).sort(), scanned.map(c=>c.id).sort());
  const expectedCatalogs = [...new Set(candidates.filter(r=>r.provider_keyword_candidate===term).map(r=>({keyword_ability:'keyword-abilities',keyword_action:'keyword-actions',ability_word:'ability-words',acorn_ability_word:'ability-words'})[r.category]).filter(Boolean))];
  const listed = Object.keys(catalogs).filter(k=>catalogs[k].some(t=>t.toLowerCase()===term.toLowerCase()));
  const pattern = literalPattern(term);
  const textOnly = sorted.filter(c=>!normalizedMembership(c,term)&&sourceTexts(c).some(t=>pattern.test(t)));
  const paperLegal = matches.filter(c=>c.games.includes('paper')&&c.legalities.commander==='legal');
  return { term, status: matches.length ? 'observed_exact_metadata' : 'not_observed_exact_metadata',
    all_card_count:matches.length, paper_commander_legal_count:paperLegal.length,
    multi_face_card_count:matches.filter(c=>c.card_faces).length,
    expected_catalogs:expectedCatalogs, listed_in_catalogs:listed,
    catalog_category_agrees:expectedCatalogs.some(k=>listed.includes(k)),
    original_keyword_spellings:[...new Set(matches.flatMap(c=>c.keywords.filter(k=>k.toLowerCase()===term.toLowerCase())))].sort(),
    matching_card_ids:matches.map(c=>c.id).sort(), examples:matches.slice(0,3).map(projection),
    literal_text_without_metadata_count:textOnly.length, literal_text_examples:textOnly.slice(0,2).map(projection),
    text_scan_caution:'Literal bounded phrase only; not proof of an ability, grant, usable action or complete semantic recall. No stemming, aliases, reminder removal or inferred matches.',
    claim:matches.length?'Exact label is empirically present in keywords[]; only neutral provider-reported involvement is established.':'No exact label in this complete pinned Oracle-card snapshot; do not treat this as absence of the mechanic.',
  };
});

// Each assertion is about exact retained card data. Interpretations are bounded
// descriptions of the displayed source text, not a production rules engine.
const challengeSpecs = [
  ['Lightning Greaves',['Equip'],['Haste','Shroud'],'Grants absent from metadata; equipment possession cannot be inferred.'],
  ['Swiftfoot Boots',['Equip'],['Haste','Hexproof'],'Grant wording and reported Equip are different relationships.'],
  ["Gaea's Gift",[],['Reach','Trample','Hexproof','Indestructible'],'Several explicit temporary grants; empty keywords array.'],
  ['Hurricane',[],['Flying'],'Flying is a damage-recipient restriction, not a reported keyword.'],
  ['Nightmare',['Flying'],['Reach'],'Reminder text mentions reach; must not produce a Reach match.'],
  ['Odric, Lunarch Marshal',[],['Flying','Haste','Trample'],'Conditional grants are unreported; metadata absence is not mechanic absence.'],
  ['Lymph Sliver',[],['Absorb'],'Catalog-listed ability exists in grant text but has zero exact-label matches in snapshot.'],
  ['Virulent Sliver',[],['Poisonous'],'Catalog membership does not guarantee any card reports the label.'],
  ['Akawalli, the Seething Tower',['Descend'],['Descend 4','Descend 8'],'Coarse Descend label cannot establish either threshold.'],
  ['Baneslayer Angel',['Flying','Lifelink','First strike','Protection'],[],'Protection label does not encode protection qualities.'],
  ['Space Beleren',[],['Space Sculptor'],'Explicit text exists despite missing provider label and missing catalog entry.'],
  ['Blue Ribbon',['Equip'],['Best in show'],'Acorn wording not represented by matching metadata.'],
  ['The Soul Stone',['Indestructible'],['Harness'],'Action appears in actual text without corresponding keyword metadata.'],
];
const challenges = challengeSpecs.map(([name,present,absent,finding])=>{
  const c=witnessByName(name);
  for(const term of present) assert.ok(normalizedMembership(c,term), `${name} must report ${term}`);
  for(const term of absent) assert.ok(!normalizedMembership(c,term), `${name} unexpectedly reports ${term}`);
  assert.equal(normalizedMembership({...c, keywords:[]},'Flying'),false);
  assert.equal(normalizedMembership({...c, keywords:['Flying'],oracle_text:'Flying is lost. No abilities are possessed.'},'FLYING'),true);
  assert.equal(normalizedMembership({...c, keywords:['First strike']},'Strike'),false);
  return {name,finding,present,absent,result:'pass',card:projection(c)};
});
// Multi-face witness: metadata must not be assigned to every face.
const faceExample=sorted.find(c=>c.card_faces?.length>1 && c.keywords.some(k=>terms.some(t=>t.toLowerCase()===k.toLowerCase())) && c.card_faces.some(f=>!f.oracle_text));
const anyFace=faceExample ?? sorted.find(c=>c.card_faces?.length>1 && c.keywords.length);
assert.ok(anyFace);
challenges.push({name:anyFace.name,finding:'Record-level metadata does not identify its originating face. No face attribution is certified.',result:'recorded_boundary',card:projection(anyFace)});
const witnessIds = [...new Set([...results.flatMap(r=>r.examples.slice(0,1).map(c=>c.id)),...results.filter(r=>!r.all_card_count).flatMap(r=>r.literal_text_examples.slice(0,1).map(c=>c.id)),...challenges.map(r=>r.card.id)])].sort();
const witnesses=witnessIds.map(id=>projection(allById.get(id)));

// Optional online endpoint consistency check is separately pinned and is not
// independent corroboration of Scryfall's underlying taxonomy.
let endpoint = null;
try {
  const receiptBytes = await readFile(path.join(dir,'endpoint-check.json'));
  const receipt = JSON.parse(receiptBytes);
  assert.deepEqual(receipt.requested_ids,witnessIds,'Endpoint samples no longer match this audit');
  const live = new Map();
  for(const part of receipt.responses){
    const bytes=await readFile(path.join(dir,part.file));assert.equal(sha(bytes),part.sha256);
    const response=JSON.parse(bytes);assert.equal(response.object,'list');assert.equal(response.not_found?.length??0,0);assert.notEqual(response.has_more,true);
    for(const card of response.data){assert.ok(!live.has(card.id));live.set(card.id,card);}
  }
  assert.equal(live.size,witnessIds.length);
  const mismatches=[];
  for(const id of witnessIds){const c=live.get(id);assert.ok(c);const bulk=allById.get(id);for(const field of ['oracle_id','keywords','oracle_text','type_line','layout','card_faces','games','legalities'])if(JSON.stringify(c[field])!==JSON.stringify(bulk[field]))mismatches.push({id,name:bulk.name,field});}
  endpoint={receipt_path:`${snapshotPath}/endpoint-check.json`,sha256:sha(receiptBytes),card_count:live.size,mismatches,completed_at:receipt.completed_at,claim:'Sampled consistency between the bulk snapshot and live collection endpoint; same provider, not independent validation.'};
} catch(error) { if(error.code!=='ENOENT'||error.path!==path.join(dir,'endpoint-check.json')) throw error; }
const observed=results.filter(r=>r.all_card_count>0);
const candidateManifest=candidates.map(r=>[r.id,r.provider_keyword_candidate]).sort((a,b)=>a[0]<b[0]?-1:1);
const data={audit_version:1,candidate_manifest_sha256:sha(JSON.stringify(candidateManifest)),snapshot_path:snapshotPath,manifest_sha256:sha(manifestBytes),bulk_updated_at:manifest.bulk.updated_at,
  scope:'All Oracle card records, with separate paper + Commander-legal counts. Exact case-insensitive keyword membership only.',
  normalization:'String.toLowerCase; no trim, punctuation removal, stemming, substring, alias expansion or inference.',
  totals:{card_records:cards.length,unique_oracle_ids:oracles.size,unique_keyword_labels:index.size,empty_keyword_records:emptyKeywords,multi_face_records:multiface,
    candidate_rows:candidates.length,distinct_candidate_labels:terms.length,observed_labels:observed.length,not_observed_labels:terms.length-observed.length,
    observed_paper_commander_labels:observed.filter(r=>r.paper_commander_legal_count>0).length,
    observed_beyond_existing_eight:observed.filter(r=>!['Flying','Trample','Deathtouch','Vigilance','Haste','Menace','Reach','Lifelink'].includes(r.term)).length},
  sources:[{url:manifest.bulk.jsonl_download_uri??manifest.bulk.download_uri,sha256:sha(compressed)},...manifest.requests.filter(r=>r.url.includes('/catalog/')).map(r=>({url:r.url,sha256:r.sha256}))],
  catalogs:Object.fromEntries(Object.entries(catalogs).map(([k,v])=>[k,{count:v.length,labels:v}])),
  tests:{raw_hash_checks:manifest.requests.length,full_scan_label_comparisons:results.length,challenge_assertions:challengeSpecs.length,metamorphic_assertions:challengeSpecs.length*3,duplicate_printing_and_oracle_ids:'none; asserted',malformed_keyword_arrays:'none; asserted'},
  endpoint_check:endpoint,results,challenges,
  limits:['Observed labels are not proof of complete coverage or inherent possession; grants and reminder text need separate evidence.',
    'No precision/recall estimate for semantic mechanics: no independently labeled full-card ground truth was supplied.',
    'Catalog agreement supports provider terminology, not source category equivalence or card legality.',
    'Color-pie-to-keyword semantic links beyond the original eight remain proposed even when a provider label is observed.',
    'No runtime detector or discovery whitelist is expanded by this report.'],
};
const outputs=[['metadata-validation.json',JSON.stringify(data,null,2)+'\n'],['endpoint-witnesses.json',JSON.stringify({snapshot_path:snapshotPath,ids:witnessIds,cards:witnesses},null,2)+'\n']];
for(const [file,text]of outputs){if(process.argv.includes('--check'))assert.equal(await readFile(path.join(report,file),'utf8'),text,`Stale ${file}`);else await writeFile(path.join(report,file),text);}
console.log(JSON.stringify({totals:data.totals,tests:data.tests,endpoint_check:endpoint?{cards:endpoint.card_count,mismatches:endpoint.mismatches.length}:null,witness_count:witnessIds.length,missing:results.filter(r=>!r.all_card_count).map(r=>r.term)},null,2));
