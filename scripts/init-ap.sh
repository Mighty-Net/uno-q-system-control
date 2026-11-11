
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

IW="/usr/sbin/iw"
STA_IF="wlan0"
AP_IF="ap0"
CON_NAME="system-control-ap"

[[ $EUID -eq 0 ]] || {
    echo "Please run as root"
    exit 1
}

# 載入設定（只允許可信任的 .env）
source "$ROOT/.env"

: "${AP_SSID:?AP_SSID is required}"
: "${AP_PASSWD:?AP_PASSWD is required}"

if (( ${#AP_PASSWD} < 8 || ${#AP_PASSWD} > 63 )); then
    echo "Invalid AP password length"
    exit 1
fi

# STA 正常連線時，不啟動 AP
if [[ "$(nmcli -g GENERAL.STATE device show "$STA_IF")" == 100* ]]; then
    echo "STA is connected. AP not required."
    exit 0
fi

# AP 已經啟動，不重複初始化
if [[ "$(nmcli -g GENERAL.CONNECTION device show "$AP_IF" 2>/dev/null || true)" == "$CON_NAME" ]]; then
    echo "AP already active."
    exit 0
fi

# 清除殘留的 ap0
if ip link show "$AP_IF" >/dev/null 2>&1; then
    nmcli device disconnect "$AP_IF" || true
    "$IW" dev "$AP_IF" del
fi

# 建立 AP 介面
PHY="$(basename "$(readlink -f "/sys/class/net/$STA_IF/phy80211")")"

"$IW" phy "$PHY" interface add "$AP_IF" type __ap

# 等待 NetworkManager 辨識
READY=false

for ((i=0; i<20; i++)); do
    if nmcli -g GENERAL.DEVICE device show "$AP_IF" >/dev/null 2>&1; then
        READY=true
        break
    fi
    sleep 0.5
done

[[ "$READY" == true ]] || {
    echo "AP interface not detected"
    exit 1
}

nmcli device set "$AP_IF" managed yes

# 取得 STA 永久 MAC，不受 NetworkManager 隨機化影響
STA_MAC="$(ip -d link show "$STA_IF" |
    sed -n 's/.*permaddr \([[:xdigit:]:]*\).*/\1/p')"

if [[ -z "$STA_MAC" ]]; then
    echo "Unable to read permanent STA MAC"
    exit 1
fi

# 產生固定且不同於永久 MAC 的 AP MAC
FIRST="${STA_MAC%%:*}"
PREFIX="$(printf '%02x' "$(( (16#$FIRST | 2) & 254 ))")"
AP_MAC="$PREFIX:${STA_MAC#*:}"

echo "STA permanent MAC: $STA_MAC"
echo "AP configured MAC: $AP_MAC"

# STA 未連線時先使用 2.4GHz Channel 6
BAND="bg"
CHANNEL=6

# 建立或沿用 NetworkManager Profile
if ! nmcli connection show "$CON_NAME" >/dev/null 2>&1; then
    nmcli connection add \
        type wifi \
        ifname "$AP_IF" \
        con-name "$CON_NAME" \
        ssid "$AP_SSID"
fi

nmcli connection modify "$CON_NAME" \
    connection.interface-name "$AP_IF" \
    connection.autoconnect no \
    802-11-wireless.mode ap \
    802-11-wireless.ssid "$AP_SSID" \
    802-11-wireless.band "$BAND" \
    802-11-wireless.channel "$CHANNEL" \
    802-11-wireless.cloned-mac-address "$AP_MAC" \
    wifi-sec.key-mgmt wpa-psk \
    wifi-sec.psk "$AP_PASSWD" \
    ipv4.method shared \
    ipv6.method disabled

nmcli connection up "$CON_NAME" ifname "$AP_IF"

echo "AP started: $AP_SSID"
#802-11-wireless.cloned-mac-address "$AP_MAC" \
