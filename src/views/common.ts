import { h } from '../ui'
import { addresses } from '../config'

/** Honest empty state driven by the addresses config. No rows are invented. */
export function notDeployed(what = 'Live data'): HTMLElement {
  const cfg = JSON.stringify({ chainId: 99801, factory: addresses.factory, settlement: addresses.settlement }, null, 2)
  return h('div', { class: 'nodeploy', role: 'note' },
    h('span', { class: 'dot', 'aria-hidden': 'true' }),
    h('span', { class: 'label' }, 'Status · Elysium testnet 99801'),
    h('h3', null, 'Not deployed yet'),
    h('p', null, `${what} appears here once the CorePad contracts are deployed on Elysium testnet. The app reads its addresses from a single config; until it holds real addresses, nothing on this page is presented as live.`),
    h('pre', null, cfg),
  )
}

export function footer(): HTMLElement {
  return h('footer', { class: 'foot' },
    h('span', null, 'CorePad · Elysium testnet 99801 · v0'),
    h('nav', null,
      h('a', { href: 'https://elysium.kinetiq.xyz/testnet-explorer', target: '_blank', rel: 'noopener' }, 'Explorer ↗'),
      h('a', { href: 'https://elysium.kinetiq.xyz/testnet-bridge', target: '_blank', rel: 'noopener' }, 'Bridge ↗'),
      h('a', { href: '#/manual' }, 'Manual'),
    ),
  )
}
