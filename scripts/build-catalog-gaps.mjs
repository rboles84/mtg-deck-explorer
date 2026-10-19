import fs from 'node:fs';
import {hash,DIR,SNAPSHOT,cards,matches} from './verify-catalog-gaps.mjs';
import {GAP_SPECS} from './catalog-gap-spec.mjs';
import {RULES_REVISION} from '../public/mechanic-rules.mjs';
import {REFERENCE_UPDATES} from './catalog-gap-reference-updates.mjs';

const proofBytes=fs.readFileSync(DIR+'/verification.json'),proof=JSON.parse(proofBytes);
const evidenceSha256=hash(proofBytes),rules=JSON.parse(fs.readFileSync('public/rules-data.json'));
const sourceProof=JSON.parse(fs.readFileSync(DIR+'/sources.json'));
for(const source of sourceProof.sources)if(hash(fs.readFileSync(`${DIR}/${source.file}`))!==source.sha256)throw new Error('Wizards article drift');
if(hash(fs.readFileSync('evidence/MagicCompRules-20260925.txt'))!==RULES_REVISION.sourceSha256)throw new Error('Rule revision drift');
if(hash(fs.readFileSync(SNAPSHOT+'oracle-cards.jsonl.gz'))!==proof.corpusSha256)throw new Error('Corpus drift');
if(proof.rows.length!==42||GAP_SPECS.length!==42)throw new Error('Scope drift');
const gaps=[],rows=[],records=[];
for(const spec of GAP_SPECS){
  const p=proof.rows.find(r=>r.key===spec.key);
  if(!p||p.pattern!==spec.pattern||p.rule!==spec.rule||p.expression!==(spec.pattern?`fo:/${spec.pattern}/`:`kw:${JSON.stringify(spec.label)}`))throw new Error('Proof specification drift');
  for(const receipt of [p.validation.membership,p.validation.commander])if(hash(fs.readFileSync(`${DIR}/${receipt.file}`))!==receipt.sha256)throw new Error('Response drift');
  const membership=JSON.parse(fs.readFileSync(`${DIR}/${p.validation.membership.file}`));
  if(membership.warnings?.length||membership.has_more||!p.positives.length||!p.negatives.length||p.positives.some(c=>!membership.data.some(r=>r.oracle_id===c.oracle_id))||p.negatives.some(c=>membership.data.some(r=>r.oracle_id===c.oracle_id)))throw new Error('Invalid membership proof');
  for(const c of p.positives)if(!matches(spec,c))throw new Error('Detection witness mismatch');
  for(const c of p.negatives)if(matches(spec,c))throw new Error('Negative detection witness mismatch');
  const clauses={};
  if(spec.rule){
    const selected=rules.sections[spec.rule]?.paragraphs??[rules.rules[spec.rule]];
    for(const c of selected){if(!c?.number||!c.text||rules.rules[c.number]?.text!==c.text)throw new Error('Missing rule '+spec.rule);clauses[c.number]=c.text;}
  }
  const example=p.positives[0];
  const reference=spec.rule?{title:spec.label,rules:Object.keys(clauses),verification:'verified'}:{
    title:spec.label,rules:[],verification:'provider-card-example',referenceKind:'provider-card-example',
    source:{title:'Oracle card record',section:example.name,url:example.scryfall_uri.split('?')[0],kind:'card-example',verifiedOn:p.validation.checkedAt.slice(0,10)},
  };
  const article=sourceProof.sources.find(s=>s.labels.includes(spec.label));
  if(article){
    Object.assign(reference,{verification:'verified',referenceKind:'official-mechanic-reference',source:{title:article.title,section:article.section,url:article.url,kind:'article',verifiedOn:article.checkedAt.slice(0,10),sourceSha256:article.sha256}});
  }
  const update=REFERENCE_UPDATES.get(spec.key);
  if(update){
    if(spec.rule||article||reference.referenceKind!=='provider-card-example')throw new Error('Reference scope drift: '+spec.key);
    Object.assign(reference,update);
  }
  const gap={key:spec.key,term:spec.label,category:p.category,review:proof.version,discovery:'reviewed-search',pattern:spec.pattern,clauses,reference};
  gaps.push(gap);
  const id='keyword-index-catalog-gap-'+spec.key.replace(/[^a-z0-9]+/g,'-').replace(/-$/,'');
  const coverage=spec.pattern?'Matches the reviewed wording or symbols in full Oracle text, including reminder text. Grants, restrictions, and references may match. Other wording and implicit actions may be absent. This does not establish possession or a usable action.':'Matches this exact Scryfall keyword label. This does not establish possession, a particular face, or a usable action. Cards outside Commander legality are excluded; zero results can be correct.';
  rows.push({id,section:'Keyword_Index',group:p.category,label:spec.label,query:p.expression,parameters:[],tier:'Review',auto_execute:false,live_count:p.validation.commanderTotal,validated:p.validation.checkedAt.slice(0,10),technique:spec.pattern?'Full Oracle wording; verified positive/negative Oracle IDs':'Scryfall keyword index; verified positive/negative Oracle IDs',fallback:null,fallback_count:null,blind_spot:coverage,assumption:null,baseline_case:'f:commander id<=wubrg',baseline_relation:'Count includes the Commander baseline.',rules:spec.rule,flags:proof.version,expect_zero:p.validation.commanderTotal===0});
  records.push({key:spec.key,label:spec.label,atlasRowId:id,display:true,querySha256:hash(p.expression),expression:p.expression,execution:'manual',relationship:spec.pattern?'oracle-text-mentions':'provider-reported-involvement',coverage,validation:{status:'passed',checkedAt:p.validation.checkedAt,query:p.expression,evidence:DIR+'/verification.json',positive:p.validation.positive,negative:p.validation.negative}});
}
const registry={version:'1.0.0',atlasVersion:'2.1',vocabularyVersion:proof.version,auditSha256:evidenceSha256,rows,records};
const outputs={
  'public/catalog-gap-data.mjs':`// Generated only from retained catalogs, card records, and verbatim Wizards clauses.\nimport {deepFreeze} from './core.mjs';\nexport const CATALOG_GAP_REVIEW=Object.freeze(${JSON.stringify({version:proof.version,evidenceSha256})});\nexport const CATALOG_GAPS=deepFreeze(${JSON.stringify(gaps,null,2)});\n`,
  'lib/mechanic-discovery.catalog-gaps.json':JSON.stringify(registry,null,2)+'\n',
};
for(const [file,text] of Object.entries(outputs)){
  if(process.argv.includes('--check')){if(fs.readFileSync(file,'utf8')!==text)throw new Error('Generated file drift: '+file);}
  else fs.writeFileSync(file,text);
}
console.log(`${gaps.length} exact catalog names; ${gaps.filter(g=>g.pattern).length} bounded text recognizers; ${gaps.filter(g=>g.reference.rules.length).length} verbatim rule references; ${gaps.filter(g=>g.reference.referenceKind==='official-mechanic-reference').length} Wizards article references; ${REFERENCE_UPDATES.size} scoped source references; ${records.length} proven manual searches.`);
