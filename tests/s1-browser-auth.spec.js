const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { buildAuthHelpers } = require('../server/auth');
const {
  bootstrapMainApp,
  trackPageErrors,
  expectNoPageErrors
} = require('./helpers/main-app-harness');

function readPlayerBootstrapRouteSource() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const routeStart = source.indexOf("app.post('/api/player-bootstrap'");
  const routeEnd = source.indexOf("app.post('/api/get-app-invite-info'", routeStart);

  expect(routeStart).toBeGreaterThanOrEqual(0);
  expect(routeEnd).toBeGreaterThan(routeStart);
  return source.slice(routeStart, routeEnd);
}

function createJsonResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

test('player bootstrap binds the PlayFab read to the authenticated Firebase user', () => {
  const routeSource = readPlayerBootstrapRouteSource();
  const authIndex = routeSource.indexOf('requireAuthenticatedPlayFabId');
  const readIndex = routeSource.indexOf('PlayFabServer.GetUserReadOnlyData');

  expect(authIndex).toBeGreaterThanOrEqual(0);
  expect(readIndex).toBeGreaterThan(authIndex);
  expect(routeSource).toContain('PlayFabId: authenticatedPlayFabId');
  expect(routeSource).not.toContain('PlayFabId: requestedPlayFabId');
  expect(routeSource).not.toContain('lineUserId');
  expect(routeSource).not.toContain('SessionTicket');
  expect(routeSource).not.toContain('EntityToken');
});

test('Firebase auth boundary rejects missing tokens and cross-player bootstrap requests', async () => {
  const admin = {
    auth: () => ({
      verifyIdToken: async (token) => {
        expect(token).toBe('valid-token');
        return { uid: 'PF_PLAYWRIGHT' };
      }
    })
  };
  const { requireAuthenticatedPlayFabId } = buildAuthHelpers({ admin });

  const missingResponse = createJsonResponse();
  await expect(requireAuthenticatedPlayFabId({ headers: {} }, missingResponse, 'PF_PLAYWRIGHT'))
    .resolves.toBeNull();
  expect(missingResponse.statusCode).toBe(401);

  const mismatchResponse = createJsonResponse();
  await expect(requireAuthenticatedPlayFabId({
    headers: { authorization: 'Bearer valid-token' }
  }, mismatchResponse, 'PF_SOMEONE_ELSE')).resolves.toBeNull();
  expect(mismatchResponse.statusCode).toBe(403);

  const successResponse = createJsonResponse();
  await expect(requireAuthenticatedPlayFabId({
    headers: { authorization: 'Bearer valid-token' }
  }, successResponse, 'pf_playwright')).resolves.toBe('PF_PLAYWRIGHT');
});

test('existing player boots through the authenticated server API without a browser PlayFab session', async ({ page }) => {
  const errors = trackPageErrors(page);
  const playFabRequests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (/playfab/i.test(url.hostname) && !url.pathname.includes('/api/login-playfab')) {
      playFabRequests.push(request.url());
    }
  });

  const state = await bootstrapMainApp(page);

  expect(state.playerBootstrapBody).toEqual({ playFabId: 'PF_PLAYWRIGHT' });
  expect(state.playerBootstrapAuthorization).toBe('Bearer playwright-firebase-id-token');
  expect(playFabRequests).toEqual([]);
  await expect.poll(() => page.evaluate(() => window.myAvatarBaseInfo)).toMatchObject({
    Race: 'human',
    Nation: 'fire',
    HairStyleIndex: 1,
    FacialHairStyleIndex: 0
  });
  const browserCredentialState = await page.evaluate(() => ({
    hasPlayFabSdk: typeof window.PlayFab !== 'undefined',
    hasSessionTicket: typeof window.myPlayFabLoginInfo !== 'undefined',
    hasEntityToken: typeof window.myEntityToken !== 'undefined'
  }));
  expect(browserCredentialState).toEqual({
    hasPlayFabSdk: false,
    hasSessionTicket: false,
    hasEntityToken: false
  });
  await expectNoPageErrors(errors);
});

test('new player selects a race without sending browser entity credentials', async ({ page }) => {
  const errors = trackPageErrors(page);
  const state = await bootstrapMainApp(page, { needsRaceSelection: true });

  await expect.poll(() => state.setRaceBody).not.toBeNull();
  expect(state.setRaceBody).toMatchObject({
    playFabId: 'PF_PLAYWRIGHT',
    isKing: false
  });
  expect(state.setRaceBody).not.toHaveProperty('entityKey');
  expect(state.setRaceBody).not.toHaveProperty('entityToken');
  expect(state.setRaceAuthorization).toBe('Bearer playwright-firebase-id-token');
  await expectNoPageErrors(errors);
});

test('new player retries a transient server entity-resolution failure', async ({ page }) => {
  const errors = trackPageErrors(page);
  const state = await bootstrapMainApp(page, {
    needsRaceSelection: true,
    setRaceRetryableFailures: 1
  });

  await expect.poll(() => state.setRaceRequestCount).toBe(2);
  expect(state.setRaceBody).not.toHaveProperty('entityKey');
  expect(state.setRaceBody).not.toHaveProperty('entityToken');
  await expectNoPageErrors(errors);
});
