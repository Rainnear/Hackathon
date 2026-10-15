import type { Issue, Submission } from '../domain/types'
import { navigate, type Route } from './route'

/**
 * Where "Go to it" leads: the exact row when the issue is about a tanod (in the issue's own barangay
 * first), otherwise the barangay, Setup or Review.
 */
export function issueTarget(i: Issue, sub: Submission): Route {
  const ids = Object.keys(i.rows ?? {})
  const own = sub.brgys.find((b) => b.name === i.brgy)
  const id = ids.find((x) => own?.tanods.some((t) => t.id === x)) ?? ids[0]
  if (id) {
    const b = sub.brgys.find((x) => x.tanods.some((t) => t.id === id))
    if (b) return { page: 'barangays', brgy: b.name, focus: id }
  }
  if (i.brgy) return { page: 'barangays', brgy: i.brgy }
  return i.kind === 'setup' ? { page: 'setup' } : { page: 'review' }
}

/** Open the ID photocopy page for one tanod, to print for their three signatures. */
export const printIdFor = (brgy: string, tanodId: string) => navigate({ page: 'templates', doc: 'idcopy', brgy, tanod: tanodId })
