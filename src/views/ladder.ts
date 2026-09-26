import type { Address } from 'viem'
import { h, price, pct, hype, errMsg } from '../ui'
import { fetchLaunches, poolStates, type Launch, type PoolState } from '../chain'
import { DEPLOYED } from '../config'
import { notDeployed, footer } from './common'

type Filter = 'all' | 'absorbing' | 'graduated'
type RowRefs = { el: HTMLElement; px: HTMLElement; fil: HTMLElement; pc: HTMLElement; rs: HTMLElement; st: HTMLElement }

/**
 * Launches as levels of an order book: one row per launch, the depth bar is the
 * distance travelled to graduation, the coral edge is the graduation line.
 * Rows are created once per launch; polling only rewrites text and widths.
 */
export function mountLadder(host: HTMLElement, opts: { limit?: number; filter?: () => Filter; onCount?: (n: number, grad: number) => void } = {}) {
  const hd = h('div', { class: 'hd', 'aria-hidden': 'true' },
    h('span', null, 'ID'), h('span', null, 'Ticker'), h('span', { class: 'r' }, 'Price · HYPE'),
    h('span', null, 'Depth to graduation'), h('span', { class: 'r' }, 'Raised · HYPE'), h('span', { class: 'r' }, 'State'))
  const body = h('div', { role: 'list' })
  const status = h('div', { class: 'empty' })
  host.append(h('div', { class: 'ladder' }, hd, body, status))
  const rows = new Map<Address, RowRefs>()
  let launches: Launch[] = []
  let states = new Map<Address, PoolState>()
  let sig = ''
  let alive = true

  function makeRow(l: Launch): RowRefs {
    const px = h('span', { class: 'num r c-px' }, '—')
    const fil = h('i', { class: 'fil', style: 'width:0%' })
    const pc = h('span', { class: 'pct' }, '—')
    const rs = h('span', { class: 'num r c-rs' }, '—')
    const st = h('span', { class: 'state' }, '…')
    const el = h('a', { class: 'lv', href: `#/launch/${l.id}`, role: 'listitem' },
      h('span', { class: 'id' }, String(l.id).padStart(3, '0')),
      h('span', { class: 'c-sym' }, h('span', { class: 'sym' }, l.symbol), h('span', { class: 'nm' }, l.name)),
      px,
      h('span', { class: 'depth c-dp' }, h('i', { class: 'trk' }), fil, h('i', { class: 'gl' }), pc),
      rs, st)
    return { el, px, fil, pc, rs, st }
  }

  function layout() {
    const f = opts.filter?.() ?? 'all'
    let list = launches.filter((l) => {
      const s = states.get(l.pool)
      if (f === 'all') return true
      if (!s) return false
      return f === 'graduated' ? s.frozen : !s.frozen
    })
    // closest to graduation on top, like the best level of a book
    list = list.sort((a, b) => (states.get(b.pool)?.progress ?? 0) - (states.get(a.pool)?.progress ?? 0) || Number(b.id - a.id))
    if (opts.limit) list = list.slice(0, opts.limit)
    const nsig = list.map((l) => l.pool).join(',')
    if (nsig !== sig) {
      sig = nsig
      body.replaceChildren(...list.map((l) => { let r = rows.get(l.pool); if (!r) { r = makeRow(l); rows.set(l.pool, r) } return r.el }))
    }
    for (const l of list) {
      const r = rows.get(l.pool)!, s = states.get(l.pool)
      if (!s) { r.st.textContent = 'unreadable'; continue }
      r.px.textContent = price(s.price)
      r.fil.style.width = (s.progress * 100).toFixed(2) + '%'
      r.pc.textContent = pct(s.progress, 1)
      r.rs.textContent = s.graduated ? (s.target !== null ? hype(s.target, 0) + ' → ticket' : '→ ticket') : s.raised !== null ? hype(s.raised, 2) + (s.target ? ' / ' + hype(s.target, 0) : '') : '—'
      r.st.textContent = s.graduated ? 'graduated' : s.frozen ? 'at the line' : 'absorbing'
      r.st.className = 'state ' + (s.frozen ? 'hot' : 'on')
    }
    const grad = launches.filter((l) => states.get(l.pool)?.frozen).length
    opts.onCount?.(launches.length, grad)
    if (!launches.length) status.replaceChildren(h('p', { class: 'hint', style: 'padding:18px 0' }, 'No launches yet. The first LaunchCreated event will open level 000.'))
    else if (!list.length) status.replaceChildren(h('p', { class: 'hint', style: 'padding:18px 0' }, 'No launches match this filter.'))
    else status.replaceChildren()
  }

  async function poll() {
    try {
      launches = await fetchLaunches()
      states = await poolStates(launches.map((l) => l.pool))
      if (alive) layout()
    } catch (e) {
      if (alive) status.replaceChildren(h('p', { class: 'err', style: 'padding:18px 0' }, 'Read failed: ' + errMsg(e)))
    }
  }
  status.replaceChildren(h('p', { class: 'hint', style: 'padding:18px 0' }, 'Reading LaunchCreated events…'))
  poll()
  const timer = setInterval(poll, 5000)
  return { stop() { alive = false; clearInterval(timer) }, relayout: layout }
}

export function renderLadder(root: HTMLElement) {
  const count = h('span', { class: 'num' }, '—')
  root.append(h('header', { class: 'pagehead' },
    h('span', { class: 'label' }, '01 · Ladder'),
    h('h1', null, 'Launches, level by level'),
    h('p', null, 'Every launch read from LaunchCreated on Elysium, ranked by distance to graduation. The coral edge is the line: 800 M tokens sold, the curve freezes and the book takes over.'),
  ))
  if (!DEPLOYED) { root.append(ghostLadder(), notDeployed('The launch ladder'), footer()); return }
  let filter: Filter = 'all'
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Filter launches' })
  const opts: Filter[] = ['all', 'absorbing', 'graduated']
  const btns = opts.map((f) => {
    const b = h('button', { 'aria-pressed': String(f === filter), type: 'button' }, f)
    b.addEventListener('click', () => { filter = f; btns.forEach((x, i) => x.setAttribute('aria-pressed', String(opts[i] === f))); lad.relayout() })
    return b
  })
  seg.append(...btns)
  root.append(h('div', { class: 'toolbar' }, seg, h('span', { class: 'hint' }, count), h('a', { class: 'btn', href: '#/issue' }, 'Issue a launch')))
  const host = h('div')
  root.append(host, footer())
  const lad = mountLadder(host, { filter: () => filter, onCount: (n, g) => { count.textContent = `${n} launches · ${g} at or past the line` } })
  return () => lad.stop()
}

/** Empty levels: the frame of the book, clearly with no data in it. */
export function ghostLadder(): HTMLElement {
  const hd = h('div', { class: 'hd', 'aria-hidden': 'true' },
    h('span', null, 'ID'), h('span', null, 'Ticker'), h('span', { class: 'r' }, 'Price · HYPE'),
    h('span', null, 'Depth to graduation'), h('span', { class: 'r' }, 'Raised · HYPE'), h('span', { class: 'r' }, 'State'))
  return h('div', { class: 'ladder', 'aria-hidden': 'true' }, hd, ...Array.from({ length: 3 }, () => h('div', { class: 'ghostlv' })))
}
