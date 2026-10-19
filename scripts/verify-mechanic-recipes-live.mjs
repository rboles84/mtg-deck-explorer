// Explicit, resumable live checks. Does not run during node --test or in the app.
import fs from 'node:fs';
import {specs, sha, read} from './mechanic-discovery-spec.mjs';

const root=new URL('../reports/mechanic-discovery/',import.meta.url);
fs.mkdirSync(root,{recursive:true});
const captureDir=new URL('responses/',root);fs.mkdirSync(captureDir,{recursive:true});
const evidenceFile=new URL('live-recipes.json',root);
const evidence=fs.existsSync(evidenceFile)?JSON.parse(fs.readFileSync(evidenceFile,'utf8')):{version:1,startedAt:new Date().toISOString(),recipes:[]};
const plan=read('reports/mechanic-discovery/witness-plan.json');
const selected=process.argv.find(a=>a.startsWith('--labels='))?.slice(9).split('|');
let last=0;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function search(query) {
  const url=new URL('https://api.scryfall.com/cards/search');
  url.searchParams.set('q',query);url.searchParams.set('unique','cards');url.searchParams.set('order','name');
  await sleep(Math.max(0,550-(Date.now()-last)));last=Date.now();
  const startedAt=new Date().toISOString();
  const response=await fetch(url,{headers:{'User-Agent':'MTGDeckExplorer/2.1 (local recipe membership audit)','Accept':'application/json'},signal:AbortSignal.timeout(30000)});
  const bytes=Buffer.from(await response.arrayBuffer()),hash=sha(bytes),data=JSON.parse(bytes);
  const file=`responses/${hash}.json`;fs.writeFileSync(new URL(file,root),bytes);
  const receipt={url:url.href,startedAt,completedAt:new Date().toISOString(),status:response.status,sha256:hash,bytes:bytes.length,file,date:response.headers.get('date'),count:data.total_cards??(response.status===404?0:null)};
  if(response.status===429||response.status>=500)throw new Error(`Provider ${response.status}; stop and resume later (Retry-After ${response.headers.get('retry-after')}).`);
  return {receipt,data};
}
const exact=name=>'!'+JSON.stringify(name);
for(const spec of specs.filter(s=>!selected||selected.includes(s.label))) {
  const fingerprint=sha(JSON.stringify(spec));
  const previous=evidence.recipes.find(r=>r.fingerprint===fingerprint&&r.pass);
  if(previous?.oracleIdentityChecked&&!process.argv.includes('--refresh'))continue;
  const retained=receipt=>{const bytes=fs.readFileSync(new URL(receipt.file,root));if(sha(bytes)!==receipt.sha256)throw new Error('Evidence hash mismatch');return {receipt,data:JSON.parse(bytes)};};
  // Existing captured responses may be re-evaluated by Oracle ID without
  // claiming a new live request or resetting their validation timestamps.
  const reuse=previous&&!process.argv.includes('--refresh');
  const all=reuse?retained(previous.requests[0]):await search(`(${spec.query}) include:extras`);
  const witnesses=reuse?retained(previous.requests[1]):await search(`(${spec.query}) (${[...spec.positive,...spec.negative].map(exact).join(' OR ')}) include:extras`);
  const found=new Set((witnesses.data.data??[]).map(c=>c.oracle_id));
  const assertions=plan.witnesses.filter(w=>w.label===spec.label).map(w=>({...w,actual:found.has(w.oracleId)}));
  const metadataMismatches=spec.display?(all.data.data??[]).filter(c=>!c.keywords?.some(k=>k.toLowerCase()===spec.key)).map(c=>({name:c.name,keywords:c.keywords})):[];
  const pass=all.receipt.status===200&&witnesses.receipt.status===200&&assertions.every(a=>a.expected===a.actual)&&metadataMismatches.length===0&&!witnesses.data.has_more;
  const record={label:spec.label,fingerprint,query:spec.query,scope:'Unrestricted provider pool including extras; Commander filtering checked separately.',positive:spec.positive,negative:spec.negative,assertions,oracleIdentityChecked:true,metadataSampleCount:spec.display?all.data.data?.length??0:0,metadataMismatches,count:all.receipt.count,requests:[all.receipt,witnesses.receipt],pass};
  evidence.recipes=evidence.recipes.filter(r=>r.label!==spec.label);evidence.recipes.push(record);
  evidence.completedAt=evidence.recipes.flatMap(r=>r.requests.map(q=>q.completedAt)).sort().at(-1);evidence.recheckedAt=new Date().toISOString();evidence.passed=evidence.recipes.filter(r=>r.pass).length;
  fs.writeFileSync(evidenceFile,JSON.stringify(evidence,null,2)+'\n');
  console.log(`${pass?'PASS':'FAIL'} ${spec.label}: ${all.receipt.count} (${evidence.passed}/${specs.length})${pass?'':JSON.stringify({assertions:assertions.filter(a=>a.expected!==a.actual),metadataMismatches,details:all.data.details})}`);
}
if(evidence.recipes.some(r=>!r.pass))process.exitCode=1;
