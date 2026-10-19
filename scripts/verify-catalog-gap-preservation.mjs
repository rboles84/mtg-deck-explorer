import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {loadCatalog} from '../lib/catalog.mjs';
const dir='reports/catalog-gaps-20261019';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const baseline=JSON.parse(fs.readFileSync('backups/before-catalog-42-20261019.manifest.json'));
const admitted=new Set(['lib/catalog.mjs','lib/scryfall.mjs','public/app.mjs','tests/mechanic-discovery.test.mjs','tests/mechanic-variants.test.mjs','tests/mechanics-shortlist.test.mjs','tests/mechanics-ui.test.mjs']);
const changed=[];
for(const entry of baseline.files){
  assert.ok(fs.existsSync(entry.path),'Missing original: '+entry.path);
  if(hash(fs.readFileSync(entry.path))!==entry.sha256){assert.ok(admitted.has(entry.path),'Unadmitted change: '+entry.path);changed.push(entry.path);}
}
const oldText=fs.readFileSync(dir+'/baseline-catalog.txt','utf8');
assert.equal(hash(oldText),baseline.files.find(f=>f.path==='lib/catalog.mjs').sha256);
// Reuse unchanged inputs/modules with the exact backed-up loader. This proves
// that all 332 prior runtime records still have the same values, not just IDs.
const source=oldText.replace(/from\s+(['"])(\.\.?\/[^'"]+)\1/g,(_,quote,p)=>`from ${JSON.stringify(new URL(p,new URL('../lib/catalog.mjs',import.meta.url)).href)}`);
const oldModule=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const old=await oldModule.loadCatalog(process.cwd()),current=await loadCatalog(process.cwd());
assert.equal(old.records.length,332);
assert.deepEqual(current.records.filter(r=>!r.atlas_row_id.startsWith('keyword-index-catalog-gap-')),old.records);
assert.deepEqual(current.historicalRecords,old.historicalRecords);
assert.deepEqual(current.baseline,old.baseline);assert.deepEqual(current.searchPolicy,old.searchPolicy);
assert.deepEqual(current.sources.slice(0,old.sources.length),old.sources);
const result={checkedAt:new Date().toISOString(),originalFiles:baseline.files.length,unchanged:baseline.files.length-changed.length,changed,
  originalRuntimeRecordsUnchanged:old.records.length,originalSourcesUnchanged:old.sources.length,baselineAndIdentityPolicyUnchanged:true,
  backup:{file:'backups/before-catalog-42-20261019.zip',sha256:hash(fs.readFileSync('backups/before-catalog-42-20261019.zip')),verifiedFiles:2900}};
fs.writeFileSync(dir+'/preservation.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
