// Serverless client store backed by Vercel Blob.
// GET -> newest clients snapshot (or [])
// PUT -> writes a NEW immutable snapshot, prunes older ones.
//
// Why a new blob per write instead of overwriting one path: overwriting a
// fixed public URL suffers ~20s CDN read-after-write lag. Unique URLs are
// immutable, so every read is fresh — no stale reads, no lost writes.
import { list, put, del } from '@vercel/blob'

const PREFIX = 'clients-'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    if (req.method === 'GET') {
      const { blobs } = await list({ prefix: PREFIX })
      if (!blobs.length) return res.status(200).json([])
      const newest = blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))[0]
      const r = await fetch(newest.url, { cache: 'no-store' })
      const data = await r.json().catch(() => [])
      return res.status(200).json(Array.isArray(data) ? data : [])
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '[]') : req.body
      const clients = Array.isArray(body) ? body : (body && body.clients) || []
      const blob = await put(PREFIX + 'snapshot.json', JSON.stringify(clients), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: true,
      })
      // prune older snapshots (keep only the one just written)
      try {
        const { blobs } = await list({ prefix: PREFIX })
        const stale = blobs.filter((b) => b.url !== blob.url).map((b) => b.url)
        if (stale.length) await del(stale)
      } catch {
        /* pruning is best-effort */
      }
      return res.status(200).json({ ok: true, url: blob.url, count: clients.length })
    }

    res.setHeader('Allow', 'GET,PUT,POST')
    return res.status(405).json({ error: 'method not allowed' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
