// src/wallet.js
// Wallet connection via viem — direct window.ethereum interaction
// No wagmi, no RainbowKit. Maximum simplicity for auditability.

import { createWalletClient, createPublicClient, custom, http } from 'viem';
import { CHAINS, getCurrentChainId, getCustomRpc } from './chain.js';

let walletClient = null;
let publicClient = null;
let account = null;
const listeners = [];

export function getAccount() {
  return account;
}

export function getWalletClient() {
  return walletClient;
}

export function getPublicClient() {
  return publicClient;
}

export function onWalletChange(fn) {
  listeners.push(fn);
}

export function createPublicClientForChain(chainId) {
  var chain = CHAINS[chainId];
  if (!chain) return null;
  var customRpc = getCustomRpc(chainId);
  return createPublicClient({ chain: chain, transport: http(customRpc || undefined) });
}

function notify() {
  listeners.forEach(fn => fn({ account, connected: !!account }));
}

export async function connect() {
  if (!window.ethereum) {
    throw new Error('No wallet detected. Install MetaMask or another browser wallet.');
  }

  const chain = CHAINS[getCurrentChainId()] || CHAINS[11155111];

  walletClient = createWalletClient({
    chain,
    transport: custom(window.ethereum),
  });

  publicClient = createPublicClient({
    chain,
    transport: custom(window.ethereum),
  });

  const [addr] = await walletClient.requestAddresses();
  account = addr;
  notify();
}

export async function disconnect() {
  walletClient = null;
  publicClient = null;
  account = null;
  notify();
}

export async function switchChain(chainId) {
  if (!window.ethereum) return;
  const chain = CHAINS[chainId];
  if (!chain) return;

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x' + chainId.toString(16) }],
    });
  } catch (err) {
    // Chain not added to wallet — try adding it
    if (err.code === 4902 && chain) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x' + chainId.toString(16),
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: chain.rpcUrls.default ? [chain.rpcUrls.default.http[0]] : [],
          blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : [],
        }],
      });
    } else {
      throw err;
    }
  }

  // Recreate clients for new chain
  walletClient = createWalletClient({
    chain,
    transport: custom(window.ethereum),
  });
  publicClient = createPublicClient({
    chain,
    transport: custom(window.ethereum),
  });
}

// Listen for account/chain changes from wallet
if (typeof window !== 'undefined' && window.ethereum) {
  window.ethereum.on('accountsChanged', (accounts) => {
    account = accounts[0] || null;
    notify();
  });
  window.ethereum.on('chainChanged', () => {
    if (account) connect();
  });
}
