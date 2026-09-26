import { parseEther, formatEther } from 'viem'
import { h, price, pct, hype, tokens, short, addrLink, txLink, ext, toast, errMsg, unit } from '../ui'
import {
  abis, pub, wallet, send, fetchLaunches, poolState, quoteBuy, quoteSell, fetchTrades, fetchPipeline,
  argsFor, type Launch, type PoolState, type Trade, type Pipeline,
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
  const cleanups: (() => void)[] = []
  const status = h('p', { class: 'hint', style: 'padding:28px var(--gut)' }, 'Reading launch ' + arg + '…')
  root.append(status)
  ;(async () => {
    let launch: Launch | undefined
    let id: bigint
    try { id = BigInt(arg) } catch { status.textContent = `"${arg}" is not a launch id.`; return }
    // a launch issued a moment ago may not be indexed by the node yet: retry for a few seconds
    for (let i = 0; i < 8 && alive && !launch; i++) {
      try { launch = (await fetchLaunches()).find((l) => l.id === id) }
      catch (e) { status.textContent = 'Read failed: ' + errMsg(e) }
      if (!launch) await new Promise((r) => setTimeout(r, 1500))
    }
    if (!alive) return
    if (!launch) { status.textContent = `No launch with id ${arg} in LaunchCreated.`; return }
    status.remove()
    build(root, launch, timers, cleanups, () => alive)
  })()
  return () => { alive = false; timers.forEach(clearInterval); cleanups.forEach((f) => f()) }
}


function build(root: HTMLElement, L: Launch, timers: number[], cleanups: (() => void)[], alive: () => boolean) {
  let st: PoolState | null = null
  let pipe: Pipeline | null = null
  let stale = false

  /* ---- identity ---- */
  const staleTag = h('span', { class: 'stale' })
  root.append(h('header', { class: 'lhead' },
    h('span', { class: 'label' }, `01 · Ladder · level ${String(L.id).padStart(3, '0')} `, staleTag),
    h('h1', null, L.symbol, h('span', null, L.name)),
    h('div', { class: 'addrs' },
      h('span', null, 'token ', ext(addrLink(L.token), short(L.token), { title: L.token })),
      h('span', null, 'pool ', ext(addrLink(L.pool), short(L.pool), { title: L.pool })),
      h('span', null, 'creator ', ext(addrLink(L.creator), short(L.creator), { title: L.creator })),
    )))

  /* ---- summary: curve sold ---- */
  const fill = h('i', { style: 'width:0%' })
  const soldTxt = h('span', { class: 'num' }, '—'), pctTxt = h('span', { class: 'num' }, '—')
  const m1k = h('span', null, 'Raised, net of fees'), m1 = h('span', { class: 'num' }, '—')
  const m2k = h('span', null, 'Gross buy to close'), m2 = h('span', { class: 'num' }, '—')
  const m3 = h('span', { class: 'num' }, '—')
  const cbar = h('div', { class: 'cbar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': 'Curve sold' }, fill)
  const summary = h('section', { class: 'curve a-summary', 'aria-label': 'Curve sold' },
    h('div', { class: 'top' }, h('span', { class: 'label' }, 'Curve sold'), h('span', null, soldTxt, ' ', h('span', { class: 'sec2' }, '/ 800 M'))),
    h('div', { class: 'top' }, h('span', { class: 'hint' }, 'sale allocation'), pctTxt),
    cbar,
    h('div', { class: 'cscale' }, h('span', null, '0'), h('span', { class: 'q' }, '200 M'), h('span', null, '400 M'), h('span', { class: 'q' }, '600 M'), h('span', null, '800 M')),
    h('div', { class: 'meta' }, h('div', null, m1k, m1), h('div', null, m2k, m2), h('div', null, h('span', null, 'Ticker reserve, inside the target'), m3)))

  /* ---- stats ---- */
  const sPriceK = h('span', { class: 'label' }, 'Price · HYPE/token'), sPrice = h('span', { class: 'v' }, '—')
  const sCap = h('span', { class: 'v' }, '—')
  const sVh = h('span', { class: 'v2' }, '—'), sVt = h('span', { class: 'v2' }, '—')
  const sGuard = h('span', { class: 'v' }, '—')
  const stats = h('div', { class: 'stats a-stats' },
    h('div', { class: 'stat' }, sPriceK, sPrice),
    h('div', { class: 'stat' }, h('span', { class: 'label' }, 'FDV · HYPE'), sCap),
    h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Virtual reserves'), sVh, sVt),
    h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Launch guard'), sGuard))

  /* ---- pipeline: vertical, evidence-led ---- */
  const trackTitle = h('span', { class: 'label' }, 'Launch pipeline')
  const trackSub = h('p', { class: 'note', style: 'margin:0' }, '')
  const STEPS = ['Absorption · launch history', 'Graduated · ticket open', 'Route ready · mirror registered', 'Dispatched', 'Withdrawals claimed', 'HIP-1 listing · deposit · ladder', 'Confirmed on HyperCore']
  const stations = STEPS.map((t) => {
    const d = h('span', { class: 'd' }, '—'), ev = h('span', { class: 'ev' }, '')
    const li = h('li', null, h('span', { class: 'mk', 'aria-hidden': 'true' }), h('div', null, h('span', { class: 't' }, t), h('br'), d), ev)
    return { li, d, ev }
  })
  const trackAct = h('div', { class: 'trackact' })
  const readiness = h('p', { class: 'hint', style: 'margin:0' },
    'Testnet readiness (SPEC, observed 2026-09-26): the testnet tickerReserve (0.5 HYPE) cannot pay a testnet ticker, whose auction ran 1,439.9 → 1,259.7 HYPE that day, and HyperCoreDepositFactory is not published on testnet. Until both change, the HIP-1 step is blocked on testnet.')
  const track = h('section', { class: 'track a-pipeline', 'aria-label': 'Pipeline' }, trackTitle, trackSub, h('ol', null, ...stations.map((s) => s.li)), trackAct, readiness)

  /* ---- ticket ---- */
  let side: 'buy' | 'sell' = 'buy'
  let slip = 1, dl = 5
  const bBuy = h('button', { type: 'button', 'aria-pressed': 'true' }, 'Buy')
  const bSell = h('button', { type: 'button', 'aria-pressed': 'false' }, 'Sell')
  const amt = h('input', { inputmode: 'decimal', autocomplete: 'off', placeholder: '0.0', 'aria-label': 'Amount' }) as HTMLInputElement
  const unitEl = h('span', { class: 'unit' }, 'HYPE')
  const bal = h('span', null, '')
  const maxBtn = h('button', { type: 'button', class: 'linkbtn', 'aria-label': 'Use maximum balance' }, 'max')
  const qOut = h('span', { class: 'num' }, '—'), qMin = h('span', { class: 'num' }, '—'), qFee = h('span', { class: 'num' }, '—'), qImp = h('span', { class: 'num' }, '—')
  const note = h('div', { class: 'note' })
  const guardBox = h('div', { class: 'guard', style: 'display:none' })
  const submit = h('button', { class: 'btn solid wide', type: 'button' }, 'Buy')
  const slipSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Slippage' }, ...SLIPS.map((s) => h('button', { type: 'button', 'aria-pressed': String(s === slip), 'data-v': String(s) }, s + '%')))
  const dlSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Deadline' }, ...DEADLINES.map((m) => h('button', { type: 'button', 'aria-pressed': String(m === dl), 'data-v': String(m) }, m + ' min')))
  const ticketBody = h('div', { style: 'display:grid;gap:16px' },
    h('div', { class: 'side2', role: 'group', 'aria-label': 'Side' }, bBuy, bSell),
    h('div', { class: 'field' }, h('div', { class: 'flabel' }, h('span', null, 'Amount'), h('span', null, bal, maxBtn)), h('div', { class: 'input' }, amt, unitEl)),
    h('div', { class: 'rowctl' }, h('span', { class: 'label' }, 'Slippage'), slipSeg),
    h('div', { class: 'rowctl' }, h('span', { class: 'label' }, 'Deadline'), dlSeg),
    h('div', { class: 'quote' },
      h('div', null, h('span', null, 'You receive'), qOut), h('div', null, h('span', null, 'Minimum after slippage'), qMin),
      h('div', null, h('span', null, 'Fee · 1 % → treasury'), qFee), h('div', null, h('span', null, 'Price impact'), qImp)),
    guardBox, submit, note)
  const closedBox = h('div', { style: 'display:none;gap:12px' })
  const ticket = h('section', { class: 'ticket a-ticket', 'aria-label': 'Trade' }, h('span', { class: 'label tlabel' }, 'Trade · curve'), ticketBody, closedBox)

  /* ---- tape ---- */
  const tapeBody = h('div')
  const tape = h('section', { class: 'tape a-tape', 'aria-label': 'Trade events' },
    h('div', { class: 'sidehead' }, h('span', { class: 'label' }, 'Tape · Trade events'),
      h('details', { class: 'hint' }, h('summary', null, 'How HYPE is counted'), h('p', { style: 'margin:6px 0 0' }, 'BUY: HYPE paid, after any refund, fee included. SELL: HYPE received, net of the 1 % fee.'))),
    h('div', { class: 'th', 'aria-hidden': 'true' }, h('span', { class: 'label' }, 'Block'), h('span', { class: 'label' }, 'Side'), h('span', { class: 'label r' }, 'HYPE'),
      h('span', { class: 'label r' }, L.symbol), h('span', { class: 'label r' }, 'Trader'), h('span', { class: 'label r c-tx' }, 'Tx')),
    tapeBody)
  const layout = h('div', { class: 'layout' }, summary, ticket, stats, track, tape)
  root.append(layout, footer())

  /* ---- ticket behaviour ---- */
  let busy = false
  let lastQuoteOk = false
  /** The action says exactly what is possible right now. */
  function updateAction() {
    if (busy) return
    const x = parsed()
    let label: string, ok = false
    if (!wallet.available()) label = 'Wallet required · no provider found'
    else if (!wallet.account) { label = 'Connect wallet'; ok = true }
    else if (!x) label = 'Enter an amount'
    else if (!lastQuoteOk) label = 'Quote unavailable'
    else { label = `${side === 'buy' ? 'Buy' : 'Sell'} ${L.symbol}`; ok = true }
    submit.textContent = label
    if (ok) submit.removeAttribute('disabled'); else submit.setAttribute('disabled', '')
  }
  wallet.listeners.add(updateAction)
  cleanups.push(() => wallet.listeners.delete(updateAction))
  const setSide = (s: 'buy' | 'sell') => {
    side = s
    bBuy.setAttribute('aria-pressed', String(s === 'buy')); bSell.setAttribute('aria-pressed', String(s === 'sell'))
    unitEl.textContent = s === 'buy' ? 'HYPE' : L.symbol
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
      bal.textContent = 'Balance ' + (side === 'buy' ? unit(hype(balWei, 4), 'HYPE') : tokens(balWei))
    } catch { bal.textContent = '' }
  }
  maxBtn.addEventListener('click', () => {
    if (balWei === null) return
    const v = side === 'buy' ? (balWei > parseEther('0.01') ? balWei - parseEther('0.01') : 0n) : balWei // keep gas on buys
    amt.value = formatEther(v); requote()
  })
  wallet.listeners.add(refreshBalance)
  cleanups.push(() => wallet.listeners.delete(refreshBalance))

  const parsed = (): bigint | null => {
    const v = amt.value.trim().replace(',', '.')
    if (!v || !/^\d*\.?\d*$/.test(v)) return null
    try { const x = parseEther(v); return x > 0n ? x : null } catch { return null }
  }
  let qSeq = 0, lastMin: bigint | null = null, qTimer = 0
  function requote() { clearTimeout(qTimer); qTimer = window.setTimeout(doQuote, 200) }
  amt.addEventListener('input', requote)
  async function doQuote() {
    const x = parsed(); const seq = ++qSeq
    lastMin = null; lastQuoteOk = false; updateAction()
    if (!x || !st) { qOut.textContent = qMin.textContent = qFee.textContent = qImp.textContent = '—'; note.textContent = ''; return }
    try {
      const bps = BigInt(Math.round(slip * 100))
      if (side === 'buy') {
        const q = await quoteBuy(L.pool, st, x); if (seq !== qSeq) return
        const min = (q.out * (10_000n - bps)) / 10_000n
        lastMin = min
        qOut.textContent = unit(tokens(q.out), L.symbol)
        qMin.textContent = tokens(min)
        qFee.textContent = unit(hype(q.fee, 6), 'HYPE')
        const exec = Number(formatEther(x - q.fee)) / Math.max(1e-30, Number(formatEther(q.out)))
        qImp.textContent = pct(exec / st.price - 1, 2)
        note.textContent = q.clipped ? 'This buy crosses the graduation line: it is clipped at 800 M and the excess HYPE is refunded.' : ''
        lastQuoteOk = q.out > 0n; updateAction()
      } else {
        const q = await quoteSell(L.pool, st, x); if (seq !== qSeq) return
        const min = (q.out * (10_000n - bps)) / 10_000n
        lastMin = min
        qOut.textContent = unit(hype(q.out, 6), 'HYPE')
        qMin.textContent = unit(hype(min, 6), 'HYPE')
        qFee.textContent = unit(hype(q.fee, 6), 'HYPE')
        const exec = Number(formatEther(q.out + q.fee)) / Math.max(1e-30, Number(formatEther(x)))
        qImp.textContent = pct(1 - exec / st.price, 2)
        note.textContent = ''
        lastQuoteOk = q.out > 0n; updateAction()
      }
    } catch (e) { if (seq === qSeq) { note.textContent = 'Quote unavailable: ' + errMsg(e); updateAction() } }
  }

  submit.addEventListener('click', async () => {
    if (!wallet.account) { try { await wallet.connect(); await wallet.ensureChain() } catch (e) { toast(errMsg(e)) } updateAction(); refreshBalance(); return }
    const x = parsed()
    if (!x) return
    await doQuote()
    if (lastMin === null) return
    const deadline = BigInt(Math.floor(Date.now() / 1000) + dl * 60)
    busy = true
    submit.setAttribute('disabled', '')
    try {
      if (side === 'buy') {
        submit.textContent = 'Confirm in wallet…'
        const tx = await send({ address: L.pool, abi: abis.pool, functionName: 'buy', value: x,
          args: argsFor(abis.pool, 'buy', { minTokensOut: lastMin, deadline }) })
        submit.textContent = 'Waiting for block…'
        await pub.waitForTransactionReceipt({ hash: tx })
        toast('Bought · tx ' + short(tx))
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
          args: argsFor(abis.pool, 'sell', { tokensIn: x, minHypeOut: lastMin, deadline }) })
        submit.textContent = 'Waiting for block…'
        await pub.waitForTransactionReceipt({ hash: tx })
        toast('Sold · tx ' + short(tx))
      }
      amt.value = ''
      await refresh(); refreshBalance(); requote(); pullTape()
    } catch (e) { toast(errMsg(e), false, 9000) }
    finally { busy = false; updateAction() }
  })

  /* ---- painting (text and widths only; structure changes behind signatures) ---- */
  function paint() {
    if (!st) return
    const done = st.frozen
    layout.classList.toggle('closed', done)
    fill.style.width = (st.progress * 100).toFixed(3) + '%'
    cbar.setAttribute('aria-valuenow', (st.progress * 100).toFixed(1))
    soldTxt.textContent = tokens(st.sold)
    pctTxt.textContent = pct(st.progress, 2)
    if (st.graduated) {
      m1k.textContent = 'Moved to Settlement'
      m1.textContent = pipe?.hype != null ? `${unit(hype(pipe.hype, 4), 'HYPE')} · ${tokens(pipe.tokens)}` : '—'
      m2k.textContent = 'Final curve price'
      m2.textContent = unit(price(st.price), 'HYPE/token')
    } else {
      m1k.textContent = 'Raised, net of fees'
      m1.textContent = st.raised !== null ? `${hype(st.raised, 4)} / ${st.target !== null ? unit(hype(st.target, 2), 'HYPE') : '—'}` : '—'
      m2k.textContent = done ? 'Gross buy to close' : 'Gross buy to close · quote'
      m2.textContent = st.hypeToGraduate !== null ? unit(hype(st.hypeToGraduate, 4), 'HYPE') : '—'
    }
    m3.textContent = st.tickerReserve !== null ? unit(hype(st.tickerReserve, 2), 'HYPE') : '—'
    sPriceK.textContent = done ? 'Final curve price · HYPE/token' : 'Price · HYPE/token'
    sPrice.textContent = price(st.price)
    sCap.textContent = price(st.price * Number(formatEther(SUPPLY)))
    sVh.textContent = unit(hype(st.virtualHype, 4), 'HYPE')
    sVt.textContent = tokens(st.virtualToken)
    const now = Math.floor(Date.now() / 1000)
    const gEnd = st.launchedAt !== null && st.guardSeconds !== null ? Number(st.launchedAt + st.guardSeconds) : null
    if (st.guardActive && !done) {
      const left = gEnd !== null ? Math.max(0, gEnd - now) : null
      sGuard.textContent = left !== null ? `${left} s left` : 'active'
      guardBox.style.display = ''
      guardBox.replaceChildren(h('b', null, 'LAUNCH GUARD ACTIVE'),
        `Each address may buy at most ${st.guardMax !== null ? tokens(st.guardMax) : '1 % of supply'} in total until it lifts.` +
        (guardLeft !== null ? ` Your remaining allowance: ${tokens(guardLeft)}.` : ''))
    } else {
      sGuard.textContent = st.guardActive === null ? '—' : 'lifted'
      guardBox.style.display = 'none'
    }
    ticket.querySelector<HTMLElement>('.tlabel')!.textContent = done ? 'Status' : 'Trade · curve'
    ticketBody.style.display = done ? 'none' : 'grid'
    closedBox.style.display = done ? 'grid' : 'none'
    staleTag.textContent = stale ? '· STALE, last read failed' : ''
  }

  let closedSig = ''
  function paintClosed() {
    const sig = `${st?.frozen}|${st?.graduated}|${st?.ticketId}`
    if (!st || sig === closedSig) return
    closedSig = sig
    const kids: Node[] = [
      h('strong', { style: 'font-weight:500;font-size:17px;line-height:24px' }, st.graduated ? `Curve closed · settlement ticket${st.ticketId !== null ? ' #' + st.ticketId : ''} open` : 'Curve closed · awaiting graduate()'),
      h('p', { class: 'note', style: 'margin:0' }, st.graduated
        ? 'No trading on the curve. Its HYPE and the 200 M book tokens are in Settlement; the next dependency is shown in the settlement tracker.'
        : 'All 800 M are sold and the pool is frozen: no buy, no sell. Anyone can call graduate() to open the settlement ticket.')]
    if (!st.graduated) {
      const b = h('button', { class: 'btn solid wide', type: 'button' }, 'Call graduate()')
      b.addEventListener('click', async () => {
        b.setAttribute('disabled', '')
        try { const tx = await send({ address: L.pool, abi: abis.pool, functionName: 'graduate', args: [] }); await pub.waitForTransactionReceipt({ hash: tx }); toast('Graduated · tx ' + short(tx)); await refresh(); await refreshPipe() }
        catch (e) { toast(errMsg(e), false, 9000) } finally { b.removeAttribute('disabled') }
      })
      kids.push(b)
    }
    closedBox.replaceChildren(...kids)
  }

  const txEv = (t: `0x${string}` | null) => t ? ext(txLink(t), 'tx ' + short(t), { title: t }) : document.createTextNode('')
  let actSig = ''
  async function paintTrack() {
    if (!st) return
    const tk = pipe?.ticket ?? null
    const stage = pipe?.stage ?? (st.graduated ? 'graduated' : 'absorption')
    // index of the first unresolved step; everything before it is done
    let cur: number
    if (stage === 'confirmed') cur = 7
    else if (stage === 'dispatched') cur = 4
    else if (stage === 'graduated' || stage === 'rescued') cur = tk === null ? 1 : pipe?.routeReady ? 3 : 2
    else cur = st.frozen ? 1 : 0
    stations.forEach((s, i) => {
      s.li.className = i < cur ? 'done' : i === cur ? 'now' : ''
      if (i === cur) s.li.setAttribute('aria-current', 'step'); else s.li.removeAttribute('aria-current')
    })
    trackTitle.textContent = tk !== null ? `Settlement · ticket #${tk}` : 'Launch pipeline'
    trackSub.textContent = tk !== null ? '' : 'No settlement ticket yet. One opens when graduate() runs on a sold-out curve.'
    trackSub.style.display = tk !== null ? 'none' : ''
    const [abs, grad, route, disp, claim, hip, conf] = stations
    abs.d.textContent = st.frozen
      ? `Curve closed at ${price(st.price)} HYPE/token.`
      : `${pct(st.progress, 2)} of 800 M sold. Executor: anyone. Next: ${tokens(800_000_000n * 10n ** 18n - st.sold)} left to sell.`
    abs.ev.textContent = `LaunchCreated · block ${L.block}`
    grad.d.textContent = tk !== null
      ? `Ticket #${tk} · listPrice ${pipe?.listPrice != null ? price(Number(formatEther(pipe.listPrice))) : '—'} HYPE/token.`
      : st.frozen ? 'Executor: anyone. Next: call graduate().' : 'Opens at 800 M sold, after graduate().'
    grad.ev.replaceChildren(txEv(pipe?.graduatedTx ?? null))
    route.d.textContent = cur > 2 ? 'The HyperEVM mirror is registered and the Elysium router routes it.'
      : cur < 2 ? 'Keeper registers the HyperEVM mirror (createAndRegisterL1Mirror) before dispatch.'
      : pipe?.routeReady === false ? 'Awaiting mirror registration. Executor: keeper on HyperEVM. dispatch() reverts until the route is ready.'
      : 'Route readiness could not be read from this data source (adapter.isRouteReady).'
    route.ev.textContent = cur >= 2 && tk !== null ? `isRouteReady: ${pipe?.routeReady === null ? 'unreadable' : pipe?.routeReady}` : ''
    disp.d.textContent = cur > 3 ? 'Tokens via the Router, HYPE via ArbSys, to coreSettler.'
      : cur === 3 ? 'Executor: anyone, dispatch(id). The route is ready.' : 'Router + ArbSys → HyperEVM coreSettler.'
    disp.ev.replaceChildren(txEv(pipe?.dispatchedTx ?? null))
    claim.d.textContent = cur > 4 ? 'Implied by confirm(); not observable from Elysium.'
      : cur === 4 ? 'Orbit challenge period, then the keeper claims both withdrawals on HyperEVM. Not observable from Elysium.' : 'After the challenge period.'
    hip.d.textContent = cur > 5 ? 'Implied by confirm().' : `Keeper: HIP-1 ceremony within tickerBudget, deposit, TOKEN/USDC ladder around listPrice (converted from HYPE).`
    conf.d.textContent = stage === 'confirmed' ? `Core token ${pipe!.coreTokenIndex} · spot pair @${pipe!.spotPairIndex}` : 'Keeper calls confirm(id, coreTokenIndex, spotPairIndex).'
    conf.ev.replaceChildren(txEv(pipe?.confirmedTx ?? null))
    if (stage === 'rescued') { grad.d.textContent += ' Rescued to the treasury after rescueDelay; settlement will not proceed.' }

    // dispatch(id) is offered only when the chain itself says it would succeed right now
    const sig = `${stage}|${tk}|${pipe?.routeReady}`
    if (sig === actSig) return
    actSig = sig
    trackAct.replaceChildren()
    if (stage !== 'graduated' || tk === null || !addresses.settlement || pipe?.routeReady === false) return
    const settle = addresses.settlement
    const ticketId = tk
    try {
      await pub.simulateContract({ address: settle, abi: abis.settlement, functionName: 'dispatch', args: [ticketId], account: wallet.account ?? L.creator })
      const b = h('button', { class: 'btn', type: 'button' }, `dispatch(${ticketId})`)
      b.addEventListener('click', async () => {
        b.setAttribute('disabled', '')
        try { const tx = await send({ address: settle, abi: abis.settlement, functionName: 'dispatch', args: [ticketId] }); await pub.waitForTransactionReceipt({ hash: tx }); toast('Dispatched · tx ' + short(tx)); await refreshPipe() }
        catch (e) { toast(errMsg(e), false, 9000) } finally { b.removeAttribute('disabled') }
      })
      trackAct.append(b)
    } catch (e) {
      const known = /RouteNotReady/.test(String((e as Error).message)) ? 'RouteNotReady: the mirror is not registered yet' : 'reason unavailable'
      trackAct.append(h('details', { class: 'hint' }, h('summary', null, `Dispatch simulation failed · ${known}`), h('p', { style: 'margin:6px 0 0' }, errMsg(e))))
    }
  }

  let guardLeft: bigint | null = null
  async function refresh() {
    try {
      st = await poolState(L.pool)
      guardLeft = st.guardActive && wallet.account
        ? await pub.readContract({ address: L.pool, abi: abis.pool, functionName: 'guardRemaining', args: [wallet.account] }) as bigint
        : null
      stale = false
    } catch { stale = true }
    if (alive()) { paint(); paintClosed(); paintTrack() }
  }
  async function refreshPipe() {
    if (!st?.graduated) return
    try { pipe = await fetchPipeline(L, st); if (alive()) { paint(); paintTrack() } } catch { /* keep last */ }
  }

  /* ---- tape: incremental Trade logs, deduplicated by tx + log index ---- */
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
      if (!top.length) { tapeBody.replaceChildren(h('div', { class: 'none hint' }, 'No Trade events in this data source.')); return }
      tapeBody.replaceChildren(...top.map((t) => h('div', { class: 'tr' },
        h('span', { class: 'c-bk' }, 'block ' + t.block),
        h('span', { class: 'c-sd side-s' }, t.isBuy ? 'BUY' : 'SELL'),
        h('span', { class: 'c-hy r' }, unit(hype(t.hype, 4), 'HYPE')),
        h('span', { class: 'c-tk r' }, unit(tokens(t.tokens), L.symbol)),
        h('span', { class: 'c-tr r' }, ext(addrLink(t.trader), short(t.trader), { title: 'trader ' + t.trader })),
        h('span', { class: 'c-tx r', title: `tx ${t.tx} · log ${t.logIndex} · fee ${hype(t.fee, 6)} HYPE` }, ext(txLink(t.tx), 'tx ' + t.tx.slice(0, 8) + '…')))))
    } catch (e) {
      if (!tapeBody.childElementCount) tapeBody.replaceChildren(h('div', { class: 'none stale' }, 'STALE · Trade read failed: ' + errMsg(e)))
    }
  }

  refresh().then(() => { requote(); refreshPipe() })
  pullTape(); refreshBalance(); updateAction()
  amt.addEventListener('input', updateAction)
  timers.push(window.setInterval(refresh, 3000), window.setInterval(pullTape, 3000), window.setInterval(refreshPipe, 12000))
}
