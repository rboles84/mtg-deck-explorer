import {printingDescription} from '../public/import-model.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {loadCatalog} from '../lib/catalog.mjs';
import {buildQuery, safeCard} from '../lib/scryfall.mjs';
import {indexMechanics, keywordKey} from '../public/mechanics.mjs';
import vocabulary from '../public/mechanics-vocabulary.mjs';
import {parseDeck, resolveDeck, deepFreeze} from '../public/core.mjs';
import {mechanicRule, mechanicExplanation, mechanicSourceStatus, MECHANIC_RULE_LINKS, RULES_REVISION} from '../public/mechanic-rules.mjs';
import {MECHANIC_EXPLANATIONS, DEVOID_SEARCH_REFERENCE} from '../public/mechanic-explanations.mjs';
import {getCardFaces, getCardImageUrl, hasSeparateCardSides} from '../public/card-preview.mjs';
import {requestOwner} from '../public/request-owner.mjs';
import {importedDiscoveryExclusions} from '../public/discovery-exclusions.mjs';
import {indexMechanics as gapIndex} from '../public/catalog-gap-index.mjs';
import * as gapReferences from '../public/catalog-gap-references.mjs';
import {CATALOG_GAPS} from '../public/catalog-gap-data.mjs';

const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const appSource=read('../public/app.mjs'),previewSource=read('../public/card-preview.mjs');
const rulesSource=read('../public/rules-ui.mjs');
const rules=JSON.parse(read('../public/rules-data.json'));
function assertOfficialRulesLink(panel,label){
  const link=panel.querySelectorAll('a').find(a=>a.getAttribute('href')==='https://magic.wizards.com/en/rules');
  assert.ok(link,label);assert.equal(link.textContent,'Official Magic rules ↗',label);
  assert.ok(!panel.querySelectorAll('a').some(a=>a.getAttribute('href')===rules.sourceUrl),label);
}
const catalog=await loadCatalog(fileURLToPath(new URL('..',import.meta.url)));
const captures=Object.fromEntries(['cosmic','dionus'].map(name=>[name,JSON.parse(read(`../reports/mechanics-integration/decks/${name}.json`))]));
const deck=name=>{const c=captures[name];return resolveDeck(parseDeck(c.text),c.result.cards,c.result.notFound);};
function slice(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,`source markers: ${start}`);return source.slice(a,b);}

// A small DOM boundary for actual rendering/interaction code; no layout or browser claims.
function dom(){
  const roots=new Map();
  const document={activeElement:null,fonts:{load:async()=>[{}]}};
  class Element {
    constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.events={};this.open=false;this.hidden=false;this.className='';this.style={setProperty(){}};this.classList={add(){}};}
    set textContent(v){this.text=String(v);this.children=[];}
    get textContent(){return (this.text||'')+this.children.map(n=>n.textContent).join('');}
    append(...nodes){for(let n of nodes){if(typeof n==='string')n=document.createTextNode(n);if(n.tagName==='#fragment'){this.append(...n.children);continue;}this.children.push(n);n.parent=this;}}
    replaceChildren(...nodes){this.text='';this.children=[];this.append(...nodes);}
    setAttribute(k,v){this.attributes[k]=String(v);}
    getAttribute(k){return this.attributes[k]??null;}
    addEventListener(k,fn){this.events[k]=fn;}
    click(){if(!this.disabled){this.focus();this.events.click?.();}}
    focus(){document.activeElement=this;}
    scrollIntoView(){this.scrolled=true;}
    closest(){return null;}
    showModal(){this.open=true;}
    get isConnected(){return true;}
    querySelectorAll(selector){const match=n=>selector==='[data-mechanic-focus]'?Boolean(n.dataset.mechanicFocus):selector.startsWith('.')?n.className.split(' ').includes(selector.slice(1)):n.tagName===selector;return this.children.flatMap(n=>[...(match(n)?[n]:[]),...n.querySelectorAll(selector)]);}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  }
  document.createElement=tag=>new Element(tag);
  document.createDocumentFragment=()=>new Element('#fragment');
  document.createTextNode=text=>{const n=new Element('#text');n.textContent=text;return n;};
  document.querySelectorAll=selector=>[...roots.values()].flatMap(n=>n.querySelectorAll(selector));
  const $=id=>{if(!roots.has(id))roots.set(id,new Element('div'));return roots.get(id);};
  return {document,$,Element};
}
function renderHarness(name='dionus',narrow=true,sourceStatus=mechanicSourceStatus,extensions={}){
  const d=dom(),initial=deck(name),calls=[],searches=[];
  const ctx=vm.createContext({...d,printingDescription,indexMechanics,keywordKey,mechanicRule,mechanicExplanation,mechanicSourceStatus:sourceStatus,initial,catalog,rules,
    narrowMechanics:{matches:narrow},
    cardVisual:card=>d.document.createTextNode(card.name),cardHeading:card=>d.document.createTextNode(card.name),printingMeta:card=>d.document.createTextNode(`${card.set}/${card.collector_number}`),
    externalLink:(label,url)=>{const a=d.document.createElement('a');a.textContent=label;a.setAttribute('href',url);return a;},identitySymbols:()=>d.document.createTextNode('colors'),
    el:(tag,text,cls)=>{const n=d.document.createElement(tag);if(text!==undefined)n.textContent=text;n.className=cls||'';return n;},
    ruleReference:(data,n)=>{const b=d.document.createElement('button');b.className='rule-reference';b.textContent=n;return b;},
    showRule(){},runDiscovery(record){searches.push(record.atlas_row_id);},queryBox:record=>{const n=d.document.createElement('div');n.className='query-box';n.textContent=`Find ${record.master_name} cards`;return n;},buildVisibleQuery:()=>'',...extensions,
  });
  vm.runInContext(read('../public/symbols.mjs').replace(/\bexport /g,''),ctx);
  vm.runInContext(`${slice(rulesSource,'function sectionFor','export function ruleReference').replace('export function ruleBody','function ruleBody')}\nglobalThis.actualRuleBody=ruleBody;`,ctx);
  ctx.ruleBody=(data,n,options)=>{calls.push(n);return ctx.actualRuleBody(data,n,options);};
  vm.runInContext(`
    ${slice(appSource,'const node =','const colors =')}
    let importedDeck=initial,mechanicIndex=indexMechanics(initial),selectedMechanicId=null,rulesData=rules;
    let importBusy=false,searchBusy=false,contextToken='token',identity={colorIdentity:['G'],rowIds:['x']};
    const colors={W:'White',U:'Blue',B:'Black',R:'Red',G:'Green'};
    let knownCards=new Map(initial.rows.filter(r=>r.card).map(r=>[r.card.id,r.card]));
    function selectMechanic(key){selectedMechanicId=key;renderMechanics();}
    ${slice(appSource,'function browseDeckMechanics()','function hideIdentityTip()')}
    ${slice(appSource,'function renderMechanics()','function showRule(')}
    ${slice(appSource,'function buildVisibleQuery(','async function runDiscovery(')}
    globalThis.ui={render:renderMechanics,choose:chooseDeckMechanic,browse:browseDeckMechanics,
      setBusy(v){importBusy=v;renderMechanics();},
      setSources(nextCatalog,nextRules){catalog=nextCatalog;rulesData=nextRules;renderMechanics();},
      replace(deck){importedDeck=deck;mechanicIndex=indexMechanics(deck);selectedMechanicId=null;knownCards=new Map(deck.rows.filter(r=>r.card).map(r=>[r.card.id,r.card]));renderMechanics();},
      get selected(){return selectedMechanicId;}};
    renderMechanics();`,ctx);
  return {...d,ui:ctx.ui,calls,searches};
}

test('all 42 catalog gaps render the verified source and exact evidence without prefetch or wrong Wizards attribution',()=>{
  const proof=JSON.parse(read('../reports/catalog-gaps-20261019/verification.json'));
  const h=renderHarness('dionus',true,gapReferences.mechanicSourceStatus,{indexMechanics:gapIndex,mechanicRule:gapReferences.mechanicRule,mechanicExplanation:gapReferences.mechanicExplanation});
  for(const gap of CATALOG_GAPS){
    const p=proof.rows.find(p=>p.key===gap.key);
    const response=JSON.parse(read('../reports/catalog-gaps-20261019/'+p.validation.membership.file));
    const card=safeCard(response.data.find(c=>c.oracle_id===p.positives[0].oracle_id));
    h.ui.replace({rows:[{id:'source-row',lineNumber:7,quantity:3,playable:true,status:'resolved',card}]});
    h.ui.choose(gap.key);
    const context=h.$('mechanic-context'),panel=context.querySelector('.rules-card');
    assert.ok(panel,gap.term);assert.equal(panel.open,false);assert.match(context.textContent,new RegExp(gap.term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
    const details=context.querySelectorAll('.technical-details');assert.equal(details.length,1);assert.equal(details[0].open,false);
    assert.match(context.textContent,/3 copies/);assert.ok(context.textContent.includes(card.name));
    if(gap.pattern){assert.match(context.textContent,/Oracle wording/);assert.match(details[0].textContent,/oracle_text.* at \d+ = /);}
    else assert.match(details[0].textContent,/keywords\[\d+\] = /);
    if(gap.reference.referenceKind==='provider-card-example'){
      assert.match(panel.textContent,/Scryfall card example/);assert.match(panel.textContent,/general Wizards rules definition has not been verified/);
      assert.ok(panel.querySelectorAll('a').every(a=>!a.textContent.startsWith('Wizards')));
    }
    if(gap.reference.definitionVerified===false&&!gap.reference.playtest){
      assert.match(panel.textContent,/General rules definition not supplied/);
      const link=panel.querySelectorAll('a').find(a=>a.getAttribute('href')===gap.reference.source.url);
      assert.ok(link.textContent.startsWith(gap.reference.source.publisher+' '));
      assert.ok(!panel.querySelector('blockquote'));
    }
    if(gap.reference.playtest){
      assert.match(context.querySelector('.eyebrow').textContent,/Playtest ability word/);
      assert.match(context.querySelector('.mechanic-source-status').textContent,/Plane-Merge Elf.*Commander: not legal/);
      const links=panel.querySelectorAll('a');
      assert.deepEqual(links.map(a=>[a.textContent,a.getAttribute('href')]),[
        ['Plane-Merge Elf on Scryfall ↗',gap.reference.source.url],
        ['Wizards playtest rules ↗',gap.reference.supportingSource.url],
      ]);
      assert.doesNotMatch(panel.textContent,/General rules definition|unique card|keyword search/);
    }
    const run=context.querySelectorAll('button').find(b=>b.textContent===`Search ${gap.term} cards →`);assert.ok(run,gap.term);assert.equal(h.searches.length,0);
    h.ui.setSources(null,null);assert.ok(context.textContent.includes(card.name));assert.equal(context.querySelector('.rules-card'),null);assert.equal(context.querySelector('.query-box'),null);
    if(gap.reference.referenceKind==='provider-card-example')assert.match(context.querySelector('.mechanic-source-status').textContent,/Official source not verified/);
    if(gap.reference.playtest)assert.match(context.querySelector('.eyebrow').textContent,/Playtest ability word/);
    h.ui.setSources(catalog,rules);
  }
});

// Real request handler plus result renderer: failures must never manufacture a
// successful empty state, including when a previously loaded page is retained.
function discoveryHarness(initial={rows:[{id:'commander',card:{id:'resolved-commander'}}]}){
  const d=dom(),requests=[];
  const ctx=vm.createContext({...d,requestOwner,importedDiscoveryExclusions,DEVOID_SEARCH_REFERENCE,initial,
    safeStatus(el,text,error=false){el.textContent=text;el.error=error;},
    api(path,payload){return new Promise((resolve,reject)=>requests.push({path,payload,resolve,reject}));},
    renderMechanics(){},navigate(){},
    externalLink:(label,url)=>{const a=d.document.createElement('a');a.textContent=label;a.setAttribute('href',url);return a;},
    identitySymbols:()=>d.document.createTextNode('colorless'),cardVisual:card=>d.document.createTextNode(card.name)
  });
  vm.runInContext(`
    ${slice(appSource,'const node =','const colors =')}
    ${read('../public/symbols.mjs').replace(/\bexport /g,'')}
    let discoveries=null,identity={colorIdentity:[],rowIds:['commander']},contextToken='token';
    let importedDeck=initial,importBusy=false,searchBusy=false;
    let contextGeneration=1,navigationRevision=0,selectedMechanicId='devoid',clipboardItems=[],knownCards=new Map();
    const discoveryOwner=requestOwner();
    ${slice(appSource,'function buildVisibleQuery(','function persistClipboard()')}
    globalThis.ui={search:runDiscovery,query:queryBox,render(value){discoveries=value;renderDiscoveries();},get result(){return discoveries;}};
  `,ctx);
  return {...d,ui:ctx.ui,requests};
}
const devoidRecord=catalog.records.find(r=>r.atlas_row_id==='keyword-index-devoid');
const devoidQuery='(f:commander id<=c) (kw:Devoid) prefer:newest';
const devoidEmpty={record:devoidRecord,identity:[],cards:[],totalCards:0,totalPages:0,page:1,hasMore:false,skipped:0,providerQuery:devoidQuery,
  scryfallUrl:`https://scryfall.com/search?${new URLSearchParams({q:devoidQuery,unique:'cards',order:'name',dir:'asc'})}`};
function emptyDiscovery(record,identity){
  const providerQuery=`${buildQuery(catalog,record.atlas_row_id,identity)} prefer:newest`;
  return {...devoidEmpty,record,identity,providerQuery,
    scryfallUrl:`https://scryfall.com/search?${new URLSearchParams({q:providerQuery,unique:'cards',order:'name',dir:'asc'})}`};
}

test('successful Devoid zero result explains confirmed colorless identity and links the unchanged exact query',async()=>{
  const h=discoveryHarness(),pending=h.ui.search(devoidRecord);
  assert.doesNotMatch(h.$('discovery-results').textContent,/No compatible Devoid/);
  h.requests[0].resolve(devoidEmpty);await pending;
  await new Promise(resolve=>setImmediate(resolve)); // The real symbol renderer waits for the local font.
  const results=h.$('discovery-results');
  assert.match(results.textContent,/No compatible Devoid cards found/);
  for(const excerpt of DEVOID_SEARCH_REFERENCE.excerpts)assert.ok(results.textContent.includes(excerpt.text));
  assertOfficialRulesLink(results.querySelector('.discovery-empty-explanation'));
  assert.doesNotMatch(results.textContent,/No restrictions were changed|search was limited/);
  const searchLink=results.querySelectorAll('a').find(a=>a.getAttribute('href')===devoidEmpty.scryfallUrl);
  assert.ok(searchLink);
  assert.equal(new URL(searchLink.getAttribute('href')).searchParams.get('q'),devoidQuery);
  assert.equal(results.querySelectorAll('a').length,2);assert.equal(h.$('discovery-query').textContent,'');
  assert.equal(h.$('discovery-status').textContent,'');assert.equal(results.querySelector('.empty-message').getAttribute('role'),'status');
  assert.equal(h.$('discovery-intro').hidden,true);
  assert.equal(h.requests.length,1);assert.equal(h.$('discovery-pages-top').hidden,true);assert.equal(h.$('discovery-status').error,false);
});

test('Underdog uses confirmed imported-card exclusions and results do not repeat the Find panel',()=>{
  const h=discoveryHarness({rows:[{playable:true,status:'resolved',card:{id:'ruff',name:'Ruff, Underdog Champ',keywords:['Underdog'],color_identity:['W'],legalities:{commander:'not_legal'}}}]}),record=catalog.records.find(r=>r.master_name==='Underdog');
  h.ui.render({...devoidEmpty,record,identity:['U'],providerQuery:'(f:commander id<=u) (kw:Underdog) prefer:newest'});
  const results=h.$('discovery-results');
  assert.match(results.textContent,/No compatible Underdog cards found/);
  assert.equal(results.textContent.split('Ruff, Underdog Champ').length-1,1);
  assert.match(results.textContent,/Ruff, Underdog ChampNot Commander-legal/);
  assert.match(results.textContent,/Outside commander colors/);
  const [cardIdentity,commanderIdentity]=results.querySelector('.discovery-identity-comparison').querySelectorAll('.discovery-identity');
  assert.match(cardIdentity.textContent,/Card identity.*White/);
  assert.equal(cardIdentity.querySelector('.identity-symbols').getAttribute('aria-label'),'White color identity');
  assert.match(commanderIdentity.textContent,/Commander identity.*Blue/);
  assert.equal(commanderIdentity.querySelector('.identity-symbols').getAttribute('aria-label'),'Blue color identity');
  assert.match(results.querySelector('.discovery-identity').textContent,/Commander identity.*Blue/);
  assert.equal(results.querySelector('code').textContent,'(f:commander id<=u) (kw:Underdog) prefer:newest');
  assert.equal(results.querySelector('.discovery-exclusions').open,false);
  assert.equal(h.$('discovery-status').textContent,'');assert.equal(h.$('discovery-query').textContent,'');
  assert.equal(results.querySelectorAll('a').length,1);assert.equal(results.querySelector('details').open,false);
  assert.doesNotMatch(results.textContent,/Find Underdog|How this search works|search was not broadened/);
  h.ui.render({...devoidEmpty,cards:[{id:'candidate',name:'Candidate'}],totalCards:1,totalPages:1});
  assert.equal(h.$('discovery-intro').hidden,false);
  assert.equal(h.$('discovery-results').querySelectorAll('a').length,0);
  assert.equal(h.$('discovery-query').querySelectorAll('a').length,1);
  assert.doesNotMatch(h.$('discovery-query').textContent,/Find Devoid|How this search works/);
});

test('all 374 searchable mechanics render accurate zero states, identities and symbols across all 32 color subsets',async()=>{
  const h=discoveryHarness(),colors=[['W','White'],['U','Blue'],['B','Black'],['R','Red'],['G','Green']];
  let checked=0;
  for(const record of catalog.records){
    for(let mask=0;mask<32;mask++){
      const selected=colors.filter((_,i)=>mask&(1<<i)),identity=selected.map(([code])=>code),names=selected.map(([,name])=>name).join(', ')||'Colorless';
      const response=emptyDiscovery(record,identity),context=`${record.master_name}: ${names}`;
      h.ui.render(response);
      await new Promise(resolve=>setImmediate(resolve));
      const results=h.$('discovery-results'),chip=results.querySelector('.discovery-identity'),symbols=chip.querySelector('.identity-symbols');
      assert.equal(chip.querySelector('.discovery-identity-label').textContent,'Commander identity',context);
      assert.equal(chip.children.at(-1).textContent,names,context);
      assert.equal(symbols.getAttribute('aria-label'),`${names} color identity`,context);
      assert.deepEqual(symbols.querySelectorAll('.mtg-symbol').map(n=>n.getAttribute('aria-label')),selected.length?selected.map(([,name])=>name):['Colorless'],context);
      assert.ok(results.querySelectorAll('.symbol-glyph').every(n=>!n.hidden),context);
      assert.ok(results.querySelectorAll('.symbol-fallback').every(n=>n.hidden),context);
      assert.equal(results.querySelectorAll('h3').length,1,context);
      assert.equal(results.querySelector('h3').textContent,`No compatible ${record.master_name} cards found`,context);
      if(record.atlas_row_id==='keyword-index-devoid'&&mask===0)assert.match(results.textContent,/CR 702\.114a/,context);
      else{
        assert.match(results.textContent,/No Commander-legal cards matched this identity/,context);
        assert.doesNotMatch(results.textContent,/CR 702\.114a/,context);
      }
      assert.equal(results.querySelector('.discovery-exclusions'),null,context);
      assert.equal(results.querySelector('.empty-message').getAttribute('role'),'status',context);
      assert.equal(results.querySelectorAll('a').length,record.atlas_row_id==='keyword-index-devoid'&&mask===0?2:1,context);
      assert.equal(results.querySelector('code').textContent,response.providerQuery,context);
      assert.ok(results.querySelectorAll('a').some(a=>a.getAttribute('href')===response.scryfallUrl),context);
      assert.equal(h.$('discovery-query').textContent,'',context);
      assert.equal(h.$('discovery-status').textContent,'',context);
      assert.equal(h.$('discovery-intro').hidden,true,context);
      assert.equal(h.$('discovery-pages-top').hidden,true,context);
      assert.equal(h.$('discovery-pages-bottom').hidden,true,context);
      checked++;
    }
  }
  assert.equal(checked,11968);
  assert.equal(h.requests.length,0,'rendering does not trigger a search or broaden the query');
});

test('all mechanics diagnose imported contributors without confusing card and commander identities',()=>{
  for(const record of catalog.records){
    // Synthetic contributors exercise shared rendering, not real provider membership.
    const row=(id,extra={})=>({playable:true,status:'resolved',card:{id,oracle_id:id,name:id,keywords:[record.master_name],color_identity:['U'],legalities:{commander:'legal'},...extra}});
    const initial={rows:[row('compatible'),row('colorless',{color_identity:[]}),row('banned',{legalities:{commander:'banned'}}),
      row('off-color',{color_identity:['G']}),row('both',{color_identity:['W'],legalities:{commander:'not_legal'}}),
      row('unknown',{color_identity:undefined,legalities:undefined}),row('duplicate',{oracle_id:'off-color',name:'off-color',color_identity:['G']}),
      {...row('sideboard',{color_identity:['W']}),playable:false},{...row('unresolved',{color_identity:['W']}),status:'unresolved'},
      row('unrelated',{keywords:['Unmapped synthetic label'],color_identity:['W']})]};
    const h=discoveryHarness(initial),before=JSON.stringify(initial);
    h.ui.render(emptyDiscovery(record,['U']));
    const results=h.$('discovery-results');
    const details=results.querySelector('.discovery-exclusions'),items=details.querySelectorAll('li');
    assert.equal(details.open,false,record.master_name);
    assert.equal(details.querySelector('summary').textContent,'Why imported cards are excluded (3)',record.master_name);
    assert.deepEqual(items.map(n=>n.querySelector('strong').textContent),['banned','off-color','both'],record.master_name);
    assert.equal(items[0].querySelector('.discovery-identity-comparison'),null);
    assert.equal(items[0].querySelector('.discovery-exclusion-reason').textContent,'Not Commander-legal');
    for(const [index,name] of [[1,'Green'],[2,'White']]){
      const [card,commander]=items[index].querySelectorAll('.discovery-identity');
      assert.equal(card.querySelector('.discovery-identity-label').textContent,'Card identity');
      assert.equal(card.querySelector('.identity-symbols').getAttribute('aria-label'),`${name} color identity`);
      assert.equal(commander.querySelector('.discovery-identity-label').textContent,'Commander identity');
      assert.equal(commander.querySelector('.identity-symbols').getAttribute('aria-label'),'Blue color identity');
    }
    assert.deepEqual(items[2].querySelectorAll('.discovery-exclusion-reason').map(n=>n.textContent),['Not Commander-legal','Outside commander colors']);
    h.ui.render(emptyDiscovery(record,['W','U','B','R','G']));
    assert.deepEqual(results.querySelectorAll('li').map(n=>n.querySelector('strong').textContent),['banned','both']);
    assert.equal(results.querySelector('.discovery-identity-comparison'),null);
    for(const identity of [null,undefined,['X']]){
      h.ui.render({...emptyDiscovery(record,['U']),identity});
      assert.match(results.querySelector('.discovery-identity').textContent,/Commander identityUnknown/);
      assert.equal(results.querySelector('.identity-symbols'),null);
      assert.deepEqual(results.querySelectorAll('li').map(n=>n.querySelector('strong').textContent),['banned','both']);
    }
    assert.equal(JSON.stringify(initial),before,'diagnostics do not modify the imported deck');
  }
});

test('every mechanic distinguishes an empty filtered page from zero matches and restores positive results',()=>{
  const h=discoveryHarness();
  for(const record of catalog.records){
    const empty=emptyDiscovery(record,['U']);
    h.ui.render(empty);
    h.ui.render({...empty,totalCards:25,totalPages:2,hasMore:true,skipped:24});
    const results=h.$('discovery-results');
    assert.equal(results.querySelector('h3').textContent,'No cards to show on this page',record.master_name);
    assert.doesNotMatch(results.textContent,/No compatible|Devoid changes/,record.master_name);
    assert.equal(results.querySelector('.discovery-exclusions'),null);
    assert.equal(h.$('discovery-pages-top').hidden,false);
    assert.equal(h.$('discovery-intro').hidden,false);
    assert.equal(results.querySelectorAll('a').length,1);
    h.ui.render({...empty,cards:[{id:'synthetic-result',name:'Synthetic result'}],totalCards:1,totalPages:1});
    assert.equal(results.querySelector('.discovery-empty'),null);
    assert.equal(results.querySelectorAll('.result-card').length,1);
    assert.equal(results.querySelector('button').getAttribute('aria-label'),'Save Synthetic result to Clipboard');
    assert.equal(h.$('discovery-query').querySelectorAll('a').length,1);
    assert.equal(h.$('discovery-query').querySelector('code').textContent,empty.providerQuery);
    assert.equal(h.$('discovery-intro').hidden,false);
  }
});

test('search coverage renders supported symbols and preserves unknown notation as readable text',async()=>{
  const h=discoveryHarness(),tokens='{W}{U}{B}{R}{G}{C}{2}{X}{W/U}{2/G}{C/R}{B/P}{G/U/P}{S}{T}{Q}{E}{TK}{H}{PW}{CHAOS}{FUTURE}';
  const record={...devoidRecord,discovery:{...devoidRecord.discovery,coverage:tokens}};
  const box=h.ui.query(record,'literal query');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(box.querySelector('details').querySelectorAll('.mtg-symbol').length,21);
  assert.ok(box.querySelectorAll('.symbol-glyph').every(n=>!n.hidden));
  assert.ok(box.querySelectorAll('.symbol-fallback').every(n=>n.hidden));
  assert.match(box.textContent,/\{FUTURE\}/);
  assert.equal(box.querySelector('code').textContent,'literal query');
});

test('official rule text renders mana symbols while preserving cross-reference links',async()=>{
  const h=renderHarness();h.ui.choose('food');
  await new Promise(resolve=>setImmediate(resolve));
  const rulesPanel=h.$('mechanic-context').querySelector('.rules-card');
  assert.ok(rulesPanel.querySelector('.ms-2'));assert.ok(rulesPanel.querySelector('.ms-tap'));
  assert.ok(rulesPanel.querySelectorAll('.symbol-glyph').every(n=>!n.hidden));
  assert.ok(rulesPanel.querySelectorAll('.rule-reference').length>0);
});

test('Devoid explanation requires a zero total and an explicit colorless response identity',()=>{
  for(const change of [{identity:['G']},{identity:['U']},{identity:null},{identity:undefined},{totalCards:1,totalPages:1,skipped:1},
    {record:catalog.records.find(r=>r.master_name==='Underdog')},{cards:[{id:'card',name:'Candidate'}],totalCards:1,totalPages:1}]){
    const h=discoveryHarness();h.ui.render({...devoidEmpty,...change});
    assert.doesNotMatch(h.$('discovery-results').textContent,/CR 702\.114a|Eyeless Watcher/);
  }
  const h=discoveryHarness();h.ui.render(null);assert.equal(h.$('discovery-results').textContent,'');
});

test('failed searches for every mechanic show errors without a no-results explanation or automatic retry',async()=>{
  for(const record of catalog.records)for(const message of ['Scryfall could not be reached or timed out.','Scryfall returned HTTP 400.','Scryfall search failed with HTTP 404.']){
    const h=discoveryHarness(),pending=h.ui.search(record);
    h.requests[0].reject(new Error(message));await pending;
    assert.equal(h.ui.result,null);assert.equal(h.$('discovery-results').textContent,'');
    assert.equal(h.$('discovery-status').textContent,message);assert.equal(h.$('discovery-status').error,true);assert.equal(h.requests.length,1);
  }
});

test('failed pagination for every mechanic preserves the last page instead of showing an empty result',async()=>{
  for(const record of catalog.records){
    const h=discoveryHarness(),first=h.ui.search(record);
    h.requests[0].resolve({...emptyDiscovery(record,['U']),cards:[{id:'synthetic-result',name:'Synthetic result'}],totalCards:200,totalPages:9,hasMore:true});await first;
    const previous=h.ui.result,next=h.ui.search(record,8,true);
    h.requests[1].reject(new Error('Scryfall search failed with HTTP 404.'));await next;
    assert.equal(h.ui.result,previous);assert.match(h.$('discovery-results').textContent,/Synthetic result/);
    assert.equal(h.$('discovery-results').querySelector('.discovery-empty'),null);
    assert.match(h.$('discovery-status').textContent,/404.*Your previous page is still here/);assert.equal(h.$('discovery-status').error,true);
  }
});

test('definition links resolve only exact reviewed headings at the pinned revision',()=>{
  assert.equal(Object.keys(MECHANIC_RULE_LINKS).length,234);
  for(const [label,number] of Object.entries(MECHANIC_RULE_LINKS)){
    assert.equal(mechanicRule(rules,label),number);
    assert.equal(mechanicRule(rules,label.toUpperCase()),number);
    assert.ok(rules.sections[number].paragraphs.every(p=>p.text===rules.rules[p.number].text));
  }
  for(const label of ['Crew 6',' crew','Crew!','Food','Eternity Gate','Landfall','__proto__'])assert.equal(mechanicRule(rules,label),null);
  assert.equal(mechanicRule({...rules,date:'2026-10-17'},'Crew'),null);
  assert.equal(mechanicRule({...rules,sourceSha256:'changed'},'Crew'),null);
  assert.equal(mechanicRule({...rules,sourceUrl:'https://example.com/rules'},'Crew'),null);
  assert.equal(mechanicRule({...rules,sections:{'702.122':{title:'Other',paragraphs:[{}]}}},'Crew'),null);
  assert.equal(rules.sourceSha256,RULES_REVISION.sourceSha256);
  for(const name of ['cosmic','dionus'])for(const term of indexMechanics(deck(name)).terms.filter(t=>t.audited))assert.ok(mechanicRule(rules,term.label),`${name}: ${term.label}`);
});

test('main navigation exactly follows imported labels without a second mechanic list',()=>{
  const h=renderHarness(),buttons=h.$('mechanic-list').querySelectorAll('button');
  assert.equal(buttons.length,15);assert.equal(h.$('detected-list').querySelectorAll('button').length,1);
  assert.ok(!buttons.some(b=>b.textContent.startsWith('Deathtouch')));
  assert.ok(buttons.some(b=>b.textContent==='Crew · 16'));
  assert.doesNotMatch(read('../public/index.html'),/other-mechanic-searches|other-card-searches/);
  assert.doesNotMatch(appSource,/other-mechanic-searches|discovery:/);
  h.ui.choose('station');assert.equal(h.$('mechanic-picker').open,false);
  assert.equal(h.document.activeElement,h.$('mechanic-context').querySelector('h2'));
  assert.match(h.$('mechanic-context').textContent,/Station · 3 distinct cards · 3 copies/);
  assert.ok(h.calls.includes('702.184'));
  h.ui.browse();assert.equal(h.$('mechanic-picker').open,true);
  assert.equal(h.document.activeElement,h.$('mechanic-picker-summary'));
  h.ui.setBusy(true);assert.equal(h.$('clear-deck-input').disabled,true);
  h.ui.setBusy(false);assert.equal(h.$('clear-deck-input').disabled,false);
});

test('rules, evidence disclosures and unknown labels work independently of search support',()=>{
  const h=renderHarness();
  for(const [key,rule] of [['crew','702.122'],['station','702.184'],['mill','701.17'],['equip','702.6']]){
    h.ui.choose(key);const context=h.$('mechanic-context');
    assert.ok(h.calls.includes(rule));assert.match(context.textContent,/Reported by Scryfall/);
    assert.ok(context.querySelectorAll('details').some(d=>d.textContent.includes('keywords[')));
    assert.ok(context.querySelectorAll('button').some(b=>b.textContent.startsWith('Search ')));
  }
  h.ui.choose('eternity gate');
  assert.match(h.$('mechanic-context').textContent,/Eternity Gate · General flavor-word rule/);
  assert.match(h.$('mechanic-context').textContent,/Additional Scryfall label/);
  assert.match(h.$('mechanic-context').textContent,/not certified/);
  assert.ok(!h.$('mechanic-list').textContent.includes('Deathtouch'));
});

test('one explanation precedes cards and raw evidence stays in one closed section below them',()=>{
  const h=renderHarness();h.ui.choose('food');
  const context=h.$('mechanic-context'),summary=h.$('detected-list');
  const plainText=n=>n.className.split(' ').includes('technical-details')?'':(n.text||'')+n.children.map(plainText).join('');
  assert.match(plainText(summary),/Your import determines which cards appear here\. Matches use Scryfall labels and reviewed Oracle wording/);
  assert.equal(plainText(context).split('These cards are in your imported deck, and Scryfall lists this label for them.').length-1,1);
  assert.doesNotMatch(context.textContent,/Why this appears:/);
  assert.doesNotMatch(plainText(context),/Additional Scryfall label/);
  for(const root of [summary,context]){
    assert.doesNotMatch(plainText(root),/keywords\[|provider_reports|Oracle ID:|Printing ID:|pinned vocabulary|audit status/);
    const panels=root.querySelectorAll('.technical-details');assert.ok(panels.length);
    for(const panel of panels){assert.equal(panel.open,false);assert.equal(panel.querySelector('summary').textContent,root===summary?'Import record details':'Source record details');}
  }
  const evidence=context.querySelector('.technical-details'),cards=context.querySelector('.mechanic-deck-cards'),grid=context.querySelector('.deck-card-grid');
  assert.equal(context.querySelectorAll('.technical-details').length,1);
  assert.equal(cards.children.at(-1),evidence);
  assert.equal(cards.children.at(-2),grid);
  const sourceDeck=deck('dionus');
  for(const tile of context.querySelectorAll('.visual-card')){
    const link=tile.querySelector('a');assert.ok(link);
    const rows=sourceDeck.rows.filter(r=>r.card?.scryfall_uri===link.getAttribute('href'));assert.ok(rows.length);
    assert.equal(link.parent,tile);
    assert.match(plainText(tile),new RegExp(`Imported lines: ${rows.map(r=>r.lineNumber).join(', ')}`));
    assert.equal(tile.querySelector('.technical-details'),null);
    assert.match(evidence.textContent,/keywords\[/);
    assert.ok(evidence.textContent.includes(rows[0].card.id));
  }
  assert.match(context.textContent,/Relationship: provider_reports/);
  assert.match(context.textContent,/reviewed in the Commander shortlist supplement/);
  h.ui.choose('crew');
  const crewEvidence=h.$('mechanic-context').querySelector('.technical-details');
  assert.equal(h.$('mechanic-context').querySelectorAll('.technical-details').length,1);
  const crewCards=h.$('mechanic-context').querySelectorAll('.visual-card');assert.ok(crewCards.length>1);
  for(const tile of crewCards){
    assert.equal(tile.querySelector('.technical-details'),null);
    const row=sourceDeck.rows.find(r=>r.card?.scryfall_uri===tile.querySelector('a').getAttribute('href'));
    const proof=crewEvidence.querySelectorAll('section').find(s=>s.textContent.includes(row.card.id));
    assert.ok(proof);assert.equal(proof.querySelector('h4').textContent,row.card.name);
  }
  assert.equal(h.searches.length,0);
});

test('rendered deck replacement clears old selection and does not duplicate the long label list',()=>{
  const h=renderHarness('cosmic',false);h.$('mechanic-picker').open=true;
  h.ui.choose('flying');assert.equal(h.$('mechanic-picker').open,true);
  assert.equal(h.$('mechanic-list').querySelectorAll('button').length,35);
  h.ui.replace(deck('dionus'));assert.equal(h.ui.selected,null);
  assert.equal(h.$('mechanic-list').querySelectorAll('button').length,15);
  assert.match(h.$('mechanic-context').textContent,/Choose a mechanic/);
  h.ui.replace(deck('cosmic'));assert.equal(h.$('mechanic-list').querySelectorAll('button').length,35);
  h.ui.replace(deck('cosmic'));assert.equal(h.$('mechanic-list').querySelectorAll('button').length,35);
});

test('missing catalog or rules cannot hide imported cards, and partial resolution stays disclosed',()=>{
  const h=renderHarness();h.ui.setSources(null,null);h.ui.choose('crew');
  assert.match(h.$('mechanic-context').textContent,/No linked explanation/);
  assert.match(h.$('mechanic-context').textContent,/Crew · 16 distinct cards · 16 copies/);
  assert.match(h.$('mechanic-context').textContent,/External searches and historical color placements are unavailable/);
  const parsed=parseDeck(captures.dionus.text);
  const cards=structuredClone(captures.dionus.result.cards);
  cards[0].keywords_status='missing';delete cards[0].keywords;
  const partial=resolveDeck(parsed,cards.slice(0,-1),[]);h.ui.replace(partial);
  const c=indexMechanics(partial).coverage;
  assert.ok(c.missingEntries>0);assert.ok(c.entries>c.resolvedEntries);
  assert.match(h.$('detected-list').textContent,new RegExp(`${c.entries-c.resolvedEntries} unresolved entries`));
  assert.match(h.$('detected-list').textContent,new RegExp(`${c.missingEntries} missing`));
});

test('all 296 audited labels render and dispatch Find without rules or historical placement, with no prefetch',()=>{
  const h=renderHarness();h.ui.setSources(catalog,null);
  const template=structuredClone(captures.dionus.result.cards[0]);
  for(const label of vocabulary.labels){
    const card={...template,name:'Discovery Witness',set:'tst',collector_number:'1',keywords:[label.term],keywords_status:'reported'};
    h.ui.replace(resolveDeck(parseDeck('1 Discovery Witness (tst) 1'),[card],[]));
    const count=h.searches.length;h.ui.choose(label.key);assert.equal(h.searches.length,count);
    const context=h.$('mechanic-context'),box=context.querySelector('.query-box');assert.ok(box,label.term);
    assert.equal(box.querySelector('h3').textContent,`Find ${label.term} cards`);
    assert.match(context.textContent,/No linked explanation/);
    const record=catalog.records.find(r=>r.master_name===label.term);
    assert.equal(box.textContent.split(record.discovery.coverage).length-1,1,label.term);
    if(record.atlas.tier==='Review')assert.match(box.querySelector('summary').textContent,/Review coverage/,label.term);
    const run=context.querySelectorAll('button').find(b=>b.textContent===`Search ${label.term} cards →`);
    assert.ok(run&&!run.disabled,label.term);run.click();assert.equal(h.searches.at(-1),record.atlas_row_id);
    if(!record.placement)assert.equal(context.querySelector('.color-history'),null);
  }
  assert.equal(h.searches.length,296);
  for(const label of ['Future mechanic','Flying OR id<=r','__proto__']){
    h.ui.replace(resolveDeck(parseDeck('1 Discovery Witness (tst) 1'),[{...template,name:'Discovery Witness',set:'tst',collector_number:'1',keywords:[label]}],[]));
    h.ui.choose(label.toLowerCase());assert.equal(h.$('mechanic-context').querySelector('.query-box'),null);
    assert.match(h.$('mechanic-context').textContent,/new labels require an explicit reviewed mapping/);
  }
  assert.equal(h.searches.length,296);
});

function detailHarness(){
  const d=dom(),body=d.$('body'),title=d.$('title'),dialog=d.$('dialog');
  const close=d.document.createElement('button');close.className='card-details-close';dialog.append(close);
  const element=(tag,cls,text)=>{const n=d.document.createElement(tag);n.className=cls||'';if(text!==undefined)n.textContent=text;return n;};
  const ctx=vm.createContext({...d,printingDescription,element,getCardFaces,getCardImageUrl,hasSeparateCardSides,URL,
    installCardPreviews(){},ensureDialog(){},suppress(){},closeCardPreview(){},applyColorFrame(){},
    symbolText:(text,cls)=>element('p',cls,text),printingLabel:c=>`${c.set} ${c.collector_number}`,setSymbol:()=>element('span'),identitySymbols:()=>element('span'),safePrintingLink:()=>null,
    cardSaveAction:action=>{const b=element('button','save','Save');b.addEventListener('click',action.onSave);return b;},
    detailBody:body,detailTitle:title,detailDialog:dialog,
  });
  vm.runInContext(`let detailsReturnTrigger,detailsReturnContext;
    ${slice(previewSource,'function cardArt(','function findTrigger(')}
    ${slice(previewSource,'export function openCardDetails(','/** A semantic name button.').replace('export function','function')}
    globalThis.open=openCardDetails;`,ctx);
  return {...d,body,dialog,open:ctx.open};
}

test('detail viewer retains assumed versus supplied entry context for the same printing',()=>{
  const card=deepFreeze(structuredClone(captures.cosmic.result.cards[0]));
  const h=detailHarness(),trigger=h.document.createElement('button');
  h.open(card,trigger,{reference:{printingProvenance:{kind:'assumed'},finish:'foil'}});
  assert.match(h.body.textContent,/Assumed printing/);assert.match(h.body.textContent,/Requested finish: foil/);
  assert.ok(!h.body.textContent.includes('exact resolved printing'));
  h.open(card,trigger,{reference:{printingProvenance:{kind:'supplied'},finish:'unspecified'}});
  assert.match(h.body.textContent,/Supplied printing/);assert.ok(!h.body.textContent.includes('Assumed printing'));
});

test('actual detail handler flips exact face art, rules and flavor together without mutating printing or save action',()=>{
  const card=deepFreeze(structuredClone(captures.cosmic.result.cards.find(c=>c.name==='Gwen Stacy // Ghost-Spider'))),before=JSON.stringify(card);
  assert.ok(card);
  const h=detailHarness();let saved;
  h.open(card,null,{saveAction:{onSave(){saved=card.id;}}});
  const flip=h.body.querySelector('.card-face-flip');assert.ok(flip);
  for(const index of [0,1,0]){
    assert.equal(h.body.querySelector('img').src,getCardImageUrl(card,index));
    assert.equal(h.body.querySelector('.card-details-oracle').textContent,card.card_faces[index].oracle_text);
    assert.equal(h.body.querySelector('.card-details-flavor').textContent,card.card_faces[index].flavor_text||'This face has no supplied flavor text.');
    assert.equal(flip.getAttribute('aria-label'),`Show ${card.card_faces[1-index].name}`);
    flip.click();assert.equal(h.document.activeElement,flip);
  }
  h.body.querySelector('.save').click();assert.equal(saved,card.id);assert.equal(h.dialog.open,true);
  assert.equal(JSON.stringify(card),before);
  const single=captures.dionus.result.cards.find(c=>!c.card_faces);
  h.open(single,null);assert.equal(h.body.querySelector('.card-face-flip'),null);
});

test('flipping to a missing face image keeps its text and never borrows the other face art',()=>{
  const card=structuredClone(captures.cosmic.result.cards.find(c=>c.name==='Gwen Stacy // Ghost-Spider'));
  delete card.card_faces[1].image_uris;deepFreeze(card);
  const h=detailHarness();h.open(card,null);h.body.querySelector('.card-face-flip').click();
  assert.equal(h.body.querySelector('img'),null);
  assert.match(h.body.textContent,/Art unavailable/);
  assert.equal(h.body.querySelector('.card-details-oracle').textContent,card.card_faces[1].oracle_text);
});


test('Food and flavor-word references require exact retained clauses and never certify keywords',()=>{
  for(const [label,numbers] of [['Food',['111.10b','111.10','205.3g']],['Eternity Gate',['207.2d']]]){
    assert.deepEqual(mechanicExplanation(rules,label).rules,numbers);
    assert.deepEqual(mechanicExplanation(rules,label.toUpperCase()).rules,numbers);
    assert.equal(mechanicRule(rules,label),null);
    for(const number of numbers){
      const changed=structuredClone(rules);changed.rules[number].text+=' Changed.';
      assert.equal(mechanicExplanation(changed,label),null);
      delete changed.rules[number];assert.equal(mechanicExplanation(changed,label),null);
    }
    assert.equal(mechanicExplanation({...rules,date:'changed'},label),null);
    assert.equal(mechanicExplanation({...rules,sourceSha256:'changed'},label),null);
  }
  for(const label of [' food','Food!','Eternity Gate 2','Mill','__proto__',null])assert.equal(mechanicExplanation(rules,label),null);
  const h=renderHarness();h.ui.choose('food');
  const text=h.$('mechanic-context').textContent;
  assert.doesNotMatch(text,/other Food artifacts do not automatically/);
  assert.match(text,/A Food token is a colorless Food artifact token/);
  assert.match(text,/may also modify/);
  assert.match(text,/reviewed in the Commander shortlist supplement/);
  for(const n of ['111.10b','111.10','205.3g'])assert.ok(h.calls.includes(n));
  assert.equal(h.searches.length,0);
});

test('all 142 shortlist labels render explanations; only the 126 general labels offer deliberate searches',()=>{
  const fixture=JSON.parse(read('fixtures/mechanics/commander-shortlist.json'));
  const cards=fixture.cards.map(x=>safeCard(x.card));
  const text=cards.map(c=>`1 ${c.name} (${c.set}) ${c.collector_number}`).join('\n');
  const h=renderHarness();h.ui.replace(resolveDeck(parseDeck(text),cards));
  assert.equal(h.searches.length,0);
  for(const label of fixture.expectedLabels){
    h.ui.choose(label.toLowerCase());const context=h.$('mechanic-context');
    assert.ok(context.querySelector('.rules-card'),label);
    assert.equal(context.querySelector('.rules-card').open,false);
    const reference=MECHANIC_EXPLANATIONS[label.toLowerCase()];
    const panel=context.querySelector('.rules-card');
    if(!reference||reference.rules.length)assertOfficialRulesLink(panel,label);
    if(reference?.quote){
      assert.equal(panel.querySelector('.official-excerpt').textContent,reference.quote,label);
    }
    if(reference?.source)assert.ok(panel.querySelectorAll('a').some(a=>a.getAttribute('href')===reference.source.url),label);
    if(reference?.verification==='unverified'){
      assert.ok(context.querySelector('.mechanic-source-status'),label);
      assert.equal(panel.querySelector('.mechanic-source-status'),null,label);
      assert.equal(panel.querySelector('.official-excerpt'),null,label);
      assert.match(context.querySelector('.eyebrow').textContent,/official source unverified/,label);
    }else assert.equal(context.querySelector('.mechanic-source-status'),null,label);
    assert.ok(context.querySelectorAll('.visual-card').length,label);
    assert.doesNotMatch(context.textContent,/not yet matched|No linked explanation|No validated discovery/);
    const search=context.querySelectorAll('button').find(b=>b.textContent.startsWith('Search '));
    if(reference?.generalReference){
      assert.equal(search,undefined);assert.match(context.textContent,/no special rules meaning/);
    }else if(label==='Jump'){
      assert.equal(search,undefined);assert.match(panel.textContent,/This reference applies only to Cid, Freeflier Pilot/);
    }else{assert.ok(search,label);search.click();}
  }
  assert.equal(h.searches.length,126);assert.equal(new Set(h.searches).size,126);
});

test('the 20 new real-card fixtures display exact rules, official links and deliberate searches',()=>{
  const fixture=JSON.parse(read('fixtures/mechanics/variants.json'));
  const h=renderHarness();
  for(const item of fixture.cases){
    const card=safeCard(fixture.cards.find(x=>x.card.oracle_id===item.positive).card);
    h.ui.replace(resolveDeck(parseDeck(`1 ${card.name} (${card.set}) ${card.collector_number}`),[card]));
    const before=h.searches.length;h.ui.choose(item.label.toLowerCase());
    const context=h.$('mechanic-context'),panel=context.querySelector('.rules-card');
    assert.ok(panel,item.label);assert.equal(panel.open,false);assert.equal(h.searches.length,before);
    const reference=MECHANIC_EXPLANATIONS[item.label.toLowerCase()];
    for(const n of reference.rules)assert.ok(h.calls.includes(n),n);
    assertOfficialRulesLink(panel,item.label);
    assert.match(context.textContent,/reviewed in the mechanic variants supplement/);
    assert.ok(context.textContent.includes(card.name));
    if(item.label==='Descend'){
      assert.equal(panel.querySelector('.official-excerpt').textContent,reference.quote);
      assert.ok(panel.querySelectorAll('a').some(a=>a.getAttribute('href')===reference.source.url));
      assert.doesNotMatch(panel.textContent,/descended this turn/);
    }
    const search=context.querySelectorAll('button').find(b=>b.textContent===`Search ${item.label} cards →`);
    assert.ok(search&&!search.disabled,item.label);search.click();assert.equal(h.searches.length,before+1);
  }
  assert.equal(h.searches.length,20);assert.equal(new Set(h.searches).size,20);
  h.ui.setSources(null,null);
  const context=h.$('mechanic-context');
  assert.match(context.textContent,/No linked explanation/);assert.match(context.textContent,/remain|unavailable/);
  assert.ok(context.querySelectorAll('.visual-card').length);assert.equal(context.querySelector('.rules-card'),null);
});

test('Jump shows only its named Cid reference and never assigns it to Direct Current',()=>{
  const fixture=JSON.parse(read('fixtures/mechanics/variants.json'));
  const cid=safeCard(fixture.cards.find(x=>x.card.oracle_id===fixture.jump.cid).card);
  const direct=safeCard(fixture.cards.find(x=>x.card.oracle_id===fixture.jump.directCurrent).card);
  const h=renderHarness();
  for(const [cards,expected] of [[[cid],true],[[direct],false],[[cid,direct],true],[[{...cid,keywords:[]},direct],false],[[{...cid,oracle_id:null}],false]]){
    h.ui.replace(resolveDeck(parseDeck(cards.map(c=>`1 ${c.name} (${c.set}) ${c.collector_number}`).join('\n')),cards));
    h.ui.choose('jump');const context=h.$('mechanic-context'),panel=context.querySelector('.rules-card');
    assert.equal(!!panel,expected);assert.ok(context.querySelectorAll('.visual-card').length);
    assert.equal(context.querySelectorAll('button').find(b=>b.textContent==='Search Jump cards →'),undefined);
    assert.doesNotMatch(context.querySelector('.eyebrow').textContent,/flavor word/);
    if(expected){
      assert.match(panel.textContent,/This reference applies only to Cid, Freeflier Pilot/);
      assert.equal(panel.querySelectorAll('a').length,1);
      assert.equal(panel.querySelectorAll('a')[0].getAttribute('href'),MECHANIC_EXPLANATIONS.jump.source.url);
      assert.equal(panel.querySelectorAll('.rules-body').length,0);
    }else assert.match(context.textContent,/No linked explanation/);
  }
  assert.equal(h.searches.length,0);
  h.ui.replace(resolveDeck(parseDeck(`1 ${direct.name} (${direct.set}) ${direct.collector_number}`),[direct]));
  h.ui.choose('jump-start');const context=h.$('mechanic-context');
  assert.ok(context.querySelector('.rules-card'));
  const search=context.querySelectorAll('button').find(b=>b.textContent.toLowerCase()==='search jump-start cards →');
  assert.ok(search);search.click();assert.equal(h.searches.length,1);
});

test('verified Eternity Gate links its official card and keeps evidence without duplicate inline Oracle text',()=>{
  const h=renderHarness();h.ui.choose('eternity gate');
  const context=h.$('mechanic-context');
  assert.equal(context.querySelector('.mechanic-oracle-text'),null);
  assert.equal(context.querySelector('.mechanic-card-text'),null);
  assert.match(context.textContent,/Necron Monolith/);
  assert.match(context.textContent,/Open a card to read its rules/);
  assert.match(context.textContent,/Relationship: provider_reports/);
  assert.ok(h.calls.includes('207.2d'));
  assert.equal(context.querySelector('.rules-card').open,false);
  assert.ok(context.querySelectorAll('a').some(a=>a.getAttribute('href')===MECHANIC_EXPLANATIONS['eternity gate'].source.url));
  assert.equal(context.querySelector('.mechanic-source-status'),null);
  h.ui.setSources(catalog,null);
  assert.match(context.textContent,/No linked explanation/);
  assert.equal(context.querySelector('.mechanic-source-status'),null);
  assert.equal(h.searches.length,0);
});

test('unverified source warnings remain visible if rules cannot load',()=>{
  // Simulate an unresolved source without adding a production label or summary.
  const h=renderHarness('dionus',true,()=> 'unverified');
  h.ui.setSources(catalog,null);h.ui.choose('eternity gate');
  const context=h.$('mechanic-context');
  assert.match(context.querySelector('.mechanic-source-status').textContent,/Official source not verified/);
  assert.match(context.querySelector('.eyebrow').textContent,/official source unverified/);
  assert.match(context.textContent,/Necron Monolith/);
  assert.equal(context.querySelector('.rules-card'),null);
  assert.equal(h.searches.length,0);
});

test('official citations and the exact reviewed designer/archive URLs pass the actual external-link guard',()=>{
  const d=dom(),ctx=vm.createContext({...d,URL});
  vm.runInContext(`${slice(appSource,'const node =','const colors =')}
    ${slice(appSource,'function externalLink(','function safeStatus(')}
    globalThis.link=externalLink;`,ctx);
  for(const reference of [...Object.values(MECHANIC_EXPLANATIONS),...CATALOG_GAPS.map(g=>g.reference)].filter(e=>e.source)){
    const link=ctx.link(reference.title,reference.source.url);
    assert.equal(link.tagName,'a');assert.equal(link.href,reference.source.url);
    assert.equal(link.target,'_blank');assert.equal(link.rel,'noreferrer');
  }
  for(const url of ['http://gatherer.wizards.com/','https://gatherer.wizards.com.example.com/','javascript:alert(1)','invalid','https://www.youtube.com/watch?v=unreviewed','https://www.youtube.com/watch?v=NuWq8-rnJ38&t=617s&unreviewed=1','https://web.archive.org/web/20201021225115/https://example.com/','https://web.archive.org.example.com/','https://www.youtube.com.example.com/watch?v=NuWq8-rnJ38&t=617s']){
    assert.equal(ctx.link('Untrusted',url).tagName,'span');
  }
});

test('all 181 added references render official links with accurate scope and leave searches deliberate',()=>{
  const proof=JSON.parse(read('../reports/mechanic-sourcing/remaining-labels-verification.json'));
  const h=renderHarness(),template=structuredClone(captures.dionus.result.cards[0]);
  for(const receipt of proof.rows){
    // Synthetic label carriers exercise rendering, not real card membership.
    const card={...template,name:'Reference Witness',set:'tst',collector_number:'1',keywords:[receipt.title],keywords_status:'reported'};
    h.ui.replace(resolveDeck(parseDeck('1 Reference Witness (tst) 1'),[card],[]));
    const before=h.searches.length;h.ui.choose(receipt.label);
    const context=h.$('mechanic-context'),panel=context.querySelector('.rules-card');
    assert.ok(panel,receipt.title);assert.equal(panel.open,false);assert.equal(h.searches.length,before);
    assert.equal(context.querySelector('.mechanic-source-status'),null);
    assert.equal(panel.querySelector('.official-excerpt'),null,'No added prose or quotations');
    if(receipt.url===rules.sourceUrl)assertOfficialRulesLink(panel,receipt.title);
    else assert.ok(panel.querySelectorAll('a').some(a=>a.getAttribute('href')===receipt.url),receipt.title);
    const e=MECHANIC_EXPLANATIONS[receipt.label];
    if(e?.referenceKind==='ability-word'){
      assert.match(panel.querySelector('summary').textContent,/General ability-word rule/);
      assert.doesNotMatch(panel.querySelector('summary').textContent,/flavor-word/);
      assertOfficialRulesLink(panel,receipt.title);
    }
    if(e?.source?.kind==='card-example'){
      assert.match(panel.textContent,/Wizards card example/);
      assert.ok(panel.textContent.includes(receipt.cardName));
    }
    if(e?.referenceKind==='card-example'){
      assert.match(panel.querySelector('summary').textContent,/Official card reference/);
      assert.equal(panel.querySelectorAll('.rules-body').length,0);
      assert.equal(panel.querySelectorAll('a').length,1,'Card-only proof must not imply a numbered CR entry');
    }
    if(e?.source?.kind==='article')assert.match(panel.textContent,/Wizards mechanic reference/);
    assert.match(context.textContent,/Reference Witness/);
    const search=context.querySelectorAll('button').find(b=>b.textContent===`Search ${receipt.title} cards →`);
    assert.ok(search&&!search.disabled,receipt.title);search.click();
    assert.equal(h.searches.length,before+1);
  }
  assert.equal(h.searches.length,181);
});

test('contextual history precedes evidence; Surveil search is independent of historical placement',()=>{
  const h=renderHarness('cosmic');h.ui.choose('trample');
  const context=h.$('mechanic-context'),children=context.children;
  const history=context.querySelector('.color-history'),evidence=context.querySelector('.mechanic-deck-cards'),query=context.querySelector('.query-box');
  assert.ok(history);assert.match(history.textContent,/2021 placement/);
  assert.ok(children.indexOf(history)<children.indexOf(evidence));
  assert.ok(children.indexOf(evidence)<children.indexOf(query));
  assert.equal(h.searches.length,0);
  context.querySelectorAll('button').find(b=>b.textContent==='Search Trample cards →').click();
  assert.deepEqual(h.searches,['keyword-index-trample']);
  h.ui.choose('surveil');assert.ok(h.calls.includes('701.25'));
  assert.match(context.textContent,/Find Surveil cards/);
  assert.ok(context.querySelector('.query-box'));
  assert.equal(context.querySelector('.color-history'),null);
  context.querySelectorAll('button').find(b=>b.textContent==='Search Surveil cards →').click();
  assert.deepEqual(h.searches,['keyword-index-trample','keyword-index-surveil']);
  h.ui.choose('deathtouch');h.ui.replace(deck('dionus'));h.ui.choose('deathtouch');
  assert.match(context.textContent,/Choose a mechanic/);assert.equal(context.querySelector('.query-box'),null);
});


test('all available rule panels start collapsed and Food renders only its three requested clauses',()=>{
  const h=renderHarness();
  for(const [name,capture] of Object.entries(captures)){
    h.ui.replace(deck(name));
    for(const term of indexMechanics(deck(name)).terms){
      h.ui.choose(term.key);
      const panel=h.$('mechanic-context').querySelector('.rules-card');
      if(!panel)continue;
      assert.equal(panel.tagName,'details');assert.equal(panel.open,false);
      assert.equal(panel.children[0].tagName,'summary');
      assert.ok(panel.querySelectorAll('.rules-body').length);
    }
  }
  h.ui.replace(deck('dionus'));h.ui.choose('food');
  const panel=h.$('mechanic-context').querySelector('.rules-card');
  const paragraphs=panel.querySelectorAll('.rules-body').flatMap(n=>n.querySelectorAll('p'));
  assert.deepEqual(paragraphs.map(p=>p.querySelector('strong').textContent),['111.10b ','111.10 ','205.3g ']);
  assert.doesNotMatch(panel.textContent,/111\.10[aacdefghijkmnpqrstuvwx] /);
  assert.equal((panel.textContent.match(/111\.10b /g)||[]).length,1);
  assert.ok(panel.querySelectorAll('.rule-reference').length>0);
  assert.equal(h.searches.length,0);
});

test('retained Adventure, flip and split printings show both parts with one image and no turn control',()=>{
  const witnesses=JSON.parse(read('../reports/mechanics-integration/retest02-fixes/card-layout-witnesses.json'));
  for(const raw of witnesses.cards.filter(c=>['adventure','flip','split'].includes(c.layout))){
    const card=deepFreeze(safeCard(raw)),before=JSON.stringify(card),h=detailHarness();let saved;
    h.open(card,null,{saveAction:{onSave(){saved=card.id;}}});
    assert.equal(hasSeparateCardSides(card),false);
    assert.equal(h.body.querySelector('.card-face-flip'),null);
    assert.equal(h.body.querySelector('.card-face-position'),null);
    assert.equal(h.body.querySelectorAll('img').length,1);
    assert.equal(h.body.querySelector('img').src,getCardImageUrl(card,0));
    assert.deepEqual(h.body.querySelectorAll('.card-face-name').map(n=>n.textContent),card.card_faces.map(f=>f.name));
    assert.deepEqual(h.body.querySelectorAll('.card-details-oracle').map(n=>n.textContent),card.card_faces.map(f=>f.oracle_text));
    assert.deepEqual(h.body.querySelectorAll('.card-details-flavor').map(n=>n.textContent),card.card_faces.map(f=>f.flavor_text||'This face has no supplied flavor text.'));
    h.body.querySelector('.save').click();assert.equal(saved,card.id);assert.equal(h.dialog.open,true);
    assert.equal(JSON.stringify(card),before);
  }
});

test('modal DFC preserves real front/back rendering; unknown layouts do not invent a reverse side',()=>{
  const raw=JSON.parse(read('../reports/mechanics-integration/retest02-fixes/card-layout-witnesses.json')).cards.find(c=>c.layout==='modal_dfc');
  const card=deepFreeze(safeCard(raw)),h=detailHarness();h.open(card,null);
  assert.equal(hasSeparateCardSides(card),true);
  h.body.querySelector('.card-face-flip').click();
  assert.equal(h.body.querySelector('img').src,getCardImageUrl(card,1));
  assert.equal(h.body.querySelector('.card-details-oracle').textContent,card.card_faces[1].oracle_text);
  const unknown=deepFreeze({...card,layout:'unrecognized'});h.open(unknown,null);
  assert.equal(h.body.querySelector('.card-face-flip'),null);
  assert.equal(h.body.querySelectorAll('.card-details-oracle').length,2);
  const noImage=structuredClone(raw);delete noImage.image_uris;
  noImage.layout='adventure';noImage.card_faces.forEach(f=>delete f.image_uris);
  h.open(deepFreeze(safeCard(noImage)),null);
  assert.equal(h.body.querySelector('img'),null);
  assert.equal(h.body.querySelectorAll('.card-details-oracle').length,2);
});
