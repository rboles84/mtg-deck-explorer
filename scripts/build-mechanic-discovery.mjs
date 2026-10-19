// Deterministic Atlas 2.1 / registry derivation. Atlas 2.0 is never written.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {baseline,audit,vocabulary,specs,sha,read} from './mechanic-discovery-spec.mjs';

const evidence=read('reports/mechanic-discovery/live-recipes.json');
const receipts=new Map(evidence.recipes.map(r=>[r.label,r]));
const rows=structuredClone(baseline.rows), mappings=[];
for(const spec of specs){
  const proof=receipts.get(spec.label);
  assert.ok(proof?.pass&&proof.oracleIdentityChecked&&proof.assertions.every(a=>a.actual===a.expected)&&proof.fingerprint===sha(JSON.stringify(spec)),`Missing current live proof for ${spec.label}`);
  for(const receipt of proof.requests){
    const bytes=fs.readFileSync(new URL('../reports/mechanic-discovery/'+receipt.file,import.meta.url));
    assert.equal(sha(bytes),receipt.sha256);assert.equal(bytes.length,receipt.bytes);
  }
  const old=rows.find(r=>r.id===spec.rowId);
  assert.notEqual(old?.tier,'Do-not-emit');
  const validated=proof.requests[0].completedAt.slice(0,10);
  const row={
    id:spec.rowId,section:'Keyword_Index',group:spec.group,label:old?.label??spec.label,
    query:spec.query,parameters:[],tier:spec.tier,auto_execute:spec.tier==='Production-ready',
    live_count:proof.count,validated,technique:spec.display?'Verified native keyword index':'Verified Oracle wording',
    fallback:null,fallback_count:null,blind_spot:spec.coverage,
    assumption:'Validation count covers the unrestricted Scryfall pool including extras; Commander filters are applied separately at runtime.',
    baseline_case:null,baseline_relation:null,rules:old?.rules??null,flags:spec.tier==='Review'?'COVERAGE-BOUNDED':null,expect_zero:false,
  };
  if(old)rows[rows.indexOf(old)]=row;else rows.push(row);
  mappings.push({key:spec.key,label:spec.label,atlasRowId:row.id,display:spec.display,
    querySha256:sha(row.query),expression:row.query,execution:'manual',relationship:spec.relationship,
    coverage:spec.coverage,classification:spec.classification,
    validation:{status:'passed',checkedAt:proof.requests.at(-1).completedAt,query:proof.query,evidence:'reports/mechanic-discovery/live-recipes.json',positive:proof.positive,negative:proof.negative},
  });
}
const keywordRows=rows.filter(r=>r.section==='Keyword_Index').sort((a,b)=>a.label.toLowerCase().localeCompare(b.label.toLowerCase(),'en')||a.id.localeCompare(b.id,'en'));
const first=rows.findIndex(r=>r.section==='Keyword_Index'),before=rows.slice(0,first).filter(r=>r.section!=='Keyword_Index'),after=rows.slice(first).filter(r=>r.section!=='Keyword_Index');
const atlas={...baseline,version:'2.1',generated:evidence.completedAt,human_artifact:null,
  row_count:rows.length,tier_counts:Object.fromEntries(Object.keys(baseline.tier_counts).map(t=>[t,rows.filter(r=>r.tier===t).length])),
  parameter_guide:{...baseline.parameter_guide,'[KEYWORD]':'Use only a separately validated native keyword-index value. Provider ability words and actions may be indexed too; catalog membership alone is insufficient.'},
  caveats:[...baseline.caveats,
    'Atlas 2.0 and its validity census remain historical. Only recipes referenced by mechanic-discovery.v1.json have new membership evidence.',
    'Rebuild 2.1 with node scripts/build-mechanic-discovery.mjs. Live verification is explicit; the builder does not call the provider.',
    'Mapped recipes have no runtime fallback. Historical fallbacks outside the registry are not approved for discovery.'],
  provenance:{baseline:'inputs/atlas_v2.0.json',baselineSha256:sha(fs.readFileSync(new URL('../inputs/atlas_v2.0.json',import.meta.url))),
    generator:'scripts/build-mechanic-discovery.mjs',liveEvidence:'reports/mechanic-discovery/live-recipes.json',historicalValidityCensus:true},
  rows:[...before,...keywordRows,...after],
};
const registry={version:'1.0.0',atlasVersion:'2.1',vocabularyVersion:vocabulary.version,auditSha256:vocabulary.auditSha256,
  unknownLabelPolicy:'Display unfamiliar provider labels and their imported cards, but offer no executable search until an explicit mapping is validated. Never interpolate a provider label into a query.',
  records:mappings.filter(m=>m.display),
};
const summary=items=>Object.fromEntries([...new Set(items.map(s=>s.historical.status))].map(k=>[k,items.filter(s=>s.historical.status===k).length]));
const ledger={version:'1.0.0',baselineRows:baseline.rows.length,baselineEnabled:8,displayLabels:vocabulary.labels.length,candidateLabels:specs.length,
  baseline:{display:summary(specs.filter(s=>s.display)),candidates:summary(specs)},
  missingFromBaseline:{display:specs.filter(s=>s.display&&s.historical.status==='missing').map(s=>s.label),candidates:specs.filter(s=>s.historical.status==='missing').map(s=>s.label)},
  executableDisplayMappings:registry.records.length,candidateDispositions:mappings.length,
  rows:specs.map(spec=>({label:spec.label,display:spec.display,historical:spec.historical,atlasRowId:spec.rowId,
    disposition:spec.display?'validated-display-search':'validated-candidate-only',
    explanation:spec.display?'Explicit Find mapping.': 'Not observed as an exact label in the pinned audit; text recipe retained for research, not a runtime label alias.',
    previousFallback:spec.oldFallback,fallbackDisposition:spec.oldFallback?'Removed from 2.1 mapped recipe; not executed or OR-combined. Historical evidence remains in 2.0.':'No fallback.',
    mapping:mappings.find(m=>m.key===spec.key)})),
};
for(const [file,value]of [['inputs/atlas_v2.1.json',atlas],['inputs/mechanic-discovery.v1.json',registry],['reports/mechanic-discovery/coverage-ledger.json',ledger]]){
  const target=new URL('../'+file,import.meta.url),content=JSON.stringify(value,null,2)+'\n';
  if(process.argv.includes('--check'))assert.equal(fs.readFileSync(target,'utf8'),content,`Stale ${file}`);else fs.writeFileSync(target,content);
}
console.log(JSON.stringify({atlasRows:atlas.row_count,tiers:atlas.tier_counts,display:registry.records.length,candidates:ledger.candidateDispositions,baseline:ledger.baseline},null,2));
