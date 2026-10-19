// User-initiated live Scryfall verification, separate from offline regressions.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {parseDeck, resolveDeck, validateCommanderImport, commanderContext} from '../public/core.mjs';
import {resolveImport} from '../public/import-resolution.mjs';
const base=process.argv[2] || 'http://127.0.0.1:4175';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw new Error('Use a local verification server.');
const diagnosticsOnly=process.argv.includes('--diagnostics-only');
let report={checkedAt:new Date().toISOString(),scope:'Live provider through updated local API; native exports, derived excerpt and synthetic diagnostic inputs labeled separately',cases:[]};
const output=new URL('../reports/import-validation/bounded-live.json',import.meta.url);
if(diagnosticsOnly)report=JSON.parse(fs.readFileSync(output,'utf8'));
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2));
const request=async(path,body)=>{
  const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();if(!response.ok)throw new Error(`${response.status}: ${data.error}; Retry-After=${response.headers.get('retry-after')}`);return data;
};
const fixtures=new URL('../tests/fixtures/imports/',import.meta.url);
if(!diagnosticsOnly)for(const name of ['hakbal','veyran','detailed','obeka-a','obeka-b']){
  const text=fs.readFileSync(new URL(name+'.txt',fixtures),'utf8');let parsed=parseDeck(text);
  if(parsed.commanderSuggestions.length)parsed=parseDeck(text,{commanderRowIds:[parsed.commanderSuggestions[0].rowId]});
  const result=await resolveImport(parsed,request),deck=result.deck;
  const problems=deck.rows.filter(row=>row.status!=='resolved'||row.issues.length).map(row=>({name:row.name,status:row.status,issues:row.issues}));
  report.cases.push({name,source:'Existing regression export',counts:deck.counts,problems,commanders:commanderContext(deck).rowIds.map(id=>deck.rows.find(row=>row.id===id).card.name)});save();
  assert.deepEqual(problems,[]);assert.equal(validateCommanderImport(deck).valid,true);
  console.log(`${name}: ${deck.counts.resolvedEntries} resolved deck entries, ${problems.length} problems`);
}
if(!diagnosticsOnly)for(const name of fs.readdirSync(new URL('uncommon/',fixtures)).filter(name=>name.endsWith('.csv')&&!name.startsWith('helvault'))){
  const text=fs.readFileSync(new URL('uncommon/'+name,fixtures),'utf8');
  assert.throws(()=>parseDeck(text),error=>{
    assert.match(error.message,/TappedOut CSV isn't supported/);
    report.cases.push({name,source:'Native TappedOut CSV; local format rejection, no live provider call',blockedBeforeProvider:true,issues:[error.message]});
    return true;
  });
  save();console.log(`${name}: blocked locally with TXT guidance`);
}
if(!diagnosticsOnly){
const excerpt=parseDeck(fs.readFileSync(new URL('uncommon/helvault-derived-excerpt-spanish-printing.csv',fixtures),'utf8'));
const spanish=await request('/api/resolve',{identifiers:excerpt.identifiers});
const row=resolveDeck(excerpt,spanish.cards,spanish.notFound,spanish.outcomes).rows[0];
assert.equal(row.status,'resolved');assert.equal(row.card.lang,'es');assert.equal(row.finish,'unspecified');
report.cases.push({name:'Spanish Breeding Pool',source:'Derived one-row collection excerpt; resolver only, not a full deck',row});save();
}
const diagnostic='1 Godzilla, King of the Monsters [Commander]\n95 Forest (rna)\n1 Forest (000)\n1 Forest (MYSTOR)\n1 Forest (UN3)\n1 Forest (MBP)\nSideboard\n1 Unfindable bounded importer extra';
let diagnosticResult;
try { diagnosticResult=await resolveImport(parseDeck(diagnostic),request); }
catch(error) { report.interruptions ||= []; report.interruptions.push({checkedAt:new Date().toISOString(),case:'Final synthetic diagnostic',error:error.message});save();throw error; }
const {deck}=diagnosticResult;
assert.equal(deck.counts.unresolvedEntries,0);assert.equal(deck.rows[0].card.name,'Zilortha, Strength Incarnate');assert.equal(deck.rows[1].card.set,'rna');
assert.ok(deck.rows.slice(2,6).every(row=>row.printingProvenance.setHint.status==='unrecognized'));
report.cases.push({name:'Alias, set hints and optional missing extra',source:'Synthetic diagnostic deck text resolved with live provider; no legality assertion',rows:deck.rows.map(row=>({name:row.name,canonicalName:row.card?.name,status:row.status,printing:row.card?.id,provenance:row.printingProvenance,issues:row.issues}))});save();
report.completedAt=new Date().toISOString();save();
console.log('Live checks complete; evidence saved to bounded-live.json');
