import { useCallback, useEffect, useState } from 'react'

import { Box, Chip, PageHead } from '../components/ui'
import { plural } from '../domain/format'
import { ROLE_LABELS, fetchBarangays, fetchManagedProfiles, friendlyAuthError, supabase, type BarangayRow, type Profile, type Role } from '../lib/supabase'
import { useAuth } from '../state/auth'
import { toast } from '../state/toast'

const roleTone = (r: Role) => (r === 'pending' ? 'warn' : r === 'secretary' ? 'ok' : 'idle')

function AccountRow({ p, brgys, me, onSaved }: { p: Profile; brgys: BarangayRow[]; me: Profile; onSaved: () => void }) {
  const [barangay, setBarangay] = useState(p.barangay_id ? String(p.barangay_id) : '')
  const [busy, setBusy] = useState(false)
  const isMe = p.id === me.id
  // Reps manage secretaries in their own municipality; reps and admins are managed by an administrator.
  const canEdit = !isMe && (me.role === 'admin' || p.role === 'pending' || p.role === 'secretary')

  const save = async (patch: Partial<Pick<Profile, 'role' | 'barangay_id'>>, done: string) => {
    setBusy(true)
    const { data, error } = await supabase.from('profiles').update(patch).eq('id', p.id).select('id')
    setBusy(false)
    if (error) return toast(friendlyAuthError(error.message))
    // Row-level security skips rows silently instead of raising an error.
    if (!data?.length) return toast("You don't have permission to change this account.")
    toast(done)
    onSaved()
  }
  const brgyName = brgys.find((b) => String(b.id) === barangay)?.name

  return (
    <li className="acct">
      <div className="acct-who">
        <b>{p.full_name || 'No name given'}</b>
        {isMe && <span className="note"> (you)</span>}
        <div className="note">{[p.phone, p.role === 'pending' && p.barangay ? `asked for Brgy. ${p.barangay}` : null].filter(Boolean).join(' · ') || '—'}</div>
      </div>
      <Chip tone={roleTone(p.role)}>{ROLE_LABELS[p.role]}</Chip>
      {canEdit ? (
        <div className="acct-acts">
          <select aria-label={`Barangay for ${p.full_name}`} value={barangay} onChange={(e) => setBarangay(e.target.value)} disabled={busy}>
            <option value="">No barangay</option>
            {brgys.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {p.role === 'pending' ? (
            <button type="button" className="btn sm primary" disabled={busy || !barangay}
              onClick={() => save({ role: 'secretary', barangay_id: Number(barangay) }, `${p.full_name} can now encode tanods for Brgy. ${brgyName}.`)}>
              Approve
            </button>
          ) : (
            <>
              {String(p.barangay_id ?? '') !== barangay && (
                <button type="button" className="btn sm primary" disabled={busy || !barangay}
                  onClick={() => save({ barangay_id: Number(barangay) }, `${p.full_name} now handles Brgy. ${brgyName}.`)}>
                  Save barangay
                </button>
              )}
              <button type="button" className="btn sm danger" disabled={busy}
                onClick={() => save({ role: 'pending' }, `${p.full_name} no longer has access. You can approve them again later.`)}>
                Remove access
              </button>
            </>
          )}
        </div>
      ) : (
        <span className="note acct-acts">{p.barangay ? `Brgy. ${p.barangay}` : p.municipality ?? ''}</span>
      )}
    </li>
  )
}

export function AccountsPage() {
  const me = useAuth((s) => s.profile)
  const [rows, setRows] = useState<Profile[] | null>(null)
  const [brgys, setBrgys] = useState<BarangayRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    fetchManagedProfiles().then(
      (r) => {
        setRows(r)
        setError(null)
      },
      (e: Error) => setError(friendlyAuthError(e.message)),
    )
  }, [])

  useEffect(() => {
    load()
    if (me?.municipality_id) fetchBarangays(me.municipality_id).then(setBrgys, () => {})
  }, [load, me?.municipality_id])

  if (!me || (me.role !== 'rep' && me.role !== 'admin'))
    return <section className="page-section"><div className="banner">Only the municipal Tanod Rep and administrators can manage accounts.</div></section>

  const pending = rows?.filter((r) => r.role === 'pending') ?? []
  const active = rows?.filter((r) => r.role !== 'pending') ?? []
  const list = (ps: Profile[]) => (
    <ul className="accts">{ps.map((p) => <AccountRow key={p.id + p.role + p.barangay_id} p={p} brgys={brgys} me={me} onSaved={load} />)}</ul>
  )

  return (
    <section className="page-section">
      <PageHead
        title={`Accounts · ${me.municipality ?? 'All municipalities'}`}
        sub="Secretaries create their own accounts. Approve each one for their barangay; until then they can't see any tanods."
      >
        <button type="button" className="btn" onClick={load}>Refresh</button>
      </PageHead>
      {error && <div className="banner bad">{error}</div>}
      {rows === null && !error && <p className="note">Loading accounts…</p>}
      {rows && (
        <>
          <Box title="Waiting for approval" aside={<Chip tone={pending.length ? 'warn' : 'ok'}>{plural(pending.length, 'request')}</Chip>}>
            {pending.length ? list(pending) : <p className="empty">No one is waiting. New sign-ups appear here.</p>}
          </Box>
          <Box title="People with access" aside={<span className="note">{plural(active.length, 'account')}</span>}>
            {active.length ? list(active) : <p className="empty">No approved accounts yet.</p>}
          </Box>
        </>
      )}
    </section>
  )
}
