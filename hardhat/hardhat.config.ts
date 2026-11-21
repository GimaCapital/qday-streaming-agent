import "dotenv/config";
import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { defineConfig, configVariable } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: "0.8.20",
  paths: {
    sources: "./contracts",
    tests: "./test",
  },
  networks: {
    aevum: {
      type: "http",
      chainType: "generic",
      url: "https://rpc-test.qday.info",
      chainId: 44005,
      accounts: [configVariable("PRIVATE_KEY")],
    },
  },
});