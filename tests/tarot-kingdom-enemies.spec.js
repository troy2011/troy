const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

let enemyModulePromise;
let monsterManifestPromise;

function importSource(fileName) {
  const modulePath = path.join(__dirname, '..', 'public', 'js', fileName);
  const source = fs.readFileSync(modulePath, 'utf8');
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  return import(moduleUrl);
}

function loadEnemyModule() {
  if (!enemyModulePromise) enemyModulePromise = importSource('tarotKingdomEnemies.js');
  return enemyModulePromise;
}

function loadMonsterManifest() {
  if (!monsterManifestPromise) monsterManifestPromise = importSource('pixelMonstersManifest.js');
  return monsterManifestPromise;
}

test.describe('Tarot Kingdom enemy combat profiles', () => {
  test('all 50 monsters receive varied stats and large monsters remain the strongest in their volume', async () => {
    const enemies = await loadEnemyModule();
    const { PIXEL_MONSTERS_ROSTER } = await loadMonsterManifest();
    const profiles = PIXEL_MONSTERS_ROSTER.map((monster) => ({
      monster,
      profile: enemies.createTarotKingdomEnemyCombatProfile(monster, 0)
    }));

    expect(profiles).toHaveLength(50);
    profiles.forEach(({ profile }) => {
      expect(profile.maxHp).toBeGreaterThan(0);
      expect(profile.passDamage).toBeGreaterThan(0);
      expect(profile.areaDamage).toBeGreaterThan(0);
      expect(profile.defense).toBeGreaterThanOrEqual(0);
      expect(profile.speed).toBeGreaterThan(0);
    });
    expect(new Set(profiles.map(({ profile }) => profile.maxHp)).size).toBeGreaterThan(20);
    expect(new Set(profiles.map(({ profile }) => profile.passDamage)).size).toBeGreaterThan(10);
    expect(new Set(profiles.map(({ profile }) => profile.defense)).size).toBeGreaterThan(10);
    expect(new Set(profiles.map(({ profile }) => profile.speed)).size).toBeGreaterThan(10);

    const average = (entries, key) => entries.reduce((sum, entry) => sum + entry.profile[key], 0) / entries.length;
    const volumeAverages = [1, 2, 3].map((volume) => {
      const entries = profiles.filter(({ monster }) => monster.volume === volume && !monster.isBoss);
      return {
        hp: average(entries, 'maxHp'),
        pass: average(entries, 'passDamage'),
        defense: average(entries, 'defense')
      };
    });
    expect(volumeAverages[1].hp).toBeGreaterThan(volumeAverages[0].hp);
    expect(volumeAverages[2].hp).toBeGreaterThan(volumeAverages[1].hp);
    expect(volumeAverages[1].pass).toBeGreaterThan(volumeAverages[0].pass);
    expect(volumeAverages[2].pass).toBeGreaterThan(volumeAverages[1].pass);
    expect(volumeAverages[1].defense).toBeGreaterThan(volumeAverages[0].defense);
    expect(volumeAverages[2].defense).toBeGreaterThan(volumeAverages[1].defense);

    const bosses = profiles.filter(({ monster }) => monster.isBoss);
    expect(bosses.length).toBeGreaterThanOrEqual(3);
    bosses.forEach(({ monster, profile }) => {
      const peers = profiles.filter((entry) => entry.monster.volume === monster.volume && !entry.monster.isBoss);
      expect(profile.maxHp).toBeGreaterThan(average(peers, 'maxHp'));
      expect(profile.defense).toBeGreaterThan(average(peers, 'defense'));
    });
  });

  test('round growth, defense mitigation and speed-based accuracy are bounded', async () => {
    const enemies = await loadEnemyModule();
    const monster = { id: 'ismartal-vol2-monster-15', volume: 2, number: 15, isBoss: false };
    const first = enemies.createTarotKingdomEnemyCombatProfile(monster, 0);
    const fourth = enemies.createTarotKingdomEnemyCombatProfile(monster, 3);

    expect(fourth.maxHp - first.maxHp).toBe(240);
    expect(fourth.passDamage - first.passDamage).toBe(6);
    expect(fourth.areaDamage - first.areaDamage).toBe(6);
    expect(fourth.defense - first.defense).toBe(12);
    expect(fourth.speed - first.speed).toBe(6);
    expect(enemies.calculateTarotKingdomEnemyMitigatedDamage(100, 0)).toBe(100);
    expect(enemies.calculateTarotKingdomEnemyMitigatedDamage(100, 100)).toBe(50);
    expect(enemies.calculateTarotKingdomEnemyMitigatedDamage(1, 10000)).toBe(1);
    expect(enemies.calculateTarotKingdomEnemyMitigatedDamage(0, 10000)).toBe(0);

    expect(enemies.calculateTarotKingdomHitChance(20, 20)).toBe(0.9);
    expect(enemies.calculateTarotKingdomHitChance(200, 0)).toBe(0.98);
    expect(enemies.calculateTarotKingdomHitChance(0, 200)).toBe(0.66);
    expect(enemies.calculateTarotKingdomHitChance(20, 20, 0.45)).toBeCloseTo(0.45);
    expect(enemies.calculateTarotKingdomHitChance(0, 200, 0.7)).toBe(0.2);
    expect(enemies.getTarotKingdomEnemyAilmentChance({ chance: 0.4 }, 999)).toBe(0.4);
  });

  test('only combat-safe poison, burn, blind and attack-stop ailments are assigned', async () => {
    const enemies = await loadEnemyModule();
    const { PIXEL_MONSTERS_ROSTER } = await loadMonsterManifest();
    const ailments = PIXEL_MONSTERS_ROSTER
      .map((monster) => enemies.getTarotKingdomEnemyAilmentProfile(monster.id))
      .filter(Boolean);

    expect(ailments).toHaveLength(21);
    expect(new Set(ailments.map((ailment) => ailment.statusKey)))
      .toEqual(new Set(['poison', 'burn', 'blind', 'paralysis']));
    ailments.forEach((ailment) => {
      expect(['single', 'area', 'both']).toContain(ailment.scope);
      expect(ailment.chance).toBeGreaterThan(0);
      expect(ailment.chance).toBeLessThanOrEqual(0.5);
      expect(ailment.charges).toBeGreaterThan(0);
    });
  });

  test('fixed-stage enemies scale by threat instead of sprite volume', async () => {
    const enemies = await loadEnemyModule();
    const smallLate = { id: 'ismartal-vol3-monster-10', volume: 3, number: 10, isBoss: false };
    const largeLookingEarly = { id: 'ismartal-vol1-monster-07', volume: 1, number: 7, isBoss: false };
    const first = enemies.createTarotKingdomEnemyCombatProfile(largeLookingEarly, 0, {
      stageVersion: 1,
      stageNo: 1,
      roundNo: 1,
      threatLevel: 1,
      archetype: 'balanced'
    });
    const last = enemies.createTarotKingdomEnemyCombatProfile(smallLate, 3, {
      stageVersion: 1,
      stageNo: 11,
      roundNo: 4,
      threatLevel: 44,
      archetype: 'balanced'
    });

    expect(first).toMatchObject({
      version: 2,
      threatLevel: 1,
      maxHp: 237,
      passDamage: 11,
      areaDamage: 6,
      defense: 3,
      speed: 7
    });
    expect(last).toMatchObject({
      version: 2,
      threatLevel: 44,
      maxHp: 968,
      passDamage: 37,
      areaDamage: 22,
      defense: 31,
      speed: 22
    });
    expect(last.maxHp).toBeGreaterThan(first.maxHp);
    expect(last.passDamage).toBeGreaterThan(first.passDamage);
    expect(last.defense).toBeGreaterThan(first.defense);
    expect(last.ailment.chance).toBeLessThanOrEqual(0.14 + (44 * 0.007));
  });
});
