// qday-streaming-agent/src/App.tsx
import { useState, useEffect, useRef } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract, useSwitchChain } from 'wagmi';
import { formatUnits, type Abi } from 'viem';
import { qdayAevum } from './wagmi';
import { CreateStream, TrackStream, About } from './pages';
import './App.css';

const QDAY_CHAIN_ID = qdayAevum.id;
const TUSD8_ADDRESS = '0x456569838f1d43009A91ebA4263147Afd7233483' as const;
const DEMO_VIDEO_URL = 'https://youtu.be/SYJvHg6HocQ';

const ERC20_ABI = [
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

  const formAnchorRef = useRef<HTMLDivElement | null>(null);
  const trackAnchorRef = useRef<HTMLDivElement | null>(null);

  const onCorrectChain = chain?.id === QDAY_CHAIN_ID;

  const { data: decimalsData } = useReadContract({
    address: TUSD8_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'decimals',
    chainId: QDAY_CHAIN_ID,
  });

  const decimals = Number(decimalsData ?? 6);

  const { data: tokenBalanceData, refetch: refetchTokenBalance } = useReadContract({
    address: TUSD8_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
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
      } catch {
        /* noop */
      }
    }
  }, [isConnected, onCorrectChain, switchChain]);

  const switchTab = (t: Tab) => {
    setTab(t);
    setMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToForm = () => {
    formAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleStreamCreated = (id: string, _txHash: string) => {
    setLastCreatedStreamId(id);

    setTimeout(() => {
      refetchTokenBalance();
      setTab('track');
      setTimeout(() => {
        trackAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }, 1000);
  };

  return (
    <div className="app">

      {/* NAVIGATION */}
      <nav className="nav">
        <div className="nav-inner">

          <button
            className="nav-brand"
            onClick={() => switchTab('create')}
            aria-label="Home"
          >
            <img
              src="/AI-logo.jpg"
              alt="StreamPay AI Logo"
              className="nav-brand-image"
            />
            <span className="nav-title">
              <span className="nav-title-main">StreamPay AI</span>
              <span className="nav-title-sub">by GIMBLAB</span>
            </span>
          </button>

          <div className="nav-links nav-links-desktop">
            <button
              className={tab === 'create' ? 'nav-link active' : 'nav-link'}
              onClick={() => switchTab('create')}
            >
              Create
            </button>
            <button
              className={tab === 'track' ? 'nav-link active' : 'nav-link'}
              onClick={() => switchTab('track')}
            >
              Track
            </button>
            <button
              className={tab === 'about' ? 'nav-link active' : 'nav-link'}
              onClick={() => switchTab('about')}
            >
              About
            </button>
            <a
              className="nav-link nav-link-demo"
              href={DEMO_VIDEO_URL}
              target="_blank"
              rel="noreferrer"
              title="Watch the 3-minute demo"
            >
              ▶ Demo
            </a>
          </div>

          <div className="nav-actions">
            <ConnectButton
              showBalance={false}
              chainStatus="icon"
              accountStatus="address"
            />
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
            <button
              className={tab === 'create' ? 'nav-link active' : 'nav-link'}
              onClick={() => switchTab('create')}
            >
              Create
            </button>
            <button
              className={tab === 'track' ? 'nav-link active' : 'nav-link'}
              onClick={() => switchTab('track')}
            >
              Track
            </button>
            <button
              className={tab === 'about' ? 'nav-link active' : 'nav-link'}
              onClick={() => switchTab('about')}
            >
              About
            </button>
            <a
              className="nav-link"
              href={DEMO_VIDEO_URL}
              target="_blank"
              rel="noreferrer"
            >
              ▶ Watch Demo
            </a>
          </div>
        )}
      </nav>

      {/* MAIN CONTENT */}
      <main className="main">
        <div className="page-shell">

          {/* CREATE PAGE HERO */}
          {tab === 'create' && (
            <section className="ai-hero">

              {/* LEFT: HERO IMAGE */}
              <div className="ai-hero-visual">
                <div className="hero-glow" />
                <img
                  src="/AI1.jpg"
                  alt="StreamPay AI programmable payment technology"
                  className="hero-image"
                />
                <div className="hero-image-label">
                  <span className="live-dot" />
                  AI PAYMENT INFRASTRUCTURE
                </div>
              </div>

              {/* RIGHT: HERO CONTENT */}
              <div className="ai-hero-content">

                <div className="hero-eyebrow">
                  <span className="eyebrow-line" />
                  THE FUTURE OF PROGRAMMABLE PAYMENTS
                </div>

                <h1>
                  Payments That
                  <span className="gradient-text">
                    {' '}Flow Intelligently.
                  </span>
                </h1>

                <p className="hero-description">
                  Meet a smarter way to move money. StreamPay AI combines
                  programmable stablecoin payments, automated streaming
                  and controlled AI-agent authorization on QDay.
                </p>

                {/* NEW: primary CTAs so the judge has zero friction */}
                <div className="hero-cta-row">
                  <button
                    className="btn btn-primary hero-cta-primary"
                    onClick={scrollToForm}
                  >
                    Launch App →
                  </button>
                  <a
                    className="btn btn-ghost hero-cta-secondary"
                    href={DEMO_VIDEO_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    ▶ Watch 3-min demo
                  </a>
                </div>

                <div className="hero-features">
                  <div className="hero-feature">
                    <span className="feature-icon">◈</span>
                    <div>
                      <strong>Intelligent Authorization</strong>
                      <span>Controlled AI-agent payment permissions</span>
                    </div>
                  </div>

                  <div className="hero-feature">
                    <span className="feature-icon">↗</span>
                    <div>
                      <strong>Programmable Money</strong>
                      <span>Schedule and stream stablecoin payments</span>
                    </div>
                  </div>

                  <div className="hero-feature">
                    <span className="feature-icon">⌁</span>
                    <div>
                      <strong>On-chain Transparency</strong>
                      <span>Track payment streams and withdrawals</span>
                    </div>
                  </div>

                  <div className="hero-feature">
                    <span className="feature-icon">💸</span>
                    <div>
                      <strong>Intelligent Money Flow</strong>
                      <span>Automate and manage programmable stablecoin payments</span>
                    </div>
                  </div>
                </div>

                <div className="hero-bottom-line">
                  <span className="hero-status-dot" />
                  POWERED BY QDAY AEVUM
                  <span className="hero-divider">/</span>
                  BUILT BY GIMBLAB
                </div>

              </div>
            </section>
          )}

          {/* TRACK PAGE HEADER */}
          {tab === 'track' && (
            <header className="page-header">
              <h1>Track Your Stream</h1>
              <p className="page-sub">
                Monitor unlocked balance and withdraw as funds vest.
              </p>
            </header>
          )}

          {/* ABOUT PAGE HEADER */}
          {tab === 'about' && (
            <>
              <header className="page-header">
                <h1>About StreamPay AI</h1>
                <p className="page-sub">
                  Programmable stablecoin streams with controlled
                  AI-agent authorization on QDay Aevum.
                </p>
              </header>
              <section className="about-image-section">
                <img
                  src="/AI2.jpg"
                  alt="StreamPay AI technology"
                  className="about-image"
                />
              </section>
            </>
          )}

          {/* CONNECTED WALLET INFORMATION */}
          {isConnected && address && (
            <div className="wallet-bar">
              <span className="pill">
                {onCorrectChain ? '✅ QDay Aevum' : '⚠️ Wrong network'}
              </span>
              <span className="pill">
                tUSD8: <strong>{Number(tokenBalanceStr).toFixed(4)}</strong>
              </span>
              <span className="pill pill-mono">{shortAddr(address)}</span>
            </div>
          )}

          {/* APPLICATION PAGES */}
          {tab === 'create' && (
            <div ref={formAnchorRef}>
              <CreateStream onCreated={handleStreamCreated} />
            </div>
          )}

          {tab === 'track' && (
            <div ref={trackAnchorRef}>
              <TrackStream initialStreamId={lastCreatedStreamId} />
            </div>
          )}

          {tab === 'about' && <About />}

        </div>
      </main>

      {/* FOOTER */}
      <footer className="app-footer">
        <div className="footer-inner">
          <p>
            Network: QDay Aevum Testnet · Chain ID 44005 · Token tUSD8
          </p>
          <p>
            <a
              href={DEMO_VIDEO_URL}
              target="_blank"
              rel="noreferrer"
            >
              ▶ Watch demo
            </a>
            {' · '}
            <a
              href="https://github.com/GimaCapital/qday-streaming-agent"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
            {' · '}
            <a
              href="https://explorer-test.qday.info/address/0xE8Ec4599E43f6d735603e5d7b0d2eB5D49Ec6209"
              target="_blank"
              rel="noreferrer"
            >
              Explorer
            </a>
          </p>
          <p>
            GIMBLAB StreamPay AI Programmable Stablecoin Payments.
          </p>
        </div>
      </footer>

    </div>
  );
}