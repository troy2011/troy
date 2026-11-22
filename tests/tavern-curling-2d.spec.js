const {test}=require('@playwright/test');
test.use({hasTouch:true});
async function swipe(page,start,end){
 const c=await page.context().newCDPSession(page), t=Date.now()/1000;
 await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start],timestamp:t});
 await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[end],timestamp:t+.075});
 await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[],timestamp:t+.085}); await c.detach();
}
const mid=b=>({x:b.x+b.width/2,y:b.y+b.height/2});
const val=(c,name)=>c.evaluate((n,s)=>parseFloat(n.style.getPropertyValue(s)),name);
async function advance(c,key,n){for(let i=0;i<n;i++)await c.press(key);}
const assert=require('node:assert/strict');
const a=assert;
const c=require('../public/js/tavern-curl-physics-v1.js');

test('Curling physics preserves mirrored aim, collision impulse, and off-board coins',()=>{
const at=(id,x,y,angle=0,seat=0)=>({id,x,y,angle,seat});
const result=(s,id)=>s.result.find(x=>x.id===id);
const launch=at('new', 8, 30);
let a=c.shot([], launch,42), b=c.shot([], at('new',92,30,Math.PI,1),42);
assert.equal(c.distance(a.result[0]),0);
assert.equal(c.distance(b.result[0]),0);
assert.ok(Math.abs(a.result[0].x+b.result[0].x-100)<0.001);
a=c.shot([at('old',50,30)],launch,50);
assert.ok(result(a,'old').x>58); assert.ok(result(a,'new').x<50);
assert.equal(a.contacts.length,2);
b=c.shot([at('old',50,30)],at('new',8,30,.45),45);
assert.equal(b.contacts.length,0);assert.equal(result(b,'old').x,50);assert.ok(result(b,'new').y>48);
a=c.shot([at('edge',92,30,0,1)],at('new',52,30),75);
assert.equal(result(a,'edge').out,true);
assert.equal(result(a,'new').out,false);
a=c.shot([at('first',50,30),at('second',57,30,0,1)],launch,75);
assert.ok(result(a,'second').x>65); assert.ok(a.contacts.includes('second'));
assert.deepEqual(c.project(.4,.3,'landscape'),{x:40,y:18});
assert.deepEqual(c.project(.4,.3,'portrait-table'),{x:30,y:24});
assert.deepEqual(c.project(.4,.3,'portrait-counter'),{x:30,y:36});
assert.deepEqual(c.shot([],launch,42),c.shot([],launch,42));


});
for(const [w,h,layout] of [[320,640,'table'],[390,844,'table'],[390,844,'counter'],[844,390,'counter']]){

 test('Curling angled touch, collision, and recalculated score '+layout+' '+w, async({page})=>{
   await page.setViewportSize({width:w,height:h});
   await page.emulateMedia({reducedMotion:'reduce'});
   page.setDefaultTimeout(4000);
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('/tavern-minigames.html');
   await page.locator('input[value='+layout+']').check();await page.locator('[data-game=curling]').tap();await page.locator('#start').tap();
   const A=page.locator('.extra.a'),B=page.locator('.extra.b');
   const coin=s=>s.locator('.curl-coin:enabled'), board=await A.locator('.curl-lane').boundingBox();
   const position=await coin(A).boundingBox(); a.ok(position.width>=44 && position.height>=44,JSON.stringify(position));
   a.equal(await page.locator('.curl-target:visible').count(),1);
   const point=mid(position);
   const portrait=w<h, axis=portrait?'y':'x', cross=portrait?'x':'y';
   const step=(from,forward,side)=>({...from,[axis]:from[axis]+forward*(portrait?board.height:board.width),
                                     [cross]:from[cross]+side*(portrait?board.width:board.height)});
   await swipe(page,point,step(point,-.03,0));a.equal(await coin(A).count(),1);
   await coin(A).tap();a.equal(await coin(A).count(),1);a.equal(await A.locator('.curl-landing').count(),0);
   await swipe(page,point,step(point,.085,.077));
   await coin(B).waitFor();
   const first=A.locator('.curl-landing[data-shot="0-0"]'); await first.waitFor();
   const lateral=await val(first,'--curl-world-y');
   a.ok((layout==='counter'&&portrait) ? lateral<49 : lateral>51,JSON.stringify({w,h,layout,lateral}));
   const p2=mid(await coin(B).boundingBox());a.ok(p2[axis]>point[axis]+30);
   await swipe(page,p2,step(p2,-.085,-.077));
   await coin(A).waitFor();
   const second=A.locator('.curl-landing[data-shot="1-0"]');await second.waitFor();
   const lateral2=await val(second,'--curl-world-y');
   a.ok((layout==='counter'&&portrait) ? lateral2>51 : lateral2<49,JSON.stringify({w,h,layout,lateral2}));
   // Fresh round deliberately launches directly along the centre so 2P must move 1P.
   await page.reload();await page.locator('input[value='+layout+']').check();await page.locator('[data-game=curling]').tap();await page.locator('#start').tap();
   await advance(coin(A),'ArrowRight',15);await coin(A).press('Enter');await coin(B).waitFor();
   const old=A.locator('.curl-landing[data-shot="0-0"]'), prev=await val(old,'--curl-world-x');
   await advance(coin(B),'ArrowRight',19);await coin(B).press('Enter');await coin(A).waitFor();
   a.ok(await val(old,'--curl-world-x') < prev-2, '2P must dislodge 1P');
   const positions=async()=>A.locator('.curl-landing').evaluateAll(xs=>xs.map(e=>({seat:Number(e.dataset.owner),x:parseFloat(e.style.getPropertyValue('--curl-world-x')),y:parseFloat(e.style.getPropertyValue('--curl-world-y'))})));
   for(let i=0;i<2;i++)for(const s of [A,B]){
     await coin(s).waitFor();
     await advance(coin(s),i?'ArrowUp':'ArrowDown',i?5:3);
     await coin(s).press('Enter');
   }
   await page.waitForFunction(()=>document.querySelector('.extra.a').dataset.result);
   const best=[Infinity,Infinity];
   for(const p of await positions())best[p.seat]=Math.min(best[p.seat],Math.round(Math.hypot(p.x-50,(p.y-50)*(portrait?board.width/board.height:board.height/board.width))*10));
   const outcome=best[0]===best[1]?'tie':best[0]<best[1]?'win':'lose';
   a.equal(await A.getAttribute('data-result'),outcome);
   a.match(await A.locator('small').textContent(),/3\/3/);a.match(await B.locator('small').textContent(),/3\/3/);
   a.equal(await page.locator('.curl-target:visible').count(),1);a.deepEqual(errors,[]);


 });
}
