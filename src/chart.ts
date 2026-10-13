import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import { formatEther } from 'viem'
import { h, price } from './ui'
import { blockTimes } from './chain'

/** One point per trade: the price right after it and the HYPE it moved. */
export type Tick = { block: bigint; logIndex: number; price: number; hype: bigint; isBuy: boolean }

const C = { bg: '#18211A', line: '#2E4237', mint: '#B4E6D2', sec: '#6F9A8A', dim: '#2E4237', volUp: '#3F5C4D' }
const INTERVALS: [string, number][] = [['1m', 60], ['15m', 900], ['1h', 3600], ['1D', 86400]]

/**
 * TradingView Lightweight Charts, in the CorePad palette. Candles are built from Trade events: each
 * candle opens at the previous close, so a quiet interval never invents a gap. The TradingView
 * attribution link stays on, as the library's licence asks.
 */
export function mountTradeChart(host: HTMLElement, opts: { height?: number; compact?: boolean } = {}) {
  const box = h('div', { class: 'tvbox' + (opts.compact ? ' compact' : '') })
  const bar = h('div', { class: 'tvbar' })
  const note = h('span', { class: 'hint' }, '')
  const seg = h('div', { class: 'pills', role: 'group', 'aria-label': 'Candle interval' })
  let interval = 0 // 0 = auto
  const btns = INTERVALS.map(([n, sec]) => {
    const b = h('button', { type: 'button', 'aria-pressed': 'false' }, n)
    b.addEventListener('click', () => { interval = sec; btns.forEach((x, i) => x.setAttribute('aria-pressed', String(INTERVALS[i][1] === sec))); render() })
    return b
  })
  seg.append(...btns)
  if (!opts.compact) bar.append(seg)
  bar.append(note)
  const area = h('div', { class: 'tvarea', style: `height:${opts.height ?? 360}px` })
  box.append(area, bar)
  host.append(box)

  // the charting library loads on first use, so pages without a chart never download it
  let chart: IChartApi | null = null
  let candles: ISeriesApi<'Candlestick'> | null = null
  let vol: ISeriesApi<'Histogram'> | null = null
  let dead = false
  const ready = import('lightweight-charts').then(({ createChart, CandlestickSeries, HistogramSeries, ColorType, CrosshairMode }) => {
  if (dead) return
  chart = createChart(area, {
    autoSize: true,
    layout: { background: { type: ColorType.Solid, color: C.bg }, textColor: C.sec, fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 11, attributionLogo: true },
    grid: { vertLines: { color: C.line }, horzLines: { color: C.line } },
    rightPriceScale: { borderColor: C.line, scaleMargins: { top: 0.12, bottom: 0.28 } },
    timeScale: { borderColor: C.line, timeVisible: true, secondsVisible: false },
    crosshair: { mode: CrosshairMode.Normal, vertLine: { color: C.sec, labelBackgroundColor: C.mint }, horzLine: { color: C.sec, labelBackgroundColor: C.mint } },
    handleScroll: !opts.compact, handleScale: !opts.compact,
  })
  candles = chart.addSeries(CandlestickSeries, {
    // up = filled mint, down = hollow mint: the brand has one line colour, so direction is fill, not hue
    upColor: C.mint, downColor: C.bg, borderUpColor: C.mint, borderDownColor: C.mint, wickUpColor: C.mint, wickDownColor: C.mint,
    priceFormat: { type: 'custom', formatter: (p: number) => price(p), minMove: 1e-14 },
  })
  vol = chart.addSeries(HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false })
  chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
  render()
  })

  let ticks: Tick[] = []
  let times = new Map<bigint, number>()
  let gen = 0

  function render() {
    if (dead || !chart || !candles || !vol) return
    const pts = ticks.filter((t) => t.price > 0 && times.has(t.block)).sort((a, b) => Number(a.block - b.block) || a.logIndex - b.logIndex)
    if (!pts.length) { candles.setData([]); vol.setData([]); note.textContent = ticks.length ? 'Reading block times…' : 'No trade yet.'; return }
    const t0 = times.get(pts[0].block)!, t1 = times.get(pts[pts.length - 1].block)!
    const span = Math.max(1, t1 - t0)
    const step = interval || (span <= 2 * 3600 ? 60 : span <= 2 * 86400 ? 900 : span <= 30 * 86400 ? 3600 : 86400)
    if (!interval) btns.forEach((x, i) => x.setAttribute('aria-pressed', String(INTERVALS[i][1] === step)))
    const out: { time: UTCTimestamp; open: number; high: number; low: number; close: number }[] = []
    const vols: { time: UTCTimestamp; value: number; color: string }[] = []
    let prev = pts[0].price
    for (const p of pts) {
      const ts = (Math.floor(times.get(p.block)! / step) * step) as UTCTimestamp
      let c = out[out.length - 1]
      if (!c || c.time !== ts) { c = { time: ts, open: prev, high: Math.max(prev, p.price), low: Math.min(prev, p.price), close: p.price }; out.push(c); vols.push({ time: ts, value: 0, color: C.dim }) }
      c.high = Math.max(c.high, p.price); c.low = Math.min(c.low, p.price); c.close = p.price
      const v = vols[vols.length - 1]; v.value += Number(formatEther(p.hype)); v.color = c.close >= c.open ? C.volUp : C.dim
      prev = p.price
    }
    candles.setData(out); vol.setData(vols)
    chart.timeScale().fitContent()
    note.textContent = `${pts.length} trades · ${out.length} candles · price in HYPE/token`
  }

  return {
    async set(next: Tick[]) {
      const g = ++gen
      ticks = next
      render()
      const missing = next.filter((t) => !times.has(t.block)).map((t) => t.block)
      if (missing.length) {
        try { times = await blockTimes(missing) } catch { /* keep what we have */ }
        if (g === gen && !dead) render()
      }
    },
    destroy() { if (dead) return; dead = true; const c = chart; chart = candles = vol = null; c?.remove() },
    ready,
  }
}
