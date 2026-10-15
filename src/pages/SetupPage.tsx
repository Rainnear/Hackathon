import { useEffect, useRef, useState } from 'react'

import { vaultGet } from '../lib/vault'

import { Box, CommitInput, NextStep, PageHead } from '../components/ui'
import { IssueItem } from '../components/Issues'
import { SignatoryField } from '../components/SignatoryField'
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

function DataBox() {
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
    <Box title="Your data" tip="Saved online and on this device. Changes upload on their own; the copy here is for when there is no internet.">
      <div className="box-bd stack">
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
    </Box>
  )
}

/** The province's deadline (read-only here) and the Rep's own deadline for barangays. */
function DeadlinesBox() {
  const sub = useStore((s) => s.sub)
  const setSubmissionField = useStore((s) => s.setSubmissionField)
  const editable = useEditable()
  const p = sub.provinceDue ? deadlineInfo(sub.provinceDue) : null
  const late = !!sub.barangayDue && !!sub.provinceDue && sub.barangayDue > sub.provinceDue
  return (
    <Box title="Deadlines" tip="Shown at the top of everyone's screen. Secretaries see your date counting down; it turns red 7 days before, and a barangay is marked Late once it passes.">
      <div className="box-bd stack">
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
    </Box>
  )
}

export function SetupPage({ A }: { A: Analysis }) {
  const sub = useStore((s) => s.sub)
  const setSubmissionField = useStore((s) => s.setSubmissionField)
  const setupIssues = A.issues.filter((i) => i.kind === 'setup')
  const isNew = A.totals.n === 0

  return (
    <section className="page-section">
      <PageHead
        title="Year, amount and signatories"
        sub="Set these once. They print on every page, so each name is spelled the same way on the masterlist, payroll and cover sheet."
      />
      {isNew && (
        <div className="banner">
          CY {sub.year} for {sub.municipality} is open. Check the amount and signatories below. Barangay secretaries can now encode their own tanods, and you can encode for barangays that have no secretary yet.
        </div>
      )}
      {setupIssues.length > 0 && (
        <div className="box">
          <ul className="issues">
            {setupIssues.map((i, ix) => <IssueItem key={ix} issue={i} where="local" A={A} />)}
          </ul>
        </div>
      )}
      <div className="grid2 even">
        <div className="col">
          <Box title="Submission">
            <div className="box-bd fields">
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
            <p className="box-bd note pt0">The municipality comes from your account. Changing the year opens that year's list; a year that has not been opened yet starts empty.</p>
          </Box>
          <DeadlinesBox />
          <Box title="Masterlist signatories" tip="They sign every page of the masterlist.">
            <div className="box-bd fields">
              <SignatoryField k="liga" />
              <SignatoryField k="mlgoo" />
            </div>
          </Box>
        </div>
        <div className="col">
          <Box title="Payroll signatories" tip="Printed in boxes A to E at the bottom of every payroll page.">
            <div className="box-bd fields">
              {(['auth', 'authPos', 'acct', 'treas', 'lce', 'disb'] as const).map((k) => <SignatoryField key={k} k={k} />)}
            </div>
          </Box>
          <DataBox />
        </div>
      </div>
      <NextStep to={{ page: 'barangays', brgy: null }} label="Continue to Barangays" />
    </section>
  )
}
