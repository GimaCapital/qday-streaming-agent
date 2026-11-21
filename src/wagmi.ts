// src/wagmi.ts
import { createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { defineChain } from 'viem';

export const qdayAevum = defineChain({
  id: 44005,
  name: 'QDay Aevum Testnet',
  nativeCurrency: { name: 'tQDAY', symbol: 'tQDAY', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc-test.qday.info'] },
  },
  blockExplorers: {
    default: {
      name: 'Aevum Explorer',
      url: 'https://explorer-test.qday.info',
    },
  },
  testnet: true,
});

export const config = createConfig({
  chains: [qdayAevum],
  connectors: [injected()],
  transports: {
    [qdayAevum.id]: http('https://rpc-test.qday.info'),
  },
  ssr: false,
});