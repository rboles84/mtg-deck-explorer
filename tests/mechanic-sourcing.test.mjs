import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import vocabulary from '../public/mechanics-vocabulary.mjs';
import {SHORTLIST_LABELS} from '../public/mechanic-supplement.mjs';
import {VARIANT_LABELS,VARIANT_EXPLANATIONS} from '../public/mechanic-variants.mjs';
import {ADDITIONAL_RULE_LINKS,ADDITIONAL_EXPLANATIONS,ADDITIONAL_RULE_CLAUSES} from '../public/mechanic-reference-supplement.mjs';
import {MECHANIC_EXPLANATIONS} from '../public/mechanic-explanations.mjs';
import {MECHANIC_RULE_LINKS,RULES_REVISION,mechanicRule,mechanicExplanation,mechanicSourceStatus} from '../public/mechanic-rules.mjs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const rules=JSON.parse(read('public/rules-data.json'));
const proof=JSON.parse(read('reports/mechanic-sourcing/remaining-labels-verification.json'));
const hash=s=>createHash('sha256').update(s).digest('hex');
const canonical=value=>JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))));

test('the remaining-label pass covers exactly the 181 previous gaps; later additions and the scoped Jump correction are separate',()=>{
  const priorRules=Object.fromEntries(Object.entries(MECHANIC_RULE_LINKS).filter(([k])=>!Object.hasOwn(ADDITIONAL_RULE_LINKS,k)));
  const priorExplanations=Object.fromEntries(Object.entries(MECHANIC_EXPLANATIONS).filter(([k])=>!Object.hasOwn(ADDITIONAL_EXPLANATIONS,k)&&!Object.hasOwn(VARIANT_EXPLANATIONS,k)));
  // Reconstruct only the deliberately superseded Jump entry for the historical
  // receipt hash. Its new identity gate is checked in mechanic-variants.test.mjs.
  const {kind,...jumpSource}=priorExplanations.jump.source;
  priorExplanations.jump={title:'Jump',rules:['207.2d'],generalReference:true,verification:'verified',source:jumpSource};
  assert.equal(Object.keys(priorRules).length,103);assert.equal(Object.keys(priorExplanations).length,45);
  assert.equal(hash(canonical(priorRules)),proof.previousMappings.directSha256);
  assert.equal(hash(canonical(priorExplanations)),proof.previousMappings.explanationSha256);
  const gaps=vocabulary.labels.filter(l=>!Object.hasOwn(priorRules,l.key)&&!Object.hasOwn(priorExplanations,l.key)).map(l=>l.key).sort();
  assert.equal(gaps.length,181);
  const additions=[...Object.keys(ADDITIONAL_RULE_LINKS),...Object.keys(ADDITIONAL_EXPLANATIONS)].sort();
  assert.deepEqual(additions,gaps);
  assert.deepEqual(proof.rows.map(r=>r.label).sort(),gaps);
  assert.equal(new Set(proof.rows.map(r=>r.label)).size,181);
  const known=new Set([...vocabulary.labels,...SHORTLIST_LABELS,...VARIANT_LABELS].map(l=>l.key));known.add('eternity gate');
  assert.equal(known.size,349);
  for(const key of known)assert.ok(mechanicRule(rules,key)||mechanicExplanation(rules,key,MECHANIC_EXPLANATIONS[key]?.cardOracleIds),key);
  for(const key of [...Object.keys(MECHANIC_RULE_LINKS),...Object.keys(MECHANIC_EXPLANATIONS)])assert.ok(known.has(key),key);
});

test('new numbered-rule references match the pinned official source and retain their exact clauses',()=>{
  const raw=read('evidence/MagicCompRules-20260925.txt');
  assert.equal(hash(raw),RULES_REVISION.sourceSha256);
  assert.deepEqual(proof.rulesRevision,RULES_REVISION);
  let sections=0,clauseReferences=0;
  for(const receipt of proof.rows.filter(r=>r.verification.startsWith('official-rule-'))){
    assert.equal(receipt.status,'verified');assert.equal(receipt.url,RULES_REVISION.sourceUrl);
    assert.equal(receipt.sourceSha256,hash(raw));
    assert.equal(rules.rules[receipt.number].text.toLowerCase(),receipt.label);
    if(receipt.verification==='official-rule-section'){
      sections++;
      assert.equal(hash(JSON.stringify(rules.sections[receipt.number])),receipt.sectionSha256);
      assert.equal(mechanicRule(rules,receipt.label),receipt.number);
      for(const changed of [null,{...rules,date:'changed'},{...rules,sourceSha256:'changed'},
        {...rules,sourceUrl:'https://example.com/rules'},
        {...rules,sections:{...rules.sections,[receipt.number]:{title:'Wrong',paragraphs:[{}]}}},
        {...rules,sections:{...rules.sections,[receipt.number]:{title:receipt.title,paragraphs:[]}}}]){
        assert.equal(mechanicRule(changed,receipt.label),null);
      }
    }else{
      clauseReferences++;
      assert.equal(mechanicRule(rules,receipt.label),null,'Punctuation headings use clauses without changing extraction');
      const e=mechanicExplanation(rules,receipt.label);
      assert.deepEqual(e.rules,receipt.clauses.map(c=>c.number));
      for(const c of receipt.clauses){
        assert.equal(ADDITIONAL_RULE_CLAUSES[c.number],rules.rules[c.number].text);
        assert.equal(hash(rules.rules[c.number].text),c.textSha256);
        assert.equal(mechanicExplanation({...rules,rules:{...rules.rules,[c.number]:{text:'Changed'}}},receipt.label),null);
      }
    }
  }
  assert.equal(sections,131);assert.equal(clauseReferences,2);
});

test('every added article or card reference has official-source evidence and no authored summary or quote',()=>{
  let articles=0,cards=0;
  for(const [label,e] of Object.entries(ADDITIONAL_EXPLANATIONS)){
    assert.equal(Object.hasOwn(e,'summary'),false);assert.equal(Object.hasOwn(e,'quote'),false);
    assert.equal(mechanicSourceStatus(label),'verified');
    assert.equal(mechanicExplanation(null,label),null);
    const receipt=proof.rows.find(r=>r.label===label);assert.ok(receipt);
    assert.equal(receipt.title,e.title);assert.equal(receipt.status,e.verification);
    if(!e.source)continue;
    assert.equal(new URL(e.source.url).protocol,'https:');
    assert.equal(new URL(e.source.url).hostname,'magic.wizards.com');
    assert.equal(e.source.url,receipt.url);assert.equal(e.source.section,receipt.section);
    assert.equal(e.source.title,receipt.sourceTitle);assert.equal(e.source.verifiedOn,proof.verifiedOn);
    assert.match(receipt.sourceSha256,/^[a-f0-9]{64}$/);assert.match(receipt.matchedBlockSha256,/^[a-f0-9]{64}$/);
    if(e.source.kind==='card-example'){
      cards++;
      assert.equal(receipt.verification,'official-card-example');
      assert.equal(receipt.cardName,e.source.section);
      assert.equal(receipt.matchMethod,'named-card-and-label-in-same-paragraph');
    }else{
      articles++;
      assert.equal(e.source.kind,'article');assert.equal(receipt.verification,'official-article-reference');
    }
    if(['parade!','underdog'].includes(label)){
      assert.deepEqual(e.rules,[]);assert.equal(e.referenceKind,'card-example');
      assert.equal(receipt.backgroundRule,undefined,'No invented CR classification for these card labels');
    }else{
      assert.deepEqual(e.rules,['207.2c']);assert.equal(e.referenceKind,'ability-word');
      assert.equal(receipt.backgroundRule,'207.2c');
    }
  }
  assert.equal(articles,41);assert.equal(cards,7);
  assert.deepEqual(proof.summary,{labels:181,ruleSections:131,ruleClauses:2,articleReferences:41,cardExamples:7,unverified:0});
  for(const label of ['Future mechanic','For Mirrodin','Start Your Engines','Goad 2','__proto__']){
    assert.equal(mechanicRule(rules,label),null);assert.equal(mechanicExplanation(rules,label),null);assert.equal(mechanicSourceStatus(label),null);
  }
});
