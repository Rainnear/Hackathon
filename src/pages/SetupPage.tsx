import { useEffect, useRef, useState, type ReactNode } from 'react'

import { vaultGet } from '../lib/vault'

import { Icon } from '../components/icons'
import { CommitInput, InfoTip, PageHead } from '../components/ui'
import { SignatoryField } from '../components/SignatoryField'
import { MASTERLIST_SIGS, PAYROLL_SIGS, setupSteps, stepsLeft, type SetupStep, type SetupStepId } from '../domain/setupSteps'
import { navigate } from '../state/route'
import { useEditable } from '../state/access'
import { MIN_AMOUNT } from '../data/municipalities'
import type { Analysis } from '../domain/analyze'
import { daysLeftText, deadlineInfo } from '../domain/deadline'
import { formatDateTime, peso, plural } from '../domain/format'
import { backupFileName, makeBackup, normalizeSubmission, parseBackup } from '../domain/submission'
import type { Submission } from '../domain/types'
import { useStore } from '../state/store'
import { PRESYNC_KEY, forgetPresync, switchYear } from '../state/sync'
import { toast } from '../state/toast'

/** Whether the browser has promised not to clear this site's data when space runs low. */
function usePersistedStorage() {
  const [persisted, setPersisted] = useState<boolean | null>(null)
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(null))
  }, [])
  const request = async () => {
    const ok = (await navigator.storage?.persist?.()) ?? false
    setPersisted(ok)
    return ok
  }
  return { persisted, request }
}

type Confirm = { kind: 'import'; sub: Submission; savedAt: string | null; file: string } | { kind: 'presync'; sub: Submission }

function DataPanel() {
  const sub = useStore((s) => s.sub)
  const lastBackupAt = useStore((s) => s.lastBackupAt)
  const replaceRosters = useStore((s) => s.replaceRosters)
  const markBackedUp = useStore((s) => s.markBackedUp)
  const editable = useEditable()
  const [confirming, setConfirming] = useState<Confirm | null>(null)
  const [presync, setPresync] = useState<Submission | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { persisted, request } = usePersistedStorage()
  const n = sub.brgys.reduce((a, b) => a + b.tanods.length, 0)
  const count = (s: Submission) => s.brgys.reduce((a, b) => a + b.tanods.length, 0)

  // Tanods typed on this device before Sakto saved online, kept aside on the first download.
  useEffect(() => {
    vaultGet(PRESYNC_KEY).then(
      (raw) => {
        const s = raw ? normalizeSubmission(JSON.parse(raw)) : null
        setPresync(s && s.municipality === sub.municipality && count(s) ? s : null)
      },
      () => {},
    )
  }, [sub.municipality])

  const exportBackup = () => {
    const blob = new Blob([makeBackup(sub)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = backupFileName(sub)
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    markBackedUp()
    toast(`Backup saved as ${a.download}. Keep it somewhere safe, like Google Drive or a USB stick.`)
  }

  const onFile = async (file: File | undefined) => {
    setImportError(null)
    if (!file) return
    const parsed = parseBackup(await file.text())
    if (fileRef.current) fileRef.current.value = ''
    if (!parsed.ok) return setImportError(parsed.error)
    if (parsed.sub.municipality !== sub.municipality) return setImportError(`That backup is for ${parsed.sub.municipality}. Sakto is open for ${sub.municipality}.`)
    setConfirming({ kind: 'import', sub: parsed.sub, savedAt: parsed.savedAt, file: file.name })
  }

  const confirm = () => {
    if (!confirming) return
    replaceRosters(confirming.sub)
    if (confirming.kind === 'presync') {
      void forgetPresync()
      setPresync(null)
      toast(`${plural(count(confirming.sub), 'tanod')} queued for upload to CY ${sub.year}.`)
    } else toast(`Backup restored to CY ${sub.year}. It is uploading now.`)
    setConfirming(null)
  }

  return (
    <div className="stack">
      <p className="note">
        {n ? `${plural(n, 'tanod')} in CY ${sub.year}. ` : 'Nothing encoded yet. '}
        {lastBackupAt ? ` Last backup file: ${formatDateTime(lastBackupAt)}.` : ''}
      </p>
      {persisted === false && (
        <p className="note">
          This browser may clear its copy when the device runs low on space.{' '}
          <button type="button" className="linkbtn" onClick={async () => toast((await request()) ? 'The browser will keep Sakto’s data.' : 'The browser said no. Changes that have not uploaded yet could be lost.')}>
            Ask the browser to keep it
          </button>
        </p>
      )}
      {presync && !confirming && editable && (
        <div className="confirm">
          <p>
            This device has {plural(count(presync), 'tanod')} for {presync.municipality} saved before Sakto went online. Upload them to CY {sub.year}? Barangays in that copy replace what is online now.
          </p>
          <div className="row">
            <button type="button" className="btn primary" onClick={() => setConfirming({ kind: 'presync', sub: presync })}>Upload them</button>
            <button type="button" className="btn" onClick={() => { void forgetPresync(); setPresync(null) }}>Don't upload</button>
          </div>
        </div>
      )}
      {confirming ? (
        <div className="confirm">
          <p>
            {confirming.kind === 'import'
              ? `Replace the CY ${sub.year} lists with ${confirming.file} (${plural(count(confirming.sub), 'tanod')}${confirming.savedAt ? `, saved ${formatDateTime(confirming.savedAt)}` : ''})? Everyone in ${sub.municipality} will see the change.`
              : `Upload ${plural(count(confirming.sub), 'tanod')} to CY ${sub.year}? Every barangay in that copy replaces what is online now. Everyone in ${sub.municipality} will see the change.`}
          </p>
          <div className="row">
            <button type="button" className="btn primary" onClick={confirm}>{confirming.kind === 'import' ? 'Restore backup' : 'Upload'}</button>
            <button type="button" className="btn" onClick={() => setConfirming(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button type="button" className="btn primary" onClick={exportBackup}>Export backup file</button>
          {editable && (
            <label className="btn">
              Restore from backup
              <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          )}
        </div>
      )}
      {importError && <p className="note bad">{importError}</p>}
    </div>
  )
}

/** The province's deadline (read-only here) and the Rep's own deadline for barangays. */
function DeadlineFields() {
  const sub = useStore((s) => s.sub)
  const setSubmissionField = useStore((s) => s.setSubmissionField)
  const editable = useEditable()
  const p = sub.provinceDue ? deadlineInfo(sub.provinceDue) : null
  const late = !!sub.barangayDue && !!sub.provinceDue && sub.barangayDue > sub.provinceDue
  return (
    <div className="stack">
      <div className="field">
        <span className="lbl-like">Province's deadline for {sub.municipality} (set by the provincial office)</span>
        <b>{p ? `${p.long} · ${daysLeftText(p)}` : 'Not set yet'}</b>
      </div>
      <div className="field">
        <label htmlFor="brgyDue">Barangays must submit to you by</label>
        <input id="brgyDue" type="date" value={sub.barangayDue} disabled={!editable} onChange={(e) => setSubmissionField({ barangayDue: e.target.value })} />
        {late && <p className="note bad">This is after the province's deadline. Leave yourself time to review and print.</p>}
      </div>
    </div>
  )
}

function YearFields() {
  const sub = useStore((s) => s.sub)
  const setSubmissionField = useStore((s) => s.setSubmissionField)
  return (
    <div className="fields">
      <div className="field">
        <label htmlFor="muniIn">Municipality</label>
        <input id="muniIn" value={sub.municipality} readOnly disabled />
      </div>
      <div className="field">
        <label htmlFor="yearIn">Calendar year (CY)</label>
        <CommitInput
          key={sub.year}
          id="yearIn"
          inputMode="numeric"
          value={String(sub.year)}
          onCommit={(v) => {
            const y = parseInt(v, 10)
            if (!(y >= 2000 && y <= 2100)) {
              toast('Enter a four-digit year, like 2026.')
              return String(sub.year)
            }
            if (y === sub.year) return
            switchYear(y).then(
              () => toast(`Opened CY ${y}.`),
              (e: Error) => toast(e.message),
            )
          }}
        />
      </div>
      <div className="field">
        <label htmlFor="amtIn">Amount per tanod, from this year's EO</label>
        <CommitInput
          key={sub.amount}
          id="amtIn"
          inputMode="decimal"
          value={String(sub.amount)}
          onCommit={(v) => {
            const a = Number(v.replace(/[^0-9.]/g, ''))
            if (!(a >= MIN_AMOUNT)) {
              toast(`The ordinance sets at least ${peso(MIN_AMOUNT)} per tanod.`)
              return String(sub.amount)
            }
            setSubmissionField({ amount: a })
          }}
        />
      </div>
    </div>
  )
}

/** What each step asks, and the fields for it. */
const STEP_BODY: Record<SetupStepId, { tip: string; body: () => ReactNode }> = {
  year: {
    tip: "The municipality comes from your account. Changing the year opens that year's list; a year that has not been opened yet starts empty.",
    body: () => <YearFields />,
  },
  deadline: {
    tip: "Shown at the top of everyone's screen. Secretaries see your date counting down; it turns red 7 days before, and a barangay is marked Late once it passes.",
    body: () => <DeadlineFields />,
  },
  masterlist: {
    tip: 'They sign every page of the masterlist.',
    body: () => <div className="fields">{MASTERLIST_SIGS.map((k) => <SignatoryField key={k} k={k} />)}</div>,
  },
  payroll: {
    tip: 'Printed in boxes A to E at the bottom of every payroll page.',
    body: () => <div className="fields">{PAYROLL_SIGS.map((k) => <SignatoryField key={k} k={k} />)}</div>,
  },
  backup: {
    tip: 'Saved online and on this device. Changes upload on their own; a backup file is an extra copy you keep yourself.',
    body: () => <DataPanel />,
  },
}

// Steps the Rep moved past without finishing, so the checklist can say "Skipped". Remembered on this device.
const skipKey = (muni: string, year: number) => `sakto.setup-skipped.${muni}.${year}`
function readSkipped(key: string): SetupStepId[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(v) ? (v as SetupStepId[]) : []
  } catch {
    return []
  }
}

/** The right-hand checklist: every step, done or not, and what is still missing. Tap one to go to it. */
function SetupTracker({ steps, at, skipped, go }: { steps: SetupStep[]; at: number; skipped: SetupStepId[]; go: (i: number) => void }) {
  const required = steps.filter((s) => !s.optional)
  const done = required.filter((s) => !s.missing.length).length
  const left = stepsLeft(steps)
  const pending = left.filter((s) => skipped.includes(s.id))
  return (
    <aside className="box setup-track" aria-label="Setup checklist">
      <div className="box-hd">
        <h3>Setup checklist</h3>
        <span className={`badge r ${left.length ? '' : 'ok'}`}>{done}/{required.length}</span>
      </div>
      <div className="box-bd stack">
        <span className="bar big" role="img" aria-label={`${done} of ${required.length} steps done`}>
          <i className={left.length ? '' : 'ok'} style={{ width: `${(done / required.length) * 100}%` }} />
        </span>
        {pending.length > 0 && (
          <p className="banner warn">
            {plural(pending.length, 'step')} skipped for now. Come back before printing: the forms need {pending.length === 1 ? 'it' : 'them'}.
          </p>
        )}
        <ol className="track-list">
          {steps.map((s, i) => {
            const state = !s.missing.length ? (s.warn.length ? 'check' : 'done') : skipped.includes(s.id) ? 'skipped' : 'todo'
            const label = s.optional && state !== 'done' ? 'Optional' : { done: 'Done', check: 'Check', skipped: 'Skipped', todo: 'To do' }[state]
            return (
              <li key={s.id}>
                <button type="button" className={`track ${state}${s.optional ? ' optional' : ''}`} aria-current={i === at ? 'step' : undefined} onClick={() => go(i)}>
                  <span className="track-dot" aria-hidden="true">{state === 'done' ? '✓' : state === 'skipped' ? '!' : i + 1}</span>
                  <span className="track-t">
                    <b>{s.title}</b>
                    <small>{label}{s.missing.length ? ` · missing ${s.missing.join(', ')}` : s.warn.length ? ` · ${s.warn[0]}` : ''}</small>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>
    </aside>
  )
}

/** Setup as a carousel: one step at a time with Next, Skip for now and Back, and the checklist beside it. */
export function SetupPage({ A }: { A: Analysis }) {
  const sub = useStore((s) => s.sub)
  const lastBackupAt = useStore((s) => s.lastBackupAt)
  const editable = useEditable()
  const steps = setupSteps(sub, lastBackupAt)
  const isNew = A.totals.n === 0
  const key = skipKey(sub.municipality, sub.year)
  const [skipped, setSkipped] = useState<SetupStepId[]>(() => readSkipped(key))
  // Open at the first step that still needs something, or the first step when everything is done.
  const [at, setAt] = useState(() => Math.max(0, steps.findIndex((s) => s.missing.length)))
  const [nudge, setNudge] = useState<string[] | null>(null)
  const step = steps[at]
  const last = at === steps.length - 1
  const info = STEP_BODY[step.id]
  // Read the saved values at the moment of the click: the field being typed in saves when the button takes the focus.
  const fresh = () => setupSteps(useStore.getState().sub, useStore.getState().lastBackupAt)

  const remember = (ids: SetupStepId[]) => {
    setSkipped(ids)
    try {
      localStorage.setItem(key, JSON.stringify(ids))
    } catch {
      // Blocked storage: the checklist still shows what is missing, just not "Skipped".
    }
  }
  const go = (i: number) => {
    setNudge(null)
    setAt(i)
    window.scrollTo({ top: 0 })
  }
  const advance = (skip: boolean) => {
    const now = fresh()
    const missing = now[at].missing
    if (!skip && editable && missing.length) return setNudge(missing)
    const others = skipped.filter((id) => id !== step.id)
    remember(missing.length ? [...others, step.id] : others)
    if (!last) return go(at + 1)
    const left = stepsLeft(now)
    if (left.length) toast(`Setup still has ${plural(left.length, 'step')} to finish. The Setup menu shows it until it's done.`)
    navigate({ page: 'barangays', brgy: null })
  }

  return (
    <section className="page-section">
      <PageHead
        title="Year, amount and signatories"
        sub="Set these once. They print on every page, so each name is spelled the same way on the masterlist, payroll and cover sheet."
      />
      {isNew && at === 0 && (
        <div className="banner">
          CY {sub.year} for {sub.municipality} is open. Go through the steps below. Barangay secretaries can already encode their own tanods while you do.
        </div>
      )}
      <div className="setup-flow">
        <section className="box setup-card" aria-labelledby="setup-step-title">
          <div className="setup-hd">
            <span className="eyebrow">Step {at + 1} of {steps.length}{step.optional ? ' · optional' : ''}</span>
            <h3 id="setup-step-title">{step.title}<InfoTip>{info.tip}</InfoTip></h3>
            <div className="setup-dots" aria-hidden="true">
              {steps.map((s, i) => <i key={s.id} className={i === at ? 'on' : !s.missing.length ? 'ok' : skipped.includes(s.id) ? 'skip' : ''} />)}
            </div>
          </div>
          <div className="box-bd setup-bd" key={step.id}>
            {info.body()}
            {nudge && (
              <p className="banner warn" role="alert">
                Still missing: {nudge.join(', ')}. Fill {nudge.length === 1 ? 'it' : 'them'} in, or skip for now and come back later.
              </p>
            )}
          </div>
          <div className="setup-ft">
            <button type="button" className="btn" onClick={() => go(at - 1)} disabled={at === 0}>
              {Icon.prev} Back
            </button>
            <span className="grow" />
            {editable && step.missing.length > 0 && (
              <button type="button" className="linkbtn" onClick={() => advance(true)}>Skip for now</button>
            )}
            <button type="button" className="btn primary" onClick={() => advance(false)}>
              {last ? 'Finish: go to Barangays' : 'Next'} {Icon.next}
            </button>
          </div>
        </section>
        <SetupTracker steps={steps} at={at} skipped={skipped} go={go} />
      </div>
    </section>
  )
}

