const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { installBaseAppMocks } = require('./helpers/main-app-harness');
const UID = 'PF_PLAYWRIGHT';
const authModule = `
const listeners = new Set();
const makeUser = uid => uid ? { uid, getIdToken: async () => 'test-token' } : null;
const auth = { currentUser: makeUser('PF_PLAYWRIGHT') };
export const getAuth = () => auth;
export function onAuthStateChanged(_auth, callback) { listeners.add(callback); queueMicrotask(() => { if (listeners.has(callback)) callback(auth.currentUser); }); return () => listeners.delete(callback); }
export function setTestUser(uid) { auth.currentUser = makeUser(uid); for (const callback of [...listeners]) callback(auth.currentUser); }
export async function signInWithCustomToken() { setTestUser('PF_PLAYWRIGHT'); return { user: auth.currentUser }; }
`;
function gate() { let release; return { wait: new Promise(r => { release = r; }), release: () => release() }; }
test.beforeEach(async ({page,context}) => {
 await context.routeWebSocket('**/*', s=>s.close());
 await context.route('**/*', r=>{ const q=r.request(),u=new URL(q.url()); if(u.origin==='http://127.0.0.1:4187'&&!u.pathname.startsWith('/api/')&&q.method()==='GET') return r.continue(); return r.fulfill({status:501,json:{error:'blocked'}}); });
 await installBaseAppMocks(page, {});
 await page.route('**/firebase-auth.js',r=>r.fulfill({contentType:'application/javascript',body:authModule}));
});
test('stale shared inventory is rejected for both original and overlapping callers',async({page})=>{
 let requests=0;const delayed=gate();
 await page.route('**/api/get-inventory',async r=>{requests++; if(requests===1)return r.fulfill({json:{inventory:[],virtualCurrency:{PS:10}}}); await delayed.wait; return r.fulfill({json:{inventory:[{itemId:'stale'}],virtualCurrency:{PS:10}}});});
 await page.goto('/');await expect(page.locator('#currentPoints')).toHaveText('10');
 await page.evaluate(uid=>{window.__first=import('./js/playfabClient.js?v=20261029-startup-v1').then(m=>m.getInventory(uid,{isSilent:true}));},UID);
 await expect.poll(()=>requests).toBe(2);
 await page.evaluate(uid=>{const session=window.capturePlayerSession(uid);window.syncAuthenticatedPoints(uid,20,session);window.__second=import('./js/playfabClient.js?v=20261029-startup-v1').then(m=>m.getInventory(uid,{isSilent:true}));},UID);
 expect(await page.evaluate(()=>window.__second)).toBeNull();delayed.release();expect(await page.evaluate(()=>window.__first)).toBeNull();expect(requests).toBe(2);
});
test('unknown resources block shop, building and ship without purchases or extra reads',async({page})=>{
 const source=fs.readFileSync(path.join(__dirname,'../public/js/island.js'),'utf8')+'\nexport { loadShopPanels, loadBuildingList, confirmFixedResourceSpend };';
 await page.route('**/js/island.js*',r=>r.fulfill({contentType:'application/javascript',body:source}));
 let reads=0, writes=0, failing=false;
 await page.route('**/api/get-inventory',r=>{reads++;return failing?r.fulfill({status:503,json:{error:'offline'}}):r.fulfill({json:{inventory:[],virtualCurrency:{PS:10}}});});
 await page.route('**/api/get-ship-asset',r=>r.fulfill({json:{success:true,shipData:{Level:1,ShipType:'fixture'}}}));
 await page.route('**/api/get-shop-state',r=>r.fulfill({json:{pricing:{buyMultiplier:0.7,sellMultiplier:1.2,itemPrices:{}}}}));
 await page.route('**/api/get-buildings-by-category',r=>r.fulfill({json:{buildings:[]}}));
 await page.route(/\/api\/(create-ship|upgrade-ship|start-building-construction|sell-to-shop|buy-from-shop)/,r=>{writes++;return r.fulfill({json:{success:true}})});
 await page.goto('/'); await expect(page.locator('#currentPoints')).toHaveText('10'); failing=true;
 const out=await page.evaluate(async uid=>{const island=await import('./js/island.js');const ship=await import('./js/ship.js?v=20260828-exploration-retreat-v1');let building=document.querySelector('#buildingList');if(!building){building=document.createElement('div');building.id='buildingList';document.body.append(building);}const el=document.createElement('div');el.innerHTML='<div id="shopSellList"></div><div id="shopBuyList"></div>';document.body.append(el);await island.loadShopPanels(el,{id:'fixture'}, {},uid);await island.loadBuildingList('all',{size:'small',buildings:[]});const fixed=await island.confirmFixedResourceSpend({costs:[{code:'PS',amount:1}]});const balances=await ship.getShipResourceBalances(uid);const created=await ship.createShip(uid,'fixture',{resourceBalances:null});const upgraded=await ship.upgradeShip(uid,'fixture');return {sell:el.querySelector('#shopSellList').textContent,buy:el.querySelector('#shopBuyList').textContent,building:document.querySelector('#buildingList').textContent,fixed,balances,created,upgraded};},UID);
 expect(out.sell).toContain('確認できません');expect(out.buy).toContain('確認できません');expect(out.building).toContain('確認できません');expect(out.fixed).toBe(false);expect(out.balances).toBeNull();expect(out.created).toBeNull();expect(out.upgraded).toBeNull();expect(writes).toBe(0);expect(reads).toBe(6);
 failing=false;await page.unroute('**/api/get-inventory');await page.route('**/api/get-inventory',r=>r.fulfill({json:{inventory:[],virtualCurrency:{}}}));const empty=await page.evaluate(async uid=>{const c=await import('./js/playfabClient.js?v=20261029-startup-v1');const s=await import('./js/ship.js?v=20260828-exploration-retreat-v1');return [await c.getInventory(uid,{isSilent:true}),await s.getShipResourceBalances(uid)];},UID);expect(empty[0].inventory).toEqual([]);expect(empty[1]).toEqual({});
});
test('out-of-order transfer notices invalidate the display without trusting values or fetching again',async({page})=>{
 const helper=fs.readFileSync(path.join(__dirname,'helpers/main-app-harness.js'),'utf8');let module=helper.match(/const FIREBASE_FIRESTORE_MOCK_MODULE = `([\s\S]*?)`;/)[1];
 module=module.replace(/export function onSnapshot\(_target, next, error\) \{[\s\S]*?\n\}/,`window.__noticeListeners=[];
export function onSnapshot(target,next,error) { if(target.path?.startsWith('notifications/')) window.__noticeListeners.push(next); queueMicrotask(()=>{try{next(emptyQuerySnapshot())}catch(e){error?.(e)}}); return ()=>{}; }`);
 await page.route('**/firebase-firestore.js',r=>r.fulfill({contentType:'application/javascript',body:module}));
 const main=fs.readFileSync(path.join(__dirname,'../public/main.js'),'utf8')+'\nwindow.__testSubscribeTransfer = subscribeTransferNotifications;';
 await page.route('**/main.js*',r=>r.fulfill({contentType:'application/javascript',body:main}));
 let reads=0;const delayed=gate();await page.route('**/api/get-inventory',async r=>{reads++;if(reads>1)await delayed.wait;return r.fulfill({json:{inventory:[],virtualCurrency:{PS:432}}})});
 await page.goto('/');await expect(page.locator('#currentPoints')).toHaveText('432');await page.evaluate(uid=>window.__testSubscribeTransfer(uid),UID);await expect.poll(()=>page.evaluate(()=>window.__noticeListeners?.length||0)).toBeGreaterThan(0);await page.waitForTimeout(30);
 await page.evaluate(uid=>{let s=window.capturePlayerSession(uid);window.syncAuthenticatedPoints(uid,999,s);window.__noticeRead=import('player').then(m=>m.getPoints(uid,{isSilent:true}));},UID);await expect.poll(()=>reads).toBe(2);
 await page.evaluate(uid=>{const emit=(id,balanceAfter)=>window.__noticeListeners[0]({docs:[],docChanges:()=>[{type:'added',doc:{id,data:()=>({amount:1,currency:'PS',balanceAfter})}}]});emit('new',1000);emit('old',2);emit('missing',null);},UID);delayed.release();expect(await page.evaluate(()=>window.__noticeRead)).toBeNull();
 await expect(page.locator('#homePointsStatus')).toHaveText('要再読込');await expect(page.locator('#currentPoints')).toHaveText('999');await page.waitForTimeout(200);expect(reads).toBe(2);
 await page.evaluate(async()=>{const auth=await import('firebase/auth');auth.setTestUser(null);window.__noticeListeners[0]({docs:[],docChanges:()=>[{type:'added',doc:{id:'late',data:()=>({amount:1,balanceAfter:3})}}]});});await expect(page.locator('#appWrapper')).toBeHidden();expect(await page.locator('#currentPoints').textContent()).toBe('?');expect(reads).toBe(2);
});


test('companion page distinguishes failed stats from level one and recovers on a successful refresh',async({page})=>{
 const source=fs.readFileSync(path.join(__dirname,'../public/js/companions.js'),'utf8')+'\nexport { loadCompanionPage };';
 await page.route('**/js/companions.js*',r=>r.fulfill({contentType:'application/javascript',body:source}));
 let fail=false;await page.route('**/api/get-stats',r=>fail?r.fulfill({status:503,json:{error:'offline'}}):r.fulfill({json:{stats:{Level:4,HP:80,MaxHP:80}}}));
 await page.goto('/');await expect(page.locator('#currentPoints')).not.toHaveText('?');fail=true;
 await page.evaluate(async uid=>{const m=await import('./js/companions.js?v=20260604d');await m.loadCompanionPage(uid);},UID);
 await expect(page.locator('#companionPageMessage')).toHaveText('状態を確認できません。再読み込みしてください。');
 expect(await page.locator('.companion-page').evaluate(el=>el.classList.contains('is-status-unavailable'))).toBe(true);
 expect(await page.locator('#crewQuickPanel').evaluate(el=>getComputedStyle(el).display)).toBe('none');
 fail=false;await page.evaluate(async uid=>{const m=await import('./js/companions.js?v=20260604d');await m.loadCompanionPage(uid);},UID);
 await expect(page.locator('#companionPageMessage')).toHaveText('');expect(await page.locator('.companion-page').evaluate(el=>el.classList.contains('is-status-unavailable'))).toBe(false);
});


test('older companion detail responses cannot replace a newer completed load',async({page})=>{
 const source=fs.readFileSync(path.join(__dirname,'../public/js/companions.js'),'utf8')+'\nexport { loadCompanionPage };';
 await page.route('**/js/companions.js*',r=>r.fulfill({contentType:'application/javascript',body:source}));
 const delayed=gate();let enable=false,infos=0,members=0;
 await page.route('**/api/get-stats',r=>r.fulfill({json:{stats:{Level:4,HP:80,MaxHP:80}}}));
 await page.route('**/api/get-guild-info',r=>{if(!enable)return r.fulfill({json:{guild:null}});infos++;return r.fulfill({json:{guild:infos===1?{guildId:'old',isOwner:false,role:'member',guildName:'OLD'}:null}})});
 await page.route('**/api/get-guild-members',async r=>{members++;await delayed.wait;return r.fulfill({json:{members:[{name:'OLD MEMBER'}]}})});
 await page.goto('/');await expect(page.locator('#currentPoints')).not.toHaveText('?');enable=true;
 await page.evaluate(uid=>{window.__oldCrew=import('./js/companions.js?v=20260604d').then(m=>m.loadCompanionPage(uid));},UID);
 await expect.poll(()=>members).toBe(1);expect(await page.locator('.companion-page').evaluate(el=>el.classList.contains('is-status-unavailable'))).toBe(true);
 await page.evaluate(uid=>{window.__newCrew=import('./js/companions.js?v=20260604d').then(m=>m.loadCompanionPage(uid));},UID);await page.evaluate(()=>window.__newCrew);
 const before=await page.locator('#crewQuickTitle').textContent();expect(await page.locator('.companion-page').evaluate(el=>el.classList.contains('is-status-unavailable'))).toBe(false);
 delayed.release();await page.evaluate(()=>window.__oldCrew);expect(await page.locator('#crewQuickTitle').textContent()).toBe(before);expect(await page.locator('#crewQuickTitle').textContent()).not.toContain('OLD');
});


test('delayed LINE and QR libraries still load before login and QR creation',async({page})=>{
 const helper=fs.readFileSync(path.join(__dirname,'helpers/main-app-harness.js'),'utf8');const extract=n=>helper.match(new RegExp('const '+n+' = `([\\s\\S]*?)`;'))[1];
 const line=gate(),qr=gate();let lineSeen=0,qrSeen=0,logins=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://static.line-scdn.net/liff/edge/2/sdk.js',async r=>{lineSeen++;await line.wait;return r.fulfill({contentType:'application/javascript',body:extract('LIFF_MOCK_SCRIPT')})});
 await page.route('https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js',async r=>{qrSeen++;await qr.wait;return r.fulfill({contentType:'application/javascript',body:extract('QRIOUS_MOCK_SCRIPT')})});
 await page.route('**/api/login-playfab',r=>{logins++;return r.fallback()});
 await page.goto('/',{waitUntil:'commit'});await expect.poll(()=>lineSeen).toBe(1);expect(logins).toBe(0);line.release();await expect.poll(()=>qrSeen).toBe(1);expect(logins).toBe(0);qr.release();
 await expect(page.locator('#appWrapper')).toBeVisible();expect(logins).toBe(1);expect(await page.locator('#myQrCanvas').evaluate(el=>el.width)).toBe(150);expect(await page.evaluate(()=>typeof window.liff==='object'&&typeof window.QRious==='function')).toBe(true);expect(errors).toEqual([]);
});

test('failed LINE library gives login recovery without authenticating',async({page})=>{
 let logins=0;await page.route('https://static.line-scdn.net/liff/edge/2/sdk.js',r=>r.fulfill({status:503,body:''}));await page.route('**/api/login-playfab',r=>{logins++;return r.fallback()});await page.goto('/');await expect(page.locator('#profileSessionNotice')).toBeVisible();await expect(page.locator('#appWrapper')).toBeHidden();expect(logins).toBe(0);
});
