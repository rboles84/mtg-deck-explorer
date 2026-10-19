import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDeck,validateCommanderImport,resolveDeck,selectReferencePrinting,commanderContext} from '../public/core.mjs';
import {createScryfallClient,validateIdentifiers,safeCard} from '../lib/scryfall.mjs';
import {createDeckServer} from '../server.mjs';
import {identifierKey,printingDescription} from '../public/import-model.mjs';

const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const card=(n,extra={})=>({object:'card',id:uuid(n),oracle_id:uuid(9999),name:'Canonical Card',flavor_name:'Alternate Card',set:'tst',collector_number:String(n),lang:'en',color_identity:['G'],keywords:[],legalities:{commander:'legal'},...extra});
const collection=(data,not_found=[])=>new Response(JSON.stringify({object:'list',data,not_found}),{status:200});
const page=(data,total=data.length,hasMore=false,extra={})=>new Response(JSON.stringify({object:'list',data,total_cards:total,has_more:hasMore,...extra}),{status:200});
const candidates=Array.from({length:176},(_,i)=>card(i+1));

test('CSV quantities are decimal integers, and malformed headers are never ignored',()=>{
  for(const quantity of ['0x64','1e2','100.0','+100','Infinity','NaN']){
    const parsed=parseDeck(`Quantity,Name\n${quantity},Forest`);
    assert.equal(validateCommanderImport(parsed).valid,false,quantity);assert.ok(Number.isNaN(parsed.rows[0].quantity));
    assert.match(validateCommanderImport(parsed).issues.join(' '),/total is incomplete/);
  }
  assert.equal(validateCommanderImport(parseDeck('Quantity,Name\n0100,Forest')).valid,true);
  const header=parseDeck('Quantity,Name,Unknow"n\n100,Forest,x');
  assert.equal(validateCommanderImport(header).valid,false);assert.match(header.issues.join(' '),/CSV header/);
  assert.equal(parseDeck('Quantity,Name\r100,Forest').format,'csv');
  assert.equal(parseDeck('  100 Quantity, Name').format,'text');
});

test('commander rules respect explicit placements, comma tags and noDeck modifiers',()=>{
  for(const tag of ['Sideboard, Draw','Draw, Sideboard','Sideboard{noPrice}, Draw']){
    const parsed=parseDeck(`99 Forest\nSideboard\n1 Plains\n\n1 Island [${tag}]`);
    assert.equal(parsed.commanderSuggestions.length,0,tag);assert.equal(parsed.rows.at(-1).section,'Sideboard');
  }
  const noDeck=parseDeck('100 Forest\n1 Island [Wishlist{noDeck},Draw]');
  assert.equal(noDeck.counts.playableQuantity,100);assert.equal(noDeck.counts.excludedQuantity,1);
  assert.equal(validateCommanderImport(noDeck).valid,true);
  assert.equal(validateCommanderImport(parseDeck('100 Forest [Commander{noDeck}]')).valid,false);
  assert.equal(validateCommanderImport(parseDeck('Commander\n2 Leader\nDeck\n98 Forest')).valid,false);
  assert.equal(validateCommanderImport(parseDeck('Commander\n1 First\n1 Second\n1 Third\nDeck\n97 Forest')).valid,false);
  assert.equal(validateCommanderImport(parseDeck('Quantity,Name,Set\n100,Forest,tst')).valid,true);
});

test('two commander names cannot designate the same resolved Oracle identity',()=>{
  const parsed=parseDeck('Commander\n1 Canonical Card\n1 Alternate Card\nDeck\n98 Canonical Card');
  assert.equal(validateCommanderImport(parsed).valid,true);
  const resolved=resolveDeck(parsed,[card(1)]);
  assert.equal(validateCommanderImport(resolved).valid,false);
  assert.match(validateCommanderImport(resolved).issues.join(' '),/same card identity/);
});

test('alternate-name edition changes use Oracle identity and preserve original names',()=>{
  const original=card(1),ordinary=card(2,{flavor_name:undefined});
  const source='100 Alternate Card',deck=resolveDeck(parseDeck(source),[original]);
  const draft=selectReferencePrinting(deck,'row-1',ordinary.id),changed=resolveDeck(draft,[ordinary]);
  assert.equal(changed.rows[0].status,'resolved');assert.equal(changed.rows[0].name,'Alternate Card');
  assert.equal(changed.sourceText,source);assert.equal(changed.rows[0].printingProvenance.kind,'user-selected');
  const wrong=resolveDeck(draft,[{...ordinary,oracle_id:uuid(123)}]);assert.equal(wrong.rows[0].status,'mismatch');assert.equal(wrong.rows[0].card,null);
  assert.match(wrong.rows[0].issues.join(' '),/Oracle identity/);
  assert.throws(()=>selectReferencePrinting(deck,'row-1',[ordinary.id]),/UUID/);
});

test('literal name matching accepts typographic apostrophes and only verified split-face spellings',async()=>{
  const oracle=card(1,{name:"Thassa's Oracle",flavor_name:undefined});
  const split=card(2,{name:'Fire // Ice',flavor_name:undefined,card_faces:[{name:'Fire'},{name:'Ice'}]});
  const calls=[];
  const client=createScryfallClient({minimumGap:0,fetchImpl:async(url,options)=>{
    if(options.method!=='POST')return page([]);
    const ids=JSON.parse(options.body).identifiers;calls.push(ids);
    return ids.some(item=>item.name==='Fire')?collection([split]):collection([oracle],ids.filter(item=>item.name!=='Thassa’s Oracle'));
  }});
  const names=['Thassa’s Oracle','Fire / Ice','Fire/Ice','Fire/Not Ice'];
  const result=await client.resolve(names.map(name=>({name})));
  assert.deepEqual(result.outcomes.map(item=>item.status),['matched','matched','matched','not-found']);
  assert.ok(calls.some(ids=>ids.some(item=>item.name==='Fire')));
  assert.equal(resolveDeck(parseDeck('100 Thassa’s Oracle'),result.cards,[],result.outcomes).rows[0].status,'resolved');
  const summon=card(3,{name:'Summon: Choco/Mog',flavor_name:undefined});
  assert.equal(resolveDeck(parseDeck('100 Summon: Choco/Mog'),[summon]).rows[0].status,'resolved');
});

test('joined translated face names require complete provider metadata',()=>{
  const translated=card(1,{name:'First // Second',lang:'fr',card_faces:[{name:'First',printed_name:'Premier'},{name:'Second',printed_name:'Deuxième'}]});
  const parsed=parseDeck(`Quantity,Name,Scryfall ID,Language\n100,Premier / Deuxième,${uuid(1)},fr`);
  assert.equal(resolveDeck(parsed,[translated]).rows[0].status,'resolved');
  const incomplete={...translated,card_faces:[...translated.card_faces,{name:'Third'}]};
  assert.equal(resolveDeck(parsed,[incomplete]).rows[0].status,'mismatch');
});

for(const total of [175,176])test(`exact alias lookup traverses ${total} printings on fixed provider URLs`,async()=>{
  const calls=[];
  const client=createScryfallClient({minimumGap:0,fetchImpl:async(url,options)=>{
    if(options.method==='POST')return collection([],JSON.parse(options.body).identifiers);
    const parsed=new URL(url);calls.push(parsed);const index=Number(parsed.searchParams.get('page'));
    return page(candidates.slice((index-1)*175,Math.min(index*175,total)),total,index*175<total,{next_page:'https://attacker.invalid/steal'});
  }});
  const result=await client.resolve([{name:'Alternate Card'}]);
  assert.equal(calls.length,Math.ceil(total/175));assert.ok(calls.every(url=>url.origin==='https://api.scryfall.com'&&url.pathname==='/cards/search'));
  assert.equal(result.outcomes[0].status,'matched');assert.equal(result.cards.length,1);
  assert.equal(result.outcomes[0].cardId,uuid(1));
});

for(const failure of ['changed total','duplicate printing','truncated page','bad more','oversized total'])test(`exact alias lookup rejects ${failure}`,async()=>{
  const client=createScryfallClient({minimumGap:0,fetchImpl:async(url,options)=>{
    if(options.method==='POST')return collection([],JSON.parse(options.body).identifiers);
    const index=Number(new URL(url).searchParams.get('page'));
    if(failure==='oversized total')return page([],1401,true);
    if(index===1)return page(failure==='truncated page'?candidates.slice(0,174):candidates.slice(0,175),176,failure!=='bad more');
    return page([failure==='duplicate printing'?candidates[0]:candidates[175]],failure==='changed total'?177:176,false);
  }});
  await assert.rejects(client.resolve([{name:'Alternate Card'}]),error=>[409,422,502].includes(error.status));
});

test('pagination drift invalidates cached alias pages so an explicit retry can succeed',async()=>{
  let attempt=0;
  const client=createScryfallClient({minimumGap:0,fetchImpl:async(url,options)=>{
    if(options.method==='POST')return collection([],JSON.parse(options.body).identifiers);
    const index=Number(new URL(url).searchParams.get('page'));if(index===1){attempt++;return page(candidates.slice(0,175),176,true);}
    return page(candidates.slice(175),attempt===1?177:176,false);
  }});
  await assert.rejects(client.resolve([{name:'Alternate Card'}]),error=>error.status===409);
  assert.equal((await client.resolve([{name:'Alternate Card'}])).outcomes[0].status,'matched');assert.equal(attempt,2);
});

test('alias fallback cannot change a collection-resolved reference edition',async()=>{
  const original=card(9,{flavor_name:undefined}),alias=card(1);
  const client=createScryfallClient({minimumGap:0,fetchImpl:async(url,options)=>options.method==='POST'?collection([original],[{name:'Alternate Card'}]):page([alias])});
  const result=await client.resolve([{name:'Canonical Card'},{name:'Alternate Card'}]);
  assert.equal(result.outcomes.find(item=>item.lookupKey===identifierKey({name:'Canonical Card'})).cardId,original.id);
  assert.equal(result.outcomes.find(item=>item.lookupKey===identifierKey({name:'Alternate Card'})).cardId,alias.id);
});

test('ambiguous alias identities and missing Oracle identities are never silently combined',async()=>{
  for(const rows of [[card(1),card(2,{oracle_id:uuid(888)})],[card(1,{oracle_id:undefined}),card(2,{oracle_id:undefined})]]){
    const client=createScryfallClient({minimumGap:0,fetchImpl:async(url,options)=>options.method==='POST'?collection([],JSON.parse(options.body).identifiers):page(rows)});
    const result=await client.resolve([{name:'Alternate Card'}]);assert.equal(result.outcomes[0].status,'ambiguous');assert.equal(result.cards.length,0);
  }
});

test('malformed identifier and provider ID types produce typed validation failures',()=>{
  for(const value of [null,[],[uuid(1)],{},123])assert.throws(()=>validateIdentifiers([{id:value}]),error=>error.status===400);
  assert.throws(()=>safeCard(card(1,{id:[uuid(1)]})),error=>error.status===502);
});

test('invalid provider collection data is not cached across an explicit retry',async()=>{
  let calls=0;
  const client=createScryfallClient({minimumGap:0,fetchImpl:async()=>{calls++;return calls===1?collection([], [{name:123}]):collection([card(1)]);}});
  await assert.rejects(client.resolve([{name:'Alternate Card'}]),error=>error.status===502);
  assert.equal((await client.resolve([{name:'Alternate Card'}])).outcomes[0].status,'matched');assert.equal(calls,2);
});

test('null provider payloads produce a provider error instead of an internal failure',async()=>{
  for(const operation of ['collection','alias']){
    const client=createScryfallClient({minimumGap:0,fetchImpl:async(url,options)=>operation==='alias'&&options.method==='POST'?collection([],JSON.parse(options.body).identifiers):new Response('null',{status:200})});
    await assert.rejects(client.resolve([{name:'Alternate Card'}]),error=>error.status===502,operation);
  }
});

test('invalid provider alias data is not cached across an explicit retry',async()=>{
  let searches=0;
  const client=createScryfallClient({minimumGap:0,fetchImpl:async(url,options)=>{
    if(options.method==='POST')return collection([],JSON.parse(options.body).identifiers);
    searches++;return page(searches===1?[card(1,{id:[uuid(1)]})]:[card(1)]);
  }});
  await assert.rejects(client.resolve([{name:'Alternate Card'}]),error=>error.status===502);
  assert.equal((await client.resolve([{name:'Alternate Card'}])).outcomes[0].status,'matched');assert.equal(searches,2);
});

test('an alias rate limit is reported and never automatically retried',async()=>{
  let calls=0;
  const client=createScryfallClient({minimumGap:0,fetchImpl:async(url,options)=>{calls++;return options.method==='POST'?collection([],JSON.parse(options.body).identifiers):new Response('{}',{status:429,headers:{'Retry-After':'1'}});}});
  await assert.rejects(client.resolve([{name:'Alternate Card'}]),error=>error.status===429&&error.retryAfter==='1');
  assert.equal(calls,2);
});

test('HTTP alias import derives commander identity and rejects malformed IDs before provider work',async t=>{
  let calls=0;const alias=card(1);
  const server=await createDeckServer({minimumGap:0,fetchImpl:async(url,options)=>{calls++;return options.method==='POST'?collection([],JSON.parse(options.body).identifiers):page([alias]);}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const post=body=>fetch(base+'/api/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await post({identifiers:[{id:[uuid(1)]}]})).status,400);assert.equal(calls,0);
  const parsed=parseDeck('Commander\n1 Alternate Card\nDeck\n99 Alternate Card');
  const response=await post({identifiers:parsed.identifiers});assert.equal(response.status,200);
  const result=await response.json(),deck=resolveDeck(parsed,result.cards,result.notFound,result.outcomes);
  assert.deepEqual(commanderContext(deck).colorIdentity,['G']);assert.equal(deck.counts.playableQuantity,100);
  assert.ok(deck.rows.every(row=>row.printingProvenance.kind==='assumed'));assert.match(printingDescription(deck.rows[0].printingProvenance),/Assumed/);
  assert.ok(Object.isFrozen(deck));assert.equal(calls,2);
});
