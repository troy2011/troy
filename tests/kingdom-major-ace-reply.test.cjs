const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { tarotKingdomRoomRoots } = require('../server/tarotKingdomRoomPaths');
const { loadKingdomEngine } = require('./helpers/kingdom-engine-vm.cjs');

let api;
const minor = (suit, number, id = `${suit}-${number}`) => ({ id, kind: 'minor', suit, number });
const major = number => ({ id: `major-${number}`, kind: 'major', suit: 'None', number });
const suits = ['Sword', 'Cup', 'Pentacle', 'Wand'];
const majorSuits = [[16, 'Sword'], [17, 'Cup'], [18, 'Pentacle'], [19, 'Wand']];

before(async () => { ({ api } = await loadKingdomEngine(path.resolve(__dirname, '..'))); });

function setUp(card, field, options = {}) {
  api.scenario({ withTrick: false, playerCount: 3, handsBySeat: [[card, minor('Cup', 6, 'reserve')], [minor('Wand', 3)], [minor('Sword', 4)]], drawDeck: [] });
  const state = api.state();
  const fields = Array.isArray(field) ? field : [field];
  state.trick = { type: 'set', count: fields.length, cardsTable: fields, cardsHand: fields, owner: 1, number: fields[0].number, setPower: fields[0].number === 1 ? 15 : fields[0].number };
  if (options.reverse) state.reverse = true;
  if (options.lock) state.lock = { suit: options.lock, min: null };
  if (options.old) state.rules.majorArcanaGateVersion = 1;
  if (options.forced) state.trickForcedCount = options.forced;
  return state;
}

for (const [number, suit] of majorSuits) {
  test(`major ${number} applies the same suit rule to ordinary cards and major fields`, () => {
    for (const fieldSuit of suits) {
      setUp(major(number), minor(fieldSuit, 14));
      const expected = fieldSuit === suit;
      assert.equal(api.set(0, [0]).validation.ok, expected, `ordinary ${number} / ${fieldSuit}`);
      assert.equal(api.rebuild(0, [`major-${number}`]).ok, expected, `host ordinary ${number} / ${fieldSuit}`);
      assert.equal(api.legal(0).some(play => play.cardsHand?.some(card => card.id === `major-${number}`)), expected, `AI ordinary ${number} / ${fieldSuit}`);
    }
    setUp(major(number), major(1));
    assert.equal(api.set(0, [0]).validation.ok, true, 'Magician retains all suits');
    setUp(major(number), major(20));
    assert.equal(api.set(0, [0]).validation.ok, false, 'suitless major');
    setUp(major(number), major(majorSuits.find(([other]) => other !== number)[0]));
    assert.equal(api.set(0, [0]).validation.ok, false, 'different major suit');
    const state = setUp(major(number), minor(suit, 2));
    state.trick = null;
    assert.equal(api.set(0, [0]).validation.ok, false, 'ordinary empty-field opening');
  });
  test(`major ${number} answers only its own suit's ace`, () => {
    for (const fieldSuit of suits) {
      setUp(major(number), minor(fieldSuit, 1));
      const expected = fieldSuit === suit;
      assert.equal(api.set(0, [0]).validation.ok, expected, `${number} / ${fieldSuit}`);
      assert.equal(api.rebuild(0, [`major-${number}`]).ok, expected, `host rebuild ${number} / ${fieldSuit}`);
      assert.equal(api.legal(0).some(play => play.cardsHand?.length === 1 && play.cardsHand[0].id === `major-${number}`), expected, `AI ${number} / ${fieldSuit}`);
    }
  });
  test(`major ${number} retains existing restrictions`, () => {
    setUp(major(number), minor(suit, 1), { old: true });
    assert.equal(api.set(0, [0]).validation.ok, false, 'legacy match');
    setUp(major(number), minor(suit, 1), { reverse: true });
    assert.equal(api.set(0, [0]).validation.ok, false, '11-back comparison');
    setUp(major(number), minor(suit, 1), { lock: suits.find(value => value !== suit) });
    assert.equal(api.set(0, [0]).ok, false, 'suit lock');
    setUp(major(number), [minor(suit, 1), minor('Cup', 1, 'other-ace')]);
    assert.equal(api.set(0, [0]).validation.ok, false, 'two cards on the field');
    setUp(major(number), minor(suit, 1), { forced: 2 });
    assert.equal(api.set(0, [0]).ok, false, 'forced card count');
  });
}

test('other majors still cannot answer an ace', () => {
  for (const number of [0, 1, 5, 8, 14, 15, 20, 21]) {
    setUp(major(number), minor('Sword', 1));
    const result = api.set(0, [0]);
    assert.equal(result.ok && result.validation.ok, false, `major ${number}`);
  }
});

test('current world and judgement replies after an ace reply remain subject to the existing lock', () => {
  for (const [number, suit] of majorSuits) {
    for (const next of [20, 21]) {
      setUp(major(next), major(number));
      assert.equal(api.set(0, [0]).validation.ok, true, `${next} after ${number}`);
      setUp(major(next), major(number), { lock: suit });
      assert.equal(api.set(0, [0]).ok, false, `${next} after ${number} with lock`);
    }
    setUp(minor(suit, 1), major(number));
    assert.equal(api.set(0, [0]).validation.ok, false, `ace after ${number}`);
  }
});

test('network state keeps the rule version and restores old matches to the previous rule', () => {
  setUp(major(16), minor('Sword', 1));
  const current = api.publicState();
  assert.equal(current.schema, 37);
  assert.equal(api.deserialize(current).rules.majorArcanaGateVersion, 2);
  const old = structuredClone(current);
  old.schema = 36;
  delete old.state.rules.majorArcanaGateVersion;
  assert.equal(api.deserialize(old).rules.majorArcanaGateVersion, 1);
  old.state.rules.majorArcanaGateVersion = 2;
  assert.equal(api.deserialize(old).rules.majorArcanaGateVersion, 1);
});

test('new rooms are isolated from legacy clients while legacy rooms retain their rules', () => {
  const current = api.roomPaths('tkv37_fixture');
  const legacy = api.roomPaths('tk_legacy');
  assert.deepEqual(JSON.parse(JSON.stringify(current)), { room: 'tarotKingdomRoomsV37/tkv37_fixture', index: 'tarotKingdomMatchV37/openRooms' });
  assert.deepEqual(JSON.parse(JSON.stringify(legacy)), { room: 'tarotKingdomRooms/tk_legacy', index: 'tarotKingdomMatch/openRooms' });
  for (const id of ['tkv37_fixture', 'tk_legacy']) {
    const server = tarotKingdomRoomRoots(id);
    assert.equal(api.roomPaths(id).room, `${server.rooms}/${id}`);
    assert.equal(api.roomPaths(id).index, `${server.matches}/openRooms`);
  }
  assert.equal(api.initialRulesForRoom('tkv37_fixture').majorArcanaGateVersion, 2);
  assert.equal(api.initialRulesForRoom('tk_legacy').majorArcanaGateVersion, 1);
});
