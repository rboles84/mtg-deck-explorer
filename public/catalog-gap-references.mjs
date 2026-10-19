import {mechanicRule as originalRule,mechanicExplanation as originalExplanation,mechanicSourceStatus as originalStatus,RULES_REVISION} from './mechanic-rules.mjs';
import {CATALOG_GAPS} from './catalog-gap-data.mjs';
const gaps=new Map(CATALOG_GAPS.map(g=>[g.key,g]));
const entry=label=>typeof label==='string'?gaps.get(label.toLowerCase()):null;
const pinned=data=>data?.date===RULES_REVISION.date&&data?.sourceUrl===RULES_REVISION.sourceUrl&&data?.sourceSha256===RULES_REVISION.sourceSha256;
export const mechanicRule=originalRule;
export function mechanicSourceStatus(label){return entry(label)?.reference.verification??originalStatus(label);}
export function mechanicExplanation(data,label,ids=[]){
  const gap=entry(label);
  if(!gap)return originalExplanation(data,label,ids);
  if(!pinned(data))return null;
  const ref=gap.reference;
  if(!ref.rules.every(number=>data.rules?.[number]?.text===gap.clauses[number]))return null;
  return ref;
}
