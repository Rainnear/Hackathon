import { useEffect, useState } from 'react'

import type { Analysis } from '../domain/analyze'
import { deadlineInfo, type Urgency } from '../domain/deadline'
import { plural } from '../domain/format'
import { useAuth } from '../state/auth'
import { href, type Route } from '../state/route'
import { useStore } from '../state/store'

const PROVINCE = 'the Provincial Government (OPPDC)'

/**
 * Pinned to the top of every page: the deadline that matters to whoever is signed in.
 * Secretaries see their barangay's deadline to the Liga Rep; the Liga Rep and administrators see
 * the municipality's deadline to the province. Red from 7 days out, and when overdue.
 */
export function DeadlineBanner({ A }: { A: Analysis }) {
  const sub = useStore((s) => s.sub)
  const status = useStore((s) => s.remote?.status)
  const role = useAuth((s) => s.profile?.role)
  // Re-check the day every few minutes, so a banner left open overnight moves to the next day.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 5 * 60_000)
    return () => clearInterval(iv)
  }, [])

  const secretary = role === 'secretary'
  const b = sub.brgys[0]
  const due = secretary ? sub.barangayDue : sub.provinceDue
  const d = due ? deadlineInfo(due, now) : null
  const to = secretary ? `the Liga Rep of ${sub.municipality}` : PROVINCE
  const notReady = sub.brgys.filter((x) => A.status[x.name]?.tone !== 'ok').length

  // Secretary: "done" = their barangay checks out. Liga Rep: the set is marked submitted.
  const done = secretary ? !!b && A.status[b.name]?.tone === 'ok' : status === 'submitted' || status === 'closed'

  if (!d) {
    // Only the Liga Rep and administrators need to hear that no deadline is set.
    if (secretary) return null
    return (
      <div className="deadline calm no-print" role="status">
        <div className="dl-text">
          <b>No deadline from the province yet for CY {sub.year}.</b>
          <span>
            {role === 'admin' ? 'Set it on the All of Iloilo dashboard so every municipality sees it.' : 'It will show here as soon as the provincial office sets it.'}
            {!sub.barangayDue && role !== 'admin' && ' You can already set a deadline for your barangays under Setup.'}
          </span>
        </div>
        <a className="btn sm" href={href(role === 'admin' ? { page: 'dashboard', view: 'province' } : { page: 'setup' })}>
          {role === 'admin' ? 'Set the deadline' : 'Open Setup'}
        </a>
      </div>
    )
  }

  // The provincial office is the one receiving: show the deadline from its side.
  if (role === 'admin') {
    const tone: Urgency = d.urgency
    return (
      <div className={`deadline ${tone} no-print`} role="status">
        <div className="dl-count" aria-hidden="true">
          <b>{tone === 'today' ? '!' : Math.abs(d.days)}</b>
          <span>{tone === 'overdue' ? 'days past' : tone === 'today' ? 'today' : d.days === 1 ? 'day left' : 'days left'}</span>
        </div>
        <div className="dl-text">
          <b>
            {tone === 'overdue'
              ? `The deadline for municipalities passed ${plural(-d.days, 'day')} ago`
              : tone === 'today'
                ? 'Municipalities must submit their sets today'
                : `${plural(d.days, 'day')} until municipalities must submit their CY ${sub.year} sets`}
          </b>
          <span>
            <span className="dl-due">Deadline: {d.long}.</span> <span className="dl-why">The All of Iloilo dashboard shows which municipalities have submitted and which are late.</span>
          </span>
        </div>
        <a className="btn sm dl-act" href={href({ page: 'dashboard', view: 'province' })}>See municipalities</a>
      </div>
    )
  }

  if (done)
    return (
      <div className="deadline done no-print" role="status">
        <div className="dl-count" aria-hidden="true">✓</div>
        <div className="dl-text">
          <b>{secretary ? `Brgy. ${b?.name} is complete. Thank you!` : `${sub.municipality}'s CY ${sub.year} set is marked submitted. Thank you!`}</b>
          <span>
            {secretary
              ? `Everything is in for the Liga Rep. Deadline: ${d.long}.`
              : `Deadline at the province: ${d.long}. Watch for any corrections the province sends back.`}
          </span>
        </div>
      </div>
    )

  const tone: Urgency = d.urgency
  const headline =
    tone === 'overdue'
      ? `Overdue by ${plural(-d.days, 'day')}: documents were due to ${to}`
      : tone === 'today'
        ? `Today is the last day to submit your documents to ${to}`
        : `${plural(d.days, 'day')} left to submit your documents to ${to}`
  const why = secretary
    ? `The province accepts ${sub.municipality} as one set, so one late barangay holds up the incentive of every tanod. ${tone === 'overdue' ? 'Submit as soon as you can' : 'Submit on time'} so Brgy. ${b?.name}'s tanods still get theirs this December.`
    : `A late or incomplete set holds up the December incentive of every tanod in ${sub.municipality}.${notReady ? ` ${plural(notReady, 'barangay')} still ${notReady === 1 ? 'needs' : 'need'} work.` : ''}`
  const action: { to: Route; label: string } = secretary
    ? { to: { page: 'barangays', brgy: null }, label: 'Open the tanod list' }
    : notReady
      ? { to: { page: 'barangays', brgy: sub.brgys.find((x) => A.status[x.name]?.tone !== 'ok')?.name ?? null }, label: 'See barangays that need work' }
      : { to: { page: 'review' }, label: 'Review and submit' }

  return (
    <div className={`deadline ${tone} no-print`} role={tone === 'calm' ? 'status' : 'alert'}>
      <div className="dl-count" aria-hidden="true">
        <b>{tone === 'today' ? '!' : Math.abs(d.days)}</b>
        <span>{tone === 'overdue' ? (d.days === -1 ? 'day late' : 'days late') : tone === 'today' ? 'today' : d.days === 1 ? 'day left' : 'days left'}</span>
      </div>
      <div className="dl-text">
        <b>{headline}</b>
        <span>
          <span className="dl-due">{tone === 'overdue' ? `Was due ${d.long}.` : `Due ${d.long}.`}</span> <span className="dl-why">{why}</span>
        </span>
      </div>
      <a className="btn sm dl-act" href={href(action.to)}>{action.label}</a>
    </div>
  )
}
