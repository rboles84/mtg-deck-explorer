import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {parseDeck, resolveDeck, validateCommanderImport, selectReferencePrinting} from '../public/core.mjs';
import {identifierKey, printingDescription, validCollectorNumber} from '../public/import-model.mjs';
import {readImportFile} from '../public/import-limits.mjs';
import {resolveImport} from '../public/import-resolution.mjs';
import {createScryfallClient, validateIdentifiers} from '../lib/scryfall.mjs';
import {createDeckServer} from '../server.mjs';

const directory = new URL('fixtures/imports/uncommon/', import.meta.url);
const read = name => fs.readFileSync(new URL(name, directory), 'utf8');
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const card = (n, name='Forest', extra={}) => ({object:'card',id:uuid(n),oracle_id:uuid(n+1000),name,set:'rna',collector_number:String(n),lang:'en',color_identity:['G'],keywords:[],legalities:{commander:'legal'},...extra});
const response = value => new Response(JSON.stringify(value));
const collection = (data, not_found=[]) => response({object:'list',data,not_found});
const sets = () => response({object:'list',data:[{code:'rna'},{code:'c16'}],has_more:false});

test('copied pack fixtures retain their documented original bytes',()=>{
  const provenance=JSON.parse(read('provenance.json'));
  for(const file of provenance.files){
    const bytes=fs.readFileSync(new URL(file.file,directory));
    assert.equal(bytes.length,file.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,file.file);
  }
});

for (const name of fs.readdirSync(directory).filter(name=>name.endsWith('.csv')&&!name.startsWith('helvault'))) test(`native TappedOut CSV is blocked with TXT guidance: ${name}`,()=>{
  assert.throws(()=>parseDeck(read(name)),/TappedOut CSV isn't supported.*TXT export.*another deck builder/);
  const txt=parseDeck(read(name.replace('.csv','.txt')));
  assert.equal(txt.counts.playableQuantity,100);assert.equal(txt.rows.filter(row=>row.section==='Commander').length,0);
  assert.equal(txt.commanderSuggestions.length,0);assert.equal(txt.rows.filter(row=>row.section==='Maybeboard').length,0);
  assert.equal(validateCommanderImport(txt).valid,true);
});

test('TappedOut format detection ignores header order/case and leaves generic CSV supported',()=>{
  assert.throws(()=>parseDeck('" commander "," NAME ","printing","QTY","board"\nFalse,Forest,RNA,100,main'),/TappedOut CSV isn't supported/);
  assert.throws(()=>parseDeck('Board,Qty,Name,Printing,Commander\nmain,100,Forest,RNA,'),/TappedOut CSV isn't supported/);
  const generic=parseDeck('Quantity,Name,Set,Section,Commander\n100,Forest,CMA,Deck,False');
  assert.equal(validateCommanderImport(generic).valid,true);
  assert.deepEqual(generic.identifiers,[{name:'Forest',set:'cma'}]);
});

test('Board and snake_case printing columns never silently become main/name-only input',()=>{
  const maybe=parseDeck('Quantity,Name,Board\n100,Forest,maybe');
  assert.equal(maybe.counts.playableQuantity,0);assert.equal(validateCommanderImport(maybe).valid,false);
  const exact=parseDeck(`Quantity,Name,scryfall_id\n100,Forest,${uuid(1)}`);
  assert.deepEqual(exact.identifiers,[{id:uuid(1)}]);
  for(const field of ['Commander Role','Edition','Companion','Collector #'])assert.equal(validateCommanderImport(parseDeck(`Quantity,Name,${field}\n100,Forest,value`)).valid,false,field);
  for(const source of ['Quantity,Name,Board,Section\n100,Forest,maybe,Deck','Quantity,Name,Board,Commander\n100,Forest,side,True','Quantity,Name,Commander\n100,Forest,yes'])assert.equal(validateCommanderImport(parseDeck(source)).valid,false);
  assert.equal(parseDeck('Quantity,Name,Note\n100,Forest,<b>owned</b>').rows[0].csvMetadata.note,'<b>owned</b>');
});

test('derived Spanish excerpt preserves exact identity, language and unspecified finish without relaxing deck size',()=>{
  const source=read('helvault-derived-excerpt-spanish-printing.csv'),parsed=parseDeck(source);
  const original=JSON.parse(read('scryfall-verification-5a6ff93c-b08e-4cf0-bcd3-d58435fc2dac.json'));
  assert.equal(parsed.schema,'Helvault-compatible CSV');assert.equal(parsed.rows[0].name,'Breeding Pool');
  assert.equal(parsed.rows[0].scryfallId,'5a6ff93c-b08e-4cf0-bcd3-d58435fc2dac');
  assert.equal(parsed.rows[0].language,'es');assert.equal(parsed.rows[0].finish,'unspecified');
  assert.equal(validateCommanderImport(parsed).valid,false);
  const resolved=resolveDeck(parsed,[original]);assert.equal(resolved.rows[0].status,'resolved');assert.equal(resolved.rows[0].printingProvenance.kind,'supplied');
  const synthetic=parseDeck(source.replace('Breeding Pool','Estanque reproductor'));
  assert.equal(resolveDeck(synthetic,[original]).rows[0].status,'resolved');
  assert.equal(resolveDeck(parsed,[{...original,oracle_id:uuid(1)}]).rows[0].status,'mismatch');
});

test('name/set keys, validation and matching honor known hints, disclose unknown hints and preserve exact failures',async()=>{
  const calls=[];
  const client=createScryfallClient({minimumGap:0,fetchImpl:async(url,options)=>{
    calls.push({url,body:options.body});if(url.endsWith('/sets'))return sets();
    if(options.method==='GET')return response({object:'list',data:[],total_cards:0,has_more:false});
    const ids=JSON.parse(options.body).identifiers;
    return collection(ids.filter(item=>item.name).map(item=>card(item.set?2:1,item.name,{set:item.set||'c16',oracle_id:uuid(1001)})),ids.filter(item=>!item.name));
  }});
  const parsed=parseDeck('Quantity,Name,Set\n97,Forest,rna\n1,Forest,000\n1,Forest,MYSTOR\n1,Forest,MBP');
  const result=await client.resolve(parsed.identifiers),deck=resolveDeck(parsed,result.cards,[],result.outcomes);
  assert.ok(deck.rows.every(row=>row.status==='resolved'));assert.equal(deck.rows[0].card.id,uuid(2));
  assert.match(printingDescription(deck.rows[0].printingProvenance),/Assumed.*honored/);
  for(const row of deck.rows.slice(1)){assert.match(printingDescription(row.printingProvenance),/Assumed.*unrecognized/);assert.match(row.issues.join(' '),/No mapping/);}
  assert.notEqual(identifierKey({name:'Forest'}),identifierKey({name:'Forest',set:'rna'}));
  assert.notEqual(identifierKey({name:'set:rna:Forest'}),identifierKey({name:'Forest',set:'rna'}));
  assert.deepEqual(validateIdentifiers([{name:'Forest',set:'RNA'},{name:'Forest',set:'rna'}]),[{name:'Forest',set:'rna'}]);
  assert.equal(calls.filter(call=>call.url.endsWith('/sets')).length,1);
  assert.equal(resolveDeck(parseDeck('100 Forest (c16)'),[card(1)]).rows[0].status,'unresolved');
  assert.equal((await client.resolve([{set:'000',collector_number:'1'}])).outcomes[0].status,'not-found');
  const selected=resolveDeck(selectReferencePrinting(deck,'row-1',uuid(9)),[card(9,'Forest',{set:'c16',oracle_id:deck.rows[0].card.oracle_id})]);
  assert.equal(selected.rows[0].printingProvenance.kind,'user-selected');assert.equal(selected.rows[0].set,'rna');
});

test('split/alias fallback retains recognized set constraints and does not accept another set',async()=>{
  const calls=[],split=card(1,'Fire // Ice',{card_faces:[{name:'Fire'},{name:'Ice'}]});
  const client=createScryfallClient({minimumGap:0,fetchImpl:async(url,options)=>{
    if(url.endsWith('/sets'))return sets();calls.push({url,body:options.body});
    if(options.method==='POST')return collection([],JSON.parse(options.body).identifiers);
    return response({object:'list',data:[split],total_cards:1,has_more:false});
  }});
  const result=await client.resolve([{name:'Fire / Ice',set:'c16'}]);
  assert.equal(result.outcomes[0].status,'not-found');
  assert.ok(calls.filter(call=>call.body).every(call=>JSON.parse(call.body).identifiers.every(id=>id.set==='c16')));
  assert.match(new URL(calls.at(-1).url).searchParams.get('q'),/set:c16/);
});

test('parser and API share collector validation, reject excessive metadata/records early',()=>{
  for(const value of ['1☆','é','1*','C21-284','0001','1/2','1?','a'.repeat(33)]){
    const accepted=validCollectorNumber(value),row=parseDeck(`100 Forest (rna) ${value}`).rows[0];
    assert.equal(row.status==='pending',accepted,value);
    if(accepted)assert.doesNotThrow(()=>validateIdentifiers([{set:'rna',collector_number:value}]));
    else assert.throws(()=>validateIdentifiers([{set:'rna',collector_number:value}]));
  }
  const start=performance.now();
  assert.throws(()=>parseDeck('100 Forest'+' [X]'.repeat(20000)),/8,000|64 metadata/);
  assert.ok(performance.now()-start<1000);
  assert.throws(()=>parseDeck('1 Forest\n'.repeat(501)),/500 entries/);
  assert.throws(()=>parseDeck('Quantity,Name\n'+'1,Forest\n'.repeat(501)),/500 entries/);
  assert.throws(()=>parseDeck('Quantity,Name,'+'Note,'.repeat(65)+'\n100,Forest'),/64 columns/);
  assert.throws(()=>parseDeck('x'.repeat(200001)),/200,000/);
});

test('file size/type checks precede reading, with a separate post-decode character check',async()=>{
  let reads=0;const text=async()=>{reads++;return '100 Forest';};
  await assert.rejects(readImportFile({name:'huge.txt',size:800001,text}),/800,000/);
  await assert.rejects(readImportFile({name:'deck.exe',size:1,text}),/txt or .csv/);assert.equal(reads,0);
  assert.equal(await readImportFile({name:'deck.CSV',size:100,text}),'100 Forest');
  await assert.rejects(readImportFile({name:'deck.txt',size:200001,text:async()=>'x'.repeat(200001)}),/200,000/);
});

for(const kind of ['seconds','date'])test(`Retry-After preserves a full two-hour wait (${kind}, simulated clock)`,async t=>{
  let now=Date.parse('2026-10-18T12:00:00Z'),calls=0;t.mock.method(Date,'now',()=>now);
  const client=createScryfallClient({minimumGap:0,fetchImpl:async()=>{calls++;return calls===1?new Response('',{status:429,headers:{'Retry-After':kind==='seconds'?'7200':new Date(now+7200000).toUTCString()}}):collection([card(1)]);}});
  await assert.rejects(client.resolve([{id:uuid(1)}]),error=>error.retryAfter==='7200');
  now+=3601000;await assert.rejects(client.resolve([{id:uuid(1)}]),error=>error.retryAfter==='3599');assert.equal(calls,1);
  now+=3599000;assert.equal((await client.resolve([{id:uuid(1)}])).cards.length,1);assert.equal(calls,2);
});

test('total alias work and aggregate response cache bytes are bounded',async()=>{
  let calls=0;const client=createScryfallClient({minimumGap:0,fetchImpl:async(url,options)=>{
    calls++;return options.method==='POST'?collection([],JSON.parse(options.body).identifiers):response({object:'list',data:[],total_cards:0,has_more:false});
  }});
  await assert.rejects(client.resolve(Array.from({length:500},(_,i)=>({name:`Missing ${i}`}))),/32 provider operations/);assert.equal(calls,32);
  let largeCalls=0;
  const large=createScryfallClient({minimumGap:0,fetchImpl:async(url,options)=>{
    largeCalls++;const [{id}]=JSON.parse(options.body).identifiers;
    return response({object:'list',data:[{...card(1),id}],not_found:[],padding:'x'.repeat(4*1024*1024)});
  }});
  for(let i=1;i<=5;i++)await large.resolve([{id:uuid(i)}]);
  await large.resolve([{id:uuid(1)}]);assert.equal(largeCalls,6,'old cached bytes were evicted');
});

test('optional alias/provider failure preserves resolved main printing and authorizes discovery with its original context',async t=>{
  const leader=card(1,'Leader'),forest=card(2);
  const server=await createDeckServer({minimumGap:0,fetchImpl:async(url,options)=>{
    if(options.method==='POST'){
      const ids=JSON.parse(options.body).identifiers;
      return ids.some(id=>id.name==='Missing extra')?collection([],ids):collection([leader,forest]);
    }
    if(new URL(url).searchParams.get('q').includes('Missing extra'))return new Response('',{status:503});
    return response({object:'list',data:[],total_cards:0,has_more:false});
  }});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const request=async(path,body)=>{const result=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await result.json();if(!result.ok)throw new Error(data.error);return data;};
  const result=await resolveImport(parseDeck('1 Leader [Commander]\n99 Forest\nSideboard\n1 Missing extra'),request);
  assert.equal(result.deck.counts.resolvedEntries,2);assert.equal(result.deck.rows[1].card.id,forest.id);
  assert.equal(result.deck.rows[2].status,'unresolved');assert.match(result.deck.rows[2].issues.join(' '),/Optional extra.*503/);
  const discovery=await request('/api/discover',{atlasRowId:'keyword-index-flying',contextToken:result.contextToken,commanderIds:[leader.id]});
  assert.deepEqual(discovery.identity,['G']);
});

test('successful extra resolution cannot replace a main edition or its discovery context',async()=>{
  const parsed=parseDeck('1 Leader [Commander]\n99 Forest\nSideboard\n1 Forest\n1 Forest (c16)'),leader=card(1,'Leader'),forest=card(2),extraForest=card(3,'Forest',{set:'c16',oracle_id:forest.oracle_id});
  let calls=0;
  const result=await resolveImport(parsed,async(path,{identifiers})=>{
    calls++;
    const cards=calls===1?[leader,forest]:[extraForest];
    return {cards,notFound:[],contextToken:calls===1?'main-context':'extra-context',outcomes:identifiers.map(identifier=>({lookupKey:identifierKey(identifier),status:'matched',cardId:identifier.name==='Leader'?leader.id:calls===1?forest.id:extraForest.id}))};
  });
  assert.equal(calls,2);assert.equal(result.contextToken,'main-context');
  assert.deepEqual(result.deck.rows.map(row=>row.card.id),[leader.id,forest.id,forest.id,extraForest.id]);
  assert.equal(result.deck.counts.playableQuantity,100);assert.equal(result.deck.counts.excludedQuantity,2);
});
