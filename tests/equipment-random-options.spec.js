const { test, expect } = require('@playwright/test');
const {
  EQUIPMENT_RANDOM_OPTION_MAX_LEVEL,
  EQUIPMENT_RANDOM_OPTION_STATS,
  getEquipmentRandomOptions,
  rollEquipmentRandomOptions
} = require('../server/equipmentRandomOptions');
const { applyEquipmentEnhancementToCatalogData } = require('../server/equipmentEnhancement');
const { __test: exploration } = require('../server/exploration');
const { buildTarotKingdomCombatCharacter } = require('../server/routes/battleRoutes');

const legendarySword = { Category: 'Weapon', Power: 70 };
const commonArmor = { Category: 'Armor', Defense: 5 };

function findSeed(catalogData, predicate) {
  for (let index = 0; index < 500; index += 1) {
    const seed = `seed-${index}`;
    if (predicate(rollEquipmentRandomOptions(catalogData, seed))) return seed;
  }
  throw new Error('no seed matched');
}

test('a roll is the same for the same grant key, may have no option, and does not follow rarity', () => {
  const first = rollEquipmentRandomOptions(legendarySword, 'exploration-reward-a-0');
  expect(rollEquipmentRandomOptions(legendarySword, 'exploration-reward-a-0')).toEqual(first);

  const rolls = Array.from({ length: 400 }, (_, index) => rollEquipmentRandomOptions(commonArmor, `r-${index}`));
  const counts = new Set(rolls.map((roll) => roll.options.length));
  expect([...counts].sort()).toEqual([0, 1, 2, 3]);
  const sameSeedCounts = Array.from({ length: 50 }, (_, index) => [
    rollEquipmentRandomOptions(commonArmor, `same-${index}`).options.length,
    rollEquipmentRandomOptions(legendarySword, `same-${index}`).options.length
  ]);
  sameSeedCounts.forEach(([common, legendary]) => expect(legendary).toBe(common));

  rolls.flatMap((roll) => roll.options).forEach(({ stat, level }) => {
    expect(EQUIPMENT_RANDOM_OPTION_STATS[stat]).toBeTruthy();
    expect(level).toBeGreaterThanOrEqual(1);
    expect(level).toBeLessThanOrEqual(EQUIPMENT_RANDOM_OPTION_MAX_LEVEL);
  });
  const stats = new Set(rolls.flatMap((roll) => roll.options.map((option) => option.stat)));
  ['CriticalRate', 'MaxHp', 'FireDamage', 'WaterDamage', 'WindDamage', 'EarthDamage'].forEach((stat) => {
    expect(stats.has(stat)).toBe(true);
  });
  expect(rollEquipmentRandomOptions({ Category: 'Consumable' }, 'x')).toBeNull();
});

test('stored option levels add to the enhanced stats, and levels outside 1-9 or unknown stats are dropped', () => {
  const inventoryItem = {
    DisplayProperties: {
      equipmentEnhancement: { version: 1, bonus: 4 },
      equipmentRandomOptions: {
        version: 2,
        options: [
          { stat: 'Power', level: 5 },
          { stat: 'MaxHp', level: 9 },
          { stat: 'MaxHp', level: 1 },
          { stat: 'Gold', level: 9 },
          { stat: 'FireDamage', level: 30 }
        ]
      }
    }
  };
  const result = applyEquipmentEnhancementToCatalogData('sword', { Category: 'Weapon', Power: 20 }, inventoryItem);
  expect(result.catalogData.Power).toBe(29);
  expect(result.catalogData.MaxHp).toBe(45);
  expect(result.catalogData.FireDamage).toBe(27);
  expect(result.randomOptions.map(({ stat, level, label }) => [stat, level, label])).toEqual([
    ['Power', 5, '攻撃力'], ['MaxHp', 9, '最大HP'], ['FireDamage', 9, '火属性ダメージ']
  ]);
  expect(getEquipmentRandomOptions({})).toEqual([]);
});

test('an exploration drop grants a piece with options as its own stack and a plain piece as a plain grant', async () => {
  const withOptions = findSeed(legendarySword, (roll) => roll.options.length > 0);
  const withoutOptions = findSeed(legendarySword, (roll) => roll.options.length === 0);
  const catalogCache = { sword: { ItemId: 'sword', ...legendarySword }, potion: { ItemId: 'potion', Category: 'Consumable' } };
  const calls = [];
  const addEconomyItem = async (playFabId, itemId, amount, options) => calls.push({ itemId, amount, options });

  await exploration.grantExplorationRewardItem(addEconomyItem, catalogCache, 'p1', 'sword', 1, withOptions);
  await exploration.grantExplorationRewardItem(addEconomyItem, catalogCache, 'p1', 'sword', 1, withoutOptions);
  await exploration.grantExplorationRewardItem(addEconomyItem, catalogCache, 'p1', 'potion', 3, 'potion-key');
  const shown = exploration.rollExplorationRewardRandomOptions(catalogCache, 'sword', 1, withOptions);

  expect(calls[0].options.stackId).toMatch(/^ro-/);
  expect(calls[0].options.displayProperties.equipmentRandomOptions.options).toEqual(shown[0].options);
  expect(calls[1]).toEqual({ itemId: 'sword', amount: 1, options: { idempotencyId: withoutOptions } });
  expect(calls[2]).toEqual({ itemId: 'potion', amount: 3, options: { idempotencyId: 'potion-key' } });
});

test('the battle profile carries the critical rate, max HP and element damage of the options', () => {
  const character = buildTarotKingdomCombatCharacter({
    id: 'p1',
    stats: { MaxHP: 120, Level: 10 },
    equipmentStats: { CriticalRate: 7, MaxHp: 45, FireDamage: 27, EarthDamage: 6 },
    equipment: {}
  });
  expect(character.combat.maxHp).toBe(165);
  expect(character.combat.criticalRate).toBe(7);
  expect(character.combat.elementDamage).toEqual({ fire: 27, water: 0, wind: 0, earth: 6 });
});
