// Synthetic user only. This file must never be imported from public/ or server/.
const homeReady = {
  name: 'home-ready',
  initial: 'Existing human/fire player; no guild, ship or ongoing exploration',
  operation: 'Open / and let the real LIFF client complete fixture authentication',
  expected: 'Matching Firebase/PlayFab fixture identity and visible home; no browser/API errors',
  apiExpectations: ['POST /api/login-playfab: typed identity/token', 'POST /api/player-bootstrap: typed self profile'],
  responses: {
    '/api/get-troy-status': { isOpen: false, members: [], nation: 'fire' },
    '/api/get-global-chat': { messages: [] },
    '/api/tarot-deck-get': { ok: true, tarotDeck: [], guardian: null, tarotRole: null, presets: [null, null, null] },
    '/api/tarot-battle-skills': { cards: [] },
    '/api/exploration/status': { success: true, exploration: null },
    '/api/tarot-kingdom/pet-state': { success: true, currentPet: null },
    '/api/get-player-display-name': { displayName: 'AI Fixture' },
    '/api/get-line-friend-bonus-status': { success: true, isFriend: true, claimed: true },
    '/api/get-stats': { stats: { Level: 1, HP: 100, MaxHP: 100, MP: 50, MaxMP: 50 } },
    '/api/get-inventory': { inventory: [], points: 250, virtualCurrency: { PS: 250 } },
    '/api/get-equipment': { equipment: {} },
    '/api/player-ship/status': { success: true, ship: null }
  }
};

async function applyHomeScenario(page, { brokenBootstrap = false } = {}) {
  // Unlike the older shared harness, start signed out so home cannot use a
  // pre-existing fixture session before signInWithCustomToken has completed.
  await page.route('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `
      const auth = { currentUser: null };
      const callbacks = new Set();
      export function getAuth() { return auth; }
      export function onAuthStateChanged(_auth, callback) {
        callbacks.add(callback);
        queueMicrotask(() => { if (callbacks.has(callback)) callback(auth.currentUser); });
        return () => callbacks.delete(callback);
      }
      export async function signInWithCustomToken(_auth, token) {
        if (token !== 'playwright-firebase-custom-token') throw new Error('Invalid fixture token');
        auth.currentUser = { uid: 'PF_PLAYWRIGHT', getIdToken: async () => 'playwright-firebase-id-token' };
        queueMicrotask(() => { for (const callback of callbacks) callback(auth.currentUser); });
        return { user: auth.currentUser };
      }
      export async function signOut() {
        auth.currentUser = null;
        for (const callback of callbacks) callback(null);
      }
    `
  }));
  for (const [endpoint, body] of Object.entries(homeReady.responses)) {
    await page.route(`**${endpoint}`, (route) => route.fulfill({ status: 200, json: body }));
  }
  if (brokenBootstrap) {
    await page.route('**/api/player-bootstrap', (route) => route.fulfill({
      status: 503, json: { error: 'FixtureBootstrapUnavailable' }
    }));
  }
}

module.exports = { homeReady, applyHomeScenario };
