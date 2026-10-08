import './style.css'
import { h, short, toast, errMsg } from './ui'
import { pub, wallet, fetchLaunches } from './chain'
import { ELYSIUM, ENVIRONMENT } from './config'
import { BRAND } from './brand'
import { renderHome } from './views/home'
import { renderLadder } from './views/ladder'
import { renderLaunch } from './views/launch'
import { renderIssue } from './views/issue'
import { renderManual } from './views/manual'

type View = (root: HTMLElement, arg: string) => (() => void) | void
const routes: { key: string; t: string; view: View }[] = [
  { key: '', t: 'Home', view: renderHome },
  { key: 'ladder', t: 'Launches', view: renderLadder },
  { key: 'issue', t: 'Issue', view: renderIssue },
  { key: 'manual', t: 'Manual', view: renderManual },
]

const app = document.getElementById('app')!

function brandEl() {
  const a = h('a', { class: 'brand', href: '#/', 'aria-label': 'CorePad home' })
  if (BRAND.lockup) a.append(h('img', { src: BRAND.lockup, alt: 'CorePad', height: '26' }))
  else {
    if (BRAND.mark) a.append(h('img', { src: BRAND.mark, alt: '', height: '22' }))
    a.append(h('span', { class: 'wordmark' }, 'CorePad'))
  }
  return a
}

function navLinks(cls: string) {
  return h('nav', { class: cls, 'aria-label': 'Sections' },
    ...routes.filter((r) => r.key !== 'issue').map((r) => h('a', { href: '#/' + r.key, 'data-key': r.key }, r.t)))
}

/** Search box: filters the Launches table; Enter on an exact ticker, id or address opens that launch. */
function searchBox() {
  const input = h('input', { type: 'search', placeholder: 'Search ticker, name or address', 'aria-label': 'Search launches', autocomplete: 'off', spellcheck: 'false' }) as HTMLInputElement
  const wrap = h('label', { class: 'search' }, h('span', { class: 'sic', 'aria-hidden': 'true' }), input, h('kbd', { 'aria-hidden': 'true' }, '/'))
  input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return
    const q = input.value.trim()
    if (!q) return
    try {
      const list = await fetchLaunches()
      const s = q.toLowerCase().replace(/^#/, '')
      const hit = list.find((l) => l.symbol.toLowerCase() === s || String(l.id) === s || l.token.toLowerCase() === s || l.pool.toLowerCase() === s)
      location.hash = hit ? `#/launch/${hit.id}` : `#/ladder/${encodeURIComponent(q)}`
    } catch { location.hash = `#/ladder/${encodeURIComponent(q)}` }
    input.blur()
  })
  return { wrap, input }
}

function walletBtn(cls = 'btn') {
  const btn = h('button', { class: cls, 'data-wallet': '' }, 'Connect wallet')
  btn.addEventListener('click', async () => {
    try {
      if (!wallet.account) await wallet.connect()
      if (wallet.chainId !== ELYSIUM.id) await wallet.ensureChain()
    } catch (e) { toast(errMsg(e), true) }
  })
  return btn
}

function netChip() {
  return h('span', { class: 'chip', title: 'Network and last block read' },
    h('i', { class: 'live', 'aria-hidden': 'true' }), h('span', null, 'Elysium ' + ELYSIUM.id), h('span', { class: 'n blk', 'data-blk': '' }, '—'))
}

export const X_URL = 'https://x.com/CorePad_hl'
export const GITHUB_URL = 'https://github.com/CorePad-team'

const ENV_SHORT = ENVIRONMENT === 'testnet' ? 'testnet' : ENVIRONMENT === 'local-rehearsal' ? 'local rehearsal' : 'pre-deployment'

/** Provenance: where the numbers on screen come from, on every page. */
function provenance() {
  if (ENVIRONMENT === 'testnet') return h('div', { class: 'prov testnet', role: 'note' },
    h('b', null, 'TESTNET'),
    h('span', null, 'CorePad runs on Elysium testnet (chain 99801). Tokens and HYPE here have no value.'),
    h('a', { href: 'https://elysium.kinetiq.xyz/testnet-faucet', target: '_blank', rel: 'noopener' }, 'Testnet HYPE faucet ↗'))
  if (ENVIRONMENT === 'local-rehearsal') return h('div', { class: 'prov', role: 'note' }, h('b', null, 'LOCAL REHEARSAL'), h('span', null, 'Real contract execution on a local node. Not Elysium testnet.'))
  return h('div', { class: 'prov', role: 'note' }, h('b', null, 'PRE-DEPLOYMENT'), h('span', null, 'No CorePad testnet deployment yet. Nothing on this site is live data.'))
}

// ---- shell (built once): top bar, mobile drawer, stage ----
const desk = searchBox()
const mob = searchBox()
const drawer = h('div', { class: 'drawer', id: 'drawer' },
  mob.wrap, navLinks('dnav'),
  h('a', { class: 'btn solid wide', href: '#/issue' }, '+ Issue a launch'),
  walletBtn('btn wide'),
  h('div', { class: 'dfoot' }, netChip(),
    h('a', { href: X_URL, target: '_blank', rel: 'noopener' }, 'X @CorePad_hl ↗'),
    h('a', { href: GITHUB_URL, target: '_blank', rel: 'noopener' }, 'GitHub ↗')))
const menuBtn = h('button', { class: 'menu', 'aria-expanded': 'false', 'aria-controls': 'drawer', type: 'button' }, 'Menu')
menuBtn.addEventListener('click', () => {
  const open = !drawer.classList.contains('open')
  drawer.classList.toggle('open', open)
  menuBtn.setAttribute('aria-expanded', String(open))
  menuBtn.textContent = open ? 'Close' : 'Menu'
})
const topnav = h('header', { class: 'topnav' },
  h('div', { class: 'tn' },
    brandEl(), h('span', { class: 'envtag' }, ENV_SHORT), navLinks('tnav'), desk.wrap,
    h('div', { class: 'tright' }, netChip(), h('a', { class: 'btn solid tissue', href: '#/issue' }, '+ Issue a launch'), walletBtn('btn wbtn'), menuBtn)))
const stage = h('main', { class: 'stage', id: 'stage' })
app.append(h('div', { class: 'frame' }, topnav, drawer, provenance(), stage))
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); desk.input.focus() }
})

function paintWallet() {
  document.querySelectorAll<HTMLButtonElement>('[data-wallet]').forEach((b) => {
    if (!wallet.account) b.textContent = wallet.available() ? 'Connect wallet' : 'No wallet detected'
    else if (wallet.chainId !== ELYSIUM.id) b.textContent = 'Switch to 99801'
    else b.textContent = short(wallet.account)
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
  const [head, ...rest] = hash.split('/')
  const arg = rest.join('/')
  if (typeof cleanup === 'function') cleanup()
  stage.replaceChildren()
  drawer.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); menuBtn.textContent = 'Menu'
  let key = head
  let view: View
  if (head === 'launch') { view = renderLaunch; key = 'ladder' }
  else view = (routes.find((r) => r.key === head) ?? routes[0]).view
  document.querySelectorAll<HTMLAnchorElement>('.tnav a, .dnav a').forEach((a) => {
    if (a.dataset.key === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current')
  })
  const r = routes.find((x) => x.key === key)
  document.title = r && r.key ? `${r.t} · CorePad` : 'CorePad'
  cleanup = view(stage, decodeURIComponent(arg))
  window.scrollTo(0, 0)
}
window.addEventListener('hashchange', route)
route()
