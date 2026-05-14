const fs = require('fs');
const http = require('http');
const path = require('path');

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

function parseArgs(argv) {
  const options = {
    port: 4173,
    root: path.resolve(process.cwd(), 'public')
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--port') {
      options.port = Number.parseInt(argv[index + 1] || String(options.port), 10) || options.port;
      index += 1;
      continue;
    }
    if (arg === '--root') {
      options.root = path.resolve(process.cwd(), argv[index + 1] || 'public');
      index += 1;
    }
  }

  return options;
}

function resolveFilePath(rootDir, pathname) {
  const normalizedPath = path.normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  let filePath = path.resolve(rootDir, normalizedPath);
  const relativePath = path.relative(rootDir, filePath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  const relativeIndexPath = path.relative(rootDir, filePath);
  if (relativeIndexPath.startsWith('..') || path.isAbsolute(relativeIndexPath)) {
    return null;
  }

  return filePath;
}

function createServer(rootDir) {
  return http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method not allowed');
      return;
    }

    const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const filePath = resolveFilePath(rootDir, requestUrl.pathname);
    if (!filePath || !fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    try {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(filePath).pipe(res);
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Static server error: ${error.message}`);
    }
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const rootDir = path.resolve(options.root);
  const server = createServer(rootDir);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, '127.0.0.1', resolve);
  });

  console.log(`[playwright-static-server] ${rootDir} -> http://127.0.0.1:${options.port}`);

  const shutdown = () => {
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('[playwright-static-server] failed:', error);
  process.exit(1);
});
