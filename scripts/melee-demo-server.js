'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const requestedPort = Number(process.argv[2] || process.env.PORT || 0);
const root = path.join(__dirname, '..', 'public');
const tarotPath = path.join(__dirname, '..', 'server', 'data', 'tarot-battle-skills.json');

const mime = new Map([
    ['.html', 'text/html; charset=utf-8'],
    ['.css', 'text/css; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.png', 'image/png'],
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.webp', 'image/webp'],
    ['.svg', 'image/svg+xml'],
    ['.mp4', 'video/mp4'],
    ['.mp3', 'audio/mpeg']
]);

function send(res, status, headers, body) {
    res.writeHead(status, headers);
    res.end(body);
}

function safePath(urlPath) {
    const clean = decodeURIComponent(String(urlPath || '/').split('?')[0]).replace(/^\/+/, '');
    const resolved = path.resolve(root, clean || 'melee-demo.html');
    return resolved.startsWith(root) ? resolved : '';
}

const server = http.createServer((req, res) => {
    if (req.url === '/api/tarot-battle-skills') {
        fs.readFile(tarotPath, (error, bytes) => {
            if (error) {
                send(res, 500, { 'content-type': 'application/json; charset=utf-8' }, JSON.stringify({ error: 'tarot data unavailable' }));
                return;
            }
            send(res, 200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, bytes);
        });
        return;
    }

    const file = safePath(req.url);
    if (!file) {
        send(res, 403, { 'content-type': 'text/plain; charset=utf-8' }, 'Forbidden');
        return;
    }

    fs.stat(file, (statError, stat) => {
        const target = !statError && stat.isDirectory() ? path.join(file, 'index.html') : file;
        fs.readFile(target, (readError, bytes) => {
            if (readError) {
                send(res, 404, { 'content-type': 'text/plain; charset=utf-8' }, 'Not found');
                return;
            }
            const type = mime.get(path.extname(target).toLowerCase()) || 'application/octet-stream';
            send(res, 200, { 'content-type': type, 'cache-control': 'no-store' }, bytes);
        });
    });
});

server.listen(requestedPort, '127.0.0.1', () => {
    const address = server.address();
    console.log(`melee-demo=http://127.0.0.1:${address.port}/melee-demo.html`);
});
