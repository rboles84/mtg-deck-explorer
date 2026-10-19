// Explicit live verification, separate from node --test and application traffic.
// Each fresh run gets its own receipts. Resume interrupted or failed runs;
// successful completed runs remain immutable, and failed attempts are retained.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createDeckServer} from '../server.mjs';
import {loadCatalog} from '../lib/catalog.mjs';

const project=fileURLToPath(new URL('../',import.meta.url));
const root=path.join(project,'reports/mechanic-discovery/live-all-mechanics');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const startedAt=new Date().toISOString();
const resume=process.argv.find(a=>a.startsWith('--resume='))?.slice(9);
const run=resume?path.resolve(resume):path.join(root,startedAt.replace(/[:.]/g,'-'));
assert.ok(run.startsWith(root+path.sep),'Resume directory must be inside this audit report folder.');
fs.mkdirSync(path.join(run,'responses'),{recursive:true});
const output=path.join(run,'summary.json');
const evidence=resume?JSON.parse(fs.readFileSync(output,'utf8')):{
  version:1,startedAt,status:'running',scope:{
    mechanics:296,identities:['WUBRG','C','W','U','B','R','G'],expectedAppSearches:2072,
    appPages:'First application page (24 cards); validate every card in its raw provider page (up to 175).',
    witnesses:'Fresh unrestricted exact-name searches, checked by Oracle ID against positive and negative witnesses.',
    limits:'Seven identity contexts, not all 32 subsets; no exhaustive traversal of large result sets.'
  },requests:[],resolutions:[],mechanics:[],interruptions:[]
};
if(resume)assert.ok(!(evidence.status==='complete'&&evidence.pass),'Successful completed runs are immutable; start a fresh run.');
if(resume){evidence.resumptions??=[];evidence.resumptions.push(new Date().toISOString());evidence.status='running';}
const catalog=await loadCatalog(project);
const catalogHash=sha(JSON.stringify(catalog.records.map(r=>[r.atlas_row_id,r.discovery])));
if(resume)assert.equal(evidence.catalogHash,catalogHash,'Catalog changed since this run began.');
else evidence.catalogHash=catalogHash;
assert.equal(catalog.records.length,296);
const plan=JSON.parse(fs.readFileSync(path.join(project,'reports/mechanic-discovery/witness-plan.json'),'utf8'));
const commanders=[
  {name:'Kenrith, the Returned King',identity:['W','U','B','R','G'],key:'WUBRG'},
  {name:'Kozilek, the Great Distortion',identity:[],key:'C'},
  {name:'Isamaru, Hound of Konda',identity:['W'],key:'W'},
  {name:'Adric, Mathematical Genius',identity:['U'],key:'U'},
  {name:'Ayara, First of Locthwain',identity:['B'],key:'B'},
  {name:'Krenko, Mob Boss',identity:['R'],key:'R'},
  {name:'Goreclaw, Terror of Qal Sisma',identity:['G'],key:'G'}
];
const save=()=>fs.writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');
const identityValid=value=>Array.isArray(value)&&value.every(c=>'WUBRG'.includes(c)&&c.length===1);
const compact=card=>({id:card.id,oracleId:card.oracle_id,name:card.name,identity:card.color_identity,commanderLegal:card.legalities?.commander,keywords:card.keywords});
const errorText=error=>`${error.name}: ${error.message}`;
let last=0,active={phase:'setup'},stopReason=null;
save();
console.log(`REPORT ${output}`);

async function captureFetch(raw,options={}){
  const url=new URL(raw);assert.equal(url.origin,'https://api.scryfall.com');
  await new Promise(r=>setTimeout(r,Math.max(0,550-(Date.now()-last))));last=Date.now();
  const receipt={sequence:evidence.requests.length+1,...active,url:url.href,method:options.method??'GET',
    requestBody:options.body?JSON.parse(options.body):null,startedAt:new Date().toISOString()};
  try{
    const timeout=AbortSignal.timeout(45000);
    const response=await fetch(url,{...options,redirect:'error',
      headers:{...options.headers,'User-Agent':'MTGDeckExplorer/2.1 (explicit complete mechanic audit)',Accept:'application/json'},
      signal:options.signal?AbortSignal.any([options.signal,timeout]):timeout});
    const bytes=Buffer.from(await response.arrayBuffer()),hash=sha(bytes);
    Object.assign(receipt,{completedAt:new Date().toISOString(),status:response.status,date:response.headers.get('date'),
      retryAfter:response.headers.get('retry-after'),sha256:hash,bytes:bytes.length,file:`responses/${hash}.json`});
    fs.writeFileSync(path.join(run,receipt.file),bytes);
    evidence.requests.push(receipt);
    fs.appendFileSync(path.join(run,'requests.jsonl'),JSON.stringify(receipt)+'\n');
    if(response.status===429||response.status>=500){
      stopReason=`Provider HTTP ${response.status}; Retry-After ${receipt.retryAfter??'unspecified'}. No automatic retry.`;
      throw new Error(stopReason);
    }
    return new Response(bytes,{status:response.status,headers:response.headers});
  }catch(error){
    stopReason??=`Transport failed: ${errorText(error)}. No automatic retry.`;
    if(!receipt.completedAt){receipt.completedAt=new Date().toISOString();receipt.error=errorText(error);evidence.requests.push(receipt);fs.appendFileSync(path.join(run,'requests.jsonl'),JSON.stringify(receipt)+'\n');}
    save();throw error;
  }
}

async function witnesses(record){
  active={phase:'witnesses',mechanic:record.master_name};
  const expected=plan.witnesses.filter(w=>w.label===record.master_name);
  assert.ok(expected.some(w=>w.expected)&&expected.some(w=>!w.expected),record.master_name);
  const names=[...new Set(expected.map(w=>w.name))];
  const query=`(${record.discovery.expression}) (${names.map(name=>'!'+JSON.stringify(name)).join(' OR ')}) include:extras`;
  const params=new URLSearchParams({q:query,unique:'cards',order:'name',dir:'asc'});
  const response=await captureFetch(`https://api.scryfall.com/cards/search?${params}`);
  const data=await response.json(),found=new Set((data.data??[]).map(c=>c.oracle_id));
  const assertions=expected.map(w=>({name:w.name,oracleId:w.oracleId,expected:w.expected,actual:found.has(w.oracleId)}));
  const result={query,receipt:evidence.requests.at(-1).sequence,assertions,cards:(data.data??[]).map(compact),pass:false};
  try{
    assert.equal(response.status,200,JSON.stringify(data));assert.equal(data.object,'list');assert.equal(data.has_more,false);
    assert.ok(assertions.every(a=>a.actual===a.expected),JSON.stringify(assertions.filter(a=>a.actual!==a.expected)));
    for(const card of data.data)assert.ok(card.keywords?.some(k=>k.toLowerCase()===record.discovery.key),card.name);
    result.pass=true;
  }catch(error){result.error=errorText(error);}
  return result;
}

const server=await createDeckServer({fetchImpl:captureFetch,timeoutMs:45000});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
async function post(route,body){
  const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
  const data=await response.json();
  if(stopReason)throw new Error(stopReason);
  assert.equal(response.status,200,JSON.stringify(data));return data;
}
async function resolveCommanders(){
  active={phase:'commanders'};
  const offset=evidence.requests.length;
  const resolved=await post('/api/resolve',{identifiers:commanders.map(c=>({name:c.name}))});
  assert.equal(resolved.cards.length,commanders.length);assert.equal(resolved.notFound.length,0);
  for(const expected of commanders){
    const card=resolved.cards.find(c=>c.name===expected.name);assert.ok(card,expected.name);
    assert.deepEqual([...card.color_identity].sort(),[...expected.identity].sort(),expected.name);
    assert.equal(card.legalities.commander,'legal',expected.name);expected.id=card.id;
  }
  evidence.resolutions.push({checkedAt:new Date().toISOString(),receipts:evidence.requests.slice(offset).map(r=>r.sequence),cards:resolved.cards.map(compact)});
  save();return resolved.contextToken;
}
async function appCase(record,commander,contextToken){
  active={phase:'app-search',mechanic:record.master_name,identity:commander.key};
  const offset=evidence.requests.length;
  const item={identity:commander.key,commander:commander.name,commanderId:commander.id,expectedIdentity:commander.identity,pass:false};
  try{
    const result=await post('/api/discover',{atlasRowId:record.atlas_row_id,contextToken,commanderIds:[commander.id],page:1});
    const receipts=evidence.requests.slice(offset);assert.equal(receipts.length,1,'Each case must use a fresh provider request.');
    const receipt=receipts[0],raw=JSON.parse(fs.readFileSync(path.join(run,receipt.file),'utf8'));
    Object.assign(item,{receipt:receipt.sequence,status:receipt.status,totalCards:result.totalCards,query:result.query,providerQuery:result.providerQuery,
      scryfallUrl:result.scryfallUrl,responseIdentity:result.identity,rawCardsChecked:raw.data?.length??0,appCardsChecked:result.cards.length,
      displayed:result.cards.map(c=>({name:c.name,id:c.id,oracleId:c.oracle_id,identity:c.color_identity}))});
    const binding=commander.identity.join('').toLowerCase()||'c';
    assert.deepEqual(result.identity,commander.identity);
    assert.equal(result.query,`(f:commander id<=${binding}) (${record.discovery.expression})`);
    assert.equal(result.queryProvenance.boundIdentity,binding);
    assert.equal(result.providerQuery,`${result.query} prefer:newest`);
    assert.equal(new URL(receipt.url).searchParams.get('q'),result.providerQuery);
    assert.equal(new URL(receipt.url).searchParams.get('unique'),'cards');
    assert.equal(new URL(receipt.url).searchParams.get('page'),'1');
    assert.equal(new URL(result.scryfallUrl).searchParams.get('q'),result.providerQuery);
    assert.equal(result.skipped,0);assert.equal(result.duplicatesCollapsed,0);
    if(result.totalCards===0){
      assert.equal(receipt.status,404);assert.equal(raw.object,'error');assert.equal(raw.code,'not_found');
      assert.deepEqual(result.cards,[]);assert.equal(result.totalPages,0);assert.equal(result.hasMore,false);
    }else{
      assert.equal(receipt.status,200);assert.equal(raw.object,'list');assert.equal(result.totalCards,raw.total_cards);
      assert.equal(result.cards.length,Math.min(24,raw.total_cards));
      assert.equal(result.totalPages,Math.ceil(raw.total_cards/24));assert.equal(result.hasMore,raw.total_cards>24);
      // Reversible printings can omit the top-level Oracle ID. Missing IDs are
      // not shared identities; use the same name fallback as the application.
      assert.equal(new Set(raw.data.map(c=>c.oracle_id?`oracle:${c.oracle_id}`:`name:${c.name.normalize('NFKC').trim().toLowerCase()}`)).size,raw.data.length,'Distinct card identities');
      for(const card of [...raw.data,...result.cards]){
        assert.equal(card.legalities?.commander,'legal',card.name);
        assert.ok(identityValid(card.color_identity)&&card.color_identity.every(c=>commander.identity.includes(c)),`${card.name}: identity`);
        assert.ok(card.keywords?.some(k=>k.toLowerCase()===record.discovery.key),`${card.name}: mechanic`);
      }
      assert.deepEqual(result.cards.map(c=>c.id),raw.data.slice(0,24).map(c=>c.id));
    }
    item.pass=true;
  }catch(error){if(stopReason)throw error;item.error=errorText(error);item.receipts=evidence.requests.slice(offset).map(r=>r.sequence);}
  return item;
}

try{
  let contextToken=await resolveCommanders(),sinceResolution=0;
  for(const record of catalog.records){
    const previous=evidence.mechanics.find(m=>m.id===record.atlas_row_id);
    if(previous?.pass)continue;
    if(previous){
      evidence.priorAttempts??=[];evidence.priorAttempts.push(previous);
      evidence.mechanics=evidence.mechanics.filter(m=>m.id!==record.atlas_row_id);save();
    }
    if(sinceResolution>=25){contextToken=await resolveCommanders();sinceResolution=0;}
    const item={id:record.atlas_row_id,label:record.master_name,startedAt:new Date().toISOString(),witnesses:await witnesses(record),cases:[],pass:false};
    for(const commander of commanders)item.cases.push(await appCase(record,commander,contextToken));
    try{
      assert.ok(item.witnesses.pass,'Witness membership failed');assert.ok(item.cases.every(c=>c.pass),'One or more app cases failed');
      const all=item.cases.find(c=>c.identity==='WUBRG'),colorless=item.cases.find(c=>c.identity==='C');
      for(const c of item.cases){assert.ok(c.totalCards<=all.totalCards,`${c.identity} exceeds five-color count`);assert.ok(c.totalCards>=colorless.totalCards,`${c.identity} excludes colorless cards`);}
      for(const c of item.cases){
        const knownCompatible=item.witnesses.cards.filter(card=>card.commanderLegal==='legal'&&identityValid(card.identity)&&card.identity.every(color=>c.expectedIdentity.includes(color)));
        assert.ok(c.totalCards>=knownCompatible.length,`${c.identity}: known eligible witnesses exceed result count`);
      }
      item.pass=true;
    }catch(error){item.error=errorText(error);}
    item.completedAt=new Date().toISOString();evidence.mechanics.push(item);sinceResolution++;
    evidence.progress={completed:evidence.mechanics.length,passed:evidence.mechanics.filter(m=>m.pass).length,requests:evidence.requests.length};save();
    console.log(`${item.pass?'PASS':'FAIL'} ${evidence.mechanics.length}/296 ${record.master_name}: ${item.cases.map(c=>`${c.identity}=${c.totalCards??'ERROR'}`).join(' ')}${item.pass?'':` ${item.error}`}`);
  }
  const cases=evidence.mechanics.flatMap(m=>m.cases);
  evidence.totals={mechanics:evidence.mechanics.length,passedMechanics:evidence.mechanics.filter(m=>m.pass).length,
    appSearches:cases.length,passedAppSearches:cases.filter(c=>c.pass).length,zeroResults:cases.filter(c=>c.pass&&c.totalCards===0).length,
    positiveResults:cases.filter(c=>c.pass&&c.totalCards>0).length,rawCardsChecked:cases.reduce((n,c)=>n+(c.rawCardsChecked??0),0),
    appCardsChecked:cases.reduce((n,c)=>n+(c.appCardsChecked??0),0),witnessAssertions:evidence.mechanics.reduce((n,m)=>n+m.witnesses.assertions.length,0),
    requests:evidence.requests.length};
  evidence.allIdentityZeroMechanics=evidence.mechanics.filter(m=>m.cases.every(c=>c.pass&&c.totalCards===0)).map(m=>m.label);
  evidence.identityRestrictedZeros=evidence.mechanics.filter(m=>m.cases[0].totalCards>0).flatMap(m=>m.cases.filter(c=>c.pass&&c.totalCards===0).map(c=>({mechanic:m.label,identity:c.identity,allColorCount:m.cases[0].totalCards})));
  assert.equal(evidence.mechanics.length,296);assert.equal(cases.length,2072);
  evidence.pass=evidence.mechanics.every(m=>m.pass);evidence.status='complete';evidence.completedAt=new Date().toISOString();save();
  console.log(JSON.stringify(evidence.totals));
  if(!evidence.pass)process.exitCode=1;
}catch(error){
  evidence.status='interrupted';evidence.pass=false;evidence.interruptions.push({at:new Date().toISOString(),active,error:errorText(error)});save();
  console.error(errorText(error));console.error(`Resume explicitly: node scripts/verify-all-mechanics-live.mjs --resume="${run}"`);process.exitCode=1;
}finally{await new Promise(resolve=>server.close(resolve));}
