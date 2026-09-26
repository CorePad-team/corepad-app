import {
  createPublicClient, createWalletClient, custom, fallback, http, formatEther,
  type Abi, type Address, type Hash, type Log, type WalletClient, type AbiEvent,
} from 'viem'
import { ELYSIUM, PUBLIC_RPC, RPC_OVERRIDE, addresses, START_BLOCK, FOR_SALE } from './config'
import FactoryAbi from './abi/CorePadFactory.json'
import PoolAbi from './abi/LaunchPool.json'
import SettlementAbi from './abi/Settlement.json'
import TokenAbi from './abi/CorePadToken.json'
import AdapterAbi from './abi/IBridgeAdapter.json'

export const abis = {
  factory: FactoryAbi as unknown as Abi,
  pool: PoolAbi as unknown as Abi,
  settlement: SettlementAbi as unknown as Abi,
  token: TokenAbi as unknown as Abi,
  adapter: AdapterAbi as unknown as Abi,
}

// Same-origin proxy first (retries upstream server-side), public RPC as a direct fallback.
const proxy = RPC_OVERRIDE ?? (typeof location !== 'undefined' ? new URL('/api/rpc', location.origin).toString() : PUBLIC_RPC)
export const pub = createPublicClient({
  chain: ELYSIUM,
  transport: fallback([http(proxy, { batch: { batchSize: 20 } }), http(PUBLIC_RPC)]),
  batch: { multicall: true },
})

/* ---------- ABI introspection: the UI adapts to the real ABI instead of assuming it ---------- */
type AbiItem = { type: string; name?: string; stateMutability?: string; inputs?: { name: string; type: string }[]; outputs?: { name: string; type: string }[] }
const items = (abi: Abi) => abi as unknown as AbiItem[]
export const fnNames = (abi: Abi) => new Set(items(abi).filter((i) => i.type === 'function').map((i) => i.name!))
export const hasFn = (abi: Abi, name: string) => fnNames(abi).has(name)
export const firstFn = (abi: Abi, ...names: string[]) => names.find((n) => hasFn(abi, n)) ?? null
export const fnItem = (abi: Abi, name: string) => items(abi).find((i) => i.type === 'function' && i.name === name)
export const eventItem = (abi: Abi, name: string) => items(abi).find((i) => i.type === 'event' && i.name === name) as unknown as AbiEvent | undefined

/* ---------- Launch registry from LaunchCreated ---------- */
export type Launch = {
  id: bigint; token: Address; pool: Address; creator: Address; name: string; symbol: string; block: bigint
}

function argsOf(l: Log): Record<string, unknown> {
  return ((l as unknown as { args?: Record<string, unknown> }).args ?? {})
}

/** getLogs over [from, to], splitting the range when the node refuses (count limit). */
export async function logsChunked(address: Address, event: AbiEvent, from: bigint, to: bigint, args?: Record<string, unknown>): Promise<Log[]> {
  try {
    return await pub.getLogs({ address, event, args, fromBlock: from, toBlock: to } as Parameters<typeof pub.getLogs>[0]) as Log[]
  } catch (e) {
    if (to - from < 2000n) throw e
    const mid = from + (to - from) / 2n
    return [...await logsChunked(address, event, from, mid, args), ...await logsChunked(address, event, mid + 1n, to, args)]
  }
}

let launchCache: { at: bigint; list: Launch[] } | null = null
export async function fetchLaunches(): Promise<Launch[]> {
  if (!addresses.factory) return []
  const ev = eventItem(abis.factory, 'LaunchCreated')
  if (!ev) throw new Error('LaunchCreated missing from the factory ABI')
  const head = await pub.getBlockNumber({ cacheTime: 0 })
  const from = launchCache ? launchCache.at + 1n : START_BLOCK
  const logs = from <= head ? await logsChunked(addresses.factory, ev, from, head) : []
  const fresh = logs.map((l) => {
    const a = argsOf(l)
    return {
      id: BigInt(a.id as bigint), token: a.token as Address, pool: a.pool as Address, creator: a.creator as Address,
      name: String(a.name ?? ''), symbol: String(a.symbol ?? ''), block: l.blockNumber ?? 0n,
    }
  })
  launchCache = { at: head, list: [...(launchCache?.list ?? []), ...fresh] }
  return launchCache.list
}

/* ---------- Pool state ---------- */
export type PoolState = {
  virtualHype: bigint; virtualToken: bigint; sold: bigint; raised: bigint | null; target: bigint | null
  /** graduated: graduate() has run. frozen: curve closed (sold out or graduated), no trading. */
  graduated: boolean; frozen: boolean; price: number; progress: number
  launchedAt: bigint | null; guardSeconds: bigint | null; guardMax: bigint | null
  guardActive: boolean | null; ticketId: bigint | null; hypeToGraduate: bigint | null; tickerReserve: bigint | null
}

async function readOpt<T>(address: Address, abi: Abi, names: string[], args: unknown[] = []): Promise<T | null> {
  const fn = firstFn(abi, ...names)
  if (!fn) return null
  try { return await pub.readContract({ address, abi, functionName: fn, args }) as T } catch { return null }
}

export async function poolState(pool: Address): Promise<PoolState> {
  const a = abis.pool
  const [vH, vT, sold, raised, target, grad, frozen, launchedAt, guardSeconds, guardMax, guardActive, ticketId, toGrad, tickerReserve] = await Promise.all([
    readOpt<bigint>(pool, a, ['virtualHype', 'vHype', 'virtualHypeReserve']),
    readOpt<bigint>(pool, a, ['virtualToken', 'vToken', 'virtualTokenReserve']),
    readOpt<bigint>(pool, a, ['tokensSold', 'sold']),
    readOpt<bigint>(pool, a, ['realHype', 'hypeRaised']),
    readOpt<bigint>(pool, a, ['graduationHype', 'target']),
    readOpt<boolean>(pool, a, ['graduated']),
    readOpt<boolean>(pool, a, ['frozen', 'isFrozen']),
    readOpt<bigint>(pool, a, ['launchedAt', 'startTime', 'createdAt']),
    readOpt<bigint>(pool, a, ['guardSeconds']),
    readOpt<bigint>(pool, a, ['guardMaxPerAddress']),
    readOpt<boolean>(pool, a, ['guardActive']),
    readOpt<bigint>(pool, a, ['ticketId']),
    readOpt<bigint>(pool, a, ['hypeToGraduate']),
    readOpt<bigint>(pool, a, ['tickerReserve']),
  ])
  const virtualHype = vH ?? 0n, virtualToken = vT ?? 0n
  const s = sold ?? 0n
  const price = virtualToken > 0n ? Number(formatEther(virtualHype)) / Number(formatEther(virtualToken)) : 0
  const progress = Math.min(1, Number((s * 1_000_000n) / FOR_SALE) / 1_000_000)
  return {
    virtualHype, virtualToken, sold: s, raised, target, graduated: Boolean(grad), frozen: Boolean(grad || frozen || s >= FOR_SALE), price, progress,
    launchedAt, guardSeconds, guardMax, guardActive, ticketId: ticketId && ticketId > 0n ? ticketId : null,
    hypeToGraduate: toGrad, tickerReserve,
  }
}

export async function poolStates(pools: Address[]): Promise<Map<Address, PoolState>> {
  const out = new Map<Address, PoolState>()
  await Promise.all(pools.map(async (p) => { try { out.set(p, await poolState(p)) } catch { /* row shows as unreadable */ } }))
  return out
}

/* ---------- Quotes: on-chain when the pool exposes them, else the SPEC curve math ---------- */
const FEE_BPS = 100n
export async function quoteBuy(pool: Address, st: PoolState, hypeIn: bigint): Promise<{ out: bigint; fee: bigint; clipped: boolean }> {
  const fn = firstFn(abis.pool, 'quoteBuy', 'getBuyQuote', 'previewBuy')
  if (fn) {
    try {
      const r = await pub.readContract({ address: pool, abi: abis.pool, functionName: fn, args: [hypeIn] }) as bigint | readonly bigint[]
      if (typeof r === 'bigint') return { out: r, fee: (hypeIn * FEE_BPS) / 10_000n, clipped: false }
      return { out: r[0], fee: r[1] ?? 0n, clipped: (r[2] ?? 0n) > 0n }
    } catch { /* fall through to local math */ }
  }
  const fee = (hypeIn * FEE_BPS) / 10_000n
  const net = hypeIn - fee
  const k = st.virtualHype * st.virtualToken
  let out = st.virtualToken - k / (st.virtualHype + net)
  const left = FOR_SALE - st.sold
  const clipped = out > left
  if (clipped) out = left
  return { out, fee, clipped }
}
export async function quoteSell(pool: Address, st: PoolState, tokensIn: bigint): Promise<{ out: bigint; fee: bigint }> {
  const fn = firstFn(abis.pool, 'quoteSell', 'getSellQuote', 'previewSell')
  if (fn) {
    try {
      const r = await pub.readContract({ address: pool, abi: abis.pool, functionName: fn, args: [tokensIn] }) as bigint | readonly bigint[]
      if (typeof r === 'bigint') return { out: r, fee: 0n }
      return { out: r[0], fee: r[1] ?? 0n }
    } catch { /* fall through */ }
  }
  const k = st.virtualHype * st.virtualToken
  const gross = st.virtualHype - k / (st.virtualToken + tokensIn)
  const fee = (gross * FEE_BPS) / 10_000n
  return { out: gross - fee, fee }
}

/* ---------- Trades ---------- */
export type Trade = { isBuy: boolean; trader: Address; hype: bigint; tokens: bigint; fee: bigint; block: bigint; tx: Hash; logIndex: number }
export function decodeTrade(l: Log): Trade {
  const a = argsOf(l)
  const isBuy = Boolean(a.isBuy)
  const pickN = (...k: string[]) => { for (const x of k) if (typeof a[x] === 'bigint') return a[x] as bigint; return 0n }
  return {
    isBuy, trader: a.trader as Address,
    hype: isBuy ? pickN('hypeIn', 'hypeAmount', 'hype') : pickN('hypeOut', 'hypeAmount', 'hype'),
    tokens: isBuy ? pickN('tokensOut', 'tokenAmount', 'tokens') : pickN('tokensIn', 'tokenAmount', 'tokens'),
    fee: pickN('fee'), block: l.blockNumber ?? 0n, tx: l.transactionHash as Hash, logIndex: l.logIndex ?? 0,
  }
}
export async function fetchTrades(pool: Address, from: bigint, to: bigint): Promise<Trade[]> {
  const ev = eventItem(abis.pool, 'Trade')
  if (!ev) return []
  const logs = await logsChunked(pool, ev, from, to)
  return logs.map(decodeTrade)
}

/* ---------- Pipeline (Settlement) ---------- */
export type Stage = 'absorption' | 'graduated' | 'dispatched' | 'confirmed' | 'rescued'
export type Pipeline = {
  stage: Stage; ticket: bigint | null; listPrice: bigint | null; hype: bigint | null; tokens: bigint | null
  coreTokenIndex: bigint | null; spotPairIndex: bigint | null; graduatedTx: Hash | null; dispatchedTx: Hash | null; confirmedTx: Hash | null
  /** adapter.isRouteReady(token): the HyperEVM mirror is registered and routed. null = could not be read */
  routeReady: boolean | null; mirror: Address | null
}
const STATES = ['none', 'open', 'dispatched', 'confirmed', 'rescued'] as const
/**
 * Ticket state from Settlement.getTicket (source of truth), tx hashes from its events.
 * Settlement.State: None, Open, Dispatched, Confirmed, Rescued.
 */
export async function fetchPipeline(launch: Launch, st: PoolState): Promise<Pipeline> {
  const p: Pipeline = { stage: st.graduated ? 'graduated' : 'absorption', ticket: null, listPrice: null, hype: null, tokens: null, coreTokenIndex: null, spotPairIndex: null, graduatedTx: null, dispatchedTx: null, confirmedTx: null, routeReady: null, mirror: null }
  const settle = addresses.settlement
  if (!settle || !st.graduated || st.ticketId === null) return p
  const id = st.ticketId
  p.ticket = id
  const t = await pub.readContract({ address: settle, abi: abis.settlement, functionName: 'getTicket', args: [id] }) as Record<string, unknown>
  p.listPrice = t.listPrice as bigint; p.hype = t.hype as bigint; p.tokens = t.tokens as bigint
  const state = STATES[Number(t.state)] ?? 'none'
  if (state === 'dispatched') p.stage = 'dispatched'
  if (state === 'confirmed') { p.stage = 'confirmed'; p.coreTokenIndex = BigInt(t.coreTokenIndex as bigint); p.spotPairIndex = BigInt(t.spotPairIndex as bigint) }
  if (state === 'rescued') p.stage = 'rescued'
  if (t.mirror && t.mirror !== '0x0000000000000000000000000000000000000000') p.mirror = t.mirror as Address
  if (state === 'open') {
    try {
      const adapter = await pub.readContract({ address: settle, abi: abis.settlement, functionName: 'adapter' }) as Address
      p.routeReady = await pub.readContract({ address: adapter, abi: abis.adapter, functionName: 'isRouteReady', args: [launch.token] }) as boolean
    } catch { p.routeReady = null }
  } else if (state === 'dispatched' || state === 'confirmed') p.routeReady = true
  // tx hashes, for the explorer links
  const head = await pub.getBlockNumber({ cacheTime: 0 })
  const txOf = async (name: string) => {
    const ev = eventItem(abis.settlement, name)
    if (!ev) return null
    const logs = await logsChunked(settle, ev, launch.block, head, { ticket: id }).catch(() => [] as Log[])
    return (logs[0]?.transactionHash as Hash | undefined) ?? null
  }
  p.graduatedTx = await txOf('Graduated')
  if (p.stage === 'dispatched' || p.stage === 'confirmed') p.dispatchedTx = await txOf('Dispatched')
  if (p.stage === 'confirmed') p.confirmedTx = await txOf('Confirmed')
  return p
}

/** Build call args by matching the real ABI's input names, so argument order is never assumed. */
export function argsFor(abi: Abi, fn: string, values: Record<string, unknown>): unknown[] {
  const it = fnItem(abi, fn)
  if (!it) throw new Error(`${fn} is not in the ABI`)
  const norm = (s: string) => s.replace(/^_+/, '').toLowerCase()
  const dict = new Map(Object.entries(values).map(([k, v]) => [norm(k), v]))
  return (it.inputs ?? []).map((inp, i) => {
    const v = dict.get(norm(inp.name))
    if (v === undefined) throw new Error(`No value for ${fn} input #${i} "${inp.name}" (${inp.type})`)
    return v
  })
}

/* ---------- Wallet (injected EIP-1193) ---------- */
type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown>; on?: (e: string, f: (...a: unknown[]) => void) => void }
const eth = () => (window as unknown as { ethereum?: Eip1193 }).ethereum

export const wallet = {
  account: null as Address | null,
  chainId: null as number | null,
  client: null as WalletClient | null,
  listeners: new Set<() => void>(),
  emit() { this.listeners.forEach((f) => f()) },
  available() { return Boolean(eth()) },
  async connect() {
    const p = eth()
    if (!p) throw new Error('No injected wallet found. Install an EIP-1193 wallet (Rabby, MetaMask).')
    const accs = await p.request({ method: 'eth_requestAccounts' }) as Address[]
    this.account = accs[0] ?? null
    this.chainId = Number(await p.request({ method: 'eth_chainId' }))
    this.client = createWalletClient({ chain: ELYSIUM, transport: custom(p) })
    if (!this.bound) {
      this.bound = true
      p.on?.('accountsChanged', (a) => { this.account = ((a as Address[])[0]) ?? null; this.emit() })
      p.on?.('chainChanged', (c) => { this.chainId = Number(c as string); this.emit() })
    }
    this.emit()
  },
  bound: false,
  async ensureChain() {
    const p = eth()!
    if (this.chainId === ELYSIUM.id) return
    const hex = '0x' + ELYSIUM.id.toString(16)
    try {
      await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] })
    } catch (e) {
      const code = (e as { code?: number; data?: { originalError?: { code?: number } } }).code ?? (e as { data?: { originalError?: { code?: number } } }).data?.originalError?.code
      if (code !== 4902 && code !== -32603) throw e
      await p.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: hex, chainName: ELYSIUM.name, nativeCurrency: ELYSIUM.nativeCurrency,
          rpcUrls: [PUBLIC_RPC], blockExplorerUrls: [ELYSIUM.blockExplorers!.default.url],
        }],
      })
    }
    this.chainId = Number(await p.request({ method: 'eth_chainId' }))
    this.emit()
  },
}

export async function send(req: { address: Address; abi: Abi; functionName: string; args: unknown[]; value?: bigint }): Promise<Hash> {
  if (!wallet.client || !wallet.account) await wallet.connect()
  await wallet.ensureChain()
  // simulate first so a revert surfaces as a readable error before the wallet prompt
  const { request } = await pub.simulateContract({ ...req, account: wallet.account! } as Parameters<typeof pub.simulateContract>[0])
  return wallet.client!.writeContract({ ...(request as Parameters<WalletClient['writeContract']>[0]), account: wallet.account!, chain: ELYSIUM })
}
