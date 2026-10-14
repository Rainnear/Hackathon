import { useState } from 'react'

import { useEditable, useSafeSignOut } from '../state/access'
import { useAuth } from '../state/auth'
import { href } from '../state/route'
import { useStore, waitingCount } from '../state/store'
import { discardPending, syncNow, useSync } from '../state/sync'
import { Chip } from './ui'

/** Shown instead of the workspace while there is nothing to show yet. */
export function SyncGate() {
  const phase = useSync((s) => s.phase)
  const error = useSync((s) => s.error)
  const profile = useAuth((s) => s.profile)
  const refreshProfile = useAuth((s) => s.refreshProfile)
  const signOut = useSafeSignOut()
  const [busy, setBusy] = useState(false)
  const muni = profile?.municipality ?? 'your municipality'
  const where = profile?.role === 'secretary' && profile.barangay ? `Brgy. ${profile.barangay}` : muni

  const retry = async (alsoProfile = false) => {
    setBusy(true)
    if (alsoProfile) await refreshProfile()
    await syncNow()
    setBusy(false)
  }

  let title: string
  let body: string
  let action: { label: string; run: () => void } | null = { label: 'Try again', run: () => void retry() }
  switch (phase) {
    case 'loading':
      title = `Downloading ${where}…`
      body = 'This takes a few seconds the first time. After that, Sakto works even without internet.'
      action = null
      break
    case 'no-submission':
      title = 'Not open yet'
      body = `The Tanod Rep of ${muni} has not opened this year's tanod list yet. Once they do, ${where}'s list appears here. Let them know you are ready.`
      action = { label: 'Check again', run: () => void retry() }
      break
    case 'no-assignment':
      title = 'No barangay assigned'
      body = 'Your account is not linked to a barangay or municipality yet. Ask your Tanod Rep to set it under Accounts, then check again.'
      action = { label: 'Check again', run: () => void retry(true) }
      break
    case 'offline-empty':
      title = 'Connect to the internet once'
      body = `Sakto needs to download ${where}'s list one time. After that it works without internet. Turn on mobile data or Wi-Fi, then try again.`
      break
    default:
      title = 'Could not open your list'
      body = error ?? 'Something went wrong while downloading.'
  }

  return (
    <div className="auth">
      <div className="auth-card" role="status">
        <div className="auth-brand">
          <img src="/logo.svg" alt="" width="40" height="40" />
          <div>
            <b>Sakto</b>
            <span>Tanod incentive documents · Province of Iloilo</span>
          </div>
        </div>
        <h2>{title}</h2>
        <p className="sub">{body}</p>
        {phase === 'loading' && <span className="bar big"><i className="indeterminate" /></span>}
        {action && (
          <button type="button" className="btn primary block" disabled={busy} onClick={action.run}>
            {busy ? 'Checking…' : action.label}
          </button>
        )}
        <div className="row">
          <a className="linkbtn" href={href({ page: 'help', from: '#/' + phase })}>Get help</a>
          <span className="grow" />
          <button type="button" className="linkbtn" onClick={signOut}>Sign out</button>
        </div>
      </div>
    </div>
  )
}

/** One line that always says whether the work on this device has reached Supabase. */
export function SyncBadge() {
  const activity = useSync((s) => s.activity)
  const online = useSync((s) => s.online)
  const error = useSync((s) => s.error)
  const n = useStore(waitingCount)
  if (error) return <Chip tone="bad">Not uploaded: see the message below</Chip>
  if (!online) return <Chip tone={n ? 'warn' : 'idle'}>{n ? `Saved on this device · ${n} waiting for internet` : 'Offline · your work is saved on this device'}</Chip>
  if (activity === 'uploading') return <Chip tone="warn">Uploading…</Chip>
  if (n) return <Chip tone="warn">Saved on this device · uploading soon</Chip>
  return <Chip tone="ok">All changes saved online</Chip>
}

/** Above every page: an upload problem the person can act on, or the list being locked. */
export function SyncBanners() {
  const error = useSync((s) => s.error)
  const n = useStore(waitingCount)
  const status = useStore((s) => s.remote?.status)
  const year = useStore((s) => s.remote?.year)
  const editable = useEditable()
  const [busy, setBusy] = useState(false)
  const act = async (fn: () => Promise<void>) => {
    setBusy(true)
    await fn()
    setBusy(false)
  }
  return (
    <>
      {error && (
        <div className="banner bad sync-banner" role="alert">
          <span>
            {error} {n ? `${n} ${n === 1 ? 'change is' : 'changes are'} still saved on this device.` : ''}
          </span>
          <span className="row">
            <button type="button" className="btn sm" disabled={busy} onClick={() => act(syncNow)}>Try again</button>
            {n > 0 && (
              <button
                type="button"
                className="btn sm danger"
                disabled={busy}
                onClick={() => {
                  if (window.confirm('Throw away the changes that could not be uploaded, and show what is saved online instead?')) void act(discardPending)
                }}
              >
                Discard unsent changes
              </button>
            )}
          </span>
        </div>
      )}
      {!editable && (
        <div className="banner">
          {status === 'closed'
            ? `CY ${year} is closed. The list can be viewed and printed, but not changed.`
            : `The Tanod Rep has submitted the CY ${year} list. You can still view it, but changes are locked. Ask the Tanod Rep if something needs fixing.`}
        </div>
      )}
    </>
  )
}
