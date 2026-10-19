// Source references only. This module cannot change detection or discovery recipes.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const research='reports/remaining-six-sources-20261019';
const review='reports/six-reference-update-20261019';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const checked=(file,sha)=>{const bytes=fs.readFileSync(file);assert.equal(hash(bytes),sha,'Source drift: '+file);return bytes;};
const findings=JSON.parse(checked(`${research}/findings.json`,'4376c01f4e5cae864cb1cd4a3b9ab049d3fd119ec28a5a7f7f60efc2e0f5de48'));
const receipts=JSON.parse(checked(`${review}/receipts.json`,'f6e3562f2624e011bc666c71b2e8bb9c87aa2de0a95dabe916d67b70cf4148e9'));
for(const row of findings.rows){
  assert.equal(row.officialGeneralDefinitionVerified,false);
  for(const r of [...row.evidence,...(row.artifacts??[])])checked(`${research}/${r.file}`,r.sha256);
}
for(const r of receipts)checked(`${review}/${r.file}`,r.sha256);
const row=name=>findings.rows.find(r=>r.name===name);
const source=(e,title,section,publisher,kind,url=e.url)=>({title,section,url,publisher,kind,verifiedOn:(e.checkedAt??e.retrievedAt).slice(0,10),sourceSha256:e.sha256});
const reference=(name,kind,s)=>({title:name,rules:[],verification:kind,referenceKind:kind,definitionVerified:false,source:s});
export const REFERENCE_UPDATES=new Map();
const affinity=row('Affinitycycling');
REFERENCE_UPDATES.set('affinitycycling',reference(affinity.name,'designer-card-example',source(affinity.evidence[0],"My 62 Secret Magic Playtest Cards!",`${affinity.locator.card} · 10:17`,affinity.locator.author,'video',affinity.locator.url)));
const hero=row("Hero's Reward");
REFERENCE_UPDATES.set("hero's reward",reference(hero.name,'archived-mechanic-discussion',source(hero.evidence[0],hero.locator.title,hero.locator.section,'Wizards (archived)','article')));
for(const name of ['Actualize','Covercast']){
  const r=row(name),e=r.evidence.find(e=>e.url.includes('/card-image-gallery'));
  REFERENCE_UPDATES.set(name.toLowerCase(),reference(name,'official-card-example',source(e,'Official card image gallery',r.locator.card,'Wizards','card-example',r.locator.galleryUrl)));
}
const cardReceipt=receipts.find(r=>r.url==='https://api.scryfall.com/cards/cmb2/83');
assert.equal(cardReceipt.status,200);
const card=JSON.parse(checked(`${review}/${cardReceipt.file}`,cardReceipt.sha256));
assert.equal(card.name,'Plane-Merge Elf');
assert.equal(card.oracle_id,'45f94525-84f6-462d-99da-14735f2c273c');
assert.equal(card.legalities.commander,'not_legal');
assert.match(card.set_name,/Mystery Booster Playtest/);
for(const name of ['Kinfall','Landship']){
  assert.ok(card.keywords.includes(name));
  const r=receipts.find(r=>{const u=new URL(r.url);return u.searchParams.get('q')===`keyword:"${name}"`&&u.searchParams.get('include_extras')==='true';});
  assert.equal(r.status,200);
  const result=JSON.parse(checked(`${review}/${r.file}`,r.sha256));
  assert.equal(result.has_more,false);assert.equal(result.total_cards,1);assert.equal(result.data.length,1);
  assert.equal(result.data[0].oracle_id,card.oracle_id);assert.ok(!result.warnings?.length);
  const commander=receipts.find(r=>{const u=new URL(r.url);return u.searchParams.get('q')===`keyword:"${name}" f:commander id<=wubrg`&&u.searchParams.get('include_extras')==='true';});
  assert.equal(commander.status,404);
  assert.equal(JSON.parse(checked(`${review}/${commander.file}`,commander.sha256)).code,'not_found');
  const notes=row(name).evidence.find(e=>e.url.includes('release-notes'));
  const entry=reference(name,'playtest-card-example',source(cardReceipt,'Oracle card record',card.name,'Scryfall','card-example',card.scryfall_uri.split('?')[0]));
  entry.playtest={card:card.name,oracleId:card.oracle_id,commander:card.legalities.commander,uniqueCards:result.total_cards,checkedOn:r.checkedAt.slice(0,10),searchUrl:'https://scryfall.com/search?'+new URLSearchParams({q:`keyword:"${name}"`,unique:'cards',include_extras:'true'}),sourceSha256:r.sha256};
  entry.supportingSource=source(notes,'Mystery Booster Release Notes','Playtest Cards','Wizards','format-guidance');
  REFERENCE_UPDATES.set(name.toLowerCase(),entry);
}
assert.equal(REFERENCE_UPDATES.size,6);
