// Nur fuer scripts/shop_demo.sh: Proxy vor "next dev", der jede Seite mit dem
// Login eines Demo-Admins ausliefert — Shop testen ohne Login-Formular.
// Nur Node-Core. Lauscht ausschliesslich auf 127.0.0.1.
//   node autologin-proxy.js <listenPort> <targetPort> <authJsonFile>
const http = require('http');
const net = require('net');
const fs = require('fs');

const [listenPort, targetPort, authFile] = process.argv.slice(2);
// { accessToken, user } wie authStore (localStorage 'xxx-auth') es speichert
const auth = fs.readFileSync(authFile, 'utf8').trim();
const inject = `<script>try{localStorage.setItem('xxx-auth',JSON.stringify({state:${auth},version:0}))}catch(e){}</script>`;

const server = http.createServer((req, res) => {
  if (req.url === '/login' || req.url.startsWith('/login?')) {
    res.writeHead(302, { location: '/shop' });
    return res.end();
  }
  const headers = { ...req.headers, host: `localhost:${targetPort}` };
  delete headers['accept-encoding']; // HTML unkomprimiert, damit das Script rein kann
  const upstream = http.request({ host: '127.0.0.1', port: targetPort, path: req.url, method: req.method, headers }, (up) => {
    const isHtml = (up.headers['content-type'] || '').includes('text/html');
    if (!isHtml) {
      res.writeHead(up.statusCode, up.headers);
      return up.pipe(res);
    }
    const chunks = [];
    up.on('data', (c) => chunks.push(c));
    up.on('end', () => {
      const html = Buffer.concat(chunks).toString('utf8').replace('<head>', `<head>${inject}`);
      const out = { ...up.headers };
      delete out['content-length'];
      res.writeHead(up.statusCode, out);
      res.end(html);
    });
  });
  upstream.on('error', () => { res.writeHead(502); res.end('Frontend startet noch …'); });
  req.pipe(upstream);
});

// WebSockets (Hot-Reload von next dev) unveraendert durchreichen
server.on('upgrade', (req, socket, head) => {
  const up = net.connect(targetPort, '127.0.0.1', () => {
    up.write(`${req.method} ${req.url} HTTP/1.1\r\n` + Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n');
    up.write(head);
    socket.pipe(up).pipe(socket);
  });
  up.on('error', () => socket.destroy());
  socket.on('error', () => up.destroy());
});

server.listen(Number(listenPort), '127.0.0.1', () => console.log(`autologin-proxy :${listenPort} -> :${targetPort}`));
