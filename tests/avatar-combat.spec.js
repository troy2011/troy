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
        'dagger', 'wand', 'gun', 'shield', 'sword', 'polearm', 'staff',
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
      bigGunActorAnimation.pause();
      bigGunActorAnimation.currentTime = 180 * 0.47;
      const bigGunBraceX = new DOMMatrix(getComputedStyle(root).transform).m41;
      bigGunActorAnimation.currentTime = 180 * 0.5;
      const bigGunRecoilX = new DOMMatrix(getComputedStyle(root).transform).m41;
      bigGunActorAnimation.play();
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
        bigGunTravel: { braceX: bigGunBraceX, recoilX: bigGunRecoilX },
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
    expect(Object.keys(audit.profiles)).toHaveLength(13);
    expect(Object.values(audit.profiles).every((profile) => (
      profile.duration >= 300
      && profile.impactRatio >= 0.3
      && profile.impactRatio <= 0.7
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
        '@keyframes avatarWeaponGuard'
      ];
      return Object.fromEntries(obsoleteTokens.map((token) => [token, {
        app: appCss.includes(token),
        demo: demoCss.includes(token)
      }]));
    });

    expect(Object.values(audit).every(({ app, demo }) => !app && !demo)).toBe(true);
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
