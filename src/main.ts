import './style.css'
import { h, short, toast, errMsg } from './ui'
import { pub, wallet } from './chain'
import { ELYSIUM, ENVIRONMENT } from './config'
import { BRAND } from './brand'
import { renderHome } from './views/home'
import { renderLadder } from './views/ladder'
import { renderLaunch } from './views/launch'
import { renderIssue } from './views/issue'
import { renderManual } from './views/manual'

type View = (root: HTMLElement, arg: string) => (() => void) | void
const routes: { key: string; n: string; t: string; s: string; view: View }[] = [
  { key: '', n: '00', t: 'Field', s: 'overview', view: renderHome },
  { key: 'ladder', n: '01', t: 'Ladder', s: 'launches', view: renderLadder },
  { key: 'issue', n: '02', t: 'Issue', s: 'create', view: renderIssue },
  { key: 'manual', n: '03', t: 'Manual', s: 'docs', view: renderManual },
]

const app = document.getElementById('app')!

function brandEl() {
  const a = h('a', { class: 'brand', href: '#/', 'aria-label': 'CorePad home' })
  if (BRAND.lockup) a.append(h('img', { src: BRAND.lockup, alt: 'CorePad', height: '28' }))
  else {
    if (BRAND.mark) a.append(h('img', { src: BRAND.mark, alt: '', height: '22' }))
    a.append(h('span', { class: 'wordmark' }, 'CorePad'))
  }
  return a
}

function indexList() {
  const ul = h('ul', { class: 'index' })
  for (const r of routes) {
    ul.append(h('li', null, h('a', { href: '#/' + r.key, 'data-key': r.key },
      h('span', { class: 'n' }, r.n), h('span', { class: 't' }, r.t), h('span', { class: 's' }, r.s))))
  }
  return ul
}

function railFoot() {
  const blk = h('span', { class: 'num', 'data-blk': '' }, '—')
  const net = h('div', { class: 'net' },
    h('div', { class: 'row' }, h('span', null, 'target'), h('b', null, 'Elysium ' + ELYSIUM.id)),
    h('div', { class: 'row' }, h('span', null, 'last block read'), h('b', null, blk)),
    h('div', { class: 'row' }, h('span', null, 'data'), h('b', null, ENV_SHORT)),
  )
  const btn = h('button', { class: 'btn wide', 'data-wallet': '' }, 'Connect wallet')
  btn.addEventListener('click', async () => {
    try {
      if (!wallet.account) await wallet.connect()
      if (wallet.chainId !== ELYSIUM.id) await wallet.ensureChain()
    } catch (e) { toast(errMsg(e), true) }
  })
  return h('div', { class: 'railfoot' }, net, xLink('xrow'), btn)
}

export const X_URL = 'https://x.com/CorePad_hl'
function xLink(cls: string) {
  return h('a', { class: cls, href: X_URL, target: '_blank', rel: 'noopener', 'aria-label': 'CorePad on X' }, h('span', null, 'X'), h('b', null, '@CorePad_hl ↗'))
}

const ENV_SHORT = ENVIRONMENT === 'testnet' ? 'testnet' : ENVIRONMENT === 'local-rehearsal' ? 'local rehearsal' : 'pre-deployment'

/** Provenance: where the numbers on screen come from, on every page. */
function provenance() {
  if (ENVIRONMENT === 'testnet') return h('div', { class: 'prov testnet', role: 'note' },
    h('b', null, 'TESTNET'),
    h('span', null, 'CorePad is deployed on Elysium testnet (chain 99801). Tokens and HYPE here have no value. Mainnet is not live yet.'),
    h('a', { href: 'https://elysium.kinetiq.xyz/testnet-faucet', target: '_blank', rel: 'noopener' }, 'Testnet HYPE faucet ↗'))
  if (ENVIRONMENT === 'local-rehearsal') return h('div', { class: 'prov', role: 'note' }, h('b', null, 'LOCAL REHEARSAL'), h('span', null, 'Real contract execution on a local node. Not Elysium testnet.'))
  return h('div', { class: 'prov', role: 'note' }, h('b', null, 'PRE-DEPLOYMENT'), h('span', null, 'No CorePad testnet deployment yet. Nothing on this site is live data.'))
}

// ---- shell (built once) ----
const rail = h('nav', { class: 'rail', 'aria-label': 'Index' }, brandEl(), indexList(), railFoot())
const drawer = h('div', { class: 'drawer', id: 'drawer' }, indexList(), railFoot())
const idxBtn = h('button', { class: 'idx', 'aria-expanded': 'false', 'aria-controls': 'drawer' }, 'Index')
idxBtn.addEventListener('click', () => {
  const open = !drawer.classList.contains('open')
  drawer.classList.toggle('open', open)
  idxBtn.setAttribute('aria-expanded', String(open))
  idxBtn.textContent = open ? 'Close' : 'Index'
})
const topbar = h('header', { class: 'topbar' }, brandEl(), h('span', { class: 'envtag' }, ENV_SHORT), h('a', { class: 'xtop', href: X_URL, target: '_blank', rel: 'noopener', 'aria-label': 'CorePad on X (@CorePad_hl)' }, 'X ↗'), idxBtn)
const stage = h('main', { class: 'stage', id: 'stage' })
app.append(h('div', { class: 'frame' }, rail, h('div', { class: 'main-col' }, topbar, drawer, provenance(), stage)))

function paintWallet() {
  document.querySelectorAll<HTMLButtonElement>('[data-wallet]').forEach((b) => {
    if (!wallet.account) { b.textContent = wallet.available() ? 'Connect wallet' : 'No wallet detected'; b.className = 'btn wide' }
    else if (wallet.chainId !== ELYSIUM.id) { b.textContent = 'Wrong network · switch to 99801'; b.className = 'btn wide' }
    else { b.textContent = short(wallet.account) + ' · 99801'; b.className = 'btn wide' }
  })
}
wallet.listeners.add(paintWallet)
paintWallet()

// ---- live block height: text-only updates ----
async function tickBlock() {
  try {
    const n = await pub.getBlockNumber({ cacheTime: 0 })
    document.querySelectorAll('[data-blk]').forEach((e) => { e.textContent = n.toLocaleString('en-US') })
  } catch {
    document.querySelectorAll('[data-blk]').forEach((e) => { if (!e.textContent!.startsWith('STALE')) e.textContent = 'STALE · ' + e.textContent })
  }
}
tickBlock()
setInterval(tickBlock, 3000)

// ---- router ----
let cleanup: (() => void) | void
function route() {
  const hash = location.hash.replace(/^#\/?/, '')
  const [head, arg = ''] = hash.split('/')
  if (typeof cleanup === 'function') cleanup()
  stage.replaceChildren()
  drawer.classList.remove('open'); idxBtn.setAttribute('aria-expanded', 'false'); idxBtn.textContent = 'Index'
  let key = head
  let view: View
  if (head === 'launch') { view = renderLaunch; key = 'ladder' }
  else view = (routes.find((r) => r.key === head) ?? routes[0]).view
  document.querySelectorAll<HTMLAnchorElement>('.index a').forEach((a) => {
    if (a.dataset.key === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current')
  })
  const r = routes.find((x) => x.key === key)
  document.title = r && r.key ? `${r.t} · CorePad` : 'CorePad'
  cleanup = view(stage, decodeURIComponent(arg))
  window.scrollTo(0, 0)
}
window.addEventListener('hashchange', route)
route()
