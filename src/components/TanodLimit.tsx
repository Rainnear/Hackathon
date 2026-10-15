import { useEffect, useState } from 'react'

import { formatDateTime } from '../domain/format'
import type { Barangay } from '../domain/types'
import { fetchLimitChanges, limitErrorMessage, setTanodLimit, type LimitChange } from '../lib/limits'
import { ROLE_LABELS } from '../lib/supabase'
import { useAuth } from '../state/auth'
import { useStore } from '../state/store'
import { useSync } from '../state/sync'
import { toast } from '../state/toast'
import { Modal } from './Modal'
import { Box } from './ui'

/**
 * The barangay's tanod limit and the log of every change to it. Only the provincial office can change
 * it (when an ordinance or amendment says so); everyone else sees the limit and its history.
 */
export function TanodLimit({ b, barangayId }: { b: Barangay; barangayId: number | undefined }) {
  const isAdmin = useAuth((s) => s.profile?.role === 'admin')
  const year = useStore((s) => s.remote?.year ?? null)
  const applyLimit = useStore((s) => s.applyLimit)
  const online = useSync((s) => s.online)
  const [log, setLog] = useState<LimitChange[] | null>(null)
  const [logError, setLogError] = useState('')
  const [open, setOpen] = useState(false)
  // Bumped after a change is saved, to read the log again.
  const [version, setVersion] = useState(0)

  // The component is keyed by barangay, so the log starts empty for each one.
  useEffect(() => {
    if (!online || !barangayId) return
    let alive = true
    fetchLimitChanges(barangayId).then(
      (rows) => {
        if (!alive) return
        setLog(rows)
        setLogError('')
      },
      (e) => alive && setLogError(limitErrorMessage(e)),
    )
    return () => {
      alive = false
    }
  }, [barangayId, online, version])

  return (
    <Box title="Tanod limit" tip={isAdmin ? 'Every change is logged with its reason, who made it and when.' : 'Set by the provincial office. It changes only when an ordinance or amendment says so.'}>
      <div className="box-bd stack">
        <div className="limit-now">
          <span>
            Brgy. {b.name} may list up to <b className="num">{b.limit}</b> tanods.
          </span>
          {isAdmin && (
            <button type="button" className="btn" disabled={!barangayId || !online} onClick={() => setOpen(true)}>
              Change the limit
            </button>
          )}
        </div>
        {isAdmin && !online && <p className="note">Changing the limit needs internet.</p>}

        <h4 className="limit-log-h">Changes to the limit</h4>
        {!online && !log ? (
          <p className="note">Connect to the internet to see past changes.</p>
        ) : logError ? (
          <p className="note bad">{logError}</p>
        ) : !log ? (
          <p className="note">Loading…</p>
        ) : !log.length ? (
          <p className="note">No changes yet. The limit is the one in the provincial list.</p>
        ) : (
          <ol className="limit-log">
            {log.map((c) => (
              <li key={c.id}>
                <span className="ll-change">
                  <b className="num">{c.old_limit}</b> → <b className="num">{c.new_limit}</b>
                  {c.year ? <span className="note"> · CY {c.year}</span> : null}
                </span>
                <span className="ll-why">{c.reason || <i>No reason recorded</i>}</span>
                <span className="note">
                  {c.changed_by_name || 'Someone'}
                  {c.changed_by_role ? `, ${ROLE_LABELS[c.changed_by_role]}` : ''} · {formatDateTime(c.created_at)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
      {/* Mounted only while open, so each opening starts fresh. */}
      {open && barangayId && (
        <LimitDialog
          brgy={b.name}
          barangayId={barangayId}
          limit={b.limit}
          listed={b.tanods.length}
          year={year}
          onClose={() => setOpen(false)}
          onSaved={(saved) => {
            applyLimit(b.name, saved)
            setOpen(false)
            setVersion((v) => v + 1)
          }}
        />
      )}
    </Box>
  )
}

/**
 * The provincial office's form for a new limit: the number and the ordinance or resolution behind it.
 * listed (how many tanods are on the list now) adds a warning when the new limit is lower.
 */
export function LimitDialog({ brgy, barangayId, limit, listed, year, onClose, onSaved }: {
  brgy: string
  barangayId: number
  limit: number
  listed?: number
  year: number | null
  onClose: () => void
  onSaved: (limit: number) => void
}) {
  const online = useSync((s) => s.online)
  const [value, setValue] = useState(String(limit))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const n = Number(value)
  const valid = Number.isInteger(n) && n >= 1 && n <= 200
  const over = valid && listed !== undefined ? listed - n : 0
  const canSave = valid && n !== limit && reason.trim().length >= 3 && online && !busy

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      const saved = await setTanodLimit(barangayId, n, reason.trim(), year)
      toast(`Brgy. ${brgy}'s limit is now ${saved}.`)
      onSaved(saved)
    } catch (e) {
      setError(limitErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Change the tanod limit of Brgy. ${brgy}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (canSave) void save()
        }}
      >
        <div className="modal-bd stack">
          <p className="note">
            Change it only when an ordinance, amendment or resolution says so. The change, your name and the reason are kept in a log that the
            barangay, the Liga Rep and the provincial office can see.
          </p>
          <div className="fields two">
            <div className="field">
              <span className="lbl-like">Current limit</span>
              <span className="limit-cur num">{limit}</span>
            </div>
            <div className="field">
              <label htmlFor="lim_new">New limit</label>
              <input id="lim_new" type="number" inputMode="numeric" min={1} max={200} step={1} value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="lim_why">Basis for the change</label>
            <input
              id="lim_why"
              value={reason}
              maxLength={300}
              autoComplete="off"
              placeholder="e.g. Provincial Ordinance No. 2026-15, Sec. 3"
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {!valid && value !== '' && <div className="banner bad">The limit must be a whole number from 1 to 200.</div>}
          {valid && n === limit && <p className="note">That is the current limit.</p>}
          {over > 0 && (
            <div className="banner bad">
              {listed} {listed === 1 ? 'tanod is' : 'tanods are'} listed now. With a limit of {n}, {over} {over === 1 ? 'name' : 'names'} would be over the
              limit and must be removed before the list can be submitted.
            </div>
          )}
          {!online && <div className="banner bad">Changing the limit needs internet. Connect, then try again.</div>}
          {error && <div className="banner bad">{error}</div>}
        </div>
        <div className="modal-ft">
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn primary big" disabled={!canSave}>
            {busy ? 'Saving…' : 'Save the new limit'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
