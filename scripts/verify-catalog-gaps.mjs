import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {GAP_SPECS} from './catalog-gap-spec.mjs';
import {loadCatalog} from '../lib/catalog.mjs';

export const DIR='reports/catalog-gaps-20261019';
export const SNAPSHOT='reports/mechanics-coverage/snapshots/20261017090158/';
export const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
export const cards=zlib.gunzipSync(fs.readFileSync(SNAPSHOT+'oracle-cards.jsonl.gz')).toString().trim().split('\n').map(JSON.parse);
export const fields=card=>[
  ...(typeof card.oracle_text==='string'?[{field:'oracle_text',face:null,text:card.oracle_text}]:[]),
  ...(card.card_faces||[]).flatMap((f,i)=>typeof f.oracle_text==='string'?[{field:`card_faces[${i}].oracle_text`,face:i,text:f.oracle_text}]:[]),
];
export const matches=(s,c)=>s.pattern?fields(c).some(f=>new RegExp(s.pattern,'i').test(f.text)):(c.keywords||[]).some(k=>k.toLowerCase()===s.key);
export const witness=c=>({id:c.id,oracle_id:c.oracle_id,name:c.name,keywords:c.keywords,oracle_text:c.oracle_text,card_faces:c.card_faces,scryfall_uri:c.scryfall_uri,legalities:c.legalities,games:c.games});

if(process.argv.includes('--live')){
  fs.mkdirSync(DIR+'/responses',{recursive:true});
  const proofPath=DIR+'/verification.json';
  if(fs.existsSync(proofPath))throw new Error('Receipt already exists. Do not overwrite a completed proof.');
  const receipts=fs.existsSync(DIR+'/requests.json')?JSON.parse(fs.readFileSync(DIR+'/requests.json')):[];
  async function get(url){
    const cached=receipts.find(r=>r.url===url);
    if(cached){const bytes=fs.readFileSync(`${DIR}/${cached.file}`);if(hash(bytes)!==cached.sha256)throw new Error('Receipt drift');return {data:JSON.parse(bytes),receipt:cached};}
    await new Promise(r=>setTimeout(r,550));
    const r=await fetch(url,{headers:{'User-Agent':'MTG-Deck-Explorer/1.0 (catalog coverage verification)','Accept':'application/json'},signal:AbortSignal.timeout(30000)});
    const bytes=Buffer.from(await r.arrayBuffer()),sha256=hash(bytes),file=`responses/${sha256}.json`;
    fs.writeFileSync(`${DIR}/${file}`,bytes);
    const receipt={url,status:r.status,sha256,file,bytes:bytes.length,checkedAt:new Date().toISOString()};receipts.push(receipt);
    fs.writeFileSync(DIR+'/requests.json',JSON.stringify(receipts,null,2)+'\n');
    let data;try{data=JSON.parse(bytes);}catch{throw new Error(`Non-JSON response: ${url}`);}
    if(!r.ok&&!(r.status===404&&data.code==='not_found'))throw new Error(`HTTP ${r.status}: ${url}`);
    return {data,receipt};
  }
  const catalogs=[];
  for(const name of ['keyword-abilities','keyword-actions','ability-words']){
    const {data,receipt}=await get(`https://api.scryfall.com/catalog/${name}`);
    const retained=JSON.parse(fs.readFileSync(SNAPSHOT+name+'.json'));
    if(JSON.stringify(data.data)!==JSON.stringify(retained.data))throw new Error('Catalog changed; reconcile before enabling.');
    catalogs.push({name,names:data.data,receipt});
  }
  const original=await loadCatalog(process.cwd());
  const missing=catalogs.flatMap(c=>c.names).filter(n=>!original.records.filter(r=>!r.atlas_row_id.startsWith('catalog-gap-')&&!r.atlas_row_id.startsWith('keyword-index-catalog-gap-')).some(r=>r.master_name.toLowerCase()===n.toLowerCase())).sort();
  if(JSON.stringify(missing)!==JSON.stringify(GAP_SPECS.map(s=>s.label).sort()))throw new Error('Expected exactly the 42 unresolved catalog names.');
  const rows=[];
  for(const spec of GAP_SPECS){
    const positives=cards.filter(c=>matches(spec,c));
    const preferred=spec.positive?positives.find(c=>c.name===spec.positive):positives[0];
    if(!preferred)throw new Error('Missing positive '+spec.label+': '+spec.positive);
    const selected=[preferred,...positives.filter(c=>c!==preferred).slice(0,2)];
    const negatives=[spec.negative,'Mountain','Sol Ring'].map(n=>cards.find(c=>c.name===n)).filter(c=>c&&!matches(spec,c));
    if(!negatives.length||!negatives.some(c=>c.name===spec.negative))throw new Error('Invalid negative '+spec.label);
    const expression=spec.pattern?`fo:/${spec.pattern}/`:`kw:${JSON.stringify(spec.label)}`;
    const clause=[...selected,...negatives].map(c=>`oracleid:${c.oracle_id}`).join(' or ');
    const query=`(${expression}) (${clause}) include:extras`;
    const result=await get('https://api.scryfall.com/cards/search?'+new URLSearchParams({q:query,unique:'cards',order:'name'}));
    const returned=new Set((result.data.data||[]).map(c=>c.oracle_id));
    if(result.data.warnings?.length||result.data.has_more||selected.some(c=>!returned.has(c.oracle_id))||negatives.some(c=>returned.has(c.oracle_id)))throw new Error('Membership failure '+spec.label);
    if((result.data.data||[]).some(c=>!matches(spec,c)))throw new Error('Live metadata/text drift '+spec.label);
    const commanderQuery=`(f:commander id<=wubrg) (${expression})`;
    const commander=await get('https://api.scryfall.com/cards/search?'+new URLSearchParams({q:commanderQuery,unique:'cards',order:'name'}));
    if(commander.data.warnings?.length||(commander.data.data||[]).some(c=>c.legalities?.commander!=='legal'||!matches(spec,c)))throw new Error('Commander result scope failure '+spec.label);
    rows.push({...spec,expression,category:catalogs.find(c=>c.names.includes(spec.label)).name.replaceAll('-',' ').replace(/ies$/,'y').replace(/s$/,''),
      positives:selected.map(witness),negatives:negatives.map(witness),snapshotMatches:positives.length,
      validation:{status:'passed',checkedAt:result.receipt.checkedAt,positive:selected.map(c=>c.oracle_id),negative:negatives.map(c=>c.oracle_id),membership:result.receipt,commander:commander.receipt,commanderTotal:commander.data.total_cards||0}});
    console.log(`${spec.label}: ${positives.length} corpus matches, ${selected.length}+/${negatives.length}- live witnesses, ${commander.data.total_cards||0} Commander results`);
  }
  fs.writeFileSync(proofPath,JSON.stringify({version:'catalog-gaps-2026-10-19',catalogs,corpusSha256:hash(fs.readFileSync(SNAPSHOT+'oracle-cards.jsonl.gz')),rows},null,2)+'\n');
}
