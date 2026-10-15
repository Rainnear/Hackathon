// Copied unchanged from the Hackathon repository (shared/pairing.ts), so the phone app reads the same code.
// The QR code that links the phone app to a barangay in the web app.
// It holds only ids, never a login: the phone signs in with its own account, and the database's
// row-level security still decides whether that account may add scans to this barangay.

export interface Pairing {
  submissionId: number
  barangayId: number
  /** For display on the phone ("Brgy. Poblacion"). */
  barangay: string
}

export const pairingLink = (p: Pairing) =>
  `sakto://pair?s=${p.submissionId}&b=${p.barangayId}&n=${encodeURIComponent(p.barangay)}`

const positiveId = (v: unknown) => {
  const n = typeof v === 'string' && /^\d{1,18}$/.test(v) ? Number(v) : NaN
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

/** From the deep link's query values (s, b, n). */
export function pairingFromParams(q: { s?: unknown; b?: unknown; n?: unknown }): Pairing | null {
  const submissionId = positiveId(q.s)
  const barangayId = positiveId(q.b)
  if (!submissionId || !barangayId) return null
  const barangay = typeof q.n === 'string' ? q.n.slice(0, 120) : ''
  return { submissionId, barangayId, barangay }
}

/** From the scanned QR text; null when it isn't a Sakto pairing code. */
export function parsePairingLink(text: string): Pairing | null {
  const m = text.trim().match(/^(?:[a-z+.-]*sakto):\/\/\/?pair\?(.*)$/i)
  if (!m) return null
  const q: Record<string, string> = {}
  for (const part of m[1].split('&')) {
    const [k, v = ''] = part.split('=')
    try {
      q[k] = decodeURIComponent(v.replace(/\+/g, ' '))
    } catch {
      return null
    }
  }
  return pairingFromParams(q)
}
