import { useState, useEffect } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract, useSwitchChain } from 'wagmi';
import { formatUnits, type Abi } from 'viem';
import { qdayAevum } from './wagmi';
import { CreateStream, TrackStream, About } from './pages';
import './App.css';

const QDAY_CHAIN_ID = qdayAevum.id;
const TUSD8_ADDRESS = '0x456569838f1d43009A91ebA4263147Afd7233483' as const;

const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint8' }] },
] as const satisfies Abi;

type Tab = 'create' | 'track' | 'about';

function shortAddr(a?: string | null) {
  if (!a) return '';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function App() {
  const { address, isConnected, chain } = useAccount();
  const { switchChain } = useSwitchChain();

  const [tab, setTab] = useState<Tab>('create');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [lastCreatedStreamId, setLastCreatedStreamId] = useState('');

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

  useEffect(() => {
    if (isConnected && !onCorrectChain) {
      try {
        switchChain({ chainId: QDAY_CHAIN_ID });
      } catch { /* noop */ }
    }
  }, [isConnected, onCorrectChain, switchChain]);

  const switchTab = (t: Tab) => {
    setTab(t);
    setMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStreamCreated = (id: string, _txHash: string) => {
    setLastCreatedStreamId(id);
    setTimeout(() => {
      refetchTokenBalance();
      switchTab('track');
    }, 1000);
  };

  return (
    <div className="app">
      {/* ---- NAV (full width) ---- */}
      <nav className="nav">
        <div className="nav-inner">
          <button className="nav-brand" onClick={() => switchTab('create')} aria-label="Home">
            <span className="nav-logo">💸</span>
            <span className="nav-title">
              <span className="nav-title-main">StreamPay AI</span>
              <span className="nav-title-sub">by GIMBLOCKCHAIN</span>
            </span>
          </button>

          <div className="nav-links nav-links-desktop">
            <button className={tab === 'create' ? 'nav-link active' : 'nav-link'} onClick={() => switchTab('create')}>Create</button>
            <button className={tab === 'track'  ? 'nav-link active' : 'nav-link'} onClick={() => switchTab('track')}>Track</button>
            <button className={tab === 'about'  ? 'nav-link active' : 'nav-link'} onClick={() => switchTab('about')}>About</button>
          </div>

          <div className="nav-actions">
            <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
          </div>

          <button
            className="nav-hamburger"
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-label="Menu"
          >
            {mobileNavOpen ? '✕' : '☰'}
          </button>
        </div>

        {mobileNavOpen && (
          <div className="nav-links nav-links-mobile">
            <button className={tab === 'create' ? 'nav-link active' : 'nav-link'} onClick={() => switchTab('create')}>Create</button>
            <button className={tab === 'track'  ? 'nav-link active' : 'nav-link'} onClick={() => switchTab('track')}>Track</button>
            <button className={tab === 'about'  ? 'nav-link active' : 'nav-link'} onClick={() => switchTab('about')}>About</button>
          </div>
        )}
      </nav>

      {/* ---- MAIN (full width, content maxed at 1200px) ---- */}
      <main className="main">
        <div className="page-shell">
          <header className="page-header">
            <h1>
              {tab === 'create' && 'Create a Payment Stream'}
              {tab === 'track'  && 'Track Your Stream'}
              {tab === 'about'  && 'About StreamPay AI'}
            </h1>
            <p className="page-sub">
              {tab === 'create' && 'Approve an exact amount, escrow it, and stream it to a recipient over time.'}
              {tab === 'track'  && 'Monitor unlocked balance and withdraw as funds vest.'}
              {tab === 'about'  && 'Programmable stablecoin streams with controlled AI-agent authorization on QDay Aevum.'}
            </p>
          </header>

          {isConnected && address && (
            <div className="wallet-bar">
              <span className="pill">{onCorrectChain ? '✅ QDay Aevum' : '⚠️ Wrong network'}</span>
              <span className="pill">tUSD8: <strong>{Number(tokenBalanceStr).toFixed(4)}</strong></span>
              <span className="pill pill-mono">{shortAddr(address)}</span>
            </div>
          )}

          {tab === 'create' && <CreateStream onCreated={handleStreamCreated} />}
          {tab === 'track'  && <TrackStream initialStreamId={lastCreatedStreamId} />}
          {tab === 'about'  && <About />}
        </div>
      </main>

      <footer className="app-footer">
        <div className="footer-inner">
          <p>Network: QDay Aevum Testnet · Chain ID 44005 · Token tUSD8</p>
          <p>GIMBLOCKCHAIN StreamPay AI Programmable Stablecoin Payments.</p>
        </div>
      </footer>
    </div>
  );
}