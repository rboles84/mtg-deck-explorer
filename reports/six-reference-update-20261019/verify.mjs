import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {loadCatalog} from '../../lib/catalog.mjs';
import {CATALOG_GAPS} from '../../public/catalog-gap-data.mjs';
import {REFERENCE_UPDATES} from '../../scripts/catalog-gap-reference-updates.mjs';
const dir='reports/six-reference-update-20261019';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p));
const before=read(`${dir}/before.json`);
const allowed=new Set(['public/app.mjs','public/catalog-gap-data.mjs','scripts/build-catalog-gaps.mjs','tests/catalog-gaps.test.mjs','tests/mechanics-ui.test.mjs']);
const changed=[];
for(const [file,sha] of Object.entries(before.files)){
  assert.ok(fs.existsSync(file),'Deleted file: '+file);
  if(hash(fs.readFileSync(file))!==sha){assert.ok(allowed.has(file),'Unexpected edit: '+file);changed.push(file);}
}
const admittedNew=new Set(['scripts/catalog-gap-reference-updates.mjs','tests/six-references.test.mjs','backups/before-six-references-20261019.zip','backups/before-six-references-20261019.manifest.json']);
const added=[];
function walk(base){for(const e of fs.readdirSync(base,{withFileTypes:true})){const p=path.posix.join(base,e.name);if(p===dir)continue;if(e.isDirectory())walk(p);else if(e.isFile()&&!Object.hasOwn(before.files,p)){assert.ok(admittedNew.has(p),'Unexpected addition: '+p);added.push(p);}}}
walk('.');
const catalog=await loadCatalog(process.cwd());
assert.deepEqual(catalog,read(`${dir}/catalog-before.json`));
const old=read(`${dir}/gaps-before.json`);
assert.deepEqual(CATALOG_GAPS.map(({reference,...g})=>g),old.map(({reference,...g})=>g));
const changedReferences=CATALOG_GAPS.filter((g,i)=>JSON.stringify(g.reference)!==JSON.stringify(old[i].reference)).map(g=>g.key);
assert.deepEqual(changedReferences.sort(),[...REFERENCE_UPDATES.keys()].sort());
const backup=read('backups/before-six-references-20261019.manifest.json');
assert.equal(hash(fs.readFileSync(backup.file)),backup.sha256);
const testBytes=fs.readFileSync(`${dir}/tests.txt`),tests=testBytes.toString();
assert.match(tests,/pass 347\b/);assert.match(tests,/fail 0\b/);assert.match(tests,/skipped 0\b/);
const panels=read(`${dir}/browser-panels.json`),consoleMessages=read(`${dir}/browser-console.json`);
assert.equal(panels.length,6);assert.deepEqual(consoleMessages,[]);
for(const [key,reference] of REFERENCE_UPDATES){
  const panel=panels.find(p=>p.name.toLowerCase()===key)?.panel;
  assert.ok(panel);assert.ok(panel.links.some(link=>link.url===reference.source.url));
  if(reference.playtest){
    assert.ok(panel.links.some(link=>link.url===reference.playtest.searchUrl));
    assert.ok(panel.links.some(link=>link.url===reference.supportingSource.url));
  }
}
const result={checkedAt:new Date().toISOString(),existingFiles:Object.keys(before.files).length,unchanged:Object.keys(before.files).length-changed.length,changed,added,missing:[],runtimeFilesChanged:changed.filter(f=>f.startsWith('public/')),catalogRecordsUnchanged:catalog.records.length,detectionSpecificationsUnchanged:CATALOG_GAPS.length,changedReferences,definitionsAdded:0,sourceKinds:[...REFERENCE_UPDATES.values()].map(e=>({name:e.title,kind:e.referenceKind,publisher:e.source.publisher})),backup:{file:backup.file,sha256:backup.sha256,verifiedFiles:backup.verifiedFiles},tests:{passed:347,failed:0,skipped:0,logSha256:hash(testBytes)}};
result.browser={panelsVerified:panels.length,consoleMessages,artifacts:['browser-panels.json','browser-console.json','browser-kinfall.png'].map(file=>({file,sha256:hash(fs.readFileSync(`${dir}/${file}`))}))};
fs.writeFileSync(`${dir}/preservation.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
