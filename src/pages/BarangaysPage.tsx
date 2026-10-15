import { useEffect, useState, type KeyboardEvent } from 'react'

import { Icon } from '../components/icons'
import { Box, Chip, CommitInput, NextStep } from '../components/ui'
import { SmsActions } from '../components/Issues'
import { issueTarget } from '../state/goTo'
import { TanodDialog } from '../components/TanodDialog'
import type { Analysis } from '../domain/analyze'
import { clean, cleanMI, fullName, plural } from '../domain/format'
import { POSITIONS, SUFFIXES, type Barangay, type DocKey, type Issue, type Position, type RowNote, type Suffix, type Tanod } from '../domain/types'
import { href, navigate } from '../state/route'
import { DocPhoto, ScanUpload } from '../components/ScanUpload'
import { IdPhotosButton, ScansWaiting } from '../components/ScanReview'
import { DepartureDialog } from '../components/DepartureDialog'
import { TanodLimit } from '../components/TanodLimit'
import { NavIcon } from '../components/icons'
import { useEditable } from '../state/access'
import { useScans } from '../state/scans'
import { useAuth } from '../state/auth'
import { useStore } from '../state/store'
import { toast } from '../state/toast'

/** Liga Rep: which barangay, grouped the way the dashboard counts them. */
function BarangayPicker({ A, current }: { A: Analysis; current: string }) {
  const brgys = useStore((s) => s.sub.brgys)
  const groups: { label: string; tone: string }[] = [
    { label: 'Has problems', tone: 'bad' },
    { label: 'Check names', tone: 'warn' },
    { label: 'Not started', tone: 'idle' },
    { label: 'Ready', tone: 'ok' },
  ]
  return (
    <select
      className="brgy-pick"
      aria-label="Barangay"
      value={current}
      onChange={(e) => navigate({ page: 'barangays', brgy: e.target.value }, { scroll: false })}
    >
      {groups.map((g) => {
        const list = brgys.filter((b) => A.status[b.name].tone === g.tone)
        return list.length ? (
          <optgroup key={g.tone} label={`${g.label} (${list.length})`}>
            {list.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name} · {b.tanods.length}/{b.limit}
              </option>
            ))}
          </optgroup>
        ) : null
      })}
    </select>
  )
}

/** How a row is marked: red for something that must be fixed, amber for something to check. */
const rowLevel = (ns: RowNote[] | undefined) => {
  const x = (ns ?? []).filter((n) => n.kind !== 'ids')
  return x.some((n) => n.level === 'error') ? 'err' : x.length ? 'warnf' : ''
}

type RowDraft = Pick<Tanod, 'last' | 'first' | 'mi' | 'suffix' | 'pos'>
const draftOf = (t: Tanod): RowDraft => ({ last: t.last, first: t.first, mi: t.mi, suffix: t.suffix, pos: t.pos })

/**
 * One tanod, editable in place: fix a misspelling or add a missing M.I., then ✓ saves it (Enter works
 * too, Esc undoes). The trash can asks why before deleting. "ID signed" saves as soon as it's ticked.
 */
function RosterRow({ t, award, notes, solo, brgy, onRemove }: { t: Tanod; award: number; notes?: RowNote[]; solo: boolean; brgy: string; onRemove: () => void }) {
  const updateTanod = useStore((s) => s.updateTanod)
  const hasId = useScans((s) => s.list.some((x) => x.tanod_id === t.id && x.status === 'saved'))
  const [v, setV] = useState<RowDraft>(() => draftOf(t))
  const set = (patch: Partial<RowDraft>) => setV((x) => ({ ...x, ...patch }))
  const dirty = (Object.keys(v) as (keyof RowDraft)[]).some((k) => v[k] !== t[k])
  const name = fullName(t) || 'this tanod'
  const p = `f_${t.id}_`

  const save = () => {
    if (!dirty) return
    if (!clean(v.last) || !clean(v.first)) return toast('Type both the last name and the first name before saving.')
    const next = { ...v, last: clean(v.last), first: clean(v.first), mi: cleanMI(v.mi) }
    updateTanod(brgy, t.id, next)
    toast(`${fullName({ ...t, ...next })} saved.`)
  }
  const keys = (e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (e.key === 'Enter') save()
    if (e.key === 'Escape') setV(draftOf(t))
  }

  return (
    <div className={`rrow edit ${rowLevel(notes)} ${dirty ? 'dirty' : ''}`} id={`row_${t.id}`}>
      <span className="c-no num">{award}</span>
      <input className="c-last upper" id={p + 'last'} value={v.last} placeholder="Last name" aria-label={`Last name, row ${award}`} autoComplete="off"
        onChange={(e) => set({ last: e.target.value })} onKeyDown={keys} />
      <input className="c-first upper" id={p + 'first'} value={v.first} placeholder="First name" aria-label={`First name, row ${award}`} autoComplete="off"
        onChange={(e) => set({ first: e.target.value })} onKeyDown={keys} />
      <input className="c-mi upper" id={p + 'mi'} value={v.mi} placeholder="M.I." aria-label={`Middle initial, row ${award}`} maxLength={3} autoComplete="off"
        onChange={(e) => set({ mi: e.target.value })} onKeyDown={keys} />
      <select className="c-sfx" id={p + 'suffix'} value={v.suffix} aria-label={`Suffix, row ${award}`} onChange={(e) => set({ suffix: e.target.value as Suffix })} onKeyDown={keys}>
        {SUFFIXES.map((s) => <option key={s} value={s}>{s || '—'}</option>)}
      </select>
      <select className="c-pos" id={p + 'pos'} value={v.pos} aria-label={`Position, row ${award}`} onChange={(e) => set({ pos: e.target.value as Position })} onKeyDown={keys}>
        {POSITIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <label className="c-ids id-signed" title="The ID photocopy has the tanod's 3 signatures">
        <input type="checkbox" checked={t.ids >= 3} onChange={(e) => updateTanod(brgy, t.id, { ids: e.target.checked ? 3 : 0 })} />
        <span>ID signed</span>
      </label>
      <button type="button" className={`c-save iconbtn save ${dirty ? 'on' : ''}`} onClick={save} disabled={!dirty}
        aria-label={`Save changes to ${name}`} title={dirty ? 'Save changes' : 'No changes to save'}>
        {Icon.check}
      </button>
      <button type="button" className="c-del iconbtn del" onClick={onRemove} aria-label={`Delete ${name}`} title="Delete">
        {Icon.trash}
      </button>
      <div className="c-note">
        {dirty && <span className="unsaved">Not saved yet: tap ✓ to save, or press Esc to undo.</span>}
        {hasId && <IdPhotosButton tanodId={t.id} />}
        <a className="linkbtn" href={href({ page: 'templates', doc: 'idcopy', brgy, tanod: t.id })}>Print ID for signing</a>
        {(notes ?? []).map((n, i) => (
          <span key={i} className={n.level}>
            {n.text}
            {n.sms && !solo && <SmsActions compact text={n.sms} brgy={n.brgy} />}
          </span>
        ))}
      </div>
    </div>
  )
}

function Roster({ b, A, solo }: { b: Barangay; A: Analysis; solo: boolean }) {
  const removeTanod = useStore((s) => s.removeTanod)
  const insertTanod = useStore((s) => s.insertTanod)
  const removeWithReason = useStore((s) => s.removeWithReason)
  const [scanning, setScanning] = useState<'id' | 'list' | null>(null)
  const [leaving, setLeaving] = useState<Tanod | null>(null)
  const [adding, setAdding] = useState(false)
  const year = useStore((s) => s.sub.year)
  const full = b.tanods.length >= b.limit

  const undoable = (t: Tanod, gone: { index: number; tanod: Tanod } | null) => {
    if (gone)
      toast(`Deleted ${fullName(t) || 'the row'}.${solo ? '' : ' Award numbers were updated.'}`, {
        label: 'Undo',
        run: () => insertTanod(b.name, gone.index, gone.tanod),
      })
  }

  return (
    <Box
      title="Tanods"
      tip={
        solo
          ? 'Check each name against the ID. Change a name or M.I. right in the list, then tap ✓ to save. The Liga Rep assigns the award numbers when the whole municipality is put together.'
          : 'Change a name right in the list, then tap ✓ to save. Award numbers run across the whole municipality and update when rows are added or deleted.'
      }
      aside={
        <div className="row">
          <button type="button" className="btn" onClick={() => setScanning('list')}>{NavIcon.records} Scan a list</button>
          <button type="button" className="btn primary" onClick={() => setAdding(true)} disabled={full}>
            {full ? 'Limit reached' : 'Add tanod'}
          </button>
        </div>
      }
    >
      <ScanUpload key={scanning ?? 'closed'} b={b} mode={scanning ?? 'id'} open={!!scanning} onClose={() => setScanning(null)} />
      {adding && <TanodDialog b={b} onClose={() => setAdding(false)} onScan={() => setScanning('id')} />}
      <DepartureDialog
        tanod={leaving}
        year={year}
        onCancel={() => setLeaving(null)}
        onConfirm={(reason, note) => {
          const t = leaving!
          setLeaving(null)
          // A row added by mistake just goes; a real departure is kept in the tanod records.
          undoable(t, reason === 'mistake' ? removeTanod(b.name, t.id) : removeWithReason(b.name, t.id, { name: fullName(t), reason, note }))
        }}
      />
      <div className="rrow rhead edit" aria-hidden="true">
        <span className="c-no">No.</span><span className="c-last">Last name</span><span className="c-first">First name</span><span className="c-mi">M.I.</span>
        <span className="c-sfx">Suffix</span><span className="c-pos">Position</span><span className="c-ids">ID</span><span className="c-save" /><span className="c-del" />
      </div>
      <div className="rows">
        {b.tanods.length ? (
          b.tanods.map((t, i) => (
            // Keyed on the saved values, so a save (here or from another device) starts the row afresh.
            <RosterRow key={`${t.id}|${t.last}|${t.first}|${t.mi}|${t.suffix}|${t.pos}`} t={t} award={solo ? i + 1 : A.awards[t.id]} notes={A.notes[t.id]}
              solo={solo} brgy={b.name} onRemove={() => setLeaving(t)} />
          ))
        ) : (
          <p className="empty">No tanods yet for Brgy. {b.name}. Use Add tanod to scan their IDs or type them in, or Scan a list.</p>
        )}
      </div>
    </Box>
  )
}

/** An empty barangay that had tanods last year: start from that list instead of typing it again. */
function CopyLastYear({ b }: { b: Barangay }) {
  const previous = useStore((s) => s.previous)
  const copyPrevious = useStore((s) => s.copyPrevious)
  const editable = useEditable()
  const rows = previous?.brgys[b.name] ?? []
  if (b.tanods.length || !rows.length || !editable) return null
  return (
    <div className="banner copy-banner">
      <span>
        <b>Start from last year's list.</b> Brgy. {b.name} had {plural(rows.length, 'tanod')} in CY {previous!.year}. Copy them, then remove anyone who is not continuing and add the new ones.
      </span>
      <button type="button" className="btn primary" onClick={() => toast(`Copied ${plural(copyPrevious([b.name]), 'tanod')} from CY ${previous!.year}. ID signatures start at 0 for this year.`)}>
        Copy {plural(rows.length, 'tanod')}
      </button>
    </div>
  )
}

/** Liga Rep: copy last year's list into every barangay that hasn't started this year. */
function CopyAllBarangays() {
  const previous = useStore((s) => s.previous)
  const brgys = useStore((s) => s.sub.brgys)
  const copyPrevious = useStore((s) => s.copyPrevious)
  const editable = useEditable()
  const ready = brgys.filter((b) => !b.tanods.length && previous?.brgys[b.name]?.length)
  if (!previous || ready.length < 2 || !editable) return null
  const n = ready.reduce((a, b) => a + previous.brgys[b.name].length, 0)
  return (
    <div className="banner copy-banner">
      <span>
        <b>{plural(ready.length, 'barangay')} can start from CY {previous.year}'s list</b> ({plural(n, 'tanod')}). Barangays that already started this year are left as they are.
      </span>
      <button
        type="button"
        className="btn primary"
        onClick={() => {
          if (window.confirm(`Copy CY ${previous.year}'s tanods into ${plural(ready.length, 'barangay')} that haven't started CY ${useStore.getState().sub.year}?`))
            toast(`Copied ${plural(copyPrevious(ready.map((b) => b.name)), 'tanod')} from CY ${previous.year}.`)
        }}
      >
        Copy into {plural(ready.length, 'barangay')}
      </button>
    </div>
  )
}

function DocCheck({ b, k, label, hint, indent = false }: { b: Barangay; k: DocKey; label: string; hint: string; indent?: boolean }) {
  const setDoc = useStore((s) => s.setDoc)
  return (
    // Not one big <label>: the photo controls inside must not toggle the checkbox.
    <div className={`check ${indent ? 'indent' : ''}`}>
      <input type="checkbox" id={`doc_${k}`} checked={b.docs[k]} onChange={(e) => setDoc(b.name, k, e.target.checked)} />
      <span>
        <label htmlFor={`doc_${k}`}>{label}</label>
        <small>{hint}</small>
        <DocPhoto b={b} k={k} />
      </span>
    </div>
  )
}

function Requirements({ b }: { b: Barangay }) {
  const n = b.tanods.length
  const done = b.tanods.filter((t) => t.ids >= 3).length
  const idsOK = n > 0 && done === n
  return (
    <Box title="Requirements" tip="Tick each document once you have received it. Attach a photo of it if you can.">
      <div className="box-bd">
        <DocCheck b={b} k="cert" label="Barangay Certification" hint="Signed by the Punong Barangay" />
        <p className="cert-link">
          <a className="linkbtn" href={href({ page: 'templates', doc: 'certification', brgy: b.name })}>Print the certification form, filled in with this list</a>
        </p>
        <div className="check">
          <span className={`dot ${idsOK ? 'ok' : 'bad'}`} aria-hidden="true">{idsOK ? '✓' : '!'}</span>
          <span>
            ID photocopies, 3 signatures each
            <small>{n ? `${done} of ${n} signed. Tick "ID signed" on each row. Print them from Templates.` : 'Add tanods first.'}</small>
          </span>
        </div>
        <DocCheck b={b} k="designation" label="Proof of designation of the authorized representative" hint="The representative can change every year" />
        <DocCheck b={b} k="viaRep" label="Claiming through a representative" hint="Adds the SPA requirement" />
        {b.docs.viaRep && <DocCheck b={b} indent k="spa" label="Special Power of Attorney (SPA)" hint="Required when claiming through a representative" />}
      </div>
    </Box>
  )
}

function FocalPerson({ b }: { b: Barangay }) {
  const setFocal = useStore((s) => s.setFocal)
  return (
    <Box title="Barangay focal person" tip="The person who gets the SMS reminders about this barangay's list.">
      <div className="box-bd fields">
        <div className="field">
          <label htmlFor="fName">Name</label>
          <CommitInput key={b.name + b.focal.name} id="fName" value={b.focal.name} autoComplete="off" onCommit={(v) => setFocal(b.name, 'name', v.trim())} />
        </div>
        <div className="field">
          <label htmlFor="fPhone">Mobile number</label>
          <CommitInput key={b.name + b.focal.phone} id="fPhone" value={b.focal.phone} inputMode="tel" autoComplete="off" placeholder="0917 123 4567" onCommit={(v) => setFocal(b.name, 'phone', v.trim())} />
        </div>
      </div>
    </Box>
  )
}

/** The right-hand panel: every problem in this barangay, worst first, each with "Go to it" when it is about a row. */
function SideChecks({ b, A }: { b: Barangay; A: Analysis }) {
  const sub = useStore((s) => s.sub)
  // Reminders by SMS are for the Liga Rep to send to barangays, not for the barangay's own secretary.
  const solo = useAuth((s) => s.profile?.role === 'secretary')
  if (!b.tanods.length) return null
  const rank = (i: Issue) => (i.level === 'error' ? 0 : i.kind === 'check' ? 2 : 1)
  const mine = A.issues.filter((i) => i.brgy === b.name || i.also === b.name).sort((x, y) => rank(x) - rank(y))
  const errs = mine.filter((i) => i.level === 'error').length
  return (
    <Box title="Check these" aside={<Chip tone={errs ? 'bad' : mine.length ? 'warn' : 'ok'}>{mine.length ? mine.length : 'All good'}</Chip>}>
      {mine.length ? (
        <ul className="side-checks">
          {mine.map((i, ix) => (
            <li key={ix} className={i.level}>
              <span className="sev" aria-hidden="true" />
              <div>
                <div className="t">{i.msg}</div>
                <div className="acts">
                  {i.rows && <a className="linkbtn" href={href(issueTarget(i, sub))}>Go to it</a>}
                  {i.sms && !solo && <SmsActions compact lead={!!i.rows} text={i.sms} brgy={i.brgy} />}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="box-bd note">Everything for Brgy. {b.name} checks out.</p>
      )}
    </Box>
  )
}

export function BarangaysPage({ A, brgy, focus }: { A: Analysis; brgy: string | null; focus: string | null }) {
  const sub = useStore((s) => s.sub)
  const brgys = sub.brgys
  const lastBrgy = useStore((s) => s.lastBrgy)
  const setLastBrgy = useStore((s) => s.setLastBrgy)
  // A secretary's copy holds only their own barangay: no list to pick from, no award numbers.
  const solo = useAuth((s) => s.profile?.role === 'secretary')
  const editable = useEditable()
  const b = brgys.find((x) => x.name === brgy) ?? brgys.find((x) => x.name === lastBrgy) ?? brgys[0]
  const name = b?.name
  const remoteId = useStore((s) => (name ? s.remote?.brgyIds[name] : undefined))
  const isAdmin = useAuth((s) => s.profile?.role === 'admin')

  // "Go to it": scroll to the tanod's row and flash it, then drop the row from the address, so going
  // back, or tapping the same issue again, works.
  useEffect(() => {
    if (!focus || !name) return
    const el = document.getElementById(`row_${focus}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el?.classList.add('focus')
    navigate({ page: 'barangays', brgy: name }, { replace: true, scroll: false })
    const t = setTimeout(() => el?.classList.remove('focus'), 2600)
    return () => clearTimeout(t)
  }, [focus, name])

  // Remember the open barangay so the Barangays step reopens it.
  // Braces matter: the persisted store's setter returns a promise, and an effect may only return a cleanup function.
  useEffect(() => {
    if (name) setLastBrgy(name)
  }, [name, setLastBrgy])

  if (!b) return <div className="banner">No barangays are loaded yet.</div>
  const ix = brgys.indexOf(b)
  const st = A.status[b.name]
  const n = b.tanods.length
  const range = n && !solo ? ` · Award nos. ${A.awards[b.tanods[0].id]}–${A.awards[b.tanods[n - 1].id]}` : ''
  const prev = brgys[ix - 1]
  const next = brgys[ix + 1]

  return (
    <section className="page-section">
      {!solo && <CopyAllBarangays />}
      <div className="tanod-screen">
        <div className="ts-main">
          {/* Above the list's lock, so a locked list (or the provincial office's read-only view) can still switch barangays. */}
          {!solo && (
            <div className="pick-row">
              <BarangayPicker A={A} current={b.name} />
              <span className="pn">
                {prev ? <a className="iconbtn" href={href({ page: 'barangays', brgy: prev.name })} aria-label={`Previous: ${prev.name}`}>{Icon.prev}</a> : <span className="iconbtn off">{Icon.prev}</span>}
                {next ? <a className="iconbtn" href={href({ page: 'barangays', brgy: next.name })} aria-label={`Next: ${next.name}`}>{Icon.next}</a> : <span className="iconbtn off">{Icon.next}</span>}
              </span>
            </div>
          )}
          <fieldset className="editor plain" disabled={!editable}>
            <div className="ed-head">
              <div>
                <div className="eyebrow">{solo ? `${sub.municipality} · CY ${sub.year}` : `Barangay ${ix + 1} of ${brgys.length}${range}`}</div>
                <h2>{solo ? `Brgy. ${b.name}` : b.name}</h2>
              </div>
              <div className="ed-meta">
                <Chip tone={st.tone}>{st.label}</Chip>
                <span className={`count ${n > b.limit ? 'over' : ''}`}>
                  <b className="num">{n}</b>
                  <span className="num"> / {b.limit}</span> tanods
                </span>
              </div>
            </div>
            <CopyLastYear b={b} />
            <ScansWaiting barangayId={remoteId} />
            <Roster key={b.name} b={b} A={A} solo={solo} />
          </fieldset>
          {!solo && <NextStep to={{ page: 'review' }} label="Continue to Review" />}
        </div>
        <aside className="ts-side" aria-label={`Brgy. ${b.name}: checks and requirements`}>
          <SideChecks b={b} A={A} />
          <fieldset className="plain side-stack" disabled={!editable}>
            <Requirements b={b} />
            {!solo && <FocalPerson b={b} />}
          </fieldset>
          {/* Only the provincial office works with limits. Outside the list's lock, which is read-only for it. */}
          {isAdmin && <TanodLimit key={b.name} b={b} barangayId={remoteId} />}
        </aside>
      </div>
    </section>
  )
}
