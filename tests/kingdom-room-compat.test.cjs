const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadKingdomEngine } = require('./helpers/kingdom-engine-vm.cjs');

test('a new-version host restores the same rule and private hands after takeover', async () => {
  const values = new Map();
  const reads = [];
  const firebase = {
    ref: (_db, key) => ({ key }),
    get: async ({ key }) => {
      reads.push(key);
      return { exists: () => values.has(key), val: () => values.get(key) };
    },
    onChildAdded: () => () => {},
    onValue: () => () => {}
  };
  const { api } = await loadKingdomEngine(path.resolve(__dirname, '..'), { stubs: { 'firebase/database': firebase } });
  const card = { id: 'tower', kind: 'major', suit: 'None', number: 16 };
  api.scenario({ withTrick: false, playerCount: 3, handsBySeat: [[card], [], []], drawDeck: [] });
  const state = api.publicState();
  const authority = api.authorityState();
  values.set('tarotKingdomRoomsV37/tkv37_fixture/state', state);
  values.set('tarotKingdomRoomsV37/tkv37_fixture/authorityState', authority);
  const result = await api.promoteHost('tkv37_fixture');
  assert.equal(result.promoted, true);
  assert.equal(result.hostReady, true);
  assert.equal(result.rules.majorArcanaGateVersion, 2);
  assert.equal(result.hands[0][0].id, 'tower');
  assert.deepEqual(reads, ['tarotKingdomRoomsV37/tkv37_fixture/state', 'tarotKingdomRoomsV37/tkv37_fixture/authorityState']);
});
