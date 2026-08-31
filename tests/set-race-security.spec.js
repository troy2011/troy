const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { requirePlayerEntityKeyForPlayFabId } = require('../server/playfab');

function readSetRaceRouteSource() {
  const serverPath = path.join(__dirname, '..', 'server.js');
  const source = fs.readFileSync(serverPath, 'utf8');
  const routeStart = source.indexOf("app.post('/api/set-race'");
  const routeEnd = source.indexOf('\n// サーバー起動', routeStart);

  expect(routeStart).toBeGreaterThanOrEqual(0);
  expect(routeEnd).toBeGreaterThan(routeStart);
  return source.slice(routeStart, routeEnd);
}

test('set-race uses only the server-resolved entity for privileged PlayFab writes', () => {
  const routeSource = readSetRaceRouteSource();

  expect(routeSource).not.toContain('req.body?.entityKey');
  expect(routeSource).not.toContain('req.body?.entityToken');
  expect(routeSource).not.toContain('clientEntityKey');
  expect(routeSource).not.toContain('fallbackEntity');
  expect(routeSource).toContain(
    'requirePlayerEntityKeyForPlayFabId(authenticatedPlayFabId)'
  );

  const groupMemberTargets = Array.from(
    routeSource.matchAll(/Members:\s*\[([^\]]+)\]/g),
    (match) => match[1].trim()
  );
  expect(groupMemberTargets.length).toBeGreaterThan(0);
  expect(new Set(groupMemberTargets)).toEqual(new Set(['playerEntity']));
  expect(routeSource).toContain(
    'provisionStarterAssets({ playFabId: authenticatedPlayFabId, entityKey: playerEntity })'
  );
});

test('set-race resolves the entity before creating or updating nation state', () => {
  const routeSource = readSetRaceRouteSource();
  const resolveIndex = routeSource.indexOf('requirePlayerEntityKeyForPlayFabId(authenticatedPlayFabId)');
  const nationWriteIndex = routeSource.indexOf('nation.ensureNationGroupExists');

  expect(resolveIndex).toBeGreaterThanOrEqual(0);
  expect(nationWriteIndex).toBeGreaterThan(resolveIndex);
  expect(routeSource).toContain("error: 'PlayerEntityUnavailable'");
  expect(routeSource).toContain('retryable: true');
});

test('the server entity resolver retries transient failure without trusting client state', async () => {
  let attempts = 0;
  await expect(requirePlayerEntityKeyForPlayFabId('PLAYER_A', {
    maxAttempts: 2,
    retryDelayMs: 0,
    resolveEntityKey: async () => {
      attempts += 1;
      if (attempts === 1) return null;
      return { Id: 'entity-a', Type: 'title_player_account' };
    }
  })).resolves.toEqual({
    Id: 'entity-a',
    Type: 'title_player_account'
  });
  expect(attempts).toBe(2);
});

test('the server entity resolver rejects missing and non-player entities', async () => {
  await expect(requirePlayerEntityKeyForPlayFabId('PLAYER_A', {
    maxAttempts: 1,
    retryDelayMs: 0,
    resolveEntityKey: async () => null
  })).rejects.toThrow('EntityKeyNotFound');

  await expect(requirePlayerEntityKeyForPlayFabId('PLAYER_A', {
    maxAttempts: 1,
    retryDelayMs: 0,
    resolveEntityKey: async () => ({ Id: 'group-a', Type: 'group' })
  })).rejects.toThrow('EntityKeyNotFound');
});
