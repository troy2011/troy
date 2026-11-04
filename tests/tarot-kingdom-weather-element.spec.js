const { test, expect } = require('@playwright/test');

const FIRE_MONSTER_ID = 'ismartal-vol1-monster-01';

async function openKingdomDebug(page) {
  await page.goto('/tarot-kingdom-preview.html?tkfixture=character-battle', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.TarotKingdomDebug?.battleResolveMajorEffect === 'function');
}

test.describe('Tarot Kingdom weather element power', () => {
  test.beforeEach(async ({ page }) => {
    await openKingdomDebug(page);
  });

  test('a major arcana weather powers its element up and the opposite one down for the party', async ({ page }) => {
    const audit = await page.evaluate((monsterId) => {
      const debug = window.TarotKingdomDebug;
      const fireHit = (resolved) => resolved.result.results.find((entry) => entry.kind === 'major-damage');
      debug.battleSetDemoEnemy(monsterId);
      debug.battleScenario({ withTrick: true, enemyHp: 5000, enemyMaxHp: 5000, enemyDefense: 0 });
      debug.battleSetCombatRandom(0.1);
      const clear = fireHit(debug.battleResolveMajorEffect(0, 19));
      const sunState = debug.battleState();
      const sunny = fireHit(debug.battleResolveMajorEffect(0, 19));
      debug.battleResolveMajorEffect(0, 17);
      const starState = debug.battleState();
      const starry = fireHit(debug.battleResolveMajorEffect(0, 19));
      return {
        clear,
        sunny,
        starry,
        sunWeather: sunState.battle.weather,
        starWeather: starState.battle.weather,
        rules: sunState.rules.weatherElementVersion
      };
    }, FIRE_MONSTER_ID);

    expect(audit.rules).toBe(1);
    expect(audit.sunWeather.key).toBe('sun');
    expect(audit.starWeather.key).toBe('star');
    // the summon's own hit lands before its weather turns
    expect(audit.sunny.affinityMultiplier).toBeCloseTo(audit.clear.affinityMultiplier * 1.2, 5);
    expect(audit.sunny.amount).toBeGreaterThan(audit.clear.amount);
    expect(audit.starry.affinityMultiplier).toBeCloseTo(audit.clear.affinityMultiplier * 0.8, 5);
  });

  test('the weather powers the enemy attacks of its native element too', async ({ page }) => {
    const audit = await page.evaluate((monsterId) => {
      const debug = window.TarotKingdomDebug;
      const weatherEffect = (attack) => attack.event?.effects?.find((entry) => entry.kind === 'weather') || null;
      debug.battleSetDemoEnemy(monsterId);
      debug.battleScenario({ withTrick: true, enemyHp: 5000, enemyMaxHp: 5000 });
      debug.battleSetCombatRandom(0.5);
      const clear = weatherEffect(debug.battleApplyEnemySingleAttack(0));
      debug.battleResolveMajorEffect(0, 19);
      const sunny = weatherEffect(debug.battleApplyEnemySingleAttack(0));
      debug.battleResolveMajorEffect(0, 17);
      const starryArea = weatherEffect(debug.battleApplyEnemyAreaAttack());
      return { clear, sunny, starryArea };
    }, FIRE_MONSTER_ID);

    expect(audit.clear).toBeNull();
    expect(audit.sunny).toEqual({ kind: 'weather', potency: 20 });
    expect(audit.starryArea).toEqual({ kind: 'weather', potency: -20 });
  });

  test('a Royal Lock turns the weather to its suit, and only its own weather ends with it', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const badgeText = () => {
        debug.battleRender();
        const badge = document.querySelector('#tarotKingdomBattleStage .tarot-kingdom-weather-element-badge');
        return badge && !badge.hidden ? badge.textContent : '';
      };
      const withLockEnded = (weather) => {
        const payload = debug.battlePublicState();
        payload.state.lock = null;
        payload.state.battle.weather = weather;
        debug.battleApplyRemoteState(payload);
        return badgeText();
      };
      debug.battleScenario({ withTrick: true, lockSuit: 'Cup', enemyHp: 5000, enemyMaxHp: 5000 });
      const locked = badgeText();
      debug.battleResolveMajorEffect(0, 19);
      const sunOverLock = debug.battleState().battle.weather;
      const sunBadge = badgeText();
      return {
        locked,
        sunOverLock,
        sunBadge,
        sunAfterLock: withLockEnded({ key: 'sun', field: 'lock-cup' }),
        lockAfterLock: withLockEnded({ key: 'lock-cup', field: 'lock-cup' })
      };
    });

    expect(audit.locked).toBe('水↑火↓');
    expect(audit.sunOverLock).toEqual({ key: 'sun', field: 'lock-cup' });
    expect(audit.sunBadge).toBe('火↑水↓');
    expect(audit.sunAfterLock).toBe('火↑水↓');
    expect(audit.lockAfterLock).toBe('');
  });

  test('a host on the old schema keeps the weather out of the damage', async ({ page }) => {
    const rules = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({ withTrick: true });
      const payload = debug.battlePublicState();
      payload.schema = 37;
      delete payload.state.rules.weatherElementVersion;
      debug.battleApplyRemoteState(payload);
      return debug.battleState().rules;
    });
    expect(rules.weatherElementVersion).toBe(0);
  });
});

test.describe('Tarot Kingdom equipment option combat', () => {
  test.beforeEach(async ({ page }) => {
    await openKingdomDebug(page);
  });

  test('element damage and critical rate from equipment options raise the party attacks', async ({ page }) => {
    const audit = await page.evaluate((monsterId) => {
      const debug = window.TarotKingdomDebug;
      const fireHit = (resolved) => resolved.result.results.find((entry) => entry.kind === 'major-damage');
      const run = (combat) => {
        debug.battleSetDemoEnemy(monsterId);
        debug.battleScenario({
          withTrick: true,
          enemyHp: 5000,
          enemyMaxHp: 5000,
          enemyDefense: 0,
          combatBySeat: [combat]
        });
        debug.battleSetCombatRandom(0.05);
        return fireHit(debug.battleResolveMajorEffect(0, 19));
      };
      const plain = run({});
      const fireUp = run({ elementDamage: { fire: 27 } });
      const waterUp = run({ elementDamage: { water: 27 } });
      const critical = run({ criticalRate: 9 });
      return { plain, fireUp, waterUp, critical, character: debug.battleState().players[0].character.combat };
    }, FIRE_MONSTER_ID);

    expect(audit.fireUp.amount).toBeGreaterThan(audit.plain.amount);
    expect(audit.waterUp.amount).toBe(audit.plain.amount);
    expect(audit.critical.amount).toBeGreaterThan(audit.plain.amount);
    expect(audit.character.criticalRate).toBe(9);
  });
});
