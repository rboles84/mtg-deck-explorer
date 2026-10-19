// Explicit, bounded verification of the 20 approved additions. Never run by the app
// or the offline suite. Retains unmodified API responses and real card witnesses.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {VARIANT_LABELS,VARIANT_EXPLANATIONS,VARIANT_RULE_CLAUSES} from '../public/mechanic-variants.mjs';
import {extractRules} from './extract-rules.mjs';

const root=new URL('../reports/mechanic-variants-20261018/',import.meta.url);
const fixturePath=new URL('../tests/fixtures/mechanics/variants.json',import.meta.url);
const captureFixtures=process.argv.includes('--capture');
if(captureFixtures&&fs.existsSync(fixturePath))throw new Error('Retained fixture already exists; refusing to overwrite it.');
const rules=JSON.parse(fs.readFileSync(new URL('../public/rules-data.json',import.meta.url)));
const hash=b=>createHash('sha256').update(b).digest('hex');
fs.mkdirSync(new URL('responses/',root),{recursive:true});
const proof={checkedAt:new Date().toISOString(),requests:[],sources:[],queries:[],pass:false};
const save=()=>fs.writeFileSync(new URL(captureFixtures?'verification.json':'live-verification.json',root),JSON.stringify(proof,null,2)+'\n');
let last=0;
async function capture(url,options={}){
  assert.ok(['api.scryfall.com','magic.wizards.com','media.wizards.com'].includes(new URL(url).hostname));
  await new Promise(r=>setTimeout(r,Math.max(0,550-(Date.now()-last))));last=Date.now();
  const response=await fetch(url,{...options,headers:{'User-Agent':'MTGDeckExplorer/2.1 (focused mechanic variant verification)',Accept:'application/json, text/plain, text/html',...options.headers},signal:AbortSignal.timeout(30000)});
  const bytes=Buffer.from(await response.arrayBuffer()),sha256=hash(bytes);
  const receipt={url,method:options.method??'GET',requestBody:options.body?JSON.parse(options.body):null,status:response.status,sha256,checkedAt:new Date().toISOString()};
  if(new URL(url).hostname==='api.scryfall.com'){
    receipt.file=`responses/${sha256}.json`;fs.writeFileSync(new URL(receipt.file,root),bytes);
  }
  proof.requests.push(receipt);save();
  assert.equal(response.status,200,`HTTP ${response.status}: ${url}; stopped without retries`);
  return {bytes,receipt};
}

const official=await capture(rules.sourceUrl);
assert.equal(hash(official.bytes),rules.sourceSha256);
const extracted=extractRules(official.bytes);
for(const [number,text] of Object.entries(VARIANT_RULE_CLAUSES)){
  assert.equal(rules.rules[number].text,text);
  // The same independently pinned raw source backs the local extraction.
  assert.equal(extracted.rules[number].text,text);
}
proof.sources.push({kind:'rules',url:rules.sourceUrl,sha256:rules.sourceSha256,clauses:Object.keys(VARIANT_RULE_CLAUSES)});save();
const descend=VARIANT_EXPLANATIONS.descend;
const article=await capture(descend.source.url);
const plain=article.bytes.toString('utf8').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
assert.ok(plain.includes(descend.quote));
proof.sources.push({kind:'article',url:descend.source.url,sha256:article.receipt.sha256,quote:descend.quote,quoteSha256:hash(descend.quote)});save();
const jumpUrl='https://magic.wizards.com/en/news/feature/final-fantasy-release-notes';
const jump=await capture(jumpUrl);
const blocks=jump.bytes.toString('utf8').match(/<p\b[^>]*>[\s\S]*?<\/p>/g)||[];
const jumpBlock=blocks.find(b=>b.includes('Cid, Freeflier Pilot')&&/Jump[\s\S]*During your turn, Cid has flying\./.test(b));
assert.ok(jumpBlock,'Named official card and Jump text must occur in the same paragraph');
proof.sources.push({kind:'card-example',url:jumpUrl,sha256:jump.receipt.sha256,cardName:'Cid, Freeflier Pilot',matchedBlockSha256:hash(jumpBlock),matchMethod:'named-card-and-label-in-same-paragraph'});save();

const witnesses=[
  ["Yuriko, the Tiger's Shadow",'Ninja of the Deep Hours'],
  ['Rose Tyler','Thrasios, Triton Hero'],
  ["Arlinn, the Pack's Hope",'Huntmaster of the Fells'],
  ["Arlinn, the Pack's Hope",'Huntmaster of the Fells'],
  ['Everflowing Chalice','Into the Roil'],
  ['Absorb Vis','Shoreline Ranger'],
  ['Shoreline Ranger','Twisted Abomination'],
  ['Twisted Abomination','Shoreline Ranger'],
  ['Oliphaunt','Elvish Aberration'],
  ['Elvish Aberration','Oliphaunt'],
  ['Vedalken Aethermage','Homing Sliver'],
  ['Homing Sliver','Vedalken Aethermage'],
  ['Hobbit Hole','Homing Sliver'],
  ['Anaconda','Mountain Goat'],
  ['Mountain Goat','Anaconda'],
  ['Graceful Antelope','Anaconda'],
  ['Hazezon, Shaper of Sand','Graceful Antelope'],
  ['Ayumi, the Last Visitor','Dryad Sophisticate'],
  ['Dryad Sophisticate','Ayumi, the Last Visitor'],
  ['Basking Capybara','Broodrage Mycoid'],
];
assert.equal(witnesses.length,VARIANT_LABELS.length);
const names=[...new Set([...witnesses.flat(),'Cid, Freeflier Pilot','Direct Current','Court of Grace','Aether Hub'])];
const collection=await capture('https://api.scryfall.com/cards/collection',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifiers:names.map(name=>({name}))})});
const data=JSON.parse(collection.bytes);assert.deepEqual(data.not_found,[]);
const cardFor=name=>{const c=data.data.find(c=>c.name===name||c.card_faces?.some(f=>f.name===name));assert.ok(c,name);return c;};
for(const name of names)cardFor(name);
const cases=[];
for(const [i,label] of VARIANT_LABELS.entries()){
  const expression=`kw:${JSON.stringify(label.term)}`,query=`(f:commander id<=wubrg) (${expression})`;
  const response=await capture('https://api.scryfall.com/cards/search?'+new URLSearchParams({q:query,unique:'cards',order:'name',dir:'asc',include_extras:'false'}));
  const result=JSON.parse(response.bytes);
  assert.equal(result.object,'list');assert.equal(result.has_more,false,'Bounded audit requires complete results');
  assert.equal(result.total_cards,result.data.length);
  for(const c of result.data){assert.ok(c.keywords.some(k=>k.toLowerCase()===label.key),`${label.term}: ${c.name}`);assert.equal(c.legalities.commander,'legal');}
  const [positive,negative]=witnesses[i].map(cardFor);
  assert.ok(positive.keywords.some(k=>k.toLowerCase()===label.key));
  assert.ok(!negative.keywords.some(k=>k.toLowerCase()===label.key));
  assert.ok(result.data.some(c=>c.oracle_id===positive.oracle_id));
  assert.ok(!result.data.some(c=>c.oracle_id===negative.oracle_id));
  const member=c=>({name:c.name,oracleId:c.oracle_id});
  const row={label:label.term,key:label.key,expression,query,totalCards:result.total_cards,responseFile:response.receipt.file,responseSha256:response.receipt.sha256,positive:member(positive),negative:member(negative),pass:true};
  proof.queries.push(row);cases.push({label:label.term,positive:positive.oracle_id,negative:negative.oracle_id});save();
  console.log(`PASS ${label.term}: ${result.total_cards} results; positive and negative membership verified`);
}
const cid=cardFor('Cid, Freeflier Pilot'),direct=cardFor('Direct Current');
assert.equal(cid.oracle_id,'d3bdfb25-dfb2-4df4-b502-ef0909a39f86');
assert.ok(cid.keywords.includes('Jump'));assert.match(cid.oracle_text,/Jump — During your turn, Cid has flying\./);
assert.ok(direct.keywords.includes('Jump'));assert.ok(direct.keywords.includes('Jump-start'));assert.doesNotMatch(direct.oracle_text,/Jump —/);
const fixture={capturedAt:proof.checkedAt,source:'https://api.scryfall.com/cards/collection',responseFile:collection.receipt.file,responseSha256:collection.receipt.sha256,cases,cards:data.data.map(card=>({card})),jump:{cid:cid.oracle_id,directCurrent:direct.oracle_id}};
if(captureFixtures)fs.writeFileSync(fixturePath,JSON.stringify(fixture,null,2)+'\n');
proof.fixtureSha256=hash(fs.readFileSync(fixturePath));proof.pass=true;save();
console.log(`Fixture SHA-256: ${proof.fixtureSha256}`);
