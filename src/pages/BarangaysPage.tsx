import { useEffect, useState } from 'react'

import { Icon } from '../components/icons'
import { Box, Chip, CommitInput, NextStep } from '../components/ui'
import { IssueItem, SmsActions } from '../components/Issues'
import { FILTERS, matchesFilter, type Analysis } from '../domain/analyze'
import { clean, cleanMI, fullName, plural } from '../domain/format'
import { blankTanod } from '../domain/submission'
import { POSITIONS, SUFFIXES, type Barangay, type DocKey, type Position, type RowNote, type Suffix, type Tanod } from '../domain/types'
import { href, navigate } from '../state/route'
import { useStore } from '../state/store'
import { toast } from '../state/toast'

function Rail({ A, current }: { A: Analysis; current: string }) {
  const brgys = useStore((s) => s.sub.brgys)
  const filter = useStore((s) => s.filter)
  const setFilter = useStore((s) => s.setFilter)
  const shown = brgys.filter((b) => matchesFilter(filter, A.status[b.name].tone))

  const pick = (f: typeof filter) => {
    setFilter(f)
    // Jump to the first barangay in the group, so the editor matches what the list shows.
    if (!matchesFilter(f, A.status[current].tone)) {
      const first = brgys.find((b) => matchesFilter(f, A.status[b.name].tone))
      if (first) navigate({ page: 'barangays', brgy: first.name }, { replace: true, scroll: false })
    }
  }

  return (
    <aside className="box rail" aria-label="Barangays">
      <div className="rail-hd">
        <div className="seg sm" role="group" aria-label="Show barangays">
          {FILTERS.map((f) => (
            <button key={f.value} type="button" aria-pressed={filter === f.value} onClick={() => pick(f.value)}>
              {f.label} <span className="num">{brgys.filter((b) => matchesFilter(f.value, A.status[b.name].tone)).length}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="rail-list">
        {shown.length ? (
          shown.map((b) => {
            const st = A.status[b.name]
            const n = b.tanods.length
            return (
              <a key={b.name} className="brow" href={href({ page: 'barangays', brgy: b.name })} aria-current={b.name === current ? 'true' : undefined}>
                <span className="bn">{b.name}</span>
                <Chip tone={st.tone}>{st.label}</Chip>
                <span className="bm">
                  <span className="bar">
                    <i className={n > b.limit ? 'over' : ''} style={{ width: `${Math.min(100, (n / b.limit) * 100)}%` }} />
                  </span>
                  <span className="num">{n}/{b.limit}</span>
                </span>
              </a>
            )
          })
        ) : (
          <p className="empty">No barangays in this group.</p>
        )}
      </div>
    </aside>
  )
}

const nameClass = (ns: RowNote[] | undefined) => {
  const x = (ns ?? []).filter((n) => n.kind !== 'ids')
  return x.some((n) => n.level === 'error') ? 'err' : x.length ? 'warnf' : ''
}

function RosterRow({ t, award, notes, brgy, autoFocus, onRemove }: { t: Tanod; award: number; notes?: RowNote[]; brgy: string; autoFocus: boolean; onRemove: () => void }) {
  const updateTanod = useStore((s) => s.updateTanod)
  const set = (patch: Partial<Tanod>) => updateTanod(brgy, t.id, patch)
  const nc = nameClass(notes)
  const p = `f_${t.id}_`
  return (
    <div className="rrow">
      <span className="c-no num">{award}</span>
      <input className={`c-last upper ${nc}`} id={p + 'last'} value={t.last} placeholder="Last name" aria-label="Last name" autoComplete="off" autoFocus={autoFocus}
        onChange={(e) => set({ last: e.target.value })} onBlur={(e) => set({ last: clean(e.target.value) })} />
      <input className={`c-first upper ${nc}`} id={p + 'first'} value={t.first} placeholder="First name" aria-label="First name" autoComplete="off"
        onChange={(e) => set({ first: e.target.value })} onBlur={(e) => set({ first: clean(e.target.value) })} />
      <input className="c-mi upper" id={p + 'mi'} value={t.mi} placeholder="M.I." aria-label="Middle initial" maxLength={3} autoComplete="off"
        onChange={(e) => set({ mi: e.target.value })} onBlur={(e) => set({ mi: cleanMI(e.target.value) })} />
      <select className="c-sfx" id={p + 'suffix'} value={t.suffix} aria-label="Suffix" onChange={(e) => set({ suffix: e.target.value as Suffix })}>
        {SUFFIXES.map((s) => <option key={s} value={s}>{s || '—'}</option>)}
      </select>
      <select className="c-pos" id={p + 'pos'} value={t.pos} aria-label="Position" onChange={(e) => set({ pos: e.target.value as Position })}>
        {POSITIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span className="c-ids ids" role="group" aria-label="Signatures on ID photocopy">
        <span className="lbl">ID signatures</span>
        {[1, 2, 3].map((k) => (
          <button key={k} type="button" className={t.ids >= k ? 'on' : ''} aria-pressed={t.ids >= k} aria-label={`Signature ${k} of 3`}
            onClick={() => set({ ids: t.ids === k ? k - 1 : k })}>
            {k}
          </button>
        ))}
      </span>
      <button type="button" className="c-del iconbtn del" aria-label={`Remove ${fullName(t) || 'this row'}`} onClick={onRemove}>
        {Icon.x}
      </button>
      {notes && notes.length > 0 && (
        <div className="c-note">
          {notes.map((n, i) => (
            <span key={i} className={n.level}>
              {n.text}
              {n.sms && <SmsActions compact text={n.sms} brgy={n.brgy} />}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function parsePasted(text: string): Tanod[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const c = l.split(/\t|,/).map((x) => x.trim())
      const sx = clean(c[3])
      const suffix = (SUFFIXES as readonly string[]).includes(sx) ? sx : (SUFFIXES as readonly string[]).includes(sx + '.') ? sx + '.' : ''
      return { ...blankTanod(), last: clean(c[0]), first: clean(c[1]), mi: cleanMI(c[2]), suffix: suffix as Suffix }
    })
}

function Roster({ b, A }: { b: Barangay; A: Analysis }) {
  const addTanods = useStore((s) => s.addTanods)
  const removeTanod = useStore((s) => s.removeTanod)
  const insertTanod = useStore((s) => s.insertTanod)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [paste, setPaste] = useState('')
  const full = b.tanods.length >= b.limit

  const add = () => {
    const t = blankTanod()
    addTanods(b.name, [t])
    setFocusId(t.id)
  }
  const remove = (t: Tanod) => {
    const gone = removeTanod(b.name, t.id)
    if (gone)
      toast(`Removed ${fullName(t) || 'the row'}. Award numbers were updated.`, {
        label: 'Undo',
        run: () => insertTanod(b.name, gone.index, gone.tanod),
      })
  }
  const addPasted = () => {
    const rows = parsePasted(paste)
    if (!rows.length) return toast('Paste at least one line first.')
    const room = Math.max(0, b.limit - b.tanods.length)
    addTanods(b.name, rows.slice(0, room))
    setPaste('')
    const skipped = rows.length - Math.min(room, rows.length)
    toast(`${plural(Math.min(room, rows.length), 'name')} added${skipped ? `. ${skipped} not added because the limit was reached` : ''}.`)
  }

  return (
    <Box
      title="Tanods"
      aside={
        <button type="button" className="btn primary" onClick={add} disabled={full}>
          {full ? 'Limit reached' : 'Add tanod'}
        </button>
      }
    >
      <p className="box-sub note">Award numbers run across the whole municipality and update when rows are added or removed.</p>
      <div className="rrow rhead" aria-hidden="true">
        <span className="c-no">No.</span><span className="c-last">Last name</span><span className="c-first">First name</span><span className="c-mi">M.I.</span>
        <span className="c-sfx">Suffix</span><span className="c-pos">Position</span><span className="c-ids">ID signs</span><span className="c-del" />
      </div>
      <div className="rows">
        {b.tanods.length ? (
          b.tanods.map((t) => (
            <RosterRow key={t.id} t={t} award={A.awards[t.id]} notes={A.notes[t.id]} brgy={b.name} autoFocus={t.id === focusId} onRemove={() => remove(t)} />
          ))
        ) : (
          <p className="empty">No tanods yet for Brgy. {b.name}.</p>
        )}
      </div>
      <div className="box-ft">
        <div className="field">
          <label htmlFor="paste">Paste from Excel: one tanod per line, columns Last name, First name, M.I., Suffix</label>
          <textarea id="paste" rows={3} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'DELA CRUZ\tJUAN\tS\tJR.'} />
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={addPasted}>Add pasted names</button>
          <span className="note">Names are capitalized and cleaned up. Rows past the limit are not added.</span>
        </div>
      </div>
    </Box>
  )
}

function DocCheck({ b, k, label, hint, indent = false }: { b: Barangay; k: DocKey; label: string; hint: string; indent?: boolean }) {
  const setDoc = useStore((s) => s.setDoc)
  return (
    <label className={`check ${indent ? 'indent' : ''}`}>
      <input type="checkbox" id={`doc_${k}`} checked={b.docs[k]} onChange={(e) => setDoc(b.name, k, e.target.checked)} />
      <span>
        {label}
        <small>{hint}</small>
      </span>
    </label>
  )
}

function Requirements({ b }: { b: Barangay }) {
  const n = b.tanods.length
  const done = b.tanods.filter((t) => t.ids >= 3).length
  const idsOK = n > 0 && done === n
  return (
    <Box title="Requirements" aside={<span className="note">Tick what you have received</span>}>
      <div className="box-bd">
        <DocCheck b={b} k="cert" label="Barangay Certification" hint="Signed by the Punong Barangay" />
        <div className="check">
          <span className={`dot ${idsOK ? 'ok' : 'bad'}`} aria-hidden="true">{idsOK ? '✓' : '!'}</span>
          <span>
            ID photocopies, 3 signatures each
            <small>{n ? `${done} of ${n} complete. Set them per tanod in the ID signatures column.` : 'Add tanods first.'}</small>
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
    <Box title="Barangay focal person" aside={<span className="note">Gets the SMS reminders</span>}>
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

function Attention({ b, A }: { b: Barangay; A: Analysis }) {
  if (!b.tanods.length) return <div className="banner">Not started. Add tanods one by one, or paste the list from Excel at the bottom of the table.</div>
  const general = A.issues.filter((i) => i.brgy === b.name && !i.rows)
  const flagged = b.tanods.filter((t) => A.notes[t.id])
  if (!general.length && !flagged.length) return <div className="banner ok">Ready. Everything for Brgy. {b.name} checks out.</div>
  const rowLevel = flagged.some((t) => A.notes[t.id].some((n) => n.level === 'error')) ? 'error' : 'warn'
  return (
    <Box title="Needs attention">
      <ul className="issues">
        {general.map((i, ix) => <IssueItem key={ix} issue={i} where="local" A={A} />)}
        {flagged.length > 0 && (
          <li className={`issue ${rowLevel}`}>
            <span className="sev" />
            <div>
              <div className="t">{plural(flagged.length, 'row')} in the list below {flagged.length === 1 ? 'needs' : 'need'} attention</div>
              <div className="w">The note under each row says what to fix.</div>
            </div>
          </li>
        )}
      </ul>
    </Box>
  )
}

export function BarangaysPage({ A, brgy }: { A: Analysis; brgy: string | null }) {
  const brgys = useStore((s) => s.sub.brgys)
  const lastBrgy = useStore((s) => s.lastBrgy)
  const setLastBrgy = useStore((s) => s.setLastBrgy)
  const b = brgys.find((x) => x.name === brgy) ?? brgys.find((x) => x.name === lastBrgy) ?? brgys[0]
  const ix = brgys.indexOf(b)
  const st = A.status[b.name]
  const n = b.tanods.length

  // Remember the open barangay so the Barangays step reopens it.
  // Braces matter: the persisted store's setter returns a promise, and an effect may only return a cleanup function.
  useEffect(() => {
    setLastBrgy(b.name)
  }, [b.name, setLastBrgy])

  const range = n ? ` · Award nos. ${A.awards[b.tanods[0].id]}–${A.awards[b.tanods[n - 1].id]}` : ''
  const prev = brgys[ix - 1]
  const next = brgys[ix + 1]

  return (
    <section className="page-section">
      <div className="split">
        <Rail A={A} current={b.name} />
        <div className="editor">
          <div className="ed-head">
            <div>
              <div className="eyebrow">Barangay {ix + 1} of {brgys.length}{range}</div>
              <h2>{b.name}</h2>
            </div>
            <div className="ed-meta">
              <Chip tone={st.tone}>{st.label}</Chip>
              <span className={`count ${n > b.limit ? 'over' : ''}`}>
                <b className="num">{n}</b>
                <span className="num"> / {b.limit}</span> tanods allowed
              </span>
              <span className="pn">
                {prev ? <a className="iconbtn" href={href({ page: 'barangays', brgy: prev.name })} aria-label={`Previous: ${prev.name}`}>{Icon.prev}</a> : <span className="iconbtn off">{Icon.prev}</span>}
                {next ? <a className="iconbtn" href={href({ page: 'barangays', brgy: next.name })} aria-label={`Next: ${next.name}`}>{Icon.next}</a> : <span className="iconbtn off">{Icon.next}</span>}
              </span>
            </div>
          </div>
          <Attention b={b} A={A} />
          <Roster key={b.name} b={b} A={A} />
          <div className="grid2 even">
            <Requirements b={b} />
            <FocalPerson b={b} />
          </div>
          <NextStep to={{ page: 'review' }} label="Continue to Review" />
        </div>
      </div>
    </section>
  )
}
