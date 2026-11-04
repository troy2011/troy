const { test, expect } = require('@playwright/test');
const {
  EQUIPMENT_RANDOM_OPTION_STATS,
  getEquipmentRandomOptions,
  rollEquipmentRandomOptions
} = require('../server/equipmentRandomOptions');
const { applyEquipmentEnhancementToCatalogData } = require('../server/equipmentEnhancement');
const { __test: exploration } = require('../server/exploration');

const legendarySword = { Category: 'Weapon', Power: 70 };
const commonArmor = { Category: 'Armor', Defense: 5 };
const accessory = { Category: 'Accessory', Power: 20, Agi: 2 };

test('a roll is the same for the same grant key and stays inside the rarity limits', () => {
  const first = rollEquipmentRandomOptions(legendarySword, 'exploration-reward-a-0');
  const again = rollEquipmentRandomOptions(legendarySword, 'exploration-reward-a-0');
  expect(again).toEqual(first);
  expect(first.rarity).toBe('legendary');
  expect(first.options).toHaveLength(3);
  expect(new Set(first.options.map((option) => option.stat)).size).toBe(3);
  first.options.forEach(({ stat, value }) => {
    expect(value).toBeGreaterThanOrEqual(1);
    expect(value).toBeLessThanOrEqual(EQUIPMENT_RANDOM_OPTION_STATS[stat].maxByRarity.legendary);
  });

  const commonCounts = new Set(Array.from({ length: 40 }, (_, index) => (
    rollEquipmentRandomOptions(commonArmor, `common-${index}`).options.length
  )));
  expect([...commonCounts].sort()).toEqual([0, 1]);
  expect(rollEquipmentRandomOptions(accessory, 'acc').options.length).toBeGreaterThanOrEqual(1);
  expect(rollEquipmentRandomOptions({ Category: 'Consumable' }, 'x')).toBeNull();
});

test('stored options add to the enhanced stats, and options a roll could not give are dropped', () => {
  const inventoryItem = {
    DisplayProperties: {
      equipmentEnhancement: { version: 1, bonus: 4 },
      equipmentRandomOptions: {
        version: 1,
        options: [
          { stat: 'Power', value: 3 },
          { stat: 'Agi', value: 2 },
          { stat: 'Agi', value: 5 },
          { stat: 'Gold', value: 999 },
          { stat: 'Defense', value: 500 }
        ]
      }
    }
  };
  const result = applyEquipmentEnhancementToCatalogData('sword', { Category: 'Weapon', Power: 20 }, inventoryItem);
  expect(result.enhancement.bonus).toBe(4);
  expect(result.catalogData.Power).toBe(27);
  expect(result.catalogData.Agi).toBe(2);
  expect(result.catalogData.Defense).toBe(10);
  expect(result.randomOptions.map(({ stat, value }) => [stat, value])).toEqual([
    ['Power', 3], ['Agi', 2], ['Defense', 10]
  ]);
  expect(getEquipmentRandomOptions({})).toEqual([]);
});

test('an exploration drop grants each piece as its own stack with the options its result shows', async () => {
  const catalogCache = { sword: { ItemId: 'sword', DisplayName: 'Sword', ...legendarySword }, potion: { ItemId: 'potion', Category: 'Consumable' } };
  const calls = [];
  const addEconomyItem = async (playFabId, itemId, amount, options) => {
    calls.push({ playFabId, itemId, amount, options });
  };

  await exploration.grantExplorationRewardItem(addEconomyItem, catalogCache, 'p1', 'sword', 2, 'exploration-reward-x-0');
  await exploration.grantExplorationRewardItem(addEconomyItem, catalogCache, 'p1', 'potion', 3, 'exploration-reward-x-1');
  const shown = exploration.rollExplorationRewardRandomOptions(catalogCache, 'sword', 2, 'exploration-reward-x-0');

  expect(calls).toHaveLength(3);
  const [firstSword, secondSword, potion] = calls;
  expect(firstSword.amount).toBe(1);
  expect(firstSword.options.idempotencyId).toBe('exploration-reward-x-0');
  expect(secondSword.options.idempotencyId).toBe('exploration-reward-x-0-unit-1');
  expect(firstSword.options.stackId).not.toBe(secondSword.options.stackId);
  expect(firstSword.options.displayProperties.equipmentRandomOptions.options).toEqual(shown[0].options);
  expect(secondSword.options.displayProperties.equipmentRandomOptions.options).toEqual(shown[1].options);
  expect(potion).toEqual({ playFabId: 'p1', itemId: 'potion', amount: 3, options: { idempotencyId: 'exploration-reward-x-1' } });
});
