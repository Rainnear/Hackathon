import { useState } from 'react'

import { fullName } from '../domain/format'
import { DEPARTURE_REASONS, type DepartureReason, type Tanod } from '../domain/types'
import { Modal } from './Modal'

/**
 * Removing someone who was on last year's list asks why, so the barangay keeps a record of who
 * resigned, was removed, passed away or moved. "Cancel" covers a removal by mistake.
 */
export function DepartureDialog({ tanod, year, onConfirm, onCancel }: { tanod: Tanod | null; year: number; onConfirm: (reason: DepartureReason, note: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState<DepartureReason | null>(null)
  const [note, setNote] = useState('')
  const close = () => {
    setReason(null)
    setNote('')
    onCancel()
  }
  const name = tanod ? fullName(tanod) || 'this tanod' : ''
  return (
    <Modal open={!!tanod} onClose={close} title={`Why is ${name} not continuing?`}>
      <div className="modal-bd stack">
        <p>{name} was a tanod last year. Choose the reason they are not on the CY {year} list. It is kept in the barangay's tanod records.</p>
        <fieldset className="plain reasons">
          <legend className="sr-only">Reason</legend>
          {DEPARTURE_REASONS.map((r) => (
            <label key={r.value} className={`reason ${reason === r.value ? 'on' : ''}`}>
              <input type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} />
              {r.label}
            </label>
          ))}
        </fieldset>
        <div className="field">
          <label htmlFor="dep_note">Note {reason === 'other' ? '(say what happened)' : '(optional)'}</label>
          <input id="dep_note" value={note} maxLength={500} autoComplete="off" placeholder="For example: moved to Iloilo City for work" onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <div className="modal-ft">
        <button type="button" className="btn" onClick={close}>Cancel, keep them</button>
        <button
          type="button"
          className="btn primary big"
          disabled={!reason || (reason === 'other' && !note.trim())}
          onClick={() => {
            onConfirm(reason!, note.trim())
            setReason(null)
            setNote('')
          }}
        >
          Remove from CY {year}
        </button>
      </div>
    </Modal>
  )
}
