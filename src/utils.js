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
