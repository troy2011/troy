const { test, expect } = require('@playwright/test');
const {
  MAJOR_ARCANA_SHIP_GEAR,
  buildMajorArcanaShipGearView,
  getMajorArcanaShipGear
} = require('../server/majorArcanaShipGear');

const REPLACEMENT_COMMANDS = new Set([
  'assault',
  'bowCannon',
  'broadside',
  'starboardRudder',
  'portRudder',
  'blankShot'
]);

test('major arcana ship gear definitions target the new plunder naval rules', () => {
  expect(Object.keys(MAJOR_ARCANA_SHIP_GEAR)).toHaveLength(22);

  Object.entries(MAJOR_ARCANA_SHIP_GEAR).forEach(([numberText, gear]) => {
    const number = Number(numberText);
    expect(gear.equipmentName, `equipmentName ${number}`).toBeTruthy();
    expect(gear.gearPart, `gearPart ${number}`).toBeTruthy();
    expect(gear.gearPartLabel, `gearPartLabel ${number}`).toBeTruthy();
    expect(gear.shortDescription, `shortDescription ${number}`).toBeTruthy();
    expect(REPLACEMENT_COMMANDS.has(gear.replacementCommand), `replacementCommand ${number}`).toBe(true);
    expect(gear.priority, `priority ${number}`).toBe(number);
    expect(gear.navalEffect?.type, `navalEffect ${number}`).toBeTruthy();
    expect(gear.navalEffect.replacementCommand, `effect replacementCommand ${number}`).toBe(gear.replacementCommand);
  });
});

test('major arcana ship gear resolves with display fields and without old timeline values', () => {
  expect(buildMajorArcanaShipGearView('arcana-16')).toMatchObject({
    arcanaNumber: 16,
    equipmentName: '塔の雷撃マスト',
    gearPartLabel: 'マスト',
    replacementCommand: 'broadside',
    priority: 16,
    navalEffect: { type: 'tower-broadside', crewDamagePercent: 10, mastDamage: 2 }
  });
  expect(buildMajorArcanaShipGearView('tarot_major_sword_7')).toMatchObject({
    arcanaNumber: 7,
    equipmentName: '戦車の破浪衝角',
    gearPart: 'ram',
    replacementCommand: 'assault',
    navalEffect: { type: 'chariot-assault', winAssaultMirror: true }
  });
  expect(getMajorArcanaShipGear('custom_major_card', { ArcanaNumber: 20 })).toMatchObject({
    arcanaNumber: 20,
    equipmentName: '審判の修復号鐘',
    replacementCommand: 'blankShot',
    navalEffect: { type: 'judgement-blank', crewHealPercent: 20 }
  });

  const serialized = JSON.stringify(MAJOR_ARCANA_SHIP_GEAR);
  expect(serialized).not.toContain('"lagAdd":2');
  expect(serialized).not.toContain('"damage":16');
  expect(serialized).not.toContain('"hp":25');
  expect(serialized).not.toContain('船尾砲');
  expect(serialized).not.toContain('距離0');
});
