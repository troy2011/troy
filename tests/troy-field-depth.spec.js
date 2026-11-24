const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const root='public/tabletop-v65/js/kingdomTable/';
test.use({deviceScaleFactor:3});
const fixture=String.raw`
window.fieldDepthFixture=kind=>{
 clearTimeout(timer); timer=0;
 Fx.cancelAll(); cancelRulePropAnimations($('ktRuleProps'));
 const all=Rules.buildDeck(), card=id=>all.find(c=>c.id===id),r=match.round;
 const cut=kind==='cut';
 const ids=cut?['coin-8']:['wand-5','cup-6','sword-7','coin-8','wand-9'];
 const held=[...ids,'cup-4','sword-10','coin-4'];
 r.players[ME].hand=held.map(card);
 Object.assign(r,{phase:'play',turn:ME,dealer:ME,last:2,back:cut,lock:cut?'coin':null,cut:false,direction:1,passed:[],drew:false,
  field:cut?{kind:'normal',count:1,plays:[{by:2,cards:[card('coin-13')]}]}:{kind:null,count:0,plays:[]}});
 match.pot=60; match.chips.fill(980); seenEvents=r.events.length;
 if(!Rules.play(r,ME,ids,cut?'normal':'role').ok)throw Error('illegal '+kind+' fixture');
 render();
};
`;
const dims=page=>page.evaluate(()=>{
 const bounds=node=>{const b=node.getBoundingClientRect();return [b.x,b.y,b.width,b.height,b.bottom];};
 return {scroll:document.scrollingElement.scrollHeight,width:document.scrollingElement.scrollWidth,
   field:bounds(document.querySelector('#ktRuleProps')),actions:bounds(document.querySelector('#ktActions')),
   buttons:[...document.querySelectorAll('#ktActions button')].map(bounds)};
});
for(const [width,height] of [[320,568],[390,844]])test('projected field preserves depth, five rank corners and controls at '+width,async({page})=>{
 await page.setViewportSize({width,height});
 await page.emulateMedia({reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/ui.js?v=table-host-v1',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(root+'ui.js','utf8')+fixture}));
 await page.goto('/tarot-kingdom-table.html?fast');
 await page.getByRole('button',{name:'CPU練習'}).click();
 await page.locator('input[name=ktSeats][value="3"]').check();
 await page.locator('#ktStart').click();
 await expect(page.locator('#ktTable')).toBeVisible();
 await page.evaluate(()=>window.fieldDepthFixture('cut'));
 const projected=page.locator('#ktFieldCards');
 const upper=projected.locator('.kt-field-top');
 await expect(upper.locator('[data-card="coin-8"]')).toBeVisible();
 await expect(page.locator('#ktRuleProps [data-cut-contact]')).toHaveCount(1);
 const contact=await page.locator('#ktRuleProps [data-cut-contact]').evaluate(knife=>{
   const k=knife.getBoundingClientRect(), c=document.querySelector('.kt-field-top .kt-card').getBoundingClientRect();
   return [Math.abs(k.left+k.width*.40-(c.left+c.width*.53)),Math.abs(k.top+k.height*.87-(c.top+c.height*.85))];
 });
 expect(contact.every(d=>d<1)).toBe(true);
 const compression=await projected.evaluate(n=>{
   const style=getComputedStyle(n), matrix=new DOMMatrix(style.transform);
   const [,originY]=style.transformOrigin.split(' ').map(parseFloat);
   const card=n.querySelector('.kt-field-top .kt-card');
   const x=card.offsetWidth, y=(n.offsetHeight-card.offsetHeight)/2-originY;
   const top=new DOMPoint(x,y,0,1).matrixTransform(matrix);
   const bottom=new DOMPoint(x,y+card.offsetHeight,0,1).matrixTransform(matrix);
   const depth=Math.abs(bottom.y/bottom.w-top.y/top.w)/((x/top.w+x/bottom.w)/2);
   return {taper:bottom.w/top.w,depth};
 });
 expect(compression.taper).toBeGreaterThan(.79);
 expect(compression.taper).toBeLessThan(.84);
 expect(compression.depth).toBeGreaterThan(.9);
 expect(compression.depth).toBeLessThan(1.05);
 console.log('field projection',width,compression);
 expect(await page.locator('#ktHand').evaluate(n=>getComputedStyle(n).transform)).toBe('none');
 const nominal=await upper.locator('.kt-card').evaluate(n=>n.offsetWidth);
 const projection=async name=>{
   if(process.env.TROY_DEPTH_CAPTURE && width===320) {
     await page.evaluate(async()=>{await document.fonts.ready;await Promise.allSettled([...document.images].filter(n=>n.getClientRects().length).map(n=>n.decode()));});
     await page.screenshot({path:process.env.TEMP+'/TROY-reference-depth-'+name+'-DPR3.png'});
   }
 };
 await projection('single');
 const single=await dims(page);
 await page.evaluate(()=>window.fieldDepthFixture('five'));
 await expect(upper).toHaveAttribute('data-field-fan','true');
 const cards=upper.locator('.kt-card');
 await expect(cards).toHaveCount(5);
 await expect(upper.locator('.kt-field-role-suit svg')).toHaveCount(0);
 expect(await cards.evaluateAll(nodes=>nodes.every(n=>n.offsetWidth===nodes[0].offsetWidth) && nodes[0].offsetWidth>0)).toBe(true);
 expect(await cards.first().evaluate(n=>n.offsetWidth)).toBe(nominal);
 const ranks=await cards.evaluateAll(nodes=>nodes.map((node,i)=>{
   const rank=node.querySelector('.kt-card-rank').getBoundingClientRect();
   const x=rank.left+rank.width/2,y=rank.top+rank.height/2;
   const card=node.getBoundingClientRect(),next=nodes[i+1]?.getBoundingClientRect();
   return {covers:document.elementFromPoint(x,y)?.closest('.kt-card')===node,overlap:next?card.right-next.left:1,angle:getComputedStyle(node).rotate};
 }));
 expect(ranks.every(r=>r.covers && r.overlap>0)).toBe(true);
 expect(new Set(ranks.map(v=>v.angle)).size).toBe(5);
 const before=await dims(page);
 expect(before.scroll).toBe(height);
 expect(before.width).toBe(width);
 expect(before.actions).toEqual(single.actions);
 expect(before.buttons.every(([x,y,w,h,b])=>x>=0&&x+w<=width&&b<=height-11)).toBe(true);
 await projection('five');
 await cards.nth(2).click({position:{x:12,y:15}});
 await expect(page.locator('#ktZoom')).toBeVisible();
 await page.locator('#ktZoom').click();
 await expect(page.locator('#ktZoom')).toBeHidden();
 expect(await dims(page)).toEqual(before);
 expect(errors).toEqual([]);
});
