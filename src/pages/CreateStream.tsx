import { useState } from 'react';
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from 'wagmi';
import {
  parseUnits,
  formatUnits,
  isAddress,
  parseEventLogs,
  type Abi,
} from 'viem';
import { qdayAevum } from '../wagmi';

const QDAY_CHAIN_ID = qdayAevum.id;
const TUSD8_ADDRESS = '0x456569838f1d43009A91ebA4263147Afd7233483' as const;
const STREAMING_AGENT_ADDRESS = '0xE8Ec4599E43f6d735603e5d7b0d2eB5D49Ec6209' as const;

const ERC20_ABI = [
  { type: 'function', name: 'approve', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint8' }] },
] as const satisfies Abi;

const STREAMING_ABI = [
  { type: 'function', name: 'createStream', stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'deposit', type: 'uint256' },
      { name: 'durationSeconds', type: 'uint256' },
    ], outputs: [{ type: 'uint256' }] },
  { type: 'event', name: 'StreamCreated',
    inputs: [
      { name: 'streamId', type: 'uint256', indexed: true },
      { name: 'sender', type: 'address', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'deposit', type: 'uint256', indexed: false },
      { name: 'startTime', type: 'uint256', indexed: false },
      { name: 'stopTime', type: 'uint256', indexed: false },
    ] },
] as const satisfies Abi;

function shortAddr(a?: string | null) {
  if (!a) return '';
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

interface Props {
  onCreated: (streamId: string, txHash: string) => void;
}

export default function CreateStream({ onCreated }: Props) {
  const { address, isConnected, chain } = useAccount();
  const publicClient = usePublicClient({ chainId: QDAY_CHAIN_ID });

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [duration, setDuration] = useState('60');
  const [status, setStatus] = useState('Fill in the fields and approve.');
  const [statusType, setStatusType] = useState<'info' | 'error' | 'success'>('info');
  const [lastTransaction, setLastTransaction] = useState('');
  const [localBusy, setLocalBusy] = useState(false);

  const onCorrectChain = chain?.id === QDAY_CHAIN_ID;

  const { data: decimalsData } = useReadContract({
    address: TUSD8_ADDRESS, abi: ERC20_ABI,
    functionName: 'decimals', chainId: QDAY_CHAIN_ID,
  });
  const decimals = Number(decimalsData ?? 6);

  const { data: tokenBalanceData, refetch: refetchTokenBalance } = useReadContract({
    address: TUSD8_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
    chainId: QDAY_CHAIN_ID,
  });
  const tokenBalance = (tokenBalanceData ?? 0n) as bigint;
  const tokenBalanceStr = formatUnits(tokenBalance, decimals);

//   const { mutateAsync: writeContractAsync, isPending: isWritePending } =
//     useWriteContract();

  const {
  writeContractAsync,
  isPending: isWritePending,
} = useWriteContract();

  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: lastTransaction as `0x${string}` | undefined,
  });

  const busy = localBusy || isWritePending || isConfirming;

  const say = (msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    setStatus(msg);
    setStatusType(type);
  };

  const previewVestedPerSec =
    amount && Number(amount) > 0 && Number(duration) > 0
      ? (Number(amount) / Number(duration)).toFixed(6)
      : '0';

  const handleCreate = async () => {
    if (busy) return;
    if (!isConnected || !address) return say('Connect your wallet first.', 'error');
    if (!onCorrectChain) return say('Please switch to QDay Aevum Testnet.', 'error');
    if (!isAddress(recipient)) return say('Recipient must be a valid 0x... wallet address.', 'error');
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

      say('Checking tUSD8 balance...');
      await refetchTokenBalance();
      const balance = (await publicClient.readContract({
        address: TUSD8_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [address],
      })) as bigint;
      if (balance < depositAmount) {
        throw new Error(
          `Insufficient tUSD8 balance. You have ${formatUnits(balance, decimals)} tUSD8, need ${formatUnits(depositAmount, decimals)}.`,
        );
      }

      const allowance = (await publicClient.readContract({
        address: TUSD8_ADDRESS, abi: ERC20_ABI, functionName: 'allowance',
        args: [address, STREAMING_AGENT_ADDRESS],
      })) as bigint;

      if (allowance < depositAmount) {
        say('Confirm the tUSD8 approval in your wallet...');
        const approveHash = await writeContractAsync({
          address: TUSD8_ADDRESS, abi: ERC20_ABI, functionName: 'approve',
          args: [STREAMING_AGENT_ADDRESS, depositAmount], chainId: QDAY_CHAIN_ID,
        });
        setLastTransaction(approveHash);
        say('Waiting for approval to be mined...');
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      say('Confirm the stream creation in your wallet...');
      const createHash = await writeContractAsync({
        address: STREAMING_AGENT_ADDRESS, abi: STREAMING_ABI, functionName: 'createStream',
        args: [recipient, depositAmount, BigInt(duration)], chainId: QDAY_CHAIN_ID,
      });
      setLastTransaction(createHash);
      say('Waiting for stream creation to be mined...');
      const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash });

      const events = parseEventLogs({
        abi: STREAMING_ABI, logs: receipt.logs, eventName: 'StreamCreated',
      });
      const match = events.find(
        (e) => e.address.toLowerCase() === STREAMING_AGENT_ADDRESS.toLowerCase(),
      );
      const createdId = match ? (match.args as any).streamId.toString() : null;

      if (createdId) {
        say(`Stream #${createdId} created successfully!`, 'success');
        await refetchTokenBalance();
        onCreated(createdId, createHash);
      } else {
        say(`Transaction confirmed, but stream ID could not be read. Hash: ${createHash}`, 'error');
      }
    } catch (err: any) {
      say(err.shortMessage ?? err.reason ?? err.message ?? 'Transaction failed.', 'error');
    } finally {
      setLocalBusy(false);
    }
  };

  return (
    <div className="page-grid">
      <section className="card">
        <h2>New Stream</h2>
        <div className="form">
          <label>
            Recipient wallet address
            <input
              placeholder="0x... (someone else's wallet, not yours)"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value.trim())}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div className="form-grid">
            <label>
              Amount in tUSD8
              <input
                placeholder="e.g. 0.1"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label>
              Duration (seconds)
              <input
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </label>
          </div>
          <button
            className="btn btn-primary btn-block"
            onClick={handleCreate}
            disabled={busy || !isConnected}
          >
            {busy ? 'Processing...' : 'Approve & Create Stream'}
          </button>
        </div>
      </section>

      <aside className="card card-aside">
        <h2>Preview</h2>

        <div className="stream-info">
          <div className="kv">
            <span>You send</span>
            <span><strong>{amount || '0'} tUSD8</strong></span>
          </div>
          <div className="kv">
            <span>Duration</span>
            <span>{duration || '0'} seconds</span>
          </div>
          <div className="kv">
            <span>Vesting rate</span>
            <span>{previewVestedPerSec} tUSD8 / sec</span>
          </div>
          <div className="kv">
            <span>Recipient</span>
            <span className="mono">{recipient ? shortAddr(recipient) : '-'}</span>
          </div>
          <div className="kv">
            <span>Your balance</span>
            <span><strong>{Number(tokenBalanceStr).toFixed(4)}</strong> tUSD8</span>
          </div>
        </div>

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

        <div className="about-meta">
          <p>
            Recipients withdraw as funds vest. Every second, the unlocked
            balance grows. You can cancel at any time: vested funds stay with
            the recipient, unvested funds return to you.
          </p>
        </div>
      </aside>
    </div>
  );
}