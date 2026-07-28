const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

let summonsModulePromise;

function loadSummonsModule() {
  if (!summonsModulePromise) {
    const modulePath = path.join(__dirname, '..', 'public', 'js', 'tarotKingdomSummons.js');
    const source = fs.readFileSync(modulePath, 'utf8');
    summonsModulePromise = import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  }
  return summonsModulePromise;
}

async function openKingdomDebug(page) {
  await page.goto('/tarot-kingdom-preview.html?tkfixture=character-battle', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.TarotKingdomDebug?.battleSummonResolve === 'function');
}

test.describe('Tarot Kingdom deterministic summons', () => {
  test('all 27 high-resolution monsters are unique, reachable, and backed by an image', async () => {
    const summons = await loadSummonsModule();
    const audit = summons.auditTarotKingdomSummonRegistry();
    expect(audit).toMatchObject({
      count: 27,
      uniqueCount: 27,
      pools: { entry: 9, middle: 7, advanced: 6, legendary: 5 }
    });
    expect(audit.effectCounts).toEqual({ attack: 9, debuff: 9, support: 9 });

    const selected = new Set();
    for (let rank = 5; rank <= 15; rank += 1) {
      selected.add(summons.resolveTarotKingdomSummon({ key: 'Straight', primary: [rank] }).id);
    }
    for (let rank = 1; rank <= 15; rank += 1) {
      selected.add(summons.resolveTarotKingdomSummon({ key: 'FullHouse', primary: [rank, 1] }).id);
      selected.add(summons.resolveTarotKingdomSummon({ key: 'FourKind', primary: [rank, 1] }).id);
    }
    for (let rank = 5; rank <= 15; rank += 1) {
      selected.add(summons.resolveTarotKingdomSummon({ key: 'StraightFlush', primary: [rank] }).id);
    }
    expect(selected.size).toBe(27);

    summons.TAROT_KINGDOM_SUMMONS.forEach((entry) => {
      const imagePath = path.join(__dirname, '..', 'public', entry.src.replace(/^\.\//, ''));
      expect(fs.existsSync(imagePath), entry.id).toBe(true);
      expect(fs.statSync(imagePath).size, entry.id).toBeGreaterThan(60_000);
    });
  });

  test('role strength—not randomness—selects the summon from weak to strong', async () => {
    const summons = await loadSummonsModule();
    const straightWeak = { key: 'Straight', primary: [5] };
    const straightStrong = { key: 'Straight', primary: [15] };
    const fullHouseWeak = { key: 'FullHouse', primary: [1, 14] };
    const fullHouseStrong = { key: 'FullHouse', primary: [15, 1] };

    expect(summons.resolveTarotKingdomSummon(straightWeak)).toMatchObject({
      id: 'skeletal_parrot',
      poolIndex: 0
    });
    expect(summons.resolveTarotKingdomSummon(straightStrong)).toMatchObject({
      id: 'crab_brute',
      poolIndex: 8
    });
    expect(summons.resolveTarotKingdomSummon(fullHouseWeak)).toMatchObject({
      id: 'cursed_shipwheel',
      poolIndex: 0
    });
    expect(summons.resolveTarotKingdomSummon(fullHouseStrong)).toMatchObject({
      id: 'merfolk_lancer',
      poolIndex: 6
    });
    expect(summons.resolveTarotKingdomSummon({ key: 'TheWorld', primary: [21] })).toMatchObject({
      id: 'anchor_golem',
      poolIndex: 5
    });

    const role = { key: 'Flush', primary: [10, 9, 7, 4, 2] };
    const first = summons.resolveTarotKingdomSummon(role);
    const originalRandom = Math.random;
    Math.random = () => 0.999999;
    const second = summons.resolveTarotKingdomSummon(role);
    Math.random = originalRandom;
    expect(second).toEqual(first);
    expect(summons.getTarotKingdomSummonRoleNumber({ primary: [10, 8, 6] }))
      .toBeCloseTo(10 + (8 / 16) + (6 / 256), 8);
  });

  test('nine effect profiles use the approved role-rate formulas', async () => {
    const summons = await loadSummonsModule();
    const context = { roleRate: 5, intelligence: 100 };
    const stepsFor = (id) => {
      const summon = summons.TAROT_KINGDOM_SUMMONS.find((entry) => entry.id === id);
      return summons.buildTarotKingdomSummonEffectSteps(
        { ...summon, effectName: summon.effectKey },
        context
      );
    };

    expect(stepsFor('mimic_chest')).toMatchObject([
      { kind: 'damage', amount: 84 },
      { kind: 'status', statusKey: 'break', potency: 40, chance: 1 }
    ]);
    expect(stepsFor('puffer_bomb')).toMatchObject([
      { kind: 'damage', amount: 67 },
      { kind: 'status', statusKey: 'burn', potency: 29, chance: 1 }
    ]);
    expect(stepsFor('coral_goblin')).toMatchObject([
      { kind: 'multi-hit', amount: 100, hitCount: 4 }
    ]);
    expect(stepsFor('kraken_pirate')).toMatchObject([
      { kind: 'status', statusKey: 'paralysis', charges: 1, chance: 1 }
    ]);
    expect(stepsFor('lantern_wraith')).toMatchObject([
      { kind: 'status', statusKey: 'blind', potency: 40, chance: 1 }
    ]);
    expect(stepsFor('zombie_raider')).toMatchObject([
      { kind: 'status', statusKey: 'confusion', chance: 1 }
    ]);
    expect(stepsFor('treasure_slime')).toMatchObject([
      { kind: 'heal-party-percent', percent: 14 }
    ]);
    expect(stepsFor('crab_brute')).toMatchObject([
      { kind: 'guard', statusKey: 'summonGuard', potency: 45, charges: 1 }
    ]);
    expect(stepsFor('skeletal_parrot')).toMatchObject([
      { kind: 'buff', statusKey: 'nextAttackUp', potency: 40, charges: 1 }
    ]);
  });
});

test.describe('Tarot Kingdom summon integration', () => {
  test.beforeEach(async ({ page }) => {
    await openKingdomDebug(page);
  });

  test('a five-card role records one summon and a synchronized 4.5-second timeline', async ({ page }) => {
    const cards = [
      { id: 'summon-2', kind: 'minor', suit: 'Wand', number: 2 },
      { id: 'summon-3', kind: 'minor', suit: 'Cup', number: 3 },
      { id: 'summon-4', kind: 'minor', suit: 'Sword', number: 4 },
      { id: 'summon-5', kind: 'minor', suit: 'Pentacle', number: 5 },
      { id: 'summon-6', kind: 'minor', suit: 'Wand', number: 6 },
      { id: 'summon-keep', kind: 'minor', suit: 'Cup', number: 10 }
    ];
    const audit = await page.evaluate((hand) => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({ withTrick: false, enemyHp: 420, handsBySeat: [hand] });
      debug.battlePlayCards(0, hand.slice(0, 5).map((card) => card.id));
      debug.battleRender();
      const state = debug.battleState();
      const event = state.battle.events.at(-1);
      const cutin = document.querySelector('.tarot-kingdom-skill-cutin.is-summon');
      const root = document.querySelector('#tarotKingdomRoot');
      const stage = document.querySelector('#tarotKingdomBattleStage');
      return {
        state,
        event,
        cutinCount: document.querySelectorAll('.tarot-kingdom-skill-cutin.is-summon').length,
        imageSrc: cutin?.querySelector('.tarot-kingdom-summon-art')?.getAttribute('src') || '',
        summonName: cutin?.querySelector('.tarot-kingdom-summon-copy strong')?.textContent || '',
        techniqueName: cutin?.querySelector('.tarot-kingdom-summon-technique')?.textContent || '',
        roleName: cutin?.querySelector('.tarot-kingdom-skill-cutin-title')?.textContent || '',
        effectKey: cutin?.dataset.effectKey || '',
        effectCategory: cutin?.dataset.effectCategory || '',
        choreography: cutin?.dataset.choreography || '',
        effectClass: cutin?.querySelector('.tarot-kingdom-summon-effect')?.className || '',
        effectNodeCount: cutin?.querySelectorAll('.tarot-kingdom-summon-effect-node').length || 0,
        sealCount: cutin?.querySelectorAll('.tarot-kingdom-summon-seal').length || 0,
        partyHideAt: Number(cutin?.dataset.partyHideAt),
        partyReturnAt: Number(cutin?.dataset.partyReturnAt),
        hudReturnAt: Number(cutin?.dataset.hudReturnAt),
        rootCinematic: root?.classList.contains('is-summon-cinematic') || false,
        stageCinematic: stage?.classList.contains('is-summon-cinematic') || false,
        shortCutinVisible: document.querySelector('#tarotKingdomCutin')?.classList.contains('show') || false,
        rootElapsed: root?.style.getPropertyValue('--summon-elapsed') || '',
        cutinElapsed: cutin?.style.getPropertyValue('--summon-elapsed') || ''
      };
    }, cards);

    expect(audit.event).toMatchObject({
      type: 'skill',
      summon: { id: 'skeletal_parrot', effectKey: 'command' }
    });
    expect(audit.event.damage).toBe(audit.event.baseDamage + audit.event.secondaryDamage);
    expect(audit.state.battle.enemy.hp).toBe(420 - audit.event.damage);
    expect(audit.state.transition.endsAt - audit.state.transition.startedAt).toBe(4500);
    expect(audit.state.transition.timeline).toMatchObject({
      version: 2,
      motionAt: audit.state.transition.startedAt + 1300,
      impactAt: audit.state.transition.startedAt + 3000,
      hpRevealAt: audit.state.transition.startedAt + 3160,
      hpTweenEndsAt: audit.state.transition.startedAt + 3600,
      effectAt: audit.state.transition.startedAt + 3600,
      damageNumberAt: audit.state.transition.startedAt + 3600,
      endsAt: audit.state.transition.startedAt + 4500
    });
    expect(audit.cutinCount).toBe(1);
    expect(audit.imageSrc).toContain('/Sprites/monsters/skeletal_parrot.png');
    expect(audit.summonName).toBe('召喚・骸骨オウム');
    expect(audit.techniqueName).toBe('艦隊号令');
    expect(audit.roleName).toContain('ストレート');
    expect(audit).toMatchObject({
      effectKey: 'command',
      effectCategory: 'support',
      choreography: 'fleet-command',
      effectNodeCount: 7,
      sealCount: 1,
      partyHideAt: 550,
      partyReturnAt: 3900,
      hudReturnAt: 4200,
      rootCinematic: true,
      stageCinematic: true,
      shortCutinVisible: false
    });
    expect(audit.effectClass).toContain('is-effect-command');
    await page.waitForTimeout(80);
    const elapsedAfterRender = await page.evaluate(() => {
      window.TarotKingdomDebug.battleRender();
      return {
        rootElapsed: document.querySelector('#tarotKingdomRoot')?.style.getPropertyValue('--summon-elapsed') || '',
        cutinElapsed: document.querySelector('.tarot-kingdom-skill-cutin.is-summon')?.style.getPropertyValue('--summon-elapsed') || ''
      };
    });
    expect(audit.rootElapsed).not.toBe('');
    expect(audit.cutinElapsed).not.toBe('');
    expect(elapsedAfterRender).toEqual({
      rootElapsed: audit.rootElapsed,
      cutinElapsed: audit.cutinElapsed
    });
  });

  test('all nine effect keys expose distinct choreography classes and categories', async ({ page }) => {
    const visuals = await page.evaluate(() => window.TarotKingdomDebug.battleSummonVisuals());
    expect(visuals).toEqual({
      rupture: { category: 'attack', choreography: 'ground-break' },
      inferno: { category: 'attack', choreography: 'fire-projectile' },
      barrage: { category: 'attack', choreography: 'multi-strike' },
      bind: { category: 'debuff', choreography: 'water-bind' },
      eclipse: { category: 'debuff', choreography: 'shadow-eclipse' },
      chaos: { category: 'debuff', choreography: 'ghost-spiral' },
      tide: { category: 'support', choreography: 'life-wave' },
      aegis: { category: 'support', choreography: 'golden-barrier' },
      command: { category: 'support', choreography: 'fleet-command' }
    });
  });

  test('party and HUD leave while the enemy stays, then return at synchronized offsets', async ({ page }) => {
    const cards = [
      { id: 'phase-2', kind: 'minor', suit: 'Wand', number: 2 },
      { id: 'phase-3', kind: 'minor', suit: 'Cup', number: 3 },
      { id: 'phase-4', kind: 'minor', suit: 'Sword', number: 4 },
      { id: 'phase-5', kind: 'minor', suit: 'Pentacle', number: 5 },
      { id: 'phase-6', kind: 'minor', suit: 'Wand', number: 6 },
      { id: 'phase-keep', kind: 'minor', suit: 'Cup', number: 10 }
    ];
    const startedAt = await page.evaluate((hand) => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({ withTrick: false, enemyHp: 420, handsBySeat: [hand] });
      debug.battlePlayCards(0, hand.slice(0, 5).map((card) => card.id));
      return debug.battleState().transition.startedAt;
    }, cards);
    await page.waitForTimeout(Math.max(0, startedAt + 650 - Date.now()));
    await expect(page.locator('#tarotKingdomRoot')).toHaveAttribute('data-summon-motion-paused', 'true');
    const readVisibilityAt = (offsetMs) => page.evaluate((timelineOffset) => {
      const root = document.querySelector('#tarotKingdomRoot');
      const stage = document.querySelector('#tarotKingdomBattleStage');
      root?.style.setProperty('--summon-elapsed', '0ms');
      stage?.style.setProperty('--summon-elapsed', '0ms');
      const setAnimationTime = (selector, animationNamePart) => {
        const node = document.querySelector(selector);
        getComputedStyle(node).opacity;
        const animation = node?.getAnimations().find((entry) => String(entry.animationName || '').includes(animationNamePart));
        if (animation) {
          animation.currentTime = timelineOffset;
          animation.pause();
        }
      };
      setAnimationTime('#tarotKingdomBattleStage .tarot-kingdom-battle-party-side', 'PartyVisibility');
      setAnimationTime('#tarotKingdomRoot .tarot-kingdom-layout', 'SummonHudVisibility');
      const opacityOf = (selector) => Number(getComputedStyle(document.querySelector(selector)).opacity);
      return {
        party: opacityOf('#tarotKingdomBattleStage .tarot-kingdom-battle-party-side'),
        hud: opacityOf('#tarotKingdomRoot .tarot-kingdom-layout'),
        enemy: opacityOf('#tarotKingdomEnemySprite'),
        cinematic: document.querySelector('#tarotKingdomRoot')?.classList.contains('is-summon-cinematic') || false,
        partyAnimations: Array.from(document.querySelector('#tarotKingdomBattleStage .tarot-kingdom-battle-party-side')?.getAnimations() || [])
          .map((entry) => entry.animationName),
        hudAnimations: Array.from(document.querySelector('#tarotKingdomRoot .tarot-kingdom-layout')?.getAnimations() || [])
          .map((entry) => entry.animationName)
      };
    }, offsetMs);

    const hidden = await readVisibilityAt(1050);
    expect(hidden).toMatchObject({
      cinematic: true,
      party: expect.any(Number),
      hud: expect.any(Number)
    });
    expect(hidden.party, JSON.stringify(hidden)).toBeLessThan(0.05);
    expect(hidden.hud).toBeLessThan(0.05);
    expect(hidden.enemy).toBeGreaterThan(0.5);
    expect(hidden.cinematic).toBe(true);

    const partyReturn = await readVisibilityAt(4050);
    expect(partyReturn.party).toBeGreaterThan(0.2);
    expect(partyReturn.hud).toBeLessThan(0.1);
    expect(partyReturn.enemy).toBeGreaterThan(0.5);

    const hudReturn = await readVisibilityAt(4300);
    expect(hudReturn.party).toBeGreaterThan(0.9);
    expect(hudReturn.hud).toBeGreaterThan(0.2);
    expect(hudReturn.cinematic).toBe(true);

    await page.waitForTimeout(Math.max(0, startedAt + 4650 - Date.now()));
    const finished = await page.evaluate(() => {
      window.TarotKingdomDebug.battleRender();
      const opacityOf = (selector) => Number(getComputedStyle(document.querySelector(selector)).opacity);
      return {
        party: opacityOf('#tarotKingdomBattleStage .tarot-kingdom-battle-party-side'),
        hud: opacityOf('#tarotKingdomRoot .tarot-kingdom-layout'),
        cinematic: document.querySelector('#tarotKingdomRoot')?.classList.contains('is-summon-cinematic') || false,
        motionPaused: document.querySelector('#tarotKingdomRoot')?.dataset.summonMotionPaused === 'true'
      };
    });
    expect(finished.party).toBeGreaterThan(0.9);
    expect(finished.hud).toBeGreaterThan(0.9);
    expect(finished.cinematic).toBe(false);
    expect(finished.motionPaused).toBe(false);
    await expect(page.locator('.tarot-kingdom-skill-cutin.is-summon')).toHaveCount(0);
  });

  test('short action cut-ins stay inside the battlefield with English keywords and a small actor name', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    const cases = [
      ['ターン 1', 'TURN'],
      ['パス', 'DEFEND'],
      ['ドロー', 'DRAW'],
      ['5スキップ', 'SKIP'],
      ['8カット', 'CUT'],
      ['11バック', 'REVERSE'],
      ['14ロック', 'LOCK'],
      ['ロック解除', 'BREAK'],
      ['コール', 'CALL'],
      ['審判回収', 'RECLAIM'],
      ['共鳴・生命潮', 'RESONANCE'],
      ['出し切り！', 'VICTORY'],
      ['BATTLE DEFEAT', 'DEFEAT']
    ];

    for (const [label, expectedKeyword] of cases) {
      const presentation = await page.evaluate(([actionLabel]) => (
        window.TarotKingdomDebug.battleShowActionCutin(0, actionLabel, { durationMs: 700 })
      ), [label]);
      await page.waitForTimeout(150);
      const audit = await page.evaluate(() => {
        const stage = document.querySelector('#tarotKingdomBattleStage');
        const cutin = document.querySelector('#tarotKingdomCutin');
        const actor = cutin?.querySelector('.tarot-action-cutin-actor');
        const keyword = cutin?.querySelector('.tarot-action-cutin-keyword');
        const stageRect = stage?.getBoundingClientRect();
        const cutinRect = cutin?.getBoundingClientRect();
        return {
          parentId: cutin?.parentElement?.id || '',
          actorText: actor?.textContent || '',
          actorFontSize: Number.parseFloat(actor ? getComputedStyle(actor).fontSize : '0'),
          keywordText: keyword?.textContent || '',
          insideStage: !!(
            stageRect
            && cutinRect
            && cutinRect.left >= stageRect.left - 1
            && cutinRect.right <= stageRect.right + 1
            && cutinRect.top >= stageRect.top - 1
            && cutinRect.bottom <= stageRect.bottom + 1
          ),
          horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
        };
      });
      expect(presentation.keyword).toBe(expectedKeyword);
      expect(audit.keywordText).toBe(expectedKeyword);
      expect(audit.actorText.length).toBeGreaterThan(0);
      expect(audit.actorFontSize).toBeLessThanOrEqual(9);
      expect(audit.parentId).toBe('tarotKingdomBattleStage');
      expect(audit.insideStage).toBe(true);
      expect(audit.horizontalOverflow).toBe(false);
    }
  });

  test('support summons still resolve in Rush Time while enemy-target steps stop at zero HP', async ({ page }) => {
    const tideCards = [
      { id: 'tide-9', kind: 'minor', suit: 'Cup', number: 9 },
      { id: 'tide-8', kind: 'minor', suit: 'Cup', number: 8 },
      { id: 'tide-6', kind: 'minor', suit: 'Cup', number: 6 },
      { id: 'tide-4', kind: 'minor', suit: 'Cup', number: 4 },
      { id: 'tide-2', kind: 'minor', suit: 'Cup', number: 2 },
      { id: 'tide-keep', kind: 'minor', suit: 'Sword', number: 3 }
    ];
    const audit = await page.evaluate((hand) => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({
        withTrick: false,
        enemyHp: 0,
        hpBySeat: [40, 30, 20, 0],
        handsBySeat: [hand]
      });
      const before = debug.battleState().players.map((player) => player.hp);
      const result = debug.battlePlayCards(0, hand.slice(0, 5).map((card) => card.id));
      const event = result.state.battle.events.at(-1);
      return {
        before,
        after: result.state.players.map((player) => player.hp),
        event
      };
    }, tideCards);

    expect(audit.event).toMatchObject({
      type: 'skill',
      attackStopped: true,
      damage: 0,
      summon: { id: 'treasure_slime', effectKey: 'tide' }
    });
    expect(audit.after[0]).toBeGreaterThan(audit.before[0]);
    expect(audit.after[1]).toBeGreaterThan(audit.before[1]);
    expect(audit.after[2]).toBeGreaterThan(audit.before[2]);
    expect(audit.after[3]).toBe(0);
  });

  test('schema 5 completes without summons and keeps the former skill duration', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const legacy = debug.battleDeserialize({
        schema: 5,
        state: {
          handNo: 1,
          roundActive: true,
          phase: 'turn',
          turn: 0,
          rules: { initialHandSize: 8, handLimit: 8, combatEffectsVersion: 1 },
          players: [0, 1, 2, 3].map((seat) => ({
            hand: [{ id: `legacy-${seat}`, kind: 'minor', suit: 'Wand', number: seat + 2 }],
            discard: []
          }))
        }
      });
      return {
        rules: legacy.rules,
        timeline: debug.battleCombatTimeline('skill', 'sword')
      };
    });

    expect(audit.rules).toMatchObject({ combatEffectsVersion: 1, summonVersion: 0 });
    expect(audit.timeline).toMatchObject({
      version: 1,
      durationMs: 1800,
      impactOffsetMs: 1080,
      hpRevealOffsetMs: 1200
    });
  });

  test('summon art and short labels stay clipped to the battle stage at 390px and 900px', async ({ page }) => {
    const summons = await loadSummonsModule();
    const summonEntries = summons.TAROT_KINGDOM_SUMMONS.map((entry) => ({
      id: entry.id,
      src: entry.src,
      visualScale: entry.visualScale,
      anchorX: entry.anchorX,
      anchorY: entry.anchorY
    }));
    const loadedArt = await page.evaluate((entries) => Promise.all(entries.map((entry) => new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve({
        id: entry.id,
        width: image.naturalWidth,
        height: image.naturalHeight
      });
      image.onerror = () => resolve({ id: entry.id, width: 0, height: 0 });
      image.src = entry.src;
    }))), summonEntries);
    expect(loadedArt).toHaveLength(27);
    loadedArt.forEach((entry) => {
      expect(entry.width, entry.id).toBeGreaterThan(150);
      expect(entry.height, entry.id).toBeGreaterThan(150);
    });
    summonEntries.forEach((entry) => {
      expect(entry.visualScale, entry.id).toBeGreaterThanOrEqual(0.7);
      expect(entry.visualScale, entry.id).toBeLessThanOrEqual(1.2);
      expect(entry.anchorX, entry.id).toBeGreaterThanOrEqual(0);
      expect(entry.anchorX, entry.id).toBeLessThanOrEqual(100);
      expect(entry.anchorY, entry.id).toBeGreaterThanOrEqual(0);
      expect(entry.anchorY, entry.id).toBeLessThanOrEqual(100);
    });

    const cards = [
      { id: 'layout-2', kind: 'minor', suit: 'Wand', number: 2 },
      { id: 'layout-3', kind: 'minor', suit: 'Cup', number: 3 },
      { id: 'layout-4', kind: 'minor', suit: 'Sword', number: 4 },
      { id: 'layout-5', kind: 'minor', suit: 'Pentacle', number: 5 },
      { id: 'layout-6', kind: 'minor', suit: 'Wand', number: 6 },
      { id: 'layout-keep', kind: 'minor', suit: 'Cup', number: 10 }
    ];

    for (const width of [390, 900]) {
      await page.setViewportSize({ width, height: width === 390 ? 900 : 1100 });
      await page.evaluate((hand) => {
        const debug = window.TarotKingdomDebug;
        debug.battleScenario({ withTrick: false, handsBySeat: [hand] });
        debug.battlePlayCards(0, hand.slice(0, 5).map((card) => card.id));
      }, cards);
      await page.waitForTimeout(1500);
      const layout = await page.evaluate(() => {
        const stage = document.querySelector('#tarotKingdomBattleStage');
        const cutin = stage?.querySelector(':scope > .tarot-kingdom-skill-cutin.is-summon');
        const art = cutin?.querySelector('.tarot-kingdom-summon-art');
        const copy = cutin?.querySelector('.tarot-kingdom-summon-copy');
        const toRect = (node) => {
          const rect = node?.getBoundingClientRect();
          return rect ? {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height
          } : null;
        };
        return {
          stage: toRect(stage),
          cutin: toRect(cutin),
          art: toRect(art),
          copy: toRect(copy),
          naturalSize: art ? { width: art.naturalWidth, height: art.naturalHeight } : null,
          stageOverflow: stage ? getComputedStyle(stage).overflow : '',
          artOpacity: art ? getComputedStyle(art.closest('.tarot-kingdom-summon-figure')).opacity : '',
          copyOpacity: copy ? getComputedStyle(copy).opacity : '',
          copyText: copy?.textContent || '',
          horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
        };
      });

      expect(layout.cutin.left).toBeGreaterThanOrEqual(layout.stage.left);
      expect(layout.cutin.right).toBeLessThanOrEqual(layout.stage.right);
      expect(layout.cutin.top).toBeGreaterThanOrEqual(layout.stage.top);
      expect(layout.cutin.bottom).toBeLessThanOrEqual(layout.stage.bottom);
      expect(layout.stage.right - layout.cutin.right).toBeLessThanOrEqual(2.1);
      expect(layout.stage.bottom - layout.cutin.bottom).toBeLessThanOrEqual(2.1);
      expect(layout.stageOverflow).toBe('hidden');
      expect(layout.horizontalOverflow).toBe(false);
      expect(layout.naturalSize.width).toBeGreaterThan(150);
      expect(layout.naturalSize.height).toBeGreaterThan(150);
      expect(layout.art.width).toBeGreaterThan(60);
      expect(layout.art.height).toBeGreaterThan(80);
      expect(Number(layout.artOpacity)).toBeGreaterThan(0.9);
      expect(Number(layout.copyOpacity)).toBeGreaterThan(0.9);
      expect(layout.copy.left).toBeGreaterThanOrEqual(layout.stage.left);
      expect(layout.copy.right).toBeLessThanOrEqual(layout.stage.right);
      expect(layout.copyText).toBe('召喚・骸骨オウム艦隊号令');
    }
  });
});
