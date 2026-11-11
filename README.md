# System Control

## Purpose

Lightweight system management console for UNO Q based devices.

## Scope

- Wi-Fi configuration
- Device information
- Network status
- System maintenance

## Setup

### 1. Configure environment

```bash
cp .env.example .env
nano .env
```

Set the following values:

```dotenv
AP_SSID=
AP_PASSWD=
SYSTEM_CONTROL_TOKEN=
```

### 2. Run setup

```bash
sudo bash scripts/setup.sh
```

### 3. Verify services

```bash
systemctl status unoq-system-control
systemctl status unoq-system-control-network
```
