import { h, hype } from '../ui'
import { abis, pub, firstFn } from '../chain'
import { addresses, BRIDGE_CONTRACTS, DEPLOYED, EXPLORER, BRIDGE, PUBLIC_RPC } from '../config'
import { footer } from './common'

const c = (s: string) => h('code', null, s)
const p = (...k: (string | Node)[]) => h('p', null, ...k)

export function renderManual(root: HTMLElement) {
  root.append(h('header', { class: 'pagehead' },
    h('span', { class: 'label' }, '03 · Manual'),
    h('h1', null, 'How CorePad works'),
    h('p', null, 'Mechanism, parameters, trust model and addresses. Everything here is either enforced by a contract or stated as a constraint of the chains it runs on.'),
  ))

  const secs: [string, string, Node[]][] = []
  const add = (id: string, title: string, ...body: Node[]) => secs.push([id, title, body])

  add('mechanism', 'Mechanism',
    p('CorePad is a liquidity pipeline, not a venue. A launch is absorbed on Elysium, where block space is abundant, and settles into the native HyperCore spot book once it has paid for its own listing.'),
    h('pre', null, `launch(name, symbol, minTokensOut)   Elysium   token + pool, bridge-ready at block 0
  └─ buy / sell on the curve        Elysium   constant product, virtual reserves, 1 % fee
       └─ 800 M sold → freeze       Elysium   graduate(): ticket{hype, 200 M, tickerBudget, listPrice}
            └─ dispatch(id)         → HyperEVM Router + ArbSys.withdrawEth, challenge period
                 └─ keeper          → HyperCore HIP-1 ceremony, deposit, TOKEN/USDC ladder
                      └─ confirm(id, coreTokenIndex, spotPairIndex)`),
    h('h3', null, 'The curve'),
    p('Constant product on virtual reserves. With ', c('G'), ' the graduation target:'),
    h('pre', null, `virtualHype0  = G × 273 / 800
virtualToken0 = 1,073,000,000
k             = virtualHype0 × virtualToken0

selling exactly 800 M leaves virtualToken = 273 M, so
virtualHype_end = k / 273 M = G × 1,073 / 800
raised          = virtualHype_end − virtualHype0 = G     (net of fees)
listPrice       = virtualHype_end / 273 M               (the curve's last marginal price)`),
    p('The buy that crosses 800 M is clipped and the excess HYPE refunded in the same transaction. After that the pool accepts no buy and no sell.'),
    h('h3', null, 'Launch guard'),
    p('For the first ', c('guardSeconds'), ' (default 60 s) each address may buy at most ', c('guardMaxPerAddress'), ' (default 1 % of supply), counted cumulatively across calls. A per-call cap would be no cap: a bot would just split its order.'),
    h('h3', null, 'Why the ticker is paid by the curve'),
    p('A HyperCore spot listing starts with a ticker Dutch auction (floor 500 HYPE on mainnet). The graduation target includes ', c('tickerReserve'), ', so every launch that graduates carries the budget for its own listing in its ticket (', c('tickerBudget'), '). No launch graduates on someone else’s money.'),
  )

  const pv = (k: string) => h('td', { class: 'mono', 'data-param': k }, '—')
  const params = h('table', { class: 'tbl' },
    h('thead', null, h('tr', null, h('th', null, 'Parameter'), h('th', null, 'Value'), h('th', null, 'Source'))),
    h('tbody', null,
      h('tr', null, h('td', null, 'Supply'), h('td', { class: 'mono' }, '1,000,000,000 × 1e18'), h('td', null, 'constant')),
      h('tr', null, h('td', null, 'For sale on the curve'), h('td', { class: 'mono' }, '800,000,000'), h('td', null, 'constant')),
      h('tr', null, h('td', null, 'Reserved for the HyperCore book'), h('td', { class: 'mono' }, '200,000,000'), h('td', null, 'constant')),
      h('tr', null, h('td', null, 'virtualToken0'), h('td', { class: 'mono' }, '1,073,000,000'), h('td', null, 'constant')),
      h('tr', null, h('td', null, 'Graduation target G (HYPE)'), pv('graduationHype'), h('td', null, 'factory')),
      h('tr', null, h('td', null, 'Ticker reserve (HYPE)'), pv('tickerReserve'), h('td', null, 'factory · 500 on mainnet')),
      h('tr', null, h('td', null, 'Fee'), h('td', { class: 'mono' }, '1 % of the HYPE leg'), h('td', null, 'buys and sells → treasury')),
      h('tr', null, h('td', null, 'Launch guard'), h('td', { class: 'mono' }, '60 s · 1 % per address'), h('td', null, 'defaults')),
      h('tr', null, h('td', null, 'Creator buy cap'), h('td', { class: 'mono' }, '2 % of supply'), h('td', null, 'in the launch tx')),
      h('tr', null, h('td', null, 'Rescue delay'), h('td', { class: 'mono' }, '7 days'), h('td', null, 'Settlement')),
    ))
  add('parameters', 'Parameters',
    p(DEPLOYED ? 'Values marked factory are read live from the deployed contract.' : 'The protocol is not deployed yet: values read from the factory show — until it is.'),
    h('div', { class: 'tblwrap' }, params))

  add('trust', 'Trust model',
    h('ul', null,
      h('li', null, h('strong', null, 'Absorption and graduation are fully on-chain. '), 'Buy, sell, freeze and ', c('graduate()'), ' need no operator. Anyone can graduate a sold-out pool.'),
      h('li', null, h('strong', null, 'Dispatch is permissionless. '), c('dispatch(id)'), ' sends the ticket’s assets to an immutable ', c('coreSettler'), ' on HyperEVM through the canonical bridge. The Orbit challenge period applies.'),
      h('li', null, h('strong', null, 'Settlement runs through a keeper, and this is the one off-chain step. '), 'A HyperCore spot listing is an L1-signed HIP-1 ceremony; a contract cannot sign it, and ', c('ElysiumCoreWriter'), ' does not exist yet. The keeper is deterministic: it reads ', c('Graduated'), '/', c('Dispatched'), ', spends at most ', c('tickerBudget'), ' on the ticker, lays a symmetric ladder around ', c('listPrice'), ' and confirms. It holds the keeper role on Settlement and nothing else.'),
      h('li', null, h('strong', null, 'Funds are never locked. '), 'If a ticket is not dispatched or confirmed within 7 days, the immutable treasury can ', c('rescue(id)'), ' in one transaction.'),
      h('li', null, h('strong', null, 'No arbitrary calls. '), 'No free spender, no free calldata, anywhere. Token metadata is immutable; no fee-on-transfer, no rebase.'),
      h('li', null, h('strong', null, 'CoreWriter lane. '), 'Settlement has a set-once ', c('ICoreWriterAdapter'), ' slot, unused in v0. When Elysium ships the predeploy, the ladder is placed from Elysium and the keeper step goes away.'),
    ))

  add('events', 'Events',
    h('pre', null, `LaunchCreated(id, token, pool, creator, name, symbol)
Trade(pool, trader, isBuy, hypeIn/out, tokensIn/out, fee, virtualHype, virtualToken)
Graduated(id, ticket, hype, tokens, listPrice)
Dispatched(ticket, …)
Confirmed(ticket, coreTokenIndex, spotPairIndex)
Rescued(ticket)`),
    p('The ladder, the tape and the pipeline tracker in this app are built from these events only.'))

  const aRow = (name: string, a: string | null, chain: string) => h('tr', null, h('td', null, name), h('td', null, chain),
    h('td', { class: 'mono' }, a ? (chain.startsWith('Elysium') ? h('a', { href: `${EXPLORER}/address/${a}`, target: '_blank', rel: 'noopener' }, a) : h('span', null, a)) : h('span', { class: 'coral' }, 'not deployed')))
  add('addresses', 'Contract addresses',
    h('div', { class: 'tblwrap' }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, h('th', null, 'Contract'), h('th', null, 'Chain'), h('th', null, 'Address'))),
      h('tbody', null,
        aRow('CorePadFactory', addresses.factory, 'Elysium 99801'),
        aRow('Settlement', addresses.settlement, 'Elysium 99801'),
        aRow('Treasury', addresses.treasury, 'Elysium 99801'),
        aRow('ElysiumBridgeFactory', BRIDGE_CONTRACTS.elysiumBridgeFactory, 'Elysium 99801'),
        aRow('Router (Elysium)', BRIDGE_CONTRACTS.elysiumRouter, 'Elysium 99801'),
        aRow('ElysiumMirrorFactory', BRIDGE_CONTRACTS.hyperEvmMirrorFactory, 'HyperEVM 998'),
        aRow('Router (HyperEVM)', BRIDGE_CONTRACTS.hyperEvmRouter, 'HyperEVM 998'),
      ))),
    p('Each launch deploys its own ', c('CorePadToken'), ' and ', c('LaunchPool'), '; their addresses are in the ', c('LaunchCreated'), ' event and on each launch page.'))

  add('network', 'Network',
    h('div', { class: 'tblwrap' }, h('table', { class: 'tbl' }, h('tbody', null,
      h('tr', null, h('td', null, 'Chain'), h('td', { class: 'mono' }, 'Elysium testnet · 99801 · Arbitrum Orbit')),
      h('tr', null, h('td', null, 'RPC'), h('td', { class: 'mono' }, PUBLIC_RPC)),
      h('tr', null, h('td', null, 'Gas'), h('td', { class: 'mono' }, 'HYPE · base fee 0.01 gwei · 100–200 ms blocks')),
      h('tr', null, h('td', null, 'Explorer'), h('td', { class: 'mono' }, h('a', { href: EXPLORER, target: '_blank', rel: 'noopener' }, EXPLORER))),
      h('tr', null, h('td', null, 'Bridge'), h('td', { class: 'mono' }, h('a', { href: BRIDGE, target: '_blank', rel: 'noopener' }, BRIDGE))),
      h('tr', null, h('td', null, 'Settles to'), h('td', { class: 'mono' }, 'HyperEVM testnet · 998')),
    ))))

  const toc = h('nav', { class: 'toc', 'aria-label': 'Manual sections' })
  const doc = h('article', { class: 'doc' })
  secs.forEach(([id, title, body], i) => {
    const n = String(i + 1).padStart(2, '0')
    const b = h('a', { href: '#/manual', 'data-target': id }, `${n}  ${title}`)
    b.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('m-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) })
    toc.append(b)
    doc.append(h('h2', { id: 'm-' + id }, h('span', { class: 'no' }, n), title), ...body)
  })
  root.append(h('div', { class: 'manual' }, toc, doc), footer())

  if (DEPLOYED && addresses.factory) {
    for (const k of ['graduationHype', 'tickerReserve']) {
      const fn = firstFn(abis.factory, k)
      const cell = params.querySelector<HTMLElement>(`[data-param="${k}"]`)
      if (!fn || !cell) continue
      pub.readContract({ address: addresses.factory, abi: abis.factory, functionName: fn })
        .then((v) => { cell.textContent = hype(v as bigint, 4) }).catch(() => { cell.textContent = 'unreadable' })
    }
  }
}
