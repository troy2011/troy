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
        mode: 'done',
        winner: 0,
        selector: '#tarotKingdomRoot',
        output: path.resolve(process.cwd(), 'tmp', 'tarot-kingdom-shot.png'),
        width: 1440,
        height: 1400,
        waitMs: 700
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        switch (arg) {
            case '--mobile':
                options.mobile = true;
                options.width = 390;
                options.height = 844;
                break;
            case '--mode':
                options.mode = String(argv[index + 1] || options.mode).trim().toLowerCase();
                index += 1;
                break;
            case '--winner':
                options.winner = Math.max(0, Math.min(3, Number.parseInt(argv[index + 1] || '0', 10) || 0));
                index += 1;
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

function buildPreviewUrl(port, options) {
    const params = new URLSearchParams();
    if (options.mode === 'done') {
        params.set('tkdebug', 'done');
        params.set('tkwinner', String(options.winner));
    }
    return `http://127.0.0.1:${port}/tarot-kingdom-preview.html${params.size ? `?${params.toString()}` : ''}`;
}

async function waitForDoneState(page) {
    await page.waitForFunction(() => {
        const root = document.getElementById('tarotKingdomRoot');
        const button = document.getElementById('tarotKingdomSettlementConfirmButton');
        return !!root && !!button && !button.hidden && button.textContent.includes('もう一度');
    }, { timeout: 15000 });
}

async function waitForOfflineStart(page) {
    await page.waitForSelector('#tarotKingdomStartOfflineButton', { state: 'visible', timeout: 15000 });
    await page.click('#tarotKingdomStartOfflineButton');
    await page.waitForFunction(() => {
        const hand = document.getElementById('tarotKingdomHand');
        const players = document.getElementById('tarotKingdomPlayers');
        return !!hand && !!players && hand.children.length > 0 && players.children.length > 0;
    }, { timeout: 15000 });
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
    const targetUrl = buildPreviewUrl(port, options);

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
        await page.goto(targetUrl, { waitUntil: 'networkidle' });

        if (options.mode === 'offline') {
            await waitForOfflineStart(page);
        } else {
            await waitForDoneState(page);
        }

        if (options.waitMs > 0) {
            await page.waitForTimeout(options.waitMs);
        }

        ensureParentDir(options.output);
        const target = await page.$(options.selector);
        if (!target) {
            throw new Error(`Selector not found: ${options.selector}`);
        }
        await target.screenshot({
            path: options.output
        });

        console.log(options.output);
        await context.close();
    } finally {
        if (browser) {
            await browser.close();
        }
        await new Promise((resolve) => server.close(resolve));
    }
}

main().catch((error) => {
    console.error('[tarot-kingdom-shot] failed:', error);
    process.exitCode = 1;
});
