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
      root.remove();
      coloredRoot.remove();

      return {
        layers,
        hairColorPath,
        facialHairColorPath,
        dagger,
        heavy,
        alias,
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
        cancelCleared
      };
    });

    expect(audit.layers).toBe(9);
    expect(audit.hairColorPath).toContain('human_hair_blue.png');
    expect(audit.facialHairColorPath).toContain('human_facialhair_blue.png');
    expect(audit.dagger).toMatchObject({ weapon: 'dagger', duration: 290 });
    expect(audit.heavy).toMatchObject({
      weapon: 'axe_big',
      duration: 700,
      shake: { x: 7, y: 2, duration: 320 }
    });
    expect(audit.alias).toMatchObject({ weapon: 'gun_big', duration: 560 });
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
