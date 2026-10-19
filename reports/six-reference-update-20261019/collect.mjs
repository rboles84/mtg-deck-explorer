import fs from 'node:fs';
import crypto from 'node:crypto';
const dir='reports/six-reference-update-20261019';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
fs.mkdirSync(`${dir}/sources`,{recursive:true});
const urls=[
  ...['Kinfall','Landship'].flatMap(label=>[
    'https://api.scryfall.com/cards/search?'+new URLSearchParams({q:`keyword:"${label}"`,unique:'cards',include_extras:'true'}),
    'https://api.scryfall.com/cards/search?'+new URLSearchParams({q:`keyword:"${label}" f:commander id<=wubrg`,unique:'cards',include_extras:'true'}),
  ]),
];
const receipts=JSON.parse(fs.readFileSync(`${dir}/receipts.json`));
for(const url of urls){
  const r=await fetch(url,{headers:{'User-Agent':'DeckExplorer-SourceVerification/1.0','Accept':'application/json'},signal:AbortSignal.timeout(25000)});
  const bytes=Buffer.from(await r.arrayBuffer()),data=JSON.parse(bytes),sha256=hash(bytes),file=`sources/${sha256}.json`;
  if(data.warnings?.length)throw Error('Scryfall warning: '+url);
  if(r.status!==200&&!(r.status===404&&data.code==='not_found'))throw Error('Unexpected status '+r.status);
  fs.writeFileSync(`${dir}/${file}`,bytes);
  receipts.push({url,finalUrl:r.url,status:r.status,checkedAt:new Date().toISOString(),sha256,file});
  console.log(JSON.stringify({url,status:r.status,total:data.total_cards,name:data.name,oracleId:data.oracle_id,commander:data.legalities?.commander,hasMore:data.has_more}));
  await new Promise(resolve=>setTimeout(resolve,120));
}
fs.writeFileSync(`${dir}/receipts.json`,JSON.stringify(receipts,null,2)+'\n');
