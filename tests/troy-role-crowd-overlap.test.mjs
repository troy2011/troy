import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('rapid next role retains at least 145 ms of the older pending primary and cancels pending backing',()=>{
 const source=readFileSync(new URL('../public/tabletop-v65/js/kingdomTable/sfx.js',import.meta.url),'utf8')
  .replace(/^import .*;$/gm,'').replaceAll('export ','');
 const sources=[], filters=[];
 const gain=()=>({gain:{value:0,setTargetAtTime:(...args)=>filters.push(args)},connect(){},disconnect(){}});
 const ctx={currentTime:0,createGain:gain,createBiquadFilter:()=>({frequency:{},Q:{},connect(){}}),createBufferSource(){
   const n={playbackRate:{},connect(){},disconnect(){},start(at){this.startAt=at;},stop(at){this.stopAt=at;}};
   sources.push(n);return n;
 }};
 const input={ctx,gain,URL,document:{hidden:false,addEventListener(){}},selectCrowdVoices:({variant})=>({primary:variant===1?'one':'next',backing:variant===1?'far':null})};
 const setup='context=ctx; master=gain(); for(const file of ["one","next","far"]) recorded.set("preview-"+file,{duration:1});';
 const run='playPreviewCrowd({variant:1,enemy:true,backing:{offset:.22,level:.32}},.27);playPreviewCrowd({variant:2,enemy:false},.07);';
 // This raw module uses import.meta.url only for asset bases; they do not fetch in this scheduling fixture.
 vm.runInNewContext(source.replaceAll('import.meta.url','"https://example.invalid/tabletop/sfx.js"')+'\n'+setup+run,input);
 assert.equal(sources.length,3);
 assert.equal(sources[0].startAt,.27);
 assert.ok(sources[0].stopAt-sources[0].startAt>=.145);
 assert.ok(filters[0][1]-sources[0].startAt>=.145-1e-8);
 assert.equal(sources[1].stopAt,.07);
 assert.ok(sources[2].startAt<=.125+1e-8);
});
