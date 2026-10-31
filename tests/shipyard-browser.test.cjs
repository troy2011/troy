'use strict';
require('./no-external-services.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('shipyard builds and switches at mobile and desktop sizes using fake APIs', async () => {
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  const source = fs.readFileSync('public/js/shipyard.js', 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export function mountShipyard', 'function mountShipyard');
  try {
    for (const width of [390, 1024]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => { errors.push('Unexpected network request'); return route.abort(); });
      await page.setContent('<main id="root"></main>');
      await page.evaluate(() => {
        window.__ships = [{ shipId: 'old', isActive: true, profileName: 'My Ship', assetData: { ShipType: 'Old', Owner: 'ABC' } }];
        window.callApiWithLoader = async (url, body) => {
          if (url.endsWith('/context')) return { catalog: [{ id: 'ship', name: 'Explorer' }], unaffiliated: true, eligible: true };
          if (url.endsWith('/current')) return { state: 'not_started' };
          if (url.endsWith('/quote')) return { quote: [{ itemId: 'RT', amount: 10 }, { itemId: body.selectedResource, amount: 25 }] };
          if (url.endsWith('/build')) { window.__ships.push({ shipId: 'new', isActive: false, assetData: { ShipType: 'Explorer', Owner: 'ABC' } }); return { state: 'complete', requestId: body.requestId, shipId: 'new' }; }
          throw Error('unexpected');
        };
        window.getPlayerShips = async () => ({ success: true, shipOwnerPlayFabId: 'ABC', isSharedShip: false, isGuildShip: false, ships: window.__ships });
        window.__switch = async id => { window.__ships.forEach(ship => { ship.isActive = ship.shipId === id; }); return { success: true, activeShipId: id, removedCards: ['sold'] }; };
      });
      await page.addScriptTag({ content: `const callApiWithLoader=window.callApiWithLoader,getPlayerShips=window.getPlayerShips;${source}; mountShipyard(document.querySelector('#root'),{playerId:'ABC',sessionCurrent:()=>true,switchShip:window.__switch});` });
      await page.getByText('My Ship', { exact: false }).waitFor();
      await page.locator('[data-material]').selectOption('RR');
      await page.locator('[data-check]').click();
      await page.getByText('RT × 10 / RR × 25').waitFor();
      await page.locator('[data-build]').click();
      await page.getByText('船を建造しました。').waitFor();
      await page.getByRole('button', { name: 'この船を使う' }).click();
      await page.getByText('船を切り替えました。利用できないカードは装備から外しました。').waitFor();
      assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(os.tmpdir(), `troy-shipyard-${width}.png`) });
      await page.close();
    }
  } finally { await browser.close(); }
});
