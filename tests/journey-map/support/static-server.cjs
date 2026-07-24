const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const HOST = '127.0.0.1';
const PORT = 4173;
const PREFIX = '/mahoroba-reports/';
const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..', '..');

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function send(response, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
  });
  response.end(body);
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${HOST}:${PORT}`);
  let pathname;

  try {
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch {
    send(response, 400, 'Bad request');
    return;
  }

  if (!pathname.startsWith(PREFIX)) {
    send(response, 404, 'Not found');
    return;
  }

  let relativePath = pathname.slice(PREFIX.length);
  if (relativePath.endsWith('/')) {
    relativePath += 'index.html';
  }

  const filePath = path.resolve(REPOSITORY_ROOT, relativePath);
  const repositoryPrefix = `${REPOSITORY_ROOT}${path.sep}`;

  if (!filePath.startsWith(repositoryPrefix)) {
    send(response, 403, 'Forbidden');
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      send(response, 404, 'Not found');
      return;
    }

    fs.readFile(filePath, (readError, body) => {
      if (readError) {
        send(response, 500, 'Read error');
        return;
      }

      const extension = path.extname(filePath).toLowerCase();
      send(response, 200, body, MIME_TYPES[extension] || 'application/octet-stream');
    });
  });
});

function startServer() {
  return new Promise((resolve, reject) => {
    const handleError = (error) => {
      server.off('listening', handleListening);
      reject(error);
    };
    const handleListening = () => {
      server.off('error', handleError);
      resolve(server);
    };

    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen(PORT, HOST);
  });
}

function shutdown() {
  server.closeAllConnections?.();
  server.close();
  process.exit(0);
}

if (require.main === module) {
  startServer();
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = {
  startServer,
};
