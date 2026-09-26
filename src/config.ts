import { defineChain, type Address } from 'viem'
import deployment from './deployments/99801.json'

export const ELYSIUM = defineChain({
  id: 99801,
  name: 'Elysium Testnet',
  nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet-rpc.elysium.kinetiq.xyz'] } },
  blockExplorers: { default: { name: 'Elysium Explorer', url: 'https://elysium.kinetiq.xyz/testnet-explorer' } },
  // Multicall3 is deployed at its canonical address on 99801 (eth_getCode checked 2026-09-26).
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
  testnet: true,
})

// Dev-only overrides (local rehearsal against an anvil running the real contracts). Unset in production builds.
const ENV = import.meta.env as Record<string, string | undefined>
export const RPC_OVERRIDE = ENV.VITE_RPC_OVERRIDE || null
export const PUBLIC_RPC = RPC_OVERRIDE ?? 'https://testnet-rpc.elysium.kinetiq.xyz'
export const EXPLORER = 'https://elysium.kinetiq.xyz/testnet-explorer'
export const BRIDGE = 'https://elysium.kinetiq.xyz/testnet-bridge'
export const HYPEREVM_TESTNET = { id: 998, rpc: 'https://rpc.hyperliquid-testnet.xyz/evm' }

// Bridge contracts (testnet), from SPEC.md, verified in the Elysium docs on 2026-09-26.
export const BRIDGE_CONTRACTS = {
  elysiumBridgeFactory: '0xb94A38a4aC46970559E89E566f2486a3Fc56BE5a',
  hyperEvmMirrorFactory: '0xcaDb9986F3727177d48FA07294E1730f9D19290b',
  elysiumRouter: '0x89659883a9d980925733B0A698F117AAb65ac718',
  hyperEvmRouter: '0x1aAE2caD8B0249905492087EF230FcCEa3707C45',
} as const

type Raw = Record<string, unknown>
const raw = (ENV.VITE_DEPLOYMENT_JSON ? JSON.parse(ENV.VITE_DEPLOYMENT_JSON) : deployment) as Raw
const contracts = (raw.contracts && typeof raw.contracts === 'object' ? raw.contracts : {}) as Raw

/** Case-insensitive lookup across the top level and an optional `contracts` object. */
function pick(...names: string[]): unknown {
  for (const src of [raw, contracts]) {
    for (const k of Object.keys(src)) {
      if (names.some((n) => n.toLowerCase() === k.toLowerCase())) {
        const v = src[k]
        if (v && typeof v === 'object' && 'address' in (v as Raw)) return (v as Raw).address
        return v
      }
    }
  }
  return null
}
const isAddr = (v: unknown): v is Address => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v)
const addr = (...n: string[]): Address | null => { const v = pick(...n); return isAddr(v) ? v : null }

export const addresses = {
  factory: addr('factory', 'CorePadFactory', 'corePadFactory'),
  settlement: addr('settlement', 'Settlement'),
  treasury: addr('treasury', 'Treasury'),
}
const sb = pick('startBlock', 'deployBlock', 'fromBlock', 'blockNumber')
export const START_BLOCK: bigint = typeof sb === 'number' || (typeof sb === 'string' && /^\d+$/.test(sb)) ? BigInt(sb) : 0n

/** True only when the protocol has actually been deployed to 99801. */
export const DEPLOYED = addresses.factory !== null

export const SUPPLY = 1_000_000_000n * 10n ** 18n
export const FOR_SALE = 800_000_000n * 10n ** 18n
export const BOOK_TOKENS = 200_000_000n * 10n ** 18n
