const {test}=require('node:test');
const assert=require('node:assert/strict');
test('Ace rejection reason matches single normal, single back and multiple; play eligibility unchanged', async()=>{
  const R=await import('../public/tabletop-v65/js/kingdomTable/rules.js');
  const deck=R.buildDeck(), c=id=>deck.find(x=>x.id===id);
  const s=R.createRound({players:3});
  const suitAce=c('coin-15'), devil=c('major-15'), otherMajor=c('major-13'), counter=c('major-'+R.aceCounterMajor(suitAce.suit));
  const field=cards=>{s.field={kind:'normal',count:cards.length,plays:[{by:1,cards}]};};
  s.players[0].hand=[devil,otherMajor,counter,c('wand-13')]; field([suitAce]);s.back=false;s.cut=false;s.lock=null;
  assert.equal(R.checkNormal(s,0,[otherMajor]).reason,'この大札では小札Aに返せません（コインは大札'+counter.num+'）。');
  assert.equal(R.checkNormal(s,0,[counter]).ok,true);
  assert.equal(R.checkNormal(s,0,[devil]).ok,false);
  s.back=true;
  assert.equal(R.checkNormal(s,0,[otherMajor]).reason,'11バック中は、この大札で小札Aに返せません。');
  assert.equal(R.checkNormal(s,0,[devil]).ok,true);
  field([suitAce,c('wand-15')]);
  assert.equal(R.checkNormal(s,0,[otherMajor,c('wand-13')]).reason,'小札Aの複数枚には大札を混ぜて返せません');
});