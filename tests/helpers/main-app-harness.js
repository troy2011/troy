const { expect } = require('@playwright/test');

const DEFAULT_PLAYER_INFO = {
  playFabId: 'PF_PLAYWRIGHT',
  race: 'human',
  nation: 'fire'
};

const DEFAULT_WORLD_MAP_LAYOUT = [
  'pentacles', 'empty', 'empty', 'empty', 'swords',
  'empty', 'empty', 'empty', 'empty', 'empty',
  'empty', 'empty', 'major_00', 'empty', 'empty',
  'empty', 'empty', 'empty', 'empty', 'empty',
  'cups', 'empty', 'empty', 'empty', 'wands'
];

const DEFAULT_OCCUPATION_MAP = {
  pentacles: 'earth',
  swords: 'wind',
  cups: 'water',
  wands: 'fire',
  major_00: 'neutral'
};

const MAP_ID_BY_NATION = {
  fire: 'wands',
  water: 'cups',
  wind: 'swords',
  earth: 'pentacles',
  neutral: 'joker'
};

const LIFF_MOCK_SCRIPT = `
window.liff = {
  init: async () => {},
  isLoggedIn: () => true,
  login: () => {},
  getProfile: async () => ({
    userId: 'Uplaywright',
    displayName: 'Playwright Tester',
    pictureUrl: 'https://example.com/playwright.png'
  }),
  getAccessToken: () => 'playwright-access-token'
};
`;

const PLAYFAB_MOCK_SCRIPT = `
window.PlayFab = window.PlayFab || {
  settings: {},
  ClientApi: {},
  _internalSettings: {}
};
window.PlayFab.ClientApi.LoginWithCustomID = (_request, callback) => {
  callback({
    data: {
      PlayFabId: 'PF_PLAYWRIGHT',
      SessionTicket: 'playwright-session-ticket',
      EntityToken: {
        EntityToken: 'playwright-entity-token',
        Entity: { Id: 'PF_PLAYWRIGHT', Type: 'title_player_account' }
      }
    }
  }, null);
};
window.PlayFab.ClientApi.GetUserReadOnlyData = (_request, callback) => {
  callback({
    data: {
      Data: {
        Race: { Value: 'human' },
        Nation: { Value: 'fire' },
        AvatarColor: { Value: 'red' },
        SkinColorIndex: { Value: '1' },
        FaceIndex: { Value: '1' },
        HairStyleIndex: { Value: '1' },
        HairColorIndex: { Value: '1' },
        FacialHairStyleIndex: { Value: '0' }
      }
    }
  }, null);
};
window.PlayFabClientSDK = window.PlayFab;
window.PlayFabGroups = window.PlayFabGroups || {};
window.PlayFabEconomy = window.PlayFabEconomy || {};
`;

const QRIOUS_MOCK_SCRIPT = `
window.QRious = class QRious {
  constructor(options = {}) {
    this.options = { ...options };
    this.element = options.element || null;
    this.value = options.value || '';
    this.size = options.size || 150;
    if (this.element && typeof this.element.getContext === 'function') {
      this.element.width = this.size;
      this.element.height = this.size;
      const ctx = this.element.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, this.size, this.size);
      }
    }
  }
  set(options = {}) {
    Object.assign(this.options, options);
  }
};
`;

const FIREBASE_APP_MOCK_MODULE = `
let currentApp = null;

export function initializeApp(options = {}) {
  currentApp = currentApp || { options, name: '[DEFAULT]', __mock: true };
  return currentApp;
}

export function getApp() {
  return currentApp || initializeApp({});
}

export function getApps() {
  return currentApp ? [currentApp] : [];
}
`;

const FIREBASE_FIRESTORE_MOCK_MODULE = `
const emptyQuerySnapshot = () => ({
  empty: true,
  size: 0,
  docs: [],
  forEach() {},
  docChanges: () => []
});

const emptyDocSnapshot = (target) => ({
  id: target?.id || '',
  ref: target || null,
  exists: () => false,
  data: () => undefined
});

export function getFirestore() { return { __mock: true }; }
export function collection(_db, ...segments) { return { type: 'collection', path: segments.join('/') }; }
export function doc(_db, ...segments) {
  const path = segments.join('/');
  return { type: 'doc', path, id: segments[segments.length - 1] || '' };
}
export function query(target, ...constraints) { return { ...target, constraints }; }
export function where(field, op, value) { return { type: 'where', field, op, value }; }
export function orderBy(field, direction) { return { type: 'orderBy', field, direction }; }
export function limit(value) { return { type: 'limit', value }; }
export function startAt(value) { return { type: 'startAt', value }; }
export function endAt(value) { return { type: 'endAt', value }; }
export function serverTimestamp() { return Date.now(); }
export function getDocs() { return Promise.resolve(emptyQuerySnapshot()); }
export function getDoc(target) { return Promise.resolve(emptyDocSnapshot(target)); }
export function setDoc() { return Promise.resolve(); }
export function updateDoc() { return Promise.resolve(); }
export function addDoc() { return Promise.resolve({ id: 'pw-firestore-doc' }); }
export function onSnapshot(_target, next, error) {
  queueMicrotask(() => {
    try { next(emptyQuerySnapshot()); } catch (snapshotError) { error?.(snapshotError); }
  });
  return () => {};
}
`;

const FIREBASE_AUTH_MOCK_MODULE = `
let currentCallback = null;

export function getAuth() {
  return { __mock: true };
}

export function onAuthStateChanged(_auth, callback) {
  currentCallback = callback;
  queueMicrotask(() => callback({ uid: 'PF_PLAYWRIGHT' }));
  return () => {
    if (currentCallback === callback) currentCallback = null;
  };
}

export function signInWithCustomToken() {
  queueMicrotask(() => {
    if (typeof currentCallback === 'function') currentCallback({ uid: 'PF_PLAYWRIGHT' });
  });
  return Promise.resolve({ user: { uid: 'PF_PLAYWRIGHT' } });
}
`;

const FIREBASE_DATABASE_MOCK_MODULE = `
const store = globalThis.__pwFirebaseDbStore = globalThis.__pwFirebaseDbStore || {
  values: new Map(),
  listeners: new Map()
};

const normalizePath = (target) => {
  if (typeof target === 'string') return target;
  return String(target?.path || '');
};

const makeSnapshot = (path) => ({
  key: String(path || '').split('/').pop() || null,
  val: () => store.values.has(path) ? store.values.get(path) : null,
  exists: () => store.values.has(path)
});

const notify = (path) => {
  const listeners = store.listeners.get(path) || [];
  const snapshot = makeSnapshot(path);
  listeners.slice().forEach((listener) => {
    try {
      listener(snapshot);
    } catch (error) {
      console.error('[pw firebase db mock] listener failed', error);
    }
  });
};

globalThis.__pwFirebaseDbApi = globalThis.__pwFirebaseDbApi || {
  setValue(path, value) {
    const key = String(path || '');
    store.values.set(key, value);
    notify(key);
  },
  getValue(path) {
    return store.values.get(String(path || ''));
  },
  clear() {
    store.values.clear();
    store.listeners.clear();
  }
};

globalThis.__pwFirebaseDbReady = true;

export function getDatabase() {
  return { __mock: true };
}

export function ref(_db, path) {
  return { path: String(path || '') };
}

export function set(target, value) {
  globalThis.__pwFirebaseDbApi.setValue(normalizePath(target), value);
  return Promise.resolve();
}

export function update(target, values = {}) {
  const rawBase = normalizePath(target);
  const base = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase;
  const changedPaths = [];
  Object.entries(values || {}).forEach(([relativePath, value]) => {
    let child = String(relativePath || '');
    while (child.startsWith('/')) child = child.slice(1);
    const childPath = [base, child].filter(Boolean).join('/');
    if (value == null) store.values.delete(childPath);
    else store.values.set(childPath, value);
    changedPaths.push(childPath);
  });
  changedPaths.forEach((childPath) => {
    notify(childPath);
  });
  notify(base);
  return Promise.resolve();
}

export function get(target) {
  const path = normalizePath(target);
  return Promise.resolve(makeSnapshot(path));
}

export function runTransaction(target, updater) {
  const path = normalizePath(target);
  const current = store.values.has(path) ? store.values.get(path) : null;
  const next = updater(current);
  if (next === undefined) {
    return Promise.resolve({ committed: false, snapshot: makeSnapshot(path) });
  }
  store.values.set(path, next);
  notify(path);
  return Promise.resolve({ committed: true, snapshot: makeSnapshot(path) });
}

export function remove(target) {
  const path = normalizePath(target);
  store.values.delete(path);
  notify(path);
  return Promise.resolve();
}

export function push(target) {
  const base = normalizePath(target);
  const key = 'push_' + Math.random().toString(36).slice(2, 10);
  return { path: base ? base + '/' + key : key, key };
}

export function onValue(target, callback) {
  const path = normalizePath(target);
  const listeners = store.listeners.get(path) || [];
  listeners.push(callback);
  store.listeners.set(path, listeners);
  queueMicrotask(() => callback(makeSnapshot(path)));
  return () => {
    const current = store.listeners.get(path) || [];
    store.listeners.set(path, current.filter((listener) => listener !== callback));
  };
}

export function onChildAdded() {
  return () => {};
}

export function onDisconnect() {
  return {
    set: async () => {},
    remove: async () => {},
    cancel: async () => {}
  };
}

export function query(target, ...constraints) {
  return { path: normalizePath(target), constraints };
}

export function orderByChild(key) {
  return { type: 'orderByChild', key };
}

export function equalTo(value) {
  return { type: 'equalTo', value };
}

export function off() {}

export function serverTimestamp() {
  return Date.now();
}
`;

  const GAME_STUB_MODULE = `
export const launchGame = (containerId, playerInfo = null) => {
  const container = document.getElementById(containerId);
  if (!container) return null;
  window.__launchGameCalls = window.__launchGameCalls || [];
  window.__launchGameCalls.push({ containerId, playerInfo });
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 640;
  canvas.style.width = '1000px';
  canvas.style.height = '640px';
  container.appendChild(canvas);
  const root = document.createElement('div');
  root.id = 'playwright-map-scene';
  root.dataset.mapId = String(playerInfo?.mapId || '');
  root.textContent = 'playwright-map-scene';
  container.appendChild(root);
  const sceneState = { active: true, sleeping: false, paused: false };
  const worldMapScene = {
    playerInfo,
    playerShip: { x: 160, y: 160 },
    otherShips: new Map(),
    shipCollisionRadius: 48,
    boardingCooldownMs: 0,
    lastBoardingAt: 0,
    islandObjects: new Map([['stub-island', {}]]),
    setMapReady(ready) {
      window.__mapReadyCalls = window.__mapReadyCalls || [];
      window.__mapReadyCalls.push(Boolean(ready));
      document.getElementById('tabContentMap')?.classList.toggle('map-ready', Boolean(ready));
    },
    setNavigationTarget(targetId) {
      window.__navigationTarget = targetId;
      return true;
    },
    getIslandAutoAttackConfig() {
      return { label: '沿岸砲台' };
    },
    getIslandAttackCooldownRemaining() {
      return 0;
    },
    hideIslandCommandMenu() {
      document.getElementById('islandCommandPanel')?.classList.remove('active');
    },
    hideShipCommandMenu() {
      document.getElementById('islandCommandPanel')?.classList.remove('active');
    },
    async showIslandCommandMenu(islandData) {
      const panel = document.getElementById('islandCommandPanel');
      const title = document.getElementById('islandCommandTitle');
      const status = document.getElementById('islandCommandStatus');
      const action = document.getElementById('islandCommandAction');
      const tarot = document.getElementById('islandCommandTarot');
      const attack = document.getElementById('islandCommandAttack');
      if (!panel || !title || !action || !attack) return;
      title.textContent = islandData?.name || '';
      if (status) {
        status.style.display = 'none';
        status.textContent = '';
      }
      action.textContent = '施設メニューを開く';
      action.className = 'island-command-btn info';
      action.onclick = () => this.openBuildingMenuForIsland?.(islandData);
      if (tarot) {
        tarot.textContent = 'タロットポーカー';
        tarot.style.display = 'block';
        tarot.onclick = () => {
          this.hideIslandCommandMenu();
          if (typeof window.showTab === 'function') window.showTab('tarot');
        };
      }
      attack.textContent = '攻撃準備';
      attack.style.display = 'block';
      attack.onclick = () => this.triggerIslandAutoAttack?.(islandData, this.getIslandAutoAttackConfig(islandData));
      panel.classList.add('active');
    },
    updateShipCombatResourceHud() {
      const status = document.getElementById('shipCombatResourceStatus');
      if (!status) return;
      const storage = this.shipCombatResourceStorage || {};
      const rg = Math.max(0, Math.trunc(Number(storage.cargoResources?.RG || 0)));
      const used = Math.max(0, Math.trunc(Number(storage.cargoUsed || 0)));
      const capacity = Math.max(0, Math.trunc(Number(storage.cargoCapacity || 0)));
      status.textContent = '海戦資源 ' + '🪨' + rg + ' 船倉 ' + used + '/' + capacity;
    },
    updateShipActionUi() {
      const button = document.getElementById('shipActionButton');
      const status = document.getElementById('shipActionStatus');
      if (!button || !status) return;
      button.disabled = false;
      status.textContent = '追い風加速';
      button.onclick = () => this.triggerShipAction?.();
    },
    showShipCommandMenu(targetPlayFabId, displayName = '') {
      const panel = document.getElementById('islandCommandPanel');
      panel?.classList.remove('active');
      this.boardingTargetId = null;
    },
    scene: {
      isSleeping: () => sceneState.sleeping,
      wake: () => {
        sceneState.sleeping = false;
        sceneState.active = true;
      },
      isPaused: () => sceneState.paused,
      resume: () => {
        sceneState.paused = false;
        sceneState.active = true;
      },
      isActive: () => sceneState.active,
      start: () => {
        sceneState.active = true;
      }
    }
  };
  return {
    scale: {
      resize: (width, height) => {
        window.__lastGameResize = { width, height };
      }
    },
    scene: {
      getScene: (name) => (name === 'WorldMapScene' ? worldMapScene : null)
    },
    loop: {
      wake: () => {
        window.__gameLoopWakeCount = (window.__gameLoopWakeCount || 0) + 1;
      }
    },
    renderer: {
      snapshot: (callback) => {
        window.__snapshotCount = (window.__snapshotCount || 0) + 1;
        if (typeof callback === 'function') callback(null);
      }
    },
    destroy: () => {
      window.__destroyGameCount = (window.__destroyGameCount || 0) + 1;
      container.innerHTML = '';
      document.getElementById('tabContentMap')?.classList.remove('map-ready');
    }
  };
};
`;

function trackPageErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => {
    errors.push(error.message || String(error));
  });
  return errors;
}

async function expectNoPageErrors(errors) {
  expect(errors, errors.join('\n')).toEqual([]);
}

async function installBaseAppMocks(page, state, options = {}) {
  const layout = options.worldMapLayout || DEFAULT_WORLD_MAP_LAYOUT;
  const occupationMap = options.occupationMap || DEFAULT_OCCUPATION_MAP;

  await page.addInitScript(() => {
    window.API_BASE_URL = '';
    if (navigator.serviceWorker && typeof navigator.serviceWorker.register === 'function') {
      navigator.serviceWorker.register = async () => ({ scope: window.location.origin + '/' });
    }
  });
  if (Number.isInteger(options.fixedHour)) {
    await page.addInitScript((hour) => {
      const nativeGetHours = Date.prototype.getHours;
      Date.prototype.getHours = function patchedGetHours() {
        return hour;
      };
      Date.prototype.__nativeGetHours = nativeGetHours;
    }, options.fixedHour);
  }

  await page.route('https://static.line-scdn.net/liff/edge/2/sdk.js', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: LIFF_MOCK_SCRIPT
    });
  });

  await page.route('https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: QRIOUS_MOCK_SCRIPT
    });
  });

  await page.route('https://download.playfab.com/PlayFabClientApi.js', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: PLAYFAB_MOCK_SCRIPT
    });
  });

  await page.route('https://download.playfab.com/PlayFabGroupsApi.js', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: ''
    });
  });

  await page.route('https://download.playfab.com/PlayFabEconomyApi.js', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: ''
    });
  });

  await page.route('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: FIREBASE_APP_MOCK_MODULE
    });
  });
  if (options.mockFirebaseFirestore !== false) {
    await page.route('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript; charset=utf-8',
        body: FIREBASE_FIRESTORE_MOCK_MODULE
      });
    });
  }
  await page.route('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: FIREBASE_DATABASE_MOCK_MODULE
    });
  });
  await page.route('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: FIREBASE_AUTH_MOCK_MODULE
    });
  });

  if (options.mockGame !== false) {
    await page.route('**/Game.js', async (route) => {
      state.gameRouteHits = Number(state.gameRouteHits || 0) + 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript; charset=utf-8',
        body: GAME_STUB_MODULE
      });
    });
  }

  await page.route('**/api/login-playfab', async (route) => {
    state.loginPlayFabBody = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        playFabId: DEFAULT_PLAYER_INFO.playFabId,
        needsRaceSelection: false,
        firebaseToken: options.firebaseToken || ''
      })
    });
  });

  await page.route('**/api/get-building-meta', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({})
    });
  });

  await page.route('**/api/get-ship-catalog', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        ship_common_boat: {
          DisplayName: 'Common Boat',
          Domain: 'sea_surface',
          MaxHP: 100,
          Speed: 2,
          CargoCapacity: 10,
          CrewCapacity: 3,
          VisionRange: 4,
          PriceAmounts: [{ ItemId: 'ps', Amount: 100 }]
        }
      })
    });
  });

  await page.route('**/api/get-nation-king-page', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        announcement: {
          message: 'Map systems nominal'
        }
      })
    });
  });

  await page.route('**/api/tarot-kingdom/raid/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        success: true,
        raid: {
          active: false,
          nation: 'fire',
          currentHp: 0,
          maxHp: 0,
          attemptsUsed: 0,
          attemptsRemaining: 4,
          dailyAttemptLimit: 4,
          isKing: true,
          bosses: [
            {
              id: 'ismartal-vol2-monster-07',
              name: 'バルガン',
              preFormMonsterId: 'ismartal-vol3-monster-01',
              preFormMonsterName: 'グラヴァ',
              maxHp: 250000
            }
          ]
        }
      })
    });
  });

  await page.route('**/api/get-nation-announcements', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        announcements: []
      })
    });
  });

  await page.route('**/api/get-world-map-layout', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        placementOpen: true,
        layout
      })
    });
  });

  await page.route('**/api/get-map-occupation-map', async (route) => {
    state.lastOccupationRequest = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        map: occupationMap
      })
    });
  });

  await page.route('**/api/get-ship-resource-storage', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        activeShipId: null,
        cargoResources: { RR: 0, RG: 0, RY: 0, RB: 0, RT: 0, RS: 0 },
        cargoCapacity: 0,
        cargoUsed: 0
      })
    });
  });

  await page.route('**/api/get-guild-info', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        guildId: null,
        guildName: '',
        members: []
      })
    });
  });

  await page.route('**/api/get-map-occupation', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        occupationNation: 'fire'
      })
    });
  });

  await page.route('**/api/get-constructing-islands*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify([])
    });
  });
}

async function bootstrapMainApp(page, options = {}) {
  const state = {
    loginPlayFabBody: null,
    lastOccupationRequest: null,
    gameRouteHits: 0
  };
  await installBaseAppMocks(page, state, options);
  await page.goto(options.gotoUrl || '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const appWrapper = document.getElementById('appWrapper');
    if (!appWrapper) return false;
    return window.getComputedStyle(appWrapper).display !== 'none';
  }, null, { timeout: 20_000 });
  return state;
}

async function prepareMapPlayerContext(page, playerInfo = DEFAULT_PLAYER_INFO) {
  await page.evaluate((input) => {
    const defineDimension = (element, key, value) => {
      if (!element) return;
      try {
        Object.defineProperty(element, key, {
          configurable: true,
          get: () => value
        });
      } catch {
        // ignore if the browser does not allow overriding on this node
      }
    };
    window.myPlayFabId = input.playFabId;
    window.myAvatarBaseInfo = {
      Race: input.race,
      Nation: input.nation
    };
    const mapTab = document.getElementById('tabContentMap');
    if (mapTab) {
      mapTab.style.minHeight = '720px';
      mapTab.style.width = '100%';
    }
    const phaserContainer = document.getElementById('phaser-container');
    if (phaserContainer) {
      phaserContainer.style.display = 'block';
      phaserContainer.style.width = '1000px';
      phaserContainer.style.minHeight = '640px';
      phaserContainer.style.height = '640px';
      defineDimension(phaserContainer, 'clientWidth', 1000);
      defineDimension(phaserContainer, 'clientHeight', 640);
      try {
        phaserContainer.getBoundingClientRect = () => ({
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: 1000,
          bottom: 640,
          width: 1000,
          height: 640,
          toJSON: () => ({})
        });
      } catch {
        // ignore if overriding getBoundingClientRect fails
      }
    }
  }, playerInfo);
}

async function openMapTab(page, playerInfo = DEFAULT_PLAYER_INFO, options = {}) {
  await prepareMapPlayerContext(page, playerInfo);
  await page.evaluate(async ({ playerInfo: info, showOptions }) => {
    const ui = await import('/js/ui.js?v=20260604g');
    await ui.showTab('map', info, showOptions || {});
  }, { playerInfo, showOptions: options });
  await page.waitForTimeout(50);
  const launchState = await page.evaluate(() => ({
    stubLaunches: Array.isArray(window.__launchGameCalls) ? window.__launchGameCalls.length : 0,
    hasGameInstance: !!window.gameInstance,
    hasCanvas: !!document.querySelector('#phaser-container canvas')
  }));
  if (!(launchState.stubLaunches > 0 || launchState.hasGameInstance || launchState.hasCanvas)) {
    const explicitMapId = options.mapId
      || MAP_ID_BY_NATION[String(playerInfo.nation || '').toLowerCase()]
      || 'wands';
    const explicitMapLabel = options.mapLabel || explicitMapId;
    await page.evaluate(async ({ playerInfo: info, showOptions }) => {
      window.dispatchEvent(new Event('resize'));
      const ui = await import('/js/ui.js?v=20260604g');
      await ui.showTab('map', info, showOptions);
    }, {
      playerInfo,
      showOptions: {
        ...options,
        skipMapSelect: true,
        mapId: explicitMapId,
        mapLabel: explicitMapLabel
      }
    });
  }
  await page.waitForFunction(() => {
    const mapTab = document.getElementById('tabContentMap');
    if (!mapTab) return false;
    const stubLaunches = Array.isArray(window.__launchGameCalls) ? window.__launchGameCalls.length : 0;
    const hasRealMap = !!window.gameInstance || !!document.querySelector('#phaser-container canvas');
    if (stubLaunches > 0 && !hasRealMap) return true;
    return mapTab.classList.contains('map-ready') && hasRealMap;
  }, { timeout: 20_000 });
}

module.exports = {
  DEFAULT_PLAYER_INFO,
  bootstrapMainApp,
  openMapTab,
  prepareMapPlayerContext,
  trackPageErrors,
  expectNoPageErrors
};
