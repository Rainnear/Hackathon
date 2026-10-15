import { useState, type FormEvent } from 'react'

import { clean, cleanMI, fullName, nameKey, plural } from '../domain/format'
import { blankTanod } from '../domain/submission'
import { POSITIONS, SUFFIXES, type Barangay, type Position, type Suffix, type Tanod } from '../domain/types'
import { printIdFor } from '../state/goTo'
import { useStore } from '../state/store'
import { toast } from '../state/toast'
import { Modal } from './Modal'
import { NavIcon } from './icons'

/** "DELA CRUZ<tab>JUAN<tab>S<tab>JR." per line, as copied from Excel (commas work too). */
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
    .filter((t) => t.last || t.first)
}

type Draft = Pick<Tanod, 'last' | 'first' | 'mi' | 'suffix' | 'pos' | 'ids'>
const emptyDraft = (): Draft => ({ last: '', first: '', mi: '', suffix: '', pos: 'BARANGAY TANOD', ids: 0 })

/**
 * Adding tanods: scan their ID, type them in, or paste a list from Excel. After a typed one is saved,
 * offers to print their ID photocopy for signing.
 */
export function TanodDialog({ b, onClose, onScan }: { b: Barangay; onClose: () => void; onScan: () => void }) {
  const addTanods = useStore((s) => s.addTanods)
  const [tab, setTab] = useState<'scan' | 'one' | 'paste'>('one')
  const [v, setV] = useState<Draft>(emptyDraft)
  const [paste, setPaste] = useState('')
  const [tried, setTried] = useState(false)
  const [added, setAdded] = useState<Tanod | null>(null)
  const set = (patch: Partial<Draft>) => setV((x) => ({ ...x, ...patch }))

  const room = Math.max(0, b.limit - b.tanods.length)
  const missing = !clean(v.last) || !clean(v.first)
  const twin = !missing ? b.tanods.find((t) => nameKey(t) === nameKey(v)) : undefined

  const save = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (missing) return
    if (!room) return toast(`Brgy. ${b.name} already has ${b.limit} tanods, the limit.`)
    const t: Tanod = { ...blankTanod(), ...v, last: clean(v.last), first: clean(v.first), mi: cleanMI(v.mi) }
    addTanods(b.name, [t])
    setAdded(t)
  }
  const another = () => {
    setAdded(null)
    setV(emptyDraft())
    setTried(false)
  }

  const rows = parsePasted(paste)
  const addPasted = () => {
    if (!rows.length) return toast('Paste at least one line first.')
    const fits = rows.slice(0, room)
    addTanods(b.name, fits)
    const skipped = rows.length - fits.length
    toast(`${plural(fits.length, 'name')} added${skipped ? `. ${skipped} not added: the limit of ${b.limit} was reached` : ''}.`)
    onClose()
  }

  if (added)
    return (
      <Modal open onClose={onClose} title={`${fullName(added)} added`}>
        <div className="modal-bd stack">
          <p>
            <b>{fullName(added)}</b> is on the list of Brgy. {b.name}. Print their ID photocopy now, for them to sign three times? It opens the
            ID page, ready to print. Without a scanned ID it has boxes to attach the photocopy.
          </p>
        </div>
        <div className="modal-ft">
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>Done</button>
          <button type="button" className="btn" onClick={another} disabled={b.tanods.length >= b.limit}>Add another</button>
          <button type="button" className="btn primary big" onClick={() => { onClose(); printIdFor(b.name, added.id) }}>
            {NavIcon.print} Print ID for signing
          </button>
        </div>
      </Modal>
    )

  return (
    <Modal open onClose={onClose} title={`Add a tanod to Brgy. ${b.name}`}>
      <div className="modal-bd pb0">
        <div className="seg" role="group" aria-label="How to add">
          <button type="button" aria-pressed={tab === 'scan'} onClick={() => setTab('scan')}>Scan the ID</button>
          <button type="button" aria-pressed={tab === 'one'} onClick={() => setTab('one')}>Type it</button>
          <button type="button" aria-pressed={tab === 'paste'} onClick={() => setTab('paste')}>Paste from Excel</button>
        </div>
      </div>
      {tab === 'scan' ? (
        <>
          <div className="modal-bd stack">
            <p>Take a photo of each ID, or choose photos already on this device. Sakto reads the name; you check it, then it's added to the list.</p>
            <p className="note">After saving a scanned ID you can print it straight away for the tanod's three signatures.</p>
          </div>
          <div className="modal-ft">
            <span className="grow" />
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="button" className="btn primary big" disabled={!room} onClick={() => { onClose(); onScan() }}>
              {NavIcon.camera} Scan or choose ID photos
            </button>
          </div>
        </>
      ) : tab === 'one' ? (
        <form onSubmit={save}>
          <div className="modal-bd stack">
            <div className="field">
              <label htmlFor="td_last">Last name</label>
              <input id="td_last" className={`upper ${tried && !clean(v.last) ? 'invalid' : ''}`} value={v.last} autoComplete="off" autoFocus
                onChange={(e) => set({ last: e.target.value })} onBlur={(e) => set({ last: clean(e.target.value) })} />
            </div>
            <div className="field">
              <label htmlFor="td_first">First name</label>
              <input id="td_first" className={`upper ${tried && !clean(v.first) ? 'invalid' : ''}`} value={v.first} autoComplete="off"
                onChange={(e) => set({ first: e.target.value })} onBlur={(e) => set({ first: clean(e.target.value) })} />
            </div>
            <div className="fields two">
              <div className="field">
                <label htmlFor="td_mi">Middle initial</label>
                <input id="td_mi" className="upper" value={v.mi} maxLength={3} autoComplete="off"
                  onChange={(e) => set({ mi: e.target.value })} onBlur={(e) => set({ mi: cleanMI(e.target.value) })} />
              </div>
              <div className="field">
                <label htmlFor="td_sfx">Suffix</label>
                <select id="td_sfx" value={v.suffix} onChange={(e) => set({ suffix: e.target.value as Suffix })}>
                  {SUFFIXES.map((s) => <option key={s} value={s}>{s || 'None'}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="td_pos">Position</label>
              <select id="td_pos" value={v.pos} onChange={(e) => set({ pos: e.target.value as Position })}>
                {POSITIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <label className="check-inline">
              <input type="checkbox" checked={v.ids >= 3} onChange={(e) => set({ ids: e.target.checked ? 3 : 0 })} />
              ID photocopy signed (3 signatures)
            </label>
            {tried && missing && <div className="banner bad">Type both the last name and the first name, exactly as on the ID.</div>}
            {twin && <div className="banner bad">{fullName(twin)} is already on the list. Check that this isn't the same person.</div>}
            {!room && <div className="banner bad">Brgy. {b.name} already has {b.limit} tanods, the limit.</div>}
          </div>
          <div className="modal-ft">
            <span className="grow" />
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary big" disabled={!room}>Save</button>
          </div>
        </form>
      ) : (
        <>
          <div className="modal-bd stack">
            <div className="field">
              <label htmlFor="td_paste">One tanod per line: Last name, First name, M.I., Suffix</label>
              <textarea id="td_paste" rows={7} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'DELA CRUZ\tJUAN\tS\tJR.\nSANTOS\tPEDRO\tA'} autoFocus />
            </div>
            <p className="note">
              Copy the four columns from Excel and paste them here. Names are capitalized and cleaned up.
              {rows.length > 0 && <> <b>{plural(rows.length, 'name')}</b> found{rows.length > room ? `; only ${room} fit under the limit of ${b.limit}` : ''}.</>}
            </p>
          </div>
          <div className="modal-ft">
            <span className="grow" />
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="button" className="btn primary big" disabled={!rows.length || !room} onClick={addPasted}>
              Add {rows.length ? plural(Math.min(rows.length, room), 'name') : 'names'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
