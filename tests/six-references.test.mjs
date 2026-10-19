import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadCatalog} from '../lib/catalog.mjs';
import {CATALOG_GAPS} from '../public/catalog-gap-data.mjs';
import {mechanicExplanation,mechanicSourceStatus} from '../public/catalog-gap-references.mjs';
import {indexMechanics} from '../public/catalog-gap-index.mjs';
import {hash} from '../scripts/verify-catalog-gaps.mjs';
const dir='reports/six-reference-update-20261019';
const read=p=>JSON.parse(fs.readFileSync(p));
const old=read(`${dir}/gaps-before.json`),receipts=read(`${dir}/receipts.json`),rules=read('public/rules-data.json');
const response=r=>{const bytes=fs.readFileSync(`${dir}/${r.file}`);assert.equal(hash(bytes),r.sha256);return JSON.parse(bytes);};
const card=response(receipts.find(r=>r.url==='https://api.scryfall.com/cards/cmb2/83'));

test('six reference updates preserve the whole 374-record catalog and all 42 detection specifications',async()=>{
  assert.deepEqual(await loadCatalog(process.cwd()),read(`${dir}/catalog-before.json`));
  assert.deepEqual(CATALOG_GAPS.map(({reference,...g})=>g),old.map(({reference,...g})=>g));
  const changed=CATALOG_GAPS.filter((g,i)=>JSON.stringify(g.reference)!==JSON.stringify(old[i].reference)).map(g=>g.term);
  assert.deepEqual(changed.sort(),['Actualize','Affinitycycling','Covercast',"Hero's Reward",'Kinfall','Landship'].sort());
  for(const g of CATALOG_GAPS.filter(g=>changed.includes(g.term))){
    assert.equal(g.reference.definitionVerified,false);assert.deepEqual(g.reference.rules,[]);
    assert.equal('quote' in g.reference,false);assert.equal('summary' in g.reference,false);
    assert.equal(mechanicExplanation(null,g.term),null);
    assert.equal(mechanicExplanation({...rules,sourceSha256:'wrong'},g.term),null);
  }
});

test('both playtest labels resolve to the same one unique card, with dated source counts and no Commander results',()=>{
  assert.equal(card.name,'Plane-Merge Elf');assert.equal(card.legalities.commander,'not_legal');
  for(const label of ['Kinfall','Landship']){
    const e=mechanicExplanation(rules,label),p=e.playtest;
    assert.equal(e.source.publisher,'Scryfall');assert.equal(e.referenceKind,'playtest-card-example');
    assert.equal(mechanicSourceStatus(label),'playtest-card-example');assert.equal(p.card,card.name);
    assert.equal(p.oracleId,card.oracle_id);assert.equal(p.commander,card.legalities.commander);
    const link=new URL(p.searchUrl);assert.equal(link.searchParams.get('include_extras'),'true');assert.equal(link.searchParams.get('unique'),'cards');
    const receipt=receipts.find(r=>new URL(r.url).search===link.search),found=response(receipt);
    assert.equal(receipt.status,200);assert.equal(found.has_more,false);assert.ok(!found.warnings?.length);
    assert.equal(found.total_cards,p.uniqueCards);assert.equal(found.data.length,1);
    assert.equal(found.data[0].oracle_id,card.oracle_id);assert.equal(p.checkedOn,receipt.checkedAt.slice(0,10));
    const commander=receipts.find(r=>new URL(r.url).searchParams.get('q')===`keyword:"${label}" f:commander id<=wubrg`);
    assert.equal(commander.status,404);assert.equal(response(commander).code,'not_found');
    assert.equal(e.supportingSource.publisher,'Wizards');assert.match(e.supportingSource.url,/mystery-booster-release-notes/);
  }
});

test('imported playtest cards stay detectable without turning nonlegal cards into Commander discoveries',()=>{
  const deck={rows:[{id:'test-card',lineNumber:1,quantity:1,playable:true,status:'resolved',card}]};
  const before=JSON.stringify(deck),result=indexMechanics(deck);
  for(const key of ['kinfall','landship']){
    const term=result.terms.find(t=>t.key===key);assert.ok(term);assert.equal(term.distinctCards,1);assert.equal(term.copies,1);
    const reference=mechanicExplanation(rules,term.label,[card.oracle_id]);assert.equal(reference.playtest.commander,'not_legal');
  }
  assert.equal(JSON.stringify(deck),before);
});

test('the four accepted references keep designer, archived discussion and official card examples distinct',()=>{
  const expected=[['Affinitycycling','designer-card-example','Gavin Verhey','www.youtube.com'],["Hero's Reward",'archived-mechanic-discussion','Wizards (archived)','web.archive.org'],['Actualize','official-card-example','Wizards','magic.wizards.com'],['Covercast','official-card-example','Wizards','magic.wizards.com']];
  for(const [label,kind,publisher,host] of expected){
    const e=mechanicExplanation(rules,label);assert.equal(e.referenceKind,kind);assert.equal(e.source.publisher,publisher);assert.equal(new URL(e.source.url).hostname,host);assert.equal(e.definitionVerified,false);
  }
});
