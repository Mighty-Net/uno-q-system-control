#!/usr/bin/node

const fs = require('node:fs/promises');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { randomUUID } = require('node:crypto');

const exec = promisify(execFile);

const NMCLI = '/usr/bin/nmcli';
const PROFILE_DIR = '/etc/NetworkManager/system-connections';
const WIFI_IF = 'wlan0';
const AP_PROFILE = 'system-control-ap';

function escapeValue(value) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n');
}

async function run(args) {
  return exec(NMCLI, args, {
    timeout: 90000,
    maxBuffer: 1024 * 1024
  });
}

function validateWifi({ ssid, password, security, hidden }) {
  if (
    typeof ssid !== 'string' ||
    Buffer.byteLength(ssid, 'utf8') < 1 ||
    Buffer.byteLength(ssid, 'utf8') > 32 ||
    /[\r\n\0]/.test(ssid)
  ) {
    throw new Error('Invalid SSID');
  }

  if (
    !['open', 'wpa-psk', 'sae'].includes(security) ||
    typeof password !== 'string' ||
    typeof hidden !== 'boolean'
  ) {
    throw new Error('Invalid Wi-Fi settings');
  }

  if (security === 'open') {
    if (password !== '') {
      throw new Error('Open Wi-Fi must not have a password');
    }
    return;
  }

  const passwordBytes = Buffer.byteLength(password, 'utf8');

  if (
    passwordBytes < 8 ||
    passwordBytes > 63 ||
    /[\r\n\0]/.test(password)
  ) {
    throw new Error('Invalid Wi-Fi password');
  }
}

// 取得所有 Wi-Fi Connection Profile
async function getWifiProfiles() {
  const { stdout } = await run([
    '-t',
    '-f', 'UUID,TYPE',
    'connection', 'show'
  ]);

  return stdout.trim().split('\n')
    .map(line => line.split(':'))
    .filter(fields =>
      fields.length >= 2 &&
      ['wifi', '802-11-wireless'].includes(fields[1])
    )
    .map(fields => fields[0]);
}

// 成功配網後整理既有 Profile
async function cleanupWifiProfiles(currentUuid, currentSsid) {
  const profiles = await getWifiProfiles();

  for (const uuid of profiles) {
    if (uuid === currentUuid) continue;

    const { stdout: nameOutput } = await run([
      '-g', 'connection.id',
      'connection', 'show', 'uuid', uuid
    ]);

    const name = nameOutput.trim();

    // AP Profile 不處理
    if (name === AP_PROFILE) continue;

    const { stdout: ssidOutput } = await run([
      '-g', '802-11-wireless.ssid',
      'connection', 'show', 'uuid', uuid
    ]);

    const ssid = ssidOutput.trim();

    if (ssid === currentSsid) {
      // 同 SSID 的舊 Profile：刪除
      await run([
        'connection', 'delete', 'uuid', uuid
      ]);

    } else {
      // 不同 SSID：保留，但停止自動連線
      await run([
        'connection', 'modify',
        'uuid', uuid,
        'connection.autoconnect', 'no'
      ]);
    }
  }
}

async function main() {
  let input = '';

  for await (const chunk of process.stdin) {
    input += chunk;

    if (Buffer.byteLength(input, 'utf8') > 4096) {
      throw new Error('Request too large');
    }
  }

  const {
    ssid,
    password = '',
    security = 'wpa-psk',
    hidden = false
  } = JSON.parse(input);

  validateWifi({
    ssid,
    password,
    security,
    hidden
  });

  const uuid = randomUUID();
  const profilePath =
    `${PROFILE_DIR}/sc-${uuid}.nmconnection`;

  let content = `
[connection]
id=${escapeValue(ssid)}
uuid=${uuid}
type=wifi
interface-name=${WIFI_IF}
autoconnect=true
autoconnect-priority=20

[wifi]
mode=infrastructure
ssid=${escapeValue(ssid)}
hidden=${hidden}

[ipv4]
method=auto

[ipv6]
method=auto
`.trimStart();

  if (security !== 'open') {
    content += `
[wifi-security]
key-mgmt=${security}
psk=${escapeValue(password)}
`;
  }

  // 建立新的測試 Profile
  await fs.writeFile(profilePath, content, {
    mode: 0o600,
    flag: 'wx'
  });

  try {
    // 載入 Profile
    await run([
      'connection', 'load', profilePath
    ]);

    // 使用指定 UUID 連接 Wi-Fi
    await run([
      '--wait', '75',
      'connection', 'up',
      'uuid', uuid,
      'ifname', WIFI_IF
    ]);

    // 確認 STA 已連線並取得 IP
    const { stdout } = await run([
      '-g',
      'GENERAL.STATE,IP4.ADDRESS',
      'device', 'show', WIFI_IF
    ]);

    const lines = stdout.trim().split('\n');

    if (!lines[0]?.startsWith('100')) {
      throw new Error('Wi-Fi not connected');
    }

    // 確認啟用的是這次建立的 Profile
    const { stdout: activeUuid } = await run([
      '-g', 'GENERAL.CON-UUID',
      'device', 'show', WIFI_IF
    ]);

    if (activeUuid.trim() !== uuid) {
      throw new Error('Unexpected active Wi-Fi profile');
    }

    const ip = lines[1]?.split('/')[0] ?? null;

    // 配網已成功，舊 Profile 清理失敗不影響結果
    try {
      await cleanupWifiProfiles(uuid, ssid);
    } catch (error) {
      console.error('[WiFi Cleanup Error]', {
        message: error.message
      });
    }

    // stdout 只輸出成功結果，供 server.js 解析
    console.log(JSON.stringify({
      success: true,
      ssid,
      ip
    }));

  } catch (error) {
    // 連線失敗：刪除新建的測試 Profile
    await run([
      'connection', 'delete',
      'uuid', uuid
    ]).catch(() => {});

    await fs.unlink(profilePath).catch(() => {});

    throw error;
  }
}

main().catch(error => {
  console.error('[WiFi Helper Error]', {
    message: error.message,
    stderr: error.stderr
  });

  process.exitCode = 1;
});
