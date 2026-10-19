// Public read-only POST /cards/collection; no account writes or private data.
import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const witnesses=JSON.parse(await readFile(path.join(root,'reports/mechanics-coverage/endpoint-witnesses.json'),'utf8'));
const dir=path.join(root,witnesses.snapshot_path);
try{await access(path.join(dir,'endpoint-check.json'));throw new Error('Refusing to overwrite existing endpoint evidence');}catch(e){if(e.code!=='ENOENT')throw e;}
const responses=[];
for(let i=0;i<witnesses.ids.length;i+=75){
  if(i)await new Promise(r=>setTimeout(r,550));
  const ids=witnesses.ids.slice(i,i+75),started_at=new Date().toISOString();
  const url='https://api.scryfall.com/cards/collection';
  const response=await fetch(url,{method:'POST',headers:{'User-Agent':'DeckExplorerCoverageAudit/1.0 (public card consistency check)',Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({identifiers:ids.map(id=>({id}))}),redirect:'error',signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,200,`HTTP ${response.status}; no automatic retries`);
  const bytes=Buffer.from(await response.arrayBuffer());assert.ok(bytes.length<5*1024*1024);
  const result=JSON.parse(bytes);assert.equal(result.object,'list');assert.notEqual(result.has_more,true);assert.equal(result.not_found?.length??0,0);assert.equal(result.data.length,ids.length);
  assert.deepEqual(result.data.map(c=>c.id).sort(),[...ids].sort());
  const file=`collection-${String(responses.length+1).padStart(2,'0')}.json`;
  await writeFile(path.join(dir,file),bytes,{flag:'wx'});
  responses.push({file,url,method:'POST',requested_ids:ids,status:response.status,started_at,completed_at:new Date().toISOString(),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
const receipt={requested_ids:witnesses.ids,responses,completed_at:new Date().toISOString(),claim:'Live collection versus bulk consistency, not independent taxonomy truth.'};
await writeFile(path.join(dir,'endpoint-check.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({cards:witnesses.ids.length,requests:responses.length},null,2));
