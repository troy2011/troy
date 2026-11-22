
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const cp = require('node:child_process');

test('installed tavern cache refreshes the lineup without reverting the published quiz fixes', async ({ browser }) => {
  const root = path.join(__dirname,'..'), pub = path.join(root,'public');
  const parent = '0e37495a49444fb073a2bc11d82c341e91c049ae';
  const retired = ['flags','harbor-dock'];
  const added = ['bell-rhythm','sail-patch'];
  const preHtml=cp.execFileSync('git',['show',parent+':public/tavern-minigames.html'],{cwd:root,encoding:'utf8'});
  const refs=[...preHtml.matchAll(/(?:src|href)="((?:js|css)\/[^"?]+)[^"]*"/g)].map(m=>'/'+m[1]);
  const changed = ['/tavern-minigames.html', ...new Set(refs)];
  const prior = new Map(changed.map(p=>[p,cp.execFileSync('git',['show',parent+':public'+p],{cwd:root})]));
  const loaded = [];
  let updated = false;
  const server = http.createServer((req,res) => {
    if(req.method!=='GET'){res.writeHead(405);return res.end();}
    const url = new URL(req.url,'http://localhost');
    const pathname = url.pathname==='/'?'/tavern-minigames.html':url.pathname;
    loaded.push({updated, pathname, query:url.search});
    const suffix = path.extname(pathname);
    const type = {'.js':'application/javascript','.css':'text/css','.html':'text/html','.webmanifest':'application/manifest+json'}[suffix] || 'text/plain';
    const actual = path.join(pub,pathname);
    if (!actual.startsWith(pub+path.sep)||!fs.existsSync(actual)){res.writeHead(404);return res.end();}
    res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store'});
    res.end(!updated&&prior.has(pathname)?prior.get(pathname):fs.readFileSync(actual));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const addr='http://127.0.0.1:'+server.address().port;
  const context=await browser.newContext({serviceWorkers:'allow'});
  try {
    const page=await context.newPage(), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(addr+'/tavern-minigames.html');
    for(const id of retired)await expect(page.locator('[data-game='+id+']')).toHaveCount(1);
    await page.evaluate(async()=>{
      const armed=new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
      await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;
      if(!navigator.serviceWorker.controller)await armed;
    });
    await page.reload(); // Put the previous code and page route through the real installed worker.
    await expect(page.locator('#games button')).toHaveCount(22);
    await expect(page.locator('[data-game=flags]')).toHaveCount(1);
    updated=true;
    await page.reload();
    await expect(page.locator('#games button')).toHaveCount(22);
    for(const id of added)await expect(page.locator('[data-game='+id+']')).toHaveCount(1);
    for(const id of retired)await expect(page.locator('[data-game='+id+']')).toHaveCount(0);
    await expect(page.locator('script[src$="tavern-games-a-v1.js?v=20261123-props-05-13-v1"]')).toHaveCount(1);
    await expect(page.locator('script[src$="tavern-games-b-v1.js?v=20261123-materials-v1"]')).toHaveCount(1);
    expect(loaded.some(r=>r.updated&&r.pathname==='/js/tavern-curl-physics-v1.js'&&r.query==='?v=1')).toBe(true);
    await page.locator('[data-game=curling]').click();
    await page.locator('#start').click();
    await expect(page.locator('.extra.a .curl-coin')).toHaveClass(/curl-world-piece/);
    expect(errors).toEqual([]);
  } finally {
    await context.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
});
