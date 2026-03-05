const http = require('http');
const httpProxy = require('http-proxy');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const { Server } = require('socket.io');
const Dockerode = require('dockerode');

const PORT = process.env.AGENT_PORT || 9001;
const TOKEN = process.env.AGENT_TOKEN || '';
const READONLY = (process.env.AGENT_READONLY || 'false').toLowerCase() === 'true';
const ALLOWED_IPS = (process.env.AGENT_ALLOWED_IPS || '').split(',').map(s => s.trim()).filter(Boolean);
const DOCKER_SOCKET = process.env.DOCKER_SOCKET || '/var/run/docker.sock';

const docker = new Dockerode({ socketPath: DOCKER_SOCKET });
const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('combined'));

function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return xf.split(',')[0].trim();
  return req.socket.remoteAddress || '';
}

function checkAuth(tokenFromHeader, tokenFromQuery) {
  if (!TOKEN) return true;
  const provided = tokenFromHeader?.replace('Bearer ', '') || tokenFromQuery || '';
  return provided === TOKEN;
}

function authMiddleware(req, res, next) {
  if (ALLOWED_IPS.length > 0) {
    const ip = getClientIp(req);
    if (!ALLOWED_IPS.includes(ip)) return res.status(403).json({ success: false, message: 'IP not allowed' });
  }
  if (!checkAuth(req.headers['authorization'], req.query?.token)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  if (READONLY && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return res.status(403).json({ success: false, message: 'Agent is read-only' });
  }
  return next();
}

app.get('/health', (_req, res) => res.json({ ok: true, version: '2.0.0' }));
app.use(authMiddleware);

// HTTP proxy for all Docker API requests
const proxy = httpProxy.createProxyServer({});
const target = { socketPath: DOCKER_SOCKET, host: 'localhost' };

proxy.on('error', (err, _req, res) => {
  if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: false, message: err.message }));
});

app.use((req, res) => {
  proxy.web(req, res, { target });
});

const server = http.createServer(app);

// Handle HTTP upgrade (WebSocket proxy for Docker attach)
server.on('upgrade', (req, socket, head) => {
  proxy.ws(req, socket, head, { target });
});

// ─── Socket.IO TTY Server ───────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: '*', credentials: true },
  path: '/socket.io',
});

// Auth middleware for socket.io
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token || '';
  if (!checkAuth(`Bearer ${token}`, token)) {
    return next(new Error('Unauthorized'));
  }
  next();
});

const namespace = io.of('/docker');

namespace.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token || '';
  if (!checkAuth(`Bearer ${token}`, token)) return next(new Error('Unauthorized'));
  next();
});

const execStreams = new Map();
const logStreams = new Map();

namespace.on('connection', (client) => {
  console.log(`[TTY] Client connected: ${client.id}`);

  client.on('disconnect', () => {
    console.log(`[TTY] Client disconnected: ${client.id}`);
    const execStream = execStreams.get(client.id);
    if (execStream) { try { execStream.end(); } catch (_) {} execStreams.delete(client.id); }
    const logStream = logStreams.get(client.id);
    if (logStream) { try { logStream.destroy(); } catch (_) {} logStreams.delete(client.id); }
  });

  // ── exec:start ─────────────────────────────────────────────────────────────
  client.on('exec:start', async (data) => {
    const { containerId, cmd } = data;
    try {
      const container = docker.getContainer(containerId);
      const exec = await container.exec({
        Cmd: cmd || ['/bin/sh'],
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
      });

      const stream = await exec.start({ hijack: true, stdin: true });
      execStreams.set(client.id, stream);

      stream.on('data', (chunk) => {
        client.emit('exec:data', chunk.toString('utf8'));
      });
      stream.on('end', () => {
        client.emit('exec:end');
        execStreams.delete(client.id);
      });
      stream.on('error', (err) => {
        client.emit('exec:error', err.message);
        execStreams.delete(client.id);
      });

      client.emit('exec:ready');
    } catch (err) {
      console.error('[TTY] exec:start error:', err.message);
      // Try /bin/bash fallback
      if (!cmd || cmd[0] === '/bin/sh') {
        try {
          const container = docker.getContainer(containerId);
          const exec = await container.exec({
            Cmd: ['/bin/bash'],
            AttachStdin: true, AttachStdout: true, AttachStderr: true, Tty: true,
          });
          const stream = await exec.start({ hijack: true, stdin: true });
          execStreams.set(client.id, stream);
          stream.on('data', (chunk) => client.emit('exec:data', chunk.toString('utf8')));
          stream.on('end', () => { client.emit('exec:end'); execStreams.delete(client.id); });
          stream.on('error', (e) => { client.emit('exec:error', e.message); execStreams.delete(client.id); });
          client.emit('exec:ready');
          return;
        } catch (_) {}
      }
      client.emit('exec:error', err.message);
    }
  });

  // ── exec:input ─────────────────────────────────────────────────────────────
  client.on('exec:input', (data) => {
    const stream = execStreams.get(client.id);
    if (stream) stream.write(data);
  });

  // ── exec:resize ────────────────────────────────────────────────────────────
  client.on('exec:resize', async (data) => {
    // Docker TTY resize via exec inspect is complex; emit ack for now
    client.emit('exec:resized', { cols: data.cols, rows: data.rows });
  });

  // ── logs:start ─────────────────────────────────────────────────────────────
  client.on('logs:start', async (data) => {
    const { containerId, tail } = data;
    try {
      const container = docker.getContainer(containerId);
      const stream = await new Promise((resolve, reject) => {
        container.logs({ follow: true, stdout: true, stderr: true, tail: tail || 100, timestamps: true },
          (err, s) => err ? reject(err) : resolve(s));
      });

      logStreams.set(client.id, stream);

      // Demux Docker stream
      docker.modem.demuxStream(stream,
        { write: (chunk) => client.emit('logs:data', { type: 'stdout', text: chunk.toString('utf8') }) },
        { write: (chunk) => client.emit('logs:data', { type: 'stderr', text: chunk.toString('utf8') }) },
      );

      stream.on('end', () => { client.emit('logs:end'); logStreams.delete(client.id); });
      client.emit('logs:ready');
    } catch (err) {
      client.emit('logs:error', err.message);
    }
  });

  client.on('logs:stop', () => {
    const stream = logStreams.get(client.id);
    if (stream) { try { stream.destroy(); } catch (_) {} logStreams.delete(client.id); }
  });
});

server.listen(PORT, () => {
  console.log(`SwarmUI Agent v2.0 listening on :${PORT}`);
  console.log(`  Docker socket: ${DOCKER_SOCKET}`);
  console.log(`  TTY support: socket.io /docker namespace`);
});
