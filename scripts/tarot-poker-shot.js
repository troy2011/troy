const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const MIME_TYPES = {
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp'
};

function parseArgs(argv) {
    const options = {
        mobile: false,
        primary: 0,
        betAction: '',
        noMajorArcana: false,
        output: path.resolve(process.cwd(), 'tmp', 'tarot-poker-shot.png'),
        selector: '#tabContentTarot',
        width: 1440,
        height: 1600,
        waitMs: 600
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        switch (arg) {
            case '--mobile':
                options.mobile = true;
                options.width = 390;
                options.height = 844;
                break;
            case '--primary':
                options.primary = Math.max(0, Number.parseInt(argv[index + 1] || '0', 10) || 0);
                index += 1;
                break;
            case '--bet':
                options.betAction = String(argv[index + 1] || '').trim().toLowerCase();
                index += 1;
                break;
            case '--no-major':
                options.noMajorArcana = true;
                break;
            case '--output':
                options.output = path.resolve(process.cwd(), argv[index + 1] || options.output);
                index += 1;
                break;
            case '--selector':
                options.selector = argv[index + 1] || options.selector;
                index += 1;
                break;
            case '--width':
                options.width = Math.max(320, Number.parseInt(argv[index + 1] || String(options.width), 10) || options.width);
                index += 1;
                break;
            case '--height':
                options.height = Math.max(480, Number.parseInt(argv[index + 1] || String(options.height), 10) || options.height);
                index += 1;
                break;
            case '--wait':
                options.waitMs = Math.max(0, Number.parseInt(argv[index + 1] || String(options.waitMs), 10) || options.waitMs);
                index += 1;
                break;
            default:
                break;
        }
    }

    return options;
}

function ensureParentDir(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function createStaticServer(rootDir) {
    const server = http.createServer((req, res) => {
        const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
        const safePath = path.normalize(decodeURIComponent(requestUrl.pathname)).replace(/^(\.\.[/\\])+/, '');
        let filePath = path.join(rootDir, safePath);

        try {
            const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
            if (stat && stat.isDirectory()) {
                filePath = path.join(filePath, 'index.html');
            }

            if (!fs.existsSync(filePath)) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Not found');
                return;
            }

            const ext = path.extname(filePath).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': contentType });
            fs.createReadStream(filePath).pipe(res);
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(`Static server error: ${error.message}`);
        }
    });

    return server;
}

async function waitForPokerInteractive(page) {
    await page.waitForFunction(() => {
        const startButton = document.getElementById('tarotStartButton');
        const betButtons = [
            document.getElementById('tarotBetCheck'),
            document.getElementById('tarotBetCall'),
            document.getElementById('tarotBetBet'),
            document.getElementById('tarotBetRaise'),
            document.getElementById('tarotBetFold')
        ].filter(Boolean);
        const hasEnabledBet = betButtons.some((button) => !button.disabled);
        const hasJudgmentChoice = Array.from(document.querySelectorAll('#tarotJudgmentOptions button')).some((button) => !button.disabled);
        return !!startButton && (!startButton.disabled || hasEnabledBet || hasJudgmentChoice);
    }, { timeout: 30000 });
}

async function clickPrimaryButton(page, count, waitMs) {
    for (let index = 0; index < count; index += 1) {
        await waitForPokerInteractive(page);
        const startButton = page.locator('#tarotStartButton');
        await startButton.click();
        await waitForPokerInteractive(page);
        if (waitMs > 0) {
            await page.waitForTimeout(waitMs);
        }
    }
}

async function maybeSetRuleset(page, useMajorArcana) {
    const selector = useMajorArcana ? '#tarotModeWithArcana' : '#tarotModeWithoutArcana';
    const button = page.locator(selector);
    if (await button.count()) {
        await button.click();
        await waitForPokerInteractive(page);
    }
}

async function maybeClickBetAction(page, action, waitMs) {
    if (!action) return;
    const selectorMap = {
        check: '#tarotBetCheck',
        call: '#tarotBetCall',
        bet: '#tarotBetBet',
        raise: '#tarotBetRaise',
        fold: '#tarotBetFold'
    };
    const selector = selectorMap[action];
    if (!selector) {
        throw new Error(`Unknown bet action: ${action}`);
    }
    await waitForPokerInteractive(page);
    const button = page.locator(selector);
    await button.click();
    await waitForPokerInteractive(page);
    if (waitMs > 0) {
        await page.waitForTimeout(waitMs);
    }
}

async function captureSnapshot(page) {
    return page.evaluate(() => {
        const startButton = document.getElementById('tarotStartButton');
        const betButtons = {
            check: document.getElementById('tarotBetCheck')?.disabled === false,
            call: document.getElementById('tarotBetCall')?.disabled === false,
            bet: document.getElementById('tarotBetBet')?.disabled === false,
            raise: document.getElementById('tarotBetRaise')?.disabled === false,
            fold: document.getElementById('tarotBetFold')?.disabled === false
        };
        return {
            stateText: document.getElementById('tarotStateText')?.textContent?.trim() || '',
            startLabel: startButton?.textContent?.trim() || '',
            startDisabled: startButton?.disabled ?? true,
            useMajorArcana: document.getElementById('tarotModeWithArcana')?.getAttribute('aria-pressed') === 'true',
            betButtons,
            judgmentChoices: document.querySelectorAll('#tarotJudgmentOptions button').length,
            playerCards: document.querySelectorAll('#tarotPlayerHand .tarot-card').length,
            boardCards: document.querySelectorAll('#tarotPokerBoard .tarot-card').length
        };
    });
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const publicDir = path.resolve(__dirname, '..', 'public');
    const server = createStaticServer(publicDir);

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const baseUrl = `http://127.0.0.1:${port}/tarot-poker-preview.html`;

    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            viewport: {
                width: options.width,
                height: options.height
            },
            deviceScaleFactor: options.mobile ? 2 : 1
        });
        const page = await context.newPage();
        await page.goto(baseUrl, { waitUntil: 'networkidle' });
        await page.waitForSelector('#tarotStartButton', { state: 'visible', timeout: 15000 });
        await waitForPokerInteractive(page);

        if (options.noMajorArcana) {
            await maybeSetRuleset(page, false);
        }

        if (options.primary > 0) {
            await clickPrimaryButton(page, options.primary, options.waitMs);
        }
        if (options.betAction) {
            await maybeClickBetAction(page, options.betAction, options.waitMs);
        }

        ensureParentDir(options.output);
        const target = await page.$(options.selector);
        if (!target) {
            throw new Error(`Selector not found: ${options.selector}`);
        }
        await target.screenshot({ path: options.output });

        const snapshot = await captureSnapshot(page);
        console.log(options.output);
        console.log(JSON.stringify(snapshot));
        await context.close();
    } finally {
        if (browser) {
            await browser.close();
        }
        await new Promise((resolve) => server.close(resolve));
    }
}

main().catch((error) => {
    console.error('[tarot-poker-shot] failed:', error);
    process.exitCode = 1;
});
