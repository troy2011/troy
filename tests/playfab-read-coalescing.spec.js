const { test, expect } = require('@playwright/test');
const { bootstrapMainApp } = require('./helpers/main-app-harness');

function jsonResponse(route, body) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body)
  });
}

test('shared PlayFab read clients coalesce concurrent inventory, equipment, stats, and guild-chat requests', async ({ page }) => {
  let inventoryRequests = 0;
  let equipmentRequests = 0;
  let statsRequests = 0;
  let guildChatRequests = 0;

  await page.route('**/api/get-inventory', async (route) => {
    inventoryRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 35));
    await jsonResponse(route, { inventory: [], virtualCurrency: { PS: 42 }, contribution: 0 });
  });
  await page.route('**/api/get-equipment', async (route) => {
    equipmentRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 35));
    await jsonResponse(route, { equipment: {} });
  });
  await page.route('**/api/get-stats', async (route) => {
    statsRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 35));
    await jsonResponse(route, { stats: {} });
  });
  await page.route('**/api/get-guild-chat', async (route) => {
    guildChatRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 35));
    await jsonResponse(route, { messages: [] });
  });
  await page.route('**/api/send-guild-chat', async (route) => {
    await jsonResponse(route, { success: true, message: { message: 'テスト' } });
  });

  await bootstrapMainApp(page);
  await page.waitForTimeout(120);
  inventoryRequests = 0;
  equipmentRequests = 0;
  statsRequests = 0;
  guildChatRequests = 0;

  await page.evaluate(async () => {
    const client = await import('/js/playfabClient.js?read-coalescing-client-v1');
    const alternateClient = await import('/js/playfabClient.js?read-coalescing-client-v2');
    await Promise.all([
      client.getInventory('PF_READ', { isSilent: true }),
      alternateClient.getInventory('PF_READ', { isSilent: true }),
      client.getPoints('PF_READ', { isSilent: true }),
      client.getEquipment('PF_READ', { isSilent: true }),
      alternateClient.getEquipment('PF_READ', { isSilent: true }),
      client.getPlayerStats('PF_READ', { isSilent: true }),
      alternateClient.getPlayerStats('PF_READ', { isSilent: true }),
      client.getGuildChat('PF_READ', 'guild-read', { isSilent: true }),
      alternateClient.getGuildChat('PF_READ', 'guild-read', { isSilent: true })
    ]);
    await client.getGuildChat('PF_READ', 'guild-read', { isSilent: true });
    await client.sendGuildChat('PF_READ', 'guild-read', 'テスト', { isSilent: true });
    await client.getGuildChat('PF_READ', 'guild-read', { isSilent: true });
  });

  expect(inventoryRequests).toBe(1);
  expect(equipmentRequests).toBe(1);
  expect(statsRequests).toBe(1);
  expect(guildChatRequests).toBe(2);
});

test('inventory force refreshes queue one follow-up and card levels share a single request', async ({ page }) => {
  let inventoryRequests = 0;
  let equipmentRequests = 0;
  let deckRequests = 0;
  let cardLevelRequests = 0;

  await page.route('**/api/get-inventory', async (route) => {
    inventoryRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 35));
    await jsonResponse(route, { inventory: [], virtualCurrency: { PS: 42 }, contribution: 0 });
  });
  await page.route('**/api/get-equipment', async (route) => {
    equipmentRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 35));
    await jsonResponse(route, { equipment: {} });
  });
  await page.route('**/api/tarot-deck-get', async (route) => {
    deckRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 35));
    await jsonResponse(route, { ok: true, tarotDeck: [], tarotRole: null });
  });
  await page.route('**/api/cards', async (route) => {
    cardLevelRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 35));
    await jsonResponse(route, { cards: [] });
  });

  await bootstrapMainApp(page);
  await page.waitForTimeout(120);
  inventoryRequests = 0;
  equipmentRequests = 0;
  deckRequests = 0;
  cardLevelRequests = 0;

  await page.evaluate(async () => {
    const inventory = await import('/js/inventory.js?read-coalescing-inventory-v1');
    const first = inventory.getInventory('PF_READ', { force: true });
    await Promise.resolve();
    await Promise.all([
      first,
      inventory.getInventory('PF_READ', { force: true }),
      inventory.getInventory('PF_READ', { force: true })
    ]);
    inventory.switchInventoryGroup('Tarot');
    inventory.switchInventoryGroup('Tarot');
    inventory.switchInventoryGroup('Tarot');
    await new Promise((resolve) => setTimeout(resolve, 80));
  });

  expect(inventoryRequests).toBe(2);
  expect(equipmentRequests).toBe(2);
  expect(deckRequests).toBe(2);
  expect(cardLevelRequests).toBe(1);
});
