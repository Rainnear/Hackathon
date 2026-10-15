import { useState } from 'react'

import { clean, cleanMI, nameKey, newId, plural } from '../domain/format'
import { SUFFIXES, type Suffix, type Tanod } from '../domain/types'
import type { ListRow } from '../lib/idParse'
import { deleteScans, markScanSaved, type Scan } from '../lib/scans'
import { useEditable } from '../state/access'
import { useScans } from '../state/scans'
import { useStore } from '../state/store'
import { useSync } from '../state/sync'
import { toast } from '../state/toast'
import { ScanPhoto } from './ScanPhoto'

interface Row {
  key: string
  include: boolean
  last: string
  first: string
  mi: string
  suffix: Suffix
  conf: number
  /** Already in this barangay's list (same last and first name). */
  dup: boolean
}

const SURE = 0.8
const asSuffix = (s: string): Suffix => ((SUFFIXES as readonly string[]).includes(s) ? (s as Suffix) : '')

/**
 * Review one scanned page of a list: the photo beside a table of the names read from it, one row
 * per person. Names already listed start unticked; rows past the barangay's limit can't be ticked.
 */
export function ListReviewForm({ scan, position, total }: { scan: Scan; position: number; total: number }) {
  const remote = useStore((s) => s.remote)
  const brgys = useStore((s) => s.sub.brgys)
  const addTanods = useStore((s) => s.addTanods)
  const next = useScans((s) => s.next)
  const upsert = useScans((s) => s.upsert)
  const remove = useScans((s) => s.remove)
  const online = useSync((s) => s.online)
  const editable = useEditable()
  const name = Object.entries(remote?.brgyIds ?? {}).find(([, id]) => id === scan.barangay_id)?.[0]
  const b = brgys.find((x) => x.name === name)
  const listed = new Set((b?.tanods ?? []).map(nameKey))
  const room = b ? Math.max(0, b.limit - b.tanods.length) : 0
  const reader = scan.fields.reader ?? 'none'

  const [rows, setRows] = useState<Row[]>(() => {
    let left = room
    return (scan.fields.rows ?? []).map((r: ListRow) => {
      const row = { last: clean(r.last), first: clean(r.first), mi: cleanMI(r.mi), suffix: asSuffix(r.suffix) }
      const dup = listed.has(nameKey(row))
      const include = !dup && left > 0
      if (include) left--
      return { key: newId(), ...row, conf: r.conf ?? 1, dup, include }
    })
  })
  const [busy, setBusy] = useState(false)
  const set = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const valid = (r: Row) => !!clean(r.last) && !!clean(r.first)
  const chosen = rows.filter((r) => r.include && valid(r))
  const ticked = rows.filter((r) => r.include).length

  const toggle = (r: Row) => {
    if (!r.include && ticked >= room) return toast(`Brgy. ${b?.name} has room for ${plural(room, 'more tanod')} only (limit ${b?.limit}).`)
    set(r.key, { include: !r.include })
  }
  const addRow = () => {
    if (ticked >= room) return toast(`Brgy. ${b?.name} has room for ${plural(room, 'more tanod')} only (limit ${b?.limit}).`)
    setRows((rs) => [...rs, { key: newId(), include: true, last: '', first: '', mi: '', suffix: '', conf: 1, dup: false }])
  }

  const save = async () => {
    if (!b || !chosen.length) return
    setBusy(true)
    const tanods: Tanod[] = chosen.map((r) => ({ id: newId(), last: clean(r.last), first: clean(r.first), mi: cleanMI(r.mi), suffix: r.suffix, pos: 'BARANGAY TANOD', ids: 0 }))
    try {
      // Mark the page first (needs internet); only then add the rows, so a page can't be added twice.
      await markScanSaved(scan.id, null, { ...scan.fields, rows: tanods.map((t) => ({ last: t.last, first: t.first, mi: t.mi, suffix: t.suffix, conf: 1 })) })
      addTanods(b.name, tanods)
      upsert({ ...scan, status: 'saved' })
      toast(`${plural(tanods.length, 'tanod')} added to Brgy. ${b.name}.`)
      next()
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const discard = async () => {
    if (!window.confirm('Discard this page? Its photo is deleted and no one is added.')) return
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

  const dups = rows.filter((r) => r.dup).length
  return (
    <>
      <div className="modal-bd list-review">
        <div className="lr-photo">
          <ScanPhoto path={scan.front_path} label="Page" />
        </div>
        <div className="lr-table stack">
          {reader === 'none' || !rows.length ? (
            <div className="banner">
              This page could not be read automatically{reader === 'none' ? ' (handwriting needs the AI reader)' : ''}. Type each name from the photo using Add a row.
            </div>
          ) : (
            <div className="banner ok">
              {plural(rows.length, 'name')} read{reader === 'ai' ? ' by the AI reader' : ''}. Check each row against the photo, especially the highlighted ones.
            </div>
          )}
          <p className="note">
            Brgy. {name ?? '—'} · room for {plural(room, 'more tanod')}
            {dups ? ` · ${plural(dups, 'name')} already on the list, left unticked` : ''}
          </p>
          <div className="lr-rows" role="table" aria-label="Names read from the page">
            <div className="lr-row lr-head" role="row">
              <span role="columnheader">Add</span>
              <span role="columnheader">Last name</span>
              <span role="columnheader">First name</span>
              <span role="columnheader">M.I.</span>
              <span role="columnheader">Suffix</span>
              <span role="columnheader" />
            </div>
            {rows.map((r, i) => {
              const unsure = r.conf < SURE
              return (
                <div key={r.key} className={`lr-row ${unsure ? 'unsure' : ''} ${r.dup ? 'dup' : ''} ${r.include ? '' : 'off'}`} role="row">
                  <input type="checkbox" checked={r.include} onChange={() => toggle(r)} aria-label={`Add row ${i + 1}`} />
                  <input className="upper" value={r.last} placeholder="Last name" aria-label={`Row ${i + 1} last name`} onChange={(e) => set(r.key, { last: e.target.value })} onBlur={(e) => set(r.key, { last: clean(e.target.value) })} />
                  <input className="upper" value={r.first} placeholder="First name" aria-label={`Row ${i + 1} first name`} onChange={(e) => set(r.key, { first: e.target.value })} onBlur={(e) => set(r.key, { first: clean(e.target.value) })} />
                  <input className="upper" value={r.mi} placeholder="M.I." maxLength={3} aria-label={`Row ${i + 1} middle initial`} onChange={(e) => set(r.key, { mi: e.target.value })} onBlur={(e) => set(r.key, { mi: cleanMI(e.target.value) })} />
                  <select value={r.suffix} aria-label={`Row ${i + 1} suffix`} onChange={(e) => set(r.key, { suffix: e.target.value as Suffix })}>
                    {SUFFIXES.map((s) => <option key={s} value={s}>{s || '—'}</option>)}
                  </select>
                  <button type="button" className="iconbtn del" aria-label={`Remove row ${i + 1}`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>×</button>
                  {(r.dup || unsure || (r.include && !valid(r))) && (
                    <span className="lr-note">
                      {r.dup ? 'Already on the list' : r.include && !valid(r) ? 'Needs a last and a first name' : 'Unclear writing: please check'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <button type="button" className="btn" onClick={addRow}>Add a row</button>
          {!editable && <div className="banner">The list is locked, so new tanods can't be added.</div>}
          {!online && <div className="banner bad">Saving needs internet. Connect, then try again.</div>}
        </div>
      </div>
      <div className="modal-ft">
        <span className="note grow">Page {position} of {total}</span>
        <button type="button" className="btn danger" disabled={busy} onClick={discard}>Discard page</button>
        <button type="button" className="btn" disabled={busy} onClick={next}>Skip for now</button>
        <button type="button" className="btn primary big" disabled={busy || !chosen.length || !editable || !online} onClick={save}>
          {busy ? 'Adding…' : `Add ${plural(chosen.length, 'tanod')}`}
        </button>
      </div>
    </>
  )
}
