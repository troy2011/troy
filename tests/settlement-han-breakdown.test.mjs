import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CHIP_RULES as rules, settlementHanBreakdown, formatHanEntry} from '../public/tabletop-v65/js/kingdomTable/match.js';
import {roleName} from '../public/tabletop-v65/js/kingdomTable/rules.js';

test('settlement groups earned roles without counting unawarded or opposing plays',()=>{
 const role={rank:1,tb:[9]}, other={rank:3,tb:[7]};
 const match={rules,round:{dealer:0,han:[8,3,0],justiceHan:[1,0,0],majorClearHan:[1,0,0],devilTransferHan:[-1,1,0],events:[
  {type:'han',by:0,role,add:2},{type:'han',by:0,role,add:2},{type:'han',by:0,role:other,add:3},
  {type:'play',kind:'role',by:0,role},{type:'han',by:1,role:other,add:3}]}};
 const rows=settlementHanBreakdown(match,{winner:0,winnerHan:11,lastCardHan:1});
 assert.equal(rows.reduce((sum,v)=>sum+v.han,0),11);
 assert.deepEqual(rows.map(formatHanEntry),[roleName(role)+' ×2 4翻',roleName(other)+' 3翻','正義執行 1翻','大札流し 1翻','切札 1翻','上がり 1翻','悪魔 −1翻','親 1翻']);
});
test('opening wins are a single named role plus the dealer bonus, including legacy totals',()=>{
 const match={rules,round:{dealer:0,openingWin:'even',han:[0,0,0],events:[]}};
 assert.deepEqual(settlementHanBreakdown(match,{winner:0,winnerHan:6}).map(formatHanEntry),['ピース・オブ・エイト（偶数揃い） 5翻','親 1翻']);
 assert.deepEqual(settlementHanBreakdown(match,{winner:null}),[]);
});
