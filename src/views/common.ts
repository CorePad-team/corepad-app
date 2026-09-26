import { h } from '../ui'
import { addresses, NET } from '../config'

/** Honest empty state driven by the addresses config. No rows are invented. */
export function notDeployed(what = 'Live data'): HTMLElement {
  const cfg = JSON.stringify({ chainId: 99801, factory: addresses.factory, settlement: addresses.settlement }, null, 2)
  return h('div', { class: 'nodeploy', role: 'note' },
    h('span', { class: 'label' }, 'Status · Elysium testnet 99801'),
    h('h3', null, 'No testnet deployment yet'),
    h('p', null, `${what} appears here once the CorePad contracts are deployed on Elysium testnet. The app reads its addresses from one config file; while they are null, no launch, balance or transaction is shown.`),
    h('pre', null, cfg),
  )
}

export function footer(): HTMLElement {
  return h('footer', { class: 'foot' },
    h('span', null, 'CorePad v0 · target Elysium testnet 99801'),
    h('nav', null,
      h('a', { href: 'https://elysium.kinetiq.xyz/testnet-explorer', target: '_blank', rel: 'noopener' }, NET.explorer + ' ↗'),
      h('a', { href: 'https://elysium.kinetiq.xyz/testnet-bridge', target: '_blank', rel: 'noopener' }, NET.bridge + ' ↗'),
      h('a', { href: '#/manual' }, 'Manual'),
    ),
  )
}
