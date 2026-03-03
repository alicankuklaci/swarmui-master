const http = require('http');
const httpProxy = require('http-proxy');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');

const PORT = process.env.AGENT_PORT || 9001;
const TOKEN = process.env.AGENT_TOKEN || '';
const READONLY = (process.env.AGENT_READONLY || 'false').toLowerCase() === 'true';
const ALLOWED_IPS = (process.env.AGENT_ALLOWED_IPS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const DOCKER_SOCKET = process.env.DOCKER_SOCKET || '/var/run/docker.sock';

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('combined'));

function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return xf.split(',')[0].trim();
  return req.socket.remoteAddress || '';
}

function authMiddleware(req, res, next) {
  if (ALLOWED_IPS.length > 0) {
    const ip = getClientIp(req);
    if (!ALLOWED_IPS.includes(ip)) {
      return res.status(403).json({ success: false, message: 'IP not allowed' });
    }
  }
  if (TOKEN) {
    const auth = req.headers['authorization'] || '';
    if (auth !== `Bearer ${TOKEN}`) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
  }
  if (READONLY && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return res.status(403).json({ success: false, message: 'Agent is read-only' });
  }
  return next();
}

app.get('/health', (_req, res) => res.json({ ok: true }));

// Auth for all docker API paths
app.use(authMiddleware);

const proxy = httpProxy.createProxyServer({
  target: { socketPath: DOCKER_SOCKET },
  ws: true,
  changeOrigin: true,
});

proxy.on('error', (err, _req, res) => {
  if (!res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
  }
  res.end(JSON.stringify({ success: false, message: err.message }));
});

app.use((req, res) => {
  proxy.web(req, res, { target: { socketPath: DOCKER_SOCKET } });
});

const server = http.createServer(app);
server.on('upgrade', (req, socket, head) => {
  proxy.ws(req, socket, head, { target: { socketPath: DOCKER_SOCKET } });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`SwarmUI Agent listening on :${PORT} (socket: ${DOCKER_SOCKET})`);
});
