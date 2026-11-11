
#!/usr/bin/env bash
set -uo pipefail

STA_IF="wlan0"
AP_IF="ap0"
MONITOR="unoq-system-control-network"
IW="/usr/sbin/iw"

log() {
    echo "[$(date '+%F %T')] $*"
}

# 記錄測試前正在使用的 Wi-Fi Profile
STA_UUID="$(
    nmcli -g GENERAL.CON-UUID device show "$STA_IF" \
    2>/dev/null | head -n 1
)"

if [[ -z "$STA_UUID" || "$STA_UUID" == "--" ]]; then
    log "ERROR: No active STA connection. Test cancelled."
    exit 1
fi

if ! systemctl is-active --quiet "$MONITOR"; then
    log "ERROR: Network Monitor is not active."
    exit 1
fi

restore() {
    trap - EXIT INT TERM

    log "RESTORE: Starting recovery"

    # 防止 Monitor 在恢復 STA 時重新建立 AP
    systemctl stop "$MONITOR"

    if ip link show "$AP_IF" >/dev/null 2>&1; then
        nmcli connection down system-control-ap \
            >/dev/null 2>&1 || true

        "$IW" dev "$AP_IF" del \
            >/dev/null 2>&1 || true
    fi

    # 使用測試前的 UUID 恢復連線
    local success=false

    for i in 1 2 3; do
        log "RESTORE: Connecting STA, attempt $i"

        if nmcli --wait 25 connection up \
            uuid "$STA_UUID" ifname "$STA_IF"; then
            success=true
            break
        fi

        sleep 5
    done

    systemctl start "$MONITOR"

    if [[ "$success" == true ]]; then
        log "RESTORE: STA connected successfully"
    else
        log "RESTORE: STA recovery failed"
        log "Network Monitor restarted for AP fallback"
    fi

    log "TEST FINISHED"
}

trap restore EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

log "TEST START"
log "Original STA UUID: $STA_UUID"

# 留時間讓測試工作獨立啟動
sleep 10

log "TEST: Disconnecting wlan0"
nmcli device disconnect "$STA_IF"

# 等待 Monitor 自動啟動 AP
log "TEST: Waiting 35 seconds for AP"
sleep 35

log "TEST: Checking AP state"

nmcli device status
"$IW" dev

if ip link show "$AP_IF" >/dev/null 2>&1; then
    AP_CONNECTION="$(
        nmcli -g GENERAL.CONNECTION \
        device show "$AP_IF" 2>/dev/null || true
    )"

    AP_MAC="$(cat "/sys/class/net/$AP_IF/address")"

    log "AP connection: $AP_CONNECTION"
    log "AP actual MAC: $AP_MAC"

    if [[ "$AP_CONNECTION" == "system-control-ap" ]]; then
        log "RESULT: AP SUCCESS"
    else
        log "RESULT: AP FAILED (not activated)"
    fi
else
    log "RESULT: AP FAILED (interface missing)"
fi

# 離開時由 trap 自動執行 restore
