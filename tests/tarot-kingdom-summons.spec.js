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
  test('all 57 summon illustrations are unique and the legacy 27 remain reachable', async () => {
    const summons = await loadSummonsModule();
    const audit = summons.auditTarotKingdomSummonRegistry();
    expect(audit).toMatchObject({
      count: 57,
      uniqueCount: 57,
      legacyCount: 27,
      flushCount: 8,
      majorCount: 22,
      pools: { entry: 9, middle: 7, advanced: 6, legendary: 5, flush: 8, major: 22 }
    });
    expect(audit.effectCounts).toEqual({ attack: 9, debuff: 9, support: 9, hybrid: 8, unknown: 22 });

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
    expect(new Set(summons.TAROT_KINGDOM_SUMMONS.map((entry) => entry.motionKey))).toEqual(new Set([
      'flutter',
      'float',
      'bounce',
      'dash',
      'heavy',
      'coil',
      'stalk'
    ]));
    expect(new Set(summons.TAROT_KINGDOM_SUMMONS.map((entry) => entry.animationName)).size).toBe(27);
    const summonCss = fs.readFileSync(
      path.join(__dirname, '..', 'public', 'tarot-kingdom-summons.css'),
      'utf8'
    );
    const legacyCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');
    summons.TAROT_KINGDOM_SUMMONS.forEach((entry) => {
      expect(entry.attackReach, entry.id).toBeGreaterThanOrEqual(18);
      expect(entry.attackReach, entry.id).toBeLessThanOrEqual(48);
      expect(entry.effectDensity, entry.id).toBeGreaterThanOrEqual(0.85);
      expect(entry.effectDensity, entry.id).toBeLessThanOrEqual(1.35);
      expect(summonCss, entry.id).toContain(`.is-summon-id-${entry.id}`);
      expect(summonCss, entry.animationName).toContain(`@keyframes ${entry.animationName}`);
    });
    expect(legacyCss).not.toMatch(/tarotKingdomSummon|skill-cutin\.is-summon|tarot-kingdom-summon-/);
    expect(summonCss).toContain('@keyframes tkSummonCannonMimic');
    expect(summonCss).toContain('@keyframes tkSummonCannonHermit');
    expect(summonCss).toContain('@keyframes tkSummonCameraHeavyHit');
  });

  test('preview summon states can be built directly for every still image', async () => {
    const summons = await loadSummonsModule();
    const states = summons.TAROT_KINGDOM_SUMMONS.map((entry) => (
      summons.createTarotKingdomSummonStateById(entry.id, {
        key: entry.pool === 'legendary' ? 'FiveKind' : 'Straight',
        primary: [9]
      })
    ));

    expect(states).toHaveLength(27);
    expect(new Set(states.map((state) => state.choreographyKey)).size).toBe(27);
    expect(states.reduce((counts, state) => {
      counts[state.motionWeight] = (counts[state.motionWeight] || 0) + 1;
      return counts;
    }, {})).toEqual({
      light: 9,
      measured: 7,
      heavy: 6,
      monumental: 5
    });
    states.forEach((state, index) => {
      expect(state).toMatchObject({
        id: summons.TAROT_KINGDOM_SUMMONS[index].id,
        src: summons.TAROT_KINGDOM_SUMMONS[index].src,
        effectKey: summons.TAROT_KINGDOM_SUMMONS[index].effectKey,
        choreographyKey: summons.TAROT_KINGDOM_SUMMONS[index].id.replace(/_/g, '-'),
        animationName: summons.TAROT_KINGDOM_SUMMONS[index].animationName
      });
      expect(state.effectName).not.toBe('');
      expect(state.effectCategory).not.toBe('');
    });
  });

  test('preview picker exposes all 57 summons and replays the selected action illustration', async ({ page }) => {
    await openKingdomDebug(page);
    await page.evaluate(() => window.TarotKingdomDebug.battleScenario({
      withTrick: false,
      turnIndex: 0
    }));
    const picker = page.locator('#tarotKingdomDemoSummonSelect');
    await expect(picker).toBeVisible();
    await expect(picker.locator('option:not([value=""])')).toHaveCount(57);
    await expect(picker.locator('optgroup')).toHaveCount(6);

    const audits = await page.evaluate(() => window.TarotKingdomDebug.battleDemoSummons().map((summon) => {
      const result = window.TarotKingdomDebug.battleDemoSummon(summon.id);
      const event = [...(result.state?.battle?.events || [])]
        .reverse()
        .find((entry) => entry?.summon?.id);
      const cutin = document.querySelector('.tarot-kingdom-skill-cutin.is-summon');
      const figure = cutin?.querySelector('.tarot-kingdom-summon-figure');
      return {
        requestedId: summon.id,
        requestedPool: summon.pool,
        ok: result.ok,
        error: result.error || '',
        actualId: event?.summon?.id || '',
        choreography: cutin?.dataset.summonChoreography || '',
        weight: cutin?.dataset.summonWeight || '',
        animationName: figure ? getComputedStyle(figure).animationName : '',
        expectedAnimationName: summon.animationName,
        stillImageCount: figure?.querySelectorAll(':scope > img.tarot-kingdom-summon-art').length || 0,
        figureChildCount: figure?.children.length || 0
      };
    }));
    expect(audits).toHaveLength(57);
    audits.forEach((audit) => {
      expect(audit.ok, `${audit.requestedId}:${audit.error}`).toBe(true);
      expect(audit.actualId).toBe(audit.requestedId);
      expect(audit.choreography).toBe(audit.requestedId.replace(/_/g, '-'));
      expect(audit.weight).toBe({
        entry: 'light',
        flush: 'measured',
        middle: 'measured',
        advanced: 'heavy',
        legendary: 'monumental',
        major: 'measured'
      }[audit.requestedPool]);
      expect(audit.animationName).toBe(audit.expectedAnimationName);
      expect(audit.stillImageCount).toBe(1);
      expect(audit.figureChildCount).toBe(1);
    });

    await picker.selectOption('anchor_golem');
    await expect(picker).toHaveValue('anchor_golem');
    await expect(page.locator('.tarot-kingdom-skill-cutin.is-summon')).toHaveAttribute(
      'data-summon-id',
      'anchor_golem'
    );
  });

  test('selection v2 separates Flush tiers and lets Major Arcana replace only the artwork', async () => {
    const summons = await loadSummonsModule();
    const flushRole = { key: 'Flush', primary: [10] };
    const low = summons.resolveTarotKingdomSummon(flushRole, {
      selectionVersion: 2,
      flushSuit: 'Cup',
      highCard: 10
    });
    const high = summons.resolveTarotKingdomSummon({ key: 'Flush', primary: [11] }, {
      selectionVersion: 2,
      flushSuit: 'Cup',
      highCard: 11
    });
    const major = summons.resolveTarotKingdomSummon({ key: 'FullHouse', primary: [9, 4] }, {
      selectionVersion: 2,
      majorNumber: 21
    });

    expect(low).toMatchObject({
      id: 'flush_cup_low', artSource: 'flush-suit', tier: 'low', flushSuit: 'Cup', highCard: 10,
      roleEffectKey: 'flushElemental'
    });
    expect(high).toMatchObject({
      id: 'flush_cup_high', artSource: 'flush-suit', tier: 'high', flushSuit: 'Cup', highCard: 11,
      roleEffectKey: 'flushElemental'
    });
    expect(major).toMatchObject({
      id: 'major_summon_21', artSource: 'major', majorNumber: 21,
      roleKey: 'FullHouse', roleEffectKey: expect.any(String)
    });
    expect(major.roleEffectKey).not.toBe('');
  });

  test('Flush suit effects use the fixed element and high-card support values', async () => {
    const summons = await loadSummonsModule();
    const resolve = (suit, highCard) => summons.resolveTarotKingdomSummon(
      { key: 'Flush', primary: [highCard] },
      { selectionVersion: 2, flushSuit: suit, highCard }
    );
    const steps = (suit, highCard) => summons.buildTarotKingdomSummonEffectSteps(
      resolve(suit, highCard),
      { roleRate: 1, intelligence: 0, flushSuit: suit, highCard }
    );

    expect(steps('Cup', 5)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'magic', element: 'water' }),
      expect.objectContaining({ kind: 'heal-party-percent', percent: 25 })
    ]));
    expect(steps('Cup', 10)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'heal-party-percent', percent: 40 })
    ]));
    expect(steps('Cup', 14)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'heal-party-percent', percent: 50 })
    ]));
    expect(steps('Cup', 15)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'heal-party-percent', percent: 50 })
    ]));
    expect(steps('Pentacle', 15)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'shield-party-percent', percent: 35, turns: 2 })
    ]));
    expect(steps('Sword', 15)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'buff-party', statusKey: 'speedUp', potency: 40, turns: 2 })
    ]));
    expect(steps('Wand', 15)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'buff-party', statusKey: 'flushMagicUp', potency: 40, turns: 2 })
    ]));
  });

  test('new portrait summon assets are transparent and never exceed 512px', async ({ page }) => {
    const summons = await loadSummonsModule();
    const newSummons = [
      ...summons.TAROT_KINGDOM_FLUSH_SUMMONS,
      ...summons.TAROT_KINGDOM_MAJOR_SUMMONS
    ];
    expect(newSummons).toHaveLength(30);
    await page.goto('/tarot-kingdom-preview.html?tkfixture=character-battle', { waitUntil: 'domcontentloaded' });
    const assets = await page.evaluate(async (entries) => Promise.all(entries.map(async (entry) => {
      const image = new Image();
      image.src = entry.src;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      const corners = [
        context.getImageData(0, 0, 1, 1).data[3],
        context.getImageData(canvas.width - 1, 0, 1, 1).data[3],
        context.getImageData(0, canvas.height - 1, 1, 1).data[3],
        context.getImageData(canvas.width - 1, canvas.height - 1, 1, 1).data[3]
      ];
      return { id: entry.id, width: image.naturalWidth, height: image.naturalHeight, corners };
    })), newSummons);
    assets.forEach((asset) => {
      expect(asset.width, asset.id).toBeLessThanOrEqual(512);
      expect(asset.height, asset.id).toBeLessThanOrEqual(512);
      expect(asset.width, asset.id).toBeGreaterThan(0);
      expect(asset.height, asset.id).toBeGreaterThan(0);
      expect(asset.corners, asset.id).toEqual([0, 0, 0, 0]);
    });
  });

  test('a normally played Major Arcana uses its own short summon without hiding the party', async ({ page }) => {
    await openKingdomDebug(page);
    const played = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({
        withTrick: false,
        handsBySeat: [[
          { id: 'major-emperor-summon', kind: 'major', suit: 'None', number: 4 },
          { id: 'major-emperor-reserve', kind: 'minor', suit: 'Cup', number: 6 }
        ]]
      });
      const result = debug.battlePlayCards(0, ['major-emperor-summon'], { resolve: false });
      const event = result.state.battle.events.at(-1);
      const cutin = document.querySelector('.tarot-kingdom-skill-cutin.is-major-arcana-summon');
      const figure = cutin?.querySelector('.tarot-kingdom-summon-figure');
      return {
        ok: result.ok,
        event,
        transition: result.state.transition,
        transitionDuration: Number(result.state.transition?.endsAt || 0) - Number(result.state.transition?.timeline?.startedAt || 0),
        impactDelay: Number(result.state.transition?.timeline?.impactAt || 0) - Number(result.state.transition?.timeline?.startedAt || 0),
        cutin: cutin ? {
          summonId: cutin.dataset.summonId,
          title: cutin.querySelector('.tarot-kingdom-skill-cutin-title')?.textContent,
          technique: cutin.querySelector('.tarot-kingdom-summon-technique')?.textContent,
          alt: figure?.querySelector('img')?.alt,
          duration: getComputedStyle(cutin).animationDuration
        } : null,
        stageCinematic: document.querySelector('#tarotKingdomBattleStage')?.classList.contains('is-summon-cinematic'),
        rootCinematic: document.querySelector('#tarotKingdomRoot')?.classList.contains('is-summon-cinematic')
      };
    });

    expect(played.ok).toBe(true);
    expect(played.event).toMatchObject({
      type: 'attack',
      majorSkillName: 'インペリアルブレイド',
      majorSummon: {
        id: 'major_summon_04',
        majorNumber: 4,
        presentationOnly: true,
        effectKey: 'major-arcana'
      }
    });
    expect(played.event.summon).toBeNull();
    expect(played.transition.timeline).toMatchObject({ variant: 'skill' });
    expect(played.transitionDuration).toBe(2400);
    expect(played.impactDelay).toBe(1600);
    expect(played.cutin).toMatchObject({
      summonId: 'major_summon_04',
      title: '大アルカナ・皇帝',
      technique: 'インペリアルブレイド',
      alt: '皇鋼の獅子王',
      duration: '2.4s'
    });
    expect(played.stageCinematic).toBe(false);
    expect(played.rootCinematic).toBe(false);
  });

  test('all 22 normally played Major Arcana map to their matching summon once', async ({ page }) => {
    await openKingdomDebug(page);
    const audits = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      const suitByNumber = { 1: 'Wand', 16: 'Sword', 17: 'Cup', 18: 'Pentacle', 19: 'Wand' };
      const fieldByNumber = {
        15: { id: 'major-summon-field-court', kind: 'minor', suit: 'Cup', number: 14 },
        16: { id: 'major-summon-field-sword', kind: 'minor', suit: 'Sword', number: 9 },
        17: { id: 'major-summon-field-cup', kind: 'minor', suit: 'Cup', number: 9 },
        18: { id: 'major-summon-field-pentacle', kind: 'minor', suit: 'Pentacle', number: 9 },
        19: { id: 'major-summon-field-wand', kind: 'minor', suit: 'Wand', number: 9 },
        21: { id: 'major-summon-field-major', kind: 'major', suit: 'None', number: 4 }
      };
      return Array.from({ length: 22 }, (_, number) => {
        const major = {
          id: `normal-major-summon-${number}`,
          kind: 'major',
          suit: suitByNumber[number] || 'None',
          number
        };
        debug.battleScenario({
          withTrick: !!fieldByNumber[number],
          ...(fieldByNumber[number] ? { tableCard: fieldByNumber[number] } : {}),
          handsBySeat: [[major, { id: `normal-major-reserve-${number}`, kind: 'minor', suit: 'Cup', number: 6 }]]
        });
        const result = debug.battlePlayCards(0, [major.id], { resolve: false });
        const matchingEvents = (result.state?.battle?.events || []).filter((event) => (
          event?.majorSummon?.id === `major_summon_${String(number).padStart(2, '0')}`
        ));
        return {
          number,
          ok: result.ok,
          error: result.error || '',
          matchingCount: matchingEvents.length,
          presentationOnly: matchingEvents[0]?.majorSummon?.presentationOnly === true
        };
      });
    });

    expect(audits).toHaveLength(22);
    audits.forEach((audit) => {
      expect(audit.ok, `${audit.number}:${audit.error}`).toBe(true);
      expect(audit.matchingCount, `major ${audit.number}`).toBe(1);
      expect(audit.presentationOnly, `major ${audit.number}`).toBe(true);
    });
  });

  test('new action-pose Flush and Major summons stay compact inside portrait battlefields', async ({ page }) => {
    await openKingdomDebug(page);
    for (const width of [390, 900]) {
      await page.setViewportSize({ width, height: width === 390 ? 900 : 1100 });
      for (const summonId of ['flush_cup_high', 'major_summon_21']) {
        const layout = await page.evaluate(async (id) => {
          const debug = window.TarotKingdomDebug;
          debug.battleScenario({ withTrick: false, turnIndex: 0 });
          const result = debug.battleDemoSummon(id);
          const stage = document.querySelector('#tarotKingdomBattleStage');
          const cutin = stage?.querySelector(':scope > .tarot-kingdom-skill-cutin.is-summon');
          const figure = cutin?.querySelector('.tarot-kingdom-summon-figure');
          figure?.getAnimations().forEach((animation) => {
            animation.currentTime = 2300;
            animation.pause();
          });
          await new Promise((resolve) => requestAnimationFrame(resolve));
          const rect = (node) => {
            const box = node?.getBoundingClientRect();
            return box ? { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width } : null;
          };
          return {
            ok: result.ok,
            stage: rect(stage),
            figure: rect(figure),
            horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
          };
        }, summonId);
        expect(layout.ok, `${width}:${summonId}`).toBe(true);
        expect(layout.figure.left, `${width}:${summonId}`).toBeGreaterThanOrEqual(layout.stage.left);
        expect(layout.figure.right, `${width}:${summonId}`).toBeLessThanOrEqual(layout.stage.right);
        expect(layout.figure.width, `${width}:${summonId}`).toBeLessThanOrEqual(layout.stage.width * 0.72);
        expect(layout.horizontalOverflow, `${width}:${summonId}`).toBe(false);
      }
    }
  });

  test('cannon summons hold the impact pose, recoil backward, and use heavy camera shake', async ({ page }) => {
    await openKingdomDebug(page);
    const audit = await page.evaluate(() => {
      window.TarotKingdomDebug.battleScenario({ withTrick: false, turnIndex: 0 });
      window.TarotKingdomDebug.battleDemoSummon('cannon_mimic');
      const stage = document.querySelector('#tarotKingdomBattleStage');
      const cutin = document.querySelector('.tarot-kingdom-skill-cutin.is-summon');
      const figure = cutin?.querySelector('.tarot-kingdom-summon-figure');
      cutin?.style.setProperty('--summon-elapsed', '0ms');
      stage?.style.setProperty('--summon-elapsed', '0ms');
      const figureAnimation = figure?.getAnimations().find((animation) => (
        animation.animationName === 'tkSummonCannonMimic'
      ));
      const xAt = (time) => {
        figureAnimation.currentTime = time;
        figureAnimation.pause();
        return new DOMMatrixReadOnly(getComputedStyle(figure).transform).m41;
      };
      const impactX = xAt(3002);
      const heldX = xAt(3117);
      const recoilX = xAt(3218);
      stage?.classList.add('is-battle-skill', 'is-battle-hit-stop');
      const stageAnimations = Array.from(stage?.getAnimations() || []).map((animation) => animation.animationName);
      return {
        impactX,
        heldX,
        recoilX,
        stageAnimations,
        muzzleLeft: getComputedStyle(cutin.querySelector('.tarot-kingdom-summon-fx-aura')).left,
        projectileAnimation: getComputedStyle(
          cutin.querySelector('.tarot-kingdom-summon-fx-projectile')
        ).animationName
      };
    });

    expect(Math.abs(audit.heldX - audit.impactX)).toBeLessThan(2);
    expect(audit.recoilX).toBeGreaterThan(audit.heldX + 20);
    expect(audit.stageAnimations).toContain('tkSummonCameraHeavyHit');
    expect(audit.projectileAnimation).toBe('tkFxCannonMimic');
    expect(Number.parseFloat(audit.muzzleLeft)).toBeGreaterThan(0);
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

  test('role chains amplify only attack-type summon damage and cap at 1.75', async () => {
    const summons = await loadSummonsModule();
    const stepsFor = (id, roleChainMultiplier) => {
      const summon = summons.TAROT_KINGDOM_SUMMONS.find((entry) => entry.id === id);
      return summons.buildTarotKingdomSummonEffectSteps(
        { ...summon, effectName: summon.effectKey },
        { roleRate: 5, intelligence: 100, roleChainMultiplier }
      );
    };

    expect(stepsFor('mimic_chest', 1.75)).toMatchObject([
      { kind: 'damage', amount: 147 },
      { kind: 'status', statusKey: 'break', potency: 40, chance: 1 }
    ]);
    expect(stepsFor('puffer_bomb', 2)).toMatchObject([
      { kind: 'damage', amount: 117 },
      { kind: 'status', statusKey: 'burn', potency: 29, chance: 1 }
    ]);
    expect(stepsFor('coral_goblin', 1.5)).toMatchObject([
      { kind: 'multi-hit', amount: 150, hitCount: 4 }
    ]);
    expect(stepsFor('treasure_slime', 1.75)).toMatchObject([
      { kind: 'heal-party-percent', percent: 14 }
    ]);
    expect(stepsFor('crab_brute', 1.75)).toMatchObject([
      { kind: 'guard', statusKey: 'summonGuard', potency: 45, charges: 1 }
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
      const figure = cutin?.querySelector('.tarot-kingdom-summon-figure');
      const summonArt = cutin?.querySelector('.tarot-kingdom-summon-art');
      const effectField = cutin?.querySelector('.tarot-kingdom-summon-effect');
      const effectSigil = cutin?.querySelector('.tarot-kingdom-summon-fx-sigil');
      const effectProjectile = cutin?.querySelector('.tarot-kingdom-summon-fx-projectile');
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
        effectCue: cutin?.dataset.effectCue || '',
        effectImpact: cutin?.dataset.effectImpact || '',
        summonMotion: cutin?.dataset.summonMotion || '',
        summonPool: cutin?.dataset.summonPool || '',
        summonId: cutin?.dataset.summonId || '',
        effectClass: cutin?.querySelector('.tarot-kingdom-summon-effect')?.className || '',
        effectNodeCount: cutin?.querySelectorAll('.tarot-kingdom-summon-effect-node').length || 0,
        effectLayerCount: cutin?.querySelectorAll(
          '.tarot-kingdom-summon-fx'
        ).length || 0,
        figureAnimationName: figure ? getComputedStyle(figure).animationName : '',
        effectSigilAnimationName: effectSigil ? getComputedStyle(effectSigil).animationName : '',
        effectProjectileAnimationName: effectProjectile ? getComputedStyle(effectProjectile).animationName : '',
        figureFilter: figure ? getComputedStyle(figure).filter : '',
        artFilter: summonArt ? getComputedStyle(summonArt).filter : '',
        promotedDescendantCount: Array.from(cutin?.querySelectorAll('*') || [])
          .filter((node) => getComputedStyle(node).willChange !== 'auto').length,
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
      effectAt: audit.state.transition.startedAt + 3900,
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
      effectCue: 'signal-rise',
      effectImpact: 'fleet-salvo',
      summonMotion: 'flutter',
      summonPool: 'entry',
      summonId: 'skeletal_parrot',
      effectNodeCount: 6,
      effectLayerCount: 8,
      figureAnimationName: 'tkSummonSkeletalParrot',
      effectSigilAnimationName: 'tkFxSkeletalParrot',
      effectProjectileAnimationName: 'tkFxCommandRay',
      sealCount: 1,
      partyHideAt: 550,
      partyReturnAt: 3800,
      hudReturnAt: 4200,
      rootCinematic: true,
      stageCinematic: true,
      shortCutinVisible: false
    });
    expect(audit.figureFilter).toBe('none');
    expect(audit.artFilter).toContain('drop-shadow');
    expect(audit.promotedDescendantCount).toBeLessThanOrEqual(16);
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

  test('all eleven effect keys expose distinct choreography classes and categories', async ({ page }) => {
    const visuals = await page.evaluate(() => window.TarotKingdomDebug.battleSummonVisuals());
    expect(visuals).toEqual({
      rupture: { category: 'attack', choreography: 'ground-break', cue: 'fault-charge', impact: 'rock-burst' },
      inferno: { category: 'attack', choreography: 'fire-projectile', cue: 'ember-charge', impact: 'fire-bloom' },
      barrage: { category: 'attack', choreography: 'multi-strike', cue: 'target-lock', impact: 'cross-salvo' },
      bind: { category: 'debuff', choreography: 'water-bind', cue: 'tidal-ring', impact: 'chain-collapse' },
      eclipse: { category: 'debuff', choreography: 'shadow-eclipse', cue: 'umbra-lens', impact: 'shadow-pulse' },
      chaos: { category: 'debuff', choreography: 'ghost-spiral', cue: 'spirit-orbit', impact: 'vortex-collapse' },
      tide: { category: 'support', choreography: 'life-wave', cue: 'tide-gather', impact: 'restoring-surge' },
      aegis: { category: 'support', choreography: 'golden-barrier', cue: 'rune-forge', impact: 'shield-lock' },
      command: { category: 'support', choreography: 'fleet-command', cue: 'signal-rise', impact: 'fleet-salvo' },
      flushElemental: { category: 'hybrid', choreography: 'elemental-surge', cue: 'elemental-charge', impact: 'elemental-burst' },
      'major-arcana': { category: 'hybrid', choreography: 'arcana-invocation', cue: 'arcana-awaken', impact: 'arcana-release' }
    });
  });

  test('Cup Flush waits for summon exit before showing party healing', async ({ page }) => {
    const hand = [5, 7, 9, 12, 14].map((number) => ({
      id: `cup-flush-${number}`,
      kind: 'minor',
      suit: 'Cup',
      number
    }));
    hand.push({ id: 'cup-flush-reserve', kind: 'minor', suit: 'Wand', number: 2 });

    const audit = await page.evaluate((cards) => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({
        withTrick: false,
        enemyHp: 420,
        hpBySeat: [50, 60, 70, 80],
        combatBySeat: Array.from({ length: 4 }, () => ({ maxHp: 100 })),
        handsBySeat: [cards]
      });
      debug.battlePlayCards(0, cards.slice(0, 5).map((card) => card.id));
      const state = debug.battleState();
      const startedAt = state.transition.startedAt;
      const originalNow = Date.now;
      const inspectAt = (elapsed) => {
        Date.now = () => startedAt + elapsed;
        debug.battleRender();
        const cutin = document.querySelector('.tarot-kingdom-skill-cutin.is-summon');
        return {
          elapsed,
          phase: cutin?.className.match(/is-phase-([a-z-]+)/)?.[1] || '',
          cutinDisplay: cutin ? getComputedStyle(cutin).display : 'missing',
          healTexts: Array.from(document.querySelectorAll('.tarot-kingdom-heal-number'))
            .map((node) => node.textContent)
        };
      };
      try {
        return {
          beforeExit: inspectAt(3850),
          afterExit: inspectAt(3910),
          effectAt: state.transition.timeline.effectAt - startedAt,
          healing: state.battle.events.at(-1).effects.filter((entry) => (
            entry.source === 'summon' && entry.targetType === 'player' && entry.kind === 'heal-percent'
          ))
        };
      } finally {
        Date.now = originalNow;
        debug.battleRender();
      }
    }, hand);

    expect(audit.effectAt).toBe(3900);
    expect(audit.healing).toHaveLength(4);
    expect(audit.beforeExit).toMatchObject({ phase: 'recover', healTexts: [] });
    expect(audit.beforeExit.cutinDisplay).not.toBe('none');
    expect(audit.afterExit.phase).toBe('effect');
    expect(audit.afterExit.cutinDisplay).toBe('none');
    expect(audit.afterExit.healTexts).toHaveLength(4);
  });

  test('Sword Flush reveals its party buff only after the summon leaves', async ({ page }) => {
    const hand = [5, 7, 9, 12, 14].map((number) => ({
      id: `sword-flush-${number}`,
      kind: 'minor',
      suit: 'Sword',
      number
    }));
    hand.push({ id: 'sword-flush-reserve', kind: 'minor', suit: 'Cup', number: 2 });

    const audit = await page.evaluate((cards) => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({ withTrick: false, handsBySeat: [cards] });
      debug.battlePlayCards(0, cards.slice(0, 5).map((card) => card.id));
      const state = debug.battleState();
      const startedAt = state.transition.startedAt;
      const originalNow = Date.now;
      const inspectAt = (elapsed) => {
        Date.now = () => startedAt + elapsed;
        debug.battleRender();
        return {
          cutinDisplay: getComputedStyle(document.querySelector('.tarot-kingdom-skill-cutin.is-summon')).display,
          resultTexts: Array.from(document.querySelectorAll('.tarot-kingdom-effect-result-text'))
            .map((node) => node.textContent),
          navigation: document.querySelector('#tarotKingdomSelectedEffectText')?.textContent || ''
        };
      };
      try {
        return { beforeExit: inspectAt(3850), afterExit: inspectAt(3910) };
      } finally {
        Date.now = originalNow;
        debug.battleRender();
      }
    }, hand);

    expect(audit.beforeExit.cutinDisplay).not.toBe('none');
    expect(audit.beforeExit.resultTexts).toEqual([]);
    expect(audit.afterExit.cutinDisplay).toBe('none');
    expect(audit.afterExit.resultTexts).toEqual(['HASTE', 'HASTE', 'HASTE', 'HASTE']);
    expect(audit.afterExit.navigation).toContain('味方全員は　素早さが上がった');
  });

  test('party and hand HUD leave while the enemy and field stay, then return at synchronized offsets', async ({ page }) => {
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
      setAnimationTime('#tarotKingdomRoot .tarot-kingdom-panel--hand', 'SummonHudVisibility');
      const opacityOf = (selector) => Number(getComputedStyle(document.querySelector(selector)).opacity);
      return {
        party: opacityOf('#tarotKingdomBattleStage .tarot-kingdom-battle-party-side'),
        handHud: opacityOf('#tarotKingdomRoot .tarot-kingdom-panel--hand'),
        field: opacityOf('#tarotKingdomRoot .tarot-kingdom-panel--trick'),
        enemy: opacityOf('#tarotKingdomEnemySprite'),
        cinematic: document.querySelector('#tarotKingdomRoot')?.classList.contains('is-summon-cinematic') || false,
        partyAnimations: Array.from(document.querySelector('#tarotKingdomBattleStage .tarot-kingdom-battle-party-side')?.getAnimations() || [])
          .map((entry) => entry.animationName),
        hudAnimations: Array.from(document.querySelector('#tarotKingdomRoot .tarot-kingdom-panel--hand')?.getAnimations() || [])
          .map((entry) => entry.animationName)
      };
    }, offsetMs);

    const hidden = await readVisibilityAt(1050);
    expect(hidden).toMatchObject({
      cinematic: true,
      party: expect.any(Number),
      handHud: expect.any(Number)
    });
    expect(hidden.party, JSON.stringify(hidden)).toBeLessThan(0.05);
    expect(hidden.handHud).toBeLessThan(0.05);
    expect(hidden.field).toBeGreaterThan(0.9);
    expect(hidden.enemy).toBeGreaterThan(0.5);
    expect(hidden.cinematic).toBe(true);

    const partyReturn = await readVisibilityAt(4050);
    expect(partyReturn.party).toBeGreaterThan(0.2);
    expect(partyReturn.handHud).toBeLessThan(0.1);
    expect(partyReturn.field).toBeGreaterThan(0.9);
    expect(partyReturn.enemy).toBeGreaterThan(0.5);

    const hudReturn = await readVisibilityAt(4300);
    expect(hudReturn.party).toBeGreaterThan(0.9);
    expect(hudReturn.handHud).toBeGreaterThan(0.2);
    expect(hudReturn.field).toBeGreaterThan(0.9);
    expect(hudReturn.cinematic).toBe(true);

    await page.waitForTimeout(Math.max(0, startedAt + 4650 - Date.now()));
    const finished = await page.evaluate(() => {
      window.TarotKingdomDebug.battleRender();
      const opacityOf = (selector) => Number(getComputedStyle(document.querySelector(selector)).opacity);
      return {
        party: opacityOf('#tarotKingdomBattleStage .tarot-kingdom-battle-party-side'),
        handHud: opacityOf('#tarotKingdomRoot .tarot-kingdom-panel--hand'),
        field: opacityOf('#tarotKingdomRoot .tarot-kingdom-panel--trick'),
        cinematic: document.querySelector('#tarotKingdomRoot')?.classList.contains('is-summon-cinematic') || false,
        motionPaused: document.querySelector('#tarotKingdomRoot')?.dataset.summonMotionPaused === 'true'
      };
    });
    expect(finished.party).toBeGreaterThan(0.9);
    expect(finished.handHud).toBeGreaterThan(0.9);
    expect(finished.field).toBeGreaterThan(0.9);
    expect(finished.cinematic).toBe(false);
    expect(finished.motionPaused).toBe(false);
    await expect(page.locator('.tarot-kingdom-skill-cutin.is-summon')).toHaveCount(0);
  });

  test('short action cut-ins stay inside the battlefield with English keywords and a small actor name', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    const cases = [
      ['ターン 1', 'TURN'],
      ['パス', 'PASS'],
      ['防御', 'DEFEND'],
      ['ドロー', 'DRAW'],
      ['5スキップ', 'SKIP'],
      ['8カット', 'CUT'],
      ['11バック', 'REVERSE'],
      ['ロイヤルロック', 'LOCK'],
      ['ロイヤルロック解除', 'BREAK'],
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
      summon: { id: 'flush_cup_low', effectKey: 'flushElemental' }
    });
    expect(audit.after[0]).toBeGreaterThan(audit.before[0]);
    expect(audit.after[1]).toBeGreaterThan(audit.before[1]);
    expect(audit.after[2]).toBeGreaterThan(audit.before[2]);
    expect(audit.after[3]).toBe(0);
  });

  test('a five-card role with Major Arcana keeps the role effect and invokes the highest Major artwork and RPG effect', async ({ page }) => {
    const hand = [
      { id: 'major-emperor', kind: 'major', suit: 'None', number: 4 },
      { id: 'minor-four-sword', kind: 'minor', suit: 'Sword', number: 4 },
      { id: 'minor-four-wand', kind: 'minor', suit: 'Wand', number: 4 },
      { id: 'minor-seven-cup', kind: 'minor', suit: 'Cup', number: 7 },
      { id: 'minor-seven-pentacle', kind: 'minor', suit: 'Pentacle', number: 7 },
      { id: 'keep-card', kind: 'minor', suit: 'Cup', number: 2 }
    ];
    const audit = await page.evaluate((cards) => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({ withTrick: false, turnIndex: 0, handsBySeat: [cards] });
      const result = debug.battlePlayCards(0, cards.slice(0, 5).map((card) => card.id), { resolve: false });
      return result.state.battle.events.at(-1);
    }, hand);

    expect(audit).toMatchObject({
      type: 'skill',
      summon: {
        version: 2,
        id: 'major_summon_04',
        artSource: 'major',
        majorNumber: 4,
        roleKey: 'FullHouse'
      },
      majorNumber: 4
    });
    expect(audit.summon.roleEffectKey).not.toBe('');
    expect(audit.majorSkillName).not.toBe('');
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
      durationMs: 1920,
      impactOffsetMs: 1080,
      hpRevealOffsetMs: 1200
    });
  });

  test('schema 24 keeps legacy summon selection while schema 25 enables suit and Major artwork', async ({ page }) => {
    const versions = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      debug.battleScenario({ withTrick: false });
      const base = debug.battleState();
      const state = {
        ...base,
        rules: { ...base.rules, summonSelectionVersion: 2 }
      };
      const legacy = debug.battleDeserialize({ schema: 24, revision: 1, state });
      const current = debug.battleDeserialize({ schema: 25, revision: 2, state });
      return {
        legacy: legacy.rules.summonSelectionVersion,
        current: current.rules.summonSelectionVersion
      };
    });
    expect(versions).toEqual({ legacy: 1, current: 2 });
  });

  test('normal attack timelines follow each shared weapon impact profile', async ({ page }) => {
    const audit = await page.evaluate(() => {
      const debug = window.TarotKingdomDebug;
      return {
        unarmed: debug.battleCombatTimeline('attack', 'unarmed'),
        dagger: debug.battleCombatTimeline('attack', 'dagger'),
        bow: debug.battleCombatTimeline('attack', 'bow'),
        gun: debug.battleCombatTimeline('attack', 'gun'),
        gunBig: debug.battleCombatTimeline('attack', 'gun_big'),
        axeBig: debug.battleCombatTimeline('attack', 'axe_big')
      };
    });

    expect(audit.unarmed).toMatchObject({ weaponMotionDurationMs: 340, impactOffsetMs: 323 });
    expect(audit.dagger).toMatchObject({ weaponMotionDurationMs: 300, impactOffsetMs: 276 });
    expect(audit.bow).toMatchObject({ weaponMotionDurationMs: 540, impactOffsetMs: 536 });
    expect(audit.gun).toMatchObject({ weaponMotionDurationMs: 420, impactOffsetMs: 373 });
    expect(audit.gunBig).toMatchObject({ weaponMotionDurationMs: 620, impactOffsetMs: 478 });
    expect(audit.axeBig).toMatchObject({ weaponMotionDurationMs: 740, impactOffsetMs: 728 });
    expect(audit.gunBig.durationMs).toBeGreaterThan(audit.gun.durationMs);
    expect(audit.axeBig.durationMs).toBeGreaterThan(audit.gunBig.durationMs);
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
      expect(entry.visualScale, entry.id).toBeLessThanOrEqual(1.4);
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
      await page.waitForTimeout(2600);
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
