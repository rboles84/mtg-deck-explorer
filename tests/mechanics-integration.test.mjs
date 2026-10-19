import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {indexMechanics} from '../public/mechanics.mjs';
import vocabulary from '../public/mechanics-vocabulary.mjs';
import {parseDeck,resolveDeck,commanderContext,analyzeFlavor} from '../public/core.mjs';
import {safeCard} from '../lib/scryfall.mjs';
import {addClipboard,exportClipboard} from '../public/clipboard.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url)));
const audit=read('../reports/mechanics-coverage/metadata-validation.json');
const captures=Object.fromEntries(['cosmic','dionus'].map(name=>[name,read(`../reports/mechanics-integration/decks/${name}.json`)]));
const imported=name=>{const {text,result}=captures[name];return resolveDeck(parseDeck(text),result.cards,result.notFound);};
const row=(card,quantity=1,id='r1')=>({id,lineNumber:1,playable:true,status:'resolved',quantity,card});
const deck=cards=>({rows:cards.map((c,i)=>row(c,1,`r${i}`))});

test('captured response hashes and exact printing fields survive the existing safe projection',()=>{
  const root='../reports/mechanics-integration/decks/',manifest=read(root+'manifest.json');
  for(const entry of [...manifest.requests,...manifest.decks])assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL(root+entry.file,import.meta.url))).digest('hex'),entry.sha256);
  const raw=new Map(manifest.requests.flatMap(r=>read(root+r.file).data).map(c=>[c.id,c]));
  for(const capture of Object.values(captures))for(const card of capture.result.cards){
    const original=raw.get(card.id);assert.ok(original);const projected=safeCard(original);assert.deepEqual(projected.finishes,original.finishes);assert.deepEqual(projected.flavor_name,original.flavor_name);delete projected.finishes;delete projected.flavor_name;assert.deepEqual(projected,card);
    for(const field of ['id','oracle_id','name','oracle_text','flavor_text','keywords'])assert.deepEqual(card[field],original[field]);
    for(const size of ['small','normal','large'])assert.equal(card.image_uris?.[size],original.image_uris?.[size]);
    for(const [i,face] of (card.card_faces||[]).entries())for(const size of ['small','normal','large'])assert.equal(face.image_uris?.[size],original.card_faces[i].image_uris?.[size]);
    for(const [i,face] of (card.card_faces||[]).entries())for(const field of ['name','oracle_text','flavor_text'])assert.deepEqual(face[field],original.card_faces[i][field]);
  }
});

test('296 observed labels are unique and exactly pinned to audit; all 16 failures excluded',()=>{
  assert.equal(vocabulary.labels.length,296);assert.equal(new Set(vocabulary.labels.map(r=>r.key)).size,296);
  assert.equal(vocabulary.auditSha256,crypto.createHash('sha256').update(fs.readFileSync(new URL('../reports/mechanics-coverage/metadata-validation.json',import.meta.url))).digest('hex'));
  assert.deepEqual(vocabulary.labels.map(r=>r.key).sort(),audit.results.filter(r=>r.status==='observed_exact_metadata').map(r=>r.term.toLowerCase()).sort());
  const failures=audit.results.filter(r=>r.status!=='observed_exact_metadata');assert.equal(failures.length,16);
  for(const r of failures)assert.ok(!vocabulary.labels.some(v=>v.key===r.term.toLowerCase()));
  for(const term of ['Plot','Start Your Engines!','Parade!'])assert.equal(vocabulary.labels.find(r=>r.key===term.toLowerCase()).category,'other provider-reported term');
  assert.equal(vocabulary.labels.find(r=>r.key==='mill').category,'keyword action');
  assert.equal(vocabulary.labels.find(r=>r.key==='landfall').category,'ability word');
});

test('exact lowercase comparison only; preserve spellings; unknown and failed candidates visible but unmapped',()=>{
  const result=indexMechanics(deck([{id:'p1',oracle_id:'o1',keywords:['Flying','FLYING',' Flying','Fly-ing','Absorb','New Term']}])).terms;
  assert.equal(result.length,5);const flying=result.find(r=>r.key==='flying');assert.deepEqual(flying.spellings,['Flying','FLYING']);assert.equal(flying.copies,1);
  assert.equal(flying.cards[0].rows[0].occurrences.length,2);
  for(const r of result.filter(r=>r!==flying))assert.equal(r.audited,false);
});

test('same Oracle ID deduplicates cards, retaining alternate printings, rows, quantities and exact flavor',()=>{
  const base=captures.cosmic.result.cards[0],a={...base,keywords:['Flying']},b={...a,id:'alternate',flavor_text:'Different exact passage.'};
  const input={rows:[row(a,2,'r1'),row(b,3,'r2'),row(a,4,'r3')]},before=JSON.stringify(input);
  let clipboard=addClipboard([],base,'keyword-index-flying');clipboard=addClipboard(clipboard,base,'keyword-index-flying');const exported=exportClipboard(clipboard);
  const term=indexMechanics(input).terms[0];assert.equal(term.distinctCards,1);assert.equal(term.copies,9);assert.equal(term.cards[0].rows.length,3);
  assert.deepEqual(term.cards[0].rows.map(r=>r.printingId),[a.id,b.id,a.id]);assert.equal(JSON.stringify(input),before);assert.equal(exportClipboard(clipboard),exported);
});

test('missing and malformed arrays survive projection distinctly from empty metadata; partial imports remain explicit',()=>{
  const base=captures.dionus.result.cards[0];
  const missing={...base};delete missing.keywords;
  const cards=[missing,{...base,keywords:null},{...base,keywords:['Crew',17]},{...base,keywords:[]}, {...base,keywords:['Crew']}].map(safeCard);
  assert.deepEqual(cards.map(c=>c.keywords_status),['missing','malformed','malformed','reported','reported']);
  const input=deck(cards);input.rows.push({...row(null,5,'unresolved'),status:'not-found'});
  input.rows.push({...row({...base,keywords:['Haste']},2,'sideboard'),playable:false});
  const index=indexMechanics(input);assert.equal(index.coverage.entries,6);assert.equal(index.coverage.resolvedEntries,5);assert.equal(index.coverage.reportedEntries,2);assert.equal(index.coverage.missingEntries,1);assert.equal(index.coverage.malformedEntries,2);assert.equal(index.coverage.emptyEntries,1);assert.deepEqual(index.terms.map(r=>r.key),['crew']);
});

test('actual provider witnesses never promote grants, references, reminder text, numeric thresholds or face possession',()=>{
  // These are retained actual provider fields; semantic negatives are explicit abstentions.
  const names=['Lightning Greaves','Swiftfoot Boots',"Gaea's Gift",'Hurricane','Nightmare','Akawalli, the Seething Tower','Lymph Sliver'];
  const all=audit.challenges;
  const flatten=value=>Array.isArray(value)?value.flatMap(flatten):value&&typeof value==='object'?[...(value.name&&Array.isArray(value.keywords)?[value]:[]),...Object.values(value).flatMap(flatten)]:[];
  const witnesses=flatten(all);
  for(const name of names){const card=witnesses.find(c=>c.name===name);assert.ok(card,`Actual witness ${name}`);
    const index=indexMechanics(deck([card]));assert.deepEqual(index.terms.map(r=>r.key).sort(),[...new Set(card.keywords.map(k=>k.toLowerCase()))].sort());
    for(const term of index.terms){assert.equal(term.relationship,'provider_reports');assert.equal(term.cards[0].rows[0].face,null);assert.ok(!('has' in term));assert.ok(!('grants' in term));}
    if(['Lightning Greaves','Swiftfoot Boots'].includes(name))assert.deepEqual(index.terms.map(r=>r.key),['equip']);
    if(["Gaea's Gift",'Hurricane','Lymph Sliver'].includes(name))assert.equal(index.terms.length,0);
    if(name==='Nightmare')assert.ok(!index.terms.some(r=>r.key==='reach'));
    if(name.startsWith('Akawalli'))assert.ok(!index.terms.some(r=>/descend [48]/.test(r.key)));
  }
  const multi=captures.cosmic.result.cards.find(c=>c.card_faces?.length>1&&c.keywords.length);assert.ok(multi);
  for(const term of indexMechanics(deck([multi])).terms)assert.equal(term.cards[0].rows[0].face,null);
});

test('captured Cosmic → Dionus → Cosmic and repeat are deterministic; all current labels survive without network',()=>{
  const oldFetch=globalThis.fetch;globalThis.fetch=()=>{throw new Error('No network allowed while indexing');};
  try{
    const results=[];
    for(const name of ['cosmic','dionus','cosmic','cosmic']){
      const resolved=imported(name),before=JSON.stringify(resolved),index=indexMechanics(resolved),identity=commanderContext(resolved),flavor=analyzeFlavor(resolved);
      const expected=[...new Set(resolved.rows.filter(r=>r.playable&&r.status==='resolved').flatMap(r=>r.card.keywords.map(k=>k.toLowerCase())))].sort();
      assert.deepEqual(index.terms.map(r=>r.key),expected);assert.equal(index.coverage.copies,parseDeck(captures[name].text).counts.playableQuantity);
      assert.ok(identity.rowIds.length);assert.equal(flavor.passages.length,analyzeFlavor(resolved).passages.length);assert.equal(JSON.stringify(resolved),before);
      commanderContext(resolved,[]);assert.deepEqual(indexMechanics(resolved),index);results.push(index);
    }
    assert.deepEqual(results[0],results[2]);assert.deepEqual(results[2],results[3]);
    const d=results[1];assert.ok(!d.terms.some(r=>r.key==='deathtouch'));
    for(const key of ['crew','station','mill','equip'])assert.ok(d.terms.some(r=>r.key===key));
  }finally{globalThis.fetch=oldFetch;}
});
