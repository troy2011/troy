const {test,expect}=require('@playwright/test');
test.use({deviceScaleFactor:3});
for (const seats of [3,4]) test('minimal TROY match controls at 320 / '+seats+' seats',async({page})=>{
 await page.setViewportSize({width:320,height:568});
 await page.emulateMedia({reducedMotion:'reduce'});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/tarot-kingdom-table.html#practice');
 await page.locator('input[name=ktSeats][value="'+seats+'"]').check();
 await page.locator('#ktStart').click();
 const table=page.locator('#ktTable'),bar=table.locator('.kt-bar'),settings=page.locator('#ktSettingsDialog');
 const open=()=>page.locator('#ktSettings').click();
 await expect(table).toBeVisible();
 if (seats===3) {
   const owners=await page.evaluate(()=>{
     const blocks=['.kt-table','.kt-bar','.kt-felt','.kt-seat-panel','.kt-field-cards','.kt-me','.kt-hand','.kt-message-wrap','.kt-grave-button'];
     const ordinary=[...document.styleSheets].flatMap(sheet=>[...sheet.cssRules].map(rule=>[rule.selectorText,sheet.href]));
     return Object.fromEntries(blocks.map(block=>[block,ordinary.filter(([selector])=>selector===block).map(([,href])=>new URL(href).pathname.split('/').at(-1))]));
   });
   expect(Object.values(owners).every(list=>list.length===1&&list[0]==='tarot-common-board.css')).toBe(true);
   const quiet=await page.locator('.kt-field-top .kt-card,.kt-fan-card').evaluateAll(nodes=>nodes.length>0&&nodes.every(node=>getComputedStyle(node).animationName==='none'));
   expect(quiet).toBe(true);
 }
 await expect(bar.locator('button')).toHaveCount(1);
 await expect(bar.locator('#ktDeck')).toHaveText(/^\d+$/);
 await expect(bar.locator('#ktDeck')).toHaveAttribute('aria-label',/\d/);
 await expect(table.locator('.kt-brand,.kt-session-controls,#ktSound')).toHaveCount(0);
 await expect(table.locator('#ktOnlinePlayStatus')).toBeHidden();
 await expect(table.locator('#ktGrave')).toHaveCount(1);
 await expect(table.locator('.kt-hand-header #ktGrave')).toBeVisible();
 await expect(table.locator('#ktPot')).toBeVisible();
 expect(await page.evaluate(()=>[document.scrollingElement.scrollWidth,document.scrollingElement.scrollHeight])).toEqual([320,568]);
 const actionsBefore=await table.locator('#ktActions').boundingBox();
 expect(actionsBefore.y+actionsBefore.height).toBeLessThanOrEqual(556);
 const round=await bar.locator('#ktRound').boundingBox(),gear=await bar.locator('#ktSettings').boundingBox();
 expect(round.x).toBeLessThan(25);
 expect(gear.x+gear.width).toBeGreaterThan(300);
 if(process.env.TROY_HUD_CAPTURE&&seats===3){
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.allSettled([...document.images].filter(n=>n.getClientRects().length).map(n=>n.decode()));});
   await page.screenshot({path:process.env.TEMP+'/TROY-focused-match-DPR3.png'});
 }
 await table.locator('#ktGrave').click();
 await expect(page.locator('#ktGraveDialog')).toBeVisible();
 await page.locator('#ktGraveClose').click();
 await expect(page.locator('#ktGraveDialog')).toBeHidden();
 await open();
 await expect(settings).toBeVisible();
 await expect(settings.locator('#ktArrange')).toBeEnabled();
 await expect(settings.locator('#ktExitCpu')).toBeVisible();
 await expect(settings.locator('#nvSoundSetting')).toBeVisible();
 await expect(settings.locator('#ktMusicSetting')).toBeVisible();
 if(process.env.TROY_HUD_CAPTURE&&seats===3) await page.screenshot({path:process.env.TEMP+'/TROY-focused-match-settings-DPR3.png'});
 await settings.locator('#nvSoundSetting').uncheck();
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('troy:kingdom-table:sound'))).toBe('off');
 await settings.locator('#nvSoundSetting').check();
 const popup=page.waitForEvent('popup');
 await settings.locator('a[href="tarot-kingdom-table-rules.html"]').click();
 const rules=await popup;
 await rules.waitForURL(/tarot-kingdom-table-rules/);
 await rules.close();
 await settings.locator('#ktArrange').click();
 await expect(settings).toBeHidden();
 await expect(table.locator('#ktArrangeActions')).toBeVisible();
 await expect(table.locator('#ktSortHand')).toBeVisible();
 const sorted=await table.locator('#ktArrangeActions').boundingBox();
 expect(sorted.y+sorted.height).toBeLessThanOrEqual(556);
 await table.locator('#ktArrangeDone').click();
 await expect(table.locator('#ktActions')).toBeVisible();
 await open();
 await settings.locator('#ktExitCpu').click();
 await expect(settings).toBeHidden();
 await expect(page.locator('#ktDialog')).toBeVisible();
 await expect(page.locator('#ktDialogActions button')).toHaveCount(2);
 await page.locator('#ktDialogActions button').first().click();
 await expect(page.locator('#ktDialog')).toBeHidden();
 await expect(table).toBeVisible();
 await open();
 await settings.locator('#ktExitCpu').click();
 await page.locator('#ktDialogActions button').last().click();
 await expect(table).toBeHidden();
 await expect(page.locator('#ktSetup')).toBeVisible();
 expect(errors).toEqual([]);
});

test('shared board keeps a complete warning and field controls onscreen at 320 x 500',async({page})=>{
 await page.setViewportSize({width:320,height:500});
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/tarot-kingdom-table.html#practice');
 await page.locator('input[name=ktSeats][value="3"]').check();
 await page.locator('#ktStart').click();
 const warningText='Checking the connection. '.repeat(12);
 const state=await page.evaluate(text=>{
   const warning=document.getElementById('ktOnlinePlayStatus');
   warning.textContent=text;
   warning.hidden=false;
   const table=document.getElementById('ktTable');
   const field=document.getElementById('ktFelt');
   return {
     warning:warning.getBoundingClientRect().height,
     nowrap:getComputedStyle(warning).whiteSpace,
     text:warning.textContent,
     fieldPadding:getComputedStyle(field).paddingTop,
     roomPad:getComputedStyle(table).getPropertyValue('--kt-room-pad'),
     document:document.scrollingElement.scrollHeight,
     controlBottom:document.getElementById('ktActions').getBoundingClientRect().bottom
   };
 },warningText);
 expect(state.warning).toBeLessThan(24);
 expect(state.nowrap).toBe('nowrap');
 expect(state.text).toBe(warningText);
 expect(state.fieldPadding).toBe('12px');
 expect(state.roomPad).not.toBe('');
 expect(state.document).toBe(500);
 expect(state.controlBottom).toBeLessThanOrEqual(488);
});
