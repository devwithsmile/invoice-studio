// Client store: source of truth is /api/clients (Vercel Blob), with a
// localStorage cache so the UI paints instantly and still works offline.
import { LS } from './utils'

export function cachedClients() {
  try {
    return JSON.parse(localStorage.getItem(LS.clients) || '[]')
  } catch {
    return []
  }
}

function writeCache(clients) {
  try {
    localStorage.setItem(LS.clients, JSON.stringify(clients))
  } catch {
    /* ignore */
  }
}

// Fetch the shared list from the server. Falls back to cache on failure.
export async function fetchClients() {
  try {
    const r = await fetch('/api/clients', { cache: 'no-store' })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    const data = await r.json()
    const clients = Array.isArray(data) ? data : []
    writeCache(clients)
    return { clients, ok: true }
  } catch {
    return { clients: cachedClients(), ok: false }
  }
}

// Persist the whole list to the server (and cache). Returns true on success.
export async function saveClients(clients) {
  writeCache(clients)
  try {
    const r = await fetch('/api/clients', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clients),
    })
    return r.ok
  } catch {
    return false
  }
}
