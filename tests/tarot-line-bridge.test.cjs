const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {createHash,createHmac}=require('node:crypto');
const {registerTarotLineBridge}=require('../server/tarotLineBridge');
const troy='https://troy-xetw.onrender.com',sites='https://tarot-kingdom-online.bar-troy2011.chatgpt.site', key='K'.repeat(43), subjectKey='S'.repeat(43), line='U'+'a'.repeat(32), state='A'.repeat(43);
async function f(t,{enable='1',secret=key}={}){
 const app=express();app.use(express.json()); const seen=[];let response=201,now=1;
 registerTarotLineBridge(app,{enable,bridgeKey:secret,subjectKey,now:()=>now,
 verifyIdentity:req=>{if(req.get('Authorization')==='Bearer T')return {playFabId:'p'};if(req.get('Authorization')==='Bearer Q')return {playFabId:'q'};throw Error('invalid');},
 resolveLinkedLineId:async id=>id==='p'?line:null,
 fetchImpl:async(u,opts)=>{seen.push([u,opts]);return new Response(null,{status:response});}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());
 const get=(path,init)=>fetch('http://127.0.0.1:'+server.address().port+'/api/tarot/'+path,init);
 const auth=(token='T',origin=troy,value=state)=>get('authorize',{method:'POST',headers:{origin,'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({state:value})});
 return {get,auth,seen,respond:x=>response=x,tick:()=>now+=60_000};
}
test('disabled unless explicitly enabled with two distinct secrets',async t=>{
 const a=await f(t,{enable:'0'}),b=await f(t,{secret:subjectKey});
 for(const p of [a,b]){assert.deepEqual(await (await p.get('availability')).json(),{enabled:false});assert.equal((await p.get('start',{redirect:'manual'})).status,404);assert.equal((await p.auth()).status,404);assert.equal(p.seen.length,0);}
});
test('public menu opens fixed Sites entry, no owner enrollment or TROY redeem route',async t=>{
 const p=await f(t);assert.deepEqual(await (await p.get('availability')).json(),{enabled:true});
 const start=await p.get('start?redirect=https://example.com',{redirect:'manual'});assert.equal(start.status,303);assert.equal(start.headers.get('location'),sites+'/auth/troy/start');
 const page=await p.get('authorize?state='+state);assert.equal(page.headers.get('cache-control'),'no-store');assert.match(page.headers.get('content-security-policy'),/form-action https:\/\/tarot-kingdom-online/);
 assert.equal((await p.get('enroll')).status,404);assert.equal((await p.get('redeem',{method:'POST'})).status,404);
});
test('only authenticated linked LINE users get an opaque handoff and only after receipt',async t=>{
 const p=await f(t);assert.equal((await p.auth('T',sites)).status,403);assert.equal((await p.auth('X')).status,401);assert.equal((await p.auth('Q')).status,403);assert.equal((await p.auth('T',troy,'short')).status,400);assert.equal(p.seen.length,0);
 const r=await p.auth(),{code}=await r.json();assert.equal(r.status,200);
 const [u,opts]=p.seen[0];assert.equal(u,sites+'/auth/troy/grants');assert.equal(opts.redirect,'error');assert.equal(opts.headers.Authorization,'Bearer '+key);
 assert.deepEqual(JSON.parse(opts.body),{state,codeHash:createHash('sha256').update(code).digest('base64url'),subject:createHmac('sha256',subjectKey).update('troy-line-v1\0'+line).digest('base64url')});
 for(const [up,down] of [[409,409],[429,429],[500,503]]){p.respond(up);const fail=await p.auth();assert.equal(fail.status,down);assert.equal((await fail.json()).code,undefined);}
});
test('bounds per-account work but resets',async t=>{
 const p=await f(t);for(let i=0;i<8;i++)assert.equal((await p.auth()).status,200);assert.equal((await p.auth()).status,429);assert.equal(p.seen.length,8);p.tick();assert.equal((await p.auth()).status,200);
});

test('Games entry starts hidden and only availability reveals it; local tabletop link remains',async()=>{
 const fs=require('node:fs'),vm=require('node:vm');
 const html=fs.readFileSync('public/index.html','utf8');
 assert.match(html,/<a id="troyLineTabletop"[^>]+hidden[^>]+href="\/api\/tarot\/start"[^>]+target="_self"/);
 assert.match(html,/<a id="tarotTabletopV65"[^>]+href="\/tarot-kingdom-table.html\?v=65"/);
 const source=fs.readFileSync('public/js/tarot-line-entry-v1.js','utf8');
 for(const enabled of [false,true]){
  const node={hidden:true,style:{removeProperty(key){assert.equal(key,'display');this.revealed=true;}}};
  await vm.runInNewContext(source,{document:{querySelectorAll:()=>[node]},fetch:async url=>{assert.equal(url,'/api/tarot/availability');return {ok:true,json:async()=>({enabled})};}});
  assert.equal(node.hidden,!enabled);assert.equal(Boolean(node.style.revealed),enabled);
 }
});
