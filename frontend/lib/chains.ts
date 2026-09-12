import { defineChain } from 'viem';

export const genlayerStudioNet = defineChain({
  id: 61999,
  name: 'GenLayer StudioNet',
  nativeCurrency: {
    name: 'GEN',
    symbol: 'GEN',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://studio.genlayer.com/api'],
    },
  },
  blockExplorers: {
    default: {
      name: 'GenLayer Explorer',
      url: 'https://genlayer-explorer.vercel.app',
    },
  },
});
