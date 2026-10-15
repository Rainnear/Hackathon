import type { References } from '../domain/analyze'
import type { Scan } from '../lib/scans'

/**
 * What the list is checked against, from the scans: each tanod's checked ID, and the names read from
 * each barangay's signed Barangay Certification photo (the newest one).
 */
export function buildReferences(scans: Scan[], brgyIds: Record<string, number> | undefined): References {
  const nameOf = new Map(Object.entries(brgyIds ?? {}).map(([name, id]) => [id, name]))
  const ids: References['ids'] = {}
  const certs: References['certs'] = {}
  for (const s of scans) {
    if (s.status !== 'saved') continue
    const f = s.fields ?? {}
    if (s.kind === 'id' && s.tanod_id && (f.last || f.first))
      ids[s.tanod_id] = { confirmed: { last: f.last ?? '', first: f.first ?? '', mi: f.mi ?? '', suffix: f.suffix ?? '' }, ...(f.read ? { read: f.read } : {}) }
    if (s.kind === 'certification' && f.rows?.length) {
      const name = nameOf.get(s.barangay_id)
      // Scans arrive oldest first, so the newest photo of a barangay's certification wins.
      if (name) certs[name] = f.rows.map((r) => ({ last: r.last, first: r.first, mi: r.mi, suffix: r.suffix }))
    }
  }
  return { ids, certs }
}
