import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {VARIANT_LABELS,VARIANT_REVIEW,VARIANT_EXPLANATIONS,VARIANT_RULE_CLAUSES} from '../public/mechanic-variants.mjs';
import {indexMechanics} from '../public/mechanics.mjs';
import {MECHANIC_EXPLANATIONS} from '../public/mechanic-explanations.mjs';
import {mechanicExplanation,mechanicRule,RULES_REVISION} from '../public/mechanic-rules.mjs';
import {safeCard,buildQuery} from '../lib/scryfall.mjs';
import {loadCatalog,validateVariantRegistry} from '../lib/catalog.mjs';
import {queryHash} from '../lib/mechanic-discovery.mjs';
import {extractRules} from '../scripts/extract-rules.mjs';

const bytes=p=>fs.readFileSync(new URL('../'+p,import.meta.url));
const read=p=>JSON.parse(bytes(p));
const hash=b=>createHash('sha256').update(b).digest('hex');
const fixture=read('tests/fixtures/mechanics/variants.json');
const proof=read('reports/mechanic-variants-20261018/verification.json');
const rules=read('public/rules-data.json');
const registry=read('inputs/mechanic-discovery.variants.json');
const atlas=read('inputs/atlas_v2.1.json');
const catalog=await loadCatalog(fileURLToPath(new URL('..',import.meta.url)));
const cardFor=id=>fixture.cards.find(x=>x.card.oracle_id===id).card;
const deck=cards=>({rows:cards.map((card,i)=>({id:`row-${i}`,lineNumber:i+1,playable:true,status:'resolved',quantity:1,card:safeCard(card)}))});

test('exactly the 20 approved labels have real, unmodified Scryfall positive and family-negative fixtures',()=>{
  assert.equal(VARIANT_LABELS.length,20);assert.equal(new Set(VARIANT_LABELS.map(l=>l.key)).size,20);
  const approved=read('reports/mechanic-gaps-20261018/gap-audit.json').proposals.filter(p=>p.priority<=2).map(p=>p.label);
  assert.deepEqual(VARIANT_LABELS.map(l=>l.term),approved);
  assert.equal(hash(bytes('tests/fixtures/mechanics/variants.json')),VARIANT_REVIEW.evidenceSha256);
  assert.equal(proof.fixtureSha256,VARIANT_REVIEW.evidenceSha256);assert.equal(proof.pass,true);
  const raw=bytes('reports/mechanic-variants-20261018/'+fixture.responseFile);
  assert.equal(hash(raw),fixture.responseSha256);
  assert.deepEqual(fixture.cards.map(c=>c.card),JSON.parse(raw).data);
  assert.deepEqual(fixture.cases.map(c=>c.label),approved);
  for(const item of fixture.cases){
    const positive=cardFor(item.positive),negative=cardFor(item.negative);
    const term=indexMechanics(deck([positive])).terms.find(t=>t.key===item.label.toLowerCase());
    assert.ok(term?.reviewed,item.label);assert.equal(term.audited,false);
    assert.equal(term.classification.review,VARIANT_REVIEW.version);
    assert.equal(term.relationship,'provider_reports');assert.equal(term.cards[0].oracleId,item.positive);
    assert.equal(indexMechanics(deck([negative])).terms.find(t=>t.key===term.key),undefined,item.label);
  }
});

test('all 20 approved queries have complete retained live results and exact Oracle-ID membership evidence',()=>{
  assert.equal(proof.queries.length,20);assert.equal(registry.records.length,20);
  validateVariantRegistry(registry,atlas);
  for(const receipt of proof.queries){
    const raw=bytes('reports/mechanic-variants-20261018/'+receipt.responseFile),result=JSON.parse(raw);
    assert.equal(hash(raw),receipt.responseSha256);assert.equal(result.has_more,false);
    assert.equal(result.data.length,result.total_cards);assert.equal(receipt.totalCards,result.total_cards);
    assert.ok(result.data.length>0);assert.ok(result.data.some(c=>c.oracle_id===receipt.positive.oracleId));
    assert.ok(!result.data.some(c=>c.oracle_id===receipt.negative.oracleId));
    for(const c of result.data){assert.ok(c.keywords.some(k=>k.toLowerCase()===receipt.key));assert.equal(c.legalities.commander,'legal');}
    const mapping=registry.records.find(r=>r.key===receipt.key),record=catalog.records.find(r=>r.discovery.key===receipt.key);
    assert.equal(mapping.expression,`kw:${JSON.stringify(receipt.label)}`);
    assert.equal(mapping.validation.query,receipt.expression);assert.equal(mapping.querySha256,queryHash(receipt.expression));
    assert.deepEqual(mapping.validation.positive,[receipt.positive.name]);assert.deepEqual(mapping.validation.negative,[receipt.negative.name]);
    assert.equal(record.atlas.auto_execute,false);assert.equal(record.atlas.tier,'Review');
    assert.equal(record.atlas.live_count,receipt.totalCards);
    assert.equal(buildQuery(catalog,record.atlas_row_id,['W','U','B','R','G']),receipt.query);
  }
  assert.equal(catalog.records.length,332+42);assert.equal(catalog.stats.supplementalRows,36+42);
  assert.equal(catalog.stats.reviewedSupplementalLabels,52+42);
});

test('new references contain only exact official clauses and the verified Wizards Descend excerpt',()=>{
  const extracted=extractRules(bytes('evidence/MagicCompRules-20260925.txt'));
  assert.equal(proof.sources[0].sha256,RULES_REVISION.sourceSha256);
  for(const [n,text] of Object.entries(VARIANT_RULE_CLAUSES))assert.equal(text,extracted.rules[n].text,n);
  for(const [key,reference] of Object.entries(VARIANT_EXPLANATIONS)){
    assert.equal(reference.summary,undefined);assert.equal(reference.verification,'verified');
    assert.equal(mechanicRule(rules,key),null,'Variants must not pretend to have exact family headings');
    assert.equal(mechanicExplanation(rules,key),reference);assert.ok(Object.isFrozen(reference));
    for(const n of reference.rules){
      assert.equal(VARIANT_RULE_CLAUSES[n],rules.rules[n].text);
      assert.equal(mechanicExplanation({...rules,rules:{...rules.rules,[n]:{text:'changed'}}},key),null);
    }
  }
  const descend=VARIANT_EXPLANATIONS.descend,receipt=proof.sources.find(s=>s.kind==='article');
  assert.equal(descend.quote,receipt.quote);assert.equal(hash(descend.quote),receipt.quoteSha256);
  assert.equal(descend.source.url,receipt.url);assert.equal(new URL(receipt.url).hostname,'magic.wizards.com');
  assert.ok(descend.quote.split(/\s+/).length<=25);assert.deepEqual(descend.rules,['207.2c']);
  assert.ok(VARIANT_EXPLANATIONS.nightbound.rules.includes('702.145g'));
});

test('new registries fail closed for missing, broadened, duplicated, or unproven searches',()=>{
  for(const mutate of [
    r=>r.records.pop(),r=>r.rows.pop(),r=>r.records[0].validation.negative=[],
    r=>r.auditSha256='wrong',r=>r.records[0].execution='automatic',
    r=>{r.rows[0].id=atlas.rows[0].id;r.records[0].atlasRowId=atlas.rows[0].id;},
    r=>{r.rows[0].query='o:ninjutsu';r.records[0].expression='o:ninjutsu';r.records[0].validation.query='o:ninjutsu';r.records[0].querySha256=queryHash('o:ninjutsu');},
    r=>{r.rows[0].id=r.rows[1].id;r.records[0].atlasRowId=r.rows[1].id;},
  ]){const changed=structuredClone(registry);mutate(changed);assert.throws(()=>validateVariantRegistry(changed,atlas));}
});

test('Jump reference requires Cid as a contributing Oracle identity; Direct Current keeps Jump-start separately',()=>{
  const cid=cardFor(fixture.jump.cid),direct=cardFor(fixture.jump.directCurrent),reference=MECHANIC_EXPLANATIONS.jump;
  assert.deepEqual(reference.cardOracleIds,[fixture.jump.cid]);assert.deepEqual(reference.rules,[]);
  const official=proof.sources.find(s=>s.kind==='card-example');
  assert.equal(reference.source.url,official.url);assert.equal(reference.source.section,official.cardName);
  assert.equal(reference.referenceKind,'card-example');assert.equal(reference.generalReference,undefined);
  assert.equal(mechanicExplanation(rules,'Jump',[cid.oracle_id]),reference);
  assert.equal(mechanicExplanation(rules,'Jump',[direct.oracle_id,cid.oracle_id]),reference);
  for(const ids of [undefined,null,[],[direct.oracle_id],[cid.name],[cid.id],cid.oracle_id])assert.equal(mechanicExplanation(rules,'Jump',ids),null);
  assert.equal(mechanicExplanation(null,'Jump',[cid.oracle_id]),null);
  const terms=indexMechanics(deck([direct])).terms;
  assert.ok(terms.some(t=>t.label==='Jump'));assert.ok(terms.some(t=>t.label==='Jump-start'));
  assert.equal(terms.find(t=>t.label==='Jump').category,'provider-reported term');
  assert.ok(mechanicRule(rules,'Jump-start'));
  assert.equal(catalog.records.find(r=>r.discovery.key==='jump'),undefined);
  assert.ok(catalog.records.find(r=>r.discovery.key==='jump-start'));
});

test('unknown labels, text-only mechanics, spellings and absent data retain the existing conservative behavior',()=>{
  const mycoid=fixture.cards.find(x=>x.card.name==='Broodrage Mycoid').card;
  assert.match(mycoid.oracle_text,/descended this turn/);
  assert.ok(!indexMechanics(deck([mycoid])).terms.some(t=>t.key==='descend'));
  const base=cardFor(fixture.jump.directCurrent);
  const extra={...base,keywords:['Future label',' Daybound','Doctor’s companion'],oracle_text:'Daybound. You become the monarch. Descend 4.'};
  for(const term of indexMechanics(deck([extra])).terms){
    assert.equal(term.reviewed,false);assert.equal(mechanicExplanation(rules,term.label),null);
    assert.equal(catalog.records.find(r=>r.discovery.key===term.key),undefined);
  }
  for(const name of ['Court of Grace','Aether Hub']){
    const c=fixture.cards.find(x=>x.card.name===name).card;
    assert.equal(indexMechanics(deck([c])).terms.length,c.keywords.length);
    assert.ok(!indexMechanics(deck([c])).terms.some(t=>['monarch','energy'].includes(t.key)));
  }
  assert.equal(indexMechanics(deck([{...base,keywords:[]}])).terms.length,0);
  assert.equal(indexMechanics(deck([{...base,keywords:undefined}])).coverage.missingEntries,1);
});
