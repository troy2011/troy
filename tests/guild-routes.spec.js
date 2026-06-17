const { test, expect } = require('@playwright/test');
const { __test } = require('../server/routes/guildRoutes');

test('companion guild selection ignores system nation groups', () => {
  const selected = __test.selectCompanionGuildCandidate([
    {
      group: { Group: { Id: 'nation-fire-group' }, GroupName: 'nation_fire_island' },
      guildData: {}
    },
    {
      group: { Group: { Id: 'pirate-guild' }, GroupName: '海風海賊団' },
      guildData: {
        guildType: 'pirate',
        nation: 'water',
        ownerPlayFabId: 'CAPTAIN1',
        crewRoles: { PLAYER1: 'swordsman' }
      }
    }
  ], 'PLAYER1', { isKing: false });

  expect(selected.group.Group.Id).toBe('pirate-guild');
});

test('king companion guild selection prefers own nation guild only', () => {
  const selected = __test.selectCompanionGuildCandidate([
    {
      group: { Group: { Id: 'nation-fire-group' }, GroupName: 'nation_fire_island' },
      guildData: {}
    },
    {
      group: { Group: { Id: 'fire-king-guild' }, GroupName: '火の国ギルド' },
      guildData: {
        guildType: 'nation',
        isNationGuild: true,
        nation: 'fire',
        ownerPlayFabId: 'FIREKING'
      }
    },
    {
      group: { Group: { Id: 'water-king-guild' }, GroupName: '水の国ギルド' },
      guildData: {
        guildType: 'nation',
        isNationGuild: true,
        nation: 'water',
        ownerPlayFabId: 'WATERKING'
      }
    }
  ], 'WATERKING', { isKing: true, nationKey: 'water' });

  expect(selected.group.Group.Id).toBe('water-king-guild');
});

test('king companion guild selection returns null without own nation guild', () => {
  const selected = __test.selectCompanionGuildCandidate([
    {
      group: { Group: { Id: 'nation-fire-group' }, GroupName: 'nation_fire_island' },
      guildData: {}
    },
    {
      group: { Group: { Id: 'fire-king-guild' }, GroupName: '火の国ギルド' },
      guildData: {
        guildType: 'nation',
        isNationGuild: true,
        nation: 'fire',
        ownerPlayFabId: 'FIREKING'
      }
    }
  ], 'WATERKING', { isKing: true, nationKey: 'water' });

  expect(selected).toBeNull();
});

test('member entity map resolves PlayFab IDs for group member rows', () => {
  const guildData = {};
  __test.setGuildMemberPlayFabMapEntry(guildData, { Id: 'entity-player-1', Type: 'title_player_account' }, 'player1');

  expect(__test.resolveGuildMemberPlayFabId('entity-player-1', guildData)).toBe('PLAYER1');
  expect(__test.resolveGuildMemberPlayFabId('legacyplayfabid', guildData)).toBe('LEGACYPLAYFABID');
});

test('public display name sanitizer never falls back to player identifiers', () => {
  expect(__test.sanitizePublicDisplayName('', 'PLAYER1')).toBe('名前未設定');
  expect(__test.sanitizePublicDisplayName('Unknown')).toBe('名前未設定');
  expect(__test.sanitizePublicDisplayName('player1', 'PLAYER1')).toBe('名前未設定');
  expect(__test.sanitizePublicDisplayName('海風の剣士', 'PLAYER1')).toBe('海風の剣士');
});

test('guild warehouse image path sanitizer keeps local sprites only', () => {
  expect(__test.sanitizeWarehouseImagePath('./Sprites/food/snack_pickle_barrel.png')).toBe('./Sprites/food/snack_pickle_barrel.png');
  expect(__test.sanitizeWarehouseImagePath('/assets/ui/icons/046.png')).toBe('/assets/ui/icons/046.png');
  expect(__test.sanitizeWarehouseImagePath('https://example.com/item.png')).toBe('');
  expect(__test.sanitizeWarehouseImagePath('javascript:alert(1)')).toBe('');
});

test('guild warehouse history merges treasury ledger and item entries newest first', () => {
  const guildData = {
    treasuryLedger: [
      { type: 'deposit', playFabId: 'player1', amount: 100, createdAt: '2026-06-15T10:00:00.000Z' }
    ],
    warehouseHistory: []
  };
  __test.appendWarehouseHistory(guildData, {
    type: 'item_deposit',
    playFabId: 'player2',
    itemId: 'potion',
    itemName: '回復薬',
    createdAt: '2026-06-16T10:00:00.000Z'
  });

  const history = __test.buildWarehouseHistory(guildData);
  expect(history).toHaveLength(2);
  expect(history[0]).toMatchObject({ type: 'item_deposit', playFabId: 'PLAYER2', itemName: '回復薬' });
  expect(history[1]).toMatchObject({ type: 'currency_deposit', playFabId: 'PLAYER1', amount: 100 });
});
