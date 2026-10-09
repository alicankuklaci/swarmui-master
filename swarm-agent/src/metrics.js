// Metrics endpoints for SwarmUI monitoring (Part B)
// Exposes GET /metrics/node and GET /metrics/containers behind the agent's
// existing auth middleware. Node metrics come from Node's `os` module +
// `/proc` reads; container metrics come from dockerode stats.
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

// ─── CPU helpers ────────────────────────────────────────────────────────────

let lastCpuSample = null;

function sampleCpuTotals() {
  const cpus = os.cpus() || [];
  let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;
  for (const c of cpus) {
    user += c.times.user;
    nice += c.times.nice;
    sys += c.times.sys;
    idle += c.times.idle;
    irq += c.times.irq;
  }
  return { user, nice, sys, idle, irq, total: user + nice + sys + idle + irq };
}

function cpuUsagePct() {
  const now = sampleCpuTotals();
  if (!lastCpuSample) {
    lastCpuSample = now;
    return 0;
  }
  const totalDiff = now.total - lastCpuSample.total;
  const idleDiff = now.idle - lastCpuSample.idle;
  lastCpuSample = now;
  if (totalDiff <= 0) return 0;
  return Math.max(0, Math.min(100, ((totalDiff - idleDiff) / totalDiff) * 100));
}

// Prime the CPU sampler at module load so the first request returns a value.
sampleCpuTotals();

// ─── Disk helpers ───────────────────────────────────────────────────────────

function parseDfOutput(txt) {
  const lines = txt.trim().split(/\n+/).slice(1);
  const out = [];
  const seen = new Set();
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) continue;
    const [fs, totalK, usedK, _availK, _pct, mount] = parts;
    if (!mount || seen.has(mount)) continue;
    // Skip pseudo filesystems and common container overlays.
    if (/^(tmpfs|devtmpfs|overlay|shm|nsfs|cgroup2?)$/.test(fs)) continue;
    if (/^\/(sys|proc|dev|run)/.test(mount)) continue;
    seen.add(mount);
    const total = Number(totalK) * 1024;
    const used = Number(usedK) * 1024;
    if (!total) continue;
    out.push({
      mount,
      usedBytes: used,
      totalBytes: total,
      usedPct: total > 0 ? (used / total) * 100 : 0,
    });
  }
  return out;
}

function readDisk() {
  try {
    const txt = execSync('df -kP 2>/dev/null', { encoding: 'utf8', timeout: 2000 });
    return parseDfOutput(txt);
  } catch (_) {
    return [];
  }
}

// ─── Network helpers ────────────────────────────────────────────────────────

let lastNetSample = null;

function readNetTotals() {
  try {
    const txt = fs.readFileSync('/proc/net/dev', 'utf8');
    const lines = txt.split('\n').slice(2);
    let rx = 0, tx = 0;
    for (const line of lines) {
      const m = line.trim().match(/^([^:]+):\s+(.+)$/);
      if (!m) continue;
      const iface = m[1].trim();
      if (iface === 'lo' || iface.startsWith('docker') || iface.startsWith('veth') || iface.startsWith('br-')) continue;
      const fields = m[2].trim().split(/\s+/).map(Number);
      // 0=rx bytes, 8=tx bytes
      rx += fields[0] || 0;
      tx += fields[8] || 0;
    }
    return { rx, tx, ts: Date.now() };
  } catch (_) {
    return { rx: 0, tx: 0, ts: Date.now() };
  }
}

function netBps() {
  const now = readNetTotals();
  if (!lastNetSample) {
    lastNetSample = now;
    return { rxBps: 0, txBps: 0 };
  }
  const dt = Math.max(1, (now.ts - lastNetSample.ts) / 1000);
  const rxBps = Math.max(0, (now.rx - lastNetSample.rx) / dt);
  const txBps = Math.max(0, (now.tx - lastNetSample.tx) / dt);
  lastNetSample = now;
  return { rxBps, txBps };
}

readNetTotals(); // prime

// ─── Container stats ────────────────────────────────────────────────────────

function calcCpuPct(stats) {
  const cpuDelta = (stats.cpu_stats?.cpu_usage?.total_usage || 0) -
                   (stats.precpu_stats?.cpu_usage?.total_usage || 0);
  const sysDelta = (stats.cpu_stats?.system_cpu_usage || 0) -
                   (stats.precpu_stats?.system_cpu_usage || 0);
  // online_cpus falls back to per_cpu_usage.length (older docker versions).
  const onlineCpus = stats.cpu_stats?.online_cpus ||
                     stats.cpu_stats?.cpu_usage?.percpu_usage?.length || 1;
  if (cpuDelta > 0 && sysDelta > 0) {
    return (cpuDelta / sysDelta) * onlineCpus * 100;
  }
  return 0;
}

function calcMem(stats) {
  const used = (stats.memory_stats?.usage || 0) - (stats.memory_stats?.stats?.cache || 0);
  const limit = stats.memory_stats?.limit || 0;
  return {
    memUsedBytes: Math.max(0, used),
    memLimitBytes: limit,
    memUsedPct: limit > 0 ? (used / limit) * 100 : 0,
  };
}

function calcNet(stats) {
  const nets = stats.networks || {};
  let rx = 0, tx = 0;
  for (const k of Object.keys(nets)) {
    rx += nets[k].rx_bytes || 0;
    tx += nets[k].tx_bytes || 0;
  }
  // Note: this is cumulative since container start, not per-second. The
  // backend turns it into Bps using the delta between consecutive samples.
  return { netRxBytes: rx, netTxBytes: tx };
}

function calcBlkio(stats) {
  const entries = stats.blkio_stats?.io_service_bytes_recursive || [];
  let read = 0, write = 0;
  for (const e of entries) {
    if (e.op === 'Read' || e.op === 'read') read += e.value || 0;
    else if (e.op === 'Write' || e.op === 'write') write += e.value || 0;
  }
  return { blkioReadBytes: read, blkioWriteBytes: write };
}

async function collectContainerMetrics(docker) {
  const list = await docker.listContainers({ all: false });
  const results = await Promise.all(list.map(async (c) => {
    try {
      const container = docker.getContainer(c.Id);
      const stats = await container.stats({ stream: false });
      const mem = calcMem(stats);
      const net = calcNet(stats);
      const blk = calcBlkio(stats);
      const labels = c.Labels || {};
      return {
        id: c.Id,
        name: (c.Names && c.Names[0] ? c.Names[0] : '').replace(/^\//, ''),
        image: c.Image,
        state: c.State,
        stackName: labels['com.docker.stack.namespace'] || null,
        serviceId: labels['com.docker.swarm.service.id'] || labels['com.docker.swarm.service.name'] || null,
        cpuPct: calcCpuPct(stats),
        memUsedBytes: mem.memUsedBytes,
        memLimitBytes: mem.memLimitBytes,
        memUsedPct: mem.memUsedPct,
        netRxBytes: net.netRxBytes,
        netTxBytes: net.netTxBytes,
        blkioReadBytes: blk.blkioReadBytes,
        blkioWriteBytes: blk.blkioWriteBytes,
      };
    } catch (err) {
      return { id: c.Id, name: (c.Names && c.Names[0] ? c.Names[0] : '').replace(/^\//, ''), error: err.message };
    }
  }));
  return results;
}

async function collectNodeMetrics(docker) {
  const mem = { totalBytes: os.totalmem(), freeBytes: os.freemem() };
  mem.usedBytes = mem.totalBytes - mem.freeBytes;
  mem.usedPct = mem.totalBytes > 0 ? (mem.usedBytes / mem.totalBytes) * 100 : 0;

  let running = 0, stopped = 0, total = 0;
  try {
    const info = await docker.info();
    running = info.ContainersRunning || 0;
    stopped = (info.Containers || 0) - running;
    total = info.Containers || 0;
  } catch (_) { /* ignore — agent still returns host stats */ }

  return {
    cpu: {
      usagePct: cpuUsagePct(),
      cores: os.cpus()?.length || 1,
      loadavg: os.loadavg(),
    },
    mem: {
      usedBytes: mem.usedBytes,
      totalBytes: mem.totalBytes,
      usedPct: mem.usedPct,
    },
    disk: readDisk(),
    net: netBps(),
    containers: { running, stopped, total },
    ts: new Date().toISOString(),
    hostname: os.hostname(),
    uptime: os.uptime(),
  };
}

function register(app, docker) {
  app.get('/metrics/node', async (_req, res) => {
    try {
      const payload = await collectNodeMetrics(docker);
      res.json(payload);
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/metrics/containers', async (_req, res) => {
    try {
      const data = await collectContainerMetrics(docker);
      res.json({ containers: data, ts: new Date().toISOString() });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });
}

module.exports = { register };
