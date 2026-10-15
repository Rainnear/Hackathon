// How close a deadline is. A due date means the end of that day, on this device's clock.

export type Urgency = 'calm' | 'soon' | 'urgent' | 'today' | 'overdue'

export interface DeadlineInfo {
  /** Whole days from today to the due date: 0 = due today, negative = overdue. */
  days: number
  urgency: Urgency
  /** "Friday, November 15, 2026" */
  long: string
  /** "Nov 15" */
  short: string
}

/** Red from 7 days out; amber from 14. */
export const URGENT_DAYS = 7
export const SOON_DAYS = 14

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return y && m && d ? new Date(y, m - 1, d) : null
}

export function deadlineInfo(iso: string, now = new Date()): DeadlineInfo | null {
  const due = parse(iso)
  if (!due) return null
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000)
  const urgency: Urgency = days < 0 ? 'overdue' : days === 0 ? 'today' : days <= URGENT_DAYS ? 'urgent' : days <= SOON_DAYS ? 'soon' : 'calm'
  return {
    days,
    urgency,
    long: due.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    short: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }
}

/** Past the end of the due day. */
export const isLate = (iso: string, now = new Date()) => (deadlineInfo(iso, now)?.days ?? 0) < 0

export const daysLeftText = (d: DeadlineInfo) =>
  d.days < 0 ? `${-d.days} ${d.days === -1 ? 'day' : 'days'} overdue` : d.days === 0 ? 'Due today' : `${d.days} ${d.days === 1 ? 'day' : 'days'} left`
