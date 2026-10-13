import { isAddress, getAddress, formatEther, type Address, type Log } from 'viem'
import { h, price, hype, tokens, short, addrLink, txLink, ext, errMsg, toast } from '../ui'
import { abis, pub, wallet, eventItem, logsWindowed, fetchLaunches, poolStates, quoteSell, decodeTrade, type Launch, type PoolState, type Trade } from '../chain'
import { DEPLOYED, ELYSIUM } from '../config'
import { notDeployed, footer } from './common'
import { stageOf } from '../market'

type Position = {
  l: Launch; st: PoolState | null; bal: bigint
  bought: bigint; sold: bigint; spent: bigint; received: bigint
  value: number; exit: number | null; pnl: number; pnlPct: number | null; entry: number | null
}

const num = (wei: bigint) => Number(formatEther(wei))
const signed = (x: number, d = 4) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
const pctTxt = (x: number | null) => x === null || !isFinite(x) ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x * 100).toFixed(1) + '%'

/**
 * Holdings and performance of one address, rebuilt from the chain: balances from each token,
 * cost from the address's own Trade events (gross HYPE paid on buys, net HYPE received on sells),
 * value at the current curve price, and what selling now would actually return.
 */
async function readProfile(who: Address) {
  const launches = await fetchLaunches()
  const head = await pub.getBlockNumber({ cacheTime: 0 })
  const ev = eventItem(abis.pool, 'Trade')
  const from = launches.reduce((m, l) => (l.block < m ? l.block : m), launches[0]?.block ?? head)
  const [bals, hypeBal, logs] = await Promise.all([
    Promise.all(launches.map((l) => pub.readContract({ address: l.token, abi: abis.token, functionName: 'balanceOf', args: [who] }).then((b) => b as bigint).catch(() => null))),
    pub.getBalance({ address: who }),
    ev && launches.length ? logsWindowed(launches.map((l) => l.pool), ev, from, head, 50_000_000n, { trader: who }) : Promise.resolve([] as Log[]),
  ])
  const trades: Trade[] = logs.map(decodeTrade).sort((a, b) => Number(b.block - a.block) || b.logIndex - a.logIndex)
  const touched = launches.filter((l, i) => (bals[i] ?? 0n) > 0n || trades.some((t) => t.pool.toLowerCase() === l.pool.toLowerCase()))
  const states = await poolStates(touched.map((l) => l.pool))
  const positions: Position[] = await Promise.all(touched.map(async (l) => {
    const bal = bals[launches.indexOf(l)] ?? 0n
    const st = states.get(l.pool) ?? null
    const mine = trades.filter((t) => t.pool.toLowerCase() === l.pool.toLowerCase())
    let bought = 0n, sold = 0n, spent = 0n, received = 0n
    for (const t of mine) { if (t.isBuy) { bought += t.tokens; spent += t.hype } else { sold += t.tokens; received += t.hype } }
    const value = st ? num(bal) * st.price : 0
    let exit: number | null = null
    if (st && !st.frozen && bal > 0n && bal <= st.sold) { try { exit = num((await quoteSell(l.pool, st, bal)).out) } catch { exit = null } }
    const pnl = value + num(received) - num(spent)
    return { l, st, bal, bought, sold, spent, received, value, exit, pnl, pnlPct: spent > 0n ? pnl / num(spent) : null, entry: bought > 0n ? num(spent) / num(bought) : null }
  }))
  positions.sort((a, b) => b.value - a.value || Number(b.l.id - a.l.id))
  const created = launches.filter((l) => l.creator.toLowerCase() === who.toLowerCase()).sort((a, b) => Number(b.id - a.id))
  const createdStates = await poolStates(created.filter((l) => !states.has(l.pool)).map((l) => l.pool))
  states.forEach((v, k) => createdStates.set(k, v))
  return { launches, positions, trades, hypeBal, created, createdStates }
}

export function renderProfile(root: HTMLElement, arg: string) {
  if (!DEPLOYED) { root.append(h('header', { class: 'pagehead' }, h('span', { class: 'label' }, 'Profile'), h('h1', null, 'Profile')), notDeployed('Holdings'), footer()); return }
  const target: Address | null = arg && isAddress(arg) ? getAddress(arg) : wallet.account ?? null

  const head = h('header', { class: 'pagehead phead2' })
  root.append(head)
  if (!target) {
    const input = h('input', { class: 'tsearch', placeholder: '0x… any address', 'aria-label': 'Address to inspect', style: 'width:100%' }) as HTMLInputElement
    const go = h('button', { class: 'btn', type: 'button' }, 'View')
    const connect = h('button', { class: 'btn solid', type: 'button' }, wallet.available() ? 'Connect wallet' : 'No wallet detected')
    connect.addEventListener('click', async () => {
      try { await wallet.connect(); if (wallet.chainId !== ELYSIUM.id) await wallet.ensureChain(); location.hash = '#/profile/' + wallet.account } catch (e) { toast(errMsg(e), true) }
    })
    const view = () => { const v = input.value.trim(); if (isAddress(v)) location.hash = '#/profile/' + v; else toast('Not an address', true) }
    go.addEventListener('click', view); input.addEventListener('keydown', (e) => { if (e.key === 'Enter') view() })
    head.append(h('span', { class: 'label' }, 'Profile'), h('h1', null, 'Your holdings'),
      h('p', null, 'Connect a wallet to see what it holds on CorePad and how each position performs, or look up any address.'),
      h('div', { class: 'pconnect' }, connect, h('div', { class: 'prow' }, input, go)))
    root.append(footer())
    return
  }

  const mine = wallet.account?.toLowerCase() === target.toLowerCase()
  head.append(h('span', { class: 'label' }, mine ? 'Profile · connected wallet' : 'Profile'),
    h('h1', { class: 'paddr' }, h('span', { class: 'tile big', 'aria-hidden': 'true' }, target.slice(2, 4)), short(target)),
    h('div', { class: 'addrs' }, h('span', null, ext(addrLink(target), target, { title: 'Open in the explorer' })),
      h('button', { class: 'linkbtn', type: 'button', onclick: () => navigator.clipboard?.writeText(target).then(() => toast('Copied ' + target)) }, 'copy')))

  const k = { value: h('b', { class: 'n' }, '—'), pnl: h('b', { class: 'n' }, '—'), pnlPct: h('span', { class: 'n' }, ''), hype: h('b', { class: 'n' }, '—'), pos: h('b', { class: 'n' }, '—'), trades: h('b', { class: 'n' }, '—'), created: h('b', { class: 'n' }, '—') }
  root.append(h('section', { class: 'pkpis' },
    h('div', { class: 'kpi' }, k.value, h('span', null, 'Holdings value · HYPE')),
    h('div', { class: 'kpi' }, h('div', { class: 'pl' }, k.pnl, k.pnlPct), h('span', null, 'P&L · HYPE')),
    h('div', { class: 'kpi' }, k.hype, h('span', null, 'HYPE balance · Elysium')),
    h('div', { class: 'kpi' }, k.pos, h('span', null, 'Open positions')),
    h('div', { class: 'kpi' }, k.trades, h('span', null, 'Trades')),
    h('div', { class: 'kpi' }, k.created, h('span', null, 'Launches created'))))

  const holdBody = h('div', { role: 'list' })
  const holdStatus = h('div', { class: 'empty' }, h('p', { class: 'hint' }, 'Reading balances and trades…'))
  root.append(h('div', { class: 'tsecwrap' }, h('div', { class: 'sh' }, h('h2', null, 'Holdings'), h('span', { class: 'hint' }, 'value at the current curve price')),
    h('section', { class: 'tsec' }, h('div', { class: 'ltable ptable' },
      h('div', { class: 'thd', 'aria-hidden': 'true' }, h('span', null, 'Launch'), h('span', { class: 'r' }, 'Balance'), h('span', { class: 'r' }, 'Avg entry'), h('span', { class: 'r' }, 'Price'),
        h('span', { class: 'r' }, 'Value'), h('span', { class: 'r' }, 'If sold now'), h('span', { class: 'r' }, 'P&L'), h('span', { class: 'r' }, 'State'), h('span', null, '')),
      holdBody, holdStatus))))

  const actBody = h('div', { role: 'list' })
  const createdBody = h('div', { role: 'list' })
  root.append(h('div', { class: 'pcols' },
    h('section', { class: 'panel' }, h('div', { class: 'phead' }, h('span', { class: 'label' }, h('b', null, 'Activity')), h('span', { class: 'hint' }, 'latest 25 trades')), actBody),
    h('section', { class: 'panel' }, h('div', { class: 'phead' }, h('span', { class: 'label' }, h('b', null, 'Launches created'))), createdBody)), footer())

  let alive = true
  let sig = ''
  async function load() {
    try {
      const d = await readProfile(target!)
      if (!alive) return
      const open = d.positions.filter((p) => p.bal > 0n)
      const totalValue = open.reduce((a, p) => a + p.value, 0)
      const totalPnl = d.positions.reduce((a, p) => a + p.pnl, 0)
      const totalSpent = d.positions.reduce((a, p) => a + num(p.spent), 0)
      k.value.textContent = totalValue.toLocaleString('en-US', { maximumFractionDigits: 4 })
      k.pnl.textContent = signed(totalPnl)
      k.pnlPct.textContent = totalSpent > 0 ? ' ' + pctTxt(totalPnl / totalSpent) : ''
      k.hype.textContent = hype(d.hypeBal, 4)
      k.pos.textContent = String(open.length)
      k.trades.textContent = String(d.trades.length)
      k.created.textContent = String(d.created.length)

      // rows are rebuilt only when the set of positions changes; values are written in place
      const nsig = d.positions.map((p) => p.l.pool + (p.bal > 0n ? '1' : '0')).join(',')
      const cells = new Map<string, Record<string, HTMLElement>>()
      if (nsig !== sig) {
        sig = nsig
        holdBody.replaceChildren(...d.positions.map((p) => {
          const c: Record<string, HTMLElement> = {}
          for (const key of ['bal', 'entry', 'px', 'val', 'exit', 'pnl', 'pct', 'st', 'go']) c[key] = h('span', null, '—')
          const el = h('a', { class: 'trow' + (p.bal > 0n ? '' : ' closedpos'), href: `#/launch/${p.l.id}`, role: 'listitem', 'data-pool': p.l.pool },
            h('span', { class: 'c-tok' }, h('span', { class: 'tile', 'aria-hidden': 'true' }, p.l.symbol.slice(0, 2)), h('span', { class: 'tk' }, h('b', null, p.l.symbol), h('span', null, p.l.name + ' · #' + p.l.id))),
            h('span', { class: 'c-bal n r' }, c.bal), h('span', { class: 'c-en n r' }, c.entry), h('span', { class: 'c-px n r' }, c.px),
            h('span', { class: 'c-val n r' }, c.val), h('span', { class: 'c-ex n r' }, c.exit),
            h('span', { class: 'c-pnl n r' }, c.pnl, h('span', { class: 'pct' }, c.pct)),
            h('span', { class: 'c-st r' }, c.st), h('span', { class: 'c-go' }, c.go))
          ;(el as unknown as { _c: Record<string, HTMLElement> })._c = c
          return el
        }))
      }
      holdBody.querySelectorAll<HTMLElement>('.trow').forEach((el) => cells.set(el.dataset.pool!, (el as unknown as { _c: Record<string, HTMLElement> })._c))
      for (const p of d.positions) {
        const c = cells.get(p.l.pool); if (!c) continue
        c.bal.textContent = tokens(p.bal)
        c.entry.textContent = p.entry !== null ? price(p.entry) : '—'
        c.px.textContent = p.st ? price(p.st.price) : '—'
        c.val.textContent = p.value.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
        c.exit.textContent = p.exit !== null ? p.exit.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : p.st?.frozen && p.bal > 0n ? 'curve closed' : '—'
        c.pnl.textContent = signed(p.pnl)
        c.pct.textContent = ' ' + pctTxt(p.pnlPct)
        c.pnl.parentElement!.className = 'c-pnl n r ' + (p.pnl > 0 ? 'up' : p.pnl < 0 ? 'down' : '')
        c.st.className = 'state' + (p.st?.frozen ? ' done' : ''); c.st.textContent = p.bal > 0n ? stageOf(p.st) : 'Exited'
        c.go.className = 'go' + (p.st && !p.st.frozen ? ' solid' : ''); c.go.textContent = p.st && !p.st.frozen ? 'Trade' : 'View'
      }
      holdStatus.replaceChildren(d.positions.length ? '' : h('p', { class: 'hint' }, mine ? 'Nothing yet. Buy on an open curve and it shows up here.' : 'This address holds no CorePad token and has no trade.'))

      actBody.replaceChildren(...(d.trades.length ? d.trades.slice(0, 25).map((t) => {
        const l = d.launches.find((x) => x.pool.toLowerCase() === t.pool.toLowerCase())
        return h('div', { class: 'fill' },
          h('span', { class: 'side-b' + (t.isBuy ? ' buy' : '') }, t.isBuy ? 'BUY' : 'SELL'),
          h('span', { class: 'tk' }, h('a', { href: l ? `#/launch/${l.id}` : '#/ladder', style: 'color:inherit;text-decoration:none' }, h('b', null, l?.symbol ?? short(t.pool))), h('span', { class: 'n' }, tokens(t.tokens) + ' · block ' + t.block.toLocaleString('en-US'))),
          h('span', { class: 'fr' }, h('span', { class: 'n' }, hype(t.hype, 4) + ' HYPE'), h('span', { class: 'n' }, ext(txLink(t.tx), 'tx ' + t.tx.slice(0, 8) + '…'))))
      }) : [h('p', { class: 'hint pempty' }, 'No trade yet.')]))

      createdBody.replaceChildren(...(d.created.length ? d.created.map((l) => {
        const st = d.createdStates.get(l.pool) ?? null
        return h('a', { class: 'gcard', href: `#/launch/${l.id}` }, h('span', { class: 'tk' }, h('b', null, l.symbol), h('span', null, l.name + ' · #' + l.id)),
          h('span', { class: 'gr' }, h('span', { class: 'n' }, st ? (st.frozen ? '100%' : (st.progress * 100).toFixed(1) + '%') + ' sold' : '—'), h('span', { class: 'state' + (st?.frozen ? ' done' : '') }, stageOf(st))))
      }) : [h('p', { class: 'hint pempty' }, 'No launch issued from this address.')]))
    } catch (e) {
      if (!holdBody.childElementCount) holdStatus.replaceChildren(h('p', { class: 'stale' }, 'Read failed, retrying · ' + errMsg(e)))
    }
  }
  load()
  const timer = window.setInterval(load, 12000)
  const onWallet = () => { if (!arg && wallet.account && wallet.account.toLowerCase() !== target.toLowerCase()) location.hash = '#/profile/' + wallet.account }
  wallet.listeners.add(onWallet)
  return () => { alive = false; clearInterval(timer); wallet.listeners.delete(onWallet) }
}
