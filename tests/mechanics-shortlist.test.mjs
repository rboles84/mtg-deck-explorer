import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {indexMechanics} from '../public/mechanics.mjs';
import {mechanicRule,mechanicExplanation,mechanicSourceStatus} from '../public/mechanic-rules.mjs';
import {MECHANIC_EXPLANATIONS,DEVOID_SEARCH_REFERENCE} from '../public/mechanic-explanations.mjs';
import {ADDITIONAL_EXPLANATIONS} from '../public/mechanic-reference-supplement.mjs';
import {VARIANT_EXPLANATIONS} from '../public/mechanic-variants.mjs';
import {EXPLANATORY_RULES} from '../public/mechanic-rule-clauses.mjs';
import {SHORTLIST_LABELS,SHORTLIST_REVIEW} from '../public/mechanic-supplement.mjs';
import {loadCatalog,validateShortlistRegistry} from '../lib/catalog.mjs';
import {queryHash} from '../lib/mechanic-discovery.mjs';
import {safeCard} from '../lib/scryfall.mjs';

const bytes=p=>fs.readFileSync(new URL('../'+p,import.meta.url));
const read=p=>JSON.parse(bytes(p));
const hash=b=>createHash('sha256').update(b).digest('hex');
const fixture=read('tests/fixtures/mechanics/commander-shortlist.json');
const rules=read('public/rules-data.json');
const supplement=read('inputs/mechanic-discovery.shortlist.json');
const atlas=read('inputs/atlas_v2.1.json');
const catalog=await loadCatalog(fileURLToPath(new URL('..',import.meta.url)));
const deck={rows:fixture.cards.map(({card},i)=>({id:`row-${i}`,lineNumber:i+1,playable:true,quantity:1,status:'resolved',card:safeCard(card)}))};

test('retained pack fixtures cover all 142 labels with reviewed explanations and deliberate search dispositions',()=>{
  assert.equal(hash(bytes('tests/fixtures/mechanics/commander-shortlist.json')),SHORTLIST_REVIEW.evidenceSha256);
  const indexed=indexMechanics(deck);
  assert.equal(indexed.terms.length,142);
  assert.deepEqual(indexed.terms.map(t=>t.label).sort(),fixture.expectedLabels);
  assert.equal(indexed.terms.filter(t=>!t.audited).length,32);
  assert.equal(indexed.terms.filter(t=>!t.reviewed).length,0);
  for(const term of indexed.terms){
    assert.ok(mechanicRule(rules,term.label)||mechanicExplanation(rules,term.label,term.cards.map(c=>c.oracleId)),term.label);
    assert.equal(term.relationship,'provider_reports');
    const record=catalog.records.find(r=>r.discovery.key===term.key);
    if(term.category==='flavor word'){
      assert.equal(record,undefined);assert.equal(term.classification.discovery,'card-specific');
      assert.deepEqual(mechanicExplanation(rules,term.label).rules,['207.2d']);
    }else if(term.key==='jump'){
      assert.equal(record,undefined);assert.equal(term.classification.discovery,'card-specific');
    }else assert.ok(record,term.label);
  }
  assert.equal(indexed.terms.filter(t=>t.category==='flavor word').length,15);
  assert.equal(catalog.records.length,332+42);
});

test('all explanatory mappings fail closed on a changed revision, changed clause, or unknown label',()=>{
  assert.equal(Object.keys(MECHANIC_EXPLANATIONS).length,115);
  for(const [label,expected] of Object.entries(MECHANIC_EXPLANATIONS)){
    assert.equal(mechanicExplanation(rules,label,expected.cardOracleIds),expected);
    assert.equal(mechanicExplanation({...rules,date:'changed'},label),null);
    assert.equal(mechanicExplanation({...rules,sourceSha256:'changed'},label),null);
    assert.equal(mechanicExplanation({...rules,sourceUrl:'https://example.com/rules'},label),null);
    for(const n of expected.rules){
      const changed={...rules,rules:{...rules.rules,[n]:{text:'Different clause'}}};
      assert.equal(mechanicExplanation(changed,label),null,`${label}: ${n}`);
    }
  }
  for(const label of ['Prepared 2','Partner With X','treasure!',' landfall','__proto__','constructor','Future mechanic','kw:Flying OR id<=r']){
    assert.equal(mechanicExplanation(rules,label),null);assert.equal(mechanicRule(rules,label),null);
  }
});

test('the original shortlist references retain their pinned official clauses and verified excerpts',()=>{
  assert.equal(DEVOID_SEARCH_REFERENCE.sourceUrl,rules.sourceUrl);
  for(const excerpt of DEVOID_SEARCH_REFERENCE.excerpts)assert.ok(rules.rules[excerpt.number].text.includes(excerpt.text),excerpt.number);
  const proof=read('reports/mechanic-sourcing/verification.json');
  const allowed=new Set([...fixture.expectedLabels.map(s=>s.toLowerCase()),'eternity gate']);
  const quotedWords=new Map();
  for(const [label,e] of Object.entries(MECHANIC_EXPLANATIONS)){
    if(Object.hasOwn(ADDITIONAL_EXPLANATIONS,label)||Object.hasOwn(VARIANT_EXPLANATIONS,label))continue; // Independently checked by their sourcing tests.
    assert.ok(allowed.has(label),label);
    assert.equal(Object.hasOwn(e,'summary'),false,label);
    assert.ok(['verified','unverified'].includes(e.verification),label);
    for(const n of e.rules)assert.equal(EXPLANATORY_RULES[n],rules.rules[n].text,`${label}: ${n}`);
    if(e.source){
      const receipt=proof.rows.find(r=>r.label===label);
      assert.ok(receipt?.matched,label);
      assert.equal(receipt.url,e.source.url);
      assert.equal(receipt.section,e.source.section);
      assert.equal(e.source.verifiedOn,proof.verifiedOn);
      assert.ok(['magic.wizards.com','gatherer.wizards.com'].includes(new URL(e.source.url).hostname));
      assert.equal(new URL(e.source.url).protocol,'https:');
      assert.match(receipt.sourceSha256,/^[a-f0-9]{64}$/);
      if(e.quote){
        assert.equal(receipt.verification,'exact-excerpt');
        assert.equal(hash(e.quote),receipt.quoteSha256,label);
        quotedWords.set(e.source.url,(quotedWords.get(e.source.url)||0)+e.quote.split(/\s+/).length);
      }else if(new URL(e.source.url).hostname==='gatherer.wizards.com'){
        assert.equal(receipt.verification,'gatherer-card-text-and-official-image');
        assert.equal(receipt.cardName,e.source.section);
        assert.equal(receipt.labelMarkup,`<i>${e.title}</i>`);
        assert.equal(receipt.imageVisuallyVerified,true);
        assert.ok(['media.wizards.com','gatherer-static.wizards.com'].includes(new URL(receipt.imageUrl).hostname));
        assert.ok(['magic.wizards.com','gatherer.wizards.com'].includes(new URL(receipt.imagePageUrl).hostname));
        assert.equal(new URL(receipt.imageUrl).protocol,'https:');
        assert.equal(new URL(receipt.imagePageUrl).protocol,'https:');
        assert.ok(receipt.imagePrinting);
      }else assert.equal(receipt.verification,'card-label-in-same-paragraph');
    }else assert.equal(e.quote,undefined,label);
  }
  assert.equal(proof.rows.length,32);
  assert.equal(new Set(proof.rows.map(r=>r.label)).size,32);
  assert.equal(proof.rows.filter(r=>r.verification==='gatherer-card-text-and-official-image').length,9);
  assert.equal(quotedWords.size,15);
  for(const [url,words] of quotedWords)assert.ok(words<=25,url);
});

test('the nine cleared labels require their named Gatherer card evidence, independent of the general rule',()=>{
  const pending=Object.entries(MECHANIC_EXPLANATIONS).filter(([,e])=>e.verification==='unverified');
  assert.deepEqual(pending,[]);
  const cards={
    'buy information':'Black Market Connections','hire a mercenary':'Black Market Connections','sell contraband':'Black Market Connections',
    'death ray':'Ghastly Death Tyrant','disintegration ray':'Ghastly Death Tyrant',
    'mold earth':'Deep Gnome Terramancer','mark of chaos ascendant':'Abaddon the Despoiler',
    'web support':'Guy in the Chair','eternity gate':'Necron Monolith',
  };
  for(const [label,card] of Object.entries(cards)){
    const e=MECHANIC_EXPLANATIONS[label];
    assert.equal(e.generalReference,true,label);
    assert.deepEqual(e.rules,['207.2d']);
    assert.equal(e.source.section,card);
    assert.equal(new URL(e.source.url).hostname,'gatherer.wizards.com');
    assert.equal(e.quote,undefined);
    assert.equal(mechanicSourceStatus(label),'verified');
    assert.equal(mechanicExplanation(null,label),null);
  }
  for(const label of ['Future label','Eternity Gate 2','__proto__',null])assert.equal(mechanicSourceStatus(label),null);
});

test('variants keep their specific rules rather than collapsing into a broader family',()=>{
  for(const [label,number] of [['Partner with','702.124j'],['Choose a background','702.124k'],['Megamorph','702.37b'],['Hexproof from','702.11d'],['Forestwalk','702.14c'],['Islandwalk','702.14c'],['Typecycling','702.29e'],['Landcycling','702.29e'],['Plainscycling','702.29e'],['Prepared','722.3a'],['Role token','303.7a']]){
    assert.ok(mechanicExplanation(rules,label).rules.includes(number),label);
  }
  assert.equal(mechanicRule(rules,'Partner'),'702.124');
  assert.match(mechanicExplanation(rules,'Corrupted').quote,/three or more poison/);
  assert.match(mechanicExplanation(rules,'Vivid').quote,/colors among permanents/);
});

test('supplement retains exact provider classification without reclassifying the historical audit or inferring from text',()=>{
  assert.equal(SHORTLIST_LABELS.length,32);
  const unknown=structuredClone(deck.rows[0]);unknown.card.keywords=['Future label','Treasure!',' treasure'];unknown.card.oracle_text='Landfall — Create a Treasure token.';
  for(const term of indexMechanics({rows:[unknown]}).terms){assert.equal(term.audited,false);assert.equal(term.reviewed,false);assert.equal(term.classification,null);}
  for(const label of SHORTLIST_LABELS){
    const row=structuredClone(unknown);row.card.keywords=[label.term.toUpperCase()];
    const term=indexMechanics({rows:[row]}).terms[0];
    assert.equal(term.audited,false);assert.equal(term.reviewed,true);assert.equal(term.category,label.category);
  }
});

test('all 16 new searches have retained live positive and negative Oracle-ID evidence',()=>{
  const proof=read('reports/mechanic-discovery/commander-shortlist/membership.json');
  assert.equal(proof.length,16);
  for(const row of supplement.rows){
    const p=proof.find(p=>p.label===row.label),mapping=supplement.records.find(m=>m.label===row.label);
    assert.equal(p.pass,true);assert.equal(p.status,200);assert.equal(p.hasMore,false);
    assert.equal(p.query,row.query);assert.equal(mapping.querySha256,queryHash(row.query));
    const raw=bytes('reports/mechanic-discovery/commander-shortlist/'+p.file);
    assert.equal(hash(raw),p.sha256);
    const data=JSON.parse(raw),found=new Set(data.data.map(c=>c.oracle_id));
    assert.ok(p.positive.length);assert.ok(p.negative.length);
    for(const w of p.positive)assert.ok(found.has(w.oracleId),`${row.label}: ${w.name}`);
    for(const w of p.negative)assert.ok(!found.has(w.oracleId),`${row.label}: ${w.name}`);
    for(const card of data.data)assert.ok(card.keywords.some(k=>k.toLowerCase()===mapping.key),`${row.label}: ${card.name}`);
    assert.equal(new URL(p.url).hostname,'api.scryfall.com');
    assert.ok(new URL(p.url).searchParams.get('q').startsWith(`(${row.query}) (`));
  }
});

test('supplement cannot authorize unknown names, broad expressions, duplicate IDs or unvalidated searches',()=>{
  assert.equal(validateShortlistRegistry(supplement,atlas),supplement);
  const mutations=[s=>s.records.pop(),s=>s.rows.pop(),s=>s.records[0].key='new-label',s=>s.records[0].validation.status='pending',s=>s.records[0].validation.positive=[],s=>s.auditSha256='wrong',s=>s.rows[0].id=atlas.rows[0].id,
    s=>{s.rows[0].query='o:double';const m=s.records[0];m.expression=s.rows[0].query;m.querySha256=queryHash(m.expression);m.validation.query=m.expression;},
    s=>{s.records[0].label='Buy Information';s.records[0].key='buy information';},
  ];
  for(const mutate of mutations){const changed=structuredClone(supplement);mutate(changed);assert.throws(()=>validateShortlistRegistry(changed,atlas));}
});
