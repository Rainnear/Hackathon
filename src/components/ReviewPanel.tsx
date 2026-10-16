import { useState } from 'react'

import type { Analysis } from '../domain/analyze'
import { formatDateTime, plural } from '../domain/format'
import type { Barangay, Tone } from '../domain/types'
import { addReview, type Review, type ReviewAction } from '../lib/reviews'
import { useAuth } from '../state/auth'
import { historyOf, latestOf, useReviews } from '../state/reviews'
import { href } from '../state/route'
import { useStore } from '../state/store'
import { useSync } from '../state/sync'
import { toast } from '../state/toast'
import { Modal } from './Modal'
import { Box, Chip } from './ui'

const STATE: Record<ReviewAction, { label: string; tone: Tone }> = {
  returned: { label: 'Returned', tone: 'bad' },
  resubmitted: { label: 'Fixed, to review', tone: 'warn' },
  accepted: { label: 'Accepted', tone: 'ok' },
}

/** The usual reasons a list comes back, so the Liga Rep doesn't have to type them. */
const REASONS = [
  'Names do not match the IDs',
  'ID photocopies missing or not signed three times',
  'Barangay Certification missing or not signed',
  'Proof of designation missing',
  'SPA missing for the representative',
  'Wrong year or dates',
  'More tanods than the limit',
]

const when = (r: Review) => formatDateTime(r.created_at)
const by = (r: Review) => (r.author_name ? ` by ${r.author_name}` : '')

function useBarangayId(b: Barangay | undefined) {
  return useStore((s) => (b ? s.remote?.brgyIds[b.name] : undefined))
}

/** Where a barangay stands with the Liga Rep, as a chip (nothing until it is first reviewed). */
export function ReviewChip({ b }: { b: Barangay }) {
  const bid = useBarangayId(b)
  const latest = useReviews((s) => latestOf(s.list, bid))
  if (!latest) return null
  const st = STATE[latest.action]
  return <Chip tone={st.tone}>{st.label}</Chip>
}

/** One step of the history, in words. */
function Step({ r }: { r: Review }) {
  const what = r.action === 'returned' ? 'Returned for correction' : r.action === 'accepted' ? 'Accepted' : 'Fixed and sent back for review'
  return (
    <li className={`rv-step ${r.action}`}>
      <b>{what}</b>
      <span className="note">{when(r)}{by(r)}</span>
      {r.reason && <p className="rv-reason">{r.reason}</p>}
    </li>
  )
}

/**
 * The Liga Rep's review of one barangay: return it for correction with the reason, or accept it.
 * The secretary sees the reason and answers a return once it is fixed. Every step stays in the history.
 */
export function ReviewBox({ b, A }: { b: Barangay; A: Analysis }) {
  const role = useAuth((s) => s.profile?.role)
  const available = useReviews((s) => s.available)
  const bid = useBarangayId(b)
  const all = useReviews((s) => s.list)
  const online = useSync((s) => s.online)
  const [dialog, setDialog] = useState<'return' | 'fixed' | null>(null)
  const [busy, setBusy] = useState(false)
  if (!available || !bid) return null
  const history = historyOf(all, bid)
  const latest = history.at(-1) ?? null
  const isRep = role === 'rep'
  const isSec = role === 'secretary'
  const errs = A.issues.filter((i) => i.level === 'error' && (i.brgy === b.name || i.also === b.name)).length

  const accept = async () => {
    if (errs && !window.confirm(`Sakto still sees ${plural(errs, 'problem')} in Brgy. ${b.name}. Accept it anyway?`)) return
    setBusy(true)
    try {
      useReviews.getState().add(await addReview({ submissionId: useStore.getState().remote!.submissionId, barangayId: bid, action: 'accepted', reason: '' }))
      toast(`Brgy. ${b.name} accepted.`)
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const now = !latest
    ? isSec
      ? 'The Liga Rep has not reviewed your list yet.'
      : 'Not reviewed yet.'
    : latest.action === 'returned'
      ? isSec
        ? 'The Liga Rep returned your list. Fix what is listed below, then tell them it is fixed.'
        : 'Returned. Waiting for the barangay to fix it.'
      : latest.action === 'resubmitted'
        ? isSec
          ? 'You sent it back for review. Waiting for the Liga Rep.'
          : 'The barangay says it is fixed. Check it, then accept it or return it again.'
        : isSec
          ? 'Accepted by the Liga Rep.'
          : 'Accepted.'

  return (
    <Box
      title="Liga Rep review"
      tip="The Liga Rep returns a barangay's list with the reason when something must be corrected, or accepts it. Every return and fix stays on record."
      aside={latest && <Chip tone={STATE[latest.action].tone}>{STATE[latest.action].label}</Chip>}
    >
      <div className="box-bd stack rv">
        <p className="rv-now">{now}</p>
        {latest && latest.action !== 'accepted' && (
          <ul className="rv-list"><Step r={latest} /></ul>
        )}
        {latest?.action === 'accepted' && <p className="note">{when(latest)}{by(latest)}</p>}

        {isRep && (
          <div className="row">
            <button type="button" className="btn sm" disabled={!online || busy} onClick={() => setDialog('return')}>Return for correction</button>
            {latest?.action !== 'accepted' && (
              <button type="button" className="btn sm primary" disabled={!online || busy} onClick={() => void accept()}>Accept</button>
            )}
          </div>
        )}
        {isSec && latest?.action === 'returned' && (
          <button type="button" className="btn sm primary" disabled={!online} onClick={() => setDialog('fixed')}>It's fixed, send for review</button>
        )}
        {(isRep || isSec) && !online && <p className="note">Needs internet.</p>}

        {history.length > 1 && (
          <details className="rv-hist">
            <summary>History ({history.length})</summary>
            <ul className="rv-list">{[...history].reverse().map((r) => <Step key={r.id} r={r} />)}</ul>
          </details>
        )}
      </div>
      {dialog === 'return' && <ReturnDialog b={b} bid={bid} A={A} onClose={() => setDialog(null)} />}
      {dialog === 'fixed' && <FixedDialog b={b} bid={bid} errs={errs} onClose={() => setDialog(null)} />}
    </Box>
  )
}

/** The Liga Rep says why: ticked usual reasons, problems Sakto found, and their own words. */
function ReturnDialog({ b, bid, A, onClose }: { b: Barangay; bid: number; A: Analysis; onClose: () => void }) {
  const status = useStore((s) => s.remote?.status)
  const found = A.issues.filter((i) => (i.brgy === b.name || i.also === b.name) && i.kind !== 'check').map((i) => i.msg)
  const [picked, setPicked] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const toggle = (s: string) => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]))
  const reason = [...picked.map((s) => `• ${s}`), note.trim()].filter(Boolean).join('\n')

  const send = async () => {
    if (!reason) return toast('Say why the list is returned.')
    setBusy(true)
    try {
      useReviews.getState().add(await addReview({ submissionId: useStore.getState().remote!.submissionId, barangayId: bid, action: 'returned', reason }))
      toast(`Brgy. ${b.name} returned. The secretary sees the reason when they open Sakto.`)
      onClose()
    } catch (e) {
      toast((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Return Brgy. ${b.name} for correction`}>
      <div className="modal-bd stack">
        <p>Tick what must be corrected, or write it. The secretary sees exactly this.</p>
        {status && status !== 'open' && (
          <p className="banner">The list is locked, so the secretary can't change it. Reopen it for secretaries in Review, or correct it yourself.</p>
        )}
        {found.length > 0 && (
          <fieldset className="plain rv-picks">
            <legend className="lbl-like">Problems Sakto found</legend>
            {found.map((s) => (
              <label key={s} className="check-inline"><input type="checkbox" checked={picked.includes(s)} onChange={() => toggle(s)} /> {s}</label>
            ))}
          </fieldset>
        )}
        <fieldset className="plain rv-picks">
          <legend className="lbl-like">Usual reasons</legend>
          {REASONS.map((s) => (
            <label key={s} className="check-inline"><input type="checkbox" checked={picked.includes(s)} onChange={() => toggle(s)} /> {s}</label>
          ))}
        </fieldset>
        <div className="field">
          <label htmlFor="rv_note">In your own words</label>
          <textarea id="rv_note" className="rv-text" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: page 2 of the certification has no date." />
        </div>
      </div>
      <div className="modal-ft">
        <span className="grow" />
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" disabled={busy || !reason} onClick={() => void send()}>{busy ? 'Sending…' : 'Return it'}</button>
      </div>
    </Modal>
  )
}

/** The secretary answers a return: fixed, with an optional note on what changed. */
function FixedDialog({ b, bid, errs, onClose }: { b: Barangay; bid: number; errs: number; onClose: () => void }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const send = async () => {
    setBusy(true)
    try {
      useReviews.getState().add(await addReview({ submissionId: useStore.getState().remote!.submissionId, barangayId: bid, action: 'resubmitted', reason: note }))
      toast('Sent back to the Liga Rep for review.')
      onClose()
    } catch (e) {
      toast((e as Error).message)
      setBusy(false)
    }
  }
  return (
    <Modal open onClose={onClose} title="Send back for review">
      <div className="modal-bd stack">
        {errs > 0 && (
          <p className="banner bad">Sakto still sees {plural(errs, 'problem')} in Brgy. {b.name}. Fix {errs === 1 ? 'it' : 'them'} first, or say why below.</p>
        )}
        <div className="field">
          <label htmlFor="rv_fixed">What did you fix? (optional)</label>
          <textarea id="rv_fixed" className="rv-text" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: corrected the spelling of two names and attached the signed certification." />
        </div>
      </div>
      <div className="modal-ft">
        <span className="grow" />
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" disabled={busy} onClick={() => void send()}>{busy ? 'Sending…' : 'Send for review'}</button>
      </div>
    </Modal>
  )
}

/** The secretary's dashboard: the Liga Rep's latest word on their list, right at the top. */
// The "accepted" notice can be closed; a later return or acceptance is a new review and shows again.
const closedKey = (id: number) => `sakto.review-closed.${id}`
function isClosed(id: number) {
  try {
    return localStorage.getItem(closedKey(id)) === '1'
  } catch {
    return false
  }
}

export function ReviewBanner({ b }: { b: Barangay }) {
  const bid = useBarangayId(b)
  const latest = useReviews((s) => latestOf(s.list, bid))
  const [closed, setClosed] = useState<number | null>(null)
  if (!latest) return null
  const list = href({ page: 'barangays', brgy: b.name })
  if (latest.action === 'returned')
    return (
      <div className="banner bad rv-banner" role="alert">
        <div className="grow">
          <b>The Liga Rep returned your list for correction</b> <span className="note">{when(latest)}{by(latest)}</span>
          <p className="rv-reason">{latest.reason}</p>
        </div>
        <a className="btn primary" href={list}>Fix it</a>
      </div>
    )
  if (latest.action === 'resubmitted')
    return <div className="banner rv-banner">Sent back to the Liga Rep for review on {when(latest)}. Waiting for their answer.</div>
  if (closed === latest.id || isClosed(latest.id)) return null
  const close = () => {
    setClosed(latest.id)
    try {
      localStorage.setItem(closedKey(latest.id), '1')
    } catch {
      // Blocked storage: it stays closed until the page is reloaded.
    }
  }
  return (
    <div className="banner ok rv-banner">
      <span className="grow">The Liga Rep accepted your list on {when(latest)}{by(latest)}. Print and submit as usual.</span>
      <button type="button" className="iconbtn banner-x" onClick={close} aria-label="Close this message" title="Close">×</button>
    </div>
  )
}

/** The Liga Rep's dashboard: barangays that answered a return and wait for a second look. */
export function ReviewsWaiting() {
  const brgys = useStore((s) => s.sub.brgys)
  const ids = useStore((s) => s.remote?.brgyIds)
  const all = useReviews((s) => s.list)
  const waiting = brgys.filter((b) => latestOf(all, ids?.[b.name])?.action === 'resubmitted')
  if (!waiting.length) return null
  return (
    <div className="banner scans-waiting">
      <span>
        {waiting.length === 1 ? `Brgy. ${waiting[0].name} fixed what you returned.` : `${waiting.length} barangays fixed what you returned.`} Check and accept them.
      </span>
      <span className="row">
        {waiting.slice(0, 4).map((b) => (
          <a key={b.name} className="btn sm" href={href({ page: 'barangays', brgy: b.name })}>{b.name}</a>
        ))}
      </span>
    </div>
  )
}
