// C:\Users\HP\Desktop\qday-streaming-agent\src\pages\About.tsx
export default function About() {
  return (
    <section className="card">
      <div className="about">
        <p>
          <strong>StreamPay AI</strong> lets you delegate bounded payment authority
          to an AI agent, which opens time-vested stablecoin streams on your behalf
          without ever holding custody of your funds.
        </p>
        <ul>
          <li><strong>User</strong> sets spending limits and per-payment caps</li>
          <li><strong>User</strong> approves an exact payment instruction</li>
          <li><strong>Agent</strong> consumes the approval to create a stream</li>
          <li><strong>Recipient</strong> withdraws as funds vest</li>
          <li><strong>Sender</strong> can cancel and recover unvested funds</li>
        </ul>
        <p className="about-meta">
          <strong>Network:</strong> QDay Aevum Testnet · Chain ID 44005<br />
          <strong>Token:</strong> tUSD8 (6 decimals)<br />
          <strong>Contracts:</strong>{' '}
          <a
            href="https://explorer-test.qday.info/address/0xE8Ec4599E43f6d735603e5d7b0d2eB5D49Ec6209"
            target="_blank"
            rel="noreferrer"
          >
            StreamingAgent
          </a>{' '}
          ·{' '}
          <a
            href="https://explorer-test.qday.info/address/0xc2D2BF418F37ef4C433f12E66CdEe28E9E733CC0"
            target="_blank"
            rel="noreferrer"
          >
            AgentAuthorization
          </a>
        </p>
        <p className="about-meta">
          <a
            href="https://github.com/GimaCapital/qday-streaming-agent"
            target="_blank"
            rel="noreferrer"
          >
            View on GitHub →
          </a>
        </p>
      </div>
    </section>
  );
}