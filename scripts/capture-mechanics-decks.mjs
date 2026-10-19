// Explicit QA capture only. Uses the existing bounded collection client; never search.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {parseDeck} from '../public/core.mjs';
import {createScryfallClient} from '../lib/scryfall.mjs';
if(!process.argv.includes('--capture'))throw new Error('Pass --capture for the two authorized owner-deck collection imports.');
const dir='reports/mechanics-integration/decks';
if(fs.existsSync(dir))throw new Error('Capture exists; refusing to overwrite versioned evidence.');
fs.mkdirSync(dir,{recursive:true});
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const manifest={capturedAt:new Date().toISOString(),requests:[],decks:[]};
const client=createScryfallClient({fetchImpl:async(url,options)=>{
  if(url!=='https://api.scryfall.com/cards/collection')throw new Error('Only bounded collection imports authorized.');
  const response=await fetch(url,options),bytes=Buffer.from(await response.arrayBuffer());
  const file=`collection-${manifest.requests.length+1}.json`;
  fs.writeFileSync(`${dir}/${file}`,bytes);
  manifest.requests.push({file,sha256:sha(bytes),url,request:JSON.parse(options.body),status:response.status});
  return new Response(bytes,{status:response.status,headers:response.headers});
}});
try {
  for(const [name,path] of [['cosmic','C:/dev/mtg-deck-explorer/fixtures/cosmicspiderman.txt'],['dionus','C:/Users/obake/Downloads/carelf.txt']]) {
    const bytes=fs.readFileSync(path),text=bytes.toString('utf8'),parsed=parseDeck(text);
    const result=await client.resolve(parsed.identifiers),file=`${name}.json`;
    const contents=JSON.stringify({text,result},null,2)+'\n';fs.writeFileSync(`${dir}/${file}`,contents);
    manifest.decks.push({name,path,inputSha256:sha(bytes),file,sha256:sha(contents)});
    console.log(`${name}: ${parsed.rows.length} rows; ${result.cards.length} returned printing records.`);
  }
}finally{fs.writeFileSync(`${dir}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');}
