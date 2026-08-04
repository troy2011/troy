const { test, expect } = require('@playwright/test');

test.describe('shared combat avatar motions', () => {
  test('keeps weapon timing and terminal states shared', async ({ page }) => {
    await page.goto('/melee-demo.html');

    const audit = await page.evaluate(async () => {
      const combat = await import('/js/avatarCombat.js');
      const root = document.createElement('div');
      root.id = 'shared-combat-avatar-test';
      root.className = 'avatar-combat-actor';
      document.body.appendChild(root);

      combat.renderCombatAvatar(root, {
        Race: 'human',
        AvatarColor: 'brown',
        SkinColorIndex: 1,
        FaceIndex: 1,
        HairStyleIndex: 1,
        FacialHairStyleIndex: 0,
        level: 1
      });

      const layers = root.querySelectorAll('.avatar-layer').length;
      const coloredRoot = document.createElement('div');
      coloredRoot.id = 'shared-combat-avatar-hair-color-test';
      coloredRoot.className = 'avatar-combat-actor';
      document.body.appendChild(coloredRoot);
      combat.renderCombatAvatar(coloredRoot, {
        Race: 'human', AvatarColor: 'red', SkinColorIndex: 1,
        FaceIndex: 1, HairStyleIndex: 1, HairColorIndex: 3,
        FacialHairStyleIndex: 1, level: 30
      });
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const hairLayer = coloredRoot.querySelector('#shared-combat-avatar-hair-color-test-layer-hair');
        if (hairLayer?.style.backgroundImage) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      const hairColorPath = coloredRoot.querySelector('#shared-combat-avatar-hair-color-test-layer-hair')
        ?.style.backgroundImage || '';
      const facialHairColorPath = coloredRoot.querySelector('#shared-combat-avatar-hair-color-test-layer-facial-hair')
        ?.style.backgroundImage || '';
      const dagger = combat.getCombatWeaponMotionProfile('dagger');
      const heavy = combat.getCombatWeaponMotionProfile('axe_big');
      const alias = combat.getCombatWeaponMotionProfile('large-gun');
      const profiles = Object.fromEntries([
        'unarmed', 'dagger', 'wand', 'gun', 'shield', 'sword', 'polearm', 'staff',
        'bow', 'axe', 'blunt', 'gun_big', 'sword_big', 'axe_big'
      ].map((weapon) => [weapon, combat.getCombatWeaponMotionProfile(weapon)]));

      combat.flashCombatAvatarHurt(root, { duration: 100 });
      const hurt = root.classList.contains('is-avatar-damaged');
      combat.setCombatAvatarKo(root, true, { side: 'player' });
      const ko = root.classList.contains('is-avatar-defeated');
      const stopped = !root.dataset.avatarBodyMotion;
      const deathSprite = root.querySelector('.avatar-combat-death-sprite');
      const deathStart = {
        exists: !!deathSprite,
        display: deathSprite ? getComputedStyle(deathSprite).display : '',
        image: deathSprite ? getComputedStyle(deathSprite).backgroundImage : '',
        frame: deathSprite?.dataset.avatarDeathFrame || '',
        layersHidden: Array.from(root.querySelectorAll('.avatar-layer')).every((layer) => (
          getComputedStyle(layer).visibility === 'hidden'
        ))
      };
      await new Promise((resolve) => setTimeout(resolve, 220));
      const deathAdvancedFrame = Number(deathSprite?.dataset.avatarDeathFrame || 0);
      const victoryWhileKo = combat.setCombatAvatarVictory(root, true, { side: 'player' });

      combat.setCombatAvatarKo(root, false, { side: 'player' });
      const revivedIdle = root.dataset.avatarBodyMotion === 'idle';
      const deathReset = {
        display: deathSprite ? getComputedStyle(deathSprite).display : '',
        frame: deathSprite?.dataset.avatarDeathFrame || ''
      };
      const victory = combat.setCombatAvatarVictory(root, true, { side: 'player' });
      const victorious = root.classList.contains('is-avatar-victorious');
      combat.resetCombatAvatarState(root, { resumeIdle: false });
      const reset = !root.classList.contains('is-avatar-defeated')
        && !root.classList.contains('is-avatar-victorious')
        && !root.classList.contains('is-avatar-damaged');

      const attackPromise = combat.playCombatAvatarAttack(root, 'polearm', {
        direction: 'left',
        duration: 120,
        bodyMotion: false
      });
      const attacking = root.classList.contains('is-avatar-attacking')
        && root.classList.contains('is-avatar-weapon-polearm')
        && root.classList.contains('is-avatar-attack-left');
      await attackPromise;
      const attackCleared = !root.classList.contains('is-avatar-attacking')
        && !root.classList.contains('is-avatar-weapon-polearm');
      const cancelledPromise = combat.playCombatAvatarAttack(root, 'axe_big', {
        direction: 'left',
        duration: 1200,
        bodyMotion: false
      });
      combat.resetCombatAvatarState(root, { resumeIdle: false });
      const cancelledResult = await cancelledPromise;
      const cancelCleared = !root.classList.contains('is-avatar-attacking')
        && !root.classList.contains('is-avatar-weapon-axe-big');
      const bigGunPromise = combat.playCombatAvatarAttack(root, 'gun_big', {
        direction: 'left',
        duration: 180,
        bodyMotion: false
      });
      const bigGunMotion = {
        actorAnimation: getComputedStyle(root).animationName,
        muzzleAnimation: getComputedStyle(root, '::after').animationName,
        muzzleBorder: getComputedStyle(root, '::after').borderStyle,
        muzzleBackground: getComputedStyle(root, '::after').backgroundImage,
        weaponAnimation: getComputedStyle(root.querySelector('#shared-combat-avatar-test-layer-weapon-right')).animationName,
        rightHandAnimation: getComputedStyle(root.querySelector('#shared-combat-avatar-test-layer-hand-right')).animationName,
        leftHandAnimation: getComputedStyle(root.querySelector('#shared-combat-avatar-test-layer-hand-left')).animationName,
        forward: root.style.getPropertyValue('--avatar-motion-forward-x'),
        recoil: root.style.getPropertyValue('--avatar-motion-recoil-x'),
        lift: root.style.getPropertyValue('--avatar-motion-lift-y')
      };
      const bigGunActorAnimation = root.getAnimations().find((animation) => (
        animation.animationName === 'avatarCombatBigGun'
      ));
      const bigGunWeaponLayer = root.querySelector('#shared-combat-avatar-test-layer-weapon-right');
      const bigGunWeaponAnimation = bigGunWeaponLayer.getAnimations().find((animation) => (
        animation.animationName === 'avatarWeaponBigGunRecoil'
      ));
      bigGunActorAnimation.pause();
      bigGunWeaponAnimation.pause();
      bigGunActorAnimation.currentTime = 180 * 0.47;
      bigGunWeaponAnimation.currentTime = 180 * 0.47;
      const bigGunBraceX = new DOMMatrix(getComputedStyle(root).transform).m41;
      const bigGunWeaponBraceMatrix = new DOMMatrix(getComputedStyle(bigGunWeaponLayer).transform);
      bigGunActorAnimation.currentTime = 180 * 0.48;
      bigGunWeaponAnimation.currentTime = 180 * 0.48;
      const bigGunRecoilX = new DOMMatrix(getComputedStyle(root).transform).m41;
      const bigGunWeaponImpactMatrix = new DOMMatrix(getComputedStyle(bigGunWeaponLayer).transform);
      bigGunActorAnimation.play();
      bigGunWeaponAnimation.play();
      await bigGunPromise;
      const bigGunMotionCleared = {
        className: root.classList.contains('is-avatar-weapon-gun-big'),
        forward: root.style.getPropertyValue('--avatar-motion-forward-x'),
        recoil: root.style.getPropertyValue('--avatar-motion-recoil-x'),
        lift: root.style.getPropertyValue('--avatar-motion-lift-y')
      };
      root.remove();
      coloredRoot.remove();

      return {
        layers,
        hairColorPath,
        facialHairColorPath,
        dagger,
        heavy,
        alias,
        profiles,
        hurt,
        ko,
        stopped,
        deathStart,
        deathAdvancedFrame,
        deathReset,
        victoryWhileKo,
        revivedIdle,
        victory,
        victorious,
        reset,
        attacking,
        attackCleared,
        cancelledResult,
        cancelCleared,
        bigGunMotion,
        bigGunTravel: {
          braceX: bigGunBraceX,
          recoilX: bigGunRecoilX,
          weaponBraceX: bigGunWeaponBraceMatrix.m41,
          weaponImpactX: bigGunWeaponImpactMatrix.m41,
          weaponImpactAngle: Math.atan2(
            bigGunWeaponImpactMatrix.b,
            bigGunWeaponImpactMatrix.a
          ) * (180 / Math.PI)
        },
        bigGunMotionCleared
      };
    });

    expect(audit.layers).toBe(9);
    expect(audit.hairColorPath).toContain('human_hair_blue.png');
    expect(audit.facialHairColorPath).toContain('human_facialhair_blue.png');
    expect(audit.dagger).toMatchObject({ weapon: 'dagger', duration: 300 });
    expect(audit.heavy).toMatchObject({
      weapon: 'axe_big',
      duration: 740,
      forwardPx: 16,
      recoilPx: 10,
      shake: { x: 8, y: 2, duration: 340 }
    });
    expect(audit.alias).toMatchObject({
      weapon: 'gun_big',
      duration: 620,
      impactRatio: 0.48,
      forwardPx: 2,
      recoilPx: 24,
      liftPx: 2,
      shake: { x: 8, y: 2, duration: 320 }
    });
    expect(Object.keys(audit.profiles)).toHaveLength(14);
    expect(Object.values(audit.profiles).every((profile) => (
      profile.duration >= 300
      && profile.impactRatio >= 0.3
      && profile.impactRatio <= 0.75
      && profile.forwardPx >= 1
      && profile.recoilPx >= 2
    ))).toBe(true);
    expect(audit.hurt).toBe(true);
    expect(audit.ko).toBe(true);
    expect(audit.stopped).toBe(true);
    expect(audit.deathStart).toEqual({
      exists: true,
      display: 'block',
      image: expect.stringContaining('/Sprites/Characters/body/death.png'),
      frame: '0',
      layersHidden: true
    });
    expect(audit.deathAdvancedFrame).toBeGreaterThanOrEqual(2);
    expect(audit.deathReset).toEqual({ display: 'none', frame: '0' });
    expect(audit.victoryWhileKo).toBe(false);
    expect(audit.revivedIdle).toBe(true);
    expect(audit.victory).toBe(true);
    expect(audit.victorious).toBe(true);
    expect(audit.reset).toBe(true);
    expect(audit.attacking).toBe(true);
    expect(audit.attackCleared).toBe(true);
    expect(audit.cancelledResult).toBe(false);
    expect(audit.cancelCleared).toBe(true);
    expect(audit.bigGunMotion).toEqual({
      actorAnimation: 'avatarCombatBigGun',
      muzzleAnimation: 'avatarCombatBigMuzzle',
      muzzleBorder: 'none',
      muzzleBackground: expect.stringContaining('radial-gradient'),
      weaponAnimation: 'avatarWeaponBigGunRecoil',
      rightHandAnimation: 'avatarHandBigGunGrip',
      leftHandAnimation: 'avatarHandBigGunGrip',
      forward: '-2px',
      recoil: '24px',
      lift: '-2px'
    });
    expect(audit.bigGunMotionCleared).toEqual({
      className: false,
      forward: '',
      recoil: '',
      lift: ''
    });
    expect(audit.bigGunTravel.braceX).toBeLessThan(0);
    expect(audit.bigGunTravel.recoilX).toBeGreaterThan(20);
    expect(audit.bigGunTravel.recoilX - audit.bigGunTravel.braceX).toBeGreaterThan(24);
    expect(audit.bigGunTravel.weaponImpactX - audit.bigGunTravel.weaponBraceX).toBeGreaterThan(20);
    expect(Math.abs(audit.bigGunTravel.weaponImpactAngle)).toBeLessThanOrEqual(6);
  });

  test('removes superseded generic weapon motion overrides from both combat stylesheets', async ({ page }) => {
    await page.goto('/melee-demo.html');
    const audit = await page.evaluate(async () => {
      const [appCss, demoCss] = await Promise.all([
        fetch('/style.css').then((response) => response.text()),
        fetch('/css/melee-demo.css').then((response) => response.text())
      ]);
      const obsoleteTokens = [
        'is-avatar-weapon-heavy',
        'is-avatar-weapon-pierce',
        'is-avatar-weapon-ranged',
        'is-avatar-weapon-guard',
        '@keyframes avatarCombatHeavy',
        '@keyframes avatarCombatThrust',
        '@keyframes avatarCombatRanged',
        '@keyframes avatarCombatGuard',
        '@keyframes avatarCombatHeavySlash',
        '@keyframes avatarCombatPierceSlash',
        '@keyframes avatarWeaponHeavySwing',
        '@keyframes avatarWeaponThrust',
        '@keyframes avatarWeaponRecoil',
        '@keyframes avatarWeaponGuard',
        '@keyframes avatarHandHeavyGrip',
        '@keyframes avatarWeaponSwing',
        'animation: avatarWeaponSwing'
      ];
      return Object.fromEntries(obsoleteTokens.map((token) => [token, {
        app: appCss.includes(token),
        demo: demoCss.includes(token)
      }]));
    });

    expect(Object.values(audit).every(({ app, demo }) => !app && !demo)).toBe(true);
  });

  test('keeps every shared weapon keyframe identical in app and melee demo styles', async ({ page }) => {
    await page.goto('/melee-demo.html');
    const audit = await page.evaluate(async () => {
      const [appCss, demoCss] = await Promise.all([
        fetch('/style.css').then((response) => response.text()),
        fetch('/css/melee-demo.css').then((response) => response.text())
      ]);
      const names = [
        'avatarCombatUnarmed', 'avatarCombatSword', 'avatarCombatDagger',
        'avatarCombatPolearm', 'avatarCombatBlunt', 'avatarCombatAxe',
        'avatarCombatGreatsword', 'avatarCombatGreataxe', 'avatarCombatStaff',
        'avatarCombatWand', 'avatarCombatBow', 'avatarCombatGun',
        'avatarCombatBigGun', 'avatarCombatShield', 'avatarCombatPunchImpact',
        'avatarCombatSwordSlash', 'avatarCombatDaggerStab',
        'avatarCombatPolearmPierce', 'avatarCombatBluntImpact',
        'avatarCombatAxeCleave', 'avatarCombatGreatswordCleave',
        'avatarCombatGreataxeCleave', 'avatarCombatStaffPulse',
        'avatarCombatWandSpark', 'avatarCombatArrowShot', 'avatarCombatMuzzle',
        'avatarCombatBigMuzzle', 'avatarCombatShieldBash', 'avatarHandPunch',
        'avatarWeaponSwordCut', 'avatarHandSwordCut', 'avatarWeaponDaggerJab',
        'avatarHandDaggerJab', 'avatarWeaponPolearmThrust',
        'avatarHandPolearmGrip', 'avatarWeaponBluntSmash',
        'avatarHandBluntGrip', 'avatarWeaponAxeChop', 'avatarHandAxeGrip',
        'avatarWeaponGreatswordDrop', 'avatarHandGreatswordGrip',
        'avatarWeaponGreataxeDrop', 'avatarHandGreataxeGrip',
        'avatarWeaponStaffCast', 'avatarHandStaffCast', 'avatarHandStaffFocus',
        'avatarWeaponWandFlick', 'avatarHandWandFlick', 'avatarWeaponBowDraw',
        'avatarHandBowDraw', 'avatarHandBowHold', 'avatarWeaponGunRecoil',
        'avatarHandGunGrip', 'avatarWeaponBigGunRecoil', 'avatarHandBigGunGrip',
        'avatarWeaponShieldBash', 'avatarHandShieldBash'
      ];
      const extractKeyframe = (css, name) => {
        const start = css.indexOf(`@keyframes ${name}`);
        if (start < 0) return null;
        const open = css.indexOf('{', start);
        let depth = 0;
        for (let index = open; index < css.length; index += 1) {
          if (css[index] === '{') depth += 1;
          if (css[index] === '}') depth -= 1;
          if (depth === 0) return css.slice(start, index + 1).replace(/\s+/g, ' ').trim();
        }
        return null;
      };
      return Object.fromEntries(names.map((name) => {
        const app = extractKeyframe(appCss, name);
        const demo = extractKeyframe(demoCss, name);
        return [name, { present: Boolean(app && demo), identical: app === demo }];
      }));
    });

    expect(Object.entries(audit).filter(([, result]) => !result.present)).toEqual([]);
    expect(Object.entries(audit).filter(([, result]) => !result.identical)).toEqual([]);
  });

  test('assigns a dedicated body motion to every supported player weapon', async ({ page }) => {
    await page.goto('/melee-demo.html');
    const audit = await page.evaluate(async () => {
      const combat = await import('/js/avatarCombat.js');
      const root = document.createElement('div');
      root.id = 'all-weapon-motion-audit';
      root.className = 'avatar-combat-actor';
      document.body.appendChild(root);
      combat.renderCombatAvatar(root, {
        Race: 'human', AvatarColor: 'brown', SkinColorIndex: 1,
        FaceIndex: 1, HairStyleIndex: 1, FacialHairStyleIndex: 0, level: 1
      });
      const expected = {
        unarmed: 'avatarCombatUnarmed',
        sword: 'avatarCombatSword',
        dagger: 'avatarCombatDagger',
        polearm: 'avatarCombatPolearm',
        blunt: 'avatarCombatBlunt',
        axe: 'avatarCombatAxe',
        sword_big: 'avatarCombatGreatsword',
        axe_big: 'avatarCombatGreataxe',
        staff: 'avatarCombatStaff',
        wand: 'avatarCombatWand',
        bow: 'avatarCombatBow',
        gun: 'avatarCombatGun',
        gun_big: 'avatarCombatBigGun',
        shield: 'avatarCombatShield'
      };
      const actual = {};
      for (const weapon of Object.keys(expected)) {
        const attack = combat.playCombatAvatarAttack(root, weapon, {
          direction: 'left',
          duration: 120,
          bodyMotion: false
        });
        actual[weapon] = getComputedStyle(root).animationName;
        await attack;
      }
      combat.resetCombatAvatarState(root, { resumeIdle: false });
      root.remove();
      return { expected, actual };
    });

    expect(audit.actual).toEqual(audit.expected);
  });

  test('uses weapon-specific grip, weapon, and impact animations without generic fallbacks', async ({ page }) => {
    await page.goto('/melee-demo.html');
    const audit = await page.evaluate(async () => {
      const combat = await import('/js/avatarCombat.js');
      const root = document.createElement('div');
      root.id = 'weapon-layer-motion-audit';
      root.className = 'avatar-combat-actor';
      document.body.appendChild(root);
      combat.renderCombatAvatar(root, {
        Race: 'human', AvatarColor: 'brown', SkinColorIndex: 1,
        FaceIndex: 1, HairStyleIndex: 1, FacialHairStyleIndex: 0, level: 1
      });
      const layer = (suffix) => root.querySelector(`#weapon-layer-motion-audit-layer-${suffix}`);
      const expected = {
        unarmed: { handRight: 'avatarHandPunch', impact: 'avatarCombatPunchImpact' },
        sword: { weapon: 'avatarWeaponSwordCut', handRight: 'avatarHandSwordCut', impact: 'avatarCombatSwordSlash' },
        dagger: { weapon: 'avatarWeaponDaggerJab', handRight: 'avatarHandDaggerJab', impact: 'avatarCombatDaggerStab' },
        polearm: { weapon: 'avatarWeaponPolearmThrust', handRight: 'avatarHandPolearmGrip', handLeft: 'avatarHandPolearmGrip', impact: 'avatarCombatPolearmPierce' },
        blunt: { weapon: 'avatarWeaponBluntSmash', handRight: 'avatarHandBluntGrip', impact: 'avatarCombatBluntImpact' },
        axe: { weapon: 'avatarWeaponAxeChop', handRight: 'avatarHandAxeGrip', impact: 'avatarCombatAxeCleave' },
        sword_big: { weapon: 'avatarWeaponGreatswordDrop', handRight: 'avatarHandGreatswordGrip', handLeft: 'avatarHandGreatswordGrip', impact: 'avatarCombatGreatswordCleave' },
        axe_big: { weapon: 'avatarWeaponGreataxeDrop', handRight: 'avatarHandGreataxeGrip', handLeft: 'avatarHandGreataxeGrip', impact: 'avatarCombatGreataxeCleave' },
        staff: { weapon: 'avatarWeaponStaffCast', handRight: 'avatarHandStaffCast', handLeft: 'avatarHandStaffFocus', impact: 'avatarCombatStaffPulse' },
        wand: { weapon: 'avatarWeaponWandFlick', handRight: 'avatarHandWandFlick', impact: 'avatarCombatWandSpark' },
        bow: { weapon: 'avatarWeaponBowDraw', handRight: 'avatarHandBowHold', handLeft: 'avatarHandBowDraw', impact: 'avatarCombatArrowShot' },
        gun: { weapon: 'avatarWeaponGunRecoil', handRight: 'avatarHandGunGrip', impact: 'avatarCombatMuzzle' },
        gun_big: { weapon: 'avatarWeaponBigGunRecoil', handRight: 'avatarHandBigGunGrip', handLeft: 'avatarHandBigGunGrip', impact: 'avatarCombatBigMuzzle' },
        shield: { weapon: 'avatarWeaponShieldBash', shield: 'avatarWeaponShieldBash', handRight: 'avatarHandShieldBash', handLeft: 'avatarHandShieldBash', impact: 'avatarCombatShieldBash' }
      };
      const actual = {};
      for (const weapon of Object.keys(expected)) {
        const attack = combat.playCombatAvatarAttack(root, weapon, {
          direction: 'left', duration: 120, bodyMotion: false
        });
        actual[weapon] = {
          weapon: getComputedStyle(layer('weapon-right')).animationName,
          shield: getComputedStyle(layer('shield-left')).animationName,
          handRight: getComputedStyle(layer('hand-right')).animationName,
          handLeft: getComputedStyle(layer('hand-left')).animationName,
          impact: getComputedStyle(root, '::after').animationName
        };
        await attack;
      }
      root.remove();
      return { expected, actual };
    });

    for (const [weapon, expected] of Object.entries(audit.expected)) {
      expect(audit.actual[weapon], weapon).toMatchObject(expected);
    }
  });

  test('keeps polearm height stable and aligns ranged or heavy impacts with their projectiles', async ({ page }) => {
    await page.goto('/melee-demo.html');
    const audit = await page.evaluate(async () => {
      const combat = await import('/js/avatarCombat.js');
      const root = document.createElement('div');
      root.id = 'weapon-fit-motion-audit';
      root.className = 'avatar-combat-actor';
      document.body.appendChild(root);
      combat.renderCombatAvatar(root, {
        Race: 'human', AvatarColor: 'brown', SkinColorIndex: 1,
        FaceIndex: 1, HairStyleIndex: 1, FacialHairStyleIndex: 0, level: 1
      });

      const polearmLayer = root.querySelector('#weapon-fit-motion-audit-layer-weapon-right');
      polearmLayer.style.setProperty('--avatar-layer-base-transform', 'translate(0px, -42px)');
      const polearmAttack = combat.playCombatAvatarAttack(root, 'polearm', {
        direction: 'left', duration: 1000, bodyMotion: false
      });
      const polearmAnimation = polearmLayer.getAnimations().find((animation) => (
        animation.animationName === 'avatarWeaponPolearmThrust'
      ));
      polearmAnimation.pause();
      polearmAnimation.currentTime = 0;
      const polearmStartY = new DOMMatrix(getComputedStyle(polearmLayer).transform).m42;
      polearmAnimation.currentTime = 480;
      const polearmImpactY = new DOMMatrix(getComputedStyle(polearmLayer).transform).m42;
      polearmAnimation.play();
      await polearmAttack;

      const unarmedAttack = combat.playCombatAvatarAttack(root, 'unarmed', {
        direction: 'left', duration: 120, bodyMotion: false
      });
      const unarmedMotion = {
        actor: getComputedStyle(root).animationName,
        hand: getComputedStyle(root.querySelector('#weapon-fit-motion-audit-layer-hand-right')).animationName,
        impact: getComputedStyle(root, '::after').animationName
      };
      await unarmedAttack;

      const daggerAttack = combat.playCombatAvatarAttack(root, 'dagger', {
        direction: 'left', duration: 1000, bodyMotion: false
      });
      const daggerImpactAnimation = document.getAnimations().find((animation) => (
        animation.animationName === 'avatarCombatDaggerStab'
      ));
      daggerImpactAnimation.pause();
      daggerImpactAnimation.currentTime = 600;
      const daggerLateImpactOpacity = Number(getComputedStyle(root, '::after').opacity);
      daggerImpactAnimation.play();
      await daggerAttack;

      const greatswordAttack = combat.playCombatAvatarAttack(root, 'sword_big', {
        direction: 'left', duration: 1000, bodyMotion: false
      });
      const greatswordImpactAnimation = document.getAnimations().find((animation) => (
        animation.animationName === 'avatarCombatGreatswordCleave'
      ));
      greatswordImpactAnimation.pause();
      greatswordImpactAnimation.currentTime = 660;
      const greatswordImpactOpacity = Number(getComputedStyle(root, '::after').opacity);
      greatswordImpactAnimation.play();
      await greatswordAttack;
      root.remove();

      return {
        polearmStartY,
        polearmImpactY,
        unarmedMotion,
        daggerLateImpactOpacity,
        greatswordImpactOpacity,
        bow: combat.getCombatWeaponMotionProfile('bow'),
        greataxe: combat.getCombatWeaponMotionProfile('axe_big')
      };
    });

    expect(audit.polearmStartY).toBeLessThanOrEqual(-40);
    expect(Math.abs(audit.polearmImpactY - audit.polearmStartY)).toBeLessThanOrEqual(8);
    expect(audit.unarmedMotion).toEqual({
      actor: 'avatarCombatUnarmed',
      hand: 'avatarHandPunch',
      impact: 'avatarCombatPunchImpact'
    });
    expect(audit.daggerLateImpactOpacity).toBeLessThanOrEqual(0.05);
    expect(audit.greatswordImpactOpacity).toBeGreaterThanOrEqual(0.9);
    expect(audit.bow).toMatchObject({ duration: 540, impactRatio: 0.66 });
    expect(audit.greataxe).toMatchObject({ duration: 740, impactRatio: 0.74 });
  });

  test('keeps every weapon motion physically consistent at draw, impact, and recoil', async ({ page }) => {
    await page.goto('/melee-demo.html');
    const audit = await page.evaluate(async () => {
      const combat = await import('/js/avatarCombat.js');
      const root = document.createElement('div');
      root.id = 'weapon-physical-motion-audit';
      root.className = 'avatar-combat-actor';
      document.body.appendChild(root);
      combat.renderCombatAvatar(root, {
        Race: 'human', AvatarColor: 'brown', SkinColorIndex: 1,
        FaceIndex: 1, HairStyleIndex: 1, FacialHairStyleIndex: 0, level: 1
      });
      const layer = (suffix) => root.querySelector(`#weapon-physical-motion-audit-layer-${suffix}`);
      const matrixOf = (element) => {
        const matrix = new DOMMatrix(getComputedStyle(element).transform);
        return {
          x: matrix.m41,
          y: matrix.m42,
          angle: Math.atan2(matrix.b, matrix.a) * (180 / Math.PI)
        };
      };
      const definitions = {
        unarmed: { animation: 'avatarHandPunch', layer: 'hand-right', impact: 0.42 },
        dagger: { animation: 'avatarWeaponDaggerJab', layer: 'weapon-right', impact: 0.32 },
        sword: { animation: 'avatarWeaponSwordCut', layer: 'weapon-right', impact: 0.52 },
        polearm: { animation: 'avatarWeaponPolearmThrust', layer: 'weapon-right', impact: 0.48 },
        blunt: { animation: 'avatarWeaponBluntSmash', layer: 'weapon-right', impact: 0.58 },
        axe: { animation: 'avatarWeaponAxeChop', layer: 'weapon-right', impact: 0.6 },
        sword_big: { animation: 'avatarWeaponGreatswordDrop', layer: 'weapon-right', impact: 0.66 },
        axe_big: { animation: 'avatarWeaponGreataxeDrop', layer: 'weapon-right', impact: 0.74 },
        staff: { animation: 'avatarWeaponStaffCast', layer: 'weapon-right', impact: 0.55 },
        wand: { animation: 'avatarWeaponWandFlick', layer: 'weapon-right', impact: 0.48 },
        gun: { animation: 'avatarWeaponGunRecoil', layer: 'weapon-right', impact: 0.46 },
        gun_big: { animation: 'avatarWeaponBigGunRecoil', layer: 'weapon-right', impact: 0.48 },
        shield: { animation: 'avatarWeaponShieldBash', layer: 'shield-left', impact: 0.5 }
      };
      const motions = {};
      for (const [weapon, definition] of Object.entries(definitions)) {
        const attack = combat.playCombatAvatarAttack(root, weapon, {
          direction: 'left', duration: 1000, bodyMotion: false
        });
        const target = layer(definition.layer);
        const animation = target.getAnimations().find((entry) => (
          entry.animationName === definition.animation
        ));
        animation.pause();
        animation.currentTime = 0;
        const start = matrixOf(target);
        animation.currentTime = definition.impact * 1000;
        const impact = matrixOf(target);
        motions[weapon] = {
          animation: getComputedStyle(target).animationName,
          dx: impact.x - start.x,
          dy: impact.y - start.y,
          angle: impact.angle
        };
        animation.play();
        await attack;
      }

      const bowAttack = combat.playCombatAvatarAttack(root, 'bow', {
        direction: 'left', duration: 1000, bodyMotion: false
      });
      const bowDrawHand = layer('hand-left');
      const bowDrawAnimation = bowDrawHand.getAnimations().find((animation) => (
        animation.animationName === 'avatarHandBowDraw'
      ));
      const bowImpactAnimation = document.getAnimations().find((animation) => (
        animation.animationName === 'avatarCombatArrowShot'
      ));
      bowDrawAnimation.pause();
      bowImpactAnimation.pause();
      bowDrawAnimation.currentTime = 0;
      const bowHandStart = matrixOf(bowDrawHand);
      bowDrawAnimation.currentTime = 480;
      const bowHandDrawn = matrixOf(bowDrawHand);
      bowImpactAnimation.currentTime = 660;
      const bowImpactOpacity = Number(getComputedStyle(root, '::after').opacity);
      bowDrawAnimation.play();
      bowImpactAnimation.play();
      await bowAttack;
      root.remove();
      return {
        motions,
        bow: {
          drawDx: bowHandDrawn.x - bowHandStart.x,
          impactOpacity: bowImpactOpacity
        }
      };
    });

    expect(audit.motions.unarmed.dx).toBeLessThanOrEqual(-10);
    expect(Math.abs(audit.motions.unarmed.angle)).toBeLessThanOrEqual(15);
    expect(audit.motions.dagger.dx).toBeLessThanOrEqual(-10);
    expect(Math.abs(audit.motions.dagger.angle)).toBeGreaterThanOrEqual(75);
    expect(Math.abs(audit.motions.dagger.angle)).toBeLessThanOrEqual(100);
    expect(Math.abs(audit.motions.sword.angle)).toBeGreaterThanOrEqual(75);
    expect(Math.abs(audit.motions.sword.angle)).toBeLessThanOrEqual(110);
    expect(audit.motions.polearm.dx).toBeLessThanOrEqual(-25);
    expect(Math.abs(audit.motions.polearm.angle)).toBeGreaterThanOrEqual(75);
    expect(Math.abs(audit.motions.polearm.angle)).toBeLessThanOrEqual(100);
    expect(audit.motions.blunt.dy).toBeGreaterThanOrEqual(5);
    expect(Math.abs(audit.motions.blunt.angle)).toBeGreaterThanOrEqual(50);
    expect(audit.motions.axe.dy).toBeGreaterThanOrEqual(6);
    expect(Math.abs(audit.motions.axe.angle)).toBeGreaterThanOrEqual(60);
    expect(audit.motions.sword_big.dy).toBeGreaterThanOrEqual(8);
    expect(Math.abs(audit.motions.sword_big.angle)).toBeGreaterThanOrEqual(70);
    expect(audit.motions.axe_big.dy).toBeGreaterThanOrEqual(10);
    expect(Math.abs(audit.motions.axe_big.angle)).toBeGreaterThanOrEqual(75);
    expect(audit.motions.staff.dy).toBeLessThanOrEqual(-10);
    expect(Math.abs(audit.motions.staff.angle)).toBeLessThanOrEqual(25);
    expect(audit.motions.wand.dy).toBeLessThanOrEqual(-1.8);
    expect(Math.abs(audit.motions.wand.angle)).toBeLessThanOrEqual(25);
    expect(audit.motions.gun.dx).toBeGreaterThanOrEqual(8);
    expect(Math.abs(audit.motions.gun.angle)).toBeLessThanOrEqual(6);
    expect(audit.motions.gun_big.dx).toBeGreaterThanOrEqual(20);
    expect(Math.abs(audit.motions.gun_big.angle)).toBeLessThanOrEqual(6);
    expect(audit.motions.shield.dx).toBeLessThanOrEqual(-20);
    expect(Math.abs(audit.motions.shield.angle)).toBeLessThanOrEqual(5);
    expect(audit.bow.drawDx).toBeGreaterThanOrEqual(8);
    expect(audit.bow.impactOpacity).toBeGreaterThanOrEqual(0.9);
  });

  test('keeps home and combat equipment offsets identical when a shield arrives as Offhand', async ({ page }) => {
    await page.goto('/melee-demo.html');

    const audit = await page.evaluate(async () => {
      const avatar = await import('/js/avatar.js');
      const combat = await import('/js/avatarCombat.js');
      const createRoot = (id, className) => {
        const root = document.createElement('div');
        root.id = id;
        root.className = className;
        root.innerHTML = avatar.buildAvatarLayerMarkup(id);
        document.body.appendChild(root);
        return root;
      };
      const avatarBase = {
        Race: 'human', AvatarColor: 'brown', SkinColorIndex: 1,
        FaceIndex: 1, HairStyleIndex: 1, HairColorIndex: 4,
        FacialHairStyleIndex: 0, level: 12
      };
      const equipment = { RightHand: 'sword_2', LeftHand: 'shield_1', Armor: 'metal_1' };
      const homeItems = {
        sword_2: { itemId: 'sword_2', customData: { Category: 'Weapon', WeaponType: 'sword', sprite_index: '2' } },
        shield_1: { itemId: 'shield_1', customData: { Category: 'Shield', WeaponType: 'shield', sprite_index: '1' } },
        metal_1: { itemId: 'metal_1', customData: { Category: 'Armor', sprite_index: '1' } }
      };
      const combatItems = {
        ...homeItems,
        shield_1: { itemId: 'shield_1', customData: { Category: 'Offhand', WeaponType: 'shield', sprite_index: '1' } }
      };
      const homeRoot = createRoot('equipment-home-baseline', 'avatar-container');
      const combatRoot = createRoot('equipment-combat-audit', 'avatar-combat-actor');
      avatar.renderAvatar(homeRoot.id, avatarBase, equipment, homeItems, false);
      combat.renderCombatAvatar(combatRoot, avatarBase, equipment, combatItems, { resetState: false });

      const layerNames = ['weapon-right', 'shield-left', 'armor'];
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const ready = [homeRoot, combatRoot].every((root) => layerNames.every((name) => (
          root.querySelector(`#${root.id}-layer-${name}`)?.dataset.loadState === 'ready'
        )));
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      const readLayers = (root) => Object.fromEntries(layerNames.map((name) => {
        const layer = root.querySelector(`#${root.id}-layer-${name}`);
        return [name, {
          baseTransform: layer?.dataset.baseTransform || '',
          backgroundImage: layer?.style.backgroundImage || '',
          backgroundPosition: layer?.style.backgroundPosition || '',
          backgroundSize: layer?.style.backgroundSize || '',
          left: layer?.style.left || '',
          top: layer?.style.top || ''
        }];
      }));
      const result = { home: readLayers(homeRoot), combat: readLayers(combatRoot) };
      avatar.stopAvatarBodyMotion(homeRoot);
      combat.resetCombatAvatarState(combatRoot, { resumeIdle: false });
      homeRoot.remove();
      combatRoot.remove();
      return result;
    });

    expect(audit.combat).toEqual(audit.home);
    expect(audit.combat['shield-left'].baseTransform).toBe('translateX(12px) translateY(18px)');
  });

  test('places the large gun at its lowered shared offset in home and combat avatars', async ({ page }) => {
    await page.goto('/melee-demo.html');

    const audit = await page.evaluate(async () => {
      const avatar = await import('/js/avatar.js');
      const combat = await import('/js/avatarCombat.js');
      const avatarBase = {
        Race: 'human', AvatarColor: 'brown', SkinColorIndex: 1,
        FaceIndex: 1, HairStyleIndex: 1, FacialHairStyleIndex: 0, level: 12
      };
      const equipment = { RightHand: 'gun_big_1' };
      const items = {
        gun_big_1: {
          itemId: 'gun_big_1',
          customData: { Category: 'Weapon', WeaponType: 'gun_big', sprite_index: '1' }
        }
      };
      const createRoot = (id, className) => {
        const root = document.createElement('div');
        root.id = id;
        root.className = className;
        root.innerHTML = avatar.buildAvatarLayerMarkup(id);
        document.body.appendChild(root);
        return root;
      };
      const homeRoot = createRoot('large-gun-home-offset', 'avatar-container');
      const combatRoot = createRoot('large-gun-combat-offset', 'avatar-combat-actor');
      avatar.renderAvatar(homeRoot.id, avatarBase, equipment, items, false);
      combat.renderCombatAvatar(combatRoot, avatarBase, equipment, items, { resetState: false });

      for (let attempt = 0; attempt < 80; attempt += 1) {
        const ready = [homeRoot, combatRoot].every((root) => (
          root.querySelector(`#${root.id}-layer-weapon-right`)?.dataset.loadState === 'ready'
        ));
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      const baseTransform = (root) => (
        root.querySelector(`#${root.id}-layer-weapon-right`)?.dataset.baseTransform || ''
      );
      const result = {
        home: baseTransform(homeRoot),
        combat: baseTransform(combatRoot)
      };
      avatar.stopAvatarBodyMotion(homeRoot);
      combat.resetCombatAvatarState(combatRoot, { resumeIdle: false });
      homeRoot.remove();
      combatRoot.remove();
      return result;
    });

    expect(audit.home).toBe('translateX(-52px) translateY(12px)');
    expect(audit.combat).toBe(audit.home);
  });

  test('honors reduced motion for JS-driven idle and attack animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/melee-demo.html');
    const audit = await page.evaluate(async () => {
      const combat = await import('/js/avatarCombat.js');
      const root = document.createElement('div');
      root.id = 'reduced-combat-avatar-test';
      root.className = 'avatar-combat-actor';
      root.dataset.avatarIdle = 'true';
      document.body.appendChild(root);
      combat.renderCombatAvatar(root, {
        Race: 'human', AvatarColor: 'brown', SkinColorIndex: 1,
        FaceIndex: 1, HairStyleIndex: 1, FacialHairStyleIndex: 0, level: 1
      });
      const attackResult = await combat.playCombatAvatarAttack(root, 'sword', { direction: 'left' });
      const result = {
        attackResult,
        bodyMotion: root.dataset.avatarBodyMotion || '',
        attacking: root.classList.contains('is-avatar-attacking')
      };
      combat.resetCombatAvatarState(root, { resumeIdle: false });
      root.remove();
      return result;
    });
    expect(audit).toEqual({ attackResult: true, bodyMotion: '', attacking: false });
  });
});
