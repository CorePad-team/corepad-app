import { h } from '../ui'
import { mountField } from '../field'
import { DEPLOYED } from '../config'
import { mountLadder, ghostLadder } from './ladder'
import { notDeployed, footer } from './common'

const TAGLINE = 'CorePad leverages Elysium to execute high-density launches, settling seamlessly into Hyperliquid Core.'

type Station = { no: string; where: string; title: string; body: (string | Node)[]; steps?: (string | Node)[][]; kv: [string, string][] }
const code = (s: string) => h('code', null, s)

// Three stages, as in the campaign line. Full mechanics live in the Manual.
const STATIONS: Station[] = [
  {
    no: '01', where: 'Elysium', title: 'Absorb',
    body: ['A constant-product curve on virtual reserves takes the opening burst on Elysium, an Orbit chain with 100–200 ms blocks. 800 M of the 1 B supply are sold on the curve; 200 M wait for the HyperCore book. For 60 s, each address can buy at most 1 % of supply in total.'],
    kv: [['Executes', 'anyone · buy / sell'], ['Guard', '60 s · 1 % per address'], ['Fee', '1 % of HYPE leg → treasury']],
  },
  {
    no: '02', where: 'Elysium', title: 'Graduate',
    body: ['At 800 M sold the pool freezes; the crossing buy is clipped and refunded. Anyone can call ', code('graduate()'), ': the HYPE raised and the 200 M book tokens move to Settlement, which opens a ticket at ', code('listPrice'), ', the final curve price in HYPE per token. The target includes the ticker reserve.'],
    kv: [['Executes', 'anyone · graduate()'], ['Opens', 'settlement ticket'], ['Price', 'listPrice · HYPE/token']],
  },
  {
    no: '03', where: 'Elysium → HyperCore', title: 'Settle',
    body: ['Settlement begins after graduation and takes time. A HyperCore spot listing is an L1-signed HIP-1 ceremony that a contract cannot sign, so a deterministic keeper runs the off-chain part, in this order:'],
    steps: [
      ['Mirror registered on HyperEVM'],
      [code('dispatch(id)'), ' · anyone'],
      ['Challenge period, then withdrawals claimed'],
      ['HIP-1 ceremony within ', code('tickerBudget'), ', deposit, ladder around ', code('listPrice')],
      [code('confirm(id, coreTokenIndex, spotPairIndex)')],
    ],
    kv: [['Executes', 'keeper, anyone for dispatch'], ['Delay', 'challenge period'], ['Output', 'core token · spot pair']],
  },
]

export function renderHome(root: HTMLElement) {
  const canvas = h('canvas', { 'aria-hidden': 'true' })
  const dot = h('span', { class: 'dot-event', 'aria-hidden': 'true' })
  const zone = h('div', { class: 'fieldzone', role: 'img', 'aria-label': 'Parallel rails rise into relief, then settle flat: the launch absorbed, then the order book.' }, canvas, dot)
  root.append(
    h('section', { class: 'hero', 'aria-label': 'CorePad' },
      h('span', { class: 'label' }, 'Target route · Elysium → HyperCore'),
      h('h1', null, 'Absorb. Graduate. Settle.'),
      h('p', { class: 'tag' }, TAGLINE),
      h('div', { class: 'cta' },
        h('a', { class: 'btn solid', href: '#/ladder' }, h('span', { class: 'k' }, '01'), 'Open the ladder'),
        h('a', { class: 'btn', href: '#/issue' }, h('span', { class: 'k' }, '02'), DEPLOYED ? 'Issue a launch' : 'How issuing works'),
      ),
    ),
    zone,
    h('div', { class: 'captions', 'aria-hidden': 'true' },
      h('span', null, h('b', null, '01 ABSORB'), h('span', { class: 'cx' }, 'curve on Elysium')),
      h('span', { class: 'c2' }, h('b', null, '02 GRADUATE'), h('span', { class: 'cx' }, '800 M sold · pool freezes')),
      h('span', { class: 'c3' }, h('b', null, '03 SETTLE'), h('span', { class: 'cx' }, 'levels on the HyperCore book')),
    ),
  )
  const mobile = matchMedia('(max-width: 959px)').matches
  const stopField = mountField(canvas, mobile ? { pitch: 10, headroom: 0.3, amp: 0.78, spread: 1.35 } : { pitch: 9, headroom: 0.3 })
  // the one event dot: alone in the void above the level rails, clear of every line
  const placeDot = () => { const w = zone.clientWidth, hh = zone.clientHeight; dot.style.left = Math.round(w * 0.86) + 'px'; dot.style.top = Math.round(hh * (mobile ? 0.12 : 0.1)) + 'px' }
  placeDot()
  const ro = new ResizeObserver(placeDot); ro.observe(zone)

  const list = h('ol', { class: 'stations' })
  for (const s of STATIONS) {
    list.append(h('li', { class: 'station' },
      h('div', { class: 'no' }, h('span', null, s.no), h('span', null, s.where)),
      h('div', null, h('h3', null, s.title), h('p', null, ...s.body),
        s.steps ? h('ul', null, ...s.steps.map((st) => h('li', null, ...st))) : null),
      h('dl', { class: 'kv' }, ...s.kv.map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v)))),
    ))
  }
  root.append(h('section', { class: 'sec', id: 'pipeline' },
    h('div', { class: 'sechead' }, h('span', { class: 'label' }, '§ Pipeline'),
      h('div', null, h('h2', null, 'Elysium → Graduation → HyperCore'),
        h('p', null, 'Three stages, each with its executor and its real constraint. The one off-chain step is a deterministic keeper, and it exists because HyperCore listings cannot be signed by a contract yet. ', h('a', { href: '#/manual' }, 'Full mechanics in the Manual.')))),
    list,
    h('div', { class: 'notes' },
      h('div', null, h('h4', null, 'Abort → trading reopens'), h('p', null, 'If a ticket is not dispatched within ', code('rescueDelay'), ' (7 days) of graduation, anyone can ', code('abort(id)'), ': the HYPE and book tokens go back to the pool and the curve reopens where it stopped, so holders can sell. The treasury receives nothing from an abort.')),
      h('div', null, h('h4', null, 'CoreWriter lane · not live'), h('p', null, 'The future ', code('ICoreWriterAdapter'), ' slot on Settlement is unused in v0. Its eventual scope depends on the interface Elysium publishes.')),
    )))

  const gasRow = (name: string, v: number, label: string, note: string) => h('div', { class: 'row' },
    h('span', null, name, h('span', { class: 'hint', style: 'display:block' }, note)),
    h('span', { class: 'bar' }, h('i', { style: `width:${(v / 300) * 100}%` })),
    h('span', { class: 'num' }, label))
  root.append(h('section', { class: 'sec' },
    h('div', { class: 'sechead' }, h('span', { class: 'label' }, '§ Capacity'),
      h('div', null, h('h2', null, 'The burst lands where there is room'),
        h('p', null, 'HyperEVM is deliberately throttled to keep pace with HyperCore, so a contested launch competes for little block space. Elysium publishes two orders of magnitude more. Bars to scale.'),
        h('p', { class: 'hint' }, 'Published capacity estimates · project memo. Not telemetry.'))),
    h('div', { class: 'gas' },
      gasRow('HyperEVM', 2, '~2 M gas/s', 'throttled for HyperCore'),
      gasRow('Elysium', 300, '~300 M gas/s', '100–200 ms blocks'))))

  const ladHost = h('div')
  root.append(h('section', { class: 'sec', style: 'padding-left:0;padding-right:0;padding-bottom:0' },
    h('div', { class: 'sechead', style: 'padding:0 var(--gut)' }, h('span', { class: 'label' }, '§ Ladder'),
      h('div', null, h('h2', null, 'Closest to graduation'),
        h('p', null, 'Up to five active launches, ordered by tokens left to sell.'))),
    ladHost), footer())
  let stopLad: (() => void) | null = null
  if (DEPLOYED) {
    const l = mountLadder(ladHost, { limit: 5, filter: () => 'absorbing' }); stopLad = () => l.stop()
    ladHost.append(h('div', { style: 'padding:20px var(--gut) 40px' }, h('a', { class: 'btn', href: '#/ladder' }, 'Full ladder')))
  } else ladHost.append(ghostLadder(), notDeployed('The launch ladder'))

  return () => { stopField(); ro.disconnect(); stopLad?.() }
}
