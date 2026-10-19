import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {loadCatalog,validateAtlas,LEGACY_IDS} from '../lib/catalog.mjs';
import {validateRegistry,recipeExpression,queryHash} from '../lib/mechanic-discovery.mjs';
import {buildQuery} from '../lib/scryfall.mjs';
import {createDeckServer} from '../server.mjs';
import {addClipboard,exportClipboard} from '../public/clipboard.mjs';
import vocabulary from '../public/mechanics-vocabulary.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const baseline=read('inputs/atlas_v2.0.json'),atlas=read('inputs/atlas_v2.1.json'),registry=read('inputs/mechanic-discovery.v1.json');
const ledger=read('reports/mechanic-discovery/coverage-ledger.json'),proof=read('reports/mechanic-discovery/live-recipes.json');
const catalog=await loadCatalog(root);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

test('Atlas 2.1 preserves every existing ID, untouched non-discovery rows, all Do-not-emit rows, and the historical census',()=>{
  assert.deepEqual(validateAtlas(atlas),atlas.tier_counts);
  assert.deepEqual(atlas.validity_census,baseline.validity_census);
  assert.equal(atlas.provenance.baselineSha256,hash(fs.readFileSync(new URL('../inputs/atlas_v2.0.json',import.meta.url))));
  const changed=new Set(ledger.rows.map(r=>r.atlasRowId));
  for(const old of baseline.rows){
    const row=atlas.rows.find(r=>r.id===old.id);assert.ok(row,old.id);
    if(!changed.has(old.id)||old.tier==='Do-not-emit')assert.deepEqual(row,old);
  }
  const index=atlas.rows.filter(r=>r.section==='Keyword_Index');
  assert.deepEqual(index,[...index].sort((a,b)=>a.label.toLowerCase().localeCompare(b.label.toLowerCase(),'en')||a.id.localeCompare(b.id,'en')));
  for(const mutate of [a=>a.rows[0].extra=true,a=>a.rows[0].live_count='3',a=>a.rows[0].id=a.rows[1].id,a=>a.tier_counts.Review++,a=>a.rows.find(r=>r.tier==='Review').auto_execute=true]){
    const bad=structuredClone(atlas);mutate(bad);assert.throws(()=>validateAtlas(bad));
  }
});

test('296 display mappings and 312 distinct candidate dispositions are exact, executable where intended, and evidence backed',()=>{
  assert.equal(registry.records.length,296);assert.equal(ledger.rows.length,312);assert.equal(new Set(ledger.rows.map(r=>r.label)).size,312);
  assert.deepEqual(ledger.baseline.display,{'exact-review':106,'exact-production':127,missing:57,'alternate-name':3,'broader-only':2,'do-not-emit':1});
  assert.equal(ledger.missingFromBaseline.candidates.length,59);
  assert.deepEqual(registry.records.map(r=>r.key).sort(),vocabulary.labels.map(l=>l.key).sort());
  assert.equal(validateRegistry(registry,atlas,vocabulary),registry);
  assert.equal(catalog.historicalRecords.length,8);
  for(const record of catalog.records){
    assert.ok(!record.atlas.parameters.length);assert.doesNotMatch(record.atlas.query,/\[[A-Z_ ]+\]/);
    assert.equal(record.atlas.fallback,null);assert.equal(record.atlas.fallback_count,null);
    assert.ok(['Review','Production-ready'].includes(record.atlas.tier));
    assert.equal(record.discovery.execution,'manual');assert.ok(record.discovery.coverage.length);
  }
  assert.ok(catalog.records.some(r=>r.atlas.tier==='Review'));
  assert.equal(catalog.records.find(r=>r.master_name==='Underdog').atlas_row_id,'keyword-index-underdog-reported');
  for(const term of ['Escape','Eternalize'])assert.equal(catalog.records.find(r=>r.master_name===term).atlas.query,`kw:${term}`);
  for(const term of ['Descend 4','Descend 8','Gear up','Visit','Gotcha!'])assert.equal(ledger.rows.find(r=>r.label===term).disposition,'validated-candidate-only');
  for(const change of [r=>r.records.pop(),r=>r.records[0].key='fuzzy label',r=>r.records[0].atlasRowId='keyword-index-underdog',r=>r.records[0].querySha256='wrong',r=>r.records[0].validation.status='unverified',r=>r.records[0].expression='kw:Flying OR f:vintage']){
    const bad=structuredClone(registry);change(bad);assert.throws(()=>validateRegistry(bad,atlas,vocabulary));
  }
});

test('retained live receipts prove positive and negative membership, native metadata samples and real dates/counts',()=>{
  assert.equal(proof.recipes.length,312);assert.equal(proof.passed,312);
  for(const item of ledger.rows){
    const p=proof.recipes.find(p=>p.label===item.label),row=atlas.rows.find(r=>r.id===item.atlasRowId);
    assert.ok(p?.pass,item.label);assert.equal(p.query,row.query);assert.equal(row.live_count,p.count);
    assert.equal(row.validated,p.requests[0].completedAt.slice(0,10));
    assert.ok(p.assertions.some(a=>a.expected));assert.ok(p.assertions.some(a=>!a.expected));
    for(const a of p.assertions)assert.equal(a.actual,a.expected,`${item.label}: ${a.name}`);
    const responses=p.requests.map(receipt=>{
      const bytes=fs.readFileSync(new URL('../reports/mechanic-discovery/'+receipt.file,import.meta.url));
      assert.equal(hash(bytes),receipt.sha256);assert.equal(bytes.length,receipt.bytes);assert.equal(receipt.status,200);
      return JSON.parse(bytes);
    });
    assert.equal(p.oracleIdentityChecked,true);assert.equal(responses[0].total_cards,p.count);
    assert.equal(new URL(p.requests[0].url).searchParams.get('q'),`(${row.query}) include:extras`);
    const identities=new Set(responses[1].data.map(c=>c.oracle_id));
    for(const a of p.assertions)assert.equal(identities.has(a.oracleId),a.expected,`${item.label}: ${a.name} / ${a.oracleId}`);
    if(item.display)for(const card of responses[0].data)assert.ok(card.keywords.some(k=>k.toLowerCase()===item.mapping.key),`${item.label}: ${card.name}`);
  }
});

test('every mapping composes one commander baseline for all 32 identity subsets',()=>{
  const letters=['W','U','B','R','G'];
  for(let mask=0;mask<32;mask++){
    const colors=letters.filter((_,i)=>mask&(1<<i)),binding=colors.join('').toLowerCase()||'c';
    for(const record of catalog.records){
      const query=buildQuery(catalog,record.atlas_row_id,[...colors].reverse());
      assert.equal(query,`(f:commander id<=${binding}) (${record.discovery.expression})`);
      assert.equal(query.match(/f:commander/g).length,1);assert.equal(query.match(/id<=/g).length,1);
    }
  }
});

test('all mapping IDs preserve exact-printing Clipboard provenance and export',()=>{
  const card={object:'card',id:'00000000-0000-4000-8000-000000000001',name:'Exact Result',set:'tst',collector_number:'007a',lang:'en',color_identity:[],keywords:['Surveil'],legalities:{commander:'legal'}};
  for(const record of catalog.records){
    const saved=addClipboard([],card,record.atlas_row_id);
    assert.equal(saved[0].id,card.id);assert.equal(saved[0].collectorNumber,'007a');assert.equal(saved[0].queryId,record.atlas_row_id);
    assert.equal(exportClipboard(saved),'1 Exact Result (TST) 007a');
    assert.equal(exportClipboard(addClipboard(saved,card,record.atlas_row_id)),'2 Exact Result (TST) 007a');
  }
});

test('retained supplemental live evidence verifies exact witness existence and 21 Commander context cases',()=>{
  const context=read('reports/mechanic-discovery/live-context.json'),plan=read('reports/mechanic-discovery/witness-plan.json');
  assert.equal(context.pass,true);assert.equal(context.cases.length,21);assert.equal(context.witnesses.length,plan.witnesses.length);
  const cards=new Map();
  for(const receipt of context.requests){
    const bytes=fs.readFileSync(new URL('../reports/mechanic-discovery/'+receipt.file,import.meta.url));
    assert.equal(hash(bytes),receipt.sha256);assert.equal(bytes.length,receipt.bytes);
    assert.ok([200,404].includes(receipt.status));if(receipt.status===404)assert.equal(JSON.parse(bytes).code,'not_found');
    if(new URL(receipt.url).pathname==='/cards/collection')for(const c of JSON.parse(bytes).data)cards.set(c.id,c);
  }
  for(const witness of context.witnesses){
    const c=cards.get(witness.printingId);assert.ok(c);assert.equal(c.oracle_id,witness.oracleId);assert.equal(c.name,witness.name);
    if(witness.metadataChecked)assert.equal(c.keywords.some(k=>k.toLowerCase()===witness.label.toLowerCase()),witness.expected);
  }
  for(const c of context.cases){
    assert.equal(c.pass,true);
    if(c.result)for(const card of c.result.cards){assert.equal(card.legalities.commander,'legal');assert.ok(card.color_identity.every(color=>c.identity.includes(color)));}
    else{if(c.positive)assert.ok(c.found.includes(c.positive));assert.ok(!c.found.includes(c.negative));}
  }
  for(const label of ['Underdog','Devoid'])assert.equal(context.cases.find(c=>c.label===label).result.totalCards,0);
});

test('embedded baselines and OR branches compose safely; unknown filters, placeholders, tiers and drift fail closed',()=>{
  const original=catalog.records.find(r=>r.master_name==='Flying');
  const alternative=structuredClone(original);
  alternative.atlas.query='f:commander id<=[COLORS] (kw:Flying OR kw:Reach)';alternative.atlas.parameters=['[COLORS]'];
  alternative.discovery.querySha256=queryHash(alternative.atlas.query);alternative.discovery.validation.query=alternative.atlas.query;
  alternative.discovery.expression='(kw:Flying OR kw:Reach)';
  assert.equal(buildQuery({...catalog,records:[alternative]},alternative.atlas_row_id,['G']),'(f:commander id<=g) ((kw:Flying OR kw:Reach))');
  for(const query of ['f:vintage kw:Flying','kw:Flying OR id<=r','f:commander id=[COLORS] kw:Flying','(f:commander id<=[COLORS] kw:Flying) OR kw:Reach','f:commander id<=[COLORS] kw:Flying -f:commander'])assert.throws(()=>recipeExpression({...alternative.atlas,query}));
  for(const tier of ['Do-not-emit','Semantic']){
    const bad=structuredClone(original);bad.atlas.tier=tier;bad.atlas.auto_execute=false;
    assert.throws(()=>buildQuery({...catalog,records:[bad]},bad.atlas_row_id,[]),/whitelist/);
  }
  for(const id of ['keyword-index-underdog','keyword-index-set-in-motion','keyword-index-future','Flying','__proto__','kw:Flying OR id<=r'])assert.throws(()=>buildQuery(catalog,id,[]));
  for(const id of LEGACY_IDS)assert.match(buildQuery(catalog,id,['W']),/^\(f:commander id<=w\) \(kw:[A-Za-z]+\)$/);
});

test('HTTP accepts all approved recipes without prefetch and rejects arbitrary queries, unknown labels and malformed bodies',async t=>{
  const id='00000000-0000-4000-8000-000000000001';let searches=0;
  const card={object:'card',id,name:'Fixture Commander',set:'tst',collector_number:'1',lang:'en',color_identity:[],keywords:[],legalities:{commander:'legal'}};
  const server=await createDeckServer({minimumGap:0,fetchImpl:async raw=>{
    const u=new URL(raw);
    if(u.pathname==='/cards/collection')return Response.json({object:'list',data:[card],not_found:[]});
    searches++;assert.match(u.searchParams.get('q'),/^\(f:commander id<=c\) \(.+\) prefer:newest$/);
    return Response.json({object:'error',code:'not_found',details:'No cards'}, {status:404});
  }});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const post=(route,body)=>fetch(base+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await fetch(base+'/api/catalog')).status,200);assert.equal(searches,0);
  const resolved=await(await post('/api/resolve',{identifiers:[{id}]})).json();assert.equal(searches,0);
  const payload={contextToken:resolved.contextToken,commanderIds:[id],atlasRowId:'keyword-index-flying',page:1};
  for(const record of catalog.records){
    const response=await post('/api/discover',{...payload,atlasRowId:record.atlas_row_id});assert.equal(response.status,200,record.master_name);
    const body=await response.json();assert.deepEqual(body.cards,[]);assert.equal(body.totalCards,0);assert.equal(body.hasMore,false);
    assert.equal(body.queryProvenance.atlasVersion,'2.1');assert.equal(body.queryProvenance.tier,record.atlas.tier);
  }
  assert.equal(searches,374);
  const count=searches;
  for(const body of [null,[],{},'query', {...payload,query:'kw:Flying'}, {...payload,identity:['R']}, {...payload,url:'https://evil.test'}, {...payload,atlasRowId:'keyword-index-underdog'}, {...payload,atlasRowId:'keyword-index-visit'}, {...payload,atlasRowId:'unknown'}, {...payload,page:0}, {...payload,page:'2'}, {...payload,commanderIds:[id,id]}, {...payload,commanderIds:[]}, {...payload,contextToken:'bad'}])assert.equal((await post('/api/discover',body)).status,400);
  assert.equal(searches,count);
});
