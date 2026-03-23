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
        spins: 0,
        output: path.resolve(process.cwd(), 'tmp', 'spin-tarot-shot.png'),
        selector: '#tarotSpinRoot',
        width: 1440,
        height: 1200,
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
            case '--spins':
                options.spins = Math.max(0, Number.parseInt(argv[index + 1] || '0', 10) || 0);
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

async function waitForSpinToSettle(page) {
    await page.waitForFunction(() => {
        const root = document.getElementById('tarotSpinRoot');
        const button = document.getElementById('spinTarotSpinButton');
        return !!root && !!button && !root.classList.contains('is-spinning') && !button.disabled;
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
    const baseUrl = `http://127.0.0.1:${port}/spin-tarot-preview.html`;

    let browser;
    try {
        browser = await chromium.launch({
            headless: true
        });

        const context = await browser.newContext({
            viewport: {
                width: options.width,
                height: options.height
            },
            deviceScaleFactor: options.mobile ? 2 : 1
        });
        const page = await context.newPage();
        await page.goto(baseUrl, { waitUntil: 'networkidle' });
        await page.waitForSelector('#spinTarotSpinButton', { state: 'visible', timeout: 15000 });
        await waitForSpinToSettle(page);

        for (let spin = 0; spin < options.spins; spin += 1) {
            await page.click('#spinTarotSpinButton');
            await waitForSpinToSettle(page);
            if (options.waitMs > 0) {
                await page.waitForTimeout(options.waitMs);
            }
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
    console.error('[spin-tarot-shot] failed:', error);
    process.exitCode = 1;
});
