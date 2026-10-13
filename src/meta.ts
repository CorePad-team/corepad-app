import type { Abi, Hash } from 'viem'
import { pub, send } from './chain'
import { addresses } from './config'
import MetadataAbi from './abi/CorePadMetadata.json'

export const metaAbi = MetadataAbi as unknown as Abi

/** The JSON a launch's metadata URI points to. Every field is optional except name and symbol. */
export type TokenMeta = {
  name: string; symbol: string; description?: string
  image?: string; banner?: string
  website?: string; twitter?: string; telegram?: string
}

const MAX_DESC = 500
const httpUrl = (v: string) => { try { const u = new URL(v); return u.protocol === 'https:' && u.hostname.includes('.') ? u.toString() : null } catch { return null } }

/** Cleans what a creator typed into links the page can render safely. Null fields are dropped. */
export function normalizeLinks(raw: { website: string; twitter: string; telegram: string }): { website?: string; twitter?: string; telegram?: string; problem?: string } {
  const out: { website?: string; twitter?: string; telegram?: string; problem?: string } = {}
  const w = raw.website.trim()
  if (w) { const u = httpUrl(/^https?:\/\//i.test(w) ? w.replace(/^http:/i, 'https:') : 'https://' + w); if (u) out.website = u; else out.problem = 'Website: not a valid https URL.' }
  const x = raw.twitter.trim().replace(/^@/, '')
  if (x) {
    const handle = x.match(/^(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})/i)?.[1] ?? (/^[A-Za-z0-9_]{1,15}$/.test(x) ? x : null)
    if (handle) out.twitter = 'https://x.com/' + handle; else out.problem = 'X: a handle (@name) or an x.com link.'
  }
  const t = raw.telegram.trim().replace(/^@/, '')
  if (t) {
    const name = t.match(/^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([A-Za-z0-9_+]{3,64})/i)?.[1] ?? (/^[A-Za-z0-9_]{5,32}$/.test(t) ? t : null)
    if (name) out.telegram = 'https://t.me/' + name; else out.problem = 'Telegram: a @group or a t.me link.'
  }
  return out
}

/** Uploads one file to Vercel Blob through api/upload.js (the browser sends it directly to Blob). */
export async function uploadFile(kind: 'logo' | 'banner' | 'meta', file: Blob, name: string): Promise<string> {
  const { upload } = await import('@vercel/blob/client')
  const r = await upload(`${kind}/${name}`, file, { access: 'public', handleUploadUrl: '/api/upload', contentType: file.type || undefined })
  return r.url
}

export async function uploadMeta(m: TokenMeta): Promise<string> {
  const clean: TokenMeta = { name: m.name, symbol: m.symbol }
  if (m.description?.trim()) clean.description = m.description.trim().slice(0, MAX_DESC)
  for (const k of ['image', 'banner', 'website', 'twitter', 'telegram'] as const) if (m[k]) clean[k] = m[k]
  const blob = new Blob([JSON.stringify(clean)], { type: 'application/json' })
  return uploadFile('meta', blob, `${m.symbol.toLowerCase()}.json`)
}

export function setMetadata(id: bigint, uri: string): Promise<Hash> {
  if (!addresses.metadata) throw new Error('No metadata registry in this deployment')
  return send({ address: addresses.metadata, abi: metaAbi, functionName: 'set', args: [id, uri] })
}

/* ---------- reads: registry URIs for every launch, JSON documents cached forever per URI ---------- */
const uris = new Map<string, string>()          // launch id -> uri ('' = none)
const docs = new Map<string, TokenMeta | null>() // uri -> document (null = unreadable)
const pending = new Map<string, Promise<TokenMeta | null>>()
const listeners = new Set<() => void>()
export const onMeta = (f: () => void) => { listeners.add(f); return () => listeners.delete(f) }
const notify = () => listeners.forEach((f) => f())

function fetchDoc(uri: string): Promise<TokenMeta | null> {
  if (docs.has(uri)) return Promise.resolve(docs.get(uri)!)
  let p = pending.get(uri)
  if (!p) {
    p = fetch(uri).then((r) => (r.ok ? r.json() : null)).then((j) => sanitize(j)).catch(() => null)
      .then((d) => { docs.set(uri, d); pending.delete(uri); notify(); return d })
    pending.set(uri, p)
  }
  return p
}

/** Only https links and plain text survive: the document is written by whoever created the launch. */
function sanitize(j: unknown): TokenMeta | null {
  if (!j || typeof j !== 'object') return null
  const o = j as Record<string, unknown>
  const str = (v: unknown, n = 300) => (typeof v === 'string' ? v.slice(0, n) : undefined)
  const url = (v: unknown) => { const s = str(v); if (!s) return undefined; try { const u = new URL(s); return u.protocol === 'https:' ? u.toString() : undefined } catch { return undefined } }
  return { name: str(o.name, 64) ?? '', symbol: str(o.symbol, 16) ?? '', description: str(o.description, MAX_DESC), image: url(o.image), banner: url(o.banner), website: url(o.website), twitter: url(o.twitter), telegram: url(o.telegram) }
}

let lastRead = 0
/** Reads the registry for these ids (one multicall) at most every 20 s, then loads new documents. */
export async function refreshMeta(ids: bigint[], force = false) {
  if (!addresses.metadata || !ids.length) return
  if (!force && Date.now() - lastRead < 20_000) return
  lastRead = Date.now()
  try {
    const out = await pub.readContract({ address: addresses.metadata, abi: metaAbi, functionName: 'urisOf', args: [ids] }) as readonly string[]
    let changed = false
    ids.forEach((id, i) => { const k = String(id); if (uris.get(k) !== out[i]) { uris.set(k, out[i]); changed = true } })
    if (changed) notify()
    out.filter(Boolean).forEach((u) => { void fetchDoc(u) })
  } catch { /* keep what we have */ }
}

export function metaOf(id: bigint): TokenMeta | null {
  const u = uris.get(String(id))
  return u ? docs.get(u) ?? null : null
}

/** A square token tile: the logo when the launch has one, otherwise its first two letters. */
export function paintTile(tile: HTMLElement, id: bigint, symbol: string) {
  const m = metaOf(id)
  const img = tile.querySelector('img')
  if (m?.image) {
    if (img?.getAttribute('src') === m.image) return
    const el = img ?? document.createElement('img')
    el.alt = ''; el.loading = 'lazy'; el.decoding = 'async'; el.referrerPolicy = 'no-referrer'
    el.src = m.image
    el.onerror = () => { el.remove(); tile.textContent = symbol.slice(0, 2); tile.classList.remove('has-img') }
    if (!img) { tile.textContent = ''; tile.append(el) }
    tile.classList.add('has-img')
  } else if (!img && tile.textContent !== symbol.slice(0, 2)) tile.textContent = symbol.slice(0, 2)
}
