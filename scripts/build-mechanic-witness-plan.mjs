// Resolve audit witnesses to exact Oracle/printing IDs, including duplicate token
// names. This uses only the pinned corpus; it does not infer gameplay semantics.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {specs,audit,sha,read} from './mechanic-discovery-spec.mjs';
const manifest=read(audit.snapshot_path+'/manifest.json');
const bytes=fs.readFileSync(new URL('../'+audit.snapshot_path+'/'+manifest.corpus_file,import.meta.url));
assert.ok(manifest.requests.some(r=>r.sha256===sha(bytes)&&r.bytes===bytes.length));
const cards=gunzipSync(bytes).toString('utf8').trim().split('\n').map(JSON.parse);
const byName=new Map();for(const c of cards){if(!byName.has(c.name))byName.set(c.name,[]);byName.get(c.name).push(c);}
const witnesses=[];
for(const spec of specs){
  const result=audit.results.find(r=>r.term===spec.label);
  for(const [expected,names]of [[true,spec.positive],[false,spec.negative]])for(const name of new Set(names)){
    let candidates=(expected&&spec.display?result.examples:!expected&&spec.display?result.literal_text_examples:[]).filter(c=>c.name===name);
    if(!candidates.length){
      candidates=(byName.get(name)??[]).filter(c=>!/^Token\b/.test(c.type_line));
      assert.equal(candidates.length,1,`Ambiguous custom witness ${spec.label}: ${name}`);
    }
    for(const c of candidates){
      const metadata=c.keywords.some(k=>k.toLowerCase()===spec.key);
      if(spec.display)assert.equal(metadata,expected,`${spec.label}: ${name}`);
      witnesses.push({label:spec.label,name,expected,printingId:c.id,oracleId:c.oracle_id,keywords:c.keywords,metadataChecked:spec.display});
    }
  }
}
const plan={version:1,snapshotPath:audit.snapshot_path,corpusSha256:sha(bytes),witnesses};
const file=new URL('../reports/mechanic-discovery/witness-plan.json',import.meta.url),text=JSON.stringify(plan,null,2)+'\n';
if(process.argv.includes('--check'))assert.equal(fs.readFileSync(file,'utf8'),text);else fs.writeFileSync(file,text);
console.log(`${witnesses.length} assertions using ${new Set(witnesses.map(w=>w.printingId)).size} exact printings.`);
