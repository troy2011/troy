'use strict';
require('./no-external-services.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { retiredWorldRoutes, RETIRED_WORLD_ROUTES } = require('../server/retiredWorldRoutes');

test('retired world endpoints cannot invoke their legacy handlers', () => {
  for (const path of RETIRED_WORLD_ROUTES) {
    let next = false;
    const res = { status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
    retiredWorldRoutes({ path }, res, () => { next = true; });
    assert.equal(next, false, path);
    assert.equal(res.code, 410, path);
    assert.equal(res.body.error, 'OnlineWorldRetired', path);
  }
});

test('case and a trailing slash do not bypass retired endpoint protection', () => {
  for (const path of ['/API/START-SHIP-VOYAGE/', '/api/get-world-map-layout/']) {
    const res = { status(code) { this.code = code; return this; }, json() { return this; } };
    retiredWorldRoutes({ path }, res, () => assert.fail('retired route was not blocked'));
    assert.equal(res.code, 410);
  }
});

test('shipyard, switching, exploration and real-store endpoints remain reachable', () => {
  for (const path of ['/api/ship-construction/context', '/api/ship-construction/build', '/api/get-player-ships',
    '/api/set-active-ship', '/api/upgrade-ship', '/api/repair-ship', '/api/get-ship-resource-storage',
    '/api/exploration/status', '/api/troy-orders/list']) {
    let next = false;
    retiredWorldRoutes({ path }, {}, () => { next = true; });
    assert.equal(next, true, path);
  }
});
