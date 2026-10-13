import { parseEther, formatEther, decodeEventLog, type Log } from 'viem'
import { h, tokens, hype, pct, price, toast, errMsg, short, txLink } from '../ui'
import { abis, pub, send, mined, argsFor, firstFn, wallet } from '../chain'
import { DEPLOYED, addresses, SUPPLY, NET, ENVIRONMENT } from '../config'
import { notDeployed, footer } from './common'
import { normalizeLinks, uploadFile, uploadMeta, setMetadata } from '../meta'

const V_TOKEN0 = 1_073_000_000n * 10n ** 18n
const CREATOR_CAP = SUPPLY / 50n // 2 %
const nameBytes = (n: string) => new TextEncoder().encode(n).length
/** Client-side mirror of CorePadToken's name rule: 1–31 UTF-8 bytes, no NUL. Null when valid. */
function nameProblem(n: string): string | null {
  if (!n) return null
  const b = nameBytes(n)
  if (b > 31) return `Name is ${b} bytes; the limit is 31 bytes (UTF-8: accented letters and emoji take 2–4 bytes each).`
  if (n.includes('\u0000')) return 'Name cannot contain a NUL character.'
  return null
}
/** Symbol availability from the factory (unique across CorePad + reserved tickers). Null when free. */
async function symbolProblem(sy: string): Promise<string | null> {
  if (!addresses.factory) return null
  if (firstFn(abis.factory, 'isReservedSymbol')) {
    const reserved = await pub.readContract({ address: addresses.factory, abi: abis.factory, functionName: 'isReservedSymbol', args: [sy] }) as boolean
    if (reserved) return `${sy} is a reserved ticker (a major HyperCore asset) and cannot be launched.`
  }
  if (firstFn(abis.factory, 'launchOfSymbol')) {
    const id = await pub.readContract({ address: addresses.factory, abi: abis.factory, functionName: 'launchOfSymbol', args: [sy] }) as bigint
    if (id > 0n) return `${sy} is already taken by launch #${id}. Symbols are unique across CorePad (the HyperCore ticker is the symbol).`
  }
  return null
}

export function renderIssue(root: HTMLElement) {
  root.append(h('header', { class: 'pagehead' },
    h('span', { class: 'label' }, '02 · Issue'),
    h('h1', null, 'Issue a launch'),
    h('p', null, 'One transaction on Elysium deploys the token (1 B supply, immutable metadata, minted once to its pool) and its curve, and, when a bridge factory is configured, registers a bridge wallet for the token in the same transaction. An optional creator buy runs in the same transaction, capped at 2 % of supply.'),
  ))

  const name = h('input', { maxlength: '31', autocomplete: 'off', placeholder: 'Token name', 'aria-label': 'Name', required: true }) as HTMLInputElement
  const nameCount = h('span', { 'data-namebytes': '' }, '0 / 31 bytes')
  const sym = h('input', { maxlength: '6', autocomplete: 'off', placeholder: 'SYMBOL', 'aria-label': 'Symbol', required: true, style: 'text-transform:uppercase' }) as HTMLInputElement
  const buy = h('input', { inputmode: 'decimal', autocomplete: 'off', placeholder: '0.0', 'aria-label': 'Creator buy in HYPE' }) as HTMLInputElement
  const buyHint = h('span', { class: 'hint' }, 'Optional. Leave empty for no creator buy.')
  const err = h('div', { class: 'err' })

  /* ---- identity: logo, banner, other info (stored off-chain, pointed to by CorePadMetadata) ---- */
  const imgField = (key: 'logo' | 'banner', label: string, help: string) => {
    const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml', 'aria-label': label, class: 'fhide' }) as HTMLInputElement
    const prev = h('span', { class: 'imgprev ' + key, 'aria-hidden': 'true' }, '?')
    const pick = h('button', { type: 'button', class: 'pickbtn' }, 'Choose an image')
    const clear = h('button', { type: 'button', class: 'linkbtn', hidden: true }, 'remove')
    let file: File | null = null, url = ''
    const set = (f: File | null) => {
      if (url) URL.revokeObjectURL(url)
      file = f; url = f ? URL.createObjectURL(f) : ''
      prev.replaceChildren(f ? Object.assign(document.createElement('img'), { src: url, alt: '' }) : '?')
      pick.textContent = f ? f.name.slice(0, 28) : 'Choose an image'
      clear.hidden = !f
      paintPreviewImgs()
    }
    pick.addEventListener('click', () => input.click())
    clear.addEventListener('click', () => { input.value = ''; set(null) })
    input.addEventListener('change', () => {
      const f = input.files?.[0] ?? null
      if (f && f.size > 5 * 1024 * 1024) { toast(`${label}: ${(f.size / 1048576).toFixed(1)} MB, the limit is 5 MB`, true); input.value = ''; return }
      if (f && !/^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(f.type)) { toast(`${label}: PNG, JPEG, GIF, WebP or SVG`, true); input.value = ''; return }
      set(f)
    })
    const el = h('div', { class: 'field' }, h('span', { class: 'flabel' }, h('span', null, label), clear), h('div', { class: 'imgpick' }, prev, pick, input), h('span', { class: 'hint' }, help))
    return { el, get: () => file, url: () => url }
  }
  const logoField = imgField('logo', 'Logo', 'Square works best. PNG, JPEG, GIF, WebP or SVG, up to 5 MB.')
  const bannerField = imgField('banner', 'Banner', 'Shown across the top of the launch page. Wide crop, roughly 3:1.')
  const desc = h('textarea', { maxlength: '500', rows: '3', placeholder: 'What is this token about?', 'aria-label': 'Description' }) as HTMLTextAreaElement
  const site = h('input', { autocomplete: 'off', placeholder: 'example.com', 'aria-label': 'Website' }) as HTMLInputElement
  const xh = h('input', { autocomplete: 'off', placeholder: '@handle', 'aria-label': 'X' }) as HTMLInputElement
  const tg = h('input', { autocomplete: 'off', placeholder: '@group or t.me link', 'aria-label': 'Telegram' }) as HTMLInputElement
  const descCount = h('span', null, '0 / 500')
  desc.addEventListener('input', () => { descCount.textContent = `${desc.value.length} / 500` })
  const other = h('details', { class: 'other' },
    h('summary', null, h('span', { class: 'label' }, h('b', null, 'Other info')), h('span', { class: 'hint' }, 'Description, website, X, Telegram · optional')),
    h('div', { class: 'otherbody' },
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, h('span', null, 'Description'), descCount), h('div', { class: 'input ta' }, desc)),
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, h('span', null, 'Website')), h('div', { class: 'input' }, site)),
      h('div', { class: 'field2' },
        h('div', { class: 'field' }, h('span', { class: 'flabel' }, h('span', null, 'X')), h('div', { class: 'input' }, xh)),
        h('div', { class: 'field' }, h('span', { class: 'flabel' }, h('span', null, 'Telegram')), h('div', { class: 'input' }, tg)))))
  const hasMeta = () => Boolean(logoField.get() || bannerField.get() || desc.value.trim() || site.value.trim() || xh.value.trim() || tg.value.trim())
  let paintPreviewImgs = () => {}
  const submit = h('button', { class: 'btn solid wide', type: 'submit', form: 'issue-form' }, DEPLOYED ? `Issue ${NET.action}` : 'Unavailable · no testnet deployment')
  submit.setAttribute('disabled', '')
  const simNote = h('p', { class: 'hint', style: 'margin:0' }, DEPLOYED ? 'Fill in name and symbol; the transaction is simulated before you can sign.' : '')

  const form = h('form', { novalidate: true, id: 'issue-form', class: 'fields' },
    h('div', { class: 'field' }, h('label', { class: 'flabel', for: 'f-name' }, h('span', null, 'Name'), nameCount), h('div', { class: 'input' }, Object.assign(name, { id: 'f-name' }))),
    h('div', { class: 'field' }, h('label', { class: 'flabel', for: 'f-sym' }, h('span', null, 'Symbol'), h('span', null, 'A–Z 0–9 · 1–6')), h('div', { class: 'input' }, Object.assign(sym, { id: 'f-sym' }))),
    h('div', { class: 'field2' }, logoField.el, bannerField.el),
    other,
    h('div', { class: 'field' }, h('label', { class: 'flabel', for: 'f-buy' }, h('span', null, 'Creator buy · optional'), h('span', null, 'cap 2 %')), h('div', { class: 'input' }, Object.assign(buy, { id: 'f-buy' }), h('span', { class: 'unit' }, 'HYPE')), buyHint),
    h('p', { class: 'note', style: 'margin:0' }, 'Two separate limits. Creator-buy cap: 2 % of supply (LaunchPool.CREATOR_MAX), any excess HYPE refunded. Launch guard: the creator buy is then counted in your cumulative guard allowance (1 % per address for 60 s), so any further buy from this address in that window reverts (GuardExceeded); it is not clipped. The estimate below is checked by simulating launch() against the connected contracts.'),
  )
  // preview ticket
  const pSym = h('b', { class: 'empty-id' }, 'Enter token metadata'), pName = h('span', { class: 'sec2' }, '')
  const pLogo = h('span', { class: 'tile big', 'aria-hidden': 'true' }, '?')
  const pBanner = h('div', { class: 'pbanner', hidden: true })
  paintPreviewImgs = () => {
    const l = logoField.url(), b = bannerField.url()
    pLogo.replaceChildren(l ? Object.assign(document.createElement('img'), { src: l, alt: '' }) : (sym.value.slice(0, 2) || '?'))
    pBanner.hidden = !b
    pBanner.style.backgroundImage = b ? `url("${b}")` : ''
  }
  const pBuy = h('dd', { class: 'num' }, '—'), pOpen = h('dd', { class: 'num' }, '—'), pTarget = h('dd', { class: 'num' }, '—')
  const preview = h('div', { class: 'ticketcard' },
    h('div', { class: 'top' }, h('span', { class: 'label' }, 'Transaction preview'), h('span', { class: 'mono sec2', style: 'font-size:11px' }, 'launch() · ' + NET.where)),
    pBanner,
    h('div', { class: 'big withlogo' }, pLogo, h('div', null, pSym, pName)),
    h('dl', { class: 'kv' },
      h('div', null, h('dt', null, 'Supply'), h('dd', { class: 'num' }, '1,000,000,000')),
      h('div', null, h('dt', null, 'Curve'), h('dd', { class: 'num' }, '800 M for sale · 200 M book')),
      h('div', null, h('dt', null, 'Open price'), pOpen),
      h('div', null, h('dt', null, 'Graduation'), pTarget),
      h('div', null, h('dt', null, 'Creator buy'), pBuy),
      h('div', null, h('dt', null, 'Fee'), h('dd', null, '1 % of the HYPE leg → treasury')),
    ))
  root.append(h('div', { class: 'issue' }, form, h('section', { class: 'review', 'aria-label': 'Review' }, preview,
    h('p', { class: 'warn-immutable', style: 'margin:0' }, 'Name and symbol are immutable: the bridge keys the HyperEVM mirror on them. Check the spelling before you sign.'),
    submit, simNote, err,
    !DEPLOYED ? notDeployed('Issuing')
      : ENVIRONMENT === 'local-rehearsal' ? h('p', { class: 'hint', style: 'margin:0' }, 'Signs against the local rehearsal node the app is connected to. No public network, no bridge funding.')
      : h('p', { class: 'hint', style: 'margin:0' }, 'Your wallet will be asked to add or switch to Elysium testnet (99801). Gas is HYPE. ',
        h('a', { href: 'https://elysium.kinetiq.xyz/testnet-bridge', target: '_blank', rel: 'noopener' }, 'Bridge HYPE in ↗')))))
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
    pSym.textContent = s || (name.value.trim() ? 'SYMBOL' : 'Enter token metadata')
    pSym.className = s ? '' : 'empty-id'
    pName.textContent = name.value.trim()
    const nb = nameBytes(name.value.trim())
    nameCount.textContent = `${nb} / 31 bytes`
    nameCount.style.color = nb > 31 ? 'var(--warn, inherit)' : ''
    scheduleSim()
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
  // simulate launch() with the current values; submit is enabled only when the chain accepts it
  let simTimer = 0, simSeq = 0
  function scheduleSim() { clearTimeout(simTimer); simTimer = window.setTimeout(runSim, 350) }
  async function runSim() {
    const seq = ++simSeq
    submit.setAttribute('disabled', '')
    if (!DEPLOYED || !addresses.factory) return
    const n = name.value.trim(), sy = sym.value.trim(), b = buyWei()
    if (!n || !sy) { simNote.textContent = 'Fill in name and symbol; the transaction is simulated before you can sign.'; return }
    const np = nameProblem(n)
    if (np) { simNote.textContent = np; return }
    if (b === 'bad') { simNote.textContent = 'Creator buy: invalid amount.'; return }
    try {
      const sp = await symbolProblem(sy)
      if (seq !== simSeq) return
      if (sp) { simNote.textContent = sp; return }
      const withBuy = Boolean(wallet.account) || !b
      await pub.simulateContract({ address: addresses.factory, abi: abis.factory, functionName: 'launch', value: withBuy ? (b ?? 0n) : 0n,
        args: argsFor(abis.factory, 'launch', { name: n, symbol: sy, minTokensOut: 0n }), account: wallet.account ?? addresses.factory })
      if (seq !== simSeq) return
      simNote.textContent = withBuy ? 'Simulation passed against the current chain state.' : 'Simulation passed without the creator buy; connect a wallet to include it.'
      submit.removeAttribute('disabled')
    } catch (e) { if (seq === simSeq) simNote.textContent = 'Simulation rejected: ' + errMsg(e) }
  }
  ;[name, sym, buy].forEach((i) => i.addEventListener('input', paint))
  sym.addEventListener('input', () => paintPreviewImgs())
  paint()

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    err.textContent = ''
    const n = name.value.trim(), s = sym.value.trim()
    if (!n) { err.textContent = 'Name: 1–31 bytes (stored on-chain as immutable metadata).'; name.focus(); return }
    const np = nameProblem(n)
    if (np) { err.textContent = np; name.focus(); return }
    if (!/^[A-Z0-9]{1,6}$/.test(s)) { err.textContent = 'Symbol: 1–6 characters, A–Z and 0–9 (CorePadToken.isValidSymbol).'; sym.focus(); return }
    try { const sp = await symbolProblem(s); if (sp) { err.textContent = sp; sym.focus(); return } }
    catch (e) { err.textContent = 'Could not check symbol availability: ' + errMsg(e); return }
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
    const links = normalizeLinks({ website: site.value, twitter: xh.value, telegram: tg.value })
    if (links.problem) { err.textContent = links.problem; (other as HTMLDetailsElement).open = true; return }
    submit.setAttribute('disabled', '')
    try {
      // 1. metadata first: if an upload fails, nothing has been signed yet
      let uri: string | null = null
      if (hasMeta()) {
        submit.textContent = 'Uploading images…'
        const safe = s.toLowerCase()
        const lf = logoField.get(), bf = bannerField.get()
        const [image, banner] = await Promise.all([
          lf ? uploadFile('logo', lf, `${safe}.${(lf.name.split('.').pop() || 'img').toLowerCase()}`) : Promise.resolve(undefined),
          bf ? uploadFile('banner', bf, `${safe}.${(bf.name.split('.').pop() || 'img').toLowerCase()}`) : Promise.resolve(undefined),
        ])
        uri = await uploadMeta({ name: n, symbol: s, description: desc.value, image, banner, website: links.website, twitter: links.twitter, telegram: links.telegram })
      }
      // 2. the launch itself
      submit.textContent = 'Confirm the launch in your wallet…'
      // +30 % over the estimate: launch deploys two contracts and forwards a fixed gas stipend to the bridge factory
      const tx = await send({ address: addresses.factory, abi: abis.factory, functionName: 'launch', value, gasBufferPct: 30,
        args: argsFor(abis.factory, 'launch', { name: n, symbol: s, minTokensOut: minOut, minOut }) })
      submit.textContent = 'Waiting for block…'
      const rc = await mined(tx)
      let id: bigint | null = null
      for (const lg of rc.logs as Log[]) {
        try {
          const d = decodeEventLog({ abi: abis.factory, data: lg.data, topics: lg.topics })
          if (d.eventName === 'LaunchCreated') id = (d.args as unknown as { id: bigint }).id
        } catch { /* other contract's log */ }
      }
      toast(`Issued ${s}. tx ${short(tx)}`)
      // 3. attach the metadata (second signature). A refusal leaves a valid launch; the creator can attach it later from the launch page.
      if (id !== null && uri && addresses.metadata) {
        submit.textContent = 'Confirm the metadata in your wallet…'
        try { await mined(await setMetadata(id, uri)); toast('Metadata attached') }
        catch (e3) { toast('Launch is live; metadata not attached: ' + errMsg(e3) + '. Attach it from the launch page.', true, 12000) }
      }
      if (id !== null) location.hash = `#/launch/${id}`
      else err.replaceChildren(h('a', { href: txLink(tx), target: '_blank', rel: 'noopener' }, 'Issued, view tx ↗'))
    } catch (e2) { err.textContent = errMsg(e2) }
    finally { submit.textContent = `Issue ${NET.action}`; scheduleSim() }
  })
}
