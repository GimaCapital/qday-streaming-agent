import { useState, useEffect, useCallback } from 'react';
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from 'wagmi';
import { formatUnits, type Abi } from 'viem';
import { qdayAevum } from '../wagmi';

const QDAY_CHAIN_ID = qdayAevum.id;
const TUSD8_ADDRESS = '0x456569838f1d43009A91ebA4263147Afd7233483' as const;
const STREAMING_AGENT_ADDRESS = '0xE8Ec4599E43f6d735603e5d7b0d2eB5D49Ec6209' as const;

const ERC20_ABI = [
  { type: 'function', name: 'decimals', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint8' }] },
] as const satisfies Abi;

const STREAMING_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'streamId', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'withdraw', stateMutability: 'nonpayable',
    inputs: [{ name: 'streamId', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'cancelStream', stateMutability: 'nonpayable',
    inputs: [{ name: 'streamId', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'streams', stateMutability: 'view',
    inputs: [{ name: 'streamId', type: 'uint256' }],
    outputs: [
      { name: 'sender', type: 'address' },
      { name: 'recipient', type: 'address' },
      { name: 'deposit', type: 'uint256' },
      { name: 'startTime', type: 'uint256' },
      { name: 'stopTime', type: 'uint256' },
      { name: 'withdrawn', type: 'uint256' },
      { name: 'cancelTime', type: 'uint256' },
      { name: 'cancelled', type: 'bool' },
    ] },
] as const satisfies Abi;

interface StreamInfo {
  sender: string;
  recipient: string;
  deposit: string;
  withdrawn: string;
  startTime: number;
  stopTime: number;
  cancelled: boolean;
}

function shortAddr(a?: string | null) {
  if (!a) return '';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

interface Props {
  initialStreamId?: string;
}

export default function TrackStream({ initialStreamId = '' }: Props) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: QDAY_CHAIN_ID });

  const [streamId, setStreamId] = useState(initialStreamId);
  const [streamBalance, setStreamBalance] = useState('0');
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);
  const [status, setStatus] = useState('Enter a stream ID and click Refresh.');
  const [statusType, setStatusType] = useState<'info' | 'error' | 'success'>('info');
  const [lastTransaction, setLastTransaction] = useState('');
  const [localBusy, setLocalBusy] = useState(false);
  const [tick, setTick] = useState(0); // forces re-render for live progress

  const validStreamId = /^\d+$/.test(streamId);

  const { data: decimalsData } = useReadContract({
    address: TUSD8_ADDRESS, abi: ERC20_ABI,
    functionName: 'decimals', chainId: QDAY_CHAIN_ID,
  });
  const decimals = Number(decimalsData ?? 6);

const {
  writeContractAsync,
  isPending: isWritePending,
  error: writeError,
} = useWriteContract();

const { isLoading: isConfirming } = useWaitForTransactionReceipt({
  hash: lastTransaction as `0x${string}` | undefined,
});

  const busy = localBusy || isWritePending || isConfirming;

  const say = (msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    setStatus(msg);
    setStatusType(type);
  };

  useEffect(() => {
    if (initialStreamId) setStreamId(initialStreamId);
  }, [initialStreamId]);

  useEffect(() => {
    if (writeError) {
      setStatusType('error');
      setStatus((writeError as any).shortMessage ?? writeError.message);
    }
  }, [writeError]);

  // 1-second ticker for live progress bar
  useEffect(() => {
    if (!streamInfo || streamInfo.cancelled) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [streamInfo]);

  const refreshStream = useCallback(async () => {
    if (!publicClient || !validStreamId) return;
    try {
      const id = BigInt(streamId);
      const info = (await publicClient.readContract({
        address: STREAMING_AGENT_ADDRESS, abi: STREAMING_ABI,
        functionName: 'streams', args: [id],
      })) as readonly [string, string, bigint, bigint, bigint, bigint, bigint, boolean];

      if (info[0] === '0x0000000000000000000000000000000000000000') {
        setStreamInfo(null);
        setStreamBalance('0');
        say(`Stream #${streamId} does not exist.`, 'error');
        return;
      }

      const rawBalance = (await publicClient.readContract({
        address: STREAMING_AGENT_ADDRESS, abi: STREAMING_ABI,
        functionName: 'balanceOf', args: [id],
      })) as bigint;

      setStreamInfo({
        sender: info[0],
        recipient: info[1],
        deposit: formatUnits(info[2], decimals),
        withdrawn: formatUnits(info[5], decimals),
        startTime: Number(info[3]),
        stopTime: Number(info[4]),
        cancelled: info[7],
      });
      setStreamBalance(formatUnits(rawBalance, decimals));
      say(`Stream #${streamId} loaded.`, 'success');
    } catch (err: any) {
      console.error('Stream refresh failed:', err);
    }
  }, [publicClient, streamId, validStreamId, decimals]);

  useEffect(() => {
    if (!validStreamId) return;
    refreshStream();
    const interval = setInterval(refreshStream, 10000);
    return () => clearInterval(interval);
  }, [validStreamId, refreshStream]);

  const handleWithdraw = async () => {
    if (busy) return;
    if (!isConnected) return say('Connect your wallet first.', 'error');
    if (!validStreamId) return say('Enter a valid stream ID.', 'error');

    setLocalBusy(true);
    try {
      if (!publicClient) throw new Error('RPC not ready, try again.');
      say('Checking available payment…');
      const available = (await publicClient.readContract({
        address: STREAMING_AGENT_ADDRESS, abi: STREAMING_ABI,
        functionName: 'balanceOf', args: [BigInt(streamId)],
      })) as bigint;
      if (available === 0n) throw new Error('No unlocked funds available yet.');

      say('Confirm withdrawal in your wallet…');
      const hash = await writeContractAsync({
        address: STREAMING_AGENT_ADDRESS, abi: STREAMING_ABI,
        functionName: 'withdraw', args: [BigInt(streamId)], chainId: QDAY_CHAIN_ID,
      });
      setLastTransaction(hash);
      say('Waiting for withdrawal to be mined…');
      await publicClient.waitForTransactionReceipt({ hash });
      await refreshStream();
      say('✅ Payment withdrawn successfully!', 'success');
    } catch (err: any) {
      say(err.shortMessage ?? err.reason ?? err.message ?? 'Withdrawal failed.', 'error');
    } finally {
      setLocalBusy(false);
    }
  };

  const handleCancel = async () => {
    if (busy) return;
    if (!isConnected) return say('Connect your wallet first.', 'error');
    if (!validStreamId) return say('Enter a valid stream ID.', 'error');

    setLocalBusy(true);
    try {
      if (!publicClient) throw new Error('RPC not ready, try again.');
      say('Confirm cancellation in your wallet…');
      const hash = await writeContractAsync({
        address: STREAMING_AGENT_ADDRESS, abi: STREAMING_ABI,
        functionName: 'cancelStream', args: [BigInt(streamId)], chainId: QDAY_CHAIN_ID,
      });
      setLastTransaction(hash);
      say('Waiting for cancellation to be mined…');
      await publicClient.waitForTransactionReceipt({ hash });
      await refreshStream();
      say('✅ Stream cancelled. Unvested funds refunded to the sender.', 'success');
    } catch (err: any) {
      say(err.shortMessage ?? err.reason ?? err.message ?? 'Cancellation failed.', 'error');
    } finally {
      setLocalBusy(false);
    }
  };

  const isSender =
    !!address && !!streamInfo &&
    streamInfo.sender.toLowerCase() === address.toLowerCase();
  const isRecipient =
    !!address && !!streamInfo &&
    streamInfo.recipient.toLowerCase() === address.toLowerCase();

  // live progress for the bar
  const now = Math.floor(Date.now() / 1000) + tick * 0;
  const totalDuration = streamInfo
    ? Math.max(streamInfo.stopTime - streamInfo.startTime, 1)
    : 0;
  const elapsed = streamInfo
    ? Math.min(Math.max(now - streamInfo.startTime, 0), totalDuration)
    : 0;
  const progressPct = streamInfo ? (elapsed / totalDuration) * 100 : 0;
  const vestingPerSec =
    streamInfo && totalDuration > 0
      ? Number(streamInfo.deposit) / totalDuration
      : 0;

  return (
    <div className="page-grid">
      {/* ---- LEFT: stream info ---- */}
      <section className="card">
        <h2>Stream Details</h2>

        <div className="form-row">
          <input
            placeholder="Stream ID (e.g. 0)"
            value={streamId}
            onChange={(e) => setStreamId(e.target.value.trim())}
            inputMode="numeric"
          />
          <button
            className="btn btn-ghost"
            onClick={refreshStream}
            disabled={busy || !validStreamId}
          >
            Refresh
          </button>
        </div>

        {streamInfo ? (
          <>
            <div className="stream-info">
              <div className="kv"><span>Sender</span><span className="mono">{shortAddr(streamInfo.sender)}</span></div>
              <div className="kv"><span>Recipient</span><span className="mono">{shortAddr(streamInfo.recipient)}</span></div>
              <div className="kv"><span>Deposit</span><span><strong>{streamInfo.deposit}</strong> tUSD8</span></div>
              <div className="kv"><span>Withdrawn</span><span><strong>{streamInfo.withdrawn}</strong> tUSD8</span></div>
              <div className="kv"><span>Ends</span><span>{new Date(streamInfo.stopTime * 1000).toLocaleString()}</span></div>
              <div className="kv">
                <span>Status</span>
                <span className={streamInfo.cancelled ? 'badge red' : 'badge green'}>
                  {streamInfo.cancelled ? 'Cancelled' : 'Active'}
                </span>
              </div>
            </div>

            <div className="progress-wrap">
              <div className="progress-label">
                <span>Vesting progress</span>
                <span>{progressPct.toFixed(1)}%</span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${Math.min(progressPct, 100)}%` }}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <p>Enter a stream ID above and click <strong>Refresh</strong> to load its details.</p>
          </div>
        )}
      </section>

      {/* ---- RIGHT: actions ---- */}
      <aside className="card card-aside">
        <h2>Actions</h2>

        <div className="balance-box">
          <span>Unlocked Balance</span>
          <strong>{streamBalance} tUSD8</strong>
        </div>

        {streamInfo && (
          <p className="about-meta" style={{ marginTop: 10 }}>
            Vesting <strong>{vestingPerSec.toFixed(6)}</strong> tUSD8/sec.
            {streamInfo.cancelled
              ? ' This stream has been cancelled — remaining vested funds are still withdrawable by the recipient.'
              : ' Recipients withdraw as funds vest. Senders can cancel anytime; unvested funds return to them.'}
          </p>
        )}

        <div className="row row-stack-mobile">
          <button
            className="btn btn-primary btn-block"
            onClick={handleWithdraw}
            disabled={busy || !isConnected || !validStreamId || (!!streamInfo && !isRecipient)}
            title={streamInfo && !isRecipient ? 'Only the recipient can withdraw' : undefined}
          >
            {busy ? '⏳ Processing…' : 'Withdraw'}
          </button>
          <button
            className="btn btn-danger btn-block"
            onClick={handleCancel}
            disabled={busy || !isConnected || !validStreamId || !streamInfo || !isSender || streamInfo.cancelled}
            title={streamInfo && !isSender ? 'Only the sender can cancel' : undefined}
          >
            {busy ? '⏳ Processing…' : 'Cancel'}
          </button>
        </div>

        <div className={`status status-${statusType}`} style={{ marginTop: 16 }}>{status}</div>

        {lastTransaction && (
          <div className="tx-box">
            <span>Latest tx:</span>
            <a
              href={`https://explorer-test.qday.info/tx/${lastTransaction}`}
              target="_blank"
              rel="noreferrer"
              className="mono"
            >
              {shortAddr(lastTransaction)}
            </a>
          </div>
        )}
      </aside>
    </div>
  );
}