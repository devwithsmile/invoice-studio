// Serverless client store backed by a single Vercel Blob JSON doc.
// GET  -> returns the clients array (or [])
// PUT  -> overwrites the whole clients array
// Cross-device sync: every browser reads/writes this one blob.
import { list, put } from '@vercel/blob'

const PATH = 'clients.json'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    if (req.method === 'GET') {
      const { blobs } = await list({ prefix: PATH })
      const hit = blobs.find((b) => b.pathname === PATH)
      if (!hit) return res.status(200).json([])
      // cache-bust so we never read a stale copy right after a write
      const r = await fetch(hit.url + '?t=' + Date.now(), { cache: 'no-store' })
      const data = await r.json().catch(() => [])
      return res.status(200).json(Array.isArray(data) ? data : [])
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '[]') : req.body
      const clients = Array.isArray(body) ? body : (body && body.clients) || []
      const blob = await put(PATH, JSON.stringify(clients), {
        access: 'public',
        contentType: 'application/json',
        allowOverwrite: true,
        addRandomSuffix: false,
        cacheControlMaxAge: 0,
      })
      return res.status(200).json({ ok: true, url: blob.url, count: clients.length })
    }

    res.setHeader('Allow', 'GET,PUT,POST')
    return res.status(405).json({ error: 'method not allowed' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
