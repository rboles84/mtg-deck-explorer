import fs from 'node:fs';
import crypto from 'node:crypto';
const dir='reports/catalog-gaps-20261019';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const specs=[
  {labels:['Augment'],path:'card-preview/unstable-mechanics-2017-11-13',section:'Host and Augment',anchor:'Augment is an activated ability you activate from your hand.'},
  {labels:['Specialize','Double team'],path:'mtg-arena/mtg-arena-announcements-june-22-2022',section:"Alchemy Horizons: Baldur’s Gate",anchor:'Specialize'},
  {labels:['Intensity'],path:'mtg-arena/mtg-arena-state-game-alchemy-kamigawa-2022-03-16',section:'New Mechanic: Intensity',anchor:'New Mechanic: Intensity'},
  {labels:['Seek','Conjure','Draft from a spellbook'],path:'mtg-arena/designing-alchemy-2021-12-08',section:'How Can Our Mechanics Support a Dynamic Format?',anchor:'draft from the spellbook mechanic'},
  {labels:['Heist'],path:'mtg-arena/mtg-arena-announcements-april-29-2024',section:'Alchemy: Thunder Junction',anchor:'Heist is a new keyword ability'},
  {labels:['Incorporate'],path:'mtg-arena/mtg-arena-announcements-march-4-2024',section:'Alchemy: Karlov Manor Arrives Tomorrow!',anchor:'the new mechanic incorporate'},
  {labels:['Assimilate','Face a dilemma'],path:'feature/collecting-star-trek',section:'The Mechanics of Magic: The Gathering | Star Trek',anchor:'The assimilate keyword action'},
  {labels:['Legacy'],path:'feature/mystery-booster-release-notes-2019-11-11',section:'Gold Mine; Inspirational Antelope',anchor:'Nodes remain permanently marked on the physical card.'},
];
const sources=[];
fs.mkdirSync(dir+'/sources',{recursive:true});
for(const spec of specs){
  const url='https://magic.wizards.com/en/news/'+spec.path;
  const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('Source unavailable: '+url+' '+response.status);
  const bytes=Buffer.from(await response.arrayBuffer());
  const text=bytes.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,'').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ');
  if(!text.toLowerCase().includes(spec.anchor.toLowerCase()))throw new Error('Source content mismatch: '+url);
  // Names can be separated by inline markup. Draft's provider label is a
  // grammatical variant of the exact "draft from the spellbook" source wording.
  for(const name of spec.labels)if(!text.toLowerCase().includes((name==='Draft from a spellbook'?'draft from the spellbook':name).toLowerCase()))throw new Error('Missing label '+name);
  const sha256=hash(bytes),file=`sources/${sha256}.html`;
  fs.writeFileSync(`${dir}/${file}`,bytes);
  const title=bytes.toString().match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.replace(/&amp;/g,'&')||spec.section;
  sources.push({...spec,url,title,sha256,file,bytes:bytes.length,status:response.status,checkedAt:new Date().toISOString()});
  console.log(spec.labels.join(', ')+': source retained and text matched');
}
fs.writeFileSync(dir+'/sources.json',JSON.stringify({sources},null,2)+'\n');
