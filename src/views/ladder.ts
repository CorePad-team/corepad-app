import type { Address } from 'viem'
import { h, price, hype, errMsg, ago } from '../ui'
import { subscribe, leftBps, stageOf, type Market, type Row } from '../market'
import { DEPLOYED } from '../config'
import { notDeployed, footer } from './common'

export type Filter = 'all' | 'absorbing' | 'closed'
export type Sort = 'progress' | 'new' | 'volume' | 'raised'
type RowRefs = { el: HTMLElement; age: HTMLElement; px: HTMLElement; bar: HTMLElement; pc: HTMLElement; rs: HTMLElement; vol: HTMLElement; tr: HTMLElement; st: HTMLElement; act: HTMLElement }

const FILTERS: [Filter, string][] = [['all', 'All'], ['absorbing', 'Absorbing'], ['closed', 'Curve closed']]
const SORTS: [Sort, string][] = [['progress', 'Closest'], ['new', 'New'], ['volume', 'Volume'], ['raised', 'Raised']]

function header(): HTMLElement {
  return h('div', { class: 'thd', 'aria-hidden': 'true' },
    h('span', null, '#'), h('span', null, 'Launch'), h('span', { class: 'r' }, 'Price · HYPE'),
    h('span', null, 'Curve sold'), h('span', { class: 'r' }, 'Raised / target'), h('span', { class: 'r' }, 'Volume'),
    h('span', { class: 'r' }, 'Trades'), h('span', { class: 'r' }, 'State'), h('span', null, ''))
}

const matches = (r: Row, q: string) => {
  if (!q) return true
  const s = q.toLowerCase()
  const l = r.launch
  return l.symbol.toLowerCase().includes(s) || l.name.toLowerCase().includes(s) || l.token.toLowerCase().includes(s) || l.pool.toLowerCase().includes(s) || String(l.id) === s.replace(/^#/, '')
}

export function sortRows(rows: Row[], sort: Sort): Row[] {
  const out = [...rows]
  if (sort === 'new') out.sort((a, b) => Number(b.launch.id - a.launch.id))
  else if (sort === 'volume') out.sort((a, b) => (b.act.volume > a.act.volume ? 1 : b.act.volume < a.act.volume ? -1 : 0))
  else if (sort === 'raised') {
    const v = (r: Row) => r.state ? (r.state.graduated ? r.state.target ?? 0n : r.state.raised ?? 0n) : -1n
    out.sort((a, b) => (v(b) > v(a) ? 1 : v(b) < v(a) ? -1 : 0))
  } else {
    // open curves first, closest to graduation first; closed curves after
    out.sort((a, b) => {
      const fa = a.state?.frozen ? 1 : 0, fb = b.state?.frozen ? 1 : 0
      if (fa !== fb) return fa - fb
      return leftBps(a.state) - leftBps(b.state) || Number(b.launch.id - a.launch.id)
    })
  }
  return out
}

/**
 * Launch table. Rows are created once per launch and reordered only when the visible order changes;
 * every poll rewrites text and widths in place, so a row under the cursor is never replaced.
 */
export function mountTable(host: HTMLElement, opts: { limit?: number; filter: () => Filter; sort: () => Sort; query: () => string; onCount?: (m: Market, shown: number) => void }) {
  const body = h('div', { role: 'list' })
  const status = h('div', { class: 'empty' })
  host.append(h('div', { class: 'ltable' }, header(), body, status))
  const refs = new Map<Address, RowRefs>()
  let market: Market | null = null
  let sig = ''
  let stale = false

  function makeRow(r: Row): RowRefs {
    const l = r.launch
    const age = h('span', null, '')
    const px = h('span', null, '—'), pc = h('span', null, '—'), rs = h('span', null, '—'), vol = h('span', null, '—'), tr = h('span', null, '—')
    const bar = h('i', { style: 'width:0%' })
    const st = h('span', { class: 'state' }, '…')
    const act = h('span', { class: 'go' }, 'Trade')
    const el = h('a', { class: 'trow', href: `#/launch/${l.id}`, role: 'listitem', 'aria-label': `${l.symbol}, ${l.name}, launch ${l.id}` },
      h('span', { class: 'c-id' }, String(l.id).padStart(3, '0')),
      h('span', { class: 'c-tok' },
        h('span', { class: 'tile', 'aria-hidden': 'true' }, l.symbol.slice(0, 2)),
        h('span', { class: 'tk' }, h('b', null, l.symbol), h('span', null, l.name, h('span', { class: 'sep' }, ' · '), age))),
      h('span', { class: 'c-px n r' }, px),
      h('span', { class: 'c-pg' }, h('span', { class: 'pbar' }, bar), h('span', { class: 'n' }, pc)),
      h('span', { class: 'c-rs n r' }, rs),
      h('span', { class: 'c-vol n r' }, vol),
      h('span', { class: 'c-tr n r' }, tr),
      h('span', { class: 'c-st r' }, st),
      h('span', { class: 'c-go' }, act))
    return { el, age, px, bar, pc, rs, vol, tr, st, act }
  }

  function layout() {
    if (!market) return
    const f = opts.filter(), q = opts.query().trim()
    let list = market.rows.filter((r) => matches(r, q) && (f === 'all' || (r.state && (f === 'closed' ? r.state.frozen : !r.state.frozen))))
    list = sortRows(list, opts.sort())
    const shown = opts.limit ? list.slice(0, opts.limit) : list
    const nsig = shown.map((r) => r.launch.pool).join(',')
    if (nsig !== sig) {
      sig = nsig
      body.replaceChildren(...shown.map((r) => { let x = refs.get(r.launch.pool); if (!x) { x = makeRow(r); refs.set(r.launch.pool, x) } return x.el }))
    }
    for (const r of shown) {
      const x = refs.get(r.launch.pool)!, s = r.state
      x.age.textContent = r.createdAt ? ago(market.now - r.createdAt) + ' ago' : '#' + r.launch.id
      x.vol.textContent = hype(r.act.volume, 2)
      x.tr.textContent = String(r.act.trades)
      if (!s) { x.st.textContent = 'unreadable'; continue }
      const sold = s.frozen ? 1 : s.progress
      x.px.textContent = price(s.price)
      x.bar.style.width = (sold * 100).toFixed(2) + '%'
      x.pc.textContent = (sold * 100).toFixed(sold >= 1 ? 0 : 1) + '%'
      x.rs.textContent = s.graduated ? `${hype(s.target, 2)} → ticket` : `${hype(s.raised, 2)} / ${hype(s.target, 2)}`
      x.st.textContent = stageOf(s)
      x.st.className = 'state' + (s.frozen ? ' done' : '')
      x.act.textContent = s.frozen ? 'View' : 'Trade'
      x.act.className = 'go' + (s.frozen ? '' : ' solid')
    }
    opts.onCount?.(market, list.length)
    if (stale) return
    if (!market.rows.length) status.replaceChildren(h('p', { class: 'hint' }, 'No launch yet. Be the first: Issue a launch.'))
    else if (!list.length) status.replaceChildren(h('p', { class: 'hint' }, q ? `Nothing matches "${q}".` : f === 'absorbing' ? 'No launch is absorbing right now.' : 'No launches match this filter.'))
    else status.replaceChildren()
  }

  status.replaceChildren(h('p', { class: 'hint' }, 'Reading launches…'))
  const unsub = subscribe((m, err) => {
    if (err) { stale = true; status.replaceChildren(h('p', { class: 'stale' }, 'STALE · last read failed: ' + errMsg(err))); return }
    stale = false; market = m; layout()
  })
  return { stop: unsub, relayout: layout }
}

/** Tabs + sort pills over a table, shared by the home page and the Launches page. */
export function tableSection(opts: { limit?: number; query?: string; title?: boolean } = {}) {
  let filter: Filter = 'all'
  let sort: Sort = 'progress'
  let query = opts.query ?? ''
  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Filter launches' })
  const tabBtns = FILTERS.map(([f, n]) => {
    const b = h('button', { type: 'button', role: 'tab', 'aria-selected': String(f === filter) }, n, h('span', { class: 'cnt n' }, ''))
    b.addEventListener('click', () => { filter = f; tabBtns.forEach((x, i) => x.setAttribute('aria-selected', String(FILTERS[i][0] === f))); t.relayout() })
    return b
  })
  tabs.append(...tabBtns)
  const pills = h('div', { class: 'pills', role: 'group', 'aria-label': 'Sort launches' })
  const pillBtns = SORTS.map(([s, n]) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(s === sort) }, n)
    b.addEventListener('click', () => { sort = s; pillBtns.forEach((x, i) => x.setAttribute('aria-pressed', String(SORTS[i][0] === s))); t.relayout() })
    return b
  })
  pills.append(...pillBtns)
  const search = h('input', { class: 'tsearch', type: 'search', placeholder: 'Filter by name, ticker or address', value: query, 'aria-label': 'Filter launches' }) as HTMLInputElement
  search.addEventListener('input', () => { query = search.value; t.relayout() })
  const host = h('div')
  const el = h('section', { class: 'tsec' },
    h('div', { class: 'tbar' }, tabs, h('div', { class: 'tctl' }, search, pills)),
    host)
  const t = mountTable(host, {
    limit: opts.limit, filter: () => filter, sort: () => sort, query: () => query,
    onCount: (m) => {
      const n = [m.totals.launches, m.totals.absorbing, m.totals.graduated]
      tabBtns.forEach((b, i) => { (b.querySelector('.cnt') as HTMLElement).textContent = String(n[i]) })
    },
  })
  return { el, stop: t.stop, setQuery(q: string) { query = q; search.value = q; t.relayout() } }
}

export function renderLadder(root: HTMLElement, arg: string) {
  root.append(h('header', { class: 'pagehead' },
    h('span', { class: 'label' }, 'Launches'),
    h('h1', null, 'Every launch, live'),
    h('p', null, 'Read from LaunchCreated and each pool. At 800 M sold the curve freezes; anyone can call graduate() to open the settlement ticket.'),
  ))
  if (!DEPLOYED) { root.append(notDeployed('The launch table'), footer()); return }
  const s = tableSection({ query: arg })
  root.append(s.el, footer())
  return () => s.stop()
}
