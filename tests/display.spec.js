const { test, expect } = require('@playwright/test');

async function installDisplayMocks(page) {
  await page.addInitScript(() => {
    class MockAudio {
      constructor(src) {
        this.src = src;
        this.volume = 1;
        this.currentTime = 0;
        this.preload = '';
        this.playsInline = false;
      }

      async play() {
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
  });

  await page.route('**/api/troy-bounty-ranking?limit=10', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        ranking: [
          { position: 1, displayName: '海風の船長', contribution: 12800 },
          { position: 2, displayName: '港町の料理人', contribution: 9200 },
          { position: 3, displayName: '霧切りの狙撃手', contribution: 7600 },
          { position: 4, displayName: '古地図の考古学者', contribution: 5400 },
          { position: 5, displayName: '歌う音楽家', contribution: 4100 }
        ]
      })
    });
  });
}

test('display kiosk starts with audio gate and hides controls after launch', async ({ page }) => {
  await installDisplayMocks(page);
  await page.goto('/display.html', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#audioGate')).toBeVisible();
  await expect(page.locator('#rankingPanel')).toBeVisible();
  await expect(page.locator('.ranking-row')).toHaveCount(5);

  await page.locator('#btnStartDisplay').click();
  await expect(page.locator('body')).toHaveClass(/display-kiosk/);
  await expect(page.locator('body')).toHaveClass(/display-ready/);
  await expect(page.locator('#audioGate')).toBeHidden();
  await expect(page.locator('#displayControls')).toHaveCSS('opacity', '0');

  const audit = await page.evaluate(() => {
    const rankingPanel = document.getElementById('rankingPanel');
    const rankingTitle = document.getElementById('rankingTitle');
    return {
      audioPlayCount: window.__displayAudioPlayCount || 0,
      panelWidth: Math.round(rankingPanel.getBoundingClientRect().width),
      titleFontSize: Number.parseFloat(getComputedStyle(rankingTitle).fontSize),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    };
  });

  expect(audit.audioPlayCount).toBeGreaterThanOrEqual(5);
  expect(audit.panelWidth).toBeGreaterThanOrEqual(380);
  expect(audit.titleFontSize).toBeGreaterThanOrEqual(20);
  expect(audit.scrollWidth).toBe(audit.clientWidth);
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
