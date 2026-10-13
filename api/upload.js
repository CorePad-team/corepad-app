// Client uploads to Vercel Blob for launch metadata. The browser uploads straight to Blob with a
// short-lived token issued here; this route only decides what may be uploaded: images up to 5 MB
// under logo/ and banner/, and the metadata JSON (16 KB) under meta/. Nothing else is accepted.
import { handleUpload } from '@vercel/blob/client'

const IMAGES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']
const RULES = [
  { prefix: 'logo/', types: IMAGES, max: 5 * 1024 * 1024 },
  { prefix: 'banner/', types: IMAGES, max: 5 * 1024 * 1024 },
  { prefix: 'meta/', types: ['application/json'], max: 16 * 1024 },
]

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || 'null') : req.body
    const out = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const rule = RULES.find((r) => pathname.startsWith(r.prefix) && !pathname.includes('..'))
        if (!rule) throw new Error('pathname not allowed')
        return { allowedContentTypes: rule.types, maximumSizeInBytes: rule.max, addRandomSuffix: true, validUntil: Date.now() + 10 * 60 * 1000 }
      },
    })
    res.status(200).json(out)
  } catch (e) {
    res.status(400).json({ error: String(e?.message ?? e).slice(0, 200) })
  }
}
