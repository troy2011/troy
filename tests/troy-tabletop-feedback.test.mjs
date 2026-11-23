import assert from 'node:assert/strict';
import {test} from 'node:test';
import {updateAcquisition,updateTurns} from '../public/tabletop-v65/js/kingdomTable/tableFeedback.js';
const hand=(...ids)=>ids.map(id=>({id}));
const round=(turn,counts,phase='play')=>({turn,phase,players:counts.map(n=>({hand:Array(n)}))});
test('private gifts and devil exchanges mark only the receiving viewer hand',()=>{
  const start=updateAcquisition(null,hand('old'),0,[]);
  for(const type of ['give','devilCardTransfer']){
    const card=updateAcquisition(start,hand('old','private'),0,[{type,from:1,by:1,to:0}]);
    assert.equal(card.id,'private'); assert.equal(card.source,type);
    assert.equal(updateAcquisition(card,hand('old','private'),0,[]).id,'private');
    assert.equal(updateAcquisition(card,hand('old','private'),0,[{type:'pass',by:0}]).id,null);
    assert.equal(updateAcquisition(start,hand('old','private'),0,[{type,from:0,by:0,to:1}]).id,null);
  }
  assert.equal(updateAcquisition(start,hand('old','deck'),0,[{type:'draw',by:0}]).id,'deck');
  assert.equal(updateAcquisition(null,hand('old','private'),0,[{type:'give',by:1,to:0}]).id,null);
});
test('seats become last only once per drop; ready turn is independent of card count',()=>{
  let prev = updateTurns(null,round(1,[2,2,1]),0,[]).state;
  let cues=updateTurns(prev,round(0,[2,1,1]),0,[{type:'play',by:1}]);
  assert.deepEqual(cues.lastSeats,[1]); assert.equal(cues.ownEntered,true);
  cues=updateTurns(cues.state,round(0,[2,1,1]),0,[]);
  assert.deepEqual(cues.lastSeats,[]); assert.equal(cues.ownEntered,false);
  cues=updateTurns(null,round(0,[1,1,1]),0,[]);
  assert.deepEqual(cues.lastSeats,[]); assert.equal(cues.ownEntered,false);
  assert.equal(updateTurns(cues.state,round(0,[1,1,1]),0,[{type:'draw',by:0}]).ownEntered,false);
  assert.equal(updateTurns(cues.state,round(0,[1,1,1]),0,[{type:'play',by:0},{type:'pass',by:1}]).ownEntered,true);
  assert.equal(updateTurns(null,round(0,[7,7,7]),0,[{type:'deal'}]).ownEntered,true);
});
