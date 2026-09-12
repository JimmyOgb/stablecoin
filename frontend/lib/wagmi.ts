import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { genlayerStudioNet } from './chains';

export const config = getDefaultConfig({
  appName: 'Adaptive Stablecoin (aUSD)',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'c4f79cc821944d9680842e34466bfbd',
  chains: [genlayerStudioNet],
  ssr: true,
});
