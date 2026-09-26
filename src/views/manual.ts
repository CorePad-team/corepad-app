import type { Abi } from 'viem'
import { h, hype, short, toast } from '../ui'
import { abis, pub, firstFn } from '../chain'
import { addresses, BRIDGE_CONTRACTS, DEPLOYED, EXPLORER, BRIDGE, PUBLIC_RPC, ENVIRONMENT } from '../config'
import { footer } from './common'

const c = (s: string) => h('code', null, s)
const p = (...k: (string | Node)[]) => h('p', null, ...k)

/** Event declarations generated from the real ABI files, not retyped. */
function eventSigs(abi: Abi): string[] {
  return (abi as unknown as { type: string; name: string; inputs: { type: string; name: string; indexed?: boolean }[] }[])
    .filter((i) => i.type === 'event')
    .map((e) => `${e.name}(${e.inputs.map((x) => `${x.type}${x.indexed ? ' indexed' : ''} ${x.name}`).join(', ')})`)
}

export function renderManual(root: HTMLElement) {
  root.append(h('header', { class: 'pagehead' },
    h('span', { class: 'label' }, '03 · Manual'),
    h('h1', null, 'How CorePad works'),
    h('p', null, 'Mechanism, parameters, trust model and addresses. Each statement is either enforced by a contract or a stated constraint of the chains it runs on.'),
  ))

  const secs: [string, string, Node[]][] = []
  const add = (id: string, title: string, ...body: Node[]) => secs.push([id, title, body])
  const step = (t: string, d: (string | Node)[]) => h('li', null, h('div', null, t, h('span', null, ...d)))

  add('mechanism', 'Mechanism',
    p('CorePad is a liquidity pipeline, not a venue. A launch is absorbed on Elysium, where block space is abundant, and settles into the native HyperCore spot book once it has paid for its own listing.'),
    h('ol', { class: 'flow' },
      step('Launch · Elysium', [c('launch(name, symbol, minTokensOut)'), ' deploys the token and its pool; the token is registered with the Elysium bridge factory in the same transaction when configured.']),
      step('Absorb · Elysium', ['Buy and sell on the constant-product curve, 1 % of the HYPE leg to the treasury, launch guard for the first 60 s.']),
      step('Freeze · Elysium', ['At 800 M sold the pool accepts no buy and no sell. The crossing buy is clipped and its excess refunded.']),
      step('Graduate · Elysium', [c('graduate()'), ' by anyone: HYPE, the 200 M book tokens and any dust go to Settlement, which opens a ticket at ', c('listPrice'), '.']),
      step('Register the mirror · HyperEVM', ['Keeper: ', c('createAndRegisterL1Mirror'), '. Until the Elysium router routes the mirror, ', c('dispatch'), ' reverts with ', c('RouteNotReady'), ' and the ticket stays open.']),
      step('Dispatch · Elysium → HyperEVM', [c('dispatch(id)'), ' by anyone: tokens through the Router, HYPE through ', c('ArbSys.withdrawEth'), ', to the adapter’s ', c('coreSettler'), '.']),
      step('Claim · HyperEVM', ['After the Orbit challenge period, both withdrawals are claimed on HyperEVM.']),
      step('List · HyperCore', ['Keeper: HIP-1 ceremony within ', c('tickerBudget'), ', deposit, HYPE → USDC, symmetric TOKEN/USDC ladder around ', c('listPrice'), '.']),
      step('Confirm · Elysium', ['Keeper: ', c('confirm(id, coreTokenIndex, spotPairIndex)'), '.']),
    ),
    h('p', { class: 'note', style: 'border-left:1px solid var(--mint);padding-left:14px' }, h('strong', { style: 'font-weight:500' }, 'Testnet readiness. '), 'Observed 2026-09-26 (SPEC): the testnet ', c('tickerReserve'), ' of 0.5 HYPE cannot pay a testnet ticker, whose auction ran 1,439.9 → 1,259.7 HYPE that day, and ', c('HyperCoreDepositFactory'), ' is not published on testnet. The HIP-1 and deposit steps are blocked on testnet until either changes. These are dated observations, not current quotes.'),
    h('h3', null, 'The curve'),
    p('Constant product on virtual reserves. With ', c('G'), ' the graduation target:'),
    h('pre', { tabindex: '0' }, `virtualHype0  = G × 273 / 800
virtualToken0 = 1,073,000,000
k             = virtualHype0 × virtualToken0

selling exactly 800 M leaves virtualToken = 273 M, so
virtualHype_end = k / 273 M = G × 1,073 / 800
raised          = virtualHype_end − virtualHype0 = G     (net of fees)
listPrice       = virtualHype_end / 273 M               (HYPE per token)`),
    h('p', { class: 'sec2' }, c('listPrice'), ' is quoted in HYPE per token. The TOKEN/USDC ladder on HyperCore is derived from it through the HYPE → USDC conversion and venue tick rounding; the HYPE figure is not a USDC order price.'),
    h('h3', null, 'Launch guard'),
    p('For the first ', c('guardSeconds'), ' (default 60 s) each address may buy at most ', c('guardMaxPerAddress'), ' (default 1 % of supply), counted cumulatively across calls. A per-call cap would be no cap: a bot would split its order.'),
    h('h3', null, 'The curve pays its own ticker'),
    p('The graduation target includes ', c('tickerReserve'), ', carried into the ticket as ', c('tickerBudget'), '. The HIP-1 ticker is a Dutch auction whose price moves (mainnet floor 500 HYPE); the budget caps what the keeper may spend, it does not guarantee a listing at that price.'),
  )

  const defs = h('dl', { class: 'defs' },
    h('div', { class: 'hdrow' }, h('dt', { class: 'hd' }, 'Parameter'), h('dd', { class: 'hd' }, 'Value'), h('dd', { class: 'hd' }, 'Source')))
  const def = (k: string, v: string, src: string, param?: string) =>
    defs.append(h('div', null, h('dt', null, k), h('dd', { class: 'val', 'data-param': param ?? null }, v), h('dd', { class: 'src' }, src)))
  def('Supply', '1,000,000,000', 'CorePadToken, minted once')
  def('Sold on the curve', '800,000,000', 'LaunchPool.SALE_SUPPLY')
  def('Reserved for the book', '200,000,000', 'LaunchPool.BOOK_SUPPLY')
  def('virtualToken0', '1,073,000,000', 'LaunchPool.VIRTUAL_TOKEN0')
  def('Graduation target G', DEPLOYED ? 'reading…' : 'not deployed', 'CorePadFactory.graduationHype', 'graduationHype')
  def('Ticker reserve', DEPLOYED ? 'reading…' : 'not deployed', 'CorePadFactory.tickerReserve · mainnet 500 HYPE', 'tickerReserve')
  def('Fee', '1 % of the HYPE leg', 'LaunchPool.FEE_BPS · buys and sells → treasury')
  def('Launch guard', DEPLOYED ? 'reading…' : '60 s · 1 % (defaults)', 'CorePadFactory.guardSeconds / guardMaxPerAddress', 'guard')
  def('Creator buy cap', '2 % of supply', 'LaunchPool.CREATOR_MAX')
  def('Rescue delay', DEPLOYED ? 'reading…' : '7 days (spec)', 'Settlement.rescueDelay', 'rescueDelay')
  add('parameters', 'Parameters', h('p', { class: 'sec2' }, ENVIRONMENT === 'local-rehearsal' ? 'Protocol constants, and the configuration of the connected local rehearsal (not the intended testnet or mainnet settings).' : 'Protocol constants, and the configuration read from the deployed factory.'), defs)

  add('trust', 'Trust model',
    h('ul', null,
      h('li', null, h('strong', null, 'Absorption and graduation are on-chain. '), 'Buy, sell, freeze and ', c('graduate()'), ' need no operator. Anyone can graduate a sold-out pool.'),
      h('li', null, h('strong', null, 'Dispatch is permissionless. '), c('dispatch(id)'), ' sends the ticket’s assets through the canonical bridge to the adapter’s immutable ', c('coreSettler'), ' on HyperEVM. The Orbit challenge period applies.'),
      h('li', null, h('strong', null, 'Settlement runs through a keeper: the one off-chain step. '), 'A HyperCore spot listing is an L1-signed HIP-1 ceremony that a contract cannot sign, and ', c('ElysiumCoreWriter'), ' does not exist yet. The keeper holds the keeper role on Settlement and nothing else; it reads ', c('Graduated'), '/', c('Dispatched'), ' and calls ', c('confirm'), '.'),
      h('li', null, h('strong', null, 'Open-ticket rescue. '), 'After ', c('rescueDelay'), ', the immutable treasury can ', c('rescue(id)'), ' a ticket that is still open (never dispatched). Dispatched assets are outside this rescue path.'),
      h('li', null, h('strong', null, 'No arbitrary calls. '), 'No free spender, no free calldata. Token metadata is immutable; no fee-on-transfer, no rebase.'),
      h('li', null, h('strong', null, 'CoreWriter lane, not live. '), 'Settlement holds a set-once ', c('ICoreWriterAdapter'), ' slot, unused in v0.'),
    ))

  add('events', 'Events',
    p('Generated from the ABI files shipped with this app. The ladder and the tape read events; the settlement tracker combines events with ', c('getTicket'), ', ', c('isRouteReady'), ' and a ', c('dispatch'), ' simulation.'),
    ...(['CorePadFactory', 'LaunchPool', 'Settlement'] as const).flatMap((n) => [
      h('h3', null, n), h('p', { class: 'hint', style: 'margin:0' }, 'Scroll horizontally'),
      h('pre', { tabindex: '0', 'aria-label': n + ' events' }, eventSigs(n === 'CorePadFactory' ? abis.factory : n === 'LaunchPool' ? abis.pool : abis.settlement).join('\n'))]))

  const addrRow = (name: string, chain: string, a: string | null) => {
    const l2 = h('div', { class: 'l2' })
    if (!a) l2.append(h('span', null, 'not deployed'))
    else {
      l2.append(h('span', { title: a }, short(a)))
      const copy = h('button', { class: 'linkbtn', type: 'button', 'aria-label': `Copy ${name} address` }, 'copy')
      copy.addEventListener('click', () => { navigator.clipboard?.writeText(a).then(() => toast(`Copied ${a}`)).catch(() => toast(a)) })
      l2.append(copy)
      const onPublicElysium = chain.startsWith('Elysium') && (ENVIRONMENT !== 'local-rehearsal' || !Object.values(addresses).includes(a as `0x${string}`))
      if (onPublicElysium) l2.append(h('a', { href: `${EXPLORER}/address/${a}`, target: '_blank', rel: 'noopener' }, 'explorer ↗'))
    }
    return h('div', { class: 'addr-row' }, h('div', null, h('strong', { style: 'font-weight:500' }, name), h('span', { class: 'sec2' }, ' · ' + chain)), l2)
  }
  const here = ENVIRONMENT === 'local-rehearsal' ? 'local rehearsal node' : 'Elysium 99801'
  add('addresses', 'Contract addresses',
    h('h3', null, ENVIRONMENT === 'local-rehearsal' ? 'Connected rehearsal contracts' : 'CorePad contracts'),
    h('div', null,
      addrRow('CorePadFactory', here, addresses.factory),
      addrRow('Settlement', here, addresses.settlement),
      addrRow('Treasury', here, addresses.treasury)),
    h('h3', null, 'Target-network infrastructure references'),
    h('div', null,
      addrRow('ElysiumBridgeFactory', 'Elysium 99801', BRIDGE_CONTRACTS.elysiumBridgeFactory),
      addrRow('Router', 'Elysium 99801', BRIDGE_CONTRACTS.elysiumRouter),
      addrRow('ElysiumMirrorFactory', 'HyperEVM 998', BRIDGE_CONTRACTS.hyperEvmMirrorFactory),
      addrRow('Router', 'HyperEVM 998', BRIDGE_CONTRACTS.hyperEvmRouter),
    ),
    p('Each launch deploys its own ', c('CorePadToken'), ' and ', c('LaunchPool'), '; their addresses are in ', c('LaunchCreated'), ' and on each launch page.'))

  const net = h('dl', { class: 'defs' })
  const nrow = (k: string, v: Node | string) => net.append(h('div', null, h('dt', null, k), h('dd', { class: 'val', style: 'grid-column: span 2' }, v)))
  nrow('Target network', 'Elysium testnet · chain 99801 · Arbitrum Orbit')
  nrow('Data source', ENVIRONMENT === 'local-rehearsal' ? `local rehearsal node · ${PUBLIC_RPC}` : ENVIRONMENT === 'testnet' ? 'Elysium testnet via /api/rpc, then the public RPC' : 'none: no deployment to read')
  nrow('Public RPC', 'https://testnet-rpc.elysium.kinetiq.xyz')
  nrow('Gas', 'HYPE · base fee 0.01 gwei · 100–200 ms blocks')
  nrow('Explorer', h('a', { href: EXPLORER, target: '_blank', rel: 'noopener' }, 'elysium.kinetiq.xyz/testnet-explorer ↗'))
  nrow('Bridge', h('a', { href: BRIDGE, target: '_blank', rel: 'noopener' }, 'elysium.kinetiq.xyz/testnet-bridge ↗'))
  nrow('Settles to', 'HyperEVM testnet · 998')
  add('network', 'Network', net)

  const toc = h('nav', { class: 'toc', 'aria-label': 'Manual sections' })
  const tocm = h('details', { class: 'tocm' }, h('summary', null, `Contents · ${String(secs.length).padStart(2, '0')} sections`))
  const doc = h('article', { class: 'doc' })
  secs.forEach(([id, title, body], i) => {
    const n = String(i + 1).padStart(2, '0')
    for (const host of [toc, tocm]) {
      const a = h('a', { href: '#/manual' }, `${n}  ${title}`)
      a.addEventListener('click', (e) => { e.preventDefault(); (tocm as HTMLDetailsElement).open = false; document.getElementById('m-' + id)?.scrollIntoView({ block: 'start' }) })
      host.append(a)
    }
    doc.append(h('h2', { id: 'm-' + id }, h('span', { class: 'no' }, n), title), ...body)
  })
  doc.prepend(tocm)
  root.append(h('div', { class: 'manual' }, toc, doc), footer())

  if (DEPLOYED && addresses.factory) {
    const set = (k: string, v: string) => { const cell = defs.querySelector<HTMLElement>(`[data-param="${k}"]`); if (cell) cell.textContent = v }
    const read = (addr: `0x${string}`, abi: Abi, fn: string) => firstFn(abi, fn) ? pub.readContract({ address: addr, abi, functionName: fn }) as Promise<bigint> : Promise.reject(new Error('not in ABI'))
    read(addresses.factory, abis.factory, 'graduationHype').then((v) => set('graduationHype', hype(v, 4) + ' HYPE')).catch(() => set('graduationHype', 'unreadable'))
    read(addresses.factory, abis.factory, 'tickerReserve').then((v) => set('tickerReserve', hype(v, 4) + ' HYPE')).catch(() => set('tickerReserve', 'unreadable'))
    Promise.all([read(addresses.factory, abis.factory, 'guardSeconds'), read(addresses.factory, abis.factory, 'guardMaxPerAddress')])
      .then(([s, m]) => set('guard', `${s} s · ${(Number(m * 10000n / 10n ** 27n) / 100).toFixed(2)} % of supply`)).catch(() => set('guard', 'unreadable'))
    if (addresses.settlement) read(addresses.settlement, abis.settlement, 'rescueDelay').then((v) => set('rescueDelay', `${Number(v) / 86400} days`)).catch(() => set('rescueDelay', 'unreadable'))
  }
}
