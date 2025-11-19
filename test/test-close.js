// One-shot integration test: start app, wait, POST to /events/:id/close, print response
require('dotenv').config();
const http = require('http');

// Start the app (app.js calls app.listen)
require('../app');

function postClose() {
  const data = JSON.stringify({ motivo: 'fecha_alcanzada' });
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/events/000000000000000000000000/close',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  };

  const req = http.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      console.log('STATUS', res.statusCode);
      try {
        console.log(JSON.stringify(JSON.parse(body), null, 2));
      } catch (e) {
        console.log(body);
      }
      process.exit(0);
    });
  });

  req.on('error', (err) => {
    console.error('REQUEST ERROR', err && err.message ? err.message : err);
    process.exit(1);
  });

  req.write(data);
  req.end();
}

// Wait 2s for server to start listening
setTimeout(postClose, 2000);
