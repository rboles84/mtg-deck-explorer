// Offline receipts only; reads pinned artifacts and the separately captured owner decks.
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {parseDeck,resolveDeck,commanderContext,analyzeFlavor} from '../public/core.mjs';
import {indexMechanics} from '../public/mechanics.mjs';
const dir='reports/mechanics-integration',sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const oldPath='C:/dev/mtg-source-snapshots/2026-10-14/oracle-cards-20261014210202.jsonl.gz';
const auditPath='reports/mechanics-coverage/snapshots/20261017090158/oracle-cards.jsonl.gz';
const readCards=p=>new Map(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8').trim().split('\n').map(line=>{const c=JSON.parse(line);return [c.oracle_id,c];}));
const old=readCards(oldPath),audit=readCards(auditPath);
const fields=c=>({keywords:c.keywords,oracle_text:c.oracle_text??null,faces:(c.card_faces||[]).map(f=>({name:f.name,oracle_text:f.oracle_text??null}))});
const recordsPath='C:/dev/mtg-mechanics/docs/research/mechanic-record/records.jsonl';
const records=fs.readFileSync(recordsPath,'utf8').trim().split('\n').map(JSON.parse);
const inspected=['crew','station','mill','equip','flying','haste','daybound-and-nightbound'];
const research=inspected.map(id=>{
  const r=records.find(r=>r.id===id);if(!r)return {id,recordFound:false};
  const e=r.examples.purest.value,oldCard=old.get(e.oracle_id),newCard=audit.get(e.oracle_id);
  return {id,recordFound:true,membership:r.membership,example:e,exampleState:r.examples.purest.state,
    exampleOracleTextMatchesOct14:e.oracle_text===(oldCard?.oracle_text??oldCard?.card_faces?.map(f=>f.oracle_text||'').join('\n')),
    fieldsMatchOct14To17:JSON.stringify(fields(oldCard))===JSON.stringify(fields(newCard))};
});
const decks=[];
for(const name of ['cosmic','dionus']){
  const {text,result}=JSON.parse(fs.readFileSync(`${dir}/decks/${name}.json`)),deck=resolveDeck(parseDeck(text),result.cards,result.notFound),index=indexMechanics(deck),identity=commanderContext(deck);
  const compare=map=>result.cards.map(c=>({name:c.name,printingId:c.id,oracleId:c.oracle_id,present:map.has(c.oracle_id),match:map.has(c.oracle_id)&&JSON.stringify(fields(map.get(c.oracle_id)))===JSON.stringify(fields(c))}));
  decks.push({name,counts:deck.counts,coverage:index.coverage,commander:deck.rows.filter(r=>identity.rowIds.includes(r.id)).map(r=>({name:r.card.name,id:r.card.id})),flavorPassages:analyzeFlavor(deck).passages.length,
    mechanics:index.terms.map(t=>({label:t.label,distinctCards:t.distinctCards,copies:t.copies,audited:t.audited,contributors:t.cards.flatMap(c=>c.rows)})),
    oct14:compare(old),oct17:compare(audit)});
}
const files=[oldPath,auditPath,recordsPath,'C:/dev/mtg-mechanics/docs/research/mechanic-record/schema.json','C:/dev/mtg-mechanics/docs/research/mechanic-record/MANIFEST','reports/mechanics-coverage/metadata-validation.json','reports/mechanics-coverage/coverage-matrix.json','reports/mechanics-coverage/snapshots/20261017090158/manifest.json',`${dir}/decks/manifest.json`];
fs.writeFileSync(`${dir}/verification.json`,JSON.stringify({gate:'RESEARCH_PARTIAL',sourceHashes:Object.fromEntries(files.map(p=>[p,sha(p)])),research,decks},null,2)+'\n');
for(const d of decks)console.log(`${d.name}: ${d.mechanics.length} labels, ${d.mechanics.filter(t=>t.audited).length} audited; Oct14/current mismatches ${d.oct14.filter(c=>!c.match).length}; Oct17/current mismatches ${d.oct17.filter(c=>!c.match).length}`);
console.log(research.map(r=>({id:r.id,found:r.recordFound,text:r.exampleOracleTextMatchesOct14,snapshotAgreement:r.fieldsMatchOct14To17})));
