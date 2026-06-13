const { test, expect } = require('@playwright/test');

async function installDisplayMocks(page, options = {}) {
  const autoEntryEvent = options.autoEntryEvent !== false;
  const strictAudioActivation = !!options.strictAudioActivation;
  await page.addInitScript(({ autoEntryEvent: shouldEmitAutoEntry, strictAudioActivation: shouldRequireGesture }) => {
    if (shouldRequireGesture) {
      window.__displayVideoPlayStarted = false;
      HTMLMediaElement.prototype.play = function playMedia() {
        if (document.getElementById('audioGateStatus')?.textContent === '音声を準備しています...') {
          window.__displayVideoPlayStarted = true;
        }
        return Promise.resolve();
      };
    }

    class MockAudio {
      constructor(src) {
        this.src = src;
        this.volume = 1;
        this.currentTime = 0;
        this.preload = '';
        this.playsInline = false;
        this.unlocked = false;
      }

      async play() {
        if (shouldRequireGesture && !this.unlocked && window.__displayVideoPlayStarted) {
          window.__displayAudioBlockedCount = Number(window.__displayAudioBlockedCount || 0) + 1;
          throw new Error('NotAllowedError');
        }
        this.unlocked = true;
        window.__displayAudioPlayCount = Number(window.__displayAudioPlayCount || 0) + 1;
      }

      pause() {}
    }

    class MockAudioContext {
      constructor() {
        this.state = 'running';
        this.currentTime = 0;
        this.destination = {};
      }

      async resume() {
        this.state = 'running';
      }

      createOscillator() {
        return {
          connect: () => {},
          start: () => {},
          stop: () => {}
        };
      }

      createGain() {
        return {
          gain: { value: 1 },
          connect: () => {}
        };
      }
    }

    window.Audio = MockAudio;
    window.AudioContext = MockAudioContext;
    window.webkitAudioContext = MockAudioContext;
    window.EventSource = class MockEventSource {
      constructor() {
        this.listeners = new Map();
        window.__displayEventSource = this;
        window.__emitDisplayEvent = (payload) => this.emit('message', { data: JSON.stringify(payload) });
        if (shouldEmitAutoEntry) {
          window.setTimeout(() => {
            this.emit('message', {
              data: JSON.stringify({
                topic: 'troy-entry',
                type: 'flare',
                label: '入店: 海風の船長',
                level: 28,
                rankName: '船長',
                rankBenefits: ['ドリンクサイズアップ1回', '専用ジョッキ 店内専用']
              })
            });
          }, 180);
        }
      }

      addEventListener(type, callback) {
        const listeners = this.listeners.get(type) || [];
        listeners.push(callback);
        this.listeners.set(type, listeners);
      }

      emit(type, payload) {
        (this.listeners.get(type) || []).forEach((callback) => callback(payload));
      }

      close() {}
    };
  }, { autoEntryEvent, strictAudioActivation });

  const defaultRankingResponse = {
    scope: 'troy-members',
    isOpen: true,
    ranking: [
      { position: 1, displayName: '海風の船長', level: 24, rankName: '船長', bounty: 307200, avatarUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==' },
      { position: 2, displayName: '港町の料理人', level: 18, rankName: '航海士', bounty: 165600, avatarUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==' },
      { position: 3, displayName: '霧切りの狙撃手', level: 13, rankName: '航海士', bounty: 98800, avatarUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==' },
      { position: 4, displayName: '古地図の考古学者', level: 9, rankName: '見習い', bounty: 48600, avatarUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==' },
      { position: 5, displayName: '歌う音楽家', level: 7, rankName: '見習い', bounty: 28700, avatarUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==' }
    ]
  };
  let rankingRequestCount = 0;
  const rankingResponses = Array.isArray(options.rankingResponses) && options.rankingResponses.length > 0
    ? options.rankingResponses
    : [defaultRankingResponse];
  await page.route('**/api/troy-bounty-ranking?limit=10', async (route) => {
    const body = rankingResponses[Math.min(rankingRequestCount, rankingResponses.length - 1)];
    rankingRequestCount += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(body)
    });
  });
}

test('display kiosk starts with audio gate and hides controls after launch', async ({ page }) => {
  await installDisplayMocks(page);
  await page.goto('/display.html', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#audioGate')).toBeVisible();
  await expect(page.locator('#rankingPanel')).toBeVisible();
  await expect(page.locator('#rankingTitle')).toHaveText('店内懸賞金ランキング');
  await expect(page.locator('#rankingSub')).toHaveText('入店中メンバーのみ');
  await expect(page.locator('.ranking-row')).toHaveCount(5);
  await expect(page.locator('.ranking-avatar img')).toHaveCount(5);

  await page.locator('#btnStartDisplay').click();
  await page.waitForTimeout(700);
  await expect(page.locator('body')).toHaveClass(/display-kiosk/);
  await expect(page.locator('body')).toHaveClass(/display-ready/);
  await expect(page.locator('#audioGate')).toBeHidden();
  await expect(page.locator('#displayControls')).toHaveCSS('opacity', '0');

  const audit = await page.evaluate(() => {
    const rankingPanel = document.getElementById('rankingPanel');
    const rankingTitle = document.getElementById('rankingTitle');
    const firstAvatar = document.querySelector('.ranking-avatar');
    const firstBounty = document.querySelector('.ranking-bounty');
    const firstWanted = document.querySelector('.ranking-wanted-stamp');
    return {
      audioPlayCount: window.__displayAudioPlayCount || 0,
      panelWidth: Math.round(rankingPanel.getBoundingClientRect().width),
      titleFontSize: Number.parseFloat(getComputedStyle(rankingTitle).fontSize),
      panelText: rankingPanel.textContent || '',
      firstBountyText: firstBounty?.textContent || '',
      firstWantedText: firstWanted?.textContent || '',
      avatarSize: Math.round(firstAvatar.getBoundingClientRect().width),
      videoCurrentTime: document.getElementById('seaVideo')?.currentTime || 0,
      videoPaused: document.getElementById('seaVideo')?.paused ?? true,
      videoMuted: document.getElementById('seaVideo')?.muted ?? true,
      videoVolume: document.getElementById('seaVideo')?.volume ?? 0,
      videoControls: document.getElementById('seaVideo')?.controls ?? true,
      videoPlaysInline: document.getElementById('seaVideo')?.playsInline ?? false,
      videoWebkitInlineAttr: document.getElementById('seaVideo')?.hasAttribute('webkit-playsinline') ?? false,
      videoAirplayAttr: document.getElementById('seaVideo')?.getAttribute('x-webkit-airplay') || '',
      videoRemotePlaybackAttr: document.getElementById('seaVideo')?.hasAttribute('disableremoteplayback') ?? false,
      videoControlsList: document.getElementById('seaVideo')?.getAttribute('controlslist') || '',
      videoPointerEvents: getComputedStyle(document.getElementById('seaVideo')).pointerEvents,
      panelZIndex: Number.parseInt(getComputedStyle(rankingPanel).zIndex, 10) || 0,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    };
  });

  expect(audit.audioPlayCount).toBeGreaterThanOrEqual(5);
  expect(audit.videoCurrentTime).toBeGreaterThan(0.05);
  expect(audit.videoPaused).toBe(false);
  expect(audit.videoMuted).toBe(false);
  expect(audit.videoVolume).toBeGreaterThan(0);
  expect(audit.videoControls).toBe(false);
  expect(audit.videoPlaysInline).toBe(true);
  expect(audit.videoWebkitInlineAttr).toBe(true);
  expect(audit.videoAirplayAttr).toBe('deny');
  expect(audit.videoRemotePlaybackAttr).toBe(true);
  expect(audit.videoControlsList).toContain('noremoteplayback');
  expect(audit.videoPointerEvents).toBe('none');
  expect(audit.panelZIndex).toBeGreaterThan(0);
  expect(audit.panelWidth).toBeGreaterThanOrEqual(380);
  expect(audit.titleFontSize).toBeGreaterThanOrEqual(20);
  expect(audit.firstWantedText).toBe('WANTED');
  expect(audit.firstBountyText).toContain('BOUNTY');
  expect(audit.firstBountyText).toContain('ĐɃ');
  expect(audit.panelText).toContain('Lv.24 船長');
  expect(audit.panelText).not.toContain('ランクLv');
  expect(audit.panelText).not.toContain('貢献度');
  expect(audit.panelText).not.toContain('×');
  expect(audit.avatarSize).toBeGreaterThanOrEqual(40);
  expect(audit.scrollWidth).toBe(audit.clientWidth);
});

test('display shows TROY menu order notices until staff reviews them', async ({ page }) => {
  await installDisplayMocks(page, { autoEntryEvent: false });
  await page.goto('/display.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#btnStartDisplay').click();
  await expect(page.locator('#audioGate')).toBeHidden();
  await expect(page.locator('body')).toHaveClass(/display-ready/);
  await expect(page.locator('#orderNoticePanel')).toBeHidden();

  const audioBefore = await page.evaluate(() => window.__displayAudioPlayCount || 0);
  await page.evaluate(() => {
    window.__emitDisplayEvent({
      topic: 'troy-customer-order',
      type: 'refresh',
      requestId: 'customer-order-001',
      displayName: '海風の船長',
      itemName: '瓶ビール（ハートランド）',
      quantity: 2,
      lineTotal: 1400,
      menuImage: '/Sprites/drinks/fantasy_anchor_green_beer_bottle.png',
      createdAtMs: 1710000000000
    });
  });

  await expect(page.locator('#orderNoticePanel')).toBeVisible();
  await expect(page.locator('#orderNoticeCount')).toHaveText('1件');
  await expect(page.locator('.order-notice-row')).toHaveCount(1);
  await expect(page.locator('.order-notice-name')).toHaveText('海風の船長');
  await expect(page.locator('.order-notice-item')).toHaveText('瓶ビール（ハートランド） x2');
  await expect(page.locator('.order-notice-total')).toHaveText('1,400円');
  await expect(page.locator('.order-notice-action')).toHaveText('承認待ち');
  await expect(page.locator('.order-notice-footer')).toHaveText('スタッフ用オーダーページで受付');
  await expect(page.locator('.order-notice-thumb img')).toHaveAttribute('src', '/Sprites/drinks/fantasy_anchor_green_beer_bottle.png');
  await expect(page.locator('.effect')).toHaveCount(0);

  await expect.poll(async () => page.evaluate(() => window.__displayAudioPlayCount || 0)).toBeGreaterThan(audioBefore);

  await page.evaluate(() => {
    window.__emitDisplayEvent({
      topic: 'troy-customer-order-reviewed',
      type: 'refresh',
      requestId: 'customer-order-001',
      action: 'accept'
    });
  });

  await expect(page.locator('#orderNoticePanel')).toBeHidden();
  await expect(page.locator('.order-notice-row')).toHaveCount(0);
});

test('display audio unlock works when Android-style activation expires after the tap task', async ({ page }) => {
  await installDisplayMocks(page, {
    autoEntryEvent: false,
    strictAudioActivation: true
  });
  await page.goto('/display.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    window.__displayVideoPlayStarted = false;
  });

  await page.locator('#btnStartDisplay').click();
  await expect(page.locator('#audioGate')).toBeHidden();
  await expect(page.locator('body')).toHaveClass(/display-ready/);

  let audit = await page.evaluate(() => ({
    audioPlayCount: window.__displayAudioPlayCount || 0,
    blockedCount: window.__displayAudioBlockedCount || 0,
    gateStatus: document.getElementById('audioGateStatus')?.textContent || ''
  }));
  expect(audit.audioPlayCount).toBeGreaterThanOrEqual(5);
  expect(audit.blockedCount).toBe(0);
  expect(audit.gateStatus).toBe('音声ON');

  await page.evaluate(() => {
    window.__emitDisplayEvent({
      topic: 'troy-entry',
      type: 'flare',
      label: '入店: Android確認',
      level: 24,
      rankName: '船長'
    });
  });
  await page.waitForTimeout(80);

  audit = await page.evaluate(() => ({
    audioPlayCount: window.__displayAudioPlayCount || 0,
    blockedCount: window.__displayAudioBlockedCount || 0
  }));
  expect(audit.audioPlayCount).toBeGreaterThanOrEqual(6);
  expect(audit.blockedCount).toBe(0);
});

test('display audio unlock starts from touchstart for iPhone Safari', async ({ page }) => {
  await installDisplayMocks(page, {
    autoEntryEvent: false,
    strictAudioActivation: true
  });
  await page.goto('/display.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    window.__displayVideoPlayStarted = false;
  });

  await page.locator('#btnStartDisplay').dispatchEvent('touchstart', {
    bubbles: true,
    cancelable: true
  });

  await expect(page.locator('#audioGate')).toBeHidden();
  await expect(page.locator('body')).toHaveClass(/display-ready/);
  const audit = await page.evaluate(() => ({
    audioPlayCount: window.__displayAudioPlayCount || 0,
    blockedCount: window.__displayAudioBlockedCount || 0,
    gateStatus: document.getElementById('audioGateStatus')?.textContent || ''
  }));
  expect(audit.audioPlayCount).toBeGreaterThanOrEqual(5);
  expect(audit.blockedCount).toBe(0);
  expect(audit.gateStatus).toBe('音声ON');
});

test('display ranking refreshes after troy close event', async ({ page }) => {
  await installDisplayMocks(page, {
    autoEntryEvent: false,
    rankingResponses: [
      {
        scope: 'troy-members',
        isOpen: true,
        ranking: [
          { position: 1, displayName: '海風の船長', level: 24, rankName: '船長', bounty: 307200 }
        ]
      },
      {
        scope: 'troy-members',
        isOpen: false,
        ranking: []
      }
    ]
  });
  await page.goto('/display.html', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('.ranking-row')).toHaveCount(1);
  await expect(page.locator('#rankingSub')).toHaveText('入店中メンバーのみ');

  await page.evaluate(() => {
    window.__emitDisplayEvent({
      topic: 'troy-status',
      type: 'splash',
      label: 'TROY CLOSE',
      isOpen: false
    });
  });

  await expect(page.locator('#rankingSub')).toHaveText('TROY CLOSE');
  await expect(page.locator('.ranking-row')).toHaveCount(0);
  await expect(page.locator('.ranking-empty')).toHaveText('入店中メンバーがいません');
  await expect(page.locator('.effect-rank-badge')).toHaveCount(0);
});

test('display ranking refreshes after explicit troy ranking event', async ({ page }) => {
  await installDisplayMocks(page, {
    autoEntryEvent: false,
    rankingResponses: [
      {
        scope: 'troy-members',
        isOpen: true,
        ranking: [
          { position: 1, displayName: '海風の船長', level: 24, rankName: '船長', bounty: 307200 }
        ]
      },
      {
        scope: 'troy-members',
        isOpen: true,
        ranking: [
          { position: 1, displayName: '海風の船長', level: 25, rankName: '船長', bounty: 360000 }
        ]
      }
    ]
  });
  await page.goto('/display.html', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('.ranking-bounty strong')).toHaveText('307,200 ĐɃ');

  await page.evaluate(() => {
    window.__emitDisplayEvent({
      topic: 'troy-ranking',
      type: 'refresh'
    });
  });

  await expect(page.locator('.ranking-bounty strong')).toHaveText('360,000 ĐɃ');
  await expect(page.locator('.ranking-meta')).toHaveText('Lv.25 船長');
});

test('display entry effect remains readable on mirrored iPad landscape', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await installDisplayMocks(page);
  await page.goto('/display.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#btnStartDisplay').click();
  await page.locator('.effect.entry-feature').waitFor({ state: 'visible' });

  const audit = await page.evaluate(() => {
    const label = document.querySelector('.effect.entry-feature .effect-label');
    const benefit = document.querySelector('.effect.entry-feature .effect-benefit');
    const rankingPanel = document.getElementById('rankingPanel');
    return {
      labelText: label?.textContent || '',
      labelFontSize: Number.parseFloat(getComputedStyle(label).fontSize),
      benefitText: benefit?.textContent || '',
      rankingWidth: Math.round(rankingPanel.getBoundingClientRect().width),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight
    };
  });

  expect(audit.labelText).toContain('海風の船長');
  expect(audit.labelFontSize).toBeGreaterThanOrEqual(48);
  expect(audit.benefitText).toContain('ドリンクサイズアップ');
  expect(audit.rankingWidth).toBeGreaterThanOrEqual(330);
  expect(audit.scrollWidth).toBe(audit.clientWidth);
  expect(audit.scrollHeight).toBe(audit.clientHeight);
});
