// Recheck captured live receipts without making any provider requests.
// Full five-color pools permit exact membership comparisons for every narrower identity.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=fileURLToPath(new URL('../reports/mechanic-discovery/live-all-mechanics/',import.meta.url));
const run=path.resolve(process.argv[2]??'');
assert.ok(run.startsWith(root),'Specify a run directory inside reports/mechanic-discovery/live-all-mechanics.');
const partial=process.argv.includes('--partial');
const evidence=JSON.parse(fs.readFileSync(path.join(run,'summary.json'),'utf8'));
if(!partial){assert.equal(evidence.status,'complete');assert.equal(evidence.mechanics.length,296);}
const data=new Map();
for(const receipt of evidence.requests){
  assert.ok(receipt.file,`Missing response for request ${receipt.sequence}`);
  const bytes=fs.readFileSync(path.join(run,receipt.file));
  assert.equal(bytes.length,receipt.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),receipt.sha256);
  data.set(receipt.sequence,JSON.parse(bytes));
}
const result={checkedAt:new Date().toISOString(),freshRunStartedAt:evidence.startedAt,partial,
  receiptsVerified:data.size,mechanics:[],pass:false};
const cardKey=card=>card.oracle_id?`oracle:${card.oracle_id}`:`name:${card.name.normalize('NFKC').trim().toLowerCase()}`;
for(const mechanic of evidence.mechanics){
  const row={label:mechanic.label,completePool:false,inclusionAssertions:0,exclusionAssertions:0,cases:[],pass:false};
  try{
    assert.ok(mechanic.pass,'Live run marked this mechanic as failed');
    const all=mechanic.cases.find(c=>c.identity==='WUBRG'),pool=data.get(all.receipt).data??[];
    row.completePool=all.totalCards===pool.length;
    for(const context of mechanic.cases){
      const raw=data.get(context.receipt),cards=raw.data??[],found=new Set(cards.map(cardKey));
      const allowed=pool.filter(c=>c.color_identity.every(color=>context.expectedIdentity.includes(color)));
      const excluded=pool.filter(c=>!c.color_identity.every(color=>context.expectedIdentity.includes(color)));
      // Every eligible card on the first all-color page must also be in the
      // first narrower page: removing cards cannot increase its name-sort rank.
      for(const card of allowed)assert.ok(found.has(cardKey(card)),`${context.identity} omitted ${card.name}`);
      for(const card of excluded)assert.ok(!found.has(cardKey(card)),`${context.identity} admitted ${card.name}`);
      row.inclusionAssertions+=allowed.length;row.exclusionAssertions+=excluded.length;
      if(row.completePool){
        assert.equal(context.totalCards,allowed.length,`${context.identity} count does not equal the filtered complete pool`);
        assert.deepEqual([...found].sort(),allowed.map(cardKey).sort(),`${context.identity} exact membership`);
      }
      let witnessChecks=0;
      // When a narrowed result is complete, also check eligible and ineligible
      // fresh unrestricted witnesses independently of the all-color page.
      if(context.totalCards===cards.length){
        for(const card of mechanic.witnesses.cards){
          const expected=card.commanderLegal==='legal'&&card.identity.every(color=>context.expectedIdentity.includes(color));
          const key=cardKey({oracle_id:card.oracleId,name:card.name});
          assert.equal(found.has(key),expected,`${context.identity} witness ${card.name}`);
          witnessChecks++;
        }
      }
      row.cases.push({identity:context.identity,totalCards:context.totalCards,completeResult:context.totalCards===cards.length,
        exactPoolComparison:row.completePool,included:allowed.length,excluded:excluded.length,witnessChecks});
    }
    row.pass=true;
  }catch(error){row.error=`${error.name}: ${error.message}`;}
  result.mechanics.push(row);
}
result.totals={mechanics:result.mechanics.length,passed:result.mechanics.filter(m=>m.pass).length,
  completeFiveColorPools:result.mechanics.filter(m=>m.completePool).length,
  completeNarrowedResults:result.mechanics.flatMap(m=>m.cases).filter(c=>c.completeResult).length,
  exactPoolComparisons:result.mechanics.flatMap(m=>m.cases).filter(c=>c.exactPoolComparison).length,
  inclusionAssertions:result.mechanics.reduce((n,m)=>n+m.inclusionAssertions,0),
  exclusionAssertions:result.mechanics.reduce((n,m)=>n+m.exclusionAssertions,0),
  witnessAssertions:result.mechanics.flatMap(m=>m.cases).reduce((n,c)=>n+c.witnessChecks,0)};
result.pass=result.mechanics.every(m=>m.pass);
const output=path.join(run,partial?'identity-membership.partial.json':'identity-membership.json');
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result.totals));
for(const failed of result.mechanics.filter(m=>!m.pass))console.error(`${failed.label}: ${failed.error}`);
console.log(`REPORT ${output}`);
if(!result.pass)process.exitCode=1;
