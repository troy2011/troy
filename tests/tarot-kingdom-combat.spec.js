const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

let combatModulePromise;

function loadCombatModule() {
  if (!combatModulePromise) {
    globalThis.__TAROT_KINGDOM_ARCANA_EFFECTS__ = JSON.parse(fs.readFileSync(
      path.join(__dirname, '..', 'public', 'data', 'tarot-kingdom-arcana-effects.json'),
      'utf8'
    ));
    globalThis.__TAROT_KINGDOM_LEGACY_ARCANA_EFFECTS__ = JSON.parse(fs.readFileSync(
      path.join(__dirname, '..', 'public', 'data', 'tarot-kingdom-arcana-effects-v2.json'),
      'utf8'
    ));
    globalThis.__TAROT_KINGDOM_ARCANA_AP_EFFECTS__ = JSON.parse(fs.readFileSync(
      path.join(__dirname, '..', 'public', 'data', 'tarot-kingdom-arcana-ap-effects.json'),
      'utf8'
    ));
    const statusesPath = path.join(__dirname, '..', 'public', 'js', 'tarotKingdomStatuses.js');
    const statusesUrl = `data:text/javascript;base64,${Buffer.from(fs.readFileSync(statusesPath, 'utf8')).toString('base64')}`;
    const v3Path = path.join(__dirname, '..', 'public', 'js', 'tarotKingdomEffectsV3.js');
    const v3Source = fs.readFileSync(v3Path, 'utf8')
      .replace(/'\.\/tarotKingdomStatuses\.js\?v=[^']+'/, `'${statusesUrl}'`);
    const v3Url = `data:text/javascript;base64,${Buffer.from(v3Source).toString('base64')}`;
    const modulePath = path.join(__dirname, '..', 'public', 'js', 'tarotKingdomCombat.js');
    const effectsPath = path.join(__dirname, '..', 'public', 'js', 'tarotKingdomEffects.js');
    const effectsSource = fs.readFileSync(effectsPath, 'utf8')
      .replace(/'\.\/tarotKingdomEffectsV3\.js\?v=[^']+'/, `'${v3Url}'`)
      .replace(/'\.\/tarotKingdomStatuses\.js\?v=[^']+'/, `'${statusesUrl}'`);
    const effectsUrl = `data:text/javascript;base64,${Buffer.from(effectsSource).toString('base64')}`;
    const source = fs.readFileSync(modulePath, 'utf8')
      .replace(/'\.\/tarotKingdomEffects\.js[^']*'/, `'${effectsUrl}'`);
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

  test('schema 14 growth makes level and strong equipment visibly increase damage', async () => {
    const combat = await loadCombatModule();
    const baseAttack = combat.calculateTarotKingdomPlayerAttack({
      cardCount: 3,
      maxCardStrength: 14,
      power: 100,
      level: 1,
      equipmentPower: 0,
      growthVersion: 1
    });
    const grownAttack = combat.calculateTarotKingdomPlayerAttack({
      cardCount: 3,
      maxCardStrength: 14,
      power: 100,
      level: 51,
      equipmentPower: 50,
      growthVersion: 1
    });
    const grownSkill = combat.calculateTarotKingdomPlayerAttack({
      isSkill: true,
      roleRate: 5,
      intelligence: 200,
      level: 51,
      equipmentMagicPower: 40,
      growthVersion: 1
    });

    expect(baseAttack).toEqual({ kind: 'attack', baseDamage: 56, damage: 112 });
    expect(grownAttack).toEqual({ kind: 'attack', baseDamage: 56, damage: 210 });
    expect(grownSkill).toEqual({ kind: 'skill', baseDamage: 162, damage: 874 });
  });

  test('schema 21 damage tiers keep five-card roles above resonance, multi-card, major, and normal attacks', async () => {
    const combat = await loadCombatModule();
    const shared = {
      maxCardStrength: 10,
      power: 80,
      intelligence: 80,
      level: 30,
      equipmentPower: 30,
      equipmentMagicPower: 30,
      growthVersion: 1,
      damageBalanceVersion: 1
    };
    const normal = combat.calculateTarotKingdomPlayerAttack({ ...shared, cardCount: 1 });
    const major = combat.calculateTarotKingdomPlayerAttack({ ...shared, cardCount: 1, isMajor: true });
    const pair = combat.calculateTarotKingdomPlayerAttack({ ...shared, cardCount: 2 });
    const triple = combat.calculateTarotKingdomPlayerAttack({ ...shared, cardCount: 3 });
    const resonanceDamage = normal.damage + combat.getTarotKingdomResonanceDamageFloor(
      normal.damage,
      1,
      1
    );
    const role = combat.calculateTarotKingdomPlayerAttack({
      ...shared,
      isSkill: true,
      roleRate: 1
    });

    expect(normal.damage).toBeLessThan(major.damage);
    expect(major.damage).toBeLessThan(pair.damage);
    expect(pair.damage).toBeLessThan(triple.damage);
    expect(triple.damage).toBeLessThan(resonanceDamage);
    expect(resonanceDamage).toBeLessThan(role.damage);
    expect(combat.getTarotKingdomMajorSecondaryDamageScale(1)).toBe(0.12);
    expect(combat.getTarotKingdomMajorSecondaryDamageScale(0)).toBe(1);
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
  test('legacy pet stats fall back to the player level and the matching enemy archetype without equipment effects', async () => {
    const combat = await loadCombatModule();
    const pet = combat.createTarotKingdomPetCharacter({
      pet: {
        monsterId: 'ismartal-vol1-monster-01',
        monsterName: 'トゲマル',
        nickname: 'コハク',
        displayName: 'コハク',
        number: 1
      },
      level: 10
    });

    expect(pet).toMatchObject({
      source: 'pet',
      monsterId: 'ismartal-vol1-monster-01',
      displayName: 'コハク',
      level: 10,
      equipment: {},
      tarotDeck: [],
      combat: {
        maxHp: 130,
        power: 34,
        defense: 21,
        intelligence: 19,
        speed: 17,
        weaponType: 'unarmed',
        weaponTypes: ['unarmed']
      }
    });
    expect(combat.getTarotKingdomPetAiStyle({ number: 1 })).toBe('aggressive');
  });

  test('a saved pet level overrides the owner level for combat stats', async () => {
    const combat = await loadCombatModule();
    const pet = combat.createTarotKingdomPetCharacter({
      pet: {
        monsterId: 'ismartal-vol1-monster-01',
        displayName: 'コハク',
        number: 1,
        level: 4
      },
      level: 10
    });

    expect(pet).toMatchObject({
      source: 'pet',
      level: 4,
      rankLabel: '仲間 Lv4',
      combat: {
        maxHp: 103,
        power: 14,
        defense: 8,
        intelligence: 8,
        speed: 7
      }
    });
  });

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
      equipmentPower: 0,
      equipmentMagicPower: 0,
      weaponType: 'sword',
      weaponTypes: ['sword']
    });
  });

  test('exploration pirates randomize avatar and equipment while inheriting player body colors', async () => {
    const combat = await loadCombatModule();
    const playerAvatarBase = {
      Race: 'human',
      AvatarColor: 'purple',
      SkinColorIndex: 6
    };
    const first = combat.createTarotKingdomExplorationNpcCharacter({
      seat: 1,
      level: 14,
      playerAvatarBase,
      random: () => 0
    });
    const last = combat.createTarotKingdomExplorationNpcCharacter({
      seat: 3,
      level: 14,
      playerAvatarBase,
      random: () => 0.999999
    });

    expect(first).toMatchObject({
      displayName: 'はぐれ海賊1',
      avatarBase: {
        Race: 'human',
        AvatarColor: 'purple',
        SkinColorIndex: 6,
        FaceIndex: 1,
        HairStyleIndex: 1
      },
      equipment: {
        RightHand: 'sword_01',
        LeftHand: 'shield_01',
        Armor: 'leather01_01'
      },
      combat: {
        weaponType: 'sword',
        weaponTypes: ['sword', 'shield']
      }
    });
    expect(last).toMatchObject({
      displayName: 'はぐれ海賊3',
      avatarBase: {
        Race: 'human',
        AvatarColor: 'purple',
        SkinColorIndex: 6,
        FaceIndex: 10,
        HairStyleIndex: 10
      },
      equipment: {
        RightHand: 'polearm_30',
        Armor: 'metal_26'
      },
      combat: {
        weaponType: 'polearm',
        weaponTypes: ['polearm']
      }
    });
    expect(last.equipment.LeftHand).toBeUndefined();
    expect(first.itemSource[first.equipment.RightHand].customData.WeaponType).toBe('sword');
    expect(last.itemSource[last.equipment.RightHand].customData.WeaponType).toBe('polearm');
    expect(Object.values(first.itemSource).every((item) => item.customData.Rarity === 'common')).toBe(true);
    expect(Object.values(last.itemSource).every((item) => item.customData.Rarity === 'common')).toBe(true);
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
      equipmentPower: 0,
      equipmentMagicPower: 0,
      weaponType: 'sword',
      weaponTypes: ['sword']
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
      version: 4,
      source: 'npc',
      playFabId: 'PF-1',
      displayName: '冒険者',
      level: 5,
      rankLabel: 'Lv5',
      avatarBase: { Race: 'elf', level: 5 },
      equipment: { RightHand: 'axe_2' },
      itemSource: { axe_2: { itemId: 'axe_2' } },
      tarotDeck: [],
      guardianArcana: null,
      combat: {
        maxHp: 1,
        power: 15,
        defense: 0,
        intelligence: 8,
        speed: 4,
        equipmentPower: 0,
        equipmentMagicPower: 0,
        weaponType: 'unarmed',
        weaponTypes: ['unarmed']
      }
    });
  });
});
