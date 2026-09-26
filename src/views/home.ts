import { h } from '../ui'
import { mountField } from '../field'
import { DEPLOYED } from '../config'
import { mountLadder, ghostLadder } from './ladder'
import { notDeployed, footer } from './common'

const TAGLINE = 'CorePad leverages Elysium to execute high-density launches, settling seamlessly into Hyperliquid Core.'

type Station = { no: string; where: string; title: string; body: (string | Node)[][]; kv: [string, string][]; future?: boolean }

const code = (s: string) => h('code', null, s)

const STATIONS: Station[] = [
  {
    no: '01', where: 'Elysium', title: 'Absorption',
    body: [
      ['A constant-product curve on virtual reserves takes the launch burst. 800 M of the 1 B supply are for sale; 200 M are held back for the HyperCore book. Elysium runs 100–200 ms blocks and roughly 300 M gas/s, so a sniper wave is a queue, not an outage.'],
      ['For the first ', code('guardSeconds'), ' (60 s by default) each address can buy at most 1 % of supply, cumulative across calls. 1 % of the HYPE leg of every buy and sell goes to an immutable treasury in the same transaction.'],
    ],
    kv: [['Executes', 'anyone: buy / sell'], ['Guard', '60 s · ≤ 1 % per address'], ['Fee', '1 % HYPE leg → treasury']],
  },
  {
    no: '02', where: 'Elysium', title: 'Graduation',
    body: [
      ['When the 800 M are sold the pool freezes: no buy, no sell. The buy that crosses the line is clipped and its excess refunded. Anyone can then call ', code('graduate()'), '.'],
      ['The HYPE raised, the 200 M book tokens and any dust move to Settlement, which opens a ticket. ', code('listPrice'), ' is the curve’s final marginal price, so the book opens where the curve closed. The graduation target includes the ticker reserve: a launch that cannot pay for its own HyperCore ticker does not graduate.'],
    ],
    kv: [['Executes', 'anyone: graduate()'], ['Opens', 'Ticket · listPrice'], ['Target', 'includes tickerReserve']],
  },
  {
    no: '03', where: 'Elysium → HyperEVM', title: 'Dispatch',
    body: [
      [code('dispatch(id)'), ' is permissionless. Tokens cross through the canonical Elysium Router, HYPE through ', code('ArbSys.withdrawEth'), ', both to the immutable ', code('coreSettler'), ' on HyperEVM.'],
      ['Elysium is an Arbitrum Orbit chain: the Elysium → HyperEVM leg carries a challenge period. That delay is real and shows on the ticket.'],
    ],
    kv: [['Executes', 'anyone: dispatch(id)'], ['Bridge', 'canonical Router + ArbSys'], ['Delay', 'Orbit challenge period']],
  },
  {
    no: '04', where: 'HyperEVM → HyperCore', title: 'Settlement',
    body: [
      ['A HyperCore spot listing is an L1-signed HIP-1 ceremony: ticker auction, genesis, deposit wallet, spot registration. A contract cannot sign it. Until ElysiumCoreWriter ships, a deterministic keeper runs it with no discretionary step, capped by the ticket’s ', code('tickerBudget'), '.'],
      ['The keeper deposits the book tokens, converts the HYPE to USDC on Core, lays a symmetric ladder around ', code('listPrice'), ' on TOKEN/USDC, and calls ', code('confirm(id, coreTokenIndex, spotPairIndex)'), '.'],
    ],
    kv: [['Executes', 'keeper (keeper role)'], ['Budget', 'ticker paid by the curve'], ['Output', 'core token · spot pair']],
  },
  {
    no: '↳', where: 'Safety', title: 'Never locked',
    body: [['If a ticket is not dispatched or confirmed after 7 days, the immutable treasury can ', code('rescue(id)'), ': the assets go to the treasury in one transaction. There is no arbitrary call and no free spender or calldata anywhere.']],
    kv: [['Delay', '7 days'], ['Recipient', 'immutable treasury']],
  },
  {
    no: '05', where: 'Elysium → HyperCore', title: 'CoreWriter lane', future: true,
    body: [['Settlement carries a set-once ', code('ICoreWriterAdapter'), ' slot, unused in v0. When Elysium ships its CoreWriter predeploy, the ladder is placed directly from Elysium and the keeper step disappears.']],
    kv: [['Status', 'awaiting ElysiumCoreWriter'], ['Slot', 'set-once by owner']],
  },
]

export function renderHome(root: HTMLElement) {
  const canvas = h('canvas', { 'aria-hidden': 'true' })
  const hero = h('section', { class: 'hero', 'aria-label': 'CorePad' },
    canvas,
    h('div', { class: 'copy' },
      h('span', { class: 'label' }, 'Elysium 99801 → HyperCore · testnet'),
      h('h1', null, 'Absorb the burst.', h('br'), 'Settle the book.'),
      h('p', { class: 'tag' }, TAGLINE),
      h('div', { class: 'cta' },
        h('a', { class: 'btn solid', href: '#/ladder' }, h('span', { class: 'k' }, '01'), 'Open the ladder'),
        h('a', { class: 'btn', href: '#/issue' }, h('span', { class: 'k' }, '02'), 'Issue a launch'),
        h('a', { class: 'btn ghost', href: '#/manual' }, h('span', { class: 'k' }, '03'), 'Manual'),
      ),
    ),
    h('div', { class: 'annot', 'aria-hidden': 'true' },
      h('span', null, h('b', null, 'Absorption'), 'Elysium curve · 100–200 ms blocks'),
      h('span', { class: 'mid' }, h('b', null, 'Graduation'), '800 M sold · pool freezes'),
      h('span', { class: 'r' }, h('b', null, 'Book'), 'TOKEN/USDC levels at listPrice'),
    ),
  )
  root.append(hero)
  const mobile = matchMedia('(max-width: 900px)').matches
  const copy = hero.querySelector<HTMLElement>('.copy')!
  // the field starts under the copy, so no line crosses a button
  const topPx = () => copy.offsetTop + copy.offsetHeight + (mobile ? 70 : 90)
  const stopField = mountField(canvas, mobile
    ? { lines: 30, topPx, bottom: 0.9, calmFrom: 0.3, flatAt: 0.85 }
    : { lines: 44, topPx, bottom: 0.91, calmFrom: 0.36, flatAt: 0.76 })

  // the pipeline, one station per stage
  const list = h('ol', { class: 'stations' })
  for (const s of STATIONS) {
    list.append(h('li', { class: 'station' + (s.future ? ' future' : '') },
      h('div', { class: 'no' }, h('span', null, s.no), h('span', { class: 'where' }, s.where)),
      h('div', null, h('h3', null, s.title), ...s.body.map((p) => h('p', null, ...p))),
      h('dl', { class: 'kv' }, ...s.kv.map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v)))),
    ))
  }
  root.append(h('section', { class: 'sec', id: 'pipeline' },
    h('div', { class: 'sechead' }, h('span', { class: 'no' }, '§ 1 · Pipeline'),
      h('div', null, h('h2', null, 'Elysium → Graduation → HyperCore'),
        h('p', null, 'Four stations, each with its executor and its real constraint. Nothing in the path is discretionary; the one off-chain step is a deterministic keeper, and it exists only because HyperCore listings cannot be signed by a contract yet.'))),
    list))

  // why Elysium: throughput, to scale
  const gasRow = (name: string, v: number, label: string, note: string) => h('div', { class: 'row' },
    h('span', null, name, h('span', { class: 'hint', style: 'display:block' }, note)),
    h('span', { class: 'bar' }, h('i', { style: `width:${Math.max(0.4, (v / 300) * 100)}%` })),
    h('span', { class: 'num' }, label))
  root.append(h('section', { class: 'sec' },
    h('div', { class: 'sechead' }, h('span', { class: 'no' }, '§ 2 · Throughput'),
      h('div', null, h('h2', null, 'The burst lands where there is room'),
        h('p', null, 'HyperEVM is deliberately throttled to about 2 M gas/s so it never desynchronises HyperCore. A contested launch saturates it in one block. Elysium, an Orbit chain settling to Hyperliquid, has about 150 times the room. Bars to scale.'))),
    h('div', { class: 'gas' },
      gasRow('HyperEVM', 2, '~2 M gas/s', 'throttled for HyperCore'),
      gasRow('Elysium', 300, '~300 M gas/s', '100–200 ms blocks'))))

  // ladder preview
  const ladHost = h('div')
  const sec = h('section', { class: 'sec', style: 'padding-left:0;padding-right:0' },
    h('div', { class: 'sechead', style: 'padding:0 var(--gut)' }, h('span', { class: 'no' }, '§ 3 · Ladder'),
      h('div', null, h('h2', null, 'Closest to graduation'),
        h('p', null, 'The five launches nearest the line, read live from Elysium.'))),
    ladHost)
  root.append(sec, footer())
  let stopLad: (() => void) | null = null
  if (DEPLOYED) {
    const l = mountLadder(ladHost, { limit: 5 }); stopLad = () => l.stop()
    ladHost.append(h('div', { style: 'padding:18px var(--gut) 0' }, h('a', { class: 'btn ghost', href: '#/ladder' }, 'Full ladder')))
  } else ladHost.append(ghostLadder(), notDeployed('The launch ladder'))

  return () => { stopField(); stopLad?.() }
}
