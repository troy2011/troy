const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const { bootstrapMainApp } = require('../../tests/helpers/main-app-harness');

const rootDir = path.resolve(__dirname, 'command-videos');
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173';
const frameIntervalMs = 100;
const clipDurationMs = 1800;
const viewport = { width: 390, height: 844 };

const clips = [
  {
    slug: '01-assault',
    label: '突撃',
    setup: 'front',
    action: async (page) => page.evaluate(() => {
      window.__navalBattleDebug.applyCommand('assault', 'player');
      window.__navalBattleDebug.applyCommand('bowCannon', 'enemy');
    })
  },
  {
    slug: '02-bow-cannon',
    label: '船首砲',
    setup: 'front',
    action: async (page) => page.evaluate(() => {
      window.__navalBattleDebug.applyCommand('bowCannon', 'player');
      window.__navalBattleDebug.applyCommand('assault', 'enemy');
    })
  },
  {
    slug: '03-starboard-rudder',
    label: '面舵',
    setup: 'front',
    action: async (page) => page.evaluate(() => {
      window.__navalBattleDebug.applyCommand('starboardRudder', 'player');
      window.__navalBattleDebug.applyCommand('bowCannon', 'enemy');
    })
  },
  {
    slug: '04-broadside',
    label: '舷側砲',
    setup: 'side',
    action: async (page) => page.evaluate(() => {
      window.__navalBattleDebug.applyCommand('broadside', 'player');
      window.__navalBattleDebug.applyCommand('blankShot', 'enemy');
    })
  },
  {
    slug: '05-blank-shot',
    label: '空砲',
    setup: 'side',
    action: async (page) => page.evaluate(() => {
      window.__navalBattleDebug.applyCommand('blankShot', 'player');
      window.__navalBattleDebug.applyCommand('broadside', 'enemy');
    })
  },
  {
    slug: '06-port-rudder',
    label: '取舵',
    setup: 'side',
    action: async (page) => page.evaluate(() => {
      window.__navalBattleDebug.applyCommand('portRudder', 'player');
      window.__navalBattleDebug.applyCommand('broadside', 'enemy');
    })
  },
  {
    slug: '07-cargo-raid',
    label: '船倉略奪',
    setup: 'cargo',
    action: async (page) => page.evaluate(() => {
      window.__navalBattleDebug.applyCommand('cargoRaid', 'player');
    })
  },
  {
    slug: '08-boarding',
    label: '接舷',
    setup: 'boarding',
    action: async (page) => page.evaluate(() => {
      window.__navalBattleDebug.applyCommand('boarding', 'player');
    })
  }
];

function frameName(index) {
  return `${String(index).padStart(4, '0')}.png`;
}

async function ensureEmptyDir(dir) {
  await fsp.rm(dir, { recursive: true, force: true });
  await fsp.mkdir(dir, { recursive: true });
}

async function startBattle(page) {
  await bootstrapMainApp(page);
  await page.evaluate(() => {
    window.startNavalBattle({
      opponentId: 'PF_NAVAL_VIDEO_TARGET',
      opponentName: '動画確認敵',
      disableAi: true,
      playerShipProfile: { form: 'fighter', shipClass: 'fighter', name: '自船ファイター', level: 3 },
      opponentShipProfile: { form: 'fighter', shipClass: 'fighter', name: '敵ファイター', level: 3 }
    });
  });
  await page.locator('#navalBattleModal').waitFor({ state: 'visible' });
  await page.evaluate(() => {
    const modal = document.getElementById('navalBattleModal');
    if (!modal) return;
    const style = document.createElement('style');
    style.textContent = `
      .naval-command-video-label {
        position: absolute;
        left: 50%;
        top: 58px;
        transform: translateX(-50%);
        z-index: 20;
        min-width: 132px;
        text-align: center;
        padding: 6px 12px;
        border-radius: 999px;
        border: 1px solid rgba(244, 211, 126, 0.72);
        background: rgba(7, 20, 24, 0.82);
        color: #ffe8a6;
        font-weight: 900;
        letter-spacing: 0;
        box-shadow: 0 12px 30px rgba(0,0,0,0.28);
        pointer-events: none;
      }
    `;
    modal.appendChild(style);
    const label = document.createElement('div');
    label.id = 'navalCommandVideoLabel';
    label.className = 'naval-command-video-label';
    modal.appendChild(label);
  });
}

async function setClipLabel(page, label) {
  await page.evaluate((text) => {
    const labelEl = document.getElementById('navalCommandVideoLabel');
    if (labelEl) labelEl.textContent = text;
  }, label);
}

async function prepareClip(page, setup) {
  if (setup === 'side' || setup === 'cargo') {
    await page.evaluate(() => {
      window.__navalBattleDebug.applyCommand('starboardRudder', 'player');
      window.__navalBattleDebug.applyCommand('starboardRudder', 'enemy');
    });
    await page.waitForTimeout(1000);
  }
  if (setup === 'cargo') {
    await page.evaluate(() => {
      window.__navalBattleDebug.mutate((battle) => {
        battle.enemy.maxHp = 3;
        battle.enemy.hp = 1;
        battle.enemy.facing = 'starboard';
        battle.player.facing = 'starboard';
        battle.player.reload = 0;
        battle.enemy.reload = 0;
      });
    });
  }
  if (setup === 'boarding') {
    await page.evaluate(() => {
      window.__navalBattleDebug.mutate((battle) => {
        battle.enemy.hp = 0;
        battle.enemy.maxHp = 3;
        battle.player.hp = Math.max(1, battle.player.hp || 1);
        battle.player.facing = 'front';
        battle.enemy.facing = 'front';
      });
    });
  }
}

async function captureClip(page, clip, framesDir) {
  await ensureEmptyDir(framesDir);
  await setClipLabel(page, clip.label);
  await page.waitForTimeout(150);
  let didAction = false;
  const totalFrames = Math.ceil(clipDurationMs / frameIntervalMs);
  for (let i = 0; i < totalFrames; i += 1) {
    if (!didAction && i === 3) {
      await clip.action(page);
      didAction = true;
    }
    await page.screenshot({
      path: path.join(framesDir, frameName(i + 1)),
      fullPage: false
    });
    await page.waitForTimeout(frameIntervalMs);
  }
}

function encodeFrames(framesDir, outputPath) {
  execFileSync('ffmpeg', [
    '-y',
    '-framerate', String(1000 / frameIntervalMs),
    '-i', path.join(framesDir, '%04d.png'),
    '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outputPath
  ], { stdio: 'ignore' });
}

function concatVideos(videoPaths, outputPath) {
  const listPath = path.join(rootDir, 'concat-list.txt');
  const body = videoPaths
    .map((filePath) => `file '${filePath.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
    .join('\n');
  fs.writeFileSync(listPath, body, 'utf8');
  execFileSync('ffmpeg', [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-c', 'copy',
    outputPath
  ], { stdio: 'ignore' });
}

(async () => {
  await fsp.mkdir(rootDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const videoPaths = [];
  try {
    for (const clip of clips) {
      const context = await browser.newContext({
        baseURL,
        viewport,
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 1
      });
      const page = await context.newPage();
      await startBattle(page);
      await prepareClip(page, clip.setup);
      const framesDir = path.join(rootDir, `${clip.slug}-frames`);
      const outputPath = path.join(rootDir, `${clip.slug}.mp4`);
      await captureClip(page, clip, framesDir);
      encodeFrames(framesDir, outputPath);
      await fsp.rm(framesDir, { recursive: true, force: true });
      videoPaths.push(outputPath);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  concatVideos(videoPaths, path.join(rootDir, '00-all-commands.mp4'));
  console.log(JSON.stringify({
    rootDir,
    videos: ['00-all-commands.mp4', ...videoPaths.map((filePath) => path.basename(filePath))]
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
