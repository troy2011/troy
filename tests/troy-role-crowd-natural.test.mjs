import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {previewCrowdPlan,selectCrowdVoices,readCrowdCategories,selectRoundVoice,roundOutTier} from '../public/tabletop-v65/js/kingdomTable/roleCrowdPreview.js';
const catalog=JSON.parse(readFileSync(new URL('../public/tabletop-v65/assets/tarot-kingdom-table/role-crowd-preview/catalog.json',import.meta.url)));
const categories=readCrowdCategories(catalog);
const ready=new Set([...Object.values(catalog).filter(Array.isArray).flat(),...Object.values(categories.groups).flat()]);
const play=(by,rank=1,kind='role',high)=>({type:'play',kind,by,role:{rank,tb:[14],high}});
test('natural crowd is perspective aware, deterministic, calls and finisher remain exclusive',()=>{
 const list=[play(0),play(1,3),play(2),play(0,8),play(0,1,'call'),play(2)];
 const preview=previewCrowdPlan(list,{silent:list.at(-1)});
 assert.equal(preview.get(list[0]).cue.backing,null);
 assert.equal(preview.get(list[1]).cue.offset,.068);
 assert.equal(preview.get(list[1]).cue.backing.level,.45);
 assert.equal(preview.get(list[2]).cue.backing.level,.24);
 assert.equal(preview.get(list[3]).cue.category,'large');
 assert.equal(preview.has(list[4]),false);
 assert.equal(preview.get(list[5]).cue,null);
 assert.deepEqual(preview,previewCrowdPlan(list,{silent:list.at(-1)}));
 for(const {cue} of preview.values())if(cue?.backing) assert.ok(cue.backing.offset>=.12&&cue.backing.offset<=.28);
});
test('all 15 roles have voices; adjacent repetitions select different performances',()=>{
 const roles=[1,2,3,4,5,6,7,8,9,'straight','flush','fullHouse','elemental','five','world'];
 for(const type of roles){
  const p1=play(1,typeof type==='number'?type:1,'role',typeof type==='string'?type:undefined);
  const p2={...p1}, p3=play(2,1), p4=play(0,1); let prior=[];
  for(const {cue} of previewCrowdPlan([p1,p2,p3,p4]).values()){
   const voice=selectCrowdVoices(cue,f=>ready.has(f),categories,prior);
   assert.ok(voice.primary);
   assert.ok(!prior.includes(voice.primary));
   if(cue.enemy) assert.ok(voice.backing&&!prior.includes(voice.backing));
   prior=[voice.primary,voice.backing].filter(Boolean);
  }
 }
});

test('round-out sources stay separate and vary across successive outs',()=>{
 const out=categories.groups['round-out'];
 assert.ok(out.length>=3);
 assert.ok(out.every(f=>!['small','medium','large'].some(category=>categories.groups[category].includes(f))));
 let prior=[];
 for(let i=0;i<6;i++){const f=selectRoundVoice(i,x=>ready.has(x),categories,prior);assert.ok(out.includes(f)&&!prior.includes(f));prior=[f];}
 assert.equal(selectRoundVoice(0,()=>false,categories),null);
});

test('every ranked and round-out file resolves in the shipped crowd directory',()=>{
 for(const tracks of Object.values(categories.groups)){
   assert.ok(tracks.length>=3);
   for(const file of tracks) assert.ok(existsSync(new URL('../public/tabletop-v65/assets/tarot-kingdom-table/role-crowd-preview/'+file,import.meta.url)),file);
 }
});

test('round-out uses only the settled winning han tier and falls back short',()=>{
 const values=[[undefined,'short'],[null,'short'],['10','short'],[NaN,'short'],[3,'short'],[4,'applause'],[9,'applause'],[10,'exceptional'],[21,'exceptional']];
 for(const [han,tier] of values){assert.equal(roundOutTier(han),tier);const first=selectRoundVoice(0,x=>ready.has(x),categories,[],tier);const second=selectRoundVoice(0,x=>ready.has(x),categories,[first],tier);assert.ok(categories.roundOut[tier].includes(first)&&categories.roundOut[tier].includes(second));assert.notEqual(first,second);}
 const fallback=selectRoundVoice(0,x=>categories.roundOut.short.includes(x),categories,[],'exceptional');
 assert.ok(categories.roundOut.short.includes(fallback));
});
