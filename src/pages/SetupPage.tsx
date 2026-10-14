import { useEffect, useRef, useState } from 'react'

import { Box, CommitInput, NextStep, PageHead } from '../components/ui'
import { IssueItem } from '../components/Issues'
import { MIN_AMOUNT, MUNICIPALITIES, findMunicipality } from '../data/municipalities'
import { SIG_LABELS, SIG_REQUIRED, type Analysis } from '../domain/analyze'
import { clean, formatDateTime, peso, plural } from '../domain/format'
import { backupFileName, makeBackup, newSubmission, parseBackup, sampleSubmission } from '../domain/submission'
import type { SignatoryKey, Submission } from '../domain/types'
import { useStore } from '../state/store'
import { toast } from '../state/toast'

function SignatoryField({ k }: { k: SignatoryKey }) {
  const value = useStore((s) => s.sub.sig[k])
  const setSignatory = useStore((s) => s.setSignatory)
  const optional = !SIG_REQUIRED.includes(k) && k !== 'authPos'
  return (
    <div className="field">
      <label htmlFor={`sig_${k}`}>
        {SIG_LABELS[k]}
        {optional && ' (optional)'}
      </label>
      <CommitInput
        key={value}
        id={`sig_${k}`}
        value={value}
        autoComplete="off"
        className={k === 'authPos' ? '' : 'upper'}
        onCommit={(v) => {
          const c = k === 'authPos' ? v.trim() : clean(v)
          setSignatory(k, c)
          return c
        }}
      />
    </div>
  )
}

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

type Pending = { kind: 'import'; sub: Submission; savedAt: string | null; file: string } | { kind: 'sample' } | { kind: 'erase' }

function DataBox() {
  const sub = useStore((s) => s.sub)
  const lastBackupAt = useStore((s) => s.lastBackupAt)
  const replaceSubmission = useStore((s) => s.replaceSubmission)
  const markBackedUp = useStore((s) => s.markBackedUp)
  const [pending, setPending] = useState<Pending | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { persisted, request } = usePersistedStorage()
  const n = sub.brgys.reduce((a, b) => a + b.tanods.length, 0)

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
    setPending({ kind: 'import', sub: parsed.sub, savedAt: parsed.savedAt, file: file.name })
  }

  const confirm = () => {
    if (!pending) return
    const year = new Date().getFullYear()
    if (pending.kind === 'import') {
      replaceSubmission(pending.sub)
      toast(`Backup restored: ${pending.sub.municipality}, CY ${pending.sub.year}.`)
    } else if (pending.kind === 'sample') {
      replaceSubmission(sampleSubmission(year))
      toast('Sample data loaded. The tanod names are made up.')
    } else {
      replaceSubmission(newSubmission(findMunicipality(sub.municipality) ?? MUNICIPALITIES[0], year))
      toast('All data erased. You are starting a new submission.')
    }
    setPending(null)
  }

  const pendingText =
    pending?.kind === 'import'
      ? (() => {
          const bn = pending.sub.brgys.reduce((a, b) => a + b.tanods.length, 0)
          return `Replace what is on this device with ${pending.file}: ${pending.sub.municipality}, CY ${pending.sub.year}, ${plural(bn, 'tanod')}${pending.savedAt ? `, saved ${formatDateTime(pending.savedAt)}` : ''}?`
        })()
      : pending?.kind === 'sample'
        ? 'Replace what is on this device with sample data? Export a backup first if you want to keep your work.'
        : 'Erase all tanods, documents and ObR details on this device? Export a backup first if you want to keep your work.'

  return (
    <Box title="Your data" aside={<span className="note">Saved on this device only</span>}>
      <div className="box-bd stack">
        <p className="note">
          {n ? `${plural(n, 'tanod')} saved in this browser. ` : 'Nothing encoded yet. '}
          {lastBackupAt ? `Last backup: ${formatDateTime(lastBackupAt)}.` : n ? 'No backup yet. Export one so a lost or reset phone does not lose your work.' : ''}
        </p>
        {persisted === false && (
          <p className="note">
            This browser may clear the data when the device runs low on space.{' '}
            <button type="button" className="linkbtn" onClick={async () => toast((await request()) ? 'The browser will keep Sakto’s data.' : 'The browser said no. Install the app and export backups regularly.')}>
              Ask the browser to keep it
            </button>
          </p>
        )}
        {pending ? (
          <div className="confirm">
            <p>{pendingText}</p>
            <div className="row">
              <button type="button" className={`btn ${pending.kind === 'import' ? 'primary' : 'danger'}`} onClick={confirm}>
                {pending.kind === 'import' ? 'Restore backup' : pending.kind === 'sample' ? 'Load sample data' : 'Erase everything'}
              </button>
              <button type="button" className="btn" onClick={() => setPending(null)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="row">
            <button type="button" className="btn primary" onClick={exportBackup}>Export backup</button>
            <label className="btn">
              Restore from backup
              <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            <span className="grow" />
            <button type="button" className="btn" onClick={() => setPending({ kind: 'sample' })}>Load sample data</button>
            <button type="button" className="btn danger" onClick={() => setPending({ kind: 'erase' })}>Erase all</button>
          </div>
        )}
        {importError && <p className="note bad">{importError}</p>}
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
          New submission for {sub.municipality}. Check the year, amount and signatories below, then continue to Barangays to encode the tanods. To look around first, load the sample data.
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
                <label htmlFor="muniSel">Municipality</label>
                <select id="muniSel" value={sub.municipality} disabled={MUNICIPALITIES.length < 2} onChange={() => {}}>
                  {MUNICIPALITIES.map((m) => <option key={m.name}>{m.name}</option>)}
                </select>
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
                    setSubmissionField({ year: y })
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
            <p className="box-bd note pt0">Only Ajuy's barangay list is loaded so far. Other Iloilo municipalities can be added from the same provincial list.</p>
          </Box>
          <Box title="Masterlist signatories" aside={<span className="note">Sign every page</span>}>
            <div className="box-bd fields">
              <SignatoryField k="liga" />
              <SignatoryField k="mlgoo" />
            </div>
          </Box>
        </div>
        <div className="col">
          <Box title="Payroll signatories" aside={<span className="note">Boxes A to E</span>}>
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
