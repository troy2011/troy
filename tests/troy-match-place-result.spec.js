const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const troy=fs.existsSync('public/tabletop-v65');
const root=(troy?'public/tabletop-v65':'public')+'/js/kingdomTable/';
for(const [label,chips,title,mode,music] of [
    ['sole first',[1600,1500,800,500],'勝利','is-victory',null],
    ['second',[1500,1600,800,500],'勝利','is-match-place-win','victory'],
    ['shared second',[1500,1600,1500,500],'勝利','is-match-place-win','victory'],
    ['third',[800,1600,1500,500],'敗北','is-match-loss','defeat'],
    ['shared lead',[1600,1600,800,500],'同率1位','is-match-tie',null]
]) test('match ending: '+label,async({page})=>{
    await page.setViewportSize({width:375,height:667});
    await page.addInitScript(()=>{window.matchCues=[];window.musicScenes=[];});
    await page.route(/\/kingdomTable\/ui\.js\?/,r=>r.fulfill({contentType:'text/javascript',
        body:fs.readFileSync(root+'ui.js','utf8')+"\nwindow.endingFixture=(chips)=>{\n    const method = typeof Music.scene === 'function' ? 'scene' : 'setScene';\n    const original = Music[method];\n    Music[method] = function(name,...args){window.musicScenes.push(name);return original.call(this,name,...args);};\n    $('ktTable').hidden=false; $('ktSetup').hidden=true;\n    match=createMatch({players:4}); startRound(match);\n    practiceAvatar=getAvatar(6);\n    match.chips=chips; match.over=true; match.round.phase='over'; match.round.winner=null;\n    showResult({winner:null,delta:[0,0,0,0],label:'Final'});\n};\n"
    }));
    await page.route(/\/kingdomTable\/sfx\.js\?/,r=>r.fulfill({contentType:'text/javascript',
        body:fs.readFileSync(root+'sfx.js','utf8').replace('export function play(name, at = 0, ...args) {',
            'export function play(name, at = 0, ...args) { window.matchCues.push(name);')
    }));
    await page.goto('/tarot-kingdom-table.html');
    await expect.poll(()=>page.evaluate(()=>typeof window.endingFixture)).toBe('function');
    await page.evaluate(chips=>window.endingFixture(chips),chips);
    const dialog=page.locator('#ktDialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('#ktDialogTitle')).toHaveText(title);
    await expect(dialog).toHaveClass(new RegExp('\\b'+mode+'\\b'));
    if(label==='sole first'){
        await expect(dialog.locator('video')).toHaveCount(1);
    }else{
        await expect(dialog.locator('video')).toHaveCount(0);
        expect(await page.evaluate(()=>window.musicScenes.at(-1))).toBe(music);
        expect(await page.evaluate(()=>window.matchCues.includes('lose'))).toBe(label==='third');
    }
    if(mode==='is-match-place-win'){
        await expect(dialog.locator('.kt-final-viewer-rank')).toHaveText('あなたの順位：2位');
        await expect(dialog.locator('.kt-final-own .kt-final-place')).toHaveText('2位');
        await expect(dialog.locator('.kt-dialog-box')).toHaveCSS('background-image',/victory-cabin-a\.webp/);
    }
});
