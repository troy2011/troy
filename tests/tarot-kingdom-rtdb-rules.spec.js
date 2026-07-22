const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const rulesPath = path.resolve(__dirname, '..', 'database.rules.json');

function readRulesFile() {
  const text = fs.readFileSync(rulesPath, 'utf8');
  return { text, rules: JSON.parse(text).rules };
}

test('Realtime Database rules bind Tarot Kingdom presence and actions to Firebase auth', () => {
  const { rules } = readRulesFile();
  const roomRules = rules.tarotKingdomRooms.$roomId;
  const openRoomRules = rules.tarotKingdomMatch.openRooms.$roomId;
  const presenceWrite = roomRules.presence.$uid['.write'];
  const actionWrite = roomRules.actions.$actionKey['.write'];
  const actionValidate = roomRules.actions.$actionKey['.validate'];
  const stateWrite = roomRules.state['.write'];
  const hostWrite = roomRules.meta.hostUid['.write'];
  const seatOwnerWrite = roomRules.meta.seatOwners.$seat['.write'];
  const seatByUidWrite = roomRules.meta.seatByUid.$uid['.write'];
  const presenceValidate = roomRules.presence.$uid['.validate'];
  const openRoomWrite = openRoomRules['.write'];
  const openRoomValidate = openRoomRules['.validate'];

  expect(presenceWrite).toContain('auth.uid === $uid');
  expect(actionWrite).toContain("newData.child('uid').val() === auth.uid");
  expect(actionValidate).toContain("child(auth.uid).child('seat').val()");
  expect(stateWrite).toContain("child('hostUid').val() === auth.uid");
  expect(hostWrite).toContain('now - 90000');
  expect(hostWrite).toContain("child('presence').child(auth.uid).child('uid').val() === auth.uid");
  expect(hostWrite).toContain("child('seatByUid').child(auth.uid).val()");
  expect(hostWrite).toContain("child('seatOwners').child(root.child('tarotKingdomRooms')");
  expect(seatOwnerWrite).toContain("($seat === '0' || $seat === '1' || $seat === '2' || $seat === '3')");
  expect(seatOwnerWrite).toContain("newData.child('uid').val() === auth.uid");
  expect(seatOwnerWrite).toContain("data.child('uid').val() === auth.uid || ((!data.exists() ||");
  expect(seatOwnerWrite).toContain('now - 15000');
  expect(seatOwnerWrite).toContain("child('roundActive').val() !== true");
  expect(seatOwnerWrite).toContain("child('phase').val() === 'idle'");
  expect(roomRules.meta.seatOwners.$seat['.validate']).toContain("$seat === '3'");
  expect(seatByUidWrite).toContain("child('seatOwners').child(newData.val() + '').child('uid').val() === auth.uid");
  expect(seatByUidWrite).toContain("child('hostUid').val() === auth.uid");
  expect(presenceValidate).toContain("child('seatByUid').child(auth.uid).val()");
  expect(presenceValidate).toContain("child('seatOwners').child(newData.child('seat').val() + '').child('uid').val() === auth.uid");
  expect(actionValidate).toContain("child('seatOwners').child(newData.child('seat').val() + '').child('uid').val() === auth.uid");
  expect(openRoomWrite).toContain("newData.child('ownerUid').val() === auth.uid");
  expect(openRoomWrite).toContain("child('hostUid').val() === auth.uid");
  expect(openRoomValidate).toContain("newData.hasChildren(['roomId', 'ownerUid', 'createdAt', 'updatedAt'])");
});

test('Tarot Kingdom room reads do not inherit access to private state', () => {
  const { rules } = readRulesFile();
  const roomRules = rules.tarotKingdomRooms.$roomId;

  expect(rules['.read']).toBe(false);
  expect(rules['.write']).toBe(false);
  expect(roomRules['.read']).toBeUndefined();
  expect(roomRules['.write']).toBeUndefined();
  expect(roomRules.meta['.read']).toBe('auth != null');
  expect(roomRules.presence['.read']).toBe('auth != null');
  expect(roomRules.state['.read']).toBe('auth != null');
  expect(roomRules.privateHands['.read']).toBeUndefined();
  expect(roomRules.authorityState['.read']).toContain("child('hostUid').val() === auth.uid");
  expect(roomRules.actions['.read']).toContain("child('hostUid').val() === auth.uid");
});

test('public state rejects hands, decks, and unrevealed card information', () => {
  const { rules } = readRulesFile();
  const roomRules = rules.tarotKingdomRooms.$roomId;
  const stateValidate = roomRules.state['.validate'];
  const roomValidate = roomRules['.validate'];

  expect(stateValidate).toContain("newData.child('schema').val() === 4");
  expect(stateValidate).toContain("child('privateStateVersion').val() === 2");
  for (const seat of ['0', '1', '2', '3']) {
    expect(stateValidate).toContain(`child('players').child('${seat}').child('handCount')`);
    expect(stateValidate).toContain(`!newData.child('state').child('players').child('${seat}').child('hand').exists()`);
  }
  expect(stateValidate).toContain("!newData.child('state').child('minorDeck').exists()");
  expect(stateValidate).toContain("!newData.child('state').child('majorDeck').exists()");
  expect(stateValidate).toContain("!newData.child('state').child('hermitPreview').exists()");
  expect(stateValidate).toContain("!newData.child('state').child('drawFlipCardId').exists()");
  expect(stateValidate).toContain("child('openOracleRevealed').val() === true");
  expect(stateValidate).toContain("child('hiddenOracleRevealed').val() === true");

  expect(roomValidate).toContain("child('state').child('state').child('revision').val()");
  expect(roomValidate).toContain("child('authorityState').child('revision').val()");
  for (const seat of ['0', '1', '2', '3']) {
    expect(roomValidate).toContain(`child('privateHands').child('${seat}').child('revision').val()`);
  }
});

test('authority state is host-only and private hands are isolated by seat ownership', () => {
  const { rules } = readRulesFile();
  const roomRules = rules.tarotKingdomRooms.$roomId;
  const authority = roomRules.authorityState;
  const privateHand = roomRules.privateHands.$seat;

  expect(authority['.read']).toContain("child('hostUid').val() === auth.uid");
  expect(authority['.write']).toContain("child('hostUid').val() === auth.uid");
  expect(authority['.validate']).toContain("newData.child('version').val() === 1");
  expect(authority['.validate']).toContain("newData.child('handsBySeat').hasChildren(['seat0', 'seat1', 'seat2', 'seat3'])");
  expect(authority['.validate']).toContain("newData.child('minorDeck').child('count')");
  expect(authority['.validate']).toContain("newData.child('majorDeck').child('count')");

  expect(privateHand['.read']).toContain("child('hostUid').val() === auth.uid");
  expect(privateHand['.read']).toContain("child('seatOwners').child($seat).child('uid').val() === auth.uid");
  expect(privateHand['.write']).toContain("child('hostUid').val() === auth.uid");
  expect(privateHand['.validate']).toContain("$seat === '0'");
  expect(privateHand['.validate']).toContain("newData.child('seat').val() === 3");
  expect(privateHand['.validate']).toContain("newData.child('handCount').val() === 0");
  expect(privateHand['.validate']).toContain("!newData.child('cards').exists()");
});

test('open-room index writes stay bound to the current host and owner', () => {
  const { rules } = readRulesFile();
  const openRoom = rules.tarotKingdomMatch.openRooms.$roomId;
  const write = openRoom['.write'];
  const validate = openRoom['.validate'];

  expect(write).toContain("newData.child('ownerUid').val() === auth.uid");
  expect(write).toContain("child('hostUid').val() === auth.uid");
  expect(write).toContain("!root.child('tarotKingdomRooms').child($roomId).child('meta').child('hostUid').exists()");
  expect(write).toContain("data.child('ownerUid').val() === auth.uid");
  expect(validate).toContain("newData.child('roomId').val() === $roomId");
  expect(validate).toContain("newData.child('ownerUid').val() === auth.uid");
  expect(validate).toContain("newData.child('createdAt').val() >= now - 90000");
  expect(validate).toContain("newData.child('updatedAt').val() <= now + 15000");
});

test('rules only call supported Realtime Database RuleDataSnapshot methods', () => {
  const { text } = readRulesFile();
  const supportedMethods = new Set([
    'child',
    'exists',
    'hasChild',
    'hasChildren',
    'isBoolean',
    'isNumber',
    'isString',
    'val'
  ]);
  const calledMethods = Array.from(text.matchAll(/\.([A-Za-z][A-Za-z0-9_]*)\(/g), (match) => match[1]);
  const unsupportedMethods = Array.from(new Set(calledMethods.filter((method) => !supportedMethods.has(method))));

  expect(unsupportedMethods).toEqual([]);
  expect(text).not.toContain('.numChildren(');
});
