const { test }=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {createHmac,createHash}=require('node:crypto');
const { registerTarotLineBridge }=require('../server/tarotLineBridge');

const TROY='https://troy-xetw.onrender.com';
const SITES='https://tarot-kingdom-online.bar-troy2011.chatgpt.site';
const a='A'.repeat(43), b='B'.repeat(43), line='U'+'a'.repeat(32);
const bridgeKey='K'.repeat(43), subjectKey='S'.repeat(43);
function fixture({configured=true,enrolling=false,overlap=false}={}) {
  let time=Date.parse('2030-01-01T00:00:00Z');
  const calls={};
  const app=express(); app.use(express.json());
  registerTarotLineBridge(app,{
    bridgeKey:enrolling&&!overlap?null:bridgeKey,subjectKey, now:()=>time,
    ownerSubject: configured ? createHmac('sha256',subjectKey).update('troy-line-v1\0'+line).digest('base64url') : null,
    enrollmentHash:enrolling?createHash('sha256').update('E'.repeat(43)).digest('hex'):null,
    pilotUntil:enrolling?'2030-01-01T23:00:00Z':'2030-01-01T00:05:00Z',
    verifyIdentity:req=>{
      const auth=req.get('authorization');
      if(auth==='Bearer linked')return {playFabId:'P'};
      if(auth==='Bearer otherLinked')return {playFabId:'R'};
      if(auth==='Bearer unlinked')return {playFabId:'Q'};
      throw Error('fixture bad Firebase token');
    },
    resolveLinkedLineId:async id=>{calls.resolve=(calls.resolve||0)+1;return id==='P'?line:id==='R'?'U'+'b'.repeat(32):null;}
  });
  const server=app.listen(0,'127.0.0.1');
  return {server,calls,tick:ms=>time+=ms, ready:new Promise(r=>server.once('listening',r))};
}
test('valid origin and Firebase/LINE gate, fixed callback, no sensitive data in grant, atomic consume, stable alias',async t=>{
  const f=fixture();await f.ready;t.after(()=>f.server.close());
  const origin='http://127.0.0.1:'+f.server.address().port;
  const post=(path, body, headers)=>fetch(origin+'/api/tarot/'+path,{
    method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)
  });
  const auth=(state, token='linked', via=TROY)=>post('authorize',{state,subject:'untrusted'},{origin:via,authorization:'Bearer '+token});
  const redeem=(state,code,key=bridgeKey)=>post('redeem',{state,code},{authorization:'Bearer '+key});
  for(const endpoint of ['availability','start']) assert.equal((await fetch(origin+'/api/tarot/'+endpoint,{redirect:'manual'})).status,404);
  const page=await fetch(origin+'/api/tarot/authorize?state='+a);
  assert.equal(page.status,200);
  assert.equal(page.headers.get('cache-control'),'no-store');
  assert.equal(page.headers.get('referrer-policy'),'strict-origin');
  assert.match(page.headers.get('content-security-policy'),/form-action https:\/\/tarot-kingdom-online\.bar-troy2011\.chatgpt\.site\/auth\/troy\/callback/);
  assert.ok(!(await page.text()).includes(a));
  assert.equal((await auth(a,'linked','https://example.com')).status,403);
  assert.equal((await auth(a,'unsigned')).status,401);
  assert.equal((await auth(a,'unlinked')).status,403);
  assert.equal((await auth('invalid')).status,400);
  assert.equal((await auth(a,'otherLinked')).status,403);
  const handoff=await auth(a);
  assert.equal(handoff.status,200);
  assert.equal(handoff.headers.get('cache-control'),'no-store');
  const {code}=await handoff.json();
  assert.match(code,/^[A-Za-z0-9_-]{43}$/);
  assert.equal((await auth(a)).status,409);
  assert.equal((await redeem(b,code)).status,400);
  assert.equal((await redeem(a,code,'bad')).status,401);
  assert.equal((await redeem(a,'C'.repeat(43))).status,400);
  const attempts=await Promise.all([redeem(a,code),redeem(a,code)]);
  assert.deepEqual(attempts.map(r=>r.status).sort(),[200,400]);
  const data=await attempts.find(r=>r.ok).json();
  assert.deepEqual(Object.keys(data),['subject']);assert.match(data.subject,/^[A-Za-z0-9_-]{43}$/);
  assert.equal((await auth(a)).status,409);
  const issued2=await (await auth(b)).json();
  assert.notEqual(issued2.code,code);
  assert.deepEqual(await (await redeem(b,issued2.code)).json(),data);
  const state3='C'.repeat(43), issued3=await (await auth(state3)).json();
  f.tick(90_000);
  assert.equal((await redeem(state3,issued3.code)).status,400);
});
test('fails closed when disabled; no DB calls',async t=>{
  const f=fixture({configured:false});await f.ready;t.after(()=>f.server.close());
  const r=await fetch('http://127.0.0.1:'+f.server.address().port+'/api/tarot/authorize?state='+a);
  assert.equal(r.status,404);assert.deepEqual(f.calls,{});
  const origin='http://127.0.0.1:'+f.server.address().port;
  assert.equal((await fetch(origin+'/api/tarot/availability')).status,404);
  const start=await fetch(origin+'/api/tarot/start',{redirect:'manual'});
  assert.equal(start.status,404);
  assert.equal(start.headers.get('location'),null);
});

test('bounds pending grants and automatically closes expired pilot',async t=>{
  const f=fixture();await f.ready;t.after(()=>f.server.close());
  const origin='http://127.0.0.1:'+f.server.address().port+'/api/tarot/authorize';
  let i=0; const issue=()=>fetch(origin,{method:'POST',headers:{origin:TROY,authorization:'Bearer linked','content-type':'application/json'},body:JSON.stringify({state:String(i++).padStart(43,'A')})});
  for(let j=0;j<24;j++) assert.equal((await issue()).status,200);
  assert.equal((await issue()).status,429);
  f.tick(90_000);assert.equal((await issue()).status,200);
  f.tick(210_000);const before=f.calls.resolve;assert.equal((await issue()).status,404);assert.equal(f.calls.resolve,before);
});

test('enrollment is identification only, owner account bound, and expires',async t=>{
  const f=fixture({configured:false,enrolling:true});await f.ready;t.after(()=>f.server.close());
  const path='http://127.0.0.1:'+f.server.address().port+'/api/tarot/';
  const enroll=(invitation,principal='linked',origin=TROY)=>fetch(path+'enroll',{method:'POST',headers:{origin,authorization:'Bearer '+principal,'content-type':'application/json'},body:JSON.stringify({invitation})});
  const page=await fetch(path+'enroll');assert.equal(page.status,200);assert.match(await page.text(),/type="password"/);
  assert.equal((await enroll('F'.repeat(43))).status,403);assert.equal((await enroll('E'.repeat(43),'linked',SITES)).status,403);
  assert.equal((await enroll('E'.repeat(43),'unlinked')).status,403);assert.equal((await enroll('E'.repeat(43),'unsigned')).status,401);
  const r=await enroll('E'.repeat(43));assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
  assert.deepEqual(await r.json(),{subject:createHmac('sha256',subjectKey).update('troy-line-v1\0'+line).digest('base64url')});
  assert.equal((await enroll('E'.repeat(43),'otherLinked')).status,403);
  assert.equal((await fetch(path+'authorize?state='+a)).status,404);
  assert.equal((await fetch(path+'redeem',{method:'POST'})).status,404);
  f.tick(23*60*60_000);assert.equal((await enroll('E'.repeat(43))).status,404);
});
test('overlapping activation and enrollment variables fail closed',async t=>{
  const f=fixture({enrolling:true,overlap:true});await f.ready;t.after(()=>f.server.close());
  const path='http://127.0.0.1:'+f.server.address().port+'/api/tarot/';
  assert.equal((await fetch(path+'enroll')).status,404);assert.equal((await fetch(path+'authorize?state='+a)).status,404);assert.deepEqual(f.calls,{});
});
