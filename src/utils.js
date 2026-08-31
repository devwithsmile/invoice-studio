// Pure helpers — ported 1:1 from the Claude Design "Invoice Studio v3" logic.

export function pad3(n) {
  return String(n).padStart(3, '0')
}

// Indian grouping: 183333 -> "1,83,333"
export function fmtINR(n) {
  n = Math.round(Number(n) || 0)
  const s = String(Math.abs(n))
  if (s.length <= 3) return (n < 0 ? '-' : '') + s
  return (
    (n < 0 ? '-' : '') +
    s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') +
    ',' +
    s.slice(-3)
  )
}

export function ord(d) {
  if (d % 100 >= 11 && d % 100 <= 13) return 'th'
  return ['th', 'st', 'nd', 'rd'][d % 10] || 'th'
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Date -> "1st Jun'26"
export function shortDate(d) {
  return d.getDate() + ord(d.getDate()) + ' ' + MONTHS[d.getMonth()] + "'" + String(d.getFullYear()).slice(-2)
}

// Date -> "YYYY-MM-DD" for <input type=date>
export function iso(d) {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  )
}

// "YYYY-MM-DD" -> Date (local midnight)
export function parseISO(s) {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Date -> "30/06/2026"
export function fmtDMY(d) {
  return (
    String(d.getDate()).padStart(2, '0') +
    '/' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '/' +
    d.getFullYear()
  )
}

// tenure mode -> {start, end}
export function resolveTenure(tenureMode, customStart, customEnd) {
  if (tenureMode === 'custom') {
    return { start: parseISO(customStart), end: parseISO(customEnd) }
  }
  const off = { this: 0, last: -1, next: 1 }[tenureMode]
  const t = new Date()
  return {
    start: new Date(t.getFullYear(), t.getMonth() + off, 1),
    end: new Date(t.getFullYear(), t.getMonth() + off + 1, 0),
  }
}

// ---- localStorage (keys match the design) ----
export const LS = {
  clients: 'invoiceStudio.clients',
  counter: 'invoiceStudio.counter',
  last: 'invoiceStudio.last',
}

export function loadClients() {
  try {
    return JSON.parse(localStorage.getItem(LS.clients) || '[]')
  } catch {
    return []
  }
}

export function loadCounter() {
  try {
    const c = parseInt(localStorage.getItem(LS.counter), 10)
    return isNaN(c) ? 2 : c
  } catch {
    return 2
  }
}

export function loadLast() {
  try {
    return JSON.parse(localStorage.getItem(LS.last) || '{}')
  } catch {
    return {}
  }
}

// ---- line items ----
// One A4 page fits ~10 rows before the bank/signature block is pushed off it.
export const MAX_ITEMS = 10

// `tenureMode: null` means "use the invoice-level billing period".
export function makeItem(o = {}) {
  return {
    id: 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    description: '',
    price: '',
    tenureMode: null,
    customStart: '',
    customEnd: '',
    ...o,
  }
}

// A 'custom' period is only usable with both dates; fall back to this month.
export function sanitizeMode(mode, start, end) {
  if (mode === 'custom') return start && end ? 'custom' : 'this'
  return mode === 'this' || mode === 'last' || mode === 'next' ? mode : 'this'
}

// Read items out of the persisted `last` blob. Pre-multi-item saves held a
// single { description, price } pair — fold that into one item.
export function itemsFromLast(last, fallbackDescription, fallbackPrice) {
  const saved = Array.isArray(last.items) ? last.items : null
  if (saved && saved.length) {
    return saved.slice(0, MAX_ITEMS).map((it) =>
      makeItem({
        description: it.description || '',
        price: it.price != null ? it.price : '',
        tenureMode:
          it.tenureMode == null ? null : sanitizeMode(it.tenureMode, it.customStart, it.customEnd),
        customStart: it.customStart || '',
        customEnd: it.customEnd || '',
      })
    )
  }
  return [
    makeItem({
      description: last.description || fallbackDescription,
      price: last.price != null ? last.price : fallbackPrice,
    }),
  ]
}

export function sumItems(items) {
  return items.reduce((t, it) => t + (Number(it.price) || 0), 0)
}
