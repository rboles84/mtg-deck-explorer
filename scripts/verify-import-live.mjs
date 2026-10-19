// Explicit live smoke check. Deterministic tests never depend on provider availability.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {parseDeck,resolveDeck,commanderContext,validateCommanderImport} from '../public/core.mjs';
const base=process.argv[2]||'http://127.0.0.1:4174';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw new Error('Use a local verification server URL.');
const report={checkedAt:new Date().toISOString(),decks:[]};
for(const name of ['hakbal','veyran','detailed','obeka-a','obeka-b']){
  const source=fs.readFileSync(new URL(`../tests/fixtures/imports/${name}.txt`,import.meta.url),'utf8');
  let parsed=parseDeck(source);
  const confirmationRequired=parsed.commanderSuggestions.length>0;
  assert.equal(confirmationRequired,name.startsWith('obeka'),`${name}: unexpected commander suggestion`);
  if(confirmationRequired)parsed=parseDeck(source,{commanderRowIds:[parsed.commanderSuggestions[0].rowId]});
  assert.equal(validateCommanderImport(parsed).valid,true,`${name}: construction validation`);
  const response=await fetch(base+'/api/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifiers:parsed.identifiers})});
  const result=await response.json();
  if(!response.ok)throw new Error(`${name}: ${result.error}`);
  const deck=resolveDeck(parsed,result.cards,result.notFound,result.outcomes);
  const record={name,confirmationRequired,counts:deck.counts,commander:commanderContext(deck).rowIds.map(id=>deck.rows.find(row=>row.id===id).card.name),problems:deck.rows.filter(row=>row.status!=='resolved'||row.issues.length).map(row=>({line:row.lineNumber,name:row.name,status:row.status,issues:row.issues})),cards:result.cards};
  assert.deepEqual(record.problems,[],`${name}: unresolved or problematic entries`);
  assert.equal(validateCommanderImport(deck).valid,true,`${name}: resolved commander validation`);
  assert.equal(deck.counts.playableQuantity,100);
  assert.equal(deck.counts.excludedQuantity,name.startsWith('obeka')?8:name==='veyran'?1:0);
  assert.deepEqual(record.commander,name.startsWith('obeka')?['Obeka, Splitter of Seconds']:name==='hakbal'?['Hakbal of the Surging Soul']:name==='veyran'?['Veyran, Voice of Duality']:[]);
  assert.ok(deck.rows.every(row=>row.printingProvenance.kind===(['veyran','detailed'].includes(name)?'supplied':'assumed')));
  report.decks.push(record);
  console.log(JSON.stringify({name,deckCards:record.counts.playableQuantity,extras:record.counts.excludedQuantity,resolved:record.counts.resolvedEntries,assumed:record.counts.assumedEntries,commander:record.commander,problems:record.problems}));
}
fs.mkdirSync(new URL('../reports/import-validation/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('../reports/import-validation/live.json',import.meta.url),JSON.stringify(report,null,2));
