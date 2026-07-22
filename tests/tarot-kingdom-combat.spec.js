const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

let combatModulePromise;

function loadCombatModule() {
  if (!combatModulePromise) {
    const modulePath = path.join(__dirname, '..', 'public', 'js', 'tarotKingdomCombat.js');
    const source = fs.readFileSync(modulePath, 'utf8');
    const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
    combatModulePromise = import(moduleUrl);
  }
  return combatModulePromise;
}

test.describe('Tarot Kingdom combat calculations', () => {
  test('normal attacks use card strength and cap power scaling at 200', async () => {
    const combat = await loadCombatModule();
    const audit = {
      regular: combat.calculateTarotKingdomPlayerAttack({
        cardCount: 2,
        maxCardStrength: 11,
        power: 50
      }),
      capped: combat.calculateTarotKingdomPlayerAttack({
        cardCount: 5,
        maxCardStrength: 21,
        power: 999
      }),
      atCap: combat.calculateTarotKingdomPlayerAttack({
        cardCount: 5,
        maxCardStrength: 21,
        power: 200
      }),
      belowZero: combat.calculateTarotKingdomPlayerAttack({
        cardCount: 1,
        maxCardStrength: 8,
        power: -20
      })
    };

    expect(audit.regular).toEqual({ kind: 'attack', baseDamage: 41, damage: 61 });
    expect(audit.capped).toEqual({ kind: 'attack', baseDamage: 87, damage: 261 });
    expect(audit.capped).toEqual(audit.atCap);
    expect(audit.belowZero).toEqual({ kind: 'attack', baseDamage: 26, damage: 26 });
  });

  test('skills use role rate and cap intelligence scaling at 200', async () => {
    const combat = await loadCombatModule();
    const audit = {
      regular: combat.calculateTarotKingdomPlayerAttack({
        isSkill: true,
        roleRate: 4,
        intelligence: 75,
        cardCount: 1,
        power: 999
      }),
      capped: combat.calculateTarotKingdomPlayerAttack({
        isSkill: true,
        roleRate: 6,
        intelligence: 999
      }),
      atCap: combat.calculateTarotKingdomPlayerAttack({
        isSkill: true,
        roleRate: 6,
        intelligence: 200
      }),
      minimumRate: combat.calculateTarotKingdomPlayerAttack({
        isSkill: true,
        roleRate: -3,
        intelligence: -10
      })
    };

    expect(audit.regular).toEqual({ kind: 'skill', baseDamage: 144, damage: 252 });
    expect(audit.capped).toEqual({ kind: 'skill', baseDamage: 180, damage: 540 });
    expect(audit.capped).toEqual(audit.atCap);
    expect(audit.minimumRate).toEqual({ kind: 'skill', baseDamage: 90, damage: 90 });
  });

  test('enemy damage is reduced by defense with zero and minimum-damage handling', async () => {
    const combat = await loadCombatModule();
    const audit = {
      noDefense: combat.calculateTarotKingdomIncomingDamage(18, 0),
      moderateDefense: combat.calculateTarotKingdomIncomingDamage(18, 20),
      equalDefense: combat.calculateTarotKingdomIncomingDamage(10, 100),
      extremeDefense: combat.calculateTarotKingdomIncomingDamage(1, 10000),
      zeroAttack: combat.calculateTarotKingdomIncomingDamage(0, 10000),
      invalidDefense: combat.calculateTarotKingdomIncomingDamage(18, 'invalid')
    };

    expect(audit).toEqual({
      noDefense: 18,
      moderateDefense: 15,
      equalDefense: 5,
      extremeDefense: 1,
      zeroAttack: 0,
      invalidDefense: 18
    });
  });
});

test.describe('Tarot Kingdom NPC combat snapshots', () => {
  test('level formula and all three seat styles produce the intended integer stats', async () => {
    const combat = await loadCombatModule();
    const audit = {
      cautious: combat.createTarotKingdomNpcCharacter({ seat: 1, level: 10 }),
      balanced: combat.createTarotKingdomNpcCharacter({ seat: 2, level: 10 }),
      aggressive: combat.createTarotKingdomNpcCharacter({ seat: 3, level: 10 }),
      levelOne: combat.createTarotKingdomNpcCharacter({ seat: 2, level: 1 })
    };

    expect(audit.cautious).toMatchObject({
      source: 'npc',
      displayName: 'NPC1',
      level: 10,
      rankLabel: '守護 Lv10',
      combat: {
        maxHp: 127,
        power: 25,
        defense: 24,
        intelligence: 20,
        speed: 20,
        weaponType: 'shield'
      },
      equipment: { RightHand: 'sword_0', LeftHand: 'shield_0' }
    });
    expect(audit.balanced).toMatchObject({
      source: 'npc',
      displayName: 'NPC2',
      level: 10,
      rankLabel: '均衡 Lv10',
      combat: {
        maxHp: 116,
        power: 30,
        defense: 20,
        intelligence: 20,
        speed: 20,
        weaponType: 'sword'
      },
      equipment: { RightHand: 'sword_1' }
    });
    expect(audit.aggressive).toMatchObject({
      source: 'npc',
      displayName: 'NPC3',
      level: 10,
      rankLabel: '猛攻 Lv10',
      combat: {
        maxHp: 104,
        power: 36,
        defense: 16,
        intelligence: 20,
        speed: 20,
        weaponType: 'axe'
      },
      equipment: { RightHand: 'axe_2' }
    });
    expect(audit.levelOne.combat).toEqual({
      maxHp: 80,
      power: 8,
      defense: 4,
      intelligence: 3,
      speed: 4,
      weaponType: 'sword'
    });
  });
});

test.describe('Tarot Kingdom combat normalization', () => {
  test('combat normalization floors values, rejects negatives, and uses fallbacks', async () => {
    const combat = await loadCombatModule();
    const normalized = combat.normalizeTarotKingdomCombat({
      maxHp: '120.9',
      power: -3,
      defense: 'invalid',
      intelligence: Infinity,
      speed: 7.9,
      weaponType: ' SWORD '
    }, {
      maxHp: 90,
      defense: 9.8,
      intelligence: 12.7,
      weaponType: 'axe'
    });

    expect(normalized).toEqual({
      maxHp: 120,
      power: 0,
      defense: 9,
      intelligence: 12,
      speed: 7,
      weaponType: 'sword'
    });
  });

  test('character normalization fixes schema fields and preserves safe snapshot data', async () => {
    const combat = await loadCombatModule();
    const normalized = combat.normalizeTarotKingdomCharacter({
      version: 99,
      source: 'unknown',
      playFabId: ' PF-1 ',
      displayName: '   ',
      level: '5.8',
      rankLabel: '',
      avatarBase: { Race: 'elf', level: 99 },
      equipment: { RightHand: 'axe_2' },
      itemSource: { axe_2: { itemId: 'axe_2' } },
      combat: {
        maxHp: 0,
        power: '15.9',
        defense: -1,
        intelligence: 8,
        speed: 4,
        weaponType: ''
      }
    }, {
      combat: { maxHp: 80, weaponType: 'unarmed' }
    });

    expect(normalized).toEqual({
      version: 1,
      source: 'npc',
      playFabId: 'PF-1',
      displayName: '冒険者',
      level: 5,
      rankLabel: 'Lv5',
      avatarBase: { Race: 'elf', level: 5 },
      equipment: { RightHand: 'axe_2' },
      itemSource: { axe_2: { itemId: 'axe_2' } },
      combat: {
        maxHp: 1,
        power: 15,
        defense: 0,
        intelligence: 8,
        speed: 4,
        weaponType: 'unarmed'
      }
    });
  });
});
