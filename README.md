<!-- C:\Users\HP\Desktop\qday-streaming-agent\README.md -->
# GIMBLOCKCHAIN StreamPay AI

> **▶ Live demo:** https://qday-streaming-agent.onrender.com
> **🎥 3-minute walkthrough:** https://youtu.be/VIDEO_ID
> **📦 Contracts (QDay Aevum Testnet, Chain 44005):**
> [AgentAuthorization](https://explorer-test.qday.info/address/0xc2D2BF418F37ef4C433f12E66CdEe28E9E733CC0) ·
> [StreamingAgent](https://explorer-test.qday.info/address/0xE8Ec4599E43f6d735603e5d7b0d2eB5D49Ec6209)

**Programmable stablecoin payment streams with controlled AI-agent authorization, built on QDay Aevum testnet.**

Aevum Builder Challenge #1 submission — QDay / DoraHacks.

---

## Live demo

**https://qday-streaming-agent.onrender.com**

Connect any EVM wallet (MetaMask, Rabby, Coinbase, Brave, Frame, Trust). The dApp auto-configures QDay Aevum Testnet (Chain ID 44005) on first connect.

> Render free tier may take 30-60 seconds to wake up on first load.

---

## Provenance

Built by GimaCapital between Nov 20 and Nov 23, 2026, for Aevum Builder Challenge #1.

Commit history: https://github.com/GimaCapital/qday-streaming-agent/commits/main

Deployed on QDay Aevum testnet at blocks 3690297 and 3690307.
First on-chain evidence tx: 0xa77e57360cb47216e4dcc8908746c23d89dc6732f61a5146571e0a492e8320a9

## What this is (in plain terms)

StreamPay AI lets you pay someone **continuously over time** instead of in one lump sum - and lets an **AI agent** set up those payments on your behalf, within strict limits you control.

Think of it like a **salary paid every second** instead of every month.

You put money into a "stream" once. That money unlocks to the recipient gradually - a little every second. The recipient can withdraw whatever has unlocked so far, anytime. You can cancel at any point and get the unvested balance back.

Because the spending limits are written into the smart contract, you can safely let an AI agent create these payments automatically. The agent can never overspend, and you can revoke its permission in one click.

### What was built

Three pieces working together:

**1. `AgentAuthorization` - the permission slip contract**

This is where you say: *"I trust this AI agent up to 1000 tUSD8 total, max 100 per payment, for the next 30 days."*

- The agent can never exceed your limits - the contract rejects the transaction.
- You can revoke the agent at any time. All pending approvals instantly become invalid.
- Re-authorizing the agent resets their allowance. Old approvals can never execute after that.

**2. `StreamingAgent` - the escrow and drip contract**

Money goes in as one lump sum, then unlocks to the recipient every second.

- **Recipient** can withdraw whatever has unlocked so far, at any moment.
- **Sender** can cancel anytime. The recipient keeps what unlocked, the sender gets the rest back.
- All balances are tracked on-chain. No one can withdraw more than they are owed.

**3. The web app**

A simple React dApp where you:

1. Connect your wallet
2. Paste a recipient address, an amount, and a duration
3. Click "Approve & Create Stream"
4. Watch the money stream out, second by second

The UI shows your tUSD8 balance, the recipient, the vesting rate, and a live progress bar that fills as the stream unlocks.

### Benefits to the user

**No lump-sum risk**

You do not hand over all the money at once. If the recipient disappears, stops delivering, or you change your mind, you cancel and keep the unvested portion.

**AI agents can pay safely**

You can let an AI agent send payments automatically without giving it custody of your funds. The agent can only spend up to the limits you set. Hard caps are enforced by the contract, not by trust.

**Revoke in one click**

One button turns off the agent. Every pending payment approval becomes invalid immediately. Nothing stale can execute.

**Recipient gets paid fairly**

They do not wait 30 days. They withdraw whatever has vested at any moment. If you cancel on day 20 of 30, they keep 2/3 of the money - the portion that already unlocked.

**No trust required**

The rules live in the smart contract. Nobody can bypass the limits - not the recipient, not the agent, not even the contract owner.

### How it is used (real scenario)

**Scenario:** A company hires a freelancer for 30 days at 0.1 tUSD8 per day.

1. **Day 0** - The company's AI accounting agent creates a stream: 3 tUSD8 total, over 30 days, to the freelancer's wallet.

2. **Day 1** - 0.1 tUSD8 has unlocked. The freelancer clicks "Withdraw" and gets paid for day 1.

3. **Day 15** - 1.5 tUSD8 unlocked. Freelancer withdraws again.

4. **Day 20** - The freelancer quits. The company clicks "Cancel". The freelancer keeps what already unlocked (2 tUSD8), the company gets the rest back (1 tUSD8).

5. **Anyone can verify** - every payment and cancellation is visible on the blockchain explorer. No disputes possible.

### Why this matters for AI-agent payments

QDay is built for autonomous agents making on-chain payments. But letting an AI agent touch your money is dangerous - it could overspend, get hacked, or go rogue.

StreamPay AI solves this:

- **The AI agent can pay** recipients automatically
- **The user stays in control** with hard limits and instant revocation
- **The money is safe** because it is escrowed and drips out slowly

This is a payment primitive that both humans and machines can trust.

---

## Technical overview

StreamPay AI lets a user delegate *bounded* payment authority to an AI agent, then have that agent open time-vested stablecoin streams on the user's behalf - without ever giving the agent custody of funds.

- **User** sets spending limits, expiry, and per-payment caps for an AI agent.
- **User** approves an *exact* payment instruction (recipient, amount, duration, approval expiry).
- **AI agent** consumes the approval by calling `createStreamFor(...)` on the streaming contract.
- **StreamingAgent** escrows tUSD8 and vests it to the recipient over time.
- **Recipient** withdraws vested funds at any point. **Sender** can cancel and recover unvested funds.

Every approval is bound to a permission *epoch*. Revoking the agent, updating its limits, or re-authorizing invalidates every outstanding approval - no stale instructions can execute after a permission change.

---

## Live deployment (QDay Aevum Testnet)

| Contract | Address |
|---|---|
| `AgentAuthorization` | `0xc2D2BF418F37ef4C433f12E66CdEe28E9E733CC0` |
| `StreamingAgent` | `0xE8Ec4599E43f6d735603e5d7b0d2eB5D49Ec6209` |
| `tUSD8` (official token) | `0x456569838f1d43009A91ebA4263147Afd7233483` |

- **Chain ID:** `44005`
- **RPC:** `https://rpc-test.qday.info`
- **Explorer:** `https://explorer-test.qday.info`
- **Native gas token:** `tQDAY`
- **Payment token:** `tUSD8` (6 decimals)

`StreamingAgent.isWired() == true` - verified on-chain.

---

## On-chain evidence

Full lifecycle demonstrated on Aevum testnet:

| # | Action | Tx hash | Block |
|---|---|---|---|
| 1 | Deploy `AgentAuthorization` | [`0xa77e5736...20a9`](https://explorer-test.qday.info/tx/0xa77e57360cb47216e4dcc8908746c23d89dc6732f61a5146571e0a492e8320a9) | 3690297 |
| 2 | Deploy `StreamingAgent` | [`0xe9c40168...21b5`](https://explorer-test.qday.info/tx/0xe9c40168da194000c8109527003cb8dc8a0751e0535a67c959023eb65cea21b5) | 3690307 |
| 3 | `setStreamingContract(StreamingAgent)` | [`0x5d288375...efbc`](https://explorer-test.qday.info/tx/0x5d288375d730c45cb434d81762a7ef64c0205511e8cae67730d0819a3664efbc) | 3690317 |
| 4 | Create Stream #0 (0.1 tUSD8, 60s) | [`0x948ab942...0a52`](https://explorer-test.qday.info/tx/0x948ab942d4882b5af3233ca7cdb68c098e6d25a28e6aa61695b15d3382e00a52) | 3692321 |
| 5 | Create Stream #1 (0.1 tUSD8, 60s) | [`0x32edba1f...37db`](https://explorer-test.qday.info/tx/0x32edba1fb8d8964f223ebb4eaf0692d15891fa59421783c56c17029c9d8437db) | 3692765 |
| 6 | Withdraw Stream #0 (recipient, full) | [`0x2411a862...07cf`](https://explorer-test.qday.info/tx/0x2411a862c430a9b5bd82f06539609aea7add3aa782649e79b1ddf8830fb607cf) | 3693108 |
| 7 | Create Stream #2 (0.1 tUSD8, 60s) | [`0x3faec402...eb67`](https://explorer-test.qday.info/tx/0x3faec4024d387d7ce127bab8569bbe08a380b82ca9e36baf1d58c06da991eb67) | 3693473 |
| 8 | Cancel Stream #2 (sender refund) | [`0xbc1d3601...7318`](https://explorer-test.qday.info/tx/0xbc1d36016c5f6491997ec0c7820049b0664e1d49475fee09374780166ff07318) | 3693530 |

Key observations from the explorer:

- **Stream #0 withdraw** moved `0.1 tUSD8` from `StreamingAgent` to recipient (full payout, `withdrawn = deposit`, stream auto-depleted).
- **Stream #2 cancel** moved `0.003334 tUSD8` (vested portion at cancel time) back to the sender as unvested refund, while leaving `0.096666 tUSD8` withdrawable by the recipient. This confirms the split math `refund = deposit - vested` and that **cancellation never strips the recipient's vested funds**.

All transactions confirmed in ~1 second, gas ~114k-242k.

---

## Architecture

```
        +-----------------------------------------------+
        |                 User (EOA)                    |
        +-----------------------+-----------------------+
                                |
                authorizeAgent  |  approvePayment (exact instruction)
                revokeAgent     |  revokePayment
                updateLimits    |
                                v
        +-----------------------------------------------+
        |           AgentAuthorization                  |
        |  - per-(user,agent) permissions + epochs      |
        |  - payment approvals keyed by paymentId       |
        |  - onlyStreamingContract guard on consume     |
        |  - two-step ownership transfer                |
        +-----------------------+-----------------------+
                                |
                                |  consumePaymentAuthorization(...)
                                |  (msg.sender == StreamingAgent)
                                v
        +-----------------------------------------------+
        |              StreamingAgent                   |
        |  - createStream / createStreamFor             |
        |  - linear vesting (deposit * elapsed / dur.)  |
        |  - withdraw (recipient only)                  |
        |  - cancelStream (sender only, refund unvested)|
        |  - escrow accounting (totalEscrowed)          |
        |  - reentrancy guard                           |
        +-----------------------+-----------------------+
                                |
                                |  transfer / transferFrom
                                v
                       +----------------+
                       |     tUSD8      |
                       |   (ERC-20)     |
                       +----------------+

  AI Agent EOA --- calls createStreamFor(user, recipient, deposit, dur, paymentId)
```

### Payment lifecycle

```
1. user.authorizeAgent(agent, maxTotal, maxPerPay, expiresAt)
       -> epoch = 1

2. user.approvePayment(agent, recipient, amount, duration, approvalExpiry)
       -> paymentId = keccak256(this, chainid, user, agent, recipient,
                                 amount, duration, epoch, nonce++)
       -> approval bound to epoch = 1

3. agent.createStreamFor(user, recipient, amount, duration, paymentId)
       -> StreamingAgent calls AgentAuthorization.consumePaymentAuthorization(...)
       -> checks: approval exists, owner, agent, recipient, amount, duration,
                 approvalExpiry, permission enabled, permissionExpiry,
                 epoch match, per-pay limit, total-spend limit
       -> spent += amount, approval deleted
       -> tUSD8.transferFrom(user -> StreamingAgent)
       -> stream created, starts vesting

4. recipient.withdraw(streamId)  -- anytime, up to vested amount
5. user.cancelStream(streamId)   -- sender only, refunds unvested portion
```

Any of these invalidates outstanding approvals (bumps `epoch`):

- `revokeAgent`
- `updateSpendingLimits`
- `authorizeAgent` (re-authorization)
- permission expiry (`block.timestamp >= expiresAt`)
- individual `revokePayment`

---

## Security properties

| Property | Where enforced |
|---|---|
| Only the configured streaming contract can consume approvals | `onlyStreamingContract` modifier |
| Only the payment owner can revoke an approval | `paymentOwners[paymentId] == msg.sender` |
| Stale approvals invalidated on any permission change | `permission.epoch` compared to `approval.permissionEpoch` |
| Per-payment and total spend caps checked at both approve *and* consume time | `maxPerPayment`, `maxTotalSpend - spent` |
| Approval cannot outlive agent permission | `approvalExpiresAt <= permission.expiresAt` |
| Reentrancy-safe token transfers | `nonReentrant` on all state-changing external funcs |
| Safe ERC-20 handling | low-level `call` + `require(success && decoded bool)` |
| Two-step ownership transfer | `transferOwnership` / `acceptOwnership` |
| Streaming contract set once, immutable | `require(streamingContract == address(0), "Already configured")` |

**Known constraints (documented deliberately):**

- `spent` is **per authorization epoch**, not lifetime. Calling `authorizeAgent` resets it. Off-chain accounting must track lifetime totals via `PaymentExecuted` events.
- Cancelling a stream does **not** restore agent allowance - the spend was consumed at creation.
- `owner` can only configure the streaming contract once. It has **no** power over user permissions or funds.

---

---

## ERC-8004 compatibility (design)

StreamPay AI is architected so that the `agent` address in every `AgentPermission` can become an **ERC-8004 on-chain agent identity** without changing the streaming logic.

**Current design → ERC-8004 mapping:**

| ERC-8004 primitive | StreamPay AI today | Mainnet integration path |
|---|---|---|
| Agent identity registry | `agent` is an EOA address | Resolve `agent` → `erc8004Id` before `authorizeAgent` succeeds |
| Agent reputation | Not on-chain | Store `erc8004Id` in `AgentPermission`; surface reputation in the dApp before the user signs |
| Agent validation | `maxTotalSpend`, `maxPerPayment`, `expiresAt` | Same, plus an ERC-8004 attestation requirement for high-value agents |
| Revocation signal | `revokeAgent` bumps `permission.epoch` | Emit an ERC-8004 "revoked" event in the same tx so reputation trackers update instantly |

**Why the epoch model is the right foundation:**

The `permission.epoch` field already implements the behavior ERC-8004 needs — every permission change atomically invalidates all prior approvals. Adding an ERC-8004 lookup is therefore *additive, not disruptive*: the epoch mechanism doesn't change; only the source of truth for "who is this agent" shifts from an arbitrary EOA to a registered identity.

**Reserved design (not implemented in this submission):**

```solidity
// AgentAuthorization.sol — reserved for mainnet
mapping(address agent => uint256 erc8004Id) public agentIdentity;

function bindAgentIdentity(address agent, uint256 erc8004Id) external onlyOwner {
    agentIdentity[agent] = erc8004Id;
    emit AgentIdentityBound(agent, erc8004Id);
}

```

## Repository layout

```
qday-streaming-agent/
+-- hardhat/ # Hardhat project (contracts + tests + deploy)
| +-- contracts/ # Solidity source
| | +-- AgentAuthorization.sol
| | +-- StreamingAgent.sol
| | +-- interfaces/
| | | +-- IERC20.sol
| | +-- MockERC20.sol # test-only token + streaming stub
| +-- test/
| | +-- AgentAuthorization.test.ts
| | +-- StreamingAgent.test.ts
| +-- scripts/
| | +-- deploy.ts
| +-- hardhat.config.ts
| +-- tsconfig.json
| +-- .env.example
+-- public/
+-- src/ # React + wagmi + RainbowKit dApp
| +-- pages/
| | +-- CreateStream.tsx
| | +-- TrackStream.tsx
| | +-- About.tsx
| | +-- index.ts
| +-- App.tsx
| +-- App.css
| +-- wagmi.ts
| +-- main.tsx
+-- index.html
+-- package.json # Vite + React app
+-- vite.config.ts
+-- README.md
```

---

## Reproduce

### 1. Contracts - compile + test

```bash
cd hardhat
npm install
npx hardhat compile
npx hardhat test
```

Expected output:

```
59 passing (777ms)
```

The suite covers:

- Configuration (streaming contract set once, rejects zero address, rejects EOA)
- `authorizeAgent` (happy path, zero agent, self, zero total, per-pay > total, past expiry, reauth resets spent + bumps epoch)
- `revokeAgent` (disables, bumps epoch, invalidates approvals)
- `updateSpendingLimits` (bumps epoch, rejects expired, rejects below spent, invalidates approvals)
- `approvePayment` (records correctly, unique IDs, rejects unauthorized / invalid recipient / outliving permission / over per-pay)
- `revokePayment` (deletes, rejects unknown, rejects non-owner)
- `consumePaymentAuthorization` (only streaming contract, no double-consume, expired approval)
- Views (`remainingAllowance`, `isAgentAuthorized`)
- Ownership (two-step transfer, zero new owner, only pending owner accepts)
- StreamingAgent: constructor validation, `createStream`, vesting (`balanceOf` over time), `withdraw`, `cancelStream`, refunds, recipient-withdraw-after-cancel, `createStreamFor` agent path, escrow solvency

### 2. Deploy to Aevum testnet

```bash
cd hardhat
cp .env.example .env
# Put your deployer private key into .env
npm install --save-dev dotenv
npx hardhat compile
npx hardhat run scripts/deploy.ts --network aevum
```

The script prints three addresses:

```
AgentAuthorization : 0xc2D2BF418F37ef4C433f12E66CdEe28E9E733CC0
StreamingAgent     : 0xE8Ec4599E43f6d735603e5d7b0d2eB5D49Ec6209
tUSD8              : 0x456569838f1d43009A91ebA4263147Afd7233483
isWired            : true
```

Use these in `src/pages/CreateStream.tsx` and `src/pages/TrackStream.tsx`.

### 3. Frontend

```bash
# from the project root
npm install
npm run dev
```

Open `http://localhost:5173`. Setup:

1. Add QDay Aevum Testnet to MetaMask (Chain ID 44005, RPC `https://rpc-test.qday.info`, symbol `tQDAY`). The dApp auto-adds it on first connect if your wallet supports `wallet_addEthereumChain`.
2. Get testnet `tQDAY` from `https://faucet.qday.info`.
3. Get `tUSD8` from the QDay Discord starter kit.
4. Click **Connect Wallet** (RainbowKit - MetaMask, Rabby, Coinbase, Brave, Frame, Trust).
5. Paste a recipient address (a second wallet you own), enter an amount and duration, click **Approve & Create Stream**.
6. Switch wallets to the recipient, enter the stream ID, click **Refresh**, then **Withdraw Available Funds**.
7. To show cancellation: create a second stream as sender, wait a few seconds, enter its ID, click **Cancel Stream** - unvested funds return to you immediately, and the recipient can still withdraw the vested amount.

---

## Tests in depth

```
AgentAuthorization         35 passing
StreamingAgent             24 passing
TOTAL                      59 passing
```

Notable test design choices:

- Vesting assertions use `to.be.closeTo(..., DRIFT)` because block-timestamp advances by 1-3 seconds between tx mine events; exact wei equality on `deposit * elapsed / duration` is physically impossible to pin in Hardhat.
- "withdraw reverts when nothing vested" is tested by full-vest -> withdraw -> withdraw-again, because after `createStream` at least 1 wei is already vested on the next block.
- `MockStreamingContract` is a minimal forwarder used only by the `AgentAuthorization` test suite, so authorization logic can be unit-tested without deploying the full `StreamingAgent`.

---

## Tech stack

| Layer | Tech |
|---|---|
| Contracts | Solidity 0.8.20, no external dependencies |
| Build / test | Hardhat 3, Mocha, Chai, `@nomicfoundation/hardhat-toolbox-mocha-ethers` |
| Frontend | React 19, TypeScript, wagmi v3, viem, RainbowKit, TanStack Query, Vite |
| Chain | QDay Aevum testnet (Chain ID 44005) |
| Token | tUSD8 (ERC-20, 6 decimals) |

---

## What's next (post-mainnet)

- **Stream NFTs** - make an active stream transferable as an ERC-721 claim ticket.
- **Session keys** - allow an agent to sign short-lived sub-approvals so users don't need one wallet prompt per stream.
- **Streaming-to-streaming** - chain `createStreamFor` with a percentage allocation so revenue can auto-split into multiple recipients.
- **ERC-8004 integration** - bind agent identity on-chain (ERC-8004 identity + reputation) so users can see the agent's on-chain reputation before authorizing it.
- **Sub-second UX** - pre-sign approvals off-chain and submit on-chain in the same block using Aevum's ~1-second finality.

---

## License

MIT - see [LICENSE](./LICENSE).