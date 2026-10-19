import vocabulary from './mechanics-vocabulary.mjs';
import {deepFreeze} from './core.mjs';
import {SHORTLIST_LABELS} from './mechanic-supplement.mjs';
import {VARIANT_LABELS} from './mechanic-variants.mjs';

const audited=new Map(vocabulary.labels.map(label=>[label.key,label]));
const supplemental=new Map([...SHORTLIST_LABELS,...VARIANT_LABELS].map(label=>[label.key,label]));
export const keywordKey=value=>value.toLowerCase();
export function keywordStatus(card) {
  if(card?.keywords_status==='missing'||card?.keywords_status==='malformed')return card.keywords_status;
  if(card?.keywords===undefined)return 'missing';
  return Array.isArray(card.keywords)&&card.keywords.length<=100&&card.keywords.every(k=>typeof k==='string'&&k.length>0&&k.length<=150)?'reported':'malformed';
}

// A provider-label index only. No Oracle-text, face, grant, parameter or color inference.
export function indexMechanics(deck) {
  const terms=new Map(),rows=deck?.rows.filter(r=>r.playable)||[];
  const coverage={entries:rows.length,copies:0,resolvedEntries:0,resolvedCopies:0,reportedEntries:0,reportedCopies:0,missingEntries:0,malformedEntries:0,emptyEntries:0,missingOracleEntries:0};
  for(const row of rows) {
    coverage.copies+=row.quantity||0;
    if(row.status!=='resolved'||!row.card)continue;
    coverage.resolvedEntries++;coverage.resolvedCopies+=row.quantity;
    const card=row.card,status=keywordStatus(card);
    if(status!=='reported'){coverage[`${status}Entries`]++;continue;}
    coverage.reportedEntries++;coverage.reportedCopies+=row.quantity;
    if(!card.keywords.length)coverage.emptyEntries++;
    if(!card.oracle_id)coverage.missingOracleEntries++;
    const identity=card.oracle_id?`oracle:${card.oracle_id.toLowerCase()}`:`printing:${card.id}`;
    const rowTerms=new Map();
    card.keywords.forEach((spelling,index)=>{const key=keywordKey(spelling);if(!rowTerms.has(key))rowTerms.set(key,[]);rowTerms.get(key).push({spelling,index});});
    for(const [key,occurrences] of rowTerms) {
      if(!terms.has(key)){
        const classification=audited.get(key)||supplemental.get(key)||null;
        terms.set(key,{key,label:occurrences[0].spelling,spellings:[],audited:audited.has(key),reviewed:!!classification,category:classification?.category||'unmapped provider-reported term',classification,relationship:'provider_reports',sourceField:'keywords[]',cards:[],copies:0});
      }
      const term=terms.get(key);
      for(const {spelling} of occurrences)if(!term.spellings.includes(spelling))term.spellings.push(spelling);
      let member=term.cards.find(c=>c.identity===identity);
      if(!member){member={identity,oracleId:card.oracle_id||null,rows:[],copies:0};term.cards.push(member);}
      member.rows.push({rowId:row.id,lineNumber:row.lineNumber,printingId:card.id,quantity:row.quantity,name:card.name,occurrences,face:null});
      member.copies+=row.quantity;term.copies+=row.quantity;
    }
  }
  return deepFreeze({vocabularyVersion:vocabulary.version,auditSha256:vocabulary.auditSha256,coverage,terms:[...terms.values()].sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0).map(term=>({...term,distinctCards:term.cards.length}))});
}
