import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseDeck,validateCommanderImport,resolveDeck,commanderContext,selectReferencePrinting,analyzeFlavor} from '../public/core.mjs';
import {identifierKey,printingDescription} from '../public/import-model.mjs';
import {createScryfallClient,validateIdentifiers} from '../lib/scryfall.mjs';
import {createDeckServer} from '../server.mjs';

const fixture=name=>fs.readFileSync(new URL(`fixtures/imports/${name}.txt`,import.meta.url),'utf8');
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const card=(n,name,extra={})=>({object:'card',id:uuid(n),oracle_id:uuid(n+1000),name,set:'tst',collector_number:String(n),lang:'en',color_identity:['U','G'],keywords:['Flying'],legalities:{commander:'legal'},flavor_text:'Silver rivers flow.',finishes:['foil','nonfoil'],...extra});
const response=(data,not_found=[])=>new Response(JSON.stringify({object:'list',data,not_found}),{status:200});

for(const [name,entries,deck,extras,commander] of [['hakbal',84,100,0,'Hakbal of the Surging Soul'],['veyran',79,100,1,'Veyran, Voice of Duality'],['detailed',90,100,0,null],['obeka-a',102,99,9,null],['obeka-b',102,99,9,null]])test(`untouched ${name} export normalizes without losing metadata`,()=>{
  const source=fixture(name),parsed=parseDeck(source);
  assert.equal(parsed.sourceText,source);assert.equal(parsed.rows.length,entries);
  assert.equal(parsed.counts.playableQuantity,deck);assert.equal(parsed.counts.excludedQuantity,extras);
  assert.ok(parsed.rows.every(row=>row.status==='pending'));
  assert.deepEqual(parsed.rows.filter(row=>row.section==='Commander').map(row=>row.name),commander?[commander]:[]);
  assert.equal(validateCommanderImport(parsed).valid,deck===100);
  assert.ok(Object.isFrozen(parsed.rows[0]));
  if(name==='hakbal')assert.equal(parsed.rows.filter(row=>row.finish==='foil').length,2);
  if(name==='veyran'){
    assert.equal(parsed.rows.filter(row=>row.finish==='foil').length,2);
    assert.equal(parsed.rows.filter(row=>row.annotations.includes('Have,#37d67a')).length,27);
    assert.equal(parsed.rows.find(row=>row.name==='Coruscation Mage').section,'Maybeboard');
    assert.equal(parsed.rows.find(row=>row.name==='Command Tower').collectorNumber,'C21-284');
  }
});

for(const name of ['obeka-a','obeka-b'])test(`${name} commander stays extra until explicitly confirmed`,()=>{
  const source=fixture(name),draft=parseDeck(source),suggestion=draft.commanderSuggestions[0];
  assert.equal(suggestion.name,'Obeka, Splitter of Seconds');
  assert.equal(draft.rows.at(-1).section,'Sideboard');
  const confirmed=parseDeck(source,{commanderRowIds:[suggestion.rowId]});
  assert.equal(confirmed.counts.playableQuantity,100);assert.equal(confirmed.counts.excludedQuantity,8);
  assert.equal(confirmed.rows.at(-1).commanderSource,'confirmed');
  assert.equal(confirmed.sourceText,source);assert.equal(confirmed.commanderSuggestions.length,0);
  assert.throws(()=>parseDeck(source,{commanderRowIds:['row-1']}),/suggested entry/);
});

test('generated metadata order and newline variations preserve card meaning',()=>{
  const tails=['*F* [Commander{top}] ^Have,#37d67a^','[Commander{top}] ^Have,#37d67a^ *F*','^Have,#37d67a^ *F* [Commander{top}]'];
  for(const newline of ['\n','\r\n','\r'])for(const prefix of ['','\uFEFF'])for(const quantity of ['1','1x','1X'])for(const tail of tails){
    const parsed=parseDeck(`${prefix}${quantity} Hakbal of the Surging Soul ${tail}${newline}99 Forest [Land]`);
    assert.equal(validateCommanderImport(parsed).valid,true);
    assert.equal(parsed.rows[0].name,'Hakbal of the Surging Soul');assert.equal(parsed.rows[0].finish,'foil');assert.equal(parsed.rows[0].section,'Commander');
  }
});

test('explicit extra headings end ambiguous-placement review and card names cannot trigger CSV detection',()=>{
  assert.equal(parseDeck('99 Forest\n\nSideboard\n1 Extra\n\nSideboard\n1 Obeka').commanderSuggestions.length,0);
  assert.equal(parseDeck('100 Quantity, Name').format,'text');
  assert.equal(parseDeck('"Name","Quantity"\n"Forest","100"').format,'csv');
});

test('malformed metadata, coordinates and quantities are not silently repaired',()=>{
  for(const source of ['100 Forest *F* *E*','100 Forest [Commander,Maybeboard]','100 Forest (tst) 1 junk','100 Forest [Land] junk','100 Forest ^unfinished','0 Forest','1000 Forest']){
    assert.equal(validateCommanderImport(parseDeck(source)).valid,false,source);
  }
  assert.equal(parseDeck('100 Forest').rows[0].finish,'unspecified');
  const csv=parseDeck('Quantity,Name,Finish,Note\n100,Forest,foil,owned');
  assert.equal(csv.rows[0].finish,'foil');assert.equal(csv.rows[0].csvMetadata.note,'owned');
  assert.equal(validateCommanderImport(parseDeck('Quantity,Name,Finish,Foil\n100,Forest,nonfoil,true')).valid,false);
});

test('name resolution enables automatic tagged commanders and tracks per-row printing provenance',()=>{
  const parsed=parseDeck('Commander\n1 Hakbal of the Surging Soul *F*\nDeck\n98 Forest\n1 Forest (tst) 2');
  const cards=[card(2,'Forest'),card(1,'Hakbal of the Surging Soul')];
  const outcomes=parsed.identifiers.map(identifier=>({lookupKey:identifierKey(identifier),status:'matched',cardId:identifier.name?.startsWith('Hakbal')?uuid(1):uuid(2)}));
  const deck=resolveDeck(parsed,cards,[],outcomes);
  assert.equal(commanderContext(deck).rowIds[0],deck.rows[0].id);
  assert.equal(deck.counts.assumedEntries,2);assert.equal(deck.counts.suppliedEntries,1);
  assert.equal(deck.rows[1].card.id,deck.rows[2].card.id);
  assert.equal(deck.rows[1].printingProvenance.kind,'assumed');assert.equal(deck.rows[2].printingProvenance.kind,'supplied');
  assert.match(printingDescription(deck.rows[1].printingProvenance),/Assumed/);
  assert.equal(analyzeFlavor(deck).counts.assumedPassages,2);
});

test('selected reference editions preserve source and re-resolution clears stale state and warnings',()=>{
  const source='100 Forest *F*',original=card(1,'Forest',{finishes:['nonfoil']}),selected=card(2,'Forest',{oracle_id:original.oracle_id});
  const deck=resolveDeck(parseDeck(source),[original]);assert.equal(deck.rows[0].issues.length,1);
  assert.equal(resolveDeck(deck,[original]).rows[0].issues.length,1);
  const missing=resolveDeck(deck,[]);assert.equal(missing.rows[0].card,null);assert.equal(missing.rows[0].printingProvenance,null);
  const draft=selectReferencePrinting(deck,'row-1',selected.id),changed=resolveDeck(draft,[selected]);
  assert.equal(changed.sourceText,source);assert.equal(changed.rows[0].originalLine,source);
  assert.equal(changed.rows[0].printingProvenance.kind,'user-selected');
  assert.match(analyzeFlavor(changed).summary,/0 use supplied editions; 1 use user-selected/);
  assert.equal(analyzeFlavor(changed).counts.exactPassages,0);
  assert.throws(()=>selectReferencePrinting(resolveDeck(parseDeck('100 Forest (tst) 1'),[original]),'row-1',selected.id),/Supplied coordinates/);
});

test('mixed server lookups have separate batches, keyed outcomes and no exact-coordinate fallback',async()=>{
  const calls=[],forest=card(1,'Forest'),exact=card(2,'Forest',{oracle_id:forest.oracle_id});
  const client=createScryfallClient({minimumGap:0,fetchImpl:async(url,options)=>{
    const identifiers=JSON.parse(options.body).identifiers;calls.push(identifiers);
    return identifiers[0].name?response([forest]):response(identifiers[0].id?[exact]:[],identifiers[0].id?[]:identifiers);
  }});
  const result=await client.resolve([{name:'Forest'},{id:exact.id},{set:'bad',collector_number:'9'}]);
  assert.equal(calls.length,2);assert.ok(calls[0].every(item=>item.name));assert.ok(calls[1].every(item=>!item.name));
  assert.equal(result.outcomes.find(item=>item.lookupKey==='name:en:forest').cardId,forest.id);
  assert.equal(result.outcomes.find(item=>item.lookupKey==='printing:bad:9').status,'not-found');
  assert.equal(result.outcomes.find(item=>item.lookupKey==='name:en:forest').printingSelection.kind,'assumed');
  assert.throws(()=>validateIdentifiers([{name:'Forest',id:forest.id}]),/by itself/);
  assert.throws(()=>validateIdentifiers([{name:'Forest\n'}]),/bounded/);
});

test('split-face names resolve literally, unknown names stay unknown, and ambiguity is explicit',async()=>{
  const split=card(1,'Commit // Memory',{card_faces:[{name:'Commit'},{name:'Memory'}]});
  const parsed=parseDeck('1 Commit\n1 Commit // Memory\n98 Forest nonsense');
  const deck=resolveDeck(parsed,[split]);
  assert.equal(deck.rows[0].status,'resolved');assert.equal(deck.rows[1].status,'resolved');assert.equal(deck.rows[2].status,'unresolved');
  const client=createScryfallClient({minimumGap:0,fetchImpl:async()=>response([card(1,'Same'),card(2,'Same')])});
  const result=await client.resolve([{name:'Same'}]);assert.equal(result.outcomes[0].status,'ambiguous');
});

test('split-card transport uses an exact face alias and verifies the complete supplied name',async()=>{
  const calls=[],split=card(1,'Commit // Memory',{card_faces:[{name:'Commit'},{name:'Memory'}]});
  const client=createScryfallClient({minimumGap:0,fetchImpl:async(url,options)=>{if(options.method!=='POST')return new Response(JSON.stringify({object:'list',data:[],total_cards:0,has_more:false}));calls.push(JSON.parse(options.body).identifiers);return response([split]);}});
  const result=await client.resolve([{name:'Commit // Memory'},{name:'Commit // nonsense'}]);
  assert.deepEqual(calls[0],[{name:'Commit'}]);
  assert.equal(result.outcomes[0].status,'matched');assert.equal(result.outcomes[1].status,'not-found');
});

test('alternate printed and flavor names resolve through verified exact search without losing provenance',async()=>{
  const fixtures=JSON.parse(fs.readFileSync(new URL('fixtures/imports/alternate-names.json',import.meta.url),'utf8'));
  const calls=[];
  const client=createScryfallClient({minimumGap:0,fetchImpl:async(url,options)=>{
    calls.push({url,method:options.method});
    if(options.method==='POST')return response([],JSON.parse(options.body).identifiers);
    const data=fixtures.flatMap(item=>item.cards);
    return new Response(JSON.stringify({object:'list',data,total_cards:data.length,has_more:false}));
  }});
  const identifiers=fixtures.map(item=>({name:item.requested})),result=await client.resolve(identifiers);
  assert.equal(calls.length,2);assert.equal(result.notFound.length,0);
  const q=new URL(calls[1].url).searchParams.get('q');
  for(const identifier of identifiers)assert.ok(q.includes('!'+JSON.stringify(identifier.name)));
  assert.ok(result.outcomes.every(item=>item.status==='matched'&&item.lookupMethod==='exact-alias-search'));
  const parsed=parseDeck(identifiers.map(item=>'1 '+item.name).join('\n'));
  const deck=resolveDeck(parsed,result.cards,[],result.outcomes);
  assert.ok(deck.rows.every(row=>row.status==='resolved'&&row.printingProvenance.kind==='assumed'));
  assert.deepEqual(deck.rows.map(row=>row.name),identifiers.map(item=>item.name));
  assert.deepEqual(deck.rows.map(row=>row.card.name),['Hammer of Nazahn','Oscorp Industries','Hide on the Ceiling']);
  assert.equal(deck.rows[0].card.flavor_name,"Black Panther's Claws");
});

test('exact alias fallback rejects unrelated search results and quotes names as literal data',async()=>{
  const requested='Unknown" or name:Forest';let query;
  const client=createScryfallClient({minimumGap:0,fetchImpl:async(url,options)=>{
    if(options.method==='POST')return response([],JSON.parse(options.body).identifiers);
    query=new URL(url).searchParams.get('q');
    return new Response(JSON.stringify({object:'list',data:[card(1,'Forest')],total_cards:1,has_more:false}));
  }});
  const result=await client.resolve([{name:requested}]);
  assert.equal(query,`(!${JSON.stringify(requested)}) lang:en include:extras`);
  assert.equal(result.cards.length,0);assert.equal(result.outcomes[0].status,'not-found');
});

test('HTTP name import returns keyed outcomes and authorizes commander identity from its cards',async t=>{
  const queries=[];
  const server=await createDeckServer({minimumGap:0,fetchImpl:async(url,options)=>{
    if(options.method==='POST')return response([card(1,'Hakbal of the Surging Soul')]);
    queries.push(new URL(url).searchParams.get('q'));
    return new Response(JSON.stringify({object:'list',data:[],total_cards:0,has_more:false}));
  }});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const post=(path,body)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const imported=await post('/api/resolve',{identifiers:[{name:'Hakbal of the Surging Soul'}]});assert.equal(imported.status,200);
  const result=await imported.json();assert.equal(result.outcomes[0].printingSelection.kind,'assumed');
  const discovery=await post('/api/discover',{atlasRowId:'keyword-index-flying',contextToken:result.contextToken,commanderIds:[uuid(1)]});assert.equal(discovery.status,200);
  assert.ok(queries[0].includes('id<=ug'));
});
