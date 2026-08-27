const { test, expect } = require('@playwright/test');
const weaponRules = require('../public/js/tarotKingdomWeaponRules.shared.js');
const {
  TAROT_KINGDOM_EXPLORATION_STAGES
} = require('../server/tarotKingdomExplorationStages.js');

test.describe('Tarot Kingdom weapon traits and job proficiencies', () => {
  test('registered weapon profiles keep the v1 balance values', () => {
    expect(weaponRules.BASE_VERSION).toBe(1);
    expect(weaponRules.VERSION).toBe(2);
    expect(weaponRules.WEAKNESS_MULTIPLIER).toBe(1.25);
    expect(weaponRules.BACK_ROW_PHYSICAL_MULTIPLIER).toBe(0.75);
    expect(weaponRules.JOB_PROFICIENCY_MULTIPLIER).toBe(1.1);

    expect(weaponRules.getWeaponProfile('sword')).toMatchObject({
      formation: 'front', damageRate: 1, accuracyPoints: 5
    });
    expect(weaponRules.getWeaponProfile('dagger')).toMatchObject({
      statWeights: { power: 0.65, speed: 0.35 },
      damageRate: 0.88,
      accuracyPoints: 8,
      criticalPoints: 12,
      poisonChance: 0.12
    });
    expect(weaponRules.getWeaponProfile('axe_big')).toMatchObject({
      damageRate: 1.18,
      accuracyPoints: -8,
      varianceMin: 0.8,
      varianceMax: 1.2,
      defenseIgnoreRate: 0.15
    });
    expect(weaponRules.getWeaponProfile('gun_big')).toMatchObject({
      formation: 'back',
      statWeights: { power: 0.4, equipmentPower: 0.6 },
      damageRate: 1.05,
      accuracyPoints: -3,
      defenseIgnoreRate: 0.35,
      noAdvance: true
    });
    expect(weaponRules.getWeaponProfile('staff')).toMatchObject({
      statWeights: { power: 0.2, intelligence: 0.8 },
      damageRate: 0.82,
      damageKind: 'magic'
    });
    expect(weaponRules.getWeaponProfile('unarmed')).toMatchObject({
      damageRate: 0.9,
      accuracyPoints: 3,
      visualHitCount: 2
    });
  });

  test('dual wield, shield fallback, mixed range and legacy bow resolve correctly', () => {
    expect(weaponRules.resolveWeaponComponents(['dagger', 'sword']))
      .toMatchObject([{ weaponType: 'dagger', weight: 0.5 }, { weaponType: 'sword', weight: 0.5 }]);
    expect(weaponRules.resolveWeaponComponents(['dagger', 'dagger']))
      .toMatchObject([{ weaponType: 'dagger', weight: 0.5 }, { weaponType: 'dagger', weight: 0.5 }]);
    expect(weaponRules.resolveWeaponComponents(['sword', 'shield']))
      .toMatchObject([{ weaponType: 'sword', weight: 1 }]);
    expect(weaponRules.resolveWeaponComponents(['shield', 'dagger']))
      .toMatchObject([{ weaponType: 'dagger', weight: 1 }]);
    expect(weaponRules.resolveWeaponComponents(['shield', 'shield']))
      .toMatchObject([{ weaponType: 'unarmed', weight: 1 }]);
    expect(weaponRules.resolveFormation(['gun', 'gun_big'])).toBe('back');
    expect(weaponRules.resolveFormation(['gun', 'sword'])).toBe('front');
    expect(weaponRules.resolveFormation(['bow'])).toBe('back');
  });

  test('all 22 guardian jobs have valid proficient weapons', () => {
    expect(Object.keys(weaponRules.JOB_PROFICIENCIES)).toHaveLength(22);
    Object.entries(weaponRules.JOB_PROFICIENCIES).forEach(([number, definition]) => {
      expect(definition.jobName, `guardian ${number}`).toBeTruthy();
      expect(definition.weaponTypes.length, definition.jobName).toBeGreaterThan(0);
      definition.weaponTypes.forEach((weaponType) => {
        expect(weaponRules.getWeaponProfile(weaponType), `${definition.jobName}: ${weaponType}`).toBeTruthy();
      });
    });
    expect(weaponRules.getJobProficiency(4)).toMatchObject({
      number: 4,
      jobName: 'ナイト',
      weaponTypes: ['sword', 'polearm'],
      multiplier: 1.1
    });
    expect(weaponRules.isJobProficientWithWeapon(8, 'unarmed')).toBe(true);
    expect(weaponRules.isJobProficientWithWeapon(8, 'gun')).toBe(false);
    expect(weaponRules.getJobProficiencyWeaponLabels(21)).toEqual(['剣', '大剣']);
  });

  test('all 40 stage monsters and four rebirth forms have assigned ecology tags', () => {
    const stageRows = TAROT_KINGDOM_EXPLORATION_STAGES.flatMap((stage) => (
      stage.monsters.map((monster) => ({ stage, monster }))
    ));
    expect(stageRows).toHaveLength(40);
    expect(new Set(stageRows.map(({ monster }) => monster.monsterId)).size).toBe(40);

    stageRows.forEach(({ monster }) => {
      const tags = weaponRules.getMonsterTags(monster.monsterId);
      expect(tags.length, monster.monsterName).toBeGreaterThan(0);
      expect(monster.weaponTags).toEqual(tags);
      tags.forEach((tag) => expect(weaponRules.TAG_WEAK_FAMILIES[tag]).toBeTruthy());
    });

    const rebirthRows = stageRows.filter(({ monster }) => monster.rebirth);
    expect(rebirthRows).toHaveLength(4);
    rebirthRows.forEach(({ monster }) => {
      expect(monster.rebirth.targetWeaponTags)
        .toEqual(weaponRules.getMonsterTags(monster.rebirth.targetMonsterId));
    });
  });

  test('multiple ecology tags deduplicate weapon weakness families', () => {
    expect(weaponRules.getWeakFamiliesForTags(['armored', 'flying']))
      .toEqual(['heavy', 'ranged', 'polearm']);
    expect(weaponRules.getWeakFamiliesForTags(['plant', 'brittle']))
      .toEqual(['blade', 'heavy']);
    expect(weaponRules.isWeaponFamilyWeak('ranged', ['armored', 'flying'])).toBe(true);
    expect(weaponRules.isWeaponFamilyWeak('dagger', ['armored', 'flying'])).toBe(false);
  });
});

test.describe('Tarot Kingdom weapon trait battle integration', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/tarot-kingdom-preview.html?tkfixture=weapon-traits', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.TarotKingdomDebug?.battleScenario === 'function');
  });

  test('direct attacks record weakness, hit, critical and dagger poison decisions', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const card = { id: 'weapon-dagger-card', kind: 'minor', suit: 'Wand', number: 8 };
      debug.battleScenario({
        withTrick: false,
        handsBySeat: [[card]],
        enemyHp: 5000,
        enemyMaxHp: 5000,
        enemyDefense: 0,
        enemySpeed: 0,
        enemyWeaponTags: ['vital'],
        combatBySeat: [{
          maxHp: 100,
          power: 100,
          defense: 0,
          intelligence: 60,
          speed: 80,
          equipmentPower: 20,
          equipmentMagicPower: 0,
          weaponType: 'dagger',
          weaponTypes: ['dagger'],
          weaponSlots: ['dagger'],
          formation: 'front'
        }]
      });
      debug.battleSetCombatRandom(0.05);
      const play = { type: 'set', count: 1, owner: 0, cardsHand: [card], cardsTable: [card] };
      const preview = debug.battleDamageForPlay(0, play);
      const applied = debug.battleApplyDirectAttack(0, play);
      return { preview, applied };
    });

    expect(audit.preview.weaponTrait).toMatchObject({
      version: 2,
      formation: 'front',
      accuracyPoints: 8,
      criticalPoints: 12,
      poisonChance: 0.12,
      weak: true,
      weaknessMultiplier: 1.25
    });
    expect(audit.applied.event).toMatchObject({
      attackMissed: false,
      weaponEffectName: '',
      weaponTrait: {
        poisonRoll: 0.05,
        poisonSuccess: true,
        components: [{ weaponType: 'dagger', weak: true, weight: 1 }]
      }
    });
    expect(audit.applied.event.effects.some((effect) => effect.kind === 'critical')).toBe(true);
    expect(audit.applied.event.effects.some((effect) => effect.kind === 'weaponWeak')).toBe(true);
    expect(audit.applied.state.battle.effects.enemy.poison).toMatchObject({
      source: 'weapon-trait',
      remainingActions: 3
    });
  });

  test('guardian jobs boost only their proficient weapon components', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const minor = { id: 'job-weapon-minor', kind: 'minor', suit: 'Cup', number: 8 };
      const major = { id: 'job-weapon-major', kind: 'major', number: 4 };
      const setup = (guardianNumber, weaponSlots, card = minor) => {
        debug.battleScenario({
          withTrick: false,
          handsBySeat: [[card]],
          enemyHp: 5000,
          enemyMaxHp: 5000,
          enemyDefense: 0,
          enemyWeaponTags: [],
          charactersBySeat: [{ guardianArcana: { number: guardianNumber, cardLevel: 1 } }],
          combatBySeat: [{
            power: 100,
            speed: 80,
            intelligence: 60,
            equipmentPower: 20,
            weaponType: weaponSlots[0],
            weaponTypes: weaponSlots,
            weaponSlots
          }]
        });
        debug.battleSetCombatRandom(0.01);
        const play = {
          type: 'set', count: 1, owner: 0, cardsHand: [card], cardsTable: [card]
        };
        return { play, preview: debug.battleDamageForPlay(0, play) };
      };

      const knight = setup(4, ['sword']);
      const knightEvent = debug.battleApplyDirectAttack(0, knight.play).event;
      const mageSword = setup(5, ['sword']).preview;
      const dualKnight = setup(4, ['sword', 'dagger']).preview;
      const majorKnight = setup(4, ['sword'], major).preview;

      setup(4, ['sword']);
      const v1Payload = debug.battlePublicState();
      v1Payload.schema = 34;
      v1Payload.state.rules.weaponRulesVersion = 1;
      const v1State = debug.battleDeserialize(v1Payload);
      const v1Preview = debug.battleDamageForPlay(0, {
        type: 'set', count: 1, owner: 0, cardsHand: [minor], cardsTable: [minor]
      });

      return {
        knight: knight.preview,
        knightEvent,
        mageSword,
        dualKnight,
        majorKnight,
        v1State,
        v1Preview
      };
    });

    expect(audit.knight.weaponTrait.jobProficiency).toMatchObject({
      number: 4,
      jobName: 'ナイト',
      active: true,
      multiplier: 1.1,
      matchedWeaponTypes: ['sword']
    });
    expect(audit.knight.weaponTrait.components[0]).toMatchObject({
      weaponType: 'sword',
      jobProficient: true,
      jobProficiencyMultiplier: 1.1
    });
    expect(audit.knight.weaponTrait.damage).toBeGreaterThan(audit.mageSword.weaponTrait.damage);
    expect(audit.mageSword.weaponTrait.jobProficiency).toMatchObject({
      jobName: '魔導士', active: false, multiplier: 1
    });
    expect(audit.dualKnight.weaponTrait.jobProficiency).toMatchObject({
      active: true, multiplier: 1.05, matchedWeaponTypes: ['sword']
    });
    expect(audit.majorKnight.weaponTrait.jobProficiency).toMatchObject({
      active: true, multiplier: 1.1
    });
    expect(audit.knightEvent.effects).toContainEqual(expect.objectContaining({
      kind: 'jobWeaponProficiency',
      label: '得意武器・ナイト',
      multiplier: 1.1
    }));
    expect(audit.v1State.rules.weaponRulesVersion).toBe(1);
    expect(audit.v1Preview.weaponTrait).toBeTruthy();
    expect(audit.v1Preview.weaponTrait.jobProficiency).toBeNull();
  });

  test('every active weapon resolves its stat reference and fixed variance in battle', async ({ page }) => {
    const components = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const weaponTypes = [
        'sword', 'sword_big', 'dagger', 'axe', 'axe_big', 'blunt',
        'polearm', 'gun', 'gun_big', 'staff', 'wand', 'unarmed'
      ];
      return Object.fromEntries(weaponTypes.map((weaponType) => {
        const card = { id: `profile-${weaponType}`, kind: 'minor', suit: 'Cup', number: 6 };
        debug.battleScenario({
          withTrick: false,
          handsBySeat: [[card]],
          enemyWeaponTags: [],
          charactersBySeat: [{ level: 10, equipment: {}, itemSource: {} }],
          combatBySeat: [{
            power: 100,
            speed: 80,
            intelligence: 60,
            equipmentPower: 20,
            equipmentMagicPower: 10,
            weaponType,
            weaponTypes: [weaponType],
            weaponSlots: [weaponType],
            formation: ['gun', 'gun_big'].includes(weaponType) ? 'back' : 'front'
          }]
        });
        debug.battleSetCombatRandom(0.25);
        const result = debug.battleDamageForPlay(0, {
          type: 'set', count: 1, owner: 0, cardsHand: [card], cardsTable: [card]
        });
        return [weaponType, result.weaponTrait.components[0]];
      }));
    });

    expect(components.sword.effectiveStat).toBe(100);
    expect(components.dagger.effectiveStat).toBe(93);
    expect(components.gun.effectiveStat).toBe(56);
    expect(components.gun_big.effectiveStat).toBe(52);
    expect(components.staff.effectiveStat).toBe(68);
    expect(components.wand.effectiveStat).toBe(68);
    expect(components.axe.varianceMultiplier).toBeCloseTo(0.925, 8);
    expect(components.axe_big.varianceMultiplier).toBeCloseTo(0.9, 8);
    expect(components.blunt.varianceMultiplier).toBeCloseTo(0.95, 8);
    expect(components.unarmed.levelMultiplier).toBeCloseTo(1.036, 8);
    Object.values(components).forEach((component) => expect(component.damage).toBeGreaterThan(0));
  });

  test('weapon stat references use the current buffed and debuffed combat values', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const card = { id: 'current-stat-card', kind: 'minor', suit: 'Cup', number: 6 };
      const setup = (weaponType) => debug.battleScenario({
        withTrick: false,
        handsBySeat: [[card]],
        combatBySeat: [{
          power: 100,
          speed: 80,
          intelligence: 60,
          weaponType,
          weaponTypes: [weaponType],
          weaponSlots: [weaponType]
        }]
      });
      const play = { type: 'set', count: 1, owner: 0, cardsHand: [card], cardsTable: [card] };
      setup('sword');
      debug.battleSetEffects({
        enemy: {}, party: {},
        players: [{ powerUp: { potency: 50, remainingTurns: 1 } }, {}, {}, {}]
      });
      const sword = debug.battleDamageForPlay(0, play).weaponTrait.components[0];
      setup('dagger');
      debug.battleSetEffects({
        enemy: {}, party: {},
        players: [{
          powerDown: { potency: 20, remainingTurns: 1 },
          speedUp: { potency: 25, remainingTurns: 1 }
        }, {}, {}, {}]
      });
      const dagger = debug.battleDamageForPlay(0, play).weaponTrait.components[0];
      return { sword, dagger };
    });

    expect(audit.sword.effectiveStat).toBe(150);
    expect(audit.dagger.effectiveStat).toBe(87);
  });

  test('one weak hand in dual wield resolves to x1.125 and halves dagger poison chance', async ({ page }) => {
    const trait = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const card = { id: 'dual-card', kind: 'minor', suit: 'Cup', number: 6 };
      debug.battleScenario({
        withTrick: false,
        handsBySeat: [[card]],
        enemyWeaponTags: ['soft'],
        combatBySeat: [{
          power: 100,
          speed: 80,
          equipmentPower: 20,
          weaponType: 'sword',
          weaponTypes: ['sword', 'dagger'],
          weaponSlots: ['sword', 'dagger'],
          formation: 'front'
        }]
      });
      return debug.battleDamageForPlay(0, {
        type: 'set', count: 1, owner: 0, cardsHand: [card], cardsTable: [card]
      }).weaponTrait;
    });

    expect(trait.components).toMatchObject([
      { weaponType: 'sword', weight: 0.5, weak: true, weaknessMultiplier: 1.25 },
      { weaponType: 'dagger', weight: 0.5, weak: false, weaknessMultiplier: 1 }
    ]);
    expect(trait.weaknessMultiplier).toBeCloseTo(1.125, 8);
    expect(trait.poisonChance).toBeCloseTo(0.06, 8);
  });

  test('weapon weakness is hidden before the hit and appears only during the matching attack', async ({ page }) => {
    await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const card = { id: 'weak-ui-card', kind: 'minor', suit: 'Cup', number: 7 };
      debug.battleScenario({
        withTrick: false,
        handsBySeat: [[card, { id: 'weak-ui-reserve', kind: 'minor', suit: 'Cup', number: 9 }]],
        enemyWeaponTags: ['soft'],
        combatBySeat: [{
          weaponType: 'sword',
          weaponTypes: ['sword'],
          weaponSlots: ['sword'],
          formation: 'front'
        }]
      });
      debug.battleRender();
    });
    await expect(page.locator('.tarot-kingdom-affinity-badge.is-weapon-weak')).toHaveCount(0);
    await page.evaluate(() => window.TarotKingdomDebug.battlePlayCards(0, ['weak-ui-card'], { resolve: false }));
    const weakBadge = page.locator('.tarot-kingdom-affinity-badge.is-weapon-weak');
    await expect(weakBadge).toContainText('WEAK');
    const weakLayout = await weakBadge.evaluate((element) => {
      const badge = element.getBoundingClientRect();
      const stage = element.closest('#tarotKingdomBattleStage')?.getBoundingClientRect();
      return stage ? {
        inside: badge.left >= stage.left
          && badge.right <= stage.right
          && badge.top >= stage.top
          && badge.bottom <= stage.bottom
      } : { inside: false };
    });
    expect(weakLayout.inside).toBe(true);
  });

  test('back row reduces only physical damage and renders the formation badge', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({
        combatBySeat: [{
          maxHp: 100,
          defense: 0,
          weaponType: 'gun',
          weaponTypes: ['gun'],
          weaponSlots: ['gun'],
          formation: 'back'
        }]
      });
      const physical = debug.battleFormationDamage(0, 100, 'physical');
      const magic = debug.battleFormationDamage(0, 100, 'magic');
      debug.battleRender();
      return { physical, magic };
    });

    expect(audit.physical).toMatchObject({ amount: 75, formation: 'back' });
    expect(audit.physical.effects).toMatchObject([{
      kind: 'formationReduction', potency: 25, damageKind: 'physical'
    }]);
    expect(audit.magic).toMatchObject({ amount: 100, formation: 'back', effects: [] });
    const row = page.locator('.tarot-kingdom-battle-player[data-player-index="0"]');
    await expect(row).toHaveClass(/is-back-row/);
    await expect(row.locator('.tarot-kingdom-battle-player-formation')).toHaveText('後');
    const mobileLayout = await row.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const name = element.querySelector('.tarot-kingdom-battle-player-name')?.getBoundingClientRect();
      const formation = element.querySelector('.tarot-kingdom-battle-player-formation')?.getBoundingClientRect();
      const hp = element.querySelector('.tarot-kingdom-battle-player-hp')?.getBoundingClientRect();
      const isInside = (rect) => !!rect
        && rect.left >= bounds.left
        && rect.right <= bounds.right
        && rect.top >= bounds.top
        && rect.bottom <= bounds.bottom;
      const overlaps = (a, b) => !!a && !!b
        && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      return {
        nameInside: isInside(name),
        formationInside: isInside(formation),
        hpInside: isInside(hp),
        nameFormationOverlap: overlaps(name, formation),
        nameHpOverlap: overlaps(name, hp)
      };
    });
    expect(mobileLayout).toEqual({
      nameInside: true,
      formationInside: true,
      hpInside: true,
      nameFormationOverlap: false,
      nameHpOverlap: false
    });
  });

  test('single, area and cover attacks use the final physical target formation', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const combatBySeat = [
        { maxHp: 200, defense: 0, weaponType: 'gun', weaponTypes: ['gun'], weaponSlots: ['gun'], formation: 'back' },
        { maxHp: 200, defense: 0, weaponType: 'sword', weaponTypes: ['sword'], weaponSlots: ['sword'], formation: 'front' },
        { maxHp: 200, defense: 0, weaponType: 'sword', weaponTypes: ['sword'], weaponSlots: ['sword'], formation: 'front' },
        { maxHp: 200, defense: 0, weaponType: 'sword', weaponTypes: ['sword'], weaponSlots: ['sword'], formation: 'front' }
      ];
      const scenario = () => debug.battleScenario({
        withTrick: false,
        hpBySeat: [200, 200, 200, 200],
        combatBySeat,
        enemyAilment: null,
        enemyAbilities: { version: 1, attacks: { single: null, area: null }, special: null }
      });
      scenario();
      const single = debug.battleApplyEnemySingleAttack(0);
      scenario();
      const area = debug.battleApplyEnemyAreaAttack();
      scenario();
      debug.battleSetEffects({
        enemy: {},
        party: { cover: { coverIndex: 1, protectedIndex: 0, potency: 10, charges: 1 } },
        players: [{}, {}, {}, {}]
      });
      const covered = debug.battleApplyEnemySingleAttack(0);
      return { single, area, covered };
    });

    expect(audit.single.event.effects).toContainEqual(expect.objectContaining({
      kind: 'formationReduction', targetIndex: 0, potency: 25
    }));
    const backAreaDamage = audit.area.event.damages.find((entry) => entry.playerIndex === 0).damage;
    const frontAreaDamage = audit.area.event.damages.find((entry) => entry.playerIndex === 1).damage;
    expect(backAreaDamage).toBe(Math.floor(frontAreaDamage * 0.75));
    expect(audit.covered.event.targetIndexes).toEqual([1]);
    expect(audit.covered.event.effects.some((effect) => effect.kind === 'formationReduction')).toBe(false);
  });

  test('host-confirmed weapon components and random decisions survive public-state reconnect', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const card = { id: 'weapon-sync-card', kind: 'minor', suit: 'Cup', number: 8 };
      debug.battleScenario({
        withTrick: false,
        handsBySeat: [[card]],
        enemyHp: 1000,
        enemyMaxHp: 1000,
        enemyDefense: 40,
        enemyWeaponTags: ['vital'],
        charactersBySeat: [{ guardianArcana: { number: 7, cardLevel: 1 } }],
        combatBySeat: [{
          power: 100,
          speed: 80,
          equipmentPower: 20,
          weaponType: 'axe',
          weaponTypes: ['axe', 'dagger'],
          weaponSlots: ['axe', 'dagger'],
          formation: 'front'
        }]
      });
      debug.battleSetCombatRandom(0.25);
      const play = { type: 'set', count: 1, owner: 0, cardsHand: [card], cardsTable: [card] };
      const original = debug.battleApplyDirectAttack(0, play).event;
      const payload = debug.battlePublicState();
      const restoredState = debug.battleDeserialize(payload);
      return {
        original,
        restored: restoredState.battle.events.at(-1),
        formation: restoredState.players[0].character.combat.formation,
        weaponRulesVersion: restoredState.rules.weaponRulesVersion
      };
    });

    expect(audit.original.weaponTrait).toMatchObject({
      formation: 'front',
      poisonChance: 0.06,
      poisonRoll: 0.25,
      poisonSuccess: false,
      jobProficiency: {
        number: 7,
        jobName: 'バーサーカー',
        active: true,
        multiplier: 1.05,
        matchedWeaponTypes: ['axe']
      },
      components: [
        { weaponType: 'axe', weight: 0.5, varianceRoll: 0.25, defenseIgnoreRate: 0.1 },
        { weaponType: 'dagger', weight: 0.5, varianceRoll: null, criticalPoints: 12 }
      ]
    });
    expect(audit.restored.weaponTrait).toEqual(audit.original.weaponTrait);
    expect(audit.restored.accuracyRoll).toBe(audit.original.accuracyRoll);
    expect(audit.formation).toBe('front');
    expect(audit.weaponRulesVersion).toBe(2);
  });

  test('five-card roles do not receive weapon traits and schema 33 keeps legacy rules', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({
        combatBySeat: [{ weaponType: 'sword', weaponTypes: ['sword'], weaponSlots: ['sword'] }]
      });
      const cards = [2, 3, 4, 5, 6].map((number) => ({
        id: `role-${number}`, kind: 'minor', suit: 'Cup', number
      }));
      const role = debug.battleDamageForPlay(0, {
        type: 'role',
        count: 5,
        owner: 0,
        cardsHand: cards,
        cardsTable: cards,
        role: { key: 'Straight', effectiveRate: 1.5 }
      });
      const legacyPayload = debug.battlePublicState();
      legacyPayload.schema = 33;
      delete legacyPayload.state.rules.weaponRulesVersion;
      const legacyState = debug.battleDeserialize(legacyPayload);
      const legacyCard = { id: 'legacy-sword-card', kind: 'minor', suit: 'Sword', number: 7 };
      const legacyAttack = debug.battleApplyDirectAttack(0, {
        type: 'set', count: 1, owner: 0, cardsHand: [legacyCard], cardsTable: [legacyCard]
      }).event;
      return { role, legacyState, legacyAttack };
    });

    expect(audit.role.weaponTrait).toBeUndefined();
    expect(audit.legacyState.rules.weaponRulesVersion).toBe(0);
    expect(audit.legacyAttack.weaponTrait).toBeNull();
    expect(audit.legacyAttack.weaponEffectName).toBe('有効打');
  });
});
