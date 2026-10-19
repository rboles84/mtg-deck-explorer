import test from 'node:test';
import assert from 'node:assert/strict';
import {importedDiscoveryExclusions} from '../public/discovery-exclusions.mjs';

const row=(id,extra={})=>({playable:true,status:'resolved',card:{id,oracle_id:id,name:id,keywords:['Flying'],color_identity:['U'],colors:[],legalities:{commander:'legal'},...extra}});
test('exclusions use confirmed legality and identity for any imported mechanic, including both reasons',()=>{
  const deck={rows:[row('legal'),row('banned',{legalities:{commander:'banned'}}),row('off-color',{color_identity:['G']}),row('both',{legalities:{commander:'not_legal'},color_identity:['W']})]};
  assert.deepEqual(importedDiscoveryExclusions(deck,'flying',['U']).map(({card,notLegal,outsideIdentity})=>[card.id,notLegal,outsideIdentity]),[
    ['banned',true,false],['off-color',false,true],['both',true,true]
  ]);
  // A colorless card can still have colored Commander identity.
  assert.equal(importedDiscoveryExclusions({rows:[row('devoid',{keywords:['Devoid']})]},'devoid',[])[0].outsideIdentity,true);
});
test('missing metadata, unknown identity and compatible cards do not invent exclusion reasons',()=>{
  const deck={rows:[row('unknown',{legalities:undefined,color_identity:undefined}),row('invalid',{color_identity:['X']}),row('compatible')]};
  for(const identity of [['U'],undefined,null])assert.deepEqual(importedDiscoveryExclusions(deck,'flying',identity),[]);
  assert.deepEqual(importedDiscoveryExclusions(null,'flying',[]),[]);
});
test('contributor diagnostics exclude sideboards, other labels and unresolved rows, and deduplicate printings',()=>{
  const deck={rows:[row('a',{oracle_id:'same',legalities:{commander:'banned'}}),row('b',{oracle_id:'same',legalities:{commander:'banned'}}),
    {...row('side',{legalities:{commander:'banned'}}),playable:false},
    {...row('unresolved',{legalities:{commander:'banned'}}),status:'unresolved'},row('other',{keywords:['Ward'],legalities:{commander:'banned'}}),
    row('malformed',{keywords:['Flying',null],legalities:{commander:'banned'}})]};
  const found=importedDiscoveryExclusions(deck,'flying',['U']);assert.equal(found.length,1);assert.equal(found[0].card.oracle_id,'same');
});
