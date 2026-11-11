
import { useEffect, useState } from 'react';
import styled from 'styled-components';

type WifiNetwork = {
  ssid: string;
  signal: number;
  secure: boolean;
  connected: boolean;
  security: string;
};

type WifiStatus = {
  connected: boolean;
  ssid: string | null;
  ip: string | null;
};

const Panel = styled.div`
  background: white;
  border: 1px solid #e8ecf1;
  border-radius: 18px;
  box-shadow: 0 12px 40px rgba(25, 40, 70, 0.045);
  overflow: hidden;

  @media (max-width: 600px) {
    border: none;
    border-radius: 0;
    box-shadow: none;
  }
`;

const NetworkButton = styled.button<{ $active?: boolean; $selected?: boolean }>`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  text-align: left;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s;

  background: ${({ $active, $selected }) =>
    $active || $selected ? '#eff6ff' : 'transparent'};

  border: 1px solid ${({ $active, $selected }) =>
    $active || $selected ? '#dbeafe' : 'transparent'};

  &:hover {
    background: #f1f5f9;
  }
`;

const PrimaryButton = styled.button`
  background: #1677e8;
  color: white;
  padding: 11px 24px;
  border-radius: 9px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: #1167cd;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

function WifiIcon({ signal = 100 }: { signal?: number }) {
  return (
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      {signal >= 65 && (
        <path d="M2 8.5a15 15 0 0 1 20 0" />
      )}

      {signal >= 35 && (
        <path d="M5.5 12a10 10 0 0 1 13 0" />
      )}

      <path d="M9 15.5a5 5 0 0 1 6 0" />

      <circle
        cx="12"
        cy="19"
        r="1"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

export default function Main() {
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [status, setStatus] = useState<WifiStatus | null>(null);
  const [selected, setSelected] = useState<WifiNetwork | null>(null);

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [message, setMessage] = useState('');
  const [scanning, setScanning] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);

  const [manualMode, setManualMode] = useState(false);
  const [manualSsid, setManualSsid] = useState('');
  const [manualSecurity, setManualSecurity] = useState('wpa-psk');

  const [connecting, setConnecting] = useState(false);
  const [manualHidden, setManualHidden] = useState(false);

  // --------------------------------------------------
  // 取得目前 Wi-Fi 連線狀態
  // --------------------------------------------------

  async function loadStatus() {
    setStatusLoading(true);

    try {
      const res = await fetch('/api/wifi/status', {
        cache: 'no-store',
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data: WifiStatus = await res.json();

      setStatus(data);
    } catch (error) {
      console.error('Wi-Fi status error:', error);

      setStatus(null);
      setMessage('無法取得目前 Wi-Fi 狀態');
    } finally {
      setStatusLoading(false);
    }
  }

  // --------------------------------------------------
  // 讀取附近 Wi-Fi 清單
  // --------------------------------------------------

  async function scan() {
    setScanning(true);

    try {
      const res = await fetch('/api/wifi/scan', {
        cache: 'no-store',
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data: { networks: WifiNetwork[] } = await res.json();
      // console.log(data)
      setNetworks(data.networks ?? []);
      setMessage('');
    } catch (error) {
      console.error('Wi-Fi scan error:', error);

      setNetworks([]);
      setMessage('無法取得附近 Wi-Fi 清單');
    } finally {
      setScanning(false);
    }
  }

  // --------------------------------------------------
  // 初始化
  // --------------------------------------------------

  useEffect(() => {
    void loadStatus();
    void scan();
  }, []);

  // --------------------------------------------------
  // 選擇 Wi-Fi
  // --------------------------------------------------

  function selectNetwork(network: WifiNetwork) {
    if (network.connected) return;

    setSelected(network);
    setManualMode(false);
    setPassword('');
    setShowPassword(false);
    setMessage('');
  }

  // --------------------------------------------------
  // 連接 Wi-Fi（掃描與手動設定共用）
  // --------------------------------------------------

  
  async function connect() {
    if (connecting) return;

    const ssid = manualMode ? manualSsid : selected?.ssid;
    if (!ssid || !ssid.trim()) {
      setMessage('請選擇或輸入 Wi-Fi 名稱');
      return;
    }

    const security = manualMode
      ? manualSecurity
      : !selected?.secure
        ? 'open'
        : /SAE|WPA3/i.test(selected.security)
          ? 'sae'
          : 'wpa-psk';

    if (new TextEncoder().encode(ssid).length > 32) {
      setMessage('SSID 不可超過 32 bytes');
      return;
    }
    if (security !== 'open' && (password.length < 8 || password.length > 63)) {
      setMessage('Wi-Fi 密碼長度需為 8–63 個字元');
      return;
    }

    setConnecting(true);
    setMessage('正在送出 Wi-Fi 連線設定...');
    let accepted = false;

    try {
      const response = await fetch('/api/wifi/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ssid,
          password: security === 'open' ? '' : password,
          security,
          hidden: manualMode ? manualHidden : false,
        }),
      });

      if (!response.ok) {
        if (response.status === 409) throw new Error('已有 Wi-Fi 連線正在執行');
        throw new Error('無法送出連線設定');
      }

      const data: { jobId?: string } = await response.json();
      if (!data.jobId) throw new Error('連線 API 未回傳工作編號');
      accepted = true;
      setMessage(`正在連接 ${ssid}...`);

      // 網路可能在切換時中斷，不能將 API 暫時失聯視為連線失敗
      for (let i = 0; i < 45; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const result = await fetch(`/api/wifi/connect/${encodeURIComponent(data.jobId)}`, {
          cache: 'no-store',
        });
        if (!result.ok) throw new Error('無法取得連線狀態');

        const job: { state?: string; message?: string } = await result.json();
        if (job.state === 'failed') {
          throw new Error(job.message || 'Wi-Fi 連線失敗');
        }
        if (job.state === 'success') {
          setPassword('');
          setSelected(null);
          setManualMode(false);
          setMessage(`已連接至 ${ssid}`);
          // 成功訊息由 connect 維護，避免 scan() 清除
          await Promise.allSettled([loadStatus(), scan()]);
          setMessage(`已連接至 ${ssid}`);
          return;
        }
      }
      setMessage('連線仍在處理中，請稍後確認設備狀態');
    } catch (error) {
      if (accepted && error instanceof TypeError) {
        setMessage('連線已送出，但管理熱點可能已關閉；請改連新 Wi-Fi 後確認設備狀態。');
      } else {
        setMessage(error instanceof Error ? error.message : 'Wi-Fi 連線失敗');
      }
    } finally {
      setConnecting(false);
    }
  }


  // --------------------------------------------------
  // Render
  // --------------------------------------------------

  return (
    <div className="min-h-screen bg-slate-50 px-5 py-12 text-slate-800 max-sm:bg-white max-sm:p-0">

      <Panel className="mx-auto w-full max-w-[480px]">

        {/* Header */}
        <header className="flex items-center gap-4 border-b border-slate-100 p-7">

          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <WifiIcon />
          </div>

          <div>
            <h1 className="text-xl font-bold">
              Wi-Fi 設定
            </h1>

            <p className="mt-1 text-xs text-slate-400">
              UNO Q · System Control
            </p>
          </div>

        </header>

        {/* Current Wi-Fi */}
        <section className="border-b border-slate-100 p-7">

          <p className="text-sm font-semibold text-slate-500">
            目前連線
          </p>

          <div className="mt-5 flex items-center gap-3">

            <span className="text-blue-600">
              <WifiIcon />
            </span>

            <div className="min-w-0 flex-1">

              <p className="font-semibold">
                {statusLoading
                  ? '讀取中...'
                  : status?.connected
                    ? status.ssid
                    : '未連線'}
              </p>

              <p className="mt-1 text-xs text-slate-400">
                {statusLoading
                  ? '正在取得網路狀態'
                  : status?.connected
                    ? `IP：${status.ip ?? '未知'}`
                    : '請選擇可用網路'}
              </p>

            </div>

            <span
              className={`rounded-full px-3 py-1 text-xs ${
                status?.connected
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {statusLoading
                ? '檢查中'
                : status?.connected
                  ? '已連線'
                  : '離線'}
            </span>

          </div>

        </section>

        {/* Available Networks */}
        <section className="border-b border-slate-100 p-7">

          <div className="mb-4 flex items-center justify-between">

            <p className="text-sm font-semibold text-slate-500">
              可用網路
            </p>

            <button
              type="button"
              className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
              onClick={() => {
                void loadStatus();
                void scan();
              }}
              disabled={scanning}
            >
              {scanning ? '掃描中...' : '重新掃描'}
            </button>

          </div>

          <div style={{height:'200px',overflow:'auto'}} className="flex flex-col gap-1">

            {networks.map(network => (
              <NetworkButton
                type="button"
                key={network.ssid}
                $active={network.connected}
                $selected={selected?.ssid === network.ssid}
                onClick={() => selectNetwork(network)}
              >

                <span
                  className={
                    network.connected
                      ? 'text-blue-600'
                      : 'text-slate-400'
                  }
                >
                  <WifiIcon signal={network.signal} />
                </span>

                <div className="min-w-0 flex-1">

                  <p className="truncate text-sm font-medium">
                    {network.ssid}
                  </p>

                  {network.connected && (
                    <p className="mt-1 text-xs text-blue-600">
                      目前使用中
                    </p>
                  )}

                </div>

                {network.secure && (
                  <span
                    className="text-xs text-slate-400"
                    title={network.security}
                  >
                    🔒
                  </span>
                )}

                <span className="text-xl text-slate-300">
                  ›
                </span>

              </NetworkButton>
            ))}

            {!scanning && networks.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-400">
                目前沒有可用的 Wi-Fi 網路
              </p>
            )}

            {scanning && networks.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-400">
                正在取得 Wi-Fi 清單...
              </p>
            )}

          </div>
          <button
              type="button"
              onClick={() => {
                setManualMode(true);
                setSelected(null);
                setPassword('');
                setManualSsid('');
                setManualHidden(false);
                setShowPassword(false);
                setMessage('');
              }}
              className="mt-4 flex w-full items-center justify-center gap-2
                        rounded-lg border border-dashed border-slate-300
                        px-4 py-3 text-sm text-blue-600
                        hover:border-blue-400 hover:bg-blue-50"
            >
              <span className="text-lg">+</span>
              手動新增 Wi-Fi
            </button>

        </section>

        {/* Wi-Fi Connect */}
        {selected && (
          <section className="border-b border-slate-100 bg-slate-50/60 p-7">

            <p className="text-sm font-semibold">
              連接至 {selected.ssid}
            </p>

            {selected.secure && (
              <div className="mt-4 flex overflow-hidden rounded-lg border border-slate-200 bg-white focus-within:border-blue-500">

                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Wi-Fi 密碼"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="off"
                  className="min-w-0 flex-1 px-4 py-3 text-sm outline-none"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="px-4 text-xs text-blue-600"
                >
                  {showPassword ? '隱藏' : '顯示'}
                </button>

              </div>
            )}

            <div className="mt-5 flex justify-end gap-3">

              <button
                type="button"
                disabled={connecting}
                onClick={() => {
                  setSelected(null);
                  setPassword('');
                }}
                className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm"
              >
                取消
              </button>

              <PrimaryButton
                type="button"
                onClick={() => void connect()}
                disabled={connecting || (selected.secure && password.length < 8)}
              >
                {connecting ? '連線中...' : '連線'}
              </PrimaryButton>

            </div>

          </section>
        )}


{manualMode && (
  <section className="border-b border-slate-100 bg-slate-50/60 p-7">

    <p className="mb-4 text-sm font-semibold">
      手動設定 Wi-Fi
    </p>

    <div className="space-y-4">

      <div>
        <label className="mb-2 block text-xs text-slate-500">
          網路名稱（SSID）
        </label>

        <input
          type="text"
          value={manualSsid}
          onChange={e => setManualSsid(e.target.value)}
          placeholder="輸入 Wi-Fi 名稱"
          maxLength={32}
          className="w-full rounded-lg border border-slate-200
                     bg-white px-4 py-3 text-sm outline-none
                     focus:border-blue-500"
        />
      </div>

      <div>
        <label className="mb-2 block text-xs text-slate-500">
          安全性
        </label>

        <select
          value={manualSecurity}
          onChange={e => setManualSecurity(e.target.value)}
          className="w-full rounded-lg border border-slate-200
                     bg-white px-4 py-3 text-sm outline-none
                     focus:border-blue-500"
        >
          <option value="wpa-psk">WPA/WPA2 Personal</option>
          <option value="sae">WPA3 Personal</option>
          <option value="open">無密碼</option>
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={manualHidden}
          onChange={e => setManualHidden(e.target.checked)}
          className="h-4 w-4"
        />
        隱藏網路（SSID 不廣播）
      </label>

      {manualSecurity !== 'open' && (
              <div>
                <label className="mb-2 block text-xs text-slate-500">
                  Wi-Fi 密碼
                </label>

                <div className="flex overflow-hidden rounded-lg border
                                border-slate-200 bg-white
                                focus-within:border-blue-500">

                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="輸入 Wi-Fi 密碼"
                    autoComplete="off"
                    className="min-w-0 flex-1 px-4 py-3 text-sm outline-none"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="px-4 text-xs text-blue-600"
                  >
                    {showPassword ? '隱藏' : '顯示'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              disabled={connecting}
              onClick={() => {
                setManualMode(false);
                setPassword('');
              }}
              className="rounded-lg border border-slate-200
                        bg-white px-5 py-2.5 text-sm"
            >
              取消
            </button>

            <PrimaryButton
              type="button"
              disabled={
                connecting ||
                !manualSsid.trim() ||
                (manualSecurity !== 'open' && password.length < 8)
              }
              onClick={() => void connect()}
            >
              {connecting ? '連線中...' : '連線'}
            </PrimaryButton>
          </div>
        </section>
      )}

        {/* Message */}
        {message && (
          <div className="bg-slate-50 px-7 py-4 text-xs text-slate-500">
            {message}
          </div>
        )}

        {/* Footer */}
        <footer className="p-5 text-center text-xs text-slate-300">
          UNO Q · System Control
        </footer>

      </Panel>

    </div>
  );
}
