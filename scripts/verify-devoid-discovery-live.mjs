// Focused, explicit live audit of Devoid color versus Commander color identity.
// Run manually; this is not part of the offline test suite or application traffic.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createDeckServer} from '../server.mjs';

const root=new URL('../reports/mechanic-discovery/',import.meta.url);
const output=new URL('devoid-live.json',root);
fs.mkdirSync(new URL('devoid-responses/',root),{recursive:true});
const evidence={startedAt:new Date().toISOString(),requests:[],queries:[],commanderCases:[],pass:false};
const save=()=>fs.writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');
let last=0;
async function captureFetch(raw,options={}){
  const url=new URL(raw);assert.equal(url.origin,'https://api.scryfall.com');
  await new Promise(r=>setTimeout(r,Math.max(0,550-(Date.now()-last))));last=Date.now();
  const response=await fetch(url,{...options,headers:{...options.headers,'User-Agent':'MTGDeckExplorer/2.1 (Devoid identity audit)',Accept:'application/json'},signal:AbortSignal.timeout(30000)});
  const bytes=Buffer.from(await response.arrayBuffer()),sha256=createHash('sha256').update(bytes).digest('hex'),file=`devoid-responses/${sha256}.json`;
  fs.writeFileSync(new URL(file,root),bytes);
  evidence.requests.push({url:url.href,method:options.method??'GET',requestBody:options.body?JSON.parse(options.body):null,status:response.status,file,sha256,bytes:bytes.length,checkedAt:new Date().toISOString(),date:response.headers.get('date')});save();
  if(response.status===429||response.status>=500)throw new Error(`Provider HTTP ${response.status}; stopping without automatic retry.`);
  return new Response(bytes,{status:response.status,headers:response.headers});
}
async function search(q){
  const params=new URLSearchParams({q,unique:'cards',order:'name',dir:'asc',include_extras:'false',page:'1'});
  const response=await captureFetch(`https://api.scryfall.com/cards/search?${params}`),data=await response.json();
  assert.ok([200,404].includes(response.status),JSON.stringify(data));
  if(response.status===404){assert.equal(data.object,'error');assert.equal(data.code,'not_found');}
  else {assert.equal(data.object,'list');assert.ok(Number.isSafeInteger(data.total_cards));}
  return {status:response.status,total:data.total_cards??0,cards:data.data??[]};
}

const matrix=[
  {query:'f:commander id<=c kw:devoid',zero:true},
  {query:'f:commander id<=g kw:devoid',witness:'Eyeless Watcher',identity:['G']},
  {query:'f:commander id<=u kw:devoid',witness:'Eldrazi Skyspawner',identity:['U']},
  {query:'f:commander c:c kw:devoid',witness:'Eyeless Watcher',identity:['G']},
  {query:'f:commander id<=c',witness:'Thought-Knot Seer',identity:[]}
];
for(const item of matrix){
  const found=await search(item.query);
  if(item.zero)assert.equal(found.total,0);else assert.ok(found.total>0);
  let witness=null;
  if(item.witness){
    const candidates=found.cards.some(c=>c.name===item.witness)?found.cards:(await search(`(${item.query}) !${JSON.stringify(item.witness)}`)).cards;
    const card=candidates.find(c=>c.name===item.witness);assert.ok(card,item.witness);
    assert.deepEqual(card.color_identity,item.identity);assert.deepEqual(card.colors,[]);assert.equal(card.legalities.commander,'legal');
    witness={name:card.name,id:card.id,oracleId:card.oracle_id,colors:card.colors,colorIdentity:card.color_identity,manaCost:card.mana_cost,keywords:card.keywords};
  }
  evidence.queries.push({query:item.query,status:found.status,totalCards:found.total,witness,pass:true});save();
  console.log(`PASS ${item.query}: ${found.total}${witness?` / ${witness.name}`:''}`);
}

const server=await createDeckServer({fetchImpl:captureFetch});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const post=async(route,payload)=>{
  const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),data=await response.json();
  assert.equal(response.status,200,JSON.stringify(data));return data;
};
try{
  const commanders=[['Kozilek, the Great Distortion',[]],['Goreclaw, Terror of Qal Sisma',['G']],['Adric, Mathematical Genius',['U']],['Kenrith, the Returned King',['W','U','B','R','G']]];
  const resolved=await post('/api/resolve',{identifiers:commanders.map(([name])=>({name}))});
  const catalog=await(await fetch(base+'/api/catalog')).json(),record=catalog.records.find(r=>r.master_name==='Devoid');
  for(const [name,expected]of commanders){
    const commander=resolved.cards.find(c=>c.name===name);assert.ok(commander,name);
    assert.deepEqual([...commander.color_identity].sort(),[...expected].sort());
    const result=await post('/api/discover',{contextToken:resolved.contextToken,commanderIds:[commander.id],atlasRowId:record.atlas_row_id,page:1});
    assert.deepEqual(result.identity,expected);
    const ceiling=expected.join('').toLowerCase()||'c';
    assert.equal(result.queryProvenance.boundIdentity,ceiling);assert.equal(result.query,`(f:commander id<=${ceiling}) (kw:Devoid)`);
    if(!expected.length)assert.equal(result.totalCards,0);else assert.ok(result.totalCards>0);
    for(const card of result.cards){assert.equal(card.legalities.commander,'legal');assert.ok(card.color_identity.every(c=>expected.includes(c)));}
    evidence.commanderCases.push({commander:name,commanderId:commander.id,importedIdentity:commander.color_identity,responseIdentity:result.identity,query:result.query,providerQuery:result.providerQuery,scryfallUrl:result.scryfallUrl,totalCards:result.totalCards,pass:true});save();
    console.log(`PASS app Devoid / ${name} / ${ceiling}: ${result.totalCards}`);
  }
  evidence.pass=true;evidence.completedAt=new Date().toISOString();save();
}finally{await new Promise(r=>server.close(r));}
