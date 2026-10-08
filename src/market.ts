import type { Address, Log } from 'viem'
import { formatEther } from 'viem'
import { pub, abis, eventItem, logsChunked, fetchLaunches, poolStates, type Launch, type PoolState } from './chain'
import { DEPLOYED } from './config'

/** Per-launch activity, rebuilt from the pool's own Trade events. */
export type Activity = {
  trades: number; buys: number; volume: bigint; traders: Set<Address>
  /** price after each trade, oldest first: virtualHype / virtualToken from the event */
  series: { block: bigint; price: number }[]
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
const created = new Map<bigint, number>()
const tradeEv = eventItem(abis.pool, 'Trade')

function argsOf(l: Log): Record<string, unknown> { return ((l as unknown as { args?: Record<string, unknown> }).args ?? {}) }

async function refreshActivity(l: Launch, head: bigint): Promise<Activity> {
  let a = acts.get(l.pool)
  if (!a) { a = { trades: 0, buys: 0, volume: 0n, traders: new Set(), series: [], lastBlock: l.block - 1n, recent: [] }; acts.set(l.pool, a) }
  if (!tradeEv || a.lastBlock >= head) return a
  const logs = await logsChunked(l.pool, tradeEv, a.lastBlock + 1n, head)
  logs.sort((x, y) => Number((x.blockNumber ?? 0n) - (y.blockNumber ?? 0n)) || (x.logIndex ?? 0) - (y.logIndex ?? 0))
  for (const log of logs) {
    const g = argsOf(log)
    a.trades++
    if (g.isBuy) a.buys++
    a.volume += (g.hypeAmount as bigint) ?? 0n
    if (g.trader) a.traders.add(g.trader as Address)
    const vh = g.virtualHype as bigint | undefined, vt = g.virtualToken as bigint | undefined
    a.recent.push({ pool: l.pool, symbol: l.symbol, id: l.id, isBuy: Boolean(g.isBuy), hype: (g.hypeAmount as bigint) ?? 0n, trader: g.trader as Address, block: log.blockNumber ?? 0n, tx: String(log.transactionHash), logIndex: log.logIndex ?? 0 })
    if (a.recent.length > 20) a.recent.shift()
    if (vh !== undefined && vt && vt > 0n) a.series.push({ block: log.blockNumber ?? 0n, price: Number(formatEther(vh)) / Number(formatEther(vt)) })
  }
  a.lastBlock = head
  return a
}

async function createdAt(l: Launch): Promise<number | null> {
  const c = created.get(l.id)
  if (c !== undefined) return c
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
  const head = await pub.getBlockNumber({ cacheTime: 0 })
  const [states, actList, times] = await Promise.all([
    poolStates(launches.map((l) => l.pool)),
    Promise.all(launches.map((l) => refreshActivity(l, head))),
    Promise.all(launches.map(createdAt)),
  ])
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
async function tick() {
  try { last = await readMarket(); subs.forEach((f) => f(last)) }
  catch (e) { subs.forEach((f) => f(last, e)) }
}
export function subscribe(f: (m: Market | null, err?: unknown) => void): () => void {
  subs.add(f)
  if (last) f(last)
  if (!timer) { tick(); timer = window.setInterval(tick, 6000) }
  return () => { subs.delete(f); if (!subs.size) { clearInterval(timer); timer = 0 } }
}

/** Remaining share of the 800 M sale in basis points (10 000 = nothing sold). */
export function leftBps(s: PoolState | null): number {
  if (!s) return 10_001
  if (s.frozen) return 0
  return Math.round((1 - s.progress) * 10_000)
}
export const stageOf = (s: PoolState | null) => !s ? 'unreadable' : s.graduated ? 'Graduated' : s.frozen ? 'Curve closed' : 'Absorbing'
