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

// Public RPC direct first: each visitor spends their own rate limit. The same-origin proxy (one shared
// server IP, retries server-side) is the fallback when the public endpoint is down or throttling.
const proxy = RPC_OVERRIDE ?? (typeof location !== 'undefined' ? new URL('/api/rpc', location.origin).toString() : PUBLIC_RPC)
export const pub = createPublicClient({
  chain: ELYSIUM,
  transport: RPC_OVERRIDE ? http(RPC_OVERRIDE) : fallback([http(PUBLIC_RPC, { batch: { batchSize: 20 } }), http(proxy, { batch: { batchSize: 20 } })]),
  // one aggregate3 call carries hundreds of view reads: keeps a 100-pool table to one or two requests
  batch: { multicall: { batchSize: 65_536, wait: 16 } },
})

// getLogs travels alone: inside a JSON-RPC batch, one slow log scan would hold back every fast read
// sharing that HTTP request (pool states waited 2.6 s behind a history scan).
const logsClient = createPublicClient({
  chain: ELYSIUM,
  transport: RPC_OVERRIDE ? http(RPC_OVERRIDE) : fallback([http(PUBLIC_RPC), http(proxy)]),
})

/** Conduit answers -32017 "Rate Limit Exceeded" with HTTP 200; other nodes use -32005 or 429. */
export function isRateLimit(e: unknown): boolean {
  const m = String((e as { details?: string; message?: string })?.details ?? '') + ' ' + String((e as Error)?.message ?? e)
  return /rate.?limit|-32017|-32005|429|too many requests/i.test(m)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

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

/**
 * getLogs over [from, to]. A range or result-size refusal splits the range in two; a rate limit never
 * does (splitting multiplies the requests that caused it): it backs off and retries, then throws.
 */
export async function logsChunked(address: Address | Address[], event: AbiEvent, from: bigint, to: bigint, args?: Record<string, unknown>): Promise<Log[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await logsClient.getLogs({ address, event, args, fromBlock: from, toBlock: to } as Parameters<typeof logsClient.getLogs>[0]) as Log[]
    } catch (e) {
      if (isRateLimit(e)) {
        if (attempt >= 3) throw e
        await sleep(600 * 2 ** attempt)
        continue
      }
      if (to - from < 2000n) throw e
      const mid = from + (to - from) / 2n
      return [...await logsChunked(address, event, from, mid, args), ...await logsChunked(address, event, mid + 1n, to, args)]
    }
  }
}

/** Wide windows, oldest first (Elysium serves its whole history in one getLogs): one request when the node accepts it, a split only when it refuses the size. */
export async function logsWindowed(address: Address | Address[], event: AbiEvent, from: bigint, to: bigint, window = 50_000_000n, args?: Record<string, unknown>): Promise<Log[]> {
  const out: Log[] = []
  for (let a = from; a <= to; a += window) {
    const b = a + window - 1n < to ? a + window - 1n : to
    out.push(...await logsChunked(address, event, a, b, args))
  }
  return out
}

// LaunchCreated is append-only: keep it in the browser so a return visit only reads the new blocks
const LKEY = 'corepad.launches.' + (addresses.factory ?? '').toLowerCase()
function loadCache(): { at: bigint; list: Launch[] } | null {
  try {
    const j = JSON.parse(localStorage.getItem(LKEY) ?? 'null')
    if (!j || !Array.isArray(j.list)) return null
    return { at: BigInt(j.at), list: j.list.map((l: Record<string, string>) => ({ ...l, id: BigInt(l.id), block: BigInt(l.block) })) as Launch[] }
  } catch { return null }
}
function saveCache(c: { at: bigint; list: Launch[] }) {
  try { localStorage.setItem(LKEY, JSON.stringify({ at: String(c.at), list: c.list.map((l) => ({ ...l, id: String(l.id), block: String(l.block) })) })) } catch { /* private mode: no cache */ }
}
let launchCache: { at: bigint; list: Launch[] } | null = typeof localStorage !== 'undefined' ? loadCache() : null
let launchesInflight: Promise<Launch[]> | null = null

/** Every launch, from LaunchCreated. Concurrent callers share one read; ids are deduplicated. */
export function fetchLaunches(): Promise<Launch[]> {
  if (!launchesInflight) launchesInflight = readLaunches().finally(() => { launchesInflight = null })
  return launchesInflight
}
async function readLaunches(): Promise<Launch[]> {
  if (!addresses.factory) return []
  const ev = eventItem(abis.factory, 'LaunchCreated')
  if (!ev) throw new Error('LaunchCreated missing from the factory ABI')
  // shares the block-height read already in flight (viem dedupes within cacheTime)
  const head = await pub.getBlockNumber({ cacheTime: 2000 })
  const from = launchCache ? launchCache.at + 1n : START_BLOCK
  const logs = from <= head ? await logsWindowed(addresses.factory, ev, from, head) : []
  const have = new Set((launchCache?.list ?? []).map((l) => String(l.id)))
  const fresh = logs.map((l) => {
    const a = argsOf(l)
    return {
      id: BigInt(a.id as bigint), token: a.token as Address, pool: a.pool as Address, creator: a.creator as Address,
      name: String(a.name ?? ''), symbol: String(a.symbol ?? ''), block: l.blockNumber ?? 0n,
    }
  }).filter((l) => !have.has(String(l.id)))
  launchCache = { at: head, list: [...(launchCache?.list ?? []), ...fresh] }
  if (fresh.length || from <= head) saveCache(launchCache)
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
  if (!fn) return null // not in this ABI: genuinely unknown
  // A failed read must throw (callers keep the last good state and show STALE), never read as null/0.
  return await pub.readContract({ address, abi, functionName: fn, args }) as T
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
    virtualHype, virtualToken, sold: s, raised, target, graduated: Boolean(grad),
    // the pool's own flag: after an abort a sold-out curve is OPEN again (sells allowed), so sold >= 800 M is not 'frozen'
    frozen: Boolean(grad || (frozen ?? s >= FOR_SALE)), price, progress,
    launchedAt, guardSeconds, guardMax, guardActive, ticketId: ticketId && ticketId > 0n ? ticketId : null,
    hypeToGraduate: toGrad, tickerReserve,
  }
}

/** The seven fields a table row shows. The launch page reads the full state with poolState(). */
export async function poolStateLite(pool: Address): Promise<PoolState> {
  const a = abis.pool
  const [vH, vT, sold, raised, target, grad, frozen] = await Promise.all([
    readOpt<bigint>(pool, a, ['virtualHype', 'vHype', 'virtualHypeReserve']),
    readOpt<bigint>(pool, a, ['virtualToken', 'vToken', 'virtualTokenReserve']),
    readOpt<bigint>(pool, a, ['tokensSold', 'sold']),
    readOpt<bigint>(pool, a, ['realHype', 'hypeRaised']),
    readOpt<bigint>(pool, a, ['graduationHype', 'target']),
    readOpt<boolean>(pool, a, ['graduated']),
    readOpt<boolean>(pool, a, ['frozen', 'isFrozen']),
  ])
  const virtualHype = vH ?? 0n, virtualToken = vT ?? 0n, s = sold ?? 0n
  return {
    virtualHype, virtualToken, sold: s, raised, target, graduated: Boolean(grad),
    frozen: Boolean(grad || (frozen ?? s >= FOR_SALE)),
    price: virtualToken > 0n ? Number(formatEther(virtualHype)) / Number(formatEther(virtualToken)) : 0,
    progress: Math.min(1, Number((s * 1_000_000n) / FOR_SALE) / 1_000_000),
    launchedAt: null, guardSeconds: null, guardMax: null, guardActive: null, ticketId: null, hypeToGraduate: null, tickerReserve: null,
  }
}

export async function poolStates(pools: Address[], lite = true): Promise<Map<Address, PoolState>> {
  const out = new Map<Address, PoolState>()
  await Promise.all(pools.map(async (p) => { try { out.set(p, await (lite ? poolStateLite(p) : poolState(p))) } catch { /* row shows as unreadable */ } }))
  return out
}

/* ---------- Quotes: on-chain when the pool exposes them, else the SPEC curve math ---------- */
const FEE_BPS = 100n
/** `refund` is the HYPE the pool sends back on a clipped (graduation-crossing) buy; `spent` = hypeIn − refund. */
export type BuyQuote = { out: bigint; fee: bigint; refund: bigint; spent: bigint; clipped: boolean }
export async function quoteBuy(pool: Address, st: PoolState, hypeIn: bigint): Promise<BuyQuote> {
  const fn = firstFn(abis.pool, 'quoteBuy', 'getBuyQuote', 'previewBuy')
  if (fn) {
    try {
      const r = await pub.readContract({ address: pool, abi: abis.pool, functionName: fn, args: [hypeIn] }) as bigint | readonly bigint[]
      if (typeof r === 'bigint') return { out: r, fee: (hypeIn * FEE_BPS) / 10_000n, refund: 0n, spent: hypeIn, clipped: false }
      const refund = r[2] ?? 0n
      return { out: r[0], fee: r[1] ?? 0n, refund, spent: hypeIn - refund, clipped: refund > 0n }
    } catch { /* fall through to local math */ }
  }
  // Local fallback without the exact clip math: no refund is assumed, the buy is only flagged.
  const fee = (hypeIn * FEE_BPS) / 10_000n
  const net = hypeIn - fee
  const k = st.virtualHype * st.virtualToken
  let out = st.virtualToken - k / (st.virtualHype + net)
  const left = FOR_SALE - st.sold
  const clipped = out > left
  if (clipped) out = left
  return { out, fee, refund: 0n, spent: hypeIn, clipped }
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
export type Trade = { isBuy: boolean; trader: Address; hype: bigint; tokens: bigint; fee: bigint; block: bigint; tx: Hash; logIndex: number; pool: Address; price: number }
export function decodeTrade(l: Log): Trade {
  const a = argsOf(l)
  const isBuy = Boolean(a.isBuy)
  const pickN = (...k: string[]) => { for (const x of k) if (typeof a[x] === 'bigint') return a[x] as bigint; return 0n }
  return {
    isBuy, trader: a.trader as Address,
    hype: isBuy ? pickN('hypeIn', 'hypeAmount', 'hype') : pickN('hypeOut', 'hypeAmount', 'hype'),
    tokens: isBuy ? pickN('tokensOut', 'tokenAmount', 'tokens') : pickN('tokensIn', 'tokenAmount', 'tokens'),
    fee: pickN('fee'), block: l.blockNumber ?? 0n, tx: l.transactionHash as Hash, logIndex: l.logIndex ?? 0,
    pool: l.address as Address,
    // price right after the trade, from the reserves the event carries
    price: typeof a.virtualHype === 'bigint' && typeof a.virtualToken === 'bigint' && (a.virtualToken as bigint) > 0n
      ? Number(formatEther(a.virtualHype as bigint)) / Number(formatEther(a.virtualToken as bigint)) : 0,
  }
}
export async function fetchTrades(pool: Address, from: bigint, to: bigint): Promise<Trade[]> {
  const ev = eventItem(abis.pool, 'Trade')
  if (!ev) return []
  const logs = await logsWindowed(pool, ev, from, to)
  return logs.map(decodeTrade)
}

/* ---------- Pipeline (Settlement) ---------- */
/** `aborted`: the ticket was aborted after rescueDelay, its assets went back to the pool and trading reopened. */
export type Stage = 'absorption' | 'graduated' | 'dispatched' | 'confirmed' | 'aborted'
export type Pipeline = {
  stage: Stage; ticket: bigint | null; listPrice: bigint | null; hype: bigint | null; tokens: bigint | null
  coreTokenIndex: bigint | null; spotPairIndex: bigint | null; graduatedTx: Hash | null; dispatchedTx: Hash | null; confirmedTx: Hash | null
  abortedTx: Hash | null
  /** Settlement.abortableAt(id): unix seconds from which anyone can abort an open ticket (null when not open). */
  abortableAt: bigint | null
  /** adapter.isRouteReady(token): the HyperEVM mirror is registered and routed. null = could not be read */
  routeReady: boolean | null; mirror: Address | null
}
const STATES = ['none', 'open', 'dispatched', 'confirmed', 'aborted'] as const
/**
 * Ticket state from Settlement.getTicket (source of truth), tx hashes from its events.
 * Settlement.State: None, Open, Dispatched, Confirmed, Aborted. The pool keeps its latest ticket id,
 * so an aborted ticket stays readable while the curve trades again.
 */
export async function fetchPipeline(launch: Launch, st: PoolState): Promise<Pipeline> {
  const p: Pipeline = { stage: st.graduated ? 'graduated' : 'absorption', ticket: null, listPrice: null, hype: null, tokens: null, coreTokenIndex: null, spotPairIndex: null, graduatedTx: null, dispatchedTx: null, confirmedTx: null, abortedTx: null, abortableAt: null, routeReady: null, mirror: null }
  const settle = addresses.settlement
  if (!settle || st.ticketId === null) return p
  const id = st.ticketId
  p.ticket = id
  const t = await pub.readContract({ address: settle, abi: abis.settlement, functionName: 'getTicket', args: [id] }) as Record<string, unknown>
  p.listPrice = t.listPrice as bigint; p.hype = t.hype as bigint; p.tokens = t.tokens as bigint
  const state = STATES[Number(t.state)] ?? 'none'
  if (state === 'dispatched') p.stage = 'dispatched'
  if (state === 'confirmed') { p.stage = 'confirmed'; p.coreTokenIndex = BigInt(t.coreTokenIndex as bigint); p.spotPairIndex = BigInt(t.spotPairIndex as bigint) }
  if (state === 'aborted') p.stage = st.graduated ? 'graduated' : 'aborted'
  if (t.mirror && t.mirror !== '0x0000000000000000000000000000000000000000') p.mirror = t.mirror as Address
  if (state === 'open') {
    try { p.abortableAt = await pub.readContract({ address: settle, abi: abis.settlement, functionName: 'abortableAt', args: [id] }) as bigint } catch { p.abortableAt = null }
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
  if (p.stage === 'aborted') p.abortedTx = await txOf('Aborted')
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

/** Receipt of a mined tx; throws when it reverted (a mined revert is not a success). */
export async function mined(hash: Hash) {
  const rc = await pub.waitForTransactionReceipt({ hash })
  if (rc.status !== 'success') throw new Error(`Transaction reverted on-chain (tx ${hash.slice(0, 10)}…, block ${rc.blockNumber})`)
  return rc
}

/**
 * Simulate, then send. `gasBufferPct` adds headroom on top of the node's estimate (the wallet would
 * otherwise sign the exact estimate, which leaves no margin if state moves before inclusion).
 */
export async function send(req: { address: Address; abi: Abi; functionName: string; args: unknown[]; value?: bigint; gasBufferPct?: number }): Promise<Hash> {
  if (!wallet.client || !wallet.account) await wallet.connect()
  await wallet.ensureChain()
  const { gasBufferPct, ...call } = req
  // simulate first so a revert surfaces as a readable error before the wallet prompt
  const { request } = await pub.simulateContract({ ...call, account: wallet.account! } as Parameters<typeof pub.simulateContract>[0])
  let gas: bigint | undefined
  if (gasBufferPct) {
    const est = await pub.estimateContractGas({ ...call, account: wallet.account! } as Parameters<typeof pub.estimateContractGas>[0])
    gas = (est * BigInt(100 + gasBufferPct)) / 100n
  }
  return wallet.client!.writeContract({ ...(request as Parameters<WalletClient['writeContract']>[0]), account: wallet.account!, chain: ELYSIUM, ...(gas ? { gas } : {}) })
}

/* ---------- Block timestamps (cached; a block's time never changes) ---------- */
const blockTs = new Map<bigint, number>()
export async function blockTimes(blocks: bigint[]): Promise<Map<bigint, number>> {
  const need = [...new Set(blocks)].filter((b) => !blockTs.has(b))
  for (let i = 0; i < need.length; i += 40) {
    const part = need.slice(i, i + 40)
    const got = await Promise.all(part.map((b) => pub.getBlock({ blockNumber: b }).then((x) => Number(x.timestamp)).catch(() => null)))
    part.forEach((b, j) => { if (got[j] !== null) blockTs.set(b, got[j]!) })
  }
  return blockTs
}
