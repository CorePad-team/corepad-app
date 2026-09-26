import { parseEther, formatEther, decodeEventLog, type Log } from 'viem'
import { h, tokens, hype, pct, price, toast, errMsg, short, txLink } from '../ui'
import { abis, pub, send, argsFor, firstFn } from '../chain'
import { DEPLOYED, addresses, SUPPLY } from '../config'
import { notDeployed, footer } from './common'

const V_TOKEN0 = 1_073_000_000n * 10n ** 18n
const CREATOR_CAP = SUPPLY / 50n // 2 %

export function renderIssue(root: HTMLElement) {
  root.append(h('header', { class: 'pagehead' },
    h('span', { class: 'label' }, '02 · Issue'),
    h('h1', null, 'Issue a launch'),
    h('p', null, 'One transaction on Elysium deploys the token (1 B supply, immutable metadata, minted once to its pool) and its curve, and registers the token with the Elysium bridge so it is bridge-ready from block 0. An optional creator buy runs in the same transaction, capped at 2 % of supply.'),
  ))

  const name = h('input', { maxlength: '31', autocomplete: 'off', placeholder: 'Density Labs', 'aria-label': 'Name', required: true }) as HTMLInputElement
  const sym = h('input', { maxlength: '6', autocomplete: 'off', placeholder: 'DENSE', 'aria-label': 'Symbol', required: true, style: 'text-transform:uppercase' }) as HTMLInputElement
  const buy = h('input', { inputmode: 'decimal', autocomplete: 'off', placeholder: '0.0', 'aria-label': 'Creator buy in HYPE' }) as HTMLInputElement
  const buyHint = h('span', { class: 'hint' }, 'Optional. Leave empty for no creator buy.')
  const err = h('div', { class: 'err' })
  const submit = h('button', { class: 'btn solid wide', type: 'submit' }, 'Issue on Elysium')
  if (!DEPLOYED) submit.setAttribute('disabled', '')

  const form = h('form', { novalidate: true },
    h('div', { class: 'field' }, h('label', { for: 'f-name' }, h('span', null, 'Name'), h('span', null, '1–31 bytes')), h('div', { class: 'input' }, Object.assign(name, { id: 'f-name' }))),
    h('div', { class: 'field' }, h('label', { for: 'f-sym' }, h('span', null, 'Symbol'), h('span', null, 'A–Z 0–9 · 1–6')), h('div', { class: 'input' }, Object.assign(sym, { id: 'f-sym' }))),
    h('div', { class: 'field' }, h('label', { for: 'f-buy' }, h('span', null, 'Creator buy'), h('span', null, '≤ 2 % of supply')), h('div', { class: 'input' }, Object.assign(buy, { id: 'f-buy' }), h('span', { class: 'unit' }, 'HYPE')), buyHint),
    h('p', { class: 'hint', style: 'margin:0' }, 'Name and symbol are immutable: the bridge requires plain ERC-20 metadata. Check the spelling before you sign.'),
    err, submit)

  // preview ticket
  const pSym = h('b', null, '—'), pName = h('span', { class: 'dim' }, '—')
  const pBuy = h('dd', { class: 'num' }, '—'), pOpen = h('dd', { class: 'num' }, '—'), pTarget = h('dd', { class: 'num' }, '—')
  const preview = h('div', { class: 'ticketcard' },
    h('div', { class: 'top' }, h('span', null, 'Preview · not signed'), h('span', null, 'Elysium 99801')),
    h('div', { class: 'big' }, pSym, pName),
    h('dl', { class: 'kv' },
      h('div', null, h('dt', null, 'Supply'), h('dd', { class: 'num' }, '1,000,000,000')),
      h('div', null, h('dt', null, 'Curve'), h('dd', { class: 'num' }, '800 M for sale · 200 M book')),
      h('div', null, h('dt', null, 'Open price'), pOpen),
      h('div', null, h('dt', null, 'Graduation'), pTarget),
      h('div', null, h('dt', null, 'Creator buy'), pBuy),
      h('div', null, h('dt', null, 'Fee'), h('dd', null, '1 % of the HYPE leg → treasury')),
    ))
  root.append(h('div', { class: 'issue' }, form, h('aside', null, preview,
    DEPLOYED ? h('p', { class: 'hint', style: 'margin:0' }, 'Your wallet will be asked to add or switch to Elysium testnet (99801). Gas is HYPE; bridge HYPE in from HyperEVM testnet first.',
      ' ', h('a', { href: 'https://elysium.kinetiq.xyz/testnet-bridge', target: '_blank', rel: 'noopener' }, 'Bridge ↗')) : notDeployed('Issuing'))))
  root.append(footer())

  // graduation target → initial virtual reserves (SPEC: vH0 = G × 273 / 800, vT0 = 1,073 M)
  let G: bigint | null = null
  const gFn = firstFn(abis.factory, 'graduationHype', 'graduationTarget')
  if (DEPLOYED && addresses.factory && gFn) {
    pub.readContract({ address: addresses.factory, abi: abis.factory, functionName: gFn }).then((v) => { G = v as bigint; paint() }).catch(() => {})
  }

  const buyWei = (): bigint | null | 'bad' => {
    const v = buy.value.trim().replace(',', '.')
    if (!v) return null
    if (!/^\d*\.?\d*$/.test(v)) return 'bad'
    try { const x = parseEther(v); return x > 0n ? x : null } catch { return 'bad' }
  }
  const tokensFor = (hypeIn: bigint): bigint | null => {
    if (!G) return null
    const vH = (G * 273n) / 800n
    const net = hypeIn - hypeIn / 100n
    return V_TOKEN0 - (vH * V_TOKEN0) / (vH + net)
  }
  const maxBuy = (): bigint | null => {
    if (!G) return null
    const vH = (G * 273n) / 800n
    const net = (vH * V_TOKEN0) / (V_TOKEN0 - CREATOR_CAP) - vH
    return (net * 100n) / 99n
  }

  function paint() {
    const s = sym.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (sym.value !== s) sym.value = s
    pSym.textContent = s || '—'
    pName.textContent = name.value.trim() || '—'
    if (G) {
      const vH = (G * 273n) / 800n
      pOpen.textContent = price(Number(formatEther(vH)) / Number(formatEther(V_TOKEN0))) + ' HYPE'
      pTarget.textContent = hype(G, 2) + ' HYPE at 800 M sold'
    } else { pOpen.textContent = G === null && DEPLOYED ? 'reading…' : '—'; pTarget.textContent = '—' }
    const b = buyWei()
    const mb = maxBuy()
    buyHint.textContent = mb ? `Optional. ≈ ${hype(mb, 4)} HYPE buys the 2 % cap; any excess is refunded by the pool.` : 'Optional. Leave empty for no creator buy.'
    if (b === 'bad') pBuy.textContent = 'invalid amount'
    else if (b === null) pBuy.textContent = 'none'
    else {
      const t = tokensFor(b)
      const c2 = t !== null && t > CREATOR_CAP ? CREATOR_CAP : t
      pBuy.textContent = c2 !== null ? `${hype(b, 4)} HYPE → ${tokens(c2)} (${pct(Number(c2 * 10000n / SUPPLY) / 10000, 2)})${c2 !== t ? ' · capped, excess refunded' : ''}` : `${hype(b, 4)} HYPE`
    }
  }
  ;[name, sym, buy].forEach((i) => i.addEventListener('input', paint))
  paint()

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    err.textContent = ''
    const n = name.value.trim(), s = sym.value.trim()
    if (!n || new TextEncoder().encode(n).length > 31) { err.textContent = 'Name: 1–31 bytes (stored on-chain as immutable metadata).'; name.focus(); return }
    if (!/^[A-Z0-9]{1,6}$/.test(s)) { err.textContent = 'Symbol: 1–6 characters, A–Z and 0–9 (CorePadToken.isValidSymbol).'; sym.focus(); return }
    const b = buyWei()
    if (b === 'bad') { err.textContent = 'Creator buy: invalid amount.'; buy.focus(); return }
    const value = b ?? 0n
    let minOut = 0n
    if (value > 0n) {
      const t = tokensFor(value)
      const capped = t !== null && t > CREATOR_CAP ? CREATOR_CAP : t
      minOut = capped !== null ? (capped * 99n) / 100n : 0n // 1 % slippage on a fresh curve: only the creator trades in this tx
    }
    if (!addresses.factory) return
    submit.setAttribute('disabled', ''); submit.textContent = 'Confirm in wallet…'
    try {
      const tx = await send({ address: addresses.factory, abi: abis.factory, functionName: 'launch', value,
        args: argsFor(abis.factory, 'launch', { name: n, symbol: s, minTokensOut: minOut, minOut }) })
      submit.textContent = 'Waiting for block…'
      const rc = await pub.waitForTransactionReceipt({ hash: tx })
      let id: bigint | null = null
      for (const lg of rc.logs as Log[]) {
        try {
          const d = decodeEventLog({ abi: abis.factory, data: lg.data, topics: lg.topics })
          if (d.eventName === 'LaunchCreated') id = (d.args as unknown as { id: bigint }).id
        } catch { /* other contract's log */ }
      }
      toast(`Issued ${s}. tx ${short(tx)}`)
      if (id !== null) location.hash = `#/launch/${id}`
      else err.replaceChildren(h('a', { href: txLink(tx), target: '_blank', rel: 'noopener' }, 'Issued, view tx ↗'))
    } catch (e2) { err.textContent = errMsg(e2) }
    finally { submit.removeAttribute('disabled'); submit.textContent = 'Issue on Elysium' }
  })
}
