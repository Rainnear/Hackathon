import { useState } from 'react'

import { fullName } from '../domain/format'
import { DEPARTURE_REASONS, type DepartureReason, type Tanod } from '../domain/types'
import { Modal } from './Modal'

/** Why a row is deleted: a real departure (kept in the tanod records), or a row added by mistake. */
export type DeleteReason = DepartureReason | 'mistake'

/**
 * Deleting a tanod asks why first. Resigned, AWOL, contract ended and the rest are kept in the
 * barangay's tanod records; "Added by mistake" just removes the row and keeps no record.
 */
export function DepartureDialog({ tanod, year, onConfirm, onCancel }: { tanod: Tanod | null; year: number; onConfirm: (reason: DeleteReason, note: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState<DeleteReason | null>(null)
  const [note, setNote] = useState('')
  const close = () => {
    setReason(null)
    setNote('')
    onCancel()
  }
  const name = tanod ? fullName(tanod) || 'this tanod' : ''
  const choices: { value: DeleteReason; label: string }[] = [...DEPARTURE_REASONS, { value: 'mistake', label: 'Added by mistake' }]
  return (
    <Modal open={!!tanod} onClose={close} title={`Delete ${name}?`}>
      <div className="modal-bd stack">
        <p>Why is {name} no longer a tanod for CY {year}? The reason is kept in the barangay's tanod records.</p>
        <fieldset className="plain reasons">
          <legend className="sr-only">Reason</legend>
          {choices.map((r) => (
            <label key={r.value} className={`reason ${reason === r.value ? 'on' : ''}`}>
              <input type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} />
              {r.label}
            </label>
          ))}
        </fieldset>
        {reason === 'mistake' ? (
          <p className="note">The row is removed and no record is kept, for a duplicate or a wrong entry.</p>
        ) : (
          <div className="field">
            <label htmlFor="dep_note">Note {reason === 'other' ? '(say what happened)' : '(optional)'}</label>
            <input id="dep_note" value={note} maxLength={500} autoComplete="off" placeholder="For example: stopped reporting for duty in March" onChange={(e) => setNote(e.target.value)} />
          </div>
        )}
      </div>
      <div className="modal-ft">
        <button type="button" className="btn" onClick={close}>Cancel, keep them</button>
        <button
          type="button"
          className="btn danger big"
          disabled={!reason || (reason === 'other' && !note.trim())}
          onClick={() => {
            onConfirm(reason!, reason === 'mistake' ? '' : note.trim())
            setReason(null)
            setNote('')
          }}
        >
          Delete
        </button>
      </div>
    </Modal>
  )
}
