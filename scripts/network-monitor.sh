
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

STA_IF="wlan0"
AP_IF="ap0"
CON_NAME="system-control-ap"
IW="/usr/sbin/iw"

stop_ap() {
    if ip link show "$AP_IF" >/dev/null 2>&1; then
        nmcli device disconnect "$AP_IF" || true
        "$IW" dev "$AP_IF" del
    fi
}

# 服務啟動時先給 STA 一段自動連線時間
sleep 30

while true; do
    STA_STATE="$(
        nmcli -g GENERAL.STATE device show "$STA_IF" 2>/dev/null || true
    )"

    if [[ "$STA_STATE" == 100* ]]; then
        # STA 正常：停止 AP
        if ip link show "$AP_IF" >/dev/null 2>&1; then
            echo "STA connected. Stopping AP..."
            stop_ap
        fi
    else
        # STA 未連線：啟動 AP
        AP_CONNECTION="$(
            nmcli -g GENERAL.CONNECTION \
                device show "$AP_IF" 2>/dev/null || true
        )"

        if [[ "$AP_CONNECTION" != "$CON_NAME" ]]; then
            echo "STA disconnected. Starting AP..."
            bash "$ROOT/scripts/init-ap.sh" || true
        fi
    fi

    sleep 10
done
