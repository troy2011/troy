const {test,expect}=require('@playwright/test');
const {bootstrapMainApp}=require('./helpers/main-app-harness');
for(const [width,height,contextScale] of [[390,844,1.68],[1024,900,1.45],[844,390,1.45]]) test('Home pet/owner share a floor without changing avatar scale at '+width,async({page})=>{
    await page.setViewportSize({width,height});
    await page.emulateMedia({reducedMotion:'reduce'});
    await bootstrapMainApp(page);
    const checks=await page.evaluate(async()=>{
        const {renderHomePetCompanion}=await import('/js/playerProfile.js?v=20261122-home-pet-floor-v1');
        const {PIXEL_MONSTERS_ROSTER}=await import('/js/pixelMonstersManifest.js?v=20260825-monster-motion-v2');
        const av=document.querySelector('#home-avatar'), pet=document.querySelector('#homePetCompanion');
        const x=av.getBoundingClientRect();
        const avatar={width:x.width,height:x.height,sole:x.bottom,shadow:getComputedStyle(av,'::before').content,transform:getComputedStyle(av).transform};
        const results=[];
        for(const monster of PIXEL_MONSTERS_ROSTER){
            renderHomePetCompanion({monsterId:monster.id});
            const sprite=pet.querySelector('.pixel-monster-companion-sprite');
            const shadow=pet.querySelector('.pixel-monster-companion-shadow').getBoundingClientRect();
            const computed=getComputedStyle(sprite);
            const transform=new DOMMatrix(computed.transform);
            const frameHeight=Number(monster.frameHeight);
            const origin=parseFloat(pet.style.getPropertyValue('--home-pet-sole-origin'));
            const sole=transform.d<0?frameHeight-origin:origin;
            const floor=sprite.getBoundingClientRect().bottom-(frameHeight-sole)*Math.abs(transform.d);
            results.push({id:monster.id,floor,shadow:(shadow.top+shadow.bottom)/2,scale:Math.abs(transform.d),
                previousScale:parseFloat(pet.style.getPropertyValue('--pixel-monster-companion-scale')),image:computed.imageRendering});
        }
        renderHomePetCompanion(null);
        const hidden=pet.hidden && !pet.querySelector('.pixel-monster-companion-shadow');
        return {avatar,results,hidden};
    });
    if (process.env.TROY_HOME_PET_SHOT && width === 390) {
        await page.evaluate(async () => {
            const {renderHomePetCompanion}=await import('/js/playerProfile.js?v=20261122-home-pet-floor-v1');
            renderHomePetCompanion({monsterId:'ismartal-vol1-monster-03'});
        });
        await page.locator('.home-ship-bob').screenshot({path:process.env.TROY_HOME_PET_SHOT});
    }
    expect(checks.results).toHaveLength(50);
    expect(checks.avatar.width).toBeCloseTo(64*contextScale,1);
    expect(checks.avatar.height).toBeCloseTo(64*contextScale,1);
    expect(checks.avatar.shadow).toBe('""');
    expect(checks.hidden).toBeTruthy();
    for(const row of checks.results){
        expect(Math.abs(row.floor-checks.avatar.sole),row.id+' sprite').toBeLessThan(.12);
        expect(Math.abs(row.shadow-checks.avatar.sole),row.id+' shadow').toBeLessThan(.12);
        expect(row.scale,row.id+' scale').toBeCloseTo(.9*contextScale*row.previousScale,4);
    }
});
