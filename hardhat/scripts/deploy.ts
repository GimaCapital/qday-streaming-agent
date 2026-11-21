import "dotenv/config";
import { createRequire } from "module";
import { JsonRpcProvider, Wallet, ContractFactory, Contract } from "ethers";

const require = createRequire(import.meta.url);
const StreamingAgentArtifact = require("../artifacts/contracts/StreamingAgent.sol/StreamingAgent.json");

// Official tUSD8 on Aevum testnet (6 decimals)
const TUSD8_ADDRESS = "0x456569838f1d43009A91ebA4263147Afd7233483";
const RPC_URL = "https://rpc-test.qday.info";

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error("PRIVATE_KEY missing from .env");

  // Pure ethers v6 — no Hardhat provider wrapper, no resolveName bug
  const provider = new JsonRpcProvider(RPC_URL);
  const signer = new Wallet(privateKey, provider);

  console.log("Deployer:", signer.address);
  const balance = await provider.getBalance(signer.address);
  console.log("Balance :", balance.toString());

  // --- 1. Deploy AgentAuthorization (no constructor args) ---
  // We read the artifact the same way for both contracts to keep it uniform.
  const AgentAuthArtifact = require("../artifacts/contracts/AgentAuthorization.sol/AgentAuthorization.json");

  const authFactory = new ContractFactory(
    AgentAuthArtifact.abi,
    AgentAuthArtifact.bytecode,
    signer
  );
  const auth = await authFactory.deploy();
  await auth.waitForDeployment();
  const authAddress = await auth.getAddress();
  console.log("AgentAuthorization :", authAddress);

  // --- 2. Deploy StreamingAgent ---
  const streamerFactory = new ContractFactory(
    StreamingAgentArtifact.abi,
    StreamingAgentArtifact.bytecode,
    signer
  );
  const streamer = await streamerFactory.deploy(TUSD8_ADDRESS, authAddress);
  await streamer.waitForDeployment();
  const streamerAddress = await streamer.getAddress();
  console.log("StreamingAgent     :", streamerAddress);

  // --- 3. Wire the two contracts ---
  const authContract = new Contract(authAddress, AgentAuthArtifact.abi, signer);
  const tx = await authContract.setStreamingContract(streamerAddress);
  await tx.wait();
  console.log("StreamingContract set on AgentAuthorization");

  // --- 4. Sanity check ---
  const streamerContract = new Contract(streamerAddress, StreamingAgentArtifact.abi, signer);
  const wired = await streamerContract.isWired();
  console.log("isWired            :", wired);

  console.log("\nSave these for your submission:");
  console.log("  AgentAuthorization:", authAddress);
  console.log("  StreamingAgent    :", streamerAddress);
  console.log("  tUSD8             :", TUSD8_ADDRESS);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});