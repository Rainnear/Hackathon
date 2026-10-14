import { useCallback, useEffect, useMemo, useState } from 'react'

import { Box, Chip } from '../components/ui'
import { formatDateTime, plural } from '../domain/format'
import {
  fetchAllBarangays, fetchManagedProfiles, fetchMunicipalities, fetchSupportRequests, friendlyAuthError, setSupportStatus,
  type BarangayRow, type MunicipalityRow, type Profile, type SupportRequest,
} from '../lib/supabase'
import { toast } from '../state/toast'

interface Data {
  munis: MunicipalityRow[]
  brgys: BarangayRow[]
  people: Profile[]
  reports: SupportRequest[]
}

const n = (x: number) => x.toLocaleString('en-PH')
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function Reports({ reports, onChanged }: { reports: SupportRequest[]; onChanged: () => void }) {
  const [showSolved, setShowSolved] = useState(false)
  const [busy, setBusy] = useState<number | null>(null)
  const open = reports.filter((r) => r.status === 'open')
  const shown = showSolved ? reports : open
  const flip = async (r: SupportRequest) => {
    setBusy(r.id)
    try {
      await setSupportStatus(r.id, r.status === 'open' ? 'solved' : 'open')
      onChanged()
    } catch (e) {
      toast(friendlyAuthError((e as Error).message))
    } finally {
      setBusy(null)
    }
  }
  return (
    <Box
      title="Problem reports"
      aside={
        <div className="row">
          <Chip tone={open.length ? 'warn' : 'ok'}>{open.length ? `${open.length} open` : 'None open'}</Chip>
          <button type="button" className="btn sm" onClick={() => setShowSolved((v) => !v)}>{showSolved ? 'Hide solved' : 'Show solved'}</button>
        </div>
      }
      className="dash-card"
    >
      {shown.length ? (
        <ul className="reports">
          {shown.map((r) => {
            const who = r.sender
            const where = [who?.barangay && `Brgy. ${who.barangay}`, who?.municipality].filter(Boolean).join(', ')
            const phone = who?.phone.replace(/[^\d+]/g, '')
            return (
              <li key={r.id}>
                <div className="row">
                  <Chip tone={r.status === 'solved' ? 'ok' : 'warn'}>{r.status === 'solved' ? 'Solved' : 'Open'}</Chip>
                  <b>{who?.full_name || 'Unknown sender'}</b>
                  <span className="note">{[where, formatDateTime(r.created_at)].filter(Boolean).join(' · ')}</span>
                </div>
                <p className="report-msg">{r.message}</p>
                <details className="tech">
                  <summary>Technical details</summary>
                  <dl>
                    {Object.entries(r.details).map(([k, v]) => (
                      <div key={k}><dt>{k.replace(/_/g, ' ')}</dt><dd>{v === null || v === '' ? '—' : String(v)}</dd></div>
                    ))}
                  </dl>
                </details>
                <div className="row">
                  {phone && <a className="btn sm" href={`tel:${phone}`}>Call {who?.phone}</a>}
                  <button type="button" className={`btn sm ${r.status === 'open' ? 'primary' : ''}`} disabled={busy === r.id} onClick={() => flip(r)}>
                    {r.status === 'open' ? 'Mark solved' : 'Reopen'}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="empty big">{reports.length ? 'Every report is solved.' : 'No one has reported a problem yet.'}</p>
      )}
    </Box>
  )
}

export function ProvinceView() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const load = useCallback(() => {
    Promise.all([fetchMunicipalities(), fetchAllBarangays(), fetchManagedProfiles(), fetchSupportRequests()]).then(
      ([munis, brgys, people, reports]) => {
        setData({ munis, brgys, people, reports })
        setError(null)
      },
      (e: Error) => setError(friendlyAuthError(e.message)),
    )
  }, [])
  useEffect(load, [load])

  const rows = useMemo(() => {
    if (!data) return []
    return data.munis.map((m) => {
      const brgys = data.brgys.filter((b) => b.municipality_id === m.id)
      const people = data.people.filter((p) => p.municipality_id === m.id)
      const secretaries = people.filter((p) => p.role === 'secretary')
      const covered = new Set(secretaries.map((p) => p.barangay_id))
      return {
        m,
        brgys,
        allowed: brgys.reduce((a, b) => a + b.tanod_limit, 0),
        reps: people.filter((p) => p.role === 'rep'),
        secretaries,
        covered: brgys.filter((b) => covered.has(b.id)).length,
        pending: people.filter((p) => p.role === 'pending').length,
      }
    })
  }, [data])

  if (error)
    return (
      <div className="banner bad">
        {error} <button type="button" className="btn sm" onClick={load}>Try again</button>
      </div>
    )
  if (!data) return <p className="empty big">Loading all of Iloilo…</p>

  const q = fold(query.trim())
  const shown = rows
    .map((r) => ({ ...r, hits: q ? r.brgys.filter((b) => fold(b.name).includes(q)) : [] }))
    .filter((r) => !q || fold(r.m.name).includes(q) || r.hits.length)
  const approved = data.people.filter((p) => p.role !== 'pending').length
  const waiting = data.people.length - approved
  const withRep = rows.filter((r) => r.reps.length).length
  const covered = rows.reduce((a, r) => a + r.covered, 0)

  const toggle = (id: number) =>
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="kpi-l">Municipalities</div><div className="kpi-v">{n(data.munis.length)}</div><div className="kpi-n">{withRep} with a Tanod Rep</div></div>
        <div className="kpi"><div className="kpi-l">Barangays</div><div className="kpi-v">{n(data.brgys.length)}</div><div className="kpi-n">{n(covered)} with a secretary</div></div>
        <div className="kpi"><div className="kpi-l">Tanods allowed</div><div className="kpi-v">{n(rows.reduce((a, r) => a + r.allowed, 0))}</div><div className="kpi-n">From the provincial list</div></div>
        <div className="kpi"><div className="kpi-l">Accounts</div><div className="kpi-v">{n(approved)}</div><div className={`kpi-n ${waiting ? 'warn' : ''}`}>{waiting ? `${waiting} waiting for approval` : 'No one waiting'}</div></div>
      </div>

      <Reports reports={data.reports} onChanged={load} />

      <Box
        title="Municipalities and barangays"
        aside={<button type="button" className="btn sm" onClick={load}>Refresh</button>}
        className="dash-card"
      >
        <div className="box-bd pt0 search">
          <label htmlFor="prov_q" className="sr-only">Find a municipality or barangay</label>
          <input id="prov_q" type="search" placeholder="Find a municipality or barangay…" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
          <p className="note">Tanod lists are still saved on each device, so the number of tanods encoded will show here once they are stored in Supabase.</p>
        </div>
        {shown.length ? (
          <ul className="munis">
            {shown.map((r) => {
              const isOpen = expanded.has(r.m.id) || r.hits.length > 0
              const list = r.hits.length ? r.hits : r.brgys
              return (
                <li key={r.m.id} className={isOpen ? 'open' : ''}>
                  <button type="button" className="muni" aria-expanded={isOpen} onClick={() => toggle(r.m.id)}>
                    <span className="mu-name">{r.m.name}</span>
                    <span className="mu-c"><b>{r.brgys.length}</b> barangays · <b>{n(r.allowed)}</b> tanods allowed</span>
                    <span className="mu-rep">{r.reps.length ? `Rep: ${r.reps.map((p) => p.full_name || 'No name').join(', ')}` : <span className="note">No Tanod Rep yet</span>}</span>
                    <span className="mu-cov">
                      <span className="bar big"><i className={r.covered === r.brgys.length && r.brgys.length ? 'ok' : ''} style={{ width: `${r.brgys.length ? (r.covered / r.brgys.length) * 100 : 0}%` }} /></span>
                      <span className="note">{r.covered} of {r.brgys.length} have a secretary</span>
                    </span>
                    {r.pending > 0 && <Chip tone="warn">{r.pending} waiting</Chip>}
                  </button>
                  {isOpen && (
                    <ul className="mu-brgys">
                      {list.map((b) => {
                        const secs = r.secretaries.filter((p) => p.barangay_id === b.id)
                        return (
                          <li key={b.id}>
                            <span className="bd-name">{b.name}</span>
                            <span className="note">Up to {plural(b.tanod_limit, 'tanod')}</span>
                            <span className={secs.length ? '' : 'note'}>{secs.length ? secs.map((p) => p.full_name || 'No name').join(', ') : 'No secretary yet'}</span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="empty big">Nothing matches “{query}”.</p>
        )}
      </Box>
    </>
  )
}
