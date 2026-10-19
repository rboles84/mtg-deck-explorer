import {indexMechanics as providerIndex, keywordKey} from './mechanics.mjs';
import {deepFreeze} from './core.mjs';
import {CATALOG_GAPS} from './catalog-gap-data.mjs';
export {keywordKey};

const labels=new Map(CATALOG_GAPS.map(g=>[g.key,g]));
const recognizers=CATALOG_GAPS.filter(g=>g.pattern).map(g=>({gap:g,expression:new RegExp(g.pattern,'gi')}));

// Exact source offsets; no parsing of names, flavor text, printed translations,
// deck tags, or ability implications. Text recognition is deliberately bounded.
export function catalogGapEvidence(card){
  const fields=[];
  if(typeof card?.oracle_text==='string')fields.push({field:'oracle_text',face:null,text:card.oracle_text});
  if(Array.isArray(card?.card_faces))card.card_faces.slice(0,10).forEach((f,i)=>{
    if(typeof f?.oracle_text==='string')fields.push({field:`card_faces[${i}].oracle_text`,face:i,text:f.oracle_text});
  });
  const found=new Map();
  for(const {gap,expression} of recognizers)for(const field of fields){
    if(field.text.length>50000)continue;
    expression.lastIndex=0;
    const occurrences=[];
    for(const match of field.text.matchAll(expression)){
      occurrences.push({sourceField:field.field,face:field.face,index:match.index,spelling:match[0]});
      if(occurrences.length>=100)break;
    }
    if(occurrences.length)found.set(gap.key,[...(found.get(gap.key)||[]),...occurrences]);
  }
  return found;
}

// Keep the validated metadata-only index intact. Merge additional evidence by
// imported row so a card reported through both channels never gains copies.
export function indexMechanics(deck){
  const base=providerIndex(deck);
  if(!deck||deck.synthetic)return base;
  const terms=new Map(base.terms.map(t=>[t.key,structuredClone(t)]));
  for(const term of terms.values())if(labels.has(term.key)){
    term.reviewed=true;term.classification=labels.get(term.key);term.category=term.classification.category;
  }
  for(const row of deck.rows){
    if(!row.playable||row.status!=='resolved'||!row.card)continue;
    const card=row.card,identity=card.oracle_id?`oracle:${card.oracle_id.toLowerCase()}`:`printing:${card.id}`;
    for(const [key,occurrences] of catalogGapEvidence(card)){
      const gap=labels.get(key);
      if(!terms.has(key))terms.set(key,{key,label:gap.term,spellings:[gap.term],audited:false,reviewed:true,category:gap.category,classification:gap,relationship:'oracle_text_mentions',sourceField:'oracle_text',cards:[],copies:0});
      const term=terms.get(key);
      if(term.relationship==='provider_reports')term.relationship='provider_reports_and_oracle_text_mentions';
      term.hasOracleEvidence=true;
      let member=term.cards.find(c=>c.identity===identity);
      if(!member){member={identity,oracleId:card.oracle_id||null,rows:[],copies:0};term.cards.push(member);}
      let evidence=member.rows.find(r=>r.rowId===row.id);
      if(!evidence){evidence={rowId:row.id,lineNumber:row.lineNumber,printingId:card.id,quantity:row.quantity,name:card.name,occurrences:[],face:null};member.rows.push(evidence);member.copies+=row.quantity;term.copies+=row.quantity;}
      evidence.occurrences.push(...occurrences);
    }
  }
  return deepFreeze({...base,terms:[...terms.values()].sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0).map(t=>({...t,distinctCards:t.cards.length}))});
}
