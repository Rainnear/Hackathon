import { useEffect, useState } from 'react'

import { clean, cleanMI, newId, plural } from '../domain/format'
import { POSITIONS, SUFFIXES, type Position, type Suffix, type Tanod } from '../domain/types'
import { READER_CONNECTED, type IdField } from '../lib/reader'
import { deleteScans, markScanSaved, type Scan } from '../lib/scans'
import { useEditable } from '../state/access'
import { isWaiting, useScans } from '../state/scans'
import { useStore } from '../state/store'
import { useSync } from '../state/sync'
import { toast } from '../state/toast'
import { ListReviewForm } from './ListReview'
import { ScanPhoto } from './ScanPhoto'
import { Modal } from './Modal'

const SURE = 0.8

function ReviewForm({ scan, position, total }: { scan: Scan; position: number; total: number }) {
  const remote = useStore((s) => s.remote)
  const brgys = useStore((s) => s.sub.brgys)
  const addTanods = useStore((s) => s.addTanods)
  const next = useScans((s) => s.next)
  const upsert = useScans((s) => s.upsert)
  const remove = useScans((s) => s.remove)
  const online = useSync((s) => s.online)
  const editable = useEditable()
  const f = scan.fields
  const [v, setV] = useState({
    last: clean(f.last),
    first: clean(f.first),
    mi: cleanMI(f.mi),
    suffix: (SUFFIXES as readonly string[]).includes(f.suffix ?? '') ? (f.suffix as Suffix) : ('' as Suffix),
    pos: 'BARANGAY TANOD' as Position,
    ids: 0,
  })
  const [busy, setBusy] = useState(false)
  const name = Object.entries(remote?.brgyIds ?? {}).find(([, id]) => id === scan.barangay_id)?.[0]
  const b = brgys.find((x) => x.name === name)
  const full = !!b && b.tanods.length >= b.limit
  const read = f.reader && f.reader !== 'none'
  // Ask for a second look at anything the reader wasn't sure of (or left empty).
  const check = (k: IdField) => read && (!(f[k] as string | undefined) ? k === 'last' || k === 'first' : (f.confidence?.[k] ?? 1) < SURE)
  const set = (patch: Partial<typeof v>) => setV((x) => ({ ...x, ...patch }))

  const save = async () => {
    if (!b || !clean(v.last) || !clean(v.first)) return
    setBusy(true)
    const tanod: Tanod = { id: newId(), last: clean(v.last), first: clean(v.first), mi: cleanMI(v.mi), suffix: v.suffix, pos: v.pos, ids: v.ids }
    try {
      // Mark the scan first (needs internet); only then add the row, so a scan can't become two tanods.
      // The confirmed name, plus what the reader made of the photo (kept for the cross-check with the list).
      const conf = Math.min(f.confidence?.last ?? 0, f.confidence?.first ?? 0)
      const read = f.reader && f.reader !== 'none' ? { last: clean(f.last), first: clean(f.first), mi: cleanMI(f.mi), suffix: f.suffix ?? '', conf } : undefined
      await markScanSaved(scan.id, tanod.id, { ...f, ...(read ? { read } : {}), last: tanod.last, first: tanod.first, mi: tanod.mi, suffix: tanod.suffix })
      addTanods(b.name, [tanod])
      upsert({ ...scan, status: 'saved', tanod_id: tanod.id })
      toast(`${tanod.first} ${tanod.last} added to Brgy. ${b.name}.`)
      next()
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const discard = async () => {
    if (!window.confirm('Discard this scan? Its photos are deleted and no tanod is added.')) return
    setBusy(true)
    try {
      await deleteScans([scan])
      remove(scan.id)
      next()
    } catch (e) {
      toast(`Could not discard: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const field = (k: 'last' | 'first' | 'mi', label: string, extra: { maxLength?: number; placeholder?: string } = {}) => (
    <div className={`field ${check(k) ? 'needs-check' : ''}`}>
      <label htmlFor={`rv_${k}`}>
        {label}
        {check(k) && <span className="check-tag">Please check</span>}
      </label>
      <input id={`rv_${k}`} className="upper" value={v[k]} autoComplete="off" {...extra}
        onChange={(e) => set({ [k]: e.target.value })} onBlur={(e) => set({ [k]: k === 'mi' ? cleanMI(e.target.value) : clean(e.target.value) })} />
    </div>
  )

  return (
    <>
      <div className="modal-bd review">
        <div className="review-photos">
          <ScanPhoto path={scan.front_path} label="Front" />
          <ScanPhoto path={scan.back_path} label="Back" />
        </div>
        <div className="review-form stack">
          {!read && (
            <div className="banner">
              {READER_CONNECTED || scan.status === 'failed'
                ? 'The ID could not be read automatically. Type the details from the photo.'
                : 'Automatic reading is not connected yet. Type the details from the photo.'}
            </div>
          )}
          {read && (
            <div className="banner ok">
              Filled in automatically{f.reader === 'ai' ? ' by the AI reader' : ''}. Check every field against the photo
              {f.last && f.first ? '.' : ', and type what it could not find.'}
            </div>
          )}
          <p className="note">
            Brgy. {name ?? '—'} · Compare each field with the ID and fix anything that's wrong. Names are saved in capital letters.
          </p>
          {field('last', 'Last name')}
          {field('first', 'First name')}
          <div className="fields two">
            {field('mi', 'M.I.', { maxLength: 3 })}
            <div className={`field ${check('suffix') ? 'needs-check' : ''}`}>
              <label htmlFor="rv_sfx">Suffix{check('suffix') && <span className="check-tag">Please check</span>}</label>
              <select id="rv_sfx" value={v.suffix} onChange={(e) => set({ suffix: e.target.value as Suffix })}>
                {SUFFIXES.map((s) => <option key={s} value={s}>{s || 'None'}</option>)}
              </select>
            </div>
          </div>
          {f.birthdate && <p className="note">Birthdate on the ID: <b>{f.birthdate}</b></p>}
          <div className="field">
            <label htmlFor="rv_pos">Position</label>
            <select id="rv_pos" value={v.pos} onChange={(e) => set({ pos: e.target.value as Position })}>
              {POSITIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <label className="check-inline">
            <input type="checkbox" checked={v.ids >= 3} onChange={(e) => set({ ids: e.target.checked ? 3 : 0 })} />
            ID photocopy signed (3 signatures)
          </label>
          {full && b && <div className="banner bad">Brgy. {b.name} already has {b.tanods.length} of {b.limit} tanods. Remove someone first, or skip this scan for now.</div>}
          {!editable && <div className="banner">The list is locked, so new tanods can't be added.</div>}
          {!online && <div className="banner bad">Saving a scan needs internet. Connect, then try again.</div>}
        </div>
      </div>
      <div className="modal-ft">
        <span className="note grow">ID {position} of {total}</span>
        <button type="button" className="btn danger" disabled={busy} onClick={discard}>Discard scan</button>
        <button type="button" className="btn" disabled={busy} onClick={next}>Skip for now</button>
        <button type="button" className="btn primary big" disabled={busy || full || !editable || !online || !clean(v.last) || !clean(v.first)} onClick={save}>
          {busy ? 'Saving…' : position < total ? 'Save and next' : 'Save'}
        </button>
      </div>
    </>
  )
}

/** The review pop-up: one scanned ID at a time, photos beside the fields the reader filled in. */
export function ScanReview() {
  const queue = useScans((s) => s.queue)
  const index = useScans((s) => s.index)
  const list = useScans((s) => s.list)
  const next = useScans((s) => s.next)
  const close = useScans((s) => s.close)
  const id = queue?.[index]
  const scan = list.find((s) => s.id === id)

  // A scan that disappeared (discarded elsewhere) or was already saved is skipped.
  const gone = !!queue && (!scan || scan.status === 'saved')
  useEffect(() => {
    if (gone) next()
  }, [gone, next])

  const remaining = list.filter(isWaiting).length
  return (
    <Modal
      open={!!queue && !!scan && !gone}
      onClose={() => {
        close()
        if (remaining) toast(`${plural(remaining, 'scan')} still waiting. Find them under "Scans to review".`)
      }}
      title={scan?.kind === 'list' ? 'Check the names from the list' : 'Check the scanned ID'}
      wide
    >
      {scan && queue && (scan.kind === 'list' ? (
        <ListReviewForm key={scan.id} scan={scan} position={index + 1} total={queue.length} />
      ) : (
        <ReviewForm key={scan.id} scan={scan} position={index + 1} total={queue.length} />
      ))}
    </Modal>
  )
}

/** "3 scanned IDs waiting for review" with a button, for the Tanods page and the secretary's home. */
export function ScansWaiting({ barangayId }: { barangayId?: number }) {
  // Select the list itself and filter here: a selector returning a new array each time would re-render forever.
  const list = useScans((s) => s.list)
  const review = useScans((s) => s.review)
  const waiting = list.filter((x) => isWaiting(x) && (!barangayId || x.barangay_id === barangayId))
  if (!waiting.length) return null
  return (
    <div className="banner scans-waiting">
      <span>{plural(waiting.length, 'scan')} waiting for review.</span>
      <button type="button" className="btn primary" onClick={() => review(waiting.map((s) => s.id))}>Review now</button>
    </div>
  )
}

/** "View ID" on a tanod row whose ID was scanned. */
export function IdPhotosButton({ tanodId }: { tanodId: string }) {
  const scan = useScans((s) => s.list.find((x) => x.tanod_id === tanodId && x.status === 'saved'))
  const [open, setOpen] = useState(false)
  if (!scan) return null
  const name = [scan.fields.first, scan.fields.last].filter(Boolean).join(' ')
  return (
    <>
      {/* A link, not a button: it must keep working when the list is locked (a disabled fieldset). */}
      <a href="#" role="button" className="linkbtn" onClick={(e) => { e.preventDefault(); setOpen(true) }}>View ID</a>
      <Modal open={open} onClose={() => setOpen(false)} title={`ID of ${name || 'this tanod'}`} wide>
        <div className="modal-bd review-photos">
          <ScanPhoto path={scan.front_path} label="Front" />
          <ScanPhoto path={scan.back_path} label="Back" />
        </div>
      </Modal>
    </>
  )
}
