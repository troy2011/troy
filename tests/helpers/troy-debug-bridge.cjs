const AI_ORIGIN = 'http://127.0.0.1:4187';

function assertAiTestEnvironment(origin, environment = process.env) {
  if (!['test', 'development'].includes(environment.NODE_ENV)
      || environment.TROY_AI_TEST !== '1' || origin !== AI_ORIGIN) {
    throw new Error('Read-only bridge requires the isolated AI fixture runner.');
  }
}

async function installTroyDebugBridge(page, origin, readNetwork) {
  assertAiTestEnvironment(origin);
  await page.exposeFunction('__troyReadSafeNetwork', readNetwork);
  await page.addInitScript(({ allowedOrigin }) => {
    if (location.origin !== allowedOrigin || window.top !== window) return;
    const freeze = (value) => {
      if (value && typeof value === 'object') {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
      }
      return value;
    };
    const visible = (id) => {
      const element = document.getElementById(id);
      return Boolean(element && element.getClientRects().length
        && getComputedStyle(element).visibility !== 'hidden');
    };
    const getAuthState = () => freeze({
      // Observations, NOT proof that a real LINE/PlayFab server accepted credentials.
      mode: 'fixture',
      liffProfileObserved: Boolean(window.myLineProfile),
      playFabIdentityObserved: Boolean(window.myPlayFabId),
      firebaseUserObserved: Boolean(window.__firebaseAuth?.currentUser),
      uidMatches: Boolean(window.myPlayFabId && window.__firebaseAuth?.currentUser?.uid
        === window.myPlayFabId && window.__tkUid === window.myPlayFabId)
    });
    const getGameState = () => freeze({
      mode: document.body?.dataset.currentTab === 'home' ? 'home' : 'unobserved',
      phaserScene: null,
      progress: null,
      inventoryCount: null,
      firestoreListeners: null,
      rtdbListeners: null
    });
    const getState = async () => {
      const screen = document.body?.dataset.currentTab;
      const auth = getAuthState();
      const homeVisible = visible('tabContentHome');
      const loading = visible('loadingSpinner');
      const pointsText = document.getElementById('currentPoints')?.textContent?.trim();
      const network = await window.__troyReadSafeNetwork();
      const authReady = auth.uidMatches && ['/api/login-playfab', '/api/player-bootstrap'].every((endpoint) => (
        network.coreApis.some((request) => request.endpoint === endpoint && request.status === 200
          && request.contract === 'valid' && !request.requestContract.startsWith('invalid'))
      ));
      return freeze({
        schemaVersion: 1,
        // Do not copy arbitrary DOM text, user IDs, profiles, tokens or app objects.
        currentScreen: ['home', 'map', 'troy', 'inventory', 'nation'].includes(screen) ? screen : 'unobserved',
        auth,
        authReady,
        appReady: authReady && homeVisible && visible('appWrapper')
          && !visible('bootSplash') && !document.body.classList.contains('app-booting'),
        homeVisible,
        loading,
        displayedGold: /^\d{1,12}$/.test(pointsText || '') ? Number(pointsText) : null,
        goldSource: 'DOM display, not Economy V2 authority',
        game: getGameState()
      });
    };
    Object.defineProperty(window, '__TROY_DEBUG__', {
      value: freeze({
        getState, getAuthState, getGameState,
        getNetworkSummary: async () => freeze(await window.__troyReadSafeNetwork())
      }),
      writable: false,
      configurable: false
    });
  }, { allowedOrigin: origin });
}

module.exports = { AI_ORIGIN, assertAiTestEnvironment, installTroyDebugBridge };
