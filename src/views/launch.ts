import { parseEther, formatEther } from 'viem'
import { h, price, pct, hype, tokens, short, addrLink, txLink, toast, errMsg } from '../ui'
import {
  abis, pub, wallet, send, fetchLaunches, poolState, quoteBuy, quoteSell, fetchTrades, fetchPipeline,
  firstFn, argsFor, type Launch, type PoolState, type Trade, type Pipeline,
} from '../chain'
import { DEPLOYED, SUPPLY, addresses } from '../config'
import { notDeployed, footer } from './common'

const SLIPS = [0.5, 1, 2, 5]
const DEADLINES = [2, 5, 20]

export function renderLaunch(root: HTMLElement, arg: string) {
  if (!DEPLOYED) {
    root.append(h('header', { class: 'pagehead' }, h('span', { class: 'label' }, '01 · Ladder · launch ' + (arg || '—')), h('h1', null, 'Launch')), notDeployed('This launch'), footer())
    return
  }
  let alive = true
  const timers: number[] = []
  const status = h('p', { class: 'hint', style: 'padding:28px var(--gut)' }, 'Reading launch ' + arg + '…')
  root.append(status)
  ;(async () => {
    let launch: Launch | undefined
    let id: bigint
    try { id = BigInt(arg) } catch { status.textContent = `"${arg}" is not a launch id.`; return }
    // a launch issued a moment ago may not be indexed by the node yet: retry for a few seconds
    for (let i = 0; i < 8 && alive && !launch; i++) {
      try { launch = (await fetchLaunches()).find((l) => l.id === id) }
      catch (e) { status.textContent = 'Read failed: ' + errMsg(e); status.className = 'err' }
      if (!launch) await new Promise((r) => setTimeout(r, 1500))
    }
    if (!alive) return
    if (!launch) { status.textContent = `No launch with id ${arg} in LaunchCreated.`; return }
    status.remove()
    build(root, launch, timers, () => alive)
  })()
  return () => { alive = false; timers.forEach(clearInterval) }
}

function build(root: HTMLElement, L: Launch, timers: number[], alive: () => boolean) {
  let st: PoolState | null = null
  let pipe: Pipeline | null = null

  /* ---- header ---- */
  root.append(h('header', { class: 'lhead' },
    h('span', { class: 'label' }, `01 · Ladder · level ${String(L.id).padStart(3, '0')}`),
    h('h1', null, L.symbol, h('span', null, L.name)),
    h('div', { class: 'addrs' },
      h('span', null, 'token ', h('a', { href: addrLink(L.token), target: '_blank', rel: 'noopener' }, short(L.token))),
      h('span', null, 'pool ', h('a', { href: addrLink(L.pool), target: '_blank', rel: 'noopener' }, short(L.pool))),
      h('span', null, 'creator ', h('a', { href: addrLink(L.creator), target: '_blank', rel: 'noopener' }, short(L.creator))),
    )))

  /* ---- main column ---- */
  const fill = h('i', { class: 'fil', style: 'width:0%' })
  const soldTxt = h('span', { class: 'num' }, '—')
  const raisedTxt = h('span', { class: 'num' }, '—')
  const curve = h('section', { class: 'curve', 'aria-label': 'Curve progress' },
    h('div', { style: 'display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap' },
      h('span', { class: 'label' }, 'Curve · distance to graduation'), h('span', { class: 'hint' }, soldTxt)),
    h('div', { class: 'cbar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, fill, h('i', { class: 'edge', title: 'Graduation: 800 M sold' })),
    h('div', { class: 'cscale' }, h('span', null, '0'), h('span', null, '200 M'), h('span', null, '400 M'), h('span', null, '600 M'), h('span', { class: 'coral' }, '800 M')),
    h('span', { class: 'hint' }, raisedTxt))
  const sPrice = h('span', { class: 'v' }, '—'), sCap = h('span', { class: 'v' }, '—'), sRes = h('span', { class: 'v' }, '—'), sGuard = h('span', { class: 'v' }, '—')
  const stats = h('div', { class: 'stats' },
    h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Price · HYPE'), sPrice),
    h('div', { class: 'stat' }, h('span', { class: 'label' }, 'FDV · HYPE'), sCap),
    h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Virtual reserves'), sRes),
    h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Launch guard'), sGuard))

  // pipeline tracker
  const stations = ['Absorption', 'Graduated', 'Dispatched', 'Confirmed on HyperCore'].map((t) => {
    const d = h('span', { class: 'd' }, '—')
    const li = h('li', null, h('span', { class: 't' }, t), d)
    return { li, d }
  })
  const trackAct = h('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' })
  const track = h('section', { class: 'track', 'aria-label': 'Pipeline' },
    h('span', { class: 'label' }, 'Pipeline · ticket'),
    h('ol', null, ...stations.map((s) => s.li)), trackAct)

  const main = h('div', { class: 'main' }, curve, stats, track)

  /* ---- side: ticket + tape ---- */
  let side: 'buy' | 'sell' = 'buy'
  let slip = 1, dl = 5
  const bBuy = h('button', { type: 'button', 'aria-pressed': 'true' }, 'Buy')
  const bSell = h('button', { type: 'button', class: 'sell', 'aria-pressed': 'false' }, 'Sell')
  const amt = h('input', { inputmode: 'decimal', autocomplete: 'off', placeholder: '0.0', 'aria-label': 'Amount' }) as HTMLInputElement
  const unit = h('span', { class: 'unit' }, 'HYPE')
  const bal = h('span', null, '')
  const maxBtn = h('button', { type: 'button', class: 'linkbtn', 'aria-label': 'Use maximum balance' }, 'max')
  const qOut = h('span', { class: 'num' }, '—'), qMin = h('span', { class: 'num' }, '—'), qFee = h('span', { class: 'num' }, '—'), qImp = h('span', { class: 'num' }, '—')
  const qOutK = h('span', null, 'You receive')
  const note = h('div', { class: 'hint' })
  const guardBox = h('div', { class: 'guard', style: 'display:none' })
  const submit = h('button', { class: 'btn solid wide', type: 'button' }, 'Buy')
  const slipSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Slippage' }, ...SLIPS.map((s) => h('button', { type: 'button', 'aria-pressed': String(s === slip), 'data-v': String(s) }, s + '%')))
  const dlSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Deadline' }, ...DEADLINES.map((m) => h('button', { type: 'button', 'aria-pressed': String(m === dl), 'data-v': String(m) }, m + 'm')))
  const ticketBody = h('div', { style: 'display:grid;gap:16px' },
    h('div', { class: 'side2', role: 'group', 'aria-label': 'Side' }, bBuy, bSell),
    h('div', { class: 'field' }, h('div', { class: 'flabel' }, h('span', null, 'Amount'), h('span', null, bal, ' ', maxBtn)), h('div', { class: 'input' }, amt, unit)),
    h('div', { style: 'display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center' },
      h('span', { class: 'label' }, 'Slippage'), slipSeg),
    h('div', { style: 'display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center' },
      h('span', { class: 'label' }, 'Deadline'), dlSeg),
    h('div', { class: 'quote' },
      h('div', null, qOutK, qOut), h('div', null, h('span', null, 'Minimum after slippage'), qMin),
      h('div', null, h('span', null, 'Fee · 1 % → treasury'), qFee), h('div', null, h('span', null, 'Price impact'), qImp)),
    guardBox, submit, note)
  const frozenBox = h('div', { style: 'display:none;gap:12px' })
  const ticket = h('section', { class: 'ticket', 'aria-label': 'Trade' }, h('span', { class: 'label' }, 'Ticket'), ticketBody, frozenBox)

  const tapeBody = h('div')
  const tape = h('section', { class: 'tape', 'aria-label': 'Recent trades' },
    h('div', { class: 'sidehead' }, h('span', { class: 'label' }, 'Tape · Trade events'), h('span', { class: 'hint' }, 'Elysium')),
    h('div', { class: 'th' }, h('span', null, 'Side'), h('span', { class: 'r' }, 'HYPE'), h('span', { class: 'r' }, L.symbol), h('span', { class: 'r' }, 'Trader')),
    tapeBody)
  root.append(h('div', { class: 'lp' }, main, h('aside', { class: 'side' }, ticket, tape)), footer())

  /* ---- ticket behaviour ---- */
  const setSide = (s: 'buy' | 'sell') => {
    side = s
    bBuy.setAttribute('aria-pressed', String(s === 'buy')); bSell.setAttribute('aria-pressed', String(s === 'sell'))
    unit.textContent = s === 'buy' ? 'HYPE' : L.symbol
    qOutK.textContent = 'You receive'
    submit.textContent = s === 'buy' ? 'Buy' : 'Sell'
    submit.className = 'btn wide ' + (s === 'buy' ? 'solid' : 'warn')
    amt.value = ''
    requote(); refreshBalance()
  }
  bBuy.addEventListener('click', () => setSide('buy'))
  bSell.addEventListener('click', () => setSide('sell'))
  slipSeg.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button'); if (!b) return
    slip = Number(b.dataset.v); slipSeg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); requote()
  })
  dlSeg.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button'); if (!b) return
    dl = Number(b.dataset.v); dlSeg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
  })

  let balWei: bigint | null = null
  async function refreshBalance() {
    if (!wallet.account) { bal.textContent = ''; balWei = null; return }
    try {
      balWei = side === 'buy'
        ? await pub.getBalance({ address: wallet.account })
        : await pub.readContract({ address: L.token, abi: abis.token, functionName: 'balanceOf', args: [wallet.account] }) as bigint
      bal.textContent = 'bal ' + (side === 'buy' ? hype(balWei, 4) : tokens(balWei))
    } catch { bal.textContent = '' }
  }
  maxBtn.addEventListener('click', () => {
    if (balWei === null) return
    // keep a little HYPE for gas on buys
    const v = side === 'buy' ? (balWei > parseEther('0.01') ? balWei - parseEther('0.01') : 0n) : balWei
    amt.value = formatEther(v); requote()
  })
  wallet.listeners.add(refreshBalance)

  const parsed = (): bigint | null => {
    const v = amt.value.trim().replace(',', '.')
    if (!v || !/^\d*\.?\d*$/.test(v)) return null
    try { const x = parseEther(v); return x > 0n ? x : null } catch { return null }
  }
  let qSeq = 0
  let lastMin: bigint | null = null
  let qTimer = 0
  function requote() { clearTimeout(qTimer); qTimer = window.setTimeout(doQuote, 200) }
  amt.addEventListener('input', requote)
  async function doQuote() {
    const x = parsed(); const seq = ++qSeq
    lastMin = null
    if (!x || !st) { qOut.textContent = qMin.textContent = qFee.textContent = qImp.textContent = '—'; note.textContent = ''; return }
    try {
      const bps = BigInt(Math.round(slip * 100))
      if (side === 'buy') {
        const q = await quoteBuy(L.pool, st, x); if (seq !== qSeq) return
        const min = (q.out * (10_000n - bps)) / 10_000n
        lastMin = min
        qOut.textContent = tokens(q.out) + ' ' + L.symbol
        qMin.textContent = tokens(min)
        qFee.textContent = hype(q.fee, 6) + ' HYPE'
        const exec = Number(formatEther(x - q.fee)) / Math.max(1e-30, Number(formatEther(q.out)))
        qImp.textContent = pct(exec / st.price - 1, 2)
        note.textContent = q.clipped ? 'This buy crosses the graduation line: it is clipped at 800 M and the excess HYPE is refunded.' : ''
      } else {
        const q = await quoteSell(L.pool, st, x); if (seq !== qSeq) return
        const min = (q.out * (10_000n - bps)) / 10_000n
        lastMin = min
        qOut.textContent = hype(q.out, 6) + ' HYPE'
        qMin.textContent = hype(min, 6)
        qFee.textContent = hype(q.fee, 6) + ' HYPE'
        const exec = Number(formatEther(q.out + q.fee)) / Math.max(1e-30, Number(formatEther(x)))
        qImp.textContent = pct(1 - exec / st.price, 2)
        note.textContent = ''
      }
    } catch (e) { if (seq === qSeq) note.textContent = 'Quote failed: ' + errMsg(e) }
  }

  submit.addEventListener('click', async () => {
    const x = parsed()
    if (!x) { toast('Enter an amount.', true); return }
    await doQuote()
    if (lastMin === null) { toast('No quote available.', true); return }
    const deadline = BigInt(Math.floor(Date.now() / 1000) + dl * 60)
    submit.setAttribute('disabled', '')
    const label = submit.textContent
    try {
      if (side === 'buy') {
        submit.textContent = 'Confirm in wallet…'
        const tx = await send({ address: L.pool, abi: abis.pool, functionName: 'buy', value: x,
          args: argsFor(abis.pool, 'buy', { minTokensOut: lastMin, minOut: lastMin, deadline }) })
        submit.textContent = 'Waiting for block…'
        await pub.waitForTransactionReceipt({ hash: tx })
        toast('Bought. tx ' + short(tx))
      } else {
        if (!wallet.account) await wallet.connect()
        const allowance = await pub.readContract({ address: L.token, abi: abis.token, functionName: 'allowance', args: [wallet.account!, L.pool] }) as bigint
        if (allowance < x) {
          submit.textContent = 'Approve in wallet…'
          const ap = await send({ address: L.token, abi: abis.token, functionName: 'approve', args: [L.pool, x] })
          await pub.waitForTransactionReceipt({ hash: ap })
        }
        submit.textContent = 'Confirm in wallet…'
        const tx = await send({ address: L.pool, abi: abis.pool, functionName: 'sell',
          args: argsFor(abis.pool, 'sell', { tokensIn: x, amount: x, tokenAmount: x, minHypeOut: lastMin, minOut: lastMin, deadline }) })
        submit.textContent = 'Waiting for block…'
        await pub.waitForTransactionReceipt({ hash: tx })
        toast('Sold. tx ' + short(tx))
      }
      amt.value = ''
      await refresh(); refreshBalance(); requote()
    } catch (e) { toast(errMsg(e), true, 9000) }
    finally { submit.removeAttribute('disabled'); submit.textContent = label }
  })

  /* ---- live state ---- */
  function paint() {
    if (!st) return
    fill.style.width = (st.progress * 100).toFixed(3) + '%'
    curve.querySelector('.cbar')!.setAttribute('aria-valuenow', (st.progress * 100).toFixed(1))
    soldTxt.textContent = `${tokens(st.sold)} / 800 M sold · ${pct(st.progress, 2)}`
    raisedTxt.textContent = st.graduated
      ? (pipe?.hype != null ? `Curve closed · ${hype(pipe.hype, 4)} HYPE and ${tokens(pipe.tokens)} moved to Settlement ticket #${pipe.ticket}` : 'Curve closed · assets moved to Settlement')
      : st.raised !== null
      ? `Raised ${hype(st.raised, 4)} of ${st.target !== null ? hype(st.target, 2) : '—'} HYPE` +
        (st.tickerReserve !== null ? ` · ticker reserve ${hype(st.tickerReserve, 2)} inside the target` : '') +
        (st.hypeToGraduate !== null && !st.frozen ? ` · ${hype(st.hypeToGraduate, 4)} HYPE (gross) to the line` : '')
      : ''
    sPrice.textContent = price(st.price)
    sCap.textContent = price(st.price * Number(formatEther(SUPPLY)))
    sRes.textContent = `${hype(st.virtualHype, 2)} H · ${tokens(st.virtualToken)}`
    const now = Math.floor(Date.now() / 1000)
    const gEnd = st.launchedAt !== null && st.guardSeconds !== null ? Number(st.launchedAt + st.guardSeconds) : null
    if (st.guardActive) {
      const left = gEnd !== null ? Math.max(0, gEnd - now) : null
      sGuard.textContent = left !== null ? `active · ${left}s` : 'active'
      guardBox.style.display = ''
      guardBox.textContent = `Launch guard${left !== null ? `: ${left}s left` : ''}. Each address may buy at most ${st.guardMax !== null ? tokens(st.guardMax) : '1 % of supply'} in total until it lifts.` +
        (guardLeft !== null ? ` Your remaining allowance: ${tokens(guardLeft)}.` : '')
    } else {
      sGuard.textContent = st.guardActive === null ? '—' : 'lifted'
      guardBox.style.display = 'none'
    }
    // frozen: no trading on the curve
    if (st.frozen) {
      ticketBody.style.display = 'none'
      frozenBox.style.display = 'grid'
    } else { ticketBody.style.display = 'grid'; frozenBox.style.display = 'none' }
  }

  let frozenSig = ''
  function paintFrozen() {
    const sig = `${st?.graduated}|${pipe?.stage}`
    if (sig === frozenSig) return
    frozenSig = sig
    const kids: Node[] = [h('p', { class: 'hint', style: 'margin:0' }, st?.graduated
      ? 'The curve is closed. Liquidity has left Elysium for Settlement; trading resumes on the HyperCore book once the ticket is confirmed.'
      : 'All 800 M are sold and the curve is frozen. Anyone can now call graduate() to open the settlement ticket.')]
    if (st && !st.graduated && firstFn(abis.pool, 'graduate')) {
      const b = h('button', { class: 'btn solid wide', type: 'button' }, 'Call graduate()')
      b.addEventListener('click', async () => {
        b.setAttribute('disabled', '')
        try { const tx = await send({ address: L.pool, abi: abis.pool, functionName: 'graduate', args: [] }); await pub.waitForTransactionReceipt({ hash: tx }); toast('Graduated. tx ' + short(tx)); await refresh() }
        catch (e) { toast(errMsg(e), true, 9000) } finally { b.removeAttribute('disabled') }
      })
      kids.push(b)
    }
    frozenBox.replaceChildren(...kids)
  }

  let trackSig = ''
  function paintTrack() {
    if (!st) return
    const stage = pipe?.stage ?? (st.graduated ? 'graduated' : 'absorption')
    const order = ['absorption', 'graduated', 'dispatched', 'confirmed']
    const idx = stage === 'rescued' ? 1 : order.indexOf(stage)
    stations.forEach((s, i) => {
      s.li.className = i < idx ? 'done' : i === idx ? 'now' : ''
      if (i === idx && idx === order.length - 1) s.li.className = 'done'
    })
    stations[0].d.textContent = st.frozen ? `closed at ${price(st.price)} HYPE` : `${pct(st.progress, 2)} of 800 M`
    stations[1].d.replaceChildren(pipe?.ticket !== null && pipe?.ticket !== undefined
      ? h('span', null, `ticket #${pipe.ticket} · listPrice ${pipe.listPrice !== null ? price(Number(formatEther(pipe.listPrice))) : '—'} `, pipe.graduatedTx ? h('a', { href: txLink(pipe.graduatedTx), target: '_blank', rel: 'noopener' }, 'tx') : '')
      : document.createTextNode(st.graduated ? 'ticket pending' : 'at 800 M sold'))
    stations[2].d.replaceChildren(pipe?.dispatchedTx
      ? h('span', null, 'bridged to coreSettler · ', h('a', { href: txLink(pipe.dispatchedTx), target: '_blank', rel: 'noopener' }, 'tx'), ' · challenge period applies')
      : document.createTextNode(stage === 'graduated' ? 'awaiting dispatch(id), permissionless' : 'Router + ArbSys → HyperEVM'))
    stations[3].d.replaceChildren(pipe?.stage === 'confirmed'
      ? h('span', null, `core token ${pipe.coreTokenIndex} · spot pair @${pipe.spotPairIndex} `, pipe.confirmedTx ? h('a', { href: txLink(pipe.confirmedTx), target: '_blank', rel: 'noopener' }, 'tx') : '')
      : document.createTextNode(pipe?.stage === 'rescued' ? 'rescued to treasury after 7 days' : 'keeper: HIP-1 + ladder at listPrice'))
    const sig = `${stage}|${pipe?.ticket}`
    if (sig === trackSig) return
    trackSig = sig
    trackAct.replaceChildren()
    if (stage === 'graduated' && pipe?.ticket !== null && pipe?.ticket !== undefined && pipe.ticket !== null) {
      const b = h('button', { class: 'btn', type: 'button' }, `dispatch(${pipe.ticket})`)
      const ticketId = pipe.ticket
      b.addEventListener('click', async () => {
        const settle = addresses.settlement
        if (!settle) return
        b.setAttribute('disabled', '')
        try { const tx = await send({ address: settle, abi: abis.settlement, functionName: 'dispatch', args: [ticketId] }); await pub.waitForTransactionReceipt({ hash: tx }); toast('Dispatched. tx ' + short(tx)); await refreshPipe() }
        catch (e) { toast(errMsg(e), true, 9000) } finally { b.removeAttribute('disabled') }
      })
      trackAct.append(b)
    }
  }

  let guardLeft: bigint | null = null
  async function refresh() {
    try {
      st = await poolState(L.pool)
      guardLeft = st.guardActive && wallet.account
        ? await pub.readContract({ address: L.pool, abi: abis.pool, functionName: 'guardRemaining', args: [wallet.account] }) as bigint
        : null
      if (alive()) { paint(); paintFrozen(); paintTrack() } } catch { /* keep last */ }
  }
  async function refreshPipe() {
    if (!st?.graduated) return
    try { pipe = await fetchPipeline(L, st); if (alive()) { paint(); paintTrack(); paintFrozen() } } catch { /* keep last */ }
  }

  /* ---- tape: incremental Trade logs ---- */
  const seen = new Set<string>()
  const trades: Trade[] = []
  let tapeFrom = L.block
  async function pullTape() {
    try {
      const head = await pub.getBlockNumber({ cacheTime: 0 })
      if (head < tapeFrom) return
      const fresh = await fetchTrades(L.pool, tapeFrom, head)
      tapeFrom = head + 1n
      let added = false
      for (const t of fresh) { const k = t.tx + ':' + t.logIndex; if (!seen.has(k)) { seen.add(k); trades.push(t); added = true } }
      if (!added && tapeBody.childElementCount) return
      trades.sort((a, b) => Number(b.block - a.block) || b.logIndex - a.logIndex)
      const top = trades.slice(0, 40)
      if (!top.length) { tapeBody.replaceChildren(h('div', { class: 'none' }, 'No trades yet.')); return }
      tapeBody.replaceChildren(...top.map((t) => h('a', { class: 'tr', href: txLink(t.tx), target: '_blank', rel: 'noopener', title: `block ${t.block}` },
        h('span', { class: t.isBuy ? 'b' : 's' }, t.isBuy ? 'BUY' : 'SELL'),
        h('span', { class: 'r' }, hype(t.hype, 4)),
        h('span', { class: 'r' }, tokens(t.tokens)),
        h('span', { class: 'r dim' }, short(t.trader)))))
    } catch (e) {
      if (!tapeBody.childElementCount) tapeBody.replaceChildren(h('div', { class: 'none err' }, 'Trade read failed: ' + errMsg(e)))
    }
  }

  refresh().then(() => { requote(); refreshPipe() })
  pullTape(); refreshBalance()
  timers.push(window.setInterval(refresh, 3000), window.setInterval(pullTape, 3000), window.setInterval(refreshPipe, 12000))
}
