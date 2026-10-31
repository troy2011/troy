'use strict';
require('./no-external-services.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function functionSource(start, end) {
  const source = fs.readFileSync('public/js/ship.js', 'utf8'), a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a); return source.slice(a, b).replace('export async function', 'async function');
}

test('a delayed switch response cannot change the new account cache, DOM, events, or exploration', async () => {
  const response = deferred(); let current = true, domReads = 0, events = 0, loads = 0;
  const context = { Player: { capturePlayerSession: () => ({}), isCurrentPlayerSession: () => current },
    requestSetActiveShip: () => response.promise, invalidateShipResourceStorage: () => { throw Error('stale invalidation'); },
    document: { getElementById: () => { domReads++; return null; } }, window: { dispatchEvent: () => { events++; } },
    loadExplorationPanel: async () => { loads++; }, activeShipIdCache: 'current-account', activeShipOwnerIdCache: 'NEW', activeShipSharedCache: false };
  vm.runInNewContext(`${functionSource('export async function setActiveShip(', 'export function calculateCurrentPosition(')};globalThis.run=setActiveShip;globalThis.cache=()=>activeShipIdCache;`, context);
  const result = context.run('OLD', 'old-ship'); current = false;
  response.resolve({ success: true, activeShipId: 'old-ship', shipOwnerPlayFabId: 'OLD' });
  assert.equal(await result, null); assert.equal(context.cache(), 'current-account');
  assert.equal(domReads, 0); assert.equal(events, 0); assert.equal(loads, 0);
});

test('a delayed exploration refresh does not render or update pets after account change', async () => {
  const response = deferred(); let current = true, renders = 0, pets = 0, errors = 0;
  const panel = { innerHTML: '' };
  const context = { Player: { capturePlayerSession: () => ({}), isCurrentPlayerSession: () => current },
    document: { getElementById: () => panel }, renderExplorationLoading: () => 'loading',
    requestExplorationStatus: () => response.promise, requestTarotKingdomPetState: async () => ({ currentPet: { id: 'old' } }),
    setCurrentTarotKingdomPet: () => { pets++; }, renderExplorationPanel: () => { renders++; },
    renderExplorationLoadError: () => { errors++; }, showTarotKingdomPetOffer: async () => null };
  vm.runInNewContext(`${functionSource('export async function loadExplorationPanel(', 'async function startExploration(')};globalThis.run=loadExplorationPanel;`, context);
  const result = context.run('OLD'); current = false; response.resolve({}); await result;
  assert.equal(renders, 0); assert.equal(pets, 0); assert.equal(errors, 0);
});

test('a failed status refresh does not hide that switching removed unavailable cards', async () => {
  let mounted;
  const element = () => ({ style: {}, setAttribute() {}, append() {}, remove() {} });
  const context = { Player: { isCurrentPlayerSession: () => true },
    document: { getElementById: () => null, createElement: element, body: { appendChild() {} } },
    window: { addEventListener() {}, removeEventListener() {} }, bindModalClose() {},
    mountShipyard: (_root, api) => { mounted = api; },
    setActiveShip: async () => ({ success: true, removedCards: ['sold'] }),
    requestPlayerShipStatus: async () => { throw Error('refresh failed'); },
    renderPlayerShipWidget() {}, withPlayerShipStatusContext: value => value, console: { warn() {} } };
  const source = fs.readFileSync('public/js/ship.js', 'utf8');
  const start = source.indexOf('function openShipyard('), end = source.indexOf('function handleHomePlayerShipTapKeydown(', start);
  assert.ok(start >= 0 && end > start);
  vm.runInNewContext(`${source.slice(start, end)};globalThis.open=openShipyard;`, context);
  context.open('ABC', {});
  const result = await mounted.switchShip('ship');
  assert.equal(result.success, true); assert.deepEqual(Array.from(result.removedCards), ['sold']);
});
