const http = require('http');

module.exports = async function shutdownPlaywrightStaticServer() {
  const port = Number(process.env.PLAYWRIGHT_STATIC_PORT || 4173);
  await new Promise((resolve) => {
    const request = http.request({
      host: '127.0.0.1',
      port,
      path: '/__playwright_shutdown__',
      method: 'POST',
      timeout: 1500
    }, (response) => {
      response.resume();
      response.once('end', resolve);
    });
    request.once('timeout', () => {
      request.destroy();
      resolve();
    });
    request.once('error', resolve);
    request.end();
  });
};
