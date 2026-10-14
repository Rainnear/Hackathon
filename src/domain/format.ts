import type { Tanod } from './types'

export const clean = (s: string | null | undefined) =>
  String(s ?? '').toUpperCase().replace(/\s+/g, ' ').trim()

export const cleanMI = (s: string | null | undefined) => {
  const t = clean(s).replace(/\./g, '')
  return t ? t[0] + '.' : ''
}

export const nameKey = (t: Pick<Tanod, 'last' | 'first'>) => clean(t.last) + '|' + clean(t.first)

/** "JUAN S. DELA CRUZ JR." — the form used on the payroll and in the ObR payee. */
export const fullName = (t: Tanod) =>
  [clean(t.first), cleanMI(t.mi), clean(t.last), t.suffix].filter(Boolean).join(' ')

/** Loose comparison for names typed from paper: ignores punctuation and spacing. */
export const norm = (s: string) =>
  clean(s).replace(/[^A-Z0-9Ñ ]/g, '').replace(/\s+/g, ' ').trim()

export const digits = (s: string) => Number(String(s ?? '').replace(/[^0-9.]/g, ''))

export const money = (n: number) =>
  Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const peso = (n: number) => '₱' + money(n)

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** A v4 UUID: tanod ids are stored in Supabase uuid columns. */
export function newId() {
  // randomUUID only exists on https and localhost; phones testing over the LAN build one from getRandomValues.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
