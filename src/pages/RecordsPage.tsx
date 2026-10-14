import { useEffect, useMemo, useState } from 'react'

import { Box, Chip, PageHead } from '../components/ui'
import { fullName } from '../domain/format'
import { DEPARTURE_REASONS, type DepartureReason, type Position, type Suffix, type Tanod, type Tone } from '../domain/types'
import { fetchAllPages, supabase } from '../lib/supabase'
import { useEditable } from '../state/access'
import { useAuth } from '../state/auth'
import { navigate } from '../state/route'
import { useStore } from '../state/store'
import { toast } from '../state/toast'

interface HistoryRow {
  tanod_id: string
  last_name: string
  first_name: string
  middle_initial: string
  suffix: string
  barangay: string
  year: number
  position: Position
}
interface DepartureRow {
  tanod_id: string
  reason: DepartureReason
  note: string
  submissions: { year: number } | null
}

interface Person {
  id: string
  tanod: Tanod
  barangay: string
  years: number[]
  /** Year → why they did not continue that year. */
  left: Record<number, { reason: DepartureReason; note: string }>
}

const reasonLabel = (r: DepartureReason) => DEPARTURE_REASONS.find((x) => x.value === r)?.label ?? r

type View = 'all' | 'current' | 'left'

/** Everyone who has been a tanod in the barangay (or municipality), the years they served, and why they left. */
export function RecordsPage({ brgy }: { brgy: string | null }) {
  const sub = useStore((s) => s.sub)
  const remote = useStore((s) => s.remote)
  const addTanods = useStore((s) => s.addTanods)
  // "Renewed" = listed in the previous year Sakto has, even if years were skipped in between.
  const previousYear = useStore((s) => s.previous?.year)
  const solo = useAuth((s) => s.profile?.role === 'secretary')
  const editable = useEditable()
  const [history, setHistory] = useState<HistoryRow[] | null>(null)
  const [departures, setDepartures] = useState<DepartureRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [view, setView] = useState<View>('all')
  const scope = solo ? sub.brgys[0]?.name ?? null : brgy
  const scopeId = scope ? remote?.brgyIds[scope] : undefined

  useEffect(() => {
    if (!remote) return
    let alive = true
    const ids = scopeId ? [scopeId] : Object.values(remote.brgyIds)
    Promise.all([
      fetchAllPages<HistoryRow>((from, to) =>
        supabase
          .from('tanod_history')
          .select('tanod_id, last_name, first_name, middle_initial, suffix, barangay, year, position')
          .in('barangay_id', ids)
          .order('year')
          .order('tanod_id')
          .range(from, to) as unknown as PromiseLike<{ data: HistoryRow[] | null; error: Error | null }>,
      ),
      fetchAllPages<DepartureRow>((from, to) =>
        supabase
          .from('tanod_departures')
          .select('tanod_id, reason, note, submissions(year)')
          .in('barangay_id', ids)
          .order('tanod_id')
          .range(from, to) as unknown as PromiseLike<{ data: DepartureRow[] | null; error: Error | null }>,
      ),
    ]).then(
      ([h, d]) => {
        if (!alive) return
        setHistory(h)
        setDepartures(d)
        setError(null)
      },
      (e: Error) => alive && setError(navigator.onLine ? e.message : 'Tanod records need internet. Connect, then open this page again.'),
    )
    return () => {
      alive = false
    }
  }, [remote, scopeId])

  // Merge Supabase's history with this device's current list (which may have changes not uploaded yet).
  const people = useMemo(() => {
    const by = new Map<string, Person>()
    for (const h of history ?? []) {
      if (h.year === sub.year) continue // this year comes from the device below
      const p = by.get(h.tanod_id) ?? { id: h.tanod_id, tanod: blank(h.tanod_id), barangay: h.barangay, years: [], left: {} }
      p.years.push(h.year)
      p.barangay = h.barangay
      p.tanod = { id: h.tanod_id, last: h.last_name, first: h.first_name, mi: h.middle_initial, suffix: h.suffix as Suffix, pos: h.position, ids: 0 }
      by.set(h.tanod_id, p)
    }
    for (const b of sub.brgys) {
      if (scope && b.name !== scope) continue
      for (const t of b.tanods) {
        const p = by.get(t.id) ?? { id: t.id, tanod: t, barangay: b.name, years: [], left: {} }
        p.tanod = t
        p.barangay = b.name
        p.years.push(sub.year)
        by.set(t.id, p)
      }
      for (const d of b.left) {
        const p = by.get(d.tanodId)
        if (p) p.left[sub.year] = { reason: d.reason, note: d.note }
      }
    }
    for (const d of departures) {
      const y = d.submissions?.year
      const p = by.get(d.tanod_id)
      if (p && y && y !== sub.year) p.left[y] = { reason: d.reason, note: d.note }
    }
    return [...by.values()].filter((p) => fullName(p.tanod)).sort((a, b) => a.tanod.last.localeCompare(b.tanod.last) || a.tanod.first.localeCompare(b.tanod.first))
  }, [history, departures, sub, scope])

  const status = (p: Person): { tone: Tone; label: string; detail: string } => {
    const now = p.years.includes(sub.year)
    const before = p.years.filter((y) => y < sub.year)
    if (now)
      return previousYear && before.includes(previousYear)
        ? { tone: 'ok', label: 'Renewed', detail: `Also served in ${before.join(', ')}` }
        : before.length
          ? { tone: 'ok', label: 'Returned', detail: `Came back after ${before.at(-1)}` }
          : { tone: 'ok', label: 'New this year', detail: '' }
    const lastYear = Object.keys(p.left).map(Number).sort().at(-1)
    if (lastYear) {
      const l = p.left[lastYear]
      return { tone: 'bad', label: reasonLabel(l.reason), detail: `Not continued in CY ${lastYear}${l.note ? `: ${l.note}` : ''}` }
    }
    return { tone: 'idle', label: 'Not listed this year', detail: before.length ? `Last listed in CY ${before.at(-1)}` : '' }
  }

  const q = query.trim().toUpperCase()
  const shown = people.filter((p) => {
    const now = p.years.includes(sub.year)
    if (view === 'current' && !now) return false
    if (view === 'left' && now) return false
    return !q || fullName(p.tanod).includes(q) || p.barangay.toUpperCase().includes(q)
  })
  const current = people.filter((p) => p.years.includes(sub.year)).length

  const addBack = (p: Person) => {
    const b = sub.brgys.find((x) => x.name === p.barangay)
    if (!b) return
    if (b.tanods.length >= b.limit) return toast(`Brgy. ${b.name} already has ${b.limit} tanods, its limit.`)
    addTanods(b.name, [{ ...p.tanod, ids: 0 }])
    toast(`${fullName(p.tanod)} is back on the CY ${sub.year} list of Brgy. ${b.name}, with their past record kept.`)
  }

  return (
    <section className="page-section">
      <PageHead
        title={scope ? `Tanod records · Brgy. ${scope}` : `Tanod records · ${sub.municipality}`}
        sub="Everyone who has served as a tanod, the years they were listed, and why they did not continue. A tanod who returns keeps their record: use Add back instead of typing them again."
      >
        {!solo && (
          <select aria-label="Barangay" value={brgy ?? ''} onChange={(e) => navigate({ page: 'records', brgy: e.target.value || null }, { replace: true, scroll: false })}>
            <option value="">All barangays</option>
            {sub.brgys.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
          </select>
        )}
      </PageHead>
      {error && <div className="banner bad">{error}</div>}
      <Box
        title={history ? `${people.length === 1 ? '1 person' : `${people.length} people`} · ${current} on the CY ${sub.year} list` : 'Loading records…'}
        aside={
          <div className="seg" role="group" aria-label="Show">
            {([['all', 'Everyone'], ['current', `CY ${sub.year}`], ['left', 'Not continuing']] as const).map(([v, l]) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>{l}</button>
            ))}
          </div>
        }
      >
        <div className="box-bd pt0 search">
          <label htmlFor="rec_q" className="sr-only">Find a tanod</label>
          <input id="rec_q" type="search" placeholder="Find a name…" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
        </div>
        {history && (shown.length ? (
          <ul className="records">
            {shown.map((p) => {
              const st = status(p)
              const now = p.years.includes(sub.year)
              return (
                <li key={p.id}>
                  <div className="rec-who">
                    <b>{fullName(p.tanod)}</b>
                    {!scope && <span className="note">Brgy. {p.barangay}</span>}
                  </div>
                  <div className="rec-years" aria-label="Years listed">
                    {p.years.sort().map((y) => <span key={y} className={`yr ${y === sub.year ? 'now' : ''}`}>{y}</span>)}
                  </div>
                  <div className="rec-status">
                    <Chip tone={st.tone}>{st.label}</Chip>
                    {st.detail && <span className="note">{st.detail}</span>}
                  </div>
                  <div className="rec-act">
                    {!now && editable && <button type="button" className="btn sm" onClick={() => addBack(p)}>Add back to CY {sub.year}</button>}
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="empty big">{people.length ? 'No one matches.' : 'No tanods recorded yet.'}</p>
        ))}
      </Box>
    </section>
  )
}

const blank = (id: string): Tanod => ({ id, last: '', first: '', mi: '', suffix: '', pos: 'BARANGAY TANOD', ids: 0 })
