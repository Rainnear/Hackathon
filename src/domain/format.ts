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

export function newId() {
  // randomUUID only exists on https and localhost; phones testing over the LAN use the fallback.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
