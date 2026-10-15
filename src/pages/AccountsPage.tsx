import { useCallback, useEffect, useState } from 'react'

import { Box, Chip, PageHead } from '../components/ui'
import { plural } from '../domain/format'
import {
  ROLE_LABELS, fetchBarangays, fetchManagedProfiles, fetchMunicipalities, friendlyAuthError, supabase,
  type BarangayRow, type MunicipalityRow, type Profile, type Role,
} from '../lib/supabase'
import { useAuth } from '../state/auth'
import { toast } from '../state/toast'

const roleTone = (r: Role) => (r === 'pending' ? 'warn' : r === 'secretary' ? 'ok' : 'idle')

function AccountRow({ p, brgys, munis, me, onSaved }: { p: Profile; brgys: BarangayRow[]; munis: MunicipalityRow[]; me: Profile; onSaved: () => void }) {
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
        <div className="note">
          {[
            p.phone,
            p.role === 'pending' && p.requested_role === 'rep' ? `asks to be Liga Rep of ${p.municipality ?? 'a municipality'}` : p.role === 'pending' && p.barangay ? `asked for Brgy. ${p.barangay}` : null,
            me.role === 'admin' && p.role !== 'pending' ? [p.barangay && `Brgy. ${p.barangay}`, p.municipality].filter(Boolean).join(', ') : null,
          ]
            .filter(Boolean)
            .join(' · ') || '—'}
        </div>
      </div>
      <Chip tone={roleTone(p.role)}>{ROLE_LABELS[p.role]}</Chip>
      {me.role === 'admin' && !isMe ? (
        <AdminAccountRow p={p} munis={munis} onSaved={onSaved} />
      ) : canEdit ? (
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

/** Barangays per municipality, fetched once each, for the provincial office's account editor. */
const brgyCache = new Map<number, Promise<BarangayRow[]>>()
const barangaysOf = (id: number) => {
  if (!brgyCache.has(id)) brgyCache.set(id, fetchBarangays(id).catch((e) => (brgyCache.delete(id), Promise.reject(e))))
  return brgyCache.get(id)!
}

const ROLE_CHOICES: { value: Role; label: string; hint: string }[] = [
  { value: 'secretary', label: ROLE_LABELS.secretary, hint: 'Encodes one barangay' },
  { value: 'rep', label: ROLE_LABELS.rep, hint: 'The whole municipality and its barangays' },
  { value: 'admin', label: ROLE_LABELS.admin, hint: 'All of Iloilo, read-only' },
  { value: 'pending', label: 'No access', hint: 'Signed up, not approved' },
]

/** The provincial office: any account's role, municipality and barangay. */
function AdminAccountRow({ p, munis, onSaved }: { p: Profile; munis: MunicipalityRow[]; onSaved: () => void }) {
  // A sign-up starts on what they asked to be, so approving is one click.
  const [role, setRole] = useState<Role>(p.role === 'pending' ? (p.requested_role ?? 'secretary') : p.role)
  const [muni, setMuni] = useState(p.municipality_id ? String(p.municipality_id) : '')
  const [brgy, setBrgy] = useState(p.barangay_id ? String(p.barangay_id) : '')
  const [brgys, setBrgys] = useState<{ muni: string; list: BarangayRow[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const needsMuni = role === 'secretary' || role === 'rep'
  const needsBrgy = role === 'secretary'

  useEffect(() => {
    if (!needsBrgy || !muni) return
    let alive = true
    barangaysOf(Number(muni)).then((list) => alive && setBrgys({ muni, list }), () => {})
    return () => {
      alive = false
    }
  }, [needsBrgy, muni])

  // What the account becomes. Pending keeps the barangay they asked for, so they can be approved later.
  const next = {
    role,
    municipality_id: role === 'admin' ? null : muni ? Number(muni) : null,
    barangay_id: role === 'secretary' || role === 'pending' ? (brgy ? Number(brgy) : null) : null,
  }
  const changed = next.role !== p.role || next.municipality_id !== p.municipality_id || next.barangay_id !== p.barangay_id
  const ready = (!needsMuni || !!muni) && (!needsBrgy || !!brgy)
  const muniName = munis.find((m) => String(m.id) === muni)?.name
  const brgyName = brgys?.list.find((b) => String(b.id) === brgy)?.name

  const save = async () => {
    setBusy(true)
    const { data, error } = await supabase.from('profiles').update(next).eq('id', p.id).select('id')
    setBusy(false)
    if (error) return toast(friendlyAuthError(error.message))
    if (!data?.length) return toast("You don't have permission to change this account.")
    const who = p.full_name || 'The account'
    toast(
      role === 'rep' ? `${who} is now the Liga Rep of ${muniName}.`
        : role === 'secretary' ? `${who} now encodes for Brgy. ${brgyName}, ${muniName}.`
          : role === 'admin' ? `${who} is now a provincial administrator.`
            : `${who} no longer has access.`,
    )
    onSaved()
  }

  return (
    <div className="acct-acts admin-acts">
      <select aria-label={`Role for ${p.full_name}`} value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={busy}>
        {ROLE_CHOICES.map((r) => <option key={r.value} value={r.value}>{r.label} · {r.hint}</option>)}
      </select>
      {(needsMuni || role === 'pending') && (
        <select aria-label={`Municipality for ${p.full_name}`} value={muni} onChange={(e) => { setMuni(e.target.value); setBrgy('') }} disabled={busy}>
          <option value="">Municipality…</option>
          {munis.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      )}
      {needsBrgy && (
        <select aria-label={`Barangay for ${p.full_name}`} value={brgy} onChange={(e) => setBrgy(e.target.value)} disabled={busy || !muni || brgys?.muni !== muni}>
          <option value="">Barangay…</option>
          {brgys?.muni === muni && brgys.list.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      )}
      {changed && (
        <button type="button" className="btn sm primary" disabled={busy || !ready} onClick={save}>
          {busy ? 'Saving…' : p.role === 'pending' && role !== 'pending' ? 'Approve' : 'Save'}
        </button>
      )}
    </div>
  )
}

export function AccountsPage() {
  const me = useAuth((s) => s.profile)
  const [rows, setRows] = useState<Profile[] | null>(null)
  const [brgys, setBrgys] = useState<BarangayRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [munis, setMunis] = useState<MunicipalityRow[]>([])
  const [query, setQuery] = useState('')

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
    if (me?.role === 'admin') fetchMunicipalities().then(setMunis, () => {})
  }, [load, me?.municipality_id, me?.role])

  if (!me || (me.role !== 'rep' && me.role !== 'admin'))
    return <section className="page-section"><div className="banner">Only the municipal Liga Rep and administrators can manage accounts.</div></section>

  const q = query.trim().toLowerCase()
  const found = (rows ?? [])
    .filter((r) => me.role === 'admin' || !(r.role === 'pending' && r.requested_role === 'rep'))
    .filter((r) => !q || [r.full_name, r.municipality, r.barangay, ROLE_LABELS[r.role]].some((x) => x?.toLowerCase().includes(q)))
  const pending = found.filter((r) => r.role === 'pending')
  const active = found.filter((r) => r.role !== 'pending')
  const list = (ps: Profile[]) => (
    <ul className="accts">
      {ps.map((p) => <AccountRow key={p.id + p.role + p.barangay_id + p.municipality_id} p={p} brgys={brgys} munis={munis} me={me} onSaved={load} />)}
    </ul>
  )

  return (
    <section className="page-section">
      <PageHead
        title={`Accounts · ${me.municipality ?? 'All municipalities'}`}
        sub={
          me.role === 'admin'
            ? 'Set each account\'s role. Barangay secretary: one barangay. Liga Rep: a whole municipality and its barangays. Provincial administrator: all of Iloilo, read-only. You cannot change your own account.'
            : "Secretaries create their own accounts. Approve each one for their barangay; until then they can't see any tanods."
        }
      >
        <div className="row">
          {me.role === 'admin' && (
            <input type="search" className="acct-q" placeholder="Find a name or place…" aria-label="Find an account" value={query} onChange={(e) => setQuery(e.target.value)} />
          )}
          <button type="button" className="btn" onClick={load}>Refresh</button>
        </div>
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
