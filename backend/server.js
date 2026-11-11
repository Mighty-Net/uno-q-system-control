const path = require('node:path');
const fs = require('node:fs');
const https = require('node:https');

const DIST_DIR = path.resolve(__dirname, '../frontend/dist');

const HTTP_PORT = 80;
const HTTPS_PORT = 443;

const SSL_KEY = path.resolve(__dirname, 'certs/server.key');
const SSL_CERT = path.resolve(__dirname, 'certs/server.crt');

const express = require('express');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { spawn } = require('node:child_process');
const { randomUUID, timingSafeEqual } = require('node:crypto');

const execFileAsync = promisify(execFile);
const app = express();

const WIFI_IF = 'wlan0';

async function nmcli(args) {
  const { stdout } = await execFileAsync(
    '/usr/bin/nmcli',
    args,
    {
      timeout: 10000,
      maxBuffer: 1024 * 1024
    }
  );

  return stdout.trim();
}

// 處理 nmcli -t 格式中被跳脫的冒號
function parseLine(line) {
  return line
    .split(/(?<!\\):/)
    .map(value =>
      value.replace(/\\([:\\])/g, '$1')
    );
}

// 取得目前 Wi-Fi 狀態
app.get('/api/wifi/status', async (req, res) => {
  try {
    const output = await nmcli([
      '-g',
      'GENERAL.STATE,IP4.ADDRESS',
      'device',
      'show',
      WIFI_IF
    ]);

    const lines = output.split('\n');
    const connected = lines[0]?.startsWith('100') ?? false;

    let ssid = null;

    if (connected) {
      const wifiOutput = await nmcli([
        '-t',
        '-f',
        'IN-USE,SSID',
        'device',
        'wifi',
        'list',
        'ifname',
        WIFI_IF,
        '--rescan',
        'no'
      ]);

      const active = wifiOutput
        .split('\n')
        .map(parseLine)
        .find(fields => fields[0] === '*');

      ssid = active?.[1] || null;
    }

    res.json({
      connected,
      ssid,
      ip: connected ? lines[1]?.split('/')[0] || null : null
    });
  } catch (error) {
    console.error('Wi-Fi status error:', error.message);

    res.status(500).json({
      error: 'Unable to get Wi-Fi status'
    });
  }
});

// 取得附近 Wi-Fi 列表
app.get('/api/wifi/scan', async (req, res) => {
  try {
    const output = await nmcli([
      '-t',
      '-f',
      'IN-USE,SSID,SIGNAL,SECURITY',
      'device',
      'wifi',
      'list',
      'ifname',
      WIFI_IF,
      '--rescan',
      'yes'
    ]);

    const networks = new Map();

    for (const line of output.split('\n')) {
      if (!line) continue;

      const [inUse, ssid, signal, security] =
        parseLine(line);

      if (!ssid || ssid === '--') continue;

      const item = {
        ssid,
        signal: Number(signal) || 0,
        secure: security !== '--' && security !== '',
        connected: inUse === '*',
        security
      };

      const existing = networks.get(ssid);

      if (!existing ||
          item.connected ||
          (!existing.connected && item.signal > existing.signal)) {
        networks.set(ssid, item);
      }
    }

    res.json({
      networks: [...networks.values()].sort(
        (a, b) =>
          Number(b.connected) - Number(a.connected) ||
          b.signal - a.signal
      )
    });
  } catch (error) {
    console.error('Wi-Fi scan error:', error.message);
    res.status(500).json({
      error: 'Unable to scan Wi-Fi networks'
    });
  }
});


const jobs = new Map();
let activeJob = null;

function authorized(req) {
  const expected = process.env.SYSTEM_CONTROL_TOKEN;
  const supplied = req.get('x-system-control-token') || '';

  if (!expected || expected.length < 32) return false;

  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);

  return a.length === b.length && timingSafeEqual(a, b);
}

function requireAdmin(req, res, next) {
  if (!authorized(req)) {
    return res.status(401).json({
      error: 'Unauthorized'
    });
  }

  next();
}

function validateWifi(body) {
  const { ssid, password, security, hidden } = body || {};

  if (
    typeof ssid !== 'string' ||
    Buffer.byteLength(ssid, 'utf8') < 1 ||
    Buffer.byteLength(ssid, 'utf8') > 32 ||
    /[\r\n\0]/.test(ssid)
  ) {
    return false;
  }

  if (
    !['open', 'wpa-psk', 'sae'].includes(security) ||
    typeof password !== 'string' ||
    typeof hidden !== 'boolean'
  ) {
    return false;
  }

  // 開放式 Wi-Fi 不應提供密碼
  if (security === 'open') {
    return password === '';
  }

  // WPA/WPA2/WPA3 passphrase：8～63 bytes
  const passwordBytes = Buffer.byteLength(password, 'utf8');

  if (
    passwordBytes < 8 ||
    passwordBytes > 63 ||
    /[\r\n\0]/.test(password)
  ) {
    return false;
  }

  return true;
}

function executeConnect(jobId, wifi) {
  const child = spawn(
    '/usr/bin/sudo',
    [
      '-n',
      '/usr/bin/node',
      '/usr/local/libexec/system-control-wifi-connect'
    ],
    {
      stdio: ['pipe', 'pipe', 'pipe']
    }
  );

  let stdout = '';
  let stderr = '';
  let spawnError = false;

  child.stdout.on('data', chunk => {
    stdout += chunk.toString();

    if (stdout.length > 4096) {
      stdout = stdout.slice(0, 4096);
    }
  });

  child.stderr.on('data', chunk => {
    stderr += chunk.toString();

    if (stderr.length > 4096) {
      stderr = stderr.slice(0, 4096);
    }
  });

  child.on('error', error => {
    spawnError = true;

    console.error('Wi-Fi helper spawn error:', error.message);

    jobs.set(jobId, {
      state: 'failed',
      message: '無法執行 Wi-Fi 管理程式'
    });

    activeJob = null;
  });

  child.on('close', code => {
    if (spawnError) return;

    if (code === 0) {
      try {
        const result = JSON.parse(stdout.trim());

        jobs.set(jobId, {
          state: 'success',
          message: 'Wi-Fi 連線成功',
          ssid: result.ssid,
          ip: result.ip
        });
      } catch {
        jobs.set(jobId, {
          state: 'failed',
          message: '無法確認連線結果'
        });
      }
    } else {
      console.error('Wi-Fi helper failed:', {
        exitCode: code,
        stderr: stderr.slice(0, 2000)
      });

      jobs.set(jobId, {
        state: 'failed',
        message: 'Wi-Fi 連線失敗，請檢查密碼與訊號'
      });
    }

    activeJob = null;
  });

  // 密碼只透過 stdin 傳入 Helper
  child.stdin.on('error', () => {});
  child.stdin.end(JSON.stringify(wifi));
}

app.use(express.json({ limit: '8kb' }));

app.post('/api/wifi/connect', (req, res) => {
  if (!validateWifi(req.body)) {
    return res.status(400).json({
      error: 'Invalid Wi-Fi settings'
    });
  }

  if (activeJob) {
    return res.status(409).json({
      error: 'A Wi-Fi connection is already in progress'
    });
  }

  const jobId = randomUUID();

  jobs.set(jobId, {
    state: 'connecting',
    message: '正在連接 Wi-Fi'
  });

  activeJob = jobId;

  // 先回應瀏覽器，再開始切換 STA
  res.status(202).json({
    jobId,
    state: 'connecting'
  });

  setTimeout(() => {
    executeConnect(jobId, req.body);
  }, 1500);
});

app.get('/api/wifi/connect/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);

  if (!job) {
    return res.status(404).json({
      error: 'Connection job not found'
    });
  }

  res.json(job);
});

app.use(express.static(DIST_DIR));

// React Router：讓 /wifi 等前端路由可以直接開啟
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) {
    return next();
  }

  res.sendFile(path.join(DIST_DIR, 'index.html'));
});


const sslOptions = {
  key: fs.readFileSync(SSL_KEY),
  cert: fs.readFileSync(SSL_CERT)
};

// HTTPS 443
https.createServer(sslOptions, app)
  .listen(HTTPS_PORT, '0.0.0.0', () => {
    console.log(`HTTPS listening on port ${HTTPS_PORT}`);
  });

// HTTP 80 → HTTPS 443
const redirectApp = express();

redirectApp.use((req, res) => {
  const hostname = req.headers.host?.replace(/:\d+$/, '') || 'unoq.local';

  res.redirect(301, `https://${hostname}${req.originalUrl}`);
});

redirectApp.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`HTTP redirect listening on port ${HTTP_PORT}`);
});
