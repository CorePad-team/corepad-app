import type { Address, Log } from 'viem'
import { formatEther } from 'viem'
import { pub, abis, eventItem, logsWindowed, fetchLaunches, poolStates, type Launch, type PoolState } from './chain'
import { DEPLOYED } from './config'
import { refreshMeta } from './meta'

/** Per-launch activity, rebuilt from the pool's own Trade events. */
export type Activity = {
  trades: number; buys: number; volume: bigint; traders: Set<Address>
  /** price after each trade, oldest first: virtualHype / virtualToken from the event */
  series: { block: bigint; logIndex: number; price: number; hype: bigint; isBuy: boolean }[]
  lastBlock: bigint
  /** newest last, capped */
  recent: Fill[]
}
export type Fill = { pool: Address; symbol: string; id: bigint; isBuy: boolean; hype: bigint; trader: Address; block: bigint; tx: string; logIndex: number }
export type Row = { launch: Launch; state: PoolState | null; act: Activity; createdAt: number | null }
export type Market = {
  rows: Row[]; head: bigint; now: number; recent: Fill[]
  totals: { launches: number; graduated: number; absorbing: number; volume: bigint; trades: number; traders: number; raised: bigint }
}

const acts = new Map<Address, Activity>()
/** last good pool state: a failed read keeps it instead of turning into zeros */
const lastState = new Map<Address, PoolState>()
let ticks = 0
const created = new Map<bigint, number>()
const tradeEv = eventItem(abis.pool, 'Trade')

function argsOf(l: Log): Record<string, unknown> { return ((l as unknown as { args?: Record<string, unknown> }).args ?? {}) }

const blank = (l: Launch): Activity => ({ trades: 0, buys: 0, volume: 0n, traders: new Set(), series: [], lastBlock: l.block - 1n, recent: [] })
/** every block up to here has been read for every known pool */
let tradeCursor: bigint | null = null
const known = new Set<Address>()

/**
 * Trades of ALL pools in one getLogs per window (address array), from a single cursor.
 * A pool that appears later is read from its own launch block once, then joins the cursor.
 */
async function refreshActivity(launches: Launch[], head: bigint): Promise<void> {
  if (!tradeEv || !launches.length) return
  const fresh = launches.filter((l) => !known.has(l.pool))
  if (fresh.length) {
    const from = fresh.reduce((m, l) => (l.block < m ? l.block : m), fresh[0].block)
    const to = tradeCursor ?? head
    if (from <= to) apply(await logsWindowed(fresh.map((l) => l.pool), tradeEv, from, to), launches)
    fresh.forEach((l) => { known.add(l.pool); if (!acts.has(l.pool)) acts.set(l.pool, blank(l)) })
    if (tradeCursor === null) tradeCursor = to
  }
  if (tradeCursor !== null && head > tradeCursor) {
    apply(await logsWindowed([...known], tradeEv, tradeCursor + 1n, head), launches)
    tradeCursor = head
  }
}

function apply(logs: Log[], launches: Launch[]) {
  const byPool = new Map(launches.map((l) => [l.pool.toLowerCase(), l]))
  logs.sort((x, y) => Number((x.blockNumber ?? 0n) - (y.blockNumber ?? 0n)) || (x.logIndex ?? 0) - (y.logIndex ?? 0))
  for (const log of logs) {
    const l = byPool.get(log.address.toLowerCase())
    if (!l) continue
    let a = acts.get(l.pool)
    if (!a) { a = blank(l); acts.set(l.pool, a) }
    const g = argsOf(log)
    a.trades++
    if (g.isBuy) a.buys++
    a.volume += (g.hypeAmount as bigint) ?? 0n
    if (g.trader) a.traders.add(g.trader as Address)
    a.recent.push({ pool: l.pool, symbol: l.symbol, id: l.id, isBuy: Boolean(g.isBuy), hype: (g.hypeAmount as bigint) ?? 0n, trader: g.trader as Address, block: log.blockNumber ?? 0n, tx: String(log.transactionHash), logIndex: log.logIndex ?? 0 })
    if (a.recent.length > 20) a.recent.shift()
    const vh = g.virtualHype as bigint | undefined, vt = g.virtualToken as bigint | undefined
    if (vh !== undefined && vt && vt > 0n) a.series.push({ block: log.blockNumber ?? 0n, logIndex: log.logIndex ?? 0, price: Number(formatEther(vh)) / Number(formatEther(vt)), hype: (g.hypeAmount as bigint) ?? 0n, isBuy: Boolean(g.isBuy) })
  }
}

let blockReads = 0
/**
 * Trades are slower than everything else on a first visit (the whole history of every pool):
 * give them a short window, then let the scan finish in the background and show up on the next tick.
 */
let inflight: Promise<void> | null = null
async function activityWithin(launches: Launch[], head: bigint, ms: number): Promise<void> {
  if (!inflight) inflight = refreshActivity(launches, head).catch(() => { /* cursor unchanged: next tick retries */ }).finally(() => { inflight = null; kick() })
  await Promise.race([inflight, new Promise((r) => setTimeout(r, ms))])
}
/** a finished background scan refreshes the views at once instead of waiting a full interval */
let kick = () => {}

async function createdAt(l: Launch): Promise<number | null> {
  const c = created.get(l.id)
  if (c !== undefined) return c
  if (blockReads++ >= 12) return null // the rest are read on the next ticks
  try {
    const b = await pub.getBlock({ blockNumber: l.block })
    created.set(l.id, Number(b.timestamp))
    return Number(b.timestamp)
  } catch { return null }
}

/** One read of everything the dashboard shows. Throws on a failed read: callers keep the last good view. */
export async function readMarket(): Promise<Market> {
  if (!DEPLOYED) return { rows: [], head: 0n, now: Date.now() / 1000, recent: [], totals: { launches: 0, graduated: 0, absorbing: 0, volume: 0n, trades: 0, traders: 0, raised: 0n } }
  const launches = await fetchLaunches()
  // fetchLaunches has just read the head: reuse it instead of a second round trip
  const head = await pub.getBlockNumber({ cacheTime: 4000 })
  blockReads = 0
  // graduated pools no longer move (an abort reopens them: re-read every 10th tick to catch it)
  ticks++
  const toRead = launches.filter((l) => { const s = lastState.get(l.pool); return !s || !s.graduated || ticks % 10 === 0 }).map((l) => l.pool)
  const [states, , times] = await Promise.all([
    poolStates(toRead),
    activityWithin(launches, head, 2500),
    Promise.all(launches.map(createdAt)),
  ])
  const actList = launches.map((l) => acts.get(l.pool) ?? blank(l))
  states.forEach((v, k) => lastState.set(k, v))
  const missing = launches.filter((l) => !states.has(l.pool) && !lastState.has(l.pool)).length
  const rows: Row[] = launches.map((l, i) => ({ launch: l, state: states.get(l.pool) ?? lastState.get(l.pool) ?? null, act: actList[i], createdAt: times[i] }))
  // nothing known for some pools yet: report it rather than counting them as zero
  if (missing && missing === launches.length) throw new Error('pool reads failed')
  const traders = new Set<Address>()
  let volume = 0n, trades = 0, raised = 0n, graduated = 0, absorbing = 0
  for (const r of rows) {
    r.act.traders.forEach((t) => traders.add(t))
    volume += r.act.volume; trades += r.act.trades
    if (r.state) {
      if (r.state.frozen) graduated++; else absorbing++
      raised += r.state.graduated ? (r.state.target ?? 0n) : (r.state.raised ?? 0n)
    }
  }
  const recent = rows.flatMap((r) => r.act.recent).sort((x, y) => Number(y.block - x.block) || y.logIndex - x.logIndex).slice(0, 8)
  return { rows, head, now: Date.now() / 1000, recent, totals: { launches: rows.length, graduated, absorbing, volume, trades, traders: traders.size, raised } }
}

/** Shared poller: every view subscribes to the same reads instead of polling on its own. */
const subs = new Set<(m: Market | null, err?: unknown) => void>()
let last: Market | null = null
let timer = 0
let busy = false
let fails = 0
async function tick() {
  if (busy) return
  busy = true
  try { last = await readMarket(); fails = 0; subs.forEach((f) => f(last)); void refreshMeta(last.rows.map((r) => r.launch.id)) }
  catch (e) {
    // a single throttled read is routine on a public node: only report a failure that persists
    fails++
    subs.forEach((f) => f(last, fails >= 3 || !last ? e : undefined))
  }
  finally { busy = false }
}
kick = () => { if (subs.size) setTimeout(tick, 50) }

/** Edge-cached snapshot (api/snapshot.js) for the first paint; the live read replaces it as soon as it lands. */
async function snapshot(): Promise<Market | null> {
  try {
    const r = await fetch('/api/snapshot', { headers: { accept: 'application/json' } })
    if (!r.ok) return null
    const j = await r.json() as { head: string; at: number; traders: number; rows: { launch: Record<string, string>; state: Record<string, unknown> | null; act: { trades: number; volume: string; traders: number } }[]; recent: Record<string, unknown>[] }
    const B = (v: unknown) => (v === null || v === undefined ? null : BigInt(v as string))
    const rows: Row[] = j.rows.map((x) => {
      const l = { ...x.launch, id: BigInt(x.launch.id), block: BigInt(x.launch.block) } as unknown as Launch
      const st = x.state ? {
        virtualHype: B(x.state.virtualHype)!, virtualToken: B(x.state.virtualToken)!, sold: B(x.state.sold)!, raised: B(x.state.raised), target: B(x.state.target),
        graduated: Boolean(x.state.graduated), frozen: Boolean(x.state.frozen), price: Number(x.state.price), progress: Number(x.state.progress),
        launchedAt: null, guardSeconds: null, guardMax: null, guardActive: null, ticketId: null, hypeToGraduate: null, tickerReserve: null,
      } as PoolState : null
      const act: Activity = { trades: x.act.trades, buys: 0, volume: BigInt(x.act.volume), traders: new Set(), series: [], lastBlock: 0n, recent: [] }
      return { launch: l, state: st, act, createdAt: null }
    })
    let volume = 0n, trades = 0, raised = 0n, graduated = 0, absorbing = 0
    for (const r of rows) { volume += r.act.volume; trades += r.act.trades; if (r.state) { if (r.state.frozen) graduated++; else absorbing++; raised += r.state.graduated ? (r.state.target ?? 0n) : (r.state.raised ?? 0n) } }
    const recent = j.recent.map((t) => ({ ...t, id: BigInt(t.id as string), hype: BigInt(t.hype as string), block: BigInt(t.block as string) })) as unknown as Fill[]
    return { rows, head: BigInt(j.head), now: Date.now() / 1000, recent, totals: { launches: rows.length, graduated, absorbing, volume, trades, traders: j.traders, raised } }
  } catch { return null }
}
export function subscribe(f: (m: Market | null, err?: unknown) => void): () => void {
  subs.add(f)
  if (last) f(last)
  if (!timer) {
    // first paint from the edge snapshot, unless the live read is already there
    if (!last) snapshot().then((m) => { if (m && !last) { last = m; subs.forEach((g) => g(m)); void refreshMeta(m.rows.map((r) => r.launch.id), true) } })
    tick(); timer = window.setInterval(tick, 8000)
  }
  return () => { subs.delete(f); if (!subs.size) { clearInterval(timer); timer = 0 } }
}

/** Remaining share of the 800 M sale in basis points (10 000 = nothing sold). */
export function leftBps(s: PoolState | null): number {
  if (!s) return 10_001
  if (s.frozen) return 0
  return Math.round((1 - s.progress) * 10_000)
}
export const stageOf = (s: PoolState | null) => !s ? 'unreadable' : s.graduated ? 'Graduated' : s.frozen ? 'Curve closed' : 'Absorbing'
