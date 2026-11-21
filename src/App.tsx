import { useState, useEffect, useCallback } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
  usePublicClient,
} from 'wagmi';
import {
  parseUnits,
  formatUnits,
  isAddress,
  parseEventLogs,
  type Abi,
} from 'viem';
import { qdayAevum } from './wagmi';
import './App.css';

const QDAY_CHAIN_ID = qdayAevum.id;

const TUSD8_ADDRESS =
  '0x456569838f1d43009A91ebA4263147Afd7233483' as const;

const STREAMING_AGENT_ADDRESS =
  '0xE8Ec4599E43f6d735603e5d7b0d2eB5D49Ec6209' as const;

const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
] as const satisfies Abi;

const STREAMING_ABI = [
  {
    type: 'function',
    name: 'createStream',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'deposit', type: 'uint256' },
      { name: 'durationSeconds', type: 'uint256' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'streamId', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'streamId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'cancelStream',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'streamId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'streams',
    stateMutability: 'view',
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
    ],
  },
  {
    type: 'event',
    name: 'StreamCreated',
    inputs: [
      { name: 'streamId', type: 'uint256', indexed: true },
      { name: 'sender', type: 'address', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'deposit', type: 'uint256', indexed: false },
      { name: 'startTime', type: 'uint256', indexed: false },
      { name: 'stopTime', type: 'uint256', indexed: false },
    ],
  },
] as const satisfies Abi;

interface StreamInfo {
  sender: string;
  recipient: string;
  deposit: string;
  withdrawn: string;
  stopTime: number;
  cancelled: boolean;
}

function shortAddr(a?: string | null) {
  if (!a) return '';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function App() {
  const { address, isConnected, chain } = useAccount();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: QDAY_CHAIN_ID });

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [duration, setDuration] = useState('60');

  const [streamId, setStreamId] = useState('');
  const [streamBalance, setStreamBalance] = useState('0');
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);

  const [status, setStatus] = useState('Connect your wallet to begin.');
  const [statusType, setStatusType] = useState<'info' | 'error' | 'success'>('info');
  const [lastTransaction, setLastTransaction] = useState('');
  const [localBusy, setLocalBusy] = useState(false);

  const validStreamId = /^\d+$/.test(streamId);
  const onCorrectChain = chain?.id === QDAY_CHAIN_ID;

  // token decimals
  const { data: decimalsData } = useReadContract({
    address: TUSD8_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'decimals',
    chainId: QDAY_CHAIN_ID,
  });
  const decimals = Number(decimalsData ?? 6);

  // token balance (auto-refresh when account changes)
  const {
    data: tokenBalanceData,
    refetch: refetchTokenBalance,
  } = useReadContract({
    address: TUSD8_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
    chainId: QDAY_CHAIN_ID,
  });
  const tokenBalance = (tokenBalanceData ?? 0n) as bigint;
  const tokenBalanceStr = formatUnits(tokenBalance, decimals);

  // Auto-switch chain
  useEffect(() => {
    if (isConnected && !onCorrectChain) {
      try {
        switchChain({ chainId: QDAY_CHAIN_ID });
      } catch {
        /* noop */
      }
    }
  }, [isConnected, onCorrectChain, switchChain]);

  // Write hooks
  const {
    writeContractAsync,
    data: writeHash,
    isPending: isWritePending,
    error: writeError,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: writeHash });

  useEffect(() => {
    if (writeHash) setLastTransaction(writeHash);
  }, [writeHash]);

  useEffect(() => {
    if (isConfirmed) {
      setStatusType('success');
      setStatus('Transaction confirmed.');
    }
  }, [isConfirmed]);

  useEffect(() => {
    if (writeError) {
      setStatusType('error');
      setStatus((writeError as any).shortMessage ?? writeError.message);
    }
  }, [writeError]);

  const busy = localBusy || isWritePending || isConfirming;

  // helper to set status + type
  const say = (msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    setStatus(msg);
    setStatusType(type);
  };

  // -----------------------------------------------------------------
  // Create stream
  // -----------------------------------------------------------------
  const handleCreateStream = async () => {
    if (busy) return;
    if (!isConnected || !address) return say('Connect your wallet first.', 'error');
    if (!onCorrectChain) return say('Please switch to QDay Aevum Testnet.', 'error');
    if (!isAddress(recipient)) return say('Recipient must be a valid 0x… wallet address.', 'error');
    if (recipient.toLowerCase() === address.toLowerCase())
      return say('Recipient cannot be your own wallet.', 'error');
    if (!/^[1-9]\d*$/.test(duration))
      return say('Duration must be a positive whole number of seconds.', 'error');

    let depositAmount: bigint;
    try {
      depositAmount = parseUnits(amount, decimals);
    } catch {
      return say(`Amount must be a valid number (max ${decimals} decimals).`, 'error');
    }
    if (depositAmount <= 0n) return say('Amount must be greater than zero.', 'error');

    setLocalBusy(true);
    setLastTransaction('');
    try {
      if (!publicClient) throw new Error('RPC not ready, try again.');

      // --- checks ---
      say('Checking tUSD8 balance…');
      await refetchTokenBalance();
      const balance = (await publicClient.readContract({
        address: TUSD8_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      })) as bigint;
      if (balance < depositAmount) {
        throw new Error(
          `Insufficient tUSD8 balance. You have ${formatUnits(balance, decimals)} tUSD8, need ${formatUnits(depositAmount, decimals)}.`,
        );
      }

      const allowance = (await publicClient.readContract({
        address: TUSD8_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address, STREAMING_AGENT_ADDRESS],
      })) as bigint;

      // --- approval (only if needed) ---
      if (allowance < depositAmount) {
        say('Confirm the tUSD8 approval in your wallet…');
        const approveHash = await writeContractAsync({
          address: TUSD8_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [STREAMING_AGENT_ADDRESS, depositAmount],
          chainId: QDAY_CHAIN_ID,
        });
        setLastTransaction(approveHash);
        say('Waiting for approval to be mined…');
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      // --- create stream ---
      say('Confirm the stream creation in your wallet…');
      const createHash = await writeContractAsync({
        address: STREAMING_AGENT_ADDRESS,
        abi: STREAMING_ABI,
        functionName: 'createStream',
        args: [recipient, depositAmount, BigInt(duration)],
        chainId: QDAY_CHAIN_ID,
      });
      setLastTransaction(createHash);
      say('Waiting for stream creation to be mined…');
      const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash });

      const events = parseEventLogs({
        abi: STREAMING_ABI,
        logs: receipt.logs,
        eventName: 'StreamCreated',
      });
      const match = events.find(
        (e) => e.address.toLowerCase() === STREAMING_AGENT_ADDRESS.toLowerCase(),
      );
      const createdId = match ? (match.args as any).streamId.toString() : null;

      if (createdId) {
        setStreamId(createdId);
        setStreamBalance('0');
        say(`✅ Stream #${createdId} created successfully!`, 'success');
        await refetchTokenBalance();
      } else {
        say(
          `Transaction confirmed, but stream ID couldn't be read. Hash: ${createHash}`,
          'error',
        );
      }
    } catch (err: any) {
      say(err.shortMessage ?? err.reason ?? err.message ?? 'Transaction failed.', 'error');
    } finally {
      setLocalBusy(false);
    }
  };

  // -----------------------------------------------------------------
  // Refresh stream
  // -----------------------------------------------------------------
  const refreshStream = useCallback(async () => {
    if (!publicClient || !validStreamId) return;
    try {
      const id = BigInt(streamId);

      const info = (await publicClient.readContract({
        address: STREAMING_AGENT_ADDRESS,
        abi: STREAMING_ABI,
        functionName: 'streams',
        args: [id],
      })) as readonly [
        string,
        string,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        boolean,
      ];

      if (info[0] === '0x0000000000000000000000000000000000000000') {
        setStreamInfo(null);
        setStreamBalance('0');
        say(`Stream #${streamId} does not exist.`, 'error');
        return;
      }

      const rawBalance = (await publicClient.readContract({
        address: STREAMING_AGENT_ADDRESS,
        abi: STREAMING_ABI,
        functionName: 'balanceOf',
        args: [id],
      })) as bigint;

      setStreamInfo({
        sender: info[0],
        recipient: info[1],
        deposit: formatUnits(info[2], decimals),
        withdrawn: formatUnits(info[5], decimals),
        stopTime: Number(info[4]),
        cancelled: info[7],
      });
      setStreamBalance(formatUnits(rawBalance, decimals));
    } catch (err: any) {
      console.error('Stream refresh failed:', err);
    }
  }, [publicClient, streamId, validStreamId, decimals]);

  // -----------------------------------------------------------------
  // Withdraw
  // -----------------------------------------------------------------
  const handleWithdraw = async () => {
    if (busy) return;
    if (!isConnected) return say('Connect your wallet first.', 'error');
    if (!validStreamId) return say('Enter a valid stream ID.', 'error');

    setLocalBusy(true);
    try {
      if (!publicClient) throw new Error('RPC not ready, try again.');

      say('Checking available payment…');
      const available = (await publicClient.readContract({
        address: STREAMING_AGENT_ADDRESS,
        abi: STREAMING_ABI,
        functionName: 'balanceOf',
        args: [BigInt(streamId)],
      })) as bigint;
      if (available === 0n) throw new Error('No unlocked funds available yet.');

      say('Confirm withdrawal in your wallet…');
      const hash = await writeContractAsync({
        address: STREAMING_AGENT_ADDRESS,
        abi: STREAMING_ABI,
        functionName: 'withdraw',
        args: [BigInt(streamId)],
        chainId: QDAY_CHAIN_ID,
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

  // -----------------------------------------------------------------
  // Cancel
  // -----------------------------------------------------------------
  const handleCancel = async () => {
    if (busy) return;
    if (!isConnected) return say('Connect your wallet first.', 'error');
    if (!validStreamId) return say('Enter a valid stream ID.', 'error');

    setLocalBusy(true);
    try {
      if (!publicClient) throw new Error('RPC not ready, try again.');

      say('Confirm cancellation in your wallet…');
      const hash = await writeContractAsync({
        address: STREAMING_AGENT_ADDRESS,
        abi: STREAMING_ABI,
        functionName: 'cancelStream',
        args: [BigInt(streamId)],
        chainId: QDAY_CHAIN_ID,
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

  useEffect(() => {
    if (!validStreamId) return;
    refreshStream();
    const interval = setInterval(refreshStream, 10000);
    return () => clearInterval(interval);
  }, [validStreamId, refreshStream]);

  const isSender =
    !!address && !!streamInfo &&
    streamInfo.sender.toLowerCase() === address.toLowerCase();
  const isRecipient =
    !!address && !!streamInfo &&
    streamInfo.recipient.toLowerCase() === address.toLowerCase();

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>GIMBLOCKCHAIN StreamPay AI</h1>
          <p className="subtitle">Powered by QDay Aevum Testnet</p>
        </div>
        <ConnectButton
          showBalance={false}
          chainStatus="icon"
          accountStatus="address"
        />
      </header>

      {isConnected && address && (
        <div className="wallet-bar">
          <span className="pill">
            {onCorrectChain ? '✅ QDay Aevum' : '⚠️ Wrong network'}
          </span>
          <span className="pill">
            tUSD8 balance: <strong>{Number(tokenBalanceStr).toFixed(4)}</strong>
          </span>
        </div>
      )}

      <div className={`status status-${statusType}`}>{status}</div>

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

      <section className="card">
        <h2>Create a Payment Stream</h2>
        <div className="form">
          <label>
            Recipient wallet address
            <input
              placeholder="0x… (someone else's wallet, not yours)"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value.trim())}
            />
          </label>
          <label>
            Amount in tUSD8
            <input
              placeholder="e.g. 10"
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label>
            Duration in seconds (60 = 1 minute)
            <input
              type="number"
              min="1"
              step="1"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </label>
          <button
            className="btn btn-primary"
            onClick={handleCreateStream}
            disabled={busy || !isConnected}
          >
            {busy ? '⏳ Processing…' : 'Approve & Create Stream'}
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Track Your Payment Stream</h2>

        <div className="form-row">
          <input
            placeholder="Stream ID (e.g. 0)"
            value={streamId}
            onChange={(e) => setStreamId(e.target.value.trim())}
          />
          <button
            className="btn btn-ghost"
            onClick={refreshStream}
            disabled={busy || !validStreamId}
          >
            Refresh
          </button>
        </div>

        {streamInfo && (
          <div className="stream-info">
            <div className="kv"><span>Sender</span><span className="mono">{shortAddr(streamInfo.sender)}</span></div>
            <div className="kv"><span>Recipient</span><span className="mono">{shortAddr(streamInfo.recipient)}</span></div>
            <div className="kv"><span>Deposit</span><span>{streamInfo.deposit} tUSD8</span></div>
            <div className="kv"><span>Withdrawn</span><span>{streamInfo.withdrawn} tUSD8</span></div>
            <div className="kv"><span>Ends</span><span>{new Date(streamInfo.stopTime * 1000).toLocaleString()}</span></div>
            <div className="kv">
              <span>Status</span>
              <span className={streamInfo.cancelled ? 'badge red' : 'badge green'}>
                {streamInfo.cancelled ? 'Cancelled' : 'Active'}
              </span>
            </div>
          </div>
        )}

        <div className="balance-box">
          <span>Unlocked Balance</span>
          <strong>{streamBalance} tUSD8</strong>
        </div>

        <div className="row">
          <button
            className="btn btn-primary"
            onClick={handleWithdraw}
            disabled={busy || !isConnected || !validStreamId || (!!streamInfo && !isRecipient)}
            title={streamInfo && !isRecipient ? 'Only the recipient can withdraw' : undefined}
          >
            {busy ? '⏳ Processing…' : 'Withdraw Available Funds'}
          </button>
          <button
            className="btn btn-danger"
            onClick={handleCancel}
            disabled={
              busy || !isConnected || !validStreamId || !streamInfo || !isSender || streamInfo.cancelled
            }
            title={streamInfo && !isSender ? 'Only the sender can cancel' : undefined}
          >
            {busy ? '⏳ Processing…' : 'Cancel Stream'}
          </button>
        </div>
      </section>

      <footer className="app-footer">
        <p>Network: QDay Aevum Testnet · Chain ID 44005 · Token tUSD8</p>
        <p>GIMBLOCKCHAIN StreamPay AI — Programmable Stablecoin Payments.</p>
      </footer>
    </div>
  );
}

export default App;