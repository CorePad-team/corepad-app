import { h, price, hype, ago, errMsg } from '../ui'
import { mountField } from '../field'
import { DEPLOYED } from '../config'
import { subscribe, leftBps, stageOf, type Market, type Row } from '../market'
import { tableSection } from './ladder'
import { notDeployed, footer } from './common'

const TAGLINE = 'CorePad leverages Elysium to execute high-density launches, settling seamlessly into Hyperliquid Core.'
const code = (s: string) => h('code', null, s)
const SVGNS = 'http://www.w3.org/2000/svg'
const svg = (tag: string, attrs: Record<string, string>) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e }

const STEPS: { no: string; t: string; where: string; body: (string | Node)[] }[] = [
  { no: '01', t: 'Absorb', where: 'Elysium', body: ['A constant-product curve takes the opening burst on 100–200 ms blocks. 800 M of the 1 B supply are sold on the curve, with a 60 s launch guard of 1 % per address.'] },
  { no: '02', t: 'Graduate', where: 'Elysium', body: ['At 800 M sold the pool freezes. Anyone calls ', code('graduate()'), ': the HYPE raised and 200 M book tokens move to Settlement at ', code('listPrice'), '.'] },
  { no: '03', t: 'Settle', where: 'HyperEVM → HyperCore', body: ['A deterministic keeper registers the mirror, dispatches through the bridge, claims after the challenge period and runs the HIP-1 listing. Not dispatched in 7 days: anyone can abort and trading reopens.'] },
]

export function renderHome(root: HTMLElement) {
  /* ---------- 1. hero + closest to graduation ---------- */
  const statDefs: [string, string][] = [['launches', 'Launches'], ['absorbing', 'Absorbing now'], ['graduated', 'Curves closed'], ['volume', 'Volume · HYPE'], ['trades', 'Trades'], ['traders', 'Traders']]
  const statEls = new Map<string, HTMLElement>()
  const stats = h('div', { class: 'kpis' }, ...statDefs.map(([k, label]) => {
    const v = h('b', { class: 'n' }, '—'); statEls.set(k, v)
    return h('div', { class: 'kpi' }, v, h('span', null, label))
  }))

  const slots = Array.from({ length: 5 }, (_, i) => {
    const sym = h('b', null, '—'), nm = h('span', null, ''), pc = h('b', { class: 'n' }, ''), rs = h('span', { class: 'n' }, ''), bar = h('i', { style: 'width:0%' })
    const el = h('a', { class: 'crow', href: '#/ladder', hidden: '' },
      h('span', { class: 'rk n' }, String(i + 1)),
      h('span', { class: 'tk' }, sym, nm),
      h('span', { class: 'cr' }, pc, rs),
      h('span', { class: 'cbar2', 'aria-hidden': 'true' }, bar))
    return { el, sym, nm, pc, rs, bar }
  })
  const contEmpty = h('p', { class: 'hint pempty' }, DEPLOYED ? 'Reading launches…' : 'No deployment to read.')
  const contenders = h('aside', { class: 'panel' },
    h('div', { class: 'phead' }, h('span', { class: 'label' }, h('b', null, 'Closest to graduation')), h('a', { class: 'more', href: '#/ladder' }, 'See all →')),
    ...slots.map((s) => s.el), contEmpty)

  const closedSlots = Array.from({ length: 3 }, () => {
    const sym = h('b', null, ''), nm = h('span', null, ''), st = h('span', { class: 'state done' }, ''), raised = h('span', { class: 'n' }, '')
    const el = h('a', { class: 'gcard', href: '#/ladder', hidden: '' }, h('span', { class: 'tk' }, sym, nm), h('span', { class: 'gr' }, raised, st))
    return { el, sym, nm, st, raised }
  })
  const closedEmpty = h('p', { class: 'hint pempty' }, 'No curve has closed yet.')
  const closed = h('div', { class: 'panel' },
    h('div', { class: 'phead' }, h('span', { class: 'label' }, h('b', null, 'Curves closed')), h('a', { class: 'more', href: '#/ladder' }, 'All →')),
    ...closedSlots.map((s) => s.el), closedEmpty)

  root.append(h('section', { class: 'dash' },
    h('div', { class: 'hero2' },
      h('span', { class: 'label' }, (DEPLOYED ? 'Live on Elysium testnet · ' : '') + 'Elysium → HyperCore'),
      h('h1', null, 'Absorb. Graduate. Settle.'),
      h('p', { class: 'tag' }, TAGLINE),
      h('div', { class: 'cta' },
        h('a', { class: 'btn solid', href: '#/issue' }, '+ Issue a launch'),
        h('a', { class: 'btn', href: '#/ladder' }, 'Explore launches →')),
      stats),
    h('div', { class: 'side' }, contenders, closed)))

  /* ---------- 2. featured launch + recently closed ---------- */
  const f = { sym: h('b', null, '—'), nm: h('span', null, ''), pc: h('b', { class: 'n' }, '—'), raised: h('span', { class: 'n' }, ''), px: h('b', { class: 'n' }, '—'), trades: h('b', { class: 'n' }, '—'), traders: h('b', { class: 'n' }, '—'), vol: h('b', { class: 'n' }, '—'), bar: h('i', { style: 'width:0%' }) }
  const chart = svg('svg', { viewBox: '0 0 600 160', preserveAspectRatio: 'none', class: 'chart', 'aria-hidden': 'true' })
  for (const y of [40, 80, 120]) chart.append(svg('line', { x1: '0', x2: '600', y1: String(y), y2: String(y), class: 'grid' }))
  const line = svg('polyline', { points: '', class: 'pl' }); chart.append(line)
  const tip = svg('circle', { r: '4', class: 'tipdot', cx: '-100', cy: '-100' }); chart.append(tip)
  const chartNote = h('span', { class: 'hint chartnote' }, '')
  const featLabel = h('b', null, 'Next to graduate')
  const featLink = h('a', { class: 'btn solid', href: '#/ladder' }, 'Trade →')
  const featured = h('article', { class: 'feat' },
    h('div', { class: 'fhead' },
      h('div', null, h('span', { class: 'label' }, featLabel), h('div', { class: 'ftk' }, f.sym, f.nm)),
      h('div', { class: 'fbig' }, f.pc, h('span', { class: 'hint' }, 'of the curve sold'), f.raised)),
    h('div', { class: 'fbar', 'aria-hidden': 'true' }, f.bar),
    h('div', { class: 'chartbox' }, chart, chartNote),
    h('div', { class: 'fmeta' },
      h('div', null, h('span', { class: 'label' }, 'Price · HYPE'), f.px),
      h('div', null, h('span', { class: 'label' }, 'Volume · HYPE'), f.vol),
      h('div', null, h('span', { class: 'label' }, 'Trades'), f.trades),
      h('div', null, h('span', { class: 'label' }, 'Traders'), f.traders),
      h('div', { class: 'fgo' }, featLink)))

  const fills = Array.from({ length: 8 }, () => {
    const side = h('span', { class: 'side-b' }, ''), sym = h('b', null, ''), amt = h('span', { class: 'n' }, ''), who = h('span', { class: 'n' }, ''), blk = h('span', { class: 'n' }, '')
    const el = h('a', { class: 'fill', href: '#/ladder', hidden: '' }, side, h('span', { class: 'tk' }, sym, who), h('span', { class: 'fr' }, amt, blk))
    return { el, side, sym, amt, who, blk }
  })
  const fillsEmpty = h('p', { class: 'hint pempty' }, 'No trade yet.')
  const tape = h('aside', { class: 'panel' },
    h('div', { class: 'phead' }, h('span', { class: 'label' }, h('b', null, 'Latest trades')), h('span', { class: 'hint' }, 'all launches')),
    ...fills.map((x) => x.el), fillsEmpty)
  const featRow = h('section', { class: 'featrow' }, featured, tape)
  root.append(featRow)

  /* ---------- 3. launch table ---------- */
  let stopTable: (() => void) | null = null
  if (DEPLOYED) {
    const t = tableSection({ limit: 10 }); stopTable = t.stop
    root.append(h('div', { class: 'tsecwrap' }, h('div', { class: 'sh' }, h('h2', null, 'Launches'), h('a', { class: 'more', href: '#/ladder' }, 'Full table →')), t.el))
  } else root.append(notDeployed('The launch table'))

  /* ---------- 4. how it works, under the brand field ---------- */
  const canvas = h('canvas', { 'aria-hidden': 'true' })
  const dot = h('span', { class: 'dot-event', 'aria-hidden': 'true' })
  const zone = h('div', { class: 'fieldzone small', role: 'img', 'aria-label': 'Parallel rails rise into relief, then settle flat: the launch absorbed, then the order book.' }, canvas, dot)
  root.append(h('section', { class: 'how' },
    h('div', { class: 'sh' }, h('h2', null, 'How it works'), h('a', { class: 'more', href: '#/manual' }, 'Full mechanics in the Manual →')),
    zone,
    h('ol', { class: 'steps3' }, ...STEPS.map((s) => h('li', null,
      h('div', { class: 'sn' }, h('span', { class: 'n' }, s.no), h('span', { class: 'label' }, s.where)),
      h('h3', null, s.t), h('p', null, ...s.body))))), footer())
  const mobile = matchMedia('(max-width: 959px)').matches
  const stopField = mountField(canvas, mobile ? { pitch: 10, headroom: 0.3, amp: 0.78, spread: 1.35 } : { pitch: 9, headroom: 0.3 })
  const placeDot = () => { dot.style.left = Math.round(zone.clientWidth * 0.86) + 'px'; dot.style.top = Math.round(zone.clientHeight * 0.1) + 'px' }
  placeDot()
  const ro = new ResizeObserver(placeDot); ro.observe(zone)

  /* ---------- data: text and attributes only, structure is fixed ---------- */
  function paint(m: Market) {
    const t = m.totals
    statEls.get('launches')!.textContent = String(t.launches)
    statEls.get('absorbing')!.textContent = String(t.absorbing)
    statEls.get('graduated')!.textContent = String(t.graduated)
    statEls.get('volume')!.textContent = hype(t.volume, 2)
    statEls.get('trades')!.textContent = String(t.trades)
    statEls.get('traders')!.textContent = String(t.traders)

    const open = m.rows.filter((r) => r.state && !r.state.frozen).sort((a, b) => leftBps(a.state) - leftBps(b.state) || Number(b.launch.id - a.launch.id))
    slots.forEach((s, i) => {
      const r = open[i]
      if (!r) { s.el.hidden = true; return }
      s.el.hidden = false
      s.el.setAttribute('href', `#/launch/${r.launch.id}`)
      s.sym.textContent = r.launch.symbol
      s.nm.textContent = `${r.launch.name} · ${r.createdAt ? ago(m.now - r.createdAt) + ' ago' : '#' + r.launch.id}`
      s.pc.textContent = (r.state!.progress * 100).toFixed(1) + '%'
      s.rs.textContent = `${hype(r.state!.raised, 2)} / ${hype(r.state!.target, 2)} HYPE`
      s.bar.style.width = (r.state!.progress * 100).toFixed(2) + '%'
    })
    contEmpty.hidden = open.length > 0
    contEmpty.textContent = 'No launch is absorbing right now.'

    // the open launch closest to graduation, if it has a price history; otherwise the latest launch that has one
    const charted = (r: Row) => r.act.series.length >= 2
    const recent = [...m.rows].sort((a, b) => Number(b.launch.id - a.launch.id))
    const pick: Row | undefined = (open[0] && charted(open[0]) ? open[0] : undefined) ?? recent.find(charted) ?? open[0] ?? recent[0]
    featRow.hidden = !pick
    if (pick) {
      featLabel.textContent = pick.state?.frozen ? (pick.state.graduated ? 'Latest graduated' : 'Latest curve closed') : 'Next to graduate'
      const s = pick.state, sold = s ? (s.frozen ? 1 : s.progress) : 0
      f.sym.textContent = pick.launch.symbol
      f.nm.textContent = pick.launch.name
      f.pc.textContent = s ? (sold * 100).toFixed(1) + '%' : '—'
      f.raised.textContent = s ? (s.graduated ? `${hype(s.target, 2)} HYPE raised` : `${hype(s.raised, 2)} / ${hype(s.target, 2)} HYPE raised`) : ''
      f.bar.style.width = (sold * 100).toFixed(2) + '%'
      f.px.textContent = s ? price(s.price) : '—'
      f.vol.textContent = hype(pick.act.volume, 2)
      f.trades.textContent = String(pick.act.trades)
      f.traders.textContent = String(pick.act.traders.size)
      featLink.setAttribute('href', `#/launch/${pick.launch.id}`)
      featLink.textContent = s?.frozen ? 'View →' : 'Trade →'
      const pts = pick.act.series
      if (pts.length >= 2) {
        const ps = pts.map((p) => p.price), lo = Math.min(...ps), hi = Math.max(...ps), span = hi - lo || hi || 1
        const xy = pts.map((p, i) => [6 + (i / (pts.length - 1)) * 588, 148 - ((p.price - lo) / span) * 136] as const)
        line.setAttribute('points', xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '))
        const [lx, ly] = xy[xy.length - 1]
        tip.setAttribute('cx', lx.toFixed(1)); tip.setAttribute('cy', ly.toFixed(1))
        chartNote.textContent = `price after each of ${pts.length} trades · ${price(lo)} → ${price(ps[ps.length - 1])} HYPE`
      } else {
        line.setAttribute('points', ''); tip.setAttribute('cx', '-100')
        chartNote.textContent = pts.length ? 'One trade so far: the chart starts at the second.' : 'No trade yet on this curve.'
      }
    }

    const done = m.rows.filter((r) => r.state?.frozen).sort((a, b) => Number(b.launch.id - a.launch.id))
    closedSlots.forEach((s, i) => {
      const r = done[i]
      if (!r) { s.el.hidden = true; return }
      s.el.hidden = false
      s.el.setAttribute('href', `#/launch/${r.launch.id}`)
      s.sym.textContent = r.launch.symbol
      s.nm.textContent = r.launch.name
      s.raised.textContent = `${hype(r.state!.graduated ? r.state!.target : r.state!.raised, 2)} HYPE`
      s.st.textContent = stageOf(r.state)
    })
    closedEmpty.hidden = done.length > 0
    fills.forEach((x, i) => {
      const t = m.recent[i]
      if (!t) { x.el.hidden = true; return }
      x.el.hidden = false
      x.el.setAttribute('href', `#/launch/${t.id}`)
      x.side.textContent = t.isBuy ? 'BUY' : 'SELL'
      x.side.className = 'side-b' + (t.isBuy ? ' buy' : '')
      x.sym.textContent = t.symbol
      x.who.textContent = t.trader.slice(0, 6) + '…' + t.trader.slice(-4)
      x.amt.textContent = hype(t.hype, 4) + ' HYPE'
      x.blk.textContent = 'block ' + t.block.toLocaleString('en-US')
    })
    fillsEmpty.hidden = m.recent.length > 0
  }
  let unsub: (() => void) | null = null
  if (DEPLOYED) unsub = subscribe((m, err) => {
    if (m) paint(m)
    if (err && !m) contEmpty.textContent = 'STALE · ' + errMsg(err)
  })
  else featRow.hidden = true

  return () => { stopField(); ro.disconnect(); stopTable?.(); unsub?.() }
}
