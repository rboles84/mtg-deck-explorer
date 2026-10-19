// Explicit provider smoke checks for edge cases; deterministic tests stay offline.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {parseDeck,resolveDeck,validateCommanderImport,commanderContext,selectReferencePrinting} from '../public/core.mjs';

const base=process.argv[2]||'http://127.0.0.1:4174';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw new Error('Use a local verification server URL.');
const resolve=async identifiers=>{
  const response=await fetch(base+'/api/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifiers})});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error);
  return result;
};
// A diagnostic input, not a claim of Commander legality or singleton compliance.
const source=`Commander
1 Godzilla, King of the Monsters
Deck
1 Thassa’s Oracle
1 Fire / Ice
1 Fire/Ice
1 Black Panther's Claws
1 Exclusive Nightclub
1 Spectral Restitching
93 Forest`;
const parsed=parseDeck(source);
assert.equal(validateCommanderImport(parsed).valid,true);
const result=await resolve(parsed.identifiers);
const deck=resolveDeck(parsed,result.cards,result.notFound,result.outcomes);
assert.ok(deck.rows.every(row=>row.status==='resolved'&&!row.issues.length));
assert.ok(deck.rows.every(row=>row.printingProvenance.kind==='assumed'));
assert.equal(deck.counts.playableQuantity,100);
const commander=commanderContext(deck);
assert.equal(commander.rowIds.length,1);
assert.equal(deck.rows.find(row=>row.id===commander.rowIds[0]).card.name,'Zilortha, Strength Incarnate');
assert.deepEqual(commander.colorIdentity,['R','G']);

const alias=deck.rows.find(row=>row.name==="Black Panther's Claws");
const canonicalResult=await resolve([{name:alias.card.name}]);
const ordinary=canonicalResult.cards.find(card=>card.oracle_id===alias.card.oracle_id&&!card.flavor_name);
assert.ok(ordinary,'The canonical lookup must supply a regular printing for this correction check.');
assert.notEqual(ordinary.id,alias.card.id);
const draft=selectReferencePrinting(deck,alias.id,ordinary.id.toUpperCase());
const correction=await resolve([{id:ordinary.id}]);
const pinned=deck.rows.filter(row=>row.id!==alias.id).map(row=>row.card);
const changed=resolveDeck(draft,[...pinned,...correction.cards],correction.notFound,correction.outcomes);
assert.ok(changed.rows.every(row=>row.status==='resolved'));
assert.equal(changed.rows.find(row=>row.id===alias.id).printingProvenance.kind,'user-selected');
assert.equal(changed.rows.find(row=>row.id===alias.id).name,alias.name);
assert.equal(changed.sourceText,source);
for(const row of deck.rows.filter(row=>row.id!==alias.id))assert.equal(changed.rows.find(item=>item.id===row.id).card.id,row.card.id);

const report={checkedAt:new Date().toISOString(),source,counts:deck.counts,commander,rows:deck.rows.map(row=>({importedName:row.name,canonicalName:row.card.name,printingId:row.card.id,oracleId:row.card.oracle_id,printingProvenance:row.printingProvenance})),correction:{importedName:alias.name,oracleId:alias.card.oracle_id,originalPrinting:alias.card.id,selectedPrinting:ordinary.id,provenance:changed.rows.find(row=>row.id===alias.id).printingProvenance},problems:[]};
fs.mkdirSync(new URL('../reports/import-validation/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('../reports/import-validation/redteam-live.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
