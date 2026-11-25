'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const { once }=require('node:events');
const { channel }=require('node:diagnostics_channel');
const { describePlayFabCatalogFailure: describe, observeHttpResponse, catalogSearchTarget, authenticationTokenTarget }=require('../server/playfabCatalogDiagnostics');
const id='11111111-2222-3333-4444-555555555555';
const fixtureSdk = url => ({PlayFab:{GetServerUrl:()=>url}});
test('SDK envelope classification redacts all raw upstream text and token-like values',()=>{
 const bad={code:503,errorCode:2,error:'Connection error',errorMessage:'Request blocked due to incorrect formatting; fake-secret',requestId:'opaque-secret'};
 assert.deepEqual(describe('SearchItems',bad,2,{httpStatus:403,requestId:id}),{stage:'SearchItems',kind:'sdk_non_json_or_transport',page:2,signal:'upstream_request_blocked',httpStatus:403,requestId:id});
 assert.deepEqual(describe('GetEntityToken',{code:401,errorCode:1234,error:'Fake'},2),{stage:'GetEntityToken',kind:'playfab_envelope',envelopeCode:401,playFabErrorCode:1234});
 assert.deepEqual(describe('password',new Error('secret')), {stage:'unknown',kind:'local_or_unknown'});
 assert.deepEqual(catalogSearchTarget(fixtureSdk('https://A123.playfabapi.com')),{host:'a123.playfabapi.com',path:'/Catalog/SearchItems'});
 assert.equal(catalogSearchTarget(fixtureSdk('https://a123.playfabapi.com.example.com')),null);
});
test('real Node HTTP observer is scoped, transparent, and unsubscribes after success and rejection',async(t)=>{
 const server=http.createServer((req,res)=>{
  req.resume();
  const denied=req.url==='/Catalog/SearchItems' && req.headers['x-fixture-denied']==='yes';
  res.writeHead(denied?403:200,{'x-ms-request-id':id,'x-fake-secret':'do-not-log'});
  res.end(denied?'Request blocked due to incorrect formatting; secret':'{"data":{"items":[]}}');
 });
 server.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>server.close());
 const host='127.0.0.1:'+server.address().port;
 const original=path=>new Promise((resolve,reject)=>{
  const req=http.request('http://'+host+path,{method:'POST',headers:{'x-fixture-denied':path.includes('SearchItems')?'yes':'no'}},res=>{
   res.resume();res.on('end',()=>res.statusCode===403?reject(new Error('unchanged original exception')):resolve(res.statusCode));
  });req.on('error',reject);req.end();
 });
 const start=channel('http.client.request.start'),finish=channel('http.client.response.finish'),initial=[start.hasSubscribers,finish.hasSubscribers];
 const target={host,path:'/Catalog/SearchItems'};
 const before=await original('/catalog-success');
 const ok={}; assert.equal(await observeHttpResponse({...target,path:'/catalog-success'},ok,()=>original('/catalog-success')),before);
 assert.deepEqual(ok,{httpStatus:200,requestId:id});
 const denied={};
 await assert.rejects(observeHttpResponse(target,denied,()=>original('/Catalog/SearchItems')),/unchanged original exception/);
 assert.deepEqual(denied,{httpStatus:403,requestId:id});
 const notOwned={}; await Promise.all([observeHttpResponse(target,notOwned,()=>original('/other-path')),assert.rejects(original('/Catalog/SearchItems'))]);
 assert.deepEqual(notOwned,{});
 assert.deepEqual([start.hasSubscribers,finish.hasSubscribers],initial);
});

test('startup catalog success still loads the cache; failure retains exit and emits fixed stage metadata',async()=>{
 const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../server.js'),'utf8');
 const start=source.indexOf('async function loadCatalogCache()');
 const end=source.indexOf('function resolveCatalogItemId',start);
 assert.ok(start>=0 && end>start);
 for(const fails of [false,true]){
  const messages=[], exits=[], calls=[];
  const context={
   PlayFab:fixtureSdk('https://A123.playfabapi.com'),
   PlayFabAuthentication:{GetEntityToken:'token'},PlayFabEconomy:{SearchItems:'search'},
   ensureTitleEntityToken:async()=>{calls.push('ensure');},
   observeHttpResponse:async(_target,info,run)=>{info.httpStatus=fails?403:200;return run();},
   promisifyPlayFab:async(api,body)=>{
    calls.push(api);
    if(api==='token')return {Entity:{Id:'fixture',Type:'title'}};
    assert.equal(body.Count,50); assert.equal(body.Entity.Id,'fixture'); assert.equal(body.ContinuationToken,undefined);
    if(fails)throw {code:503,errorCode:2,error:'Connection error',errorMessage:'Request blocked due to incorrect formatting; secret'};
    return {Items:[]};
   },
   console:{log:()=>{},warn:()=>{},error:(_label,details)=>messages.push(JSON.parse(details))},
   process:{exit:code=>exits.push(code)},describePlayFabCatalogFailure:describe,catalogSearchTarget,authenticationTokenTarget,
   catalogCache:null,catalogAliasMap:null,catalogCurrencyMap:null,
  };
  await require('node:vm').runInNewContext(source.slice(start,end)+'; loadCatalogCache()', context);
  assert.deepEqual(calls,['ensure','token','search']);
  assert.deepEqual(exits,fails?[1]:[]);
  if(fails)assert.deepEqual(messages,[{stage:'SearchItems',kind:'sdk_non_json_or_transport',page:1,signal:'upstream_request_blocked',httpStatus:403}]);
  else {assert.deepEqual(Object.keys(context.catalogCache),[]); assert.deepEqual(messages,[]);}
 }
});

test('token endpoint non-JSON response captures only safe headers for the exact observed request', async t => {
 const tokenPath='/Authentication/GetEntityToken';
 assert.deepEqual(authenticationTokenTarget(fixtureSdk('https://A123.playfabapi.com')), {host:'a123.playfabapi.com',path:tokenPath});
 assert.equal(authenticationTokenTarget(fixtureSdk('https://a123.playfabapi.com.example.com')),null);
 const server=http.createServer((req,res)=>{
  req.resume();
  res.writeHead(418,{'x-playfab-request-id':'fake-secret', 'x-ms-correlation-request-id':id, 'authorization':'fixture-secret'});
  res.end('non-JSON; secret body');
 });
 server.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>server.close());
 const host='127.0.0.1:'+server.address().port;
 const sdkError={code:503,errorCode:2,error:'Connection error',errorMessage:'non-JSON; secret body',requestId:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'};
 const run=(path,method='POST')=>new Promise((resolve,reject)=>{
  const req=http.request({host:'127.0.0.1',port:server.address().port,path,method,headers:{'x-secretkey':'fixture-request-secret'}},res=>{
   res.resume();
   res.on('end',()=>reject(sdkError));
  });
  req.on('error',reject);
  req.end();
 });
 for (const stage of ['ensureTitleEntityToken','GetEntityToken']) {
  const observed={};
  await assert.rejects(observeHttpResponse({host,path:tokenPath},observed,()=>run(tokenPath)), e=>e===sdkError);
  assert.deepEqual(describe(stage,sdkError,0,observed),{stage,kind:'sdk_non_json_or_transport',httpStatus:418,requestId:id});
  assert.deepEqual(describe(stage,sdkError,0,{}),{stage,kind:'sdk_non_json_or_transport'});
 }
 const excluded={};
 await Promise.allSettled([
  observeHttpResponse({host,path:tokenPath},excluded,()=>Promise.allSettled([run('/other'),run(tokenPath,'GET')])),
  run(tokenPath),
 ]);
 assert.deepEqual(excluded,{});
});

test('actual startup callsite and pinned SDK preserve native transport and capture both endpoint failures', async t => {
 const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm'), https=require('node:https');
 const wrapper=require('../server/playfab');
 assert.equal(require('playfab-sdk/package.json').version,'2.184.251024');
 assert.equal(wrapper.PlayFab.GetServerUrl,undefined);
 wrapper.configurePlayFab({titleId:'TEST123',secretKey:'test-only-not-a-credential'});
 assert.deepEqual(authenticationTokenTarget(wrapper.PlayFab),{host:'test123.playfabapi.com',path:'/Authentication/GetEntityToken'});
 assert.equal(authenticationTokenTarget({PlayFab:{GetServerUrl(){throw new Error('private');}}}),null);
 await assert.rejects(observeHttpResponse(null,{},()=>Promise.reject(new Error('original gate'))),/original gate/);

 let failToken=true;
 let denyAfterOneToken=false;
 const requests=[];
 const server=http.createServer((req,res)=>{
  req.resume();
  const pathname=req.url.split('?',1)[0];
  const isToken=pathname==='/Authentication/GetEntityToken';
  requests.push(pathname);
  if (isToken && (!failToken || (denyAfterOneToken && requests.length===1))) {
   res.writeHead(200,{'content-type':'application/json'});
   res.end(JSON.stringify({code:200,data:{EntityToken:'test-only-token',Entity:{Id:'fixture',Type:'title'}}}));
   return;
  }
  res.writeHead(403,{'x-ms-request-id':id,'authorization':'do-not-log'});
  res.end('Request blocked due to incorrect formatting; body-must-not-log');
 });
 server.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>server.close());
 const original=https.request;
 t.after(()=>{https.request=original;});
 https.request=(options,callback)=>{
  assert.equal(options.protocol,'https:');
  assert.equal(options.hostname.toLowerCase(),'test123.playfabapi.com');
  assert.equal(options.method,'POST');
  // Preserve the SDK's response callback and actual Node diagnostics events,
  // but only connect to loopback. Do not copy the SDK's credential headers.
  return http.request({host:'127.0.0.1',port:server.address().port,path:options.path,method:options.method,
   headers:{host:options.hostname}},callback);
 };
 const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
 const start=source.indexOf('async function loadCatalogCache()');
 const end=source.indexOf('function resolveCatalogItemId',start);
 assert.ok(start>=0 && end>start);
 for(const stage of ['ensureTitleEntityToken','SearchItems','GetEntityToken']){
  requests.length=0;
  failToken=stage!=='SearchItems';
  denyAfterOneToken=stage==='GetEntityToken';
  const messages=[], exits=[];
  await vm.runInNewContext(source.slice(start,end)+'; loadCatalogCache()',{
   ...wrapper, observeHttpResponse, catalogSearchTarget, authenticationTokenTarget, describePlayFabCatalogFailure:describe,
   console:{log(){},warn(){},error(_label,details){messages.push(JSON.parse(details));}},
   process:{exit:code=>exits.push(code)}
  });
  assert.deepEqual(exits,[1]);
  assert.deepEqual(messages,[{stage,kind:'sdk_non_json_or_transport',...(stage==='SearchItems'?{page:1}:{}),
   signal:'upstream_request_blocked',httpStatus:403,requestId:id}]);
  assert.deepEqual(requests,stage==='SearchItems'
   ? ['/Authentication/GetEntityToken','/Authentication/GetEntityToken','/Catalog/SearchItems']
   : stage==='GetEntityToken' ? ['/Authentication/GetEntityToken','/Authentication/GetEntityToken'] : ['/Authentication/GetEntityToken']);
 }
});
