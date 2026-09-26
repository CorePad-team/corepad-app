import type { Address } from 'viem'
import { h, price, hype, errMsg, unit } from '../ui'
import { fetchLaunches, poolStates, type Launch, type PoolState } from '../chain'
import { DEPLOYED, FOR_SALE } from '../config'
import { notDeployed, footer } from './common'

type Filter = 'all' | 'absorbing' | 'graduated'
type RowRefs = { el: HTMLElement; px: HTMLElement; bar: HTMLElement; pc: HTMLElement; rs: HTMLElement; st: HTMLElement }

/** Remaining share of the 800 M sale, in basis points, computed on bigints. */
function remainingBps(s: PoolState): bigint {
  const left = s.sold >= FOR_SALE ? 0n : FOR_SALE - s.sold
  return (left * 10_000n) / FOR_SALE
}
const bpsPct = (b: bigint) => `${b / 100n}.${String(b % 100n).padStart(2, '0')}%`

function header(): HTMLElement {
  return h('div', { class: 'hd', 'aria-hidden': 'true' },
    h('span', { class: 'label' }, 'ID'), h('span', { class: 'label' }, 'Ticker'), h('span', { class: 'label r' }, 'Price · HYPE/token'),
    h('span', { class: 'label' }, 'To graduation · unsold'), h('span', { class: 'label r' }, 'Raised / target · HYPE'), h('span', { class: 'label r' }, 'State'))
}

/**
 * Launches as levels of a book. The rail under each row is the distance still to travel:
 * the unsold share of the 800 M sale. Rows are created once; polling only rewrites text and widths.
 */
export function mountLadder(host: HTMLElement, opts: { limit?: number; filter?: () => Filter; onCount?: (n: number, closed: number) => void } = {}) {
  const body = h('div', { role: 'list' })
  const status = h('div', { class: 'empty' })
  host.append(h('div', { class: 'ladder' }, header(), body, status))
  const rows = new Map<Address, RowRefs>()
  let launches: Launch[] = []
  let states = new Map<Address, PoolState>()
  let sig = ''
  let alive = true
  let stale = false

  function makeRow(l: Launch): RowRefs {
    const px = h('span', null, '—'), pc = h('span', null, '—'), rs = h('span', null, '—')
    const bar = h('i', { style: 'width:100%' })
    const st = h('span', { class: 'state' }, '…')
    const el = h('a', { class: 'lv', href: `#/launch/${l.id}`, role: 'listitem', 'aria-label': `${l.symbol}, ${l.name}, launch ${l.id}` },
      h('span', { class: 'id c-id' }, String(l.id).padStart(3, '0')),
      h('span', { class: 'c-sym' }, h('span', { class: 'sym' }, l.symbol), h('span', { class: 'nm' }, l.name)),
      h('span', { class: 'v r c-px' }, px, h('span', { class: 'ml' }, ' HYPE/token')),
      h('span', { class: 'dist c-dp' }, h('span', { class: 'trk' }, bar), h('span', { class: 'v' }, pc, h('span', { class: 'ml' }, ' left'))),
      h('span', { class: 'v r c-rs' }, h('span', { class: 'ml' }, 'raised '), rs), st)
    return { el, px, bar, pc, rs, st }
  }

  function layout() {
    const f = opts.filter?.() ?? 'all'
    let list = launches.filter((l) => {
      const s = states.get(l.pool)
      if (f === 'all') return true
      if (!s) return false
      return f === 'graduated' ? s.frozen : !s.frozen
    })
    list = list.sort((a, b) => {
      const ra = states.get(a.pool), rb = states.get(b.pool)
      const d = (ra ? remainingBps(ra) : 10_001n) - (rb ? remainingBps(rb) : 10_001n)
      return d !== 0n ? (d < 0n ? -1 : 1) : Number(b.id - a.id)
    })
    // active launches first (a proximity ranking), closed curves after a plain separator
    list = [...list.filter((l) => !states.get(l.pool)?.frozen), ...list.filter((l) => states.get(l.pool)?.frozen)]
    if (opts.limit) list = list.slice(0, opts.limit)
    const firstClosed = list.findIndex((l) => states.get(l.pool)?.frozen)
    const nsig = list.map((l) => l.pool).join(',') + '|' + firstClosed
    if (nsig !== sig) {
      sig = nsig
      const els: HTMLElement[] = list.map((l) => { let r = rows.get(l.pool); if (!r) { r = makeRow(l); rows.set(l.pool, r) } return r.el })
      if (firstClosed > 0) els.splice(firstClosed, 0, h('div', { class: 'lsep label', role: 'presentation' }, 'Curve closed'))
      body.replaceChildren(...els)
    }
    for (const l of list) {
      const r = rows.get(l.pool)!, s = states.get(l.pool)
      if (!s) { r.st.textContent = 'unreadable'; continue }
      const rem = remainingBps(s)
      r.px.textContent = price(s.price)
      r.bar.style.width = (Number(rem) / 100).toFixed(2) + '%'
      r.pc.textContent = s.frozen ? '0%' : bpsPct(rem)
      r.rs.textContent = s.graduated
        ? (s.target !== null ? unit(hype(s.target, 2), '→ ticket') : '→ ticket')
        : s.raised !== null ? `${hype(s.raised, 2)} / ${s.target !== null ? hype(s.target, 0) : '—'}` : '—'
      r.st.textContent = s.graduated ? 'Graduated' : s.frozen ? 'Curve closed' : 'Absorbing'
      r.st.className = 'state' + (s.frozen ? ' done' : '')
    }
    opts.onCount?.(launches.length, launches.filter((l) => states.get(l.pool)?.frozen).length)
    if (stale) return
    if (!launches.length) status.replaceChildren(h('p', { class: 'hint' }, 'No LaunchCreated events in this data source yet.'))
    else if (!list.length) status.replaceChildren(h('p', { class: 'hint' }, f === 'absorbing' ? 'No launch is absorbing right now.' : 'No launches match this filter.'))
    else status.replaceChildren()
  }

  async function poll() {
    try {
      launches = await fetchLaunches()
      states = await poolStates(launches.map((l) => l.pool))
      stale = false
      if (alive) layout()
    } catch (e) {
      // keep the last good rows; never replace a failed read with zeros
      stale = true
      if (alive) status.replaceChildren(h('p', { class: 'stale' }, 'STALE · last read failed: ' + errMsg(e)))
    }
  }
  status.replaceChildren(h('p', { class: 'hint' }, 'Reading LaunchCreated events…'))
  poll()
  const timer = setInterval(poll, 5000)
  return { stop() { alive = false; clearInterval(timer) }, relayout: layout }
}

export function renderLadder(root: HTMLElement) {
  root.append(h('header', { class: 'pagehead' },
    h('span', { class: 'label' }, '01 · Ladder'),
    h('h1', null, 'Launches, level by level'),
    h('p', null, 'Every launch from LaunchCreated, ordered by tokens left to sell. At 800 M sold the pool freezes and settlement begins after graduate().'),
  ))
  if (!DEPLOYED) { root.append(ghostLadder(), notDeployed('The launch ladder'), footer()); return }
  let filter: Filter = 'all'
  const count = h('span', { class: 'hint' }, '—')
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Filter launches' })
  const opts: Filter[] = ['all', 'absorbing', 'graduated']
  const names: Record<Filter, string> = { all: 'All', absorbing: 'Absorbing', graduated: 'Curve closed' }
  const btns = opts.map((f) => {
    const b = h('button', { 'aria-pressed': String(f === filter), type: 'button' }, names[f])
    b.addEventListener('click', () => { filter = f; btns.forEach((x, i) => x.setAttribute('aria-pressed', String(opts[i] === f))); lad.relayout() })
    return b
  })
  seg.append(...btns)
  root.append(h('div', { class: 'toolbar' }, seg, count, h('a', { class: 'btn', href: '#/issue' }, 'Issue a launch')))
  const host = h('div')
  root.append(host, footer())
  const lad = mountLadder(host, { filter: () => filter, onCount: (n, c) => { count.textContent = `${n} launches · ${c} curve closed` } })
  return () => lad.stop()
}

/** The frame of the book with no data in it. */
export function ghostLadder(): HTMLElement {
  return h('div', { class: 'ladder', 'aria-hidden': 'true' }, header(), ...Array.from({ length: 3 }, () => h('div', { class: 'ghostlv' })))
}
