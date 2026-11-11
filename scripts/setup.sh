#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
    echo "Please run with sudo"
    exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NETWORK_SERVICE="unoq-system-control-network"
NETWORK_SERVICE_FILE="/etc/systemd/system/${NETWORK_SERVICE}.service"

WEB_SERVICE="unoq-system-control"
WEB_SERVICE_FILE="/etc/systemd/system/${WEB_SERVICE}.service"

SERVICES=("$NETWORK_SERVICE" "$WEB_SERVICE")

# 檢查檔案
for file in \
    "$ROOT/.env" \
    "$ROOT/scripts/init-ap.sh" \
    "$ROOT/scripts/network-monitor.sh" \
    "$ROOT/scripts/wifi-connect.js"; do

    if [[ ! -f "$file" ]]; then
        echo "Missing: $file"
        exit 1
    fi
done

# 確認必要工具
for cmd in nmcli ip systemctl; do
    command -v "$cmd" >/dev/null || {
        echo "Missing command: $cmd"
        exit 1
    }
done

# iw 不存在時才安裝
if [[ ! -x /usr/sbin/iw ]]; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive \
        apt-get install -y --no-install-recommends iw
fi

# 檢查 Shell 語法
bash -n "$ROOT/scripts/init-ap.sh"
bash -n "$ROOT/scripts/network-monitor.sh"

# 建置前端（以 arduino 使用者執行）
echo "Building frontend..."

if [[ ! -d "$ROOT/frontend/node_modules" ]]; then
    sudo -u arduino bash -c 'cd "$1" && npm ci' _ "$ROOT/frontend"
fi

sudo -u arduino bash -c 'cd "$1" && npm run build' _ "$ROOT/frontend"

chmod 600 "$ROOT/.env"
chmod +x "$ROOT/scripts/"*.sh

# 移除舊的 AP 常駐服務
if systemctl list-unit-files system-control-ap.service \
    --no-legend | grep -q '^system-control-ap.service'; then

    systemctl disable --now system-control-ap.service
fi

# 禁止 NetworkManager 自行啟動 AP
if nmcli connection show system-control-ap >/dev/null 2>&1; then
    nmcli connection modify system-control-ap \
        connection.autoconnect no
fi

# 建立網路管理服務（root）
cat > "$NETWORK_SERVICE_FILE" <<EOF
[Unit]
Description=UNO Q System Control Network Manager
Wants=NetworkManager.service
After=NetworkManager.service

[Service]
Type=simple
ExecStart=/bin/bash $ROOT/scripts/network-monitor.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# 建立 Node.js Web Server 服務
cat > "$WEB_SERVICE_FILE" <<EOF
[Unit]
Description=UNO Q System Control Web Server
Wants=NetworkManager.service
After=NetworkManager.service

[Service]
Type=simple
User=arduino
WorkingDirectory=$ROOT
EnvironmentFile=$ROOT/.env
ExecStart=/usr/bin/node $ROOT/backend/server.js

AmbientCapabilities=CAP_NET_BIND_SERVICE

Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF


# 安裝 Wi-Fi Helper
install -o root -g root -m 755 \
    "$ROOT/scripts/wifi-connect.js" \
    /usr/local/libexec/system-control-wifi-connect

# 設定免密碼執行權限
cat > /etc/sudoers.d/system-control-wifi <<'EOF'
arduino ALL=(root) NOPASSWD: /usr/bin/node /usr/local/libexec/system-control-wifi-connect
EOF

chmod 440 /etc/sudoers.d/system-control-wifi

# 驗證 sudoers
visudo -cf /etc/sudoers.d/system-control-wifi

systemctl daemon-reload
systemctl enable "${SERVICES[@]}"
systemctl restart "${SERVICES[@]}"

echo ""
echo "UNO Q System Control setup completed."
echo ""

systemctl --no-pager --full status "${SERVICES[@]}"
nmcli device status