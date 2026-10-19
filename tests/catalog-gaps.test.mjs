import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {hash,DIR,cards,fields,matches} from '../scripts/verify-catalog-gaps.mjs';
import {GAP_SPECS} from '../scripts/catalog-gap-spec.mjs';
import {CATALOG_GAPS,CATALOG_GAP_REVIEW} from '../public/catalog-gap-data.mjs';
import {catalogGapEvidence,indexMechanics} from '../public/catalog-gap-index.mjs';
import {indexMechanics as providerIndex} from '../public/mechanics.mjs';
import {mechanicExplanation,mechanicRule} from '../public/catalog-gap-references.mjs';
import {loadCatalog} from '../lib/catalog.mjs';
import {validateCatalogGapRegistry} from '../lib/catalog-gap-registry.mjs';
import {createScryfallClient,buildQuery,safeCard} from '../lib/scryfall.mjs';
import {queryHash} from '../lib/mechanic-discovery.mjs';
import {REFERENCE_UPDATES} from '../scripts/catalog-gap-reference-updates.mjs';
const read=p=>JSON.parse(fs.readFileSync(p));
const proof=read(DIR+'/verification.json'),rules=read('public/rules-data.json');
const catalog=await loadCatalog(process.cwd());
const registry=read('lib/mechanic-discovery.catalog-gaps.json'),atlas=read('inputs/atlas_v2.1.json');
const deck=cs=>({rows:cs.map((card,i)=>({id:`row-${i}`,lineNumber:i+1,playable:true,status:'resolved',quantity:2,card}))});

test('all 373 retained and live catalog names have exact reviewed detection scope, sources, and manual searches',()=>{
  assert.equal(hash(fs.readFileSync(DIR+'/verification.json')),CATALOG_GAP_REVIEW.evidenceSha256);
  assert.equal(CATALOG_GAPS.length,42);assert.equal(new Set(CATALOG_GAPS.map(g=>g.key)).size,42);
  assert.equal(catalog.records.length,374); // One existing non-catalog label: Eternity Gate.
  const names=proof.catalogs.flatMap(c=>c.names);assert.equal(names.length,373);assert.equal(new Set(names).size,373);
  for(const name of names)assert.equal(catalog.records.filter(r=>r.master_name.toLowerCase()===name.toLowerCase()).length,1,name);
  for(const c of proof.catalogs){const bytes=fs.readFileSync(`${DIR}/${c.receipt.file}`);assert.equal(hash(bytes),c.receipt.sha256);assert.deepEqual(JSON.parse(bytes).data,c.names);}
  for(const gap of CATALOG_GAPS){assert.ok(mechanicExplanation(rules,gap.term));assert.ok(catalog.records.some(r=>r.discovery.key===gap.key));}
});

for(const p of proof.rows)test(`${p.label}: real positive/negative detection, source, retained live search and Commander scope`,()=>{
  const spec=GAP_SPECS.find(g=>g.key===p.key),record=catalog.records.find(r=>r.discovery.key===p.key);
  for(const [positive,list] of [[true,p.positives],[false,p.negatives]])for(const c of list){
    const snapshot=cards.find(item=>item.oracle_id===c.oracle_id);assert.ok(snapshot,c.name);
    assert.equal(matches(spec,snapshot),positive,c.name);
    const result=indexMechanics(deck([snapshot]));
    assert.equal(result.terms.some(t=>t.key===p.key),positive,c.name);
    if(positive){const term=result.terms.find(t=>t.key===p.key);assert.ok(term.reviewed);assert.equal(term.copies,2);assert.equal(term.distinctCards,1);}
  }
  for(const type of ['membership','commander']){
    const receipt=p.validation[type],bytes=fs.readFileSync(`${DIR}/${receipt.file}`),response=JSON.parse(bytes);
    assert.equal(hash(bytes),receipt.sha256);assert.ok(!response.warnings?.length);
    if(type==='membership'){
      assert.equal(response.has_more,false);
      const ids=response.data.map(c=>c.oracle_id);
      for(const c of p.positives)assert.ok(ids.includes(c.oracle_id));
      for(const c of p.negatives)assert.ok(!ids.includes(c.oracle_id));
    }else{
      assert.equal(response.total_cards||0,p.validation.commanderTotal);
      assert.equal(new URL(receipt.url).searchParams.get('q'),buildQuery(catalog,record.atlas_row_id,['W','U','B','R','G']));
      for(const c of response.data||[]){assert.equal(c.legalities.commander,'legal');assert.ok(matches(spec,c),c.name);}
      if(!p.validation.commanderTotal){assert.equal(receipt.status,404);assert.equal(response.code,'not_found');}
    }
  }
  assert.equal(record.atlas.auto_execute,false);assert.equal(record.atlas.tier,'Review');assert.equal(record.discovery.execution,'manual');
});

test('the entire 38,753-card snapshot retains all original metadata evidence; added excerpts are literal source slices',()=>{
  assert.equal(cards.length,38753);
  let added=0;
  for(const card of cards){
    const d=deck([card]),before=JSON.stringify(d),base=providerIndex(d),next=indexMechanics(d);
    assert.deepEqual(next.coverage,base.coverage);
    for(const old of base.terms){
      const term=next.terms.find(t=>t.key===old.key);assert.ok(term,card.name+': '+old.label);
      assert.deepEqual(term.cards,old.cards);assert.equal(term.copies,old.copies);
      if(!CATALOG_GAPS.some(g=>g.key===old.key))assert.deepEqual(term,old);
    }
    for(const term of next.terms.filter(t=>t.hasOracleEvidence))for(const row of term.cards[0].rows)for(const o of row.occurrences){
      if(!o.sourceField)continue;
      const f=fields(card).find(f=>f.field===o.sourceField);assert.ok(f);
      assert.equal(f.text.slice(o.index,o.index+o.spelling.length),o.spelling);added++;
    }
    assert.equal(JSON.stringify(d),before);
  }
  assert.ok(added>10000);
});

test('all new rule clauses are exact Wizards text; article references have bytes; provider examples never impersonate Wizards',()=>{
  const raw=fs.readFileSync('evidence/MagicCompRules-20260925.txt','utf8');
  const sourceProof=read(DIR+'/sources.json');
  for(const g of CATALOG_GAPS){
    const e=mechanicExplanation(rules,g.term);assert.ok(e);assert.equal('summary' in e,false);assert.equal('quote' in e,false);
    assert.equal(mechanicExplanation(null,g.term),null);
    assert.equal(mechanicExplanation({...rules,sourceSha256:'changed'},g.term),null);
    for(const [number,text] of Object.entries(g.clauses)){
      assert.equal(rules.rules[number].text,text);assert.ok(raw.includes(text));
      assert.equal(mechanicExplanation({...rules,rules:{...rules.rules,[number]:{text:'changed'}}},g.term),null);
    }
    if(e.source){
      const host=new URL(e.source.url).hostname;
      if(REFERENCE_UPDATES.has(g.key)){
        assert.deepEqual(e,REFERENCE_UPDATES.get(g.key));assert.equal(e.definitionVerified,false);assert.deepEqual(e.rules,[]);
      }else if(e.referenceKind==='provider-card-example'){
        assert.equal(host,'scryfall.com');assert.equal(e.verification,'provider-card-example');assert.deepEqual(e.rules,[]);
        const p=proof.rows.find(p=>p.key===g.key);assert.equal(e.source.section,p.positives[0].name);
      }else{
        assert.equal(host,'magic.wizards.com');const s=sourceProof.sources.find(s=>s.labels.includes(g.term));assert.ok(s);
        const bytes=fs.readFileSync(`${DIR}/${s.file}`);assert.equal(hash(bytes),s.sha256);assert.equal(e.source.sourceSha256,s.sha256);
        assert.equal(e.source.url,s.url);assert.equal(s.status,200);
      }
    }
  }
});

test('text recognition does not infer semantics, include names/flavor, merge faces, or double-count metadata and grants',()=>{
  const c={id:'test',oracle_id:'identity',name:'Absorb Counter Tap',flavor_text:'poisonous 1',keywords:[],oracle_text:'Put a +1/+1 counter that lasts on it. This permanent enters tapped.'};
  assert.equal(catalogGapEvidence(c).size,0);
  assert.equal(catalogGapEvidence({...c,oracle_text:'This spell cannot be countered.'}).has('counter'),false,'unreviewed alternate wording stays absent');
  assert.equal(catalogGapEvidence({...c,oracle_text:'Counter target activated or triggered ability.'}).has('counter'),true);
  assert.equal(catalogGapEvidence({...c,oracle_text:'{T}: Add {G}.'}).has('tap'),true);
  assert.equal(catalogGapEvidence({...c,oracle_text:'{Q}: Draw a card.'}).has('untap'),true);
  assert.equal(catalogGapEvidence({...c,oracle_text:'',card_faces:[{oracle_text:'have absorb'},{oracle_text:'1.'}]}).has('absorb'),false);
  const dual={...c,keywords:['Absorb'],oracle_text:'All Slivers have absorb 1.',card_faces:[{oracle_text:'Absorb 1'}]};
  const d=deck([dual,{...dual,id:'alternate'}]);
  const term=indexMechanics(d).terms.find(t=>t.key==='absorb');
  assert.equal(term.copies,4);assert.equal(term.distinctCards,1);assert.equal(term.cards[0].rows.length,2);
  assert.equal(term.cards[0].rows[0].occurrences.length,3);assert.ok(term.cards[0].rows[0].occurrences.some(o=>o.face===0));
  assert.equal(indexMechanics({...d,synthetic:true}).terms[0].hasOracleEvidence,undefined);
  for(const keywords of [undefined,null,{},[],['Unknown future mechanic']]){
    const result=indexMechanics(deck([{...c,keywords,oracle_text:'All Slivers have absorb 1.'}]));assert.ok(result.terms.some(t=>t.key==='absorb'));
  }
  assert.equal(indexMechanics({rows:[{...d.rows[0],playable:false}]}).terms.length,0);
  assert.equal(indexMechanics({rows:[{...d.rows[0],status:'not-found'}]}).terms.length,0);
  assert.equal(catalogGapEvidence({...c,oracle_text:'a'.repeat(50001)}).size,0);
});

test('new queries fail closed for widened expressions even if a caller recomputes hashes',()=>{
  validateCatalogGapRegistry(registry,atlas);
  for(const mutate of [r=>r.rows.pop(),r=>r.records.pop(),r=>r.records[0].validation.status='unverified',r=>r.records[0].validation.positive=[],r=>r.rows[0].tier='Production-ready',r=>r.rows[0].auto_execute=true,r=>{
    r.rows[0].query='fo:poison';r.records[0].expression='fo:poison';r.records[0].validation.query='fo:poison';r.records[0].querySha256=queryHash('fo:poison');
  }]){const bad=structuredClone(registry);mutate(bad);assert.throws(()=>validateCatalogGapRegistry(bad,atlas));}
});

test('a successful HTTP response that ignored part of the query is rejected instead of broadened',async()=>{
  const client=createScryfallClient({minimumGap:0,fetchImpl:async()=>Response.json({object:'list',data:[],total_cards:0,has_more:false,warnings:['Invalid expression was ignored.']})});
  await assert.rejects(client.discover('(f:commander id<=g) (fo:/counter/)', ['G']),/complete search/);
});
