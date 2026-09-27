import { formatEther, type Address, type Hash } from 'viem'
import { EXPLORER, ENVIRONMENT } from './config'

/** Tiny element builder. Views build structure once; live values are written with textContent. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Record<string, unknown> | null = null, ...kids: (Node | string | null | false | undefined)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue
    if (k === 'class') el.className = String(v)
    else if (k === 'html') el.innerHTML = String(v)
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener)
    else el.setAttribute(k, v === true ? '' : String(v))
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c)
  return el
}

export const short = (a: string) => a.slice(0, 6) + '…' + a.slice(-4)
// Local rehearsal data does not exist on the public explorer: no links then.
export const addrLink = (a: Address): string | null => ENVIRONMENT === 'testnet' ? `${EXPLORER}/address/${a}` : null
export const txLink = (t: Hash): string | null => ENVIRONMENT === 'testnet' ? `${EXPLORER}/tx/${t}` : null
/** An explorer link when one exists, plain text otherwise. */
export function ext(href: string | null, text: string, attrs: Record<string, unknown> = {}): HTMLElement {
  return href ? h('a', { href, target: '_blank', rel: 'noopener', ...attrs }, text) : h('span', attrs, text)
}

/** Numbers: fixed decimals, thin grouping. */
export function fmt(n: number, d = 2): string {
  if (!isFinite(n)) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}
export function hype(wei: bigint | null | undefined, d = 4): string {
  if (wei === null || wei === undefined) return '—'
  return fmt(Number(formatEther(wei)), d)
}
export function tokens(wei: bigint | null | undefined): string {
  if (wei === null || wei === undefined) return '—'
  const n = Number(formatEther(wei))
  if (n >= 1e9) return fmt(n / 1e9, 3) + '\u00a0B'
  if (n >= 1e6) return fmt(n / 1e6, 2) + '\u00a0M'
  if (n >= 1e3) return fmt(n / 1e3, 2) + '\u00a0k'
  return fmt(n, 2)
}
/** HYPE per token. Below 1e-4 in scientific notation (1.573e−7): scannable and comparable in a column. */
export function price(p: number): string {
  if (!isFinite(p) || p <= 0) return '—'
  if (p >= 0.0001) return fmt(p, p >= 1 ? 4 : 6)
  const [m, e] = p.toExponential(3).split('e')
  return `${m}e${e.replace('-', '−')}`
}
const NB = '\u00a0'
/** amount + unit that never wraps apart */
export const unit = (v: string, u: string) => v + NB + u
export function pct(x: number, d = 2): string { return fmt(x * 100, d) + '%' }
export function ago(sec: number): string {
  if (sec < 60) return Math.max(0, Math.floor(sec)) + 's'
  if (sec < 3600) return Math.floor(sec / 60) + 'm'
  if (sec < 86400) return Math.floor(sec / 3600) + 'h'
  return Math.floor(sec / 86400) + 'd'
}

let toastTimer = 0
export function toast(msg: string, bad = false, ms = 6000) {
  let el = document.querySelector<HTMLDivElement>('.toast')
  if (!el) { el = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(el) }
  el.textContent = msg
  el.classList.toggle('bad', bad)
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), ms)
}
export function errMsg(e: unknown): string {
  const x = e as { shortMessage?: string; message?: string; walk?: (f: (c: unknown) => boolean) => unknown }
  const base = (x?.shortMessage || x?.message || String(e)).split('\n')[0]
  // viem keeps the decoded custom error (GuardExceeded, Slippage, …) on the cause, not in shortMessage
  const rev = x?.walk?.((c) => (c as { name?: string })?.name === 'ContractFunctionRevertedError') as
    { data?: { errorName?: string; args?: readonly unknown[] }; reason?: string; signature?: string } | undefined
  const why = rev?.data?.errorName
    ? rev.data.errorName + (rev.data.args?.length ? '(' + rev.data.args.map(String).join(', ') + ')' : '')
    : rev?.reason ?? rev?.signature
  return (why && !base.includes(why) ? `${base} ${why}` : base).slice(0, 240)
}
