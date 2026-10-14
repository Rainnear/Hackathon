import { useState } from 'react'

import { Icon } from '../components/icons'
import { Box, Chip } from '../components/ui'
import { FILTERS, matchesFilter, type Analysis } from '../domain/analyze'
import { peso, plural } from '../domain/format'
import type { Filter, Issue, Tone } from '../domain/types'
import { useAuth } from '../state/auth'
import { href, navigate, type Route } from '../state/route'
import { useStore } from '../state/store'
import { ProvinceView } from './ProvinceView'

const TONES: { tone: Tone; label: string; filter: Filter }[] = [
  { tone: 'ok', label: 'Ready', filter: 'ready' },
  { tone: 'warn', label: 'Check names', filter: 'todo' },
  { tone: 'bad', label: 'Has problems', filter: 'todo' },
  { tone: 'idle', label: 'Not started', filter: 'empty' },
]

/** Whole pesos for the big tile: the payroll shows centavos, the dashboard only needs the size of it. */
const wholePeso = (n: number) => '₱' + Math.round(n).toLocaleString('en-PH')

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

/** Opens the barangay list already narrowed to one group, at its first barangay. */
function useOpenGroup(A: Analysis) {
  const brgys = useStore((s) => s.sub.brgys)
  const setFilter = useStore((s) => s.setFilter)
  return (f: Filter) => {
    setFilter(f)
    const first = brgys.find((b) => matchesFilter(f, A.status[b.name].tone))
    navigate({ page: 'barangays', brgy: first?.name ?? null })
  }
}

function Welcome({ A }: { A: Analysis }) {
  const sub = useStore((s) => s.sub)
  const lastBrgy = useStore((s) => s.lastBrgy)
  const name = useAuth((s) => s.profile?.full_name.trim().split(/\s+/)[0])
  const last = sub.brgys.find((b) => b.name === lastBrgy)
  const todo = sub.brgys.find((b) => A.status[b.name].tone !== 'ok')

  let action: { to: Route; label: string }
  if (last && A.status[last.name].tone !== 'ok') action = { to: { page: 'barangays', brgy: last.name }, label: `Continue with ${last.name}` }
  else if (todo) action = { to: { page: 'barangays', brgy: todo.name }, label: `Next: ${todo.name}` }
  else if (A.errs) action = { to: { page: 'review' }, label: 'Review what needs fixing' }
  else action = { to: { page: 'print', doc: 'masterlist' }, label: 'Print the documents' }

  return (
    <div className="welcome">
      <div>
        <h1>{greeting()}{name ? `, ${name}` : ''}</h1>
        <p className="sub">
          Here is where the {sub.municipality} tanod incentive for CY {sub.year} stands.
        </p>
      </div>
      <a className="btn primary big" href={href(action.to)}>
        {action.label} {Icon.next}
      </a>
    </div>
  )
}

function Kpi({ label, value, note, tone }: { label: string; value: string; note: string; tone?: 'ok' | 'bad' }) {
  return (
    <div className="kpi">
      <div className="kpi-l">{label}</div>
      <div className={`kpi-v ${tone ?? ''}`}>{value}</div>
      <div className="kpi-n">{note}</div>
    </div>
  )
}

function KpiRow({ A }: { A: Analysis }) {
  const sub = useStore((s) => s.sub)
  const notStarted = sub.brgys.filter((b) => !b.tanods.length).length
  return (
    <div className="kpis">
      <Kpi label="Barangays ready" value={`${A.ready} of ${sub.brgys.length}`} note={notStarted ? `${notStarted} not started yet` : 'Every barangay has started'} tone={A.ready === sub.brgys.length ? 'ok' : undefined} />
      <Kpi label="Tanods listed" value={A.totals.n.toLocaleString('en-PH')} note={`Up to ${A.totals.allowed.toLocaleString('en-PH')} allowed`} />
      <Kpi label="Total incentive" value={wholePeso(A.totals.amt)} note={`${A.totals.n} × ${peso(sub.amount)}`} />
      <Kpi label="Problems to fix" value={String(A.errs)} note={A.errs ? 'Fix these before printing' : 'Nothing blocks printing'} tone={A.errs ? 'bad' : 'ok'} />
    </div>
  )
}

/** Half-circle meter in one colour: how much of the municipality is ready. */
function ProgressGauge({ A }: { A: Analysis }) {
  const total = useStore((s) => s.sub.brgys.length)
  const pct = total ? Math.round((A.ready / total) * 100) : 0
  const arc = 'M 20 100 A 80 80 0 0 1 180 100'
  return (
    <Box title="Overall progress" className="dash-card">
      <div className="box-bd gauge-wrap">
        <div className="gauge" role="img" aria-label={`${pct} percent of barangays are ready`}>
          <svg viewBox="0 0 200 112">
            <path d={arc} className="g-track" pathLength={100} />
            {pct > 0 && <path d={arc} className={`g-fill ${pct === 100 ? 'ok' : ''}`} pathLength={100} strokeDasharray={`${pct} 100`} />}
          </svg>
          <div className="gauge-v">{pct}%</div>
        </div>
        <p className="gauge-cap">
          <b>{A.ready} of {total}</b> barangays are complete and ready to print
        </p>
      </div>
    </Box>
  )
}

/** Ready / check / problems / not started, as a donut with a clickable legend that doubles as the table. */
function StatusDonut({ A }: { A: Analysis }) {
  const brgys = useStore((s) => s.sub.brgys)
  const openGroup = useOpenGroup(A)
  const total = brgys.length
  const rows = TONES.map((t) => ({ ...t, n: brgys.filter((b) => A.status[b.name].tone === t.tone).length }))
  const nonzero = rows.filter((r) => r.n > 0)
  const gap = nonzero.length > 1 ? 1.2 : 0
  const parts = nonzero.map((r, i) => ({
    ...r,
    len: (r.n / total) * 100,
    start: nonzero.slice(0, i).reduce((a, x) => a + (x.n / total) * 100, 0),
  }))
  return (
    <Box title="Barangays by status" className="dash-card">
      <div className="box-bd donut-wrap">
        <div className="donut">
          <svg viewBox="0 0 160 160" role="img" aria-label={rows.map((r) => `${r.label}: ${r.n}`).join(', ')}>
            <g transform="rotate(-90 80 80)">
              {parts.map((r) => (
                <circle key={r.tone} className={`d-seg ${r.tone}`} cx="80" cy="80" r="60" pathLength={100}
                  strokeDasharray={`${Math.max(r.len - gap, 0.01)} 100`} strokeDashoffset={-r.start}>
                  <title>{`${r.label}: ${plural(r.n, 'barangay')}`}</title>
                </circle>
              ))}
            </g>
          </svg>
          <div className="donut-c">
            <b>{total}</b>
            <span>barangays</span>
          </div>
        </div>
        <ul className="legend">
          {rows.map((r) => (
            <li key={r.tone}>
              <button type="button" onClick={() => openGroup(r.filter)} disabled={!r.n}>
                <i className={`sw ${r.tone}`} />
                <span className="grow">{r.label}</span>
                <b>{r.n}</b>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Box>
  )
}

function issueLink(i: Issue): Route {
  if (i.brgy) return { page: 'barangays', brgy: i.brgy }
  return i.kind === 'setup' ? { page: 'setup' } : { page: 'review' }
}

function Attention({ A }: { A: Analysis }) {
  const list = [...A.issues].sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1))
  const shown = list.slice(0, 5)
  return (
    <Box title="Needs your attention" aside={list.length > 0 && <Chip tone={A.errs ? 'bad' : 'warn'}>{plural(list.length, 'item')}</Chip>} className="dash-card">
      {shown.length ? (
        <>
          <ul className="todo">
            {shown.map((i, ix) => (
              <li key={ix} className={i.level}>
                <span className="sev" aria-hidden="true" />
                <div className="grow">
                  <div className="t">{i.msg}</div>
                  <div className="w">{i.brgy ? `Brgy. ${i.brgy}` : 'Whole municipality'} · {i.level === 'error' ? 'Must be fixed' : 'Please check'}</div>
                </div>
                <a className="btn sm" href={href(issueLink(i))}>Open</a>
              </li>
            ))}
          </ul>
          {list.length > shown.length && (
            <div className="box-ft">
              <a className="linkbtn" href={href({ page: 'review' })}>See all {list.length} in Review</a>
            </div>
          )}
        </>
      ) : (
        <p className="empty big">Nothing needs fixing. The set is ready to print.</p>
      )}
    </Box>
  )
}

function Meter({ label, n, of, unit }: { label: string; n: number; of: number; unit: string }) {
  const pct = of ? Math.min(100, (n / of) * 100) : 0
  return (
    <div className="meter">
      <div className="meter-t">
        <span>{label}</span>
        <b>{n} of {plural(of, unit)}</b>
      </div>
      <span className="bar big" role="img" aria-label={`${n} of ${of}`}>
        <i className={n >= of && of > 0 ? 'ok' : ''} style={{ width: `${pct}%` }} />
      </span>
    </div>
  )
}

function DocsCard({ A }: { A: Analysis }) {
  const brgys = useStore((s) => s.sub.brgys)
  const signed = brgys.reduce((a, b) => a + b.tanods.filter((t) => (t.ids || 0) >= 3).length, 0)
  return (
    <Box title="Documents received" className="dash-card">
      <div className="box-bd meters">
        <Meter label="Barangay Certification" n={brgys.filter((b) => b.docs.cert).length} of={brgys.length} unit="barangay" />
        <Meter label="Proof of designation" n={brgys.filter((b) => b.docs.designation).length} of={brgys.length} unit="barangay" />
        {A.totals.n ? (
          <Meter label="ID photocopies with 3 signatures" n={signed} of={A.totals.n} unit="tanod" />
        ) : (
          <p className="note">ID signatures show here once tanods are listed.</p>
        )}
      </div>
    </Box>
  )
}

/** Every barangay as a row: tanods listed against its limit. Tap a row to open it. */
function BarangayBoard({ A }: { A: Analysis }) {
  const brgys = useStore((s) => s.sub.brgys)
  const [filter, setFilter] = useState<Filter>('all')
  const shown = brgys.filter((b) => matchesFilter(filter, A.status[b.name].tone))
  return (
    <Box
      title="Tanods listed per barangay"
      aside={
        <div className="seg" role="group" aria-label="Show barangays">
          {FILTERS.map((f) => (
            <button key={f.value} type="button" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
              {f.label}
            </button>
          ))}
        </div>
      }
      className="dash-card board-card"
    >
      {shown.length ? (
        <ul className="board">
          {shown.map((b) => {
            const n = b.tanods.length
            const st = A.status[b.name]
            const over = n - b.limit
            return (
              <li key={b.name}>
                <a href={href({ page: 'barangays', brgy: b.name })}>
                  <span className="bd-name">{b.name}</span>
                  <Chip tone={st.tone}>{st.label}</Chip>
                  <span className="bar big">
                    <i className={over > 0 ? 'over' : st.tone === 'ok' ? 'ok' : ''} style={{ width: `${Math.min(100, (n / b.limit) * 100)}%` }} />
                  </span>
                  <span className={`bd-n ${over > 0 ? 'bad' : ''}`}>
                    {n} of {b.limit}
                    {over > 0 && <small> · {over} over</small>}
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="empty big">No barangays in this group.</p>
      )}
    </Box>
  )
}

/** Administrators switch between the work on this device and the whole province. */
function ViewSwitch({ view }: { view: 'local' | 'province' }) {
  const municipality = useStore((s) => s.sub.municipality)
  return (
    <div className="seg view-switch" role="group" aria-label="Dashboard view">
      <a href={href({ page: 'dashboard' })} aria-pressed={view === 'local'}>{municipality} · this device</a>
      <a href={href({ page: 'dashboard', view: 'province' })} aria-pressed={view === 'province'}>All of Iloilo</a>
    </div>
  )
}

export function DashboardPage({ A, view }: { A: Analysis; view?: 'province' }) {
  const isAdmin = useAuth((s) => s.profile?.role === 'admin')
  if (isAdmin && view === 'province')
    return (
      <section className="page-section dash">
        <ViewSwitch view="province" />
        <div className="welcome">
          <div>
            <h1>All of Iloilo</h1>
            <p className="sub">Every municipality and barangay, who has signed up, and the problems people have reported.</p>
          </div>
        </div>
        <ProvinceView />
      </section>
    )
  return (
    <section className="page-section dash">
      {isAdmin && <ViewSwitch view="local" />}
      <Welcome A={A} />
      <KpiRow A={A} />
      <div className="dash-grid">
        <ProgressGauge A={A} />
        <StatusDonut A={A} />
        <Attention A={A} />
        <DocsCard A={A} />
        <BarangayBoard A={A} />
      </div>
    </section>
  )
}
