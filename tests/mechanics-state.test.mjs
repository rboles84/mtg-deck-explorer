import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {resolveImport} from '../public/import-resolution.mjs';
import {readImportFile} from '../public/import-limits.mjs';
import {normalizeCardName, commanderSearchNames} from '../public/import-model.mjs';
import {requestOwner} from '../public/request-owner.mjs';
import {indexMechanics} from '../public/mechanics.mjs';
import {parseDeck,validateCommanderImport,resolveDeck,commanderContext,selectReferencePrinting,identifierKey} from '../public/core.mjs';
import {createDemoDeck} from '../public/demo.mjs';

// Exercise the actual app handlers, with rendering and transport replaced at the boundary.
// No copied implementation of the request ownership decisions; real deck/index functions run.
const source=fs.readFileSync(new URL('../public/app.mjs',import.meta.url),'utf8');
const slice=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
function harness(){
  const elements=new Map(),handlers={},requests=[],navigation=[];
  const $=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',disabled:false,hidden:false,open:false,setAttribute(){},focus(){},scrollIntoView(){},querySelector(){return {focus(){}};},querySelectorAll(){return [];},addEventListener(type,fn){handlers[id+':'+type]=fn;handlers[id]=fn;}});return elements.get(id);};
  const context=vm.createContext({$,requestOwner,indexMechanics,resolveImport,readImportFile,normalizeCardName,commanderSearchNames,parseDeck,validateCommanderImport,resolveDeck,commanderContext,createDemoDeck,selectReferencePrinting,identifierKey,
    showImportProblems(){},renderLedger(){},renderMechanics(){},renderDiscoveries(){},renderDiscoveryPagination(){},safeStatus(el,text,error=false){el.textContent=text;el.error=error;},
    api(path,payload){return new Promise((resolve,reject)=>requests.push({path,payload,resolve,reject}));},
    navigate(hash){navigation.push(hash);},
  });
  vm.runInContext(`let importedDeck=null,selectedCommanderRows,identity=null,selectedObservation=null;
    let contextToken=null,catalog=null,selectedMechanicId=null,discoveries=null,importBusy=false,searchBusy=false,contextGeneration=0;
    ${slice('let mechanicIndex=', 'const restored =')}
    function renderDeck(){identity=commanderContext(importedDeck,selectedCommanderRows);}
    ${slice("$('import-button').addEventListener",'function renderDeck()')}
    ${slice("$('commander-apply').addEventListener",'function rowFlags(')}
    ${slice('async function runDiscovery(', 'function discoverySummary()')}
    ${slice('async function changeReferencePrinting(', 'function renderMechanics()')}
    globalThis.testApp={chooseImportFiles,filterCommanders,selectMechanic,commitDeck,runDiscovery,changeReferencePrinting,
      navigateAway(){navigationRevision++;},
      get state(){return {importedDeck,mechanicIndex,identity,selectedMechanicId,selectedCommanderRows,discoveries,importBusy,searchBusy,contextToken};}};`,context);
  return {app:context.testApp,$,handlers,requests,navigation};
}
const capture=name=>JSON.parse(fs.readFileSync(new URL(`../reports/mechanics-integration/decks/${name}.json`,import.meta.url)));
const cosmic=capture('cosmic'),dionus=capture('dionus');
const importFixture=name=>fs.readFileSync(new URL(`fixtures/imports/${name}.txt`,import.meta.url),'utf8');
function fixtureResult(text){
  const parsed=parseDeck(text),cards=parsed.identifiers.map((identifier,index)=>({id:`00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,oracle_id:`00000000-0000-4000-9000-${String(index+1).padStart(12,'0')}`,name:identifier.name||parsed.rows.find(row=>row.identifier===identifier||row.set===identifier.set&&row.collectorNumber===identifier.collector_number).name,set:identifier.set||'tst',collector_number:identifier.collector_number||String(index+1),lang:'en',color_identity:['U','G'],keywords:[],finishes:['foil','nonfoil']}));
  return {cards,notFound:[],contextToken:'corpus'};
}
async function settleImport(h, pending, result) {
  h.requests.at(-1).resolve(result);
  await new Promise(resolve=>setImmediate(resolve));
  if(h.app.state.importBusy)h.requests.at(-1).resolve({...result,contextToken:'extras-token'});
  await pending;
}
function beginImport(h,c){h.$('deck-input').value=c.text;return h.handlers['import-button']();}
const search={atlas_row_id:'keyword-index-flying',master_name:'Flying'};
const result=page=>({cards:[],page,totalCards:50,totalPages:3,hasMore:page<3});
function loaded(){const h=harness();h.app.commitDeck(resolveDeck(parseDeck(cosmic.text),cosmic.result.cards,cosmic.result.notFound),'token');h.app.selectMechanic('flying');h.$('commander-options').querySelectorAll=()=>h.app.state.identity.rowIds.map(value=>({value}));return h;}

test('invalid deck totals and garbage block import without transport or replacing the loaded deck',async()=>{
  for(const text of ['99 Forest (tst) 1','101 Forest (tst) 1','100 Forest (tst) 1\naksjfl;)(*>?','100 Forest (tst) 1 trailing garbage']){
    const h=loaded(),before=h.app.state.importedDeck;
    await beginImport(h,{text});
    assert.equal(h.requests.length,0);
    assert.equal(h.app.state.importedDeck,before);
    assert.equal(h.$('import-message').error,true);
    assert.match(h.$('import-message').textContent,/Import blocked/);
  }
});

for(const mode of ['paste','file','drop'])test(`TappedOut CSV ${mode} blocks before transport and preserves the loaded deck`,async()=>{
  const h=loaded(),before=h.app.state;
  const text=fs.readFileSync(new URL('fixtures/imports/uncommon/partner-thrasios-tymna.csv',import.meta.url),'utf8');
  h.$('import-workbench').open=true;
  // Renaming CSV to .txt must not bypass content-based detection.
  const file={name:mode==='drop'?'renamed.txt':'deck.csv',size:Buffer.byteLength(text),text:async()=>text};
  if(mode==='paste'){h.$('deck-input').value=text;h.handlers['deck-input:input']();}
  else if(mode==='file'){h.$('deck-file').files=[file];await h.handlers['deck-file:change']();}
  else await h.handlers['import-drop:drop']({preventDefault(){},dataTransfer:{files:[file]}});
  assert.match(h.$('import-preview').textContent,/TappedOut CSV isn't supported.*TXT export/);
  assert.equal(h.$('import-preview').error,true);
  assert.equal(h.requests.length,0);
  for(let attempt=0;attempt<2;attempt++){
    await h.handlers['import-button']();
    assert.match(h.$('import-preview').textContent,/TappedOut CSV isn't supported.*another deck builder/);
    assert.equal(h.$('import-message').textContent,'','keep the warning once in the preview, including repeated Import clicks');
  }
  assert.equal(h.requests.length,0);
  assert.equal(h.$('deck-input').value,text);
  assert.equal(h.app.state.importedDeck,before.importedDeck);
  assert.equal(h.app.state.contextToken,before.contextToken);
  assert.equal(h.app.state.selectedMechanicId,before.selectedMechanicId);
  assert.equal(h.app.state.importBusy,false);
  assert.equal(h.$('import-workbench').open,true);
});

test('valid import reports deck and extra quantities separately',async()=>{
  const h=loaded(),pending=beginImport(h,{text:'100 Forest (tst) 1\nCompanion\n1 Extra (tst) 2'});
  await settleImport(h,pending,{cards:[{id:'forest',name:'Forest',set:'tst',collector_number:'1',lang:'en'},{id:'extra',name:'Extra',set:'tst',collector_number:'2',lang:'en'}],notFound:[]});
  assert.match(h.$('import-message').textContent,/Import complete\. Deck \+ Commander: 100\/100 cards\. Extras: 1 card in 1 entry/);
  assert.equal(h.$('import-message').error,false);
});

test('unresolved or mismatched content stays prominently flagged and keeps import workbench open',async()=>{
  for(const cards of [[],[{id:'forest',name:'Forest',set:'tst',collector_number:'1',lang:'en'}]]){
    const h=loaded();h.$('import-workbench').open=true;
    const pending=beginImport(h,{text:'100 Forest gibberish (tst) 1'});
    h.requests[0].resolve({cards,notFound:[]});await pending;
    assert.equal(h.$('import-message').error,true);
    assert.match(h.$('import-message').textContent,/Import incomplete/);
    assert.match(h.$('import-message').textContent,/Line 1:/);
    assert.equal(h.$('import-workbench').open,true);
  }
});

for(const failure of [false,true])test(`old import ${failure?'failure':'success'} and finally cannot replace or clear newer pending import`,async()=>{
  const h=loaded(),a=beginImport(h,cosmic),b=beginImport(h,dionus);
  if(failure)h.requests[0].reject(new Error('old failure'));else h.requests[0].resolve({...cosmic.result,contextToken:'old'});
  await a;assert.equal(h.app.state.importBusy,true);assert.equal(h.$('commander-apply').disabled,true);assert.ok(!h.$('import-message').textContent.includes('old failure'));
  h.requests[1].resolve({...dionus.result,contextToken:'new'});await b;
  assert.equal(h.app.state.importBusy,false);assert.equal(h.app.state.contextToken,'new');assert.equal(h.app.state.selectedMechanicId,null);assert.equal(h.app.state.selectedCommanderRows,undefined);
  assert.equal(h.app.state.mechanicIndex.terms.some(t=>t.key==='deathtouch'),false);
  assert.ok(h.app.state.importedDeck.rows.some(r=>h.app.state.identity.rowIds.includes(r.id)&&r.card.name.startsWith('Dionus')));
});

for(const failure of [false,true])for(const change of ['mechanic','commander','import','same query','page'])test(`stale search ${failure?'failure':'success'}/finally after ${change} cannot affect newer results/loading`,async()=>{
  const h=loaded(),a=h.app.runDiscovery(search);
  if(change==='mechanic')h.app.selectMechanic('trample');
  if(change==='commander')h.handlers['commander-apply']();
  if(change==='import'){
    const p=beginImport(h,dionus);h.requests[1].resolve({...dionus.result,contextToken:'replacement'});await p;
  }
  // Commander handler cleared selection deliberately; restore a valid selected imported commander.
  if(change==='commander')h.app.commitDeck(resolveDeck(parseDeck(dionus.text),dionus.result.cards,[]),'new');
  const b=h.app.runDiscovery(search,change==='page'?2:1),latest=h.requests.at(-1);
  if(failure)h.requests[0].reject(new Error('stale failure'));else h.requests[0].resolve(result(1));
  await a;assert.equal(h.app.state.searchBusy,true);assert.equal(h.app.state.discoveries,null);assert.ok(!h.$('discovery-status').textContent.includes('stale failure'));
  latest.resolve(result(change==='page'?2:1));await b;assert.equal(h.app.state.searchBusy,false);assert.equal(h.app.state.discoveries.page,change==='page'?2:1);assert.equal(h.navigation.length,1);
});

test('navigation while searching suppresses late navigation and focus; current cleanup still completes',async()=>{
  const h=loaded(),p=h.app.runDiscovery(search);h.app.navigateAway();h.requests[0].resolve(result(1));await p;
  assert.equal(h.navigation.length,0);assert.equal(h.app.state.searchBusy,false);assert.equal(h.app.state.discoveries.page,1);
});

test('new Review and multiword searches share ownership, zero results, page cache and error recovery',async()=>{
  const h=loaded(),surveil={atlas_row_id:'keyword-index-surveil',master_name:'Surveil'},multi={atlas_row_id:'keyword-index-first-strike',master_name:'First Strike'};
  const before=JSON.stringify(h.app.state.importedDeck);
  const old=h.app.runDiscovery(search);h.app.selectMechanic('surveil');
  const current=h.app.runDiscovery(surveil);h.requests[0].resolve(result(1));await old;
  assert.equal(h.app.state.discoveries,null);assert.equal(h.app.state.searchBusy,true);
  h.requests[1].resolve({cards:[],page:1,totalCards:0,totalPages:0,hasMore:false});await current;
  assert.equal(h.app.state.discoveries.totalCards,0);assert.equal(h.app.state.discoveries.record, surveil);
  h.app.selectMechanic('first strike');const first=h.app.runDiscovery(multi);h.requests.at(-1).resolve(result(1));await first;
  const second=h.app.runDiscovery(multi,2,true);h.requests.at(-1).reject(new Error('provider unavailable'));await second;
  assert.equal(h.app.state.discoveries.page,1);assert.match(h.$('discovery-status').textContent,/Your previous page is still here/);
  const retry=h.app.runDiscovery(multi,2,true);h.requests.at(-1).resolve(result(2));await retry;
  const count=h.requests.length;await h.app.runDiscovery(multi,1,true);assert.equal(h.requests.length,count);assert.equal(h.app.state.discoveries.page,1);
  assert.equal(JSON.stringify(h.app.state.importedDeck),before);
});

test('failed newest import preserves the loaded deck; old response cannot replace it',async()=>{
  const h=loaded(),before=h.app.state.importedDeck,a=beginImport(h,cosmic),b=beginImport(h,dionus);
  h.requests[1].reject(new Error('current unavailable'));await b;h.requests[0].resolve({...cosmic.result,contextToken:'old'});await a;
  assert.equal(h.app.state.importedDeck,before);assert.equal(h.app.state.contextToken,'token');assert.match(h.$('import-message').textContent,/current unavailable/);
});

test('commander changes and mechanic reads use no transport and leave imported evidence intact',()=>{
  const h=loaded(),before=JSON.stringify(h.app.state.mechanicIndex);h.handlers['commander-apply']();h.app.selectMechanic('crew');
  assert.equal(JSON.stringify(h.app.state.mechanicIndex),before);assert.equal(h.requests.length,0);
});

test('late AbortError cleanup in either request lane cannot clear its newer busy state',async()=>{
  for(const lane of ['import','search']){
    const h=loaded();
    const a=lane==='import'?beginImport(h,cosmic):h.app.runDiscovery(search);
    const b=lane==='import'?beginImport(h,dionus):h.app.runDiscovery(search,2);
    h.requests[0].reject(new DOMException('aborted old request','AbortError'));await a;
    assert.equal(h.app.state[lane==='import'?'importBusy':'searchBusy'],true);
    h.requests[1].resolve(lane==='import'?{...dionus.result,contextToken:'new'}:result(2));await b;
    assert.equal(h.app.state[lane==='import'?'importBusy':'searchBusy'],false);
  }
});

test('clear pasted text preserves the loaded deck, mechanic selection and provider context without transport',()=>{
  const h=loaded(),before=h.app.state;
  h.$('deck-input').value='new draft';h.handlers['clear-deck-input']();
  assert.equal(h.$('deck-input').value,'');
  assert.equal(h.app.state.importedDeck,before.importedDeck);
  assert.equal(h.app.state.mechanicIndex,before.mechanicIndex);
  assert.equal(h.app.state.selectedMechanicId,'flying');
  assert.equal(h.app.state.contextToken,before.contextToken);
  assert.equal(h.requests.length,0);
});

test('clear is a no-op during a pending import and works after completion',async()=>{
  const h=loaded(),pending=beginImport(h,dionus),draft=h.$('deck-input').value;
  h.handlers['clear-deck-input']();assert.equal(h.$('deck-input').value,draft);
  h.requests[0].resolve({...dionus.result,contextToken:'new'});await pending;
  const deck=h.app.state.importedDeck;
  h.handlers['clear-deck-input']();assert.equal(h.$('deck-input').value,'');
  assert.equal(h.app.state.importedDeck,deck);assert.equal(h.requests.length,1);
});

for(const name of ['hakbal','veyran'])test(`${name} actual import handler selects tagged commander and discloses editions`,async()=>{
  const h=loaded(),text=importFixture(name),pending=beginImport(h,{text});
  await settleImport(h,pending,fixtureResult(text));
  assert.equal(h.app.state.importedDeck.counts.playableQuantity,100);
  assert.ok(h.app.state.identity.rowIds.length===1);
  assert.match(h.$('import-message').textContent,/Commander: /);
  assert.match(h.$('import-message').textContent,/assumed printings/);
  assert.equal(h.app.state.importedDeck.counts.excludedQuantity,name==='veyran'?1:0);
});

test('Obeka actual handler requires confirmation and rejects changed-draft confirmation',async()=>{
  const h=loaded(),before=h.app.state.importedDeck,text=importFixture('obeka-a');
  await beginImport(h,{text});assert.equal(h.requests.length,0);assert.equal(h.app.state.importedDeck,before);assert.equal(h.$('import-placement').hidden,false);
  assert.match(h.$('import-placement-message').textContent,/Obeka/);
  h.$('deck-input').value=text+'\n';await h.handlers['confirm-import-commander']();assert.equal(h.requests.length,0);assert.match(h.$('import-message').textContent,/draft changed/);
  await beginImport(h,{text});const pending=h.handlers['confirm-import-commander']();
  await settleImport(h,pending,fixtureResult(text));
  assert.equal(h.app.state.importedDeck.counts.playableQuantity,100);assert.equal(h.app.state.importedDeck.counts.excludedQuantity,8);
  assert.equal(h.app.state.importedDeck.rows.at(-1).commanderSource,'confirmed');
  assert.match(h.$('import-message').textContent,/Commander: Obeka/);
});

test('a newer invalid draft cancels ownership of an earlier pending import',async()=>{
  const h=loaded(),before=h.app.state.importedDeck,pending=beginImport(h,cosmic);
  await beginImport(h,{text:'garbage'});
  h.requests[0].resolve({...cosmic.result,contextToken:'old'});await pending;
  assert.equal(h.app.state.importedDeck,before);assert.equal(h.app.state.importBusy,false);
  assert.match(h.$('import-message').textContent,/Import blocked/);
});

test('changing one reference edition pins other editions and preserves original text',async()=>{
  const h=loaded(),text='1 Leader [Commander]\n99 Forest',result=fixtureResult(text);
  h.app.commitDeck(resolveDeck(parseDeck(text),result.cards),'token');
  const newId='00000000-0000-4000-8000-999999999999',status={},apply={};
  const before=h.app.state.importedDeck,pending=h.app.changeReferencePrinting('row-1',newId,status,apply);
  assert.ok(h.requests[0].payload.identifiers.every(item=>item.id&&!item.name));
  assert.ok(h.requests[0].payload.identifiers.some(item=>item.id===before.rows[1].card.id));
  h.requests[0].resolve({cards:[{...result.cards[0],id:newId,collector_number:'99'},result.cards[1]],notFound:[],contextToken:'chosen'});await pending;
  assert.equal(h.app.state.importedDeck.rows[0].printingProvenance.kind,'user-selected');
  assert.equal(h.app.state.importedDeck.rows[1].card.id,before.rows[1].card.id);
  assert.equal(h.app.state.importedDeck.sourceText,text);assert.equal(apply.disabled,false);
});

test('commander chooser rejects duplicate identities and invalid selection counts',()=>{
  const h=loaded(),before=h.app.state.identity.rowIds;
  h.$('commander-options').querySelectorAll=()=>[];h.handlers['commander-apply']();
  assert.match(h.$('commander-option-status').textContent,/one or two/);
  assert.deepEqual(h.app.state.identity.rowIds,before);
  const text='1 Leader [Commander]\n99 Leader',result=fixtureResult(text);
  h.app.commitDeck(resolveDeck(parseDeck(text),result.cards),'token');
  h.$('commander-options').querySelectorAll=()=>[{value:'row-1'},{value:'row-2'}];h.handlers['commander-apply']();
  assert.match(h.$('commander-option-status').textContent,/same card identity/);
  assert.equal(h.app.state.identity.rowIds.length,1);
});

test('duplicate commander aliases block the actual import without replacing the loaded deck',async()=>{
  const h=loaded(),before=h.app.state.importedDeck,text='Commander\n1 Leader\n1 Alternate Leader\nDeck\n98 Forest',result=fixtureResult(text);
  result.cards[1].oracle_id=result.cards[0].oracle_id;
  const pending=beginImport(h,{text});h.requests[0].resolve(result);await pending;
  assert.equal(h.app.state.importedDeck,before);assert.match(h.$('import-message').textContent,/same card identity/);
});

test('uppercase reference UUIDs work in the actual correction handler',async()=>{
  const h=loaded(),text='1 Leader [Commander]\n99 Forest',result=fixtureResult(text);
  h.app.commitDeck(resolveDeck(parseDeck(text),result.cards),'token');
  const id='ABCDEF00-0000-4000-8000-000000000001',pending=h.app.changeReferencePrinting('row-1',id,{},{});
  assert.ok(h.requests[0].payload.identifiers.some(item=>item.id===id.toLowerCase()));
  h.requests[0].resolve({cards:[{...result.cards[0],id:id.toLowerCase()},result.cards[1]],notFound:[],contextToken:'chosen'});await pending;
  assert.equal(h.app.state.importedDeck.rows[0].printingProvenance.kind,'user-selected');
});

for(const failure of [false,true])test(`editing a pending draft prevents stale ${failure?'error':'commit'} and restores busy controls`,async()=>{
  const h=loaded(),before=h.app.state.importedDeck;
  h.$('import-workbench').open=true;
  const pending=beginImport(h,{text:'1 Hakbal of the Surging Soul [Commander]\n99 Forest'});
  h.$('deck-input').value='1 Veyran, Voice of Duality [Commander]\n99 Island';h.handlers['deck-input:input']();
  const message=h.$('import-message').textContent;
  assert.equal(h.app.state.importBusy,false);assert.equal(h.$('commander-apply').disabled,false);
  if(failure)h.requests[0].reject(new Error('old failure'));else h.requests[0].resolve(fixtureResult('1 Hakbal of the Surging Soul [Commander]\n99 Forest'));
  await pending;
  assert.equal(h.app.state.importedDeck,before);assert.equal(h.$('import-workbench').open,true);
  assert.equal(h.$('import-message').textContent,message);assert.match(h.$('import-preview').textContent,/100\/100.*1 designated commanders/);
});

test('file selection and drop use local preview only, and supersede older imports and file reads',async()=>{
  const h=loaded(),before=h.app.state.importedDeck,pending=beginImport(h,{text:'100 Forest'});
  let completeRead;
  const first=h.app.chooseImportFiles([{name:'old.txt',size:100,text:()=>new Promise(resolve=>completeRead=resolve)}]);
  assert.equal(h.app.state.importBusy,false);
  const text='Board,Qty,Name,Commander\nmain,1,Leader,True\nmain,99,Island,';
  const file={name:'new.csv',size:100,text:async()=>text};
  h.$('deck-file').files=[file];await h.handlers['deck-file:change']();
  completeRead('100 Old');await first;
  assert.equal(h.$('deck-input').value,text);assert.match(h.$('import-preview').textContent,/CSV.*100\/100.*1 designated commanders/);
  h.requests[0].resolve(fixtureResult('100 Forest'));await pending;
  assert.equal(h.app.state.importedDeck,before);assert.equal(h.requests.length,1);
  let prevented=false;await h.handlers['import-drop:drop']({preventDefault(){prevented=true;},dataTransfer:{files:[{name:'drop.txt',size:10,text:async()=>'100 Island'}]}});
  assert.equal(prevented,true);assert.equal(h.$('deck-input').value,'100 Island');assert.equal(h.requests.length,1);
  const second=h.app.chooseImportFiles([{name:'slow.txt',size:10,text:()=>new Promise(resolve=>completeRead=resolve)}]);
  h.$('deck-input').value='100 Plains';h.handlers['deck-input:input']();completeRead('100 Old');await second;
  assert.equal(h.$('deck-input').value,'100 Plains');
});

test('actual commander filter searches source aliases and canonical names with shared normalization',()=>{
  const h=loaded(),row={name:'Godzilla, King of the Monsters',card:{name:'Zilortha, Strength Incarnate'}};
  const option={dataset:{names:JSON.stringify(commanderSearchNames(row))},hidden:false};h.$('commander-options').children=[option];
  for(const text of ['Godzilla','Zilortha','KING OF THE MONSTERS']){h.$('commander-search').value=text;h.app.filterCommanders();assert.equal(option.hidden,false);}
  option.dataset.names=JSON.stringify(commanderSearchNames({name:'Thassa’s Oracle',card:{name:"Thassa's Oracle"}}));
  h.$('commander-search').value="thassa's";h.app.filterCommanders();assert.equal(option.hidden,false);
});

test('optional-extra failure commits complete required rows and keeps main context, while stale extra completion cannot commit',async()=>{
  for(const stale of [false,true]){
    const h=loaded(),before=h.app.state.importedDeck,text='1 Leader [Commander]\n99 Forest\nSideboard\n1 Missing extra';
    const pending=beginImport(h,{text});h.requests[0].resolve({...fixtureResult('1 Leader [Commander]\n99 Forest'),contextToken:'required-context'});
    await new Promise(resolve=>setImmediate(resolve));assert.equal(h.requests.length,2);
    assert.deepEqual(JSON.parse(JSON.stringify(h.requests[1].payload.identifiers)),[{name:'Missing extra'}]);
    if(stale){h.$('deck-input').value='100 Island';h.handlers['deck-input:input']();}
    h.requests[1].reject(new Error('provider unavailable'));await pending;
    if(stale){assert.equal(h.app.state.importedDeck,before);continue;}
    assert.equal(h.app.state.contextToken,'required-context');assert.equal(h.app.state.importedDeck.counts.resolvedEntries,2);
    assert.match(h.$('import-message').textContent,/Optional extra.*provider unavailable/);
    assert.equal(h.app.state.identity.rowIds.length,1);
  }
});

test('reference correction retains unknown-set provenance on other pinned rows',async()=>{
  const h=loaded(),text='Quantity,Name,Set\n1,Leader,000\n99,Forest,rna',parsed=parseDeck(text),cards=fixtureResult('1 Leader\n99 Forest').cards;
  cards[1].set='rna';
  const outcomes=parsed.identifiers.map((identifier,index)=>({lookupKey:identifierKey(identifier),status:'matched',cardId:cards[index].id,setHint:{code:identifier.set,status:index?'honored':'unrecognized'}}));
  h.app.commitDeck(resolveDeck(parsed,cards,[],outcomes),'before');
  const selected={...cards[1],id:'00000000-0000-4000-8000-999999999999',set:'c16'};
  const pending=h.app.changeReferencePrinting('row-2',selected.id,{},{});
  h.requests[0].resolve({cards:[cards[0],selected],notFound:[],contextToken:'after'});await pending;
  assert.equal(h.app.state.contextToken,'after');
  assert.equal(h.app.state.importedDeck.rows[0].printingProvenance.setHint.status,'unrecognized');
  assert.equal(h.app.state.importedDeck.rows[1].printingProvenance.kind,'user-selected');
});
