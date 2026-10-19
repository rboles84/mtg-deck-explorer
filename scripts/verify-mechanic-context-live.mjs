// Supplemental live evidence: witness existence, actual local HTTP contract,
// representative identity ceilings, legality, zero results and provider paging.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createDeckServer} from '../server.mjs';
import {read} from './mechanic-discovery-spec.mjs';

const root=new URL('../reports/mechanic-discovery/',import.meta.url);
const output=new URL('live-context.json',root),captures=new URL('context-responses/',root);
fs.mkdirSync(captures,{recursive:true});
const evidence={version:1,startedAt:new Date().toISOString(),requests:[],witnesses:[],cases:[],pass:false};
let last=0;
const save=()=>fs.writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');
async function captureFetch(raw,options={}){
  const url=new URL(raw);assert.equal(url.origin,'https://api.scryfall.com');
  await new Promise(r=>setTimeout(r,Math.max(0,550-(Date.now()-last))));last=Date.now();
  const startedAt=new Date().toISOString();
  const response=await fetch(url,{...options,headers:{...options.headers,'User-Agent':'MTGDeckExplorer/2.1 (live context audit)','Accept':'application/json'},signal:AbortSignal.timeout(30000)});
  const bytes=Buffer.from(await response.arrayBuffer()),sha256=createHash('sha256').update(bytes).digest('hex'),file=`context-responses/${sha256}.json`;
  fs.writeFileSync(new URL(file,root),bytes);
  evidence.requests.push({url:url.href,method:options.method??'GET',requestBody:options.body?JSON.parse(options.body):null,startedAt,completedAt:new Date().toISOString(),status:response.status,file,bytes:bytes.length,sha256,date:response.headers.get('date')});save();
  if(response.status===429||response.status>=500)throw new Error(`Provider ${response.status}; stop, no automatic retry.`);
  return new Response(bytes,{status:response.status,headers:response.headers});
}

const plan=read('reports/mechanic-discovery/witness-plan.json');
const ids=[...new Set(plan.witnesses.map(w=>w.printingId))];
const byId=new Map();
for(let offset=0;offset<ids.length;offset+=70){
  const identifiers=ids.slice(offset,offset+70).map(id=>({id}));
  const response=await captureFetch('https://api.scryfall.com/cards/collection',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifiers})});
  assert.equal(response.status,200);const data=await response.json();assert.equal(data.not_found?.length??0,0,JSON.stringify(data.not_found));
  for(const card of data.data)byId.set(card.id,card);
}
for(const witness of plan.witnesses){
  const card=byId.get(witness.printingId);assert.ok(card,`Witness does not exist: ${witness.name}`);
  assert.equal(card.name,witness.name);assert.equal(card.oracle_id,witness.oracleId);
  const reports=card.keywords.some(k=>k.toLowerCase()===witness.label.toLowerCase());
  if(witness.metadataChecked)assert.equal(reports,witness.expected,`${witness.label}: ${witness.name}`);
  evidence.witnesses.push({...witness,keywords:card.keywords});
}
evidence.distinctWitnessCards=byId.size;save();
const server=await createDeckServer({fetchImpl:captureFetch});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const post=async(route,payload)=>{
  const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),data=await response.json();
  assert.equal(response.status,200,JSON.stringify(data));return data;
};
try{
  const commanders=['Kenrith, the Returned King','Kozilek, the Great Distortion','Isamaru, Hound of Konda','Adric, Mathematical Genius','Kess, Dissident Mage'];
  const resolved=await post('/api/resolve',{identifiers:commanders.map(name=>({name}))});
  assert.equal(resolved.cards.length,commanders.length);
  const catalog=await(await fetch(base+'/api/catalog')).json();
  const cases=[
    ['Flying',0,1],['Flying',0,8],['Flying',1,1],['Flying',2,1],['Flying',2,2],
    ['Proliferate',0,1],['Proliferate',1,1],['Surveil',3,1],['Warp',4,1],['First Strike',2,1],
    ['Escape',4,1],['Eternalize',4,1],['Devoid',1,1],['Partner',0,1],['Companion',0,1],['Underdog',0,1],
  ];
  for(const [label,commanderIndex,page]of cases){
    const commander=resolved.cards.find(c=>c.name===commanders[commanderIndex]),record=catalog.records.find(r=>r.master_name===label);
    const result=await post('/api/discover',{contextToken:resolved.contextToken,commanderIds:[commander.id],atlasRowId:record.atlas_row_id,page});
    assert.equal(result.query,`(f:commander id<=${commander.color_identity.join('').toLowerCase()||'c'}) (${record.discovery.expression})`);
    for(const card of result.cards){
      assert.equal(card.legalities.commander,'legal');assert.ok(card.color_identity.every(c=>commander.color_identity.includes(c)));
      assert.ok(card.keywords.some(k=>k.toLowerCase()===record.discovery.key));
    }
    assert.equal(result.skipped,0);assert.equal(result.page,page);assert.ok(result.cards.length<=24);
    if(label==='Underdog')assert.equal(result.totalCards,0);
    if(label==='Flying'&&commanderIndex===1)assert.ok(result.cards.length>0);
    evidence.cases.push({label,commander:commander.name,identity:commander.color_identity,page,result,pass:true});save();
    console.log(`PASS ${label} / ${commander.name} / page ${page}: ${result.totalCards}`);
  }
  // A known all-color search must include fewer-color and colorless witnesses.
  const all=evidence.cases.find(c=>c.label==='Flying'&&c.commander===commanders[0]);
  assert.ok(all.result.cards.some(c=>c.color_identity.length<5));
  const direct=async q=>{const u=new URL('https://api.scryfall.com/cards/search');u.searchParams.set('q',q);const response=await captureFetch(u);assert.ok([200,404].includes(response.status));const data=await response.json();if(response.status===404)assert.equal(data.code,'not_found');return data;};
  for(const [query,positive,negative]of [
    ['f:commander id<=wu kw:Flying','Ornithopter','Shivan Dragon'],
    ['f:commander id<=c kw:Flying','Ornithopter','Serra Angel'],
    ['f:commander id<=wubrg kw:Flying','Ornithopter','Ruff, Underdog Champ'],
    ['f:commander id<=c kw:Devoid',null,'Benthic Infiltrator'],
    // Negative taken from the captured current provider data, not an old ban list.
    ['f:commander id<=wubrg kw:Companion','Jegantha, the Wellspring','Treizeci, Sun of Serra'],
  ]){
    const q=`(${query}) (${[positive,negative].filter(Boolean).map(n=>'!'+JSON.stringify(n)).join(' OR ')}) include:extras`;
    const data=await direct(q),found=(data.data??[]).map(c=>c.name);
    if(positive)assert.ok(found.includes(positive),q);assert.ok(!found.includes(negative),q);
    evidence.cases.push({query:q,positive,negative,found,pass:true});save();
  }
  evidence.pass=true;evidence.completedAt=new Date().toISOString();save();
}finally{await new Promise(r=>server.close(r));}
console.log(`Verified ${evidence.witnesses.length} witness assertions and ${evidence.cases.length} context cases.`);
