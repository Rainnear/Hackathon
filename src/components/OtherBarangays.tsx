import { useEffect, useState } from 'react'

import { plural } from '../domain/format'
import type { Tone } from '../domain/types'
import { supabase } from '../lib/supabase'
import { useStore } from '../state/store'
import { Box } from './ui'
import { Chip } from './ui'

interface Progress {
  barangay_id: number
  barangay: string
  tanod_limit: number
  listed: number
  ids_complete: number
  certification: boolean
  designation: boolean
}

const statusOf = (r: Progress): { tone: Tone; label: string } => {
  if (r.listed > 0 && r.listed <= r.tanod_limit && r.ids_complete === r.listed && r.certification && r.designation) return { tone: 'ok', label: 'Complete' }
  if (!r.listed && !r.certification && !r.designation) return { tone: 'idle', label: 'Not started' }
  return { tone: 'warn', label: 'In progress' }
}

const Mark = ({ ok, label }: { ok: boolean; label: string }) => (
  <span className={`mark ${ok ? 'ok' : ''}`}>
    <span aria-hidden="true">{ok ? '✓' : '–'}</span> {label}
  </span>
)

/**
 * Read-only: how every barangay in the municipality is doing, as counts only (no names), so a
 * secretary can see where they stand among the others.
 */
export function OtherBarangays() {
  const remote = useStore((s) => s.remote)
  const municipality = useStore((s) => s.sub.municipality)
  const [rows, setRows] = useState<Progress[] | null>(null)
  const [offline, setOffline] = useState(false)
  const sid = remote?.submissionId
  const mine = remote?.barangayId

  useEffect(() => {
    if (!sid) return
    let alive = true
    const load = () =>
      supabase.rpc('municipality_progress', { p_submission: sid }).then(({ data, error }) => {
        if (!alive) return
        if (error) setOffline(true)
        else {
          setRows(data as Progress[])
          setOffline(false)
        }
      })
    void load()
    const iv = setInterval(load, 60_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [sid])

  if (!rows) return offline ? <div className="banner">Connect to the internet to see how the other barangays are doing.</div> : null
  const complete = rows.filter((r) => statusOf(r).tone === 'ok').length
  const notStarted = rows.filter((r) => statusOf(r).tone === 'idle').length
  // Your own barangay first, then the rest in the usual order.
  const ordered = [...rows.filter((r) => r.barangay_id === mine), ...rows.filter((r) => r.barangay_id !== mine)]

  return (
    <Box
      title={`All barangays in ${municipality}`}
      aside={<span className="note">{complete} of {rows.length} complete · {notStarted} not started</span>}
      className="dash-card"
    >
      <p className="box-sub note">
        The whole municipality is submitted together, so every barangay has to be complete. Only counts are shown here, not names.
        {offline && ' Showing the last numbers; you are offline.'}
      </p>
      <ul className="others">
        {ordered.map((r) => {
          const st = statusOf(r)
          return (
            <li key={r.barangay_id} className={r.barangay_id === mine ? 'mine' : ''}>
              <span className="o-name">
                {r.barangay}
                {r.barangay_id === mine && <small> · your barangay</small>}
              </span>
              <Chip tone={st.tone}>{st.label}</Chip>
              <span className="o-bar">
                <span className="bar big">
                  <i className={r.listed > r.tanod_limit ? 'over' : st.tone === 'ok' ? 'ok' : ''} style={{ width: `${Math.min(100, (r.listed / r.tanod_limit) * 100)}%` }} />
                </span>
                <span className="note">{r.listed} of {plural(r.tanod_limit, 'tanod')}</span>
              </span>
              <span className="o-marks">
                <Mark ok={r.listed > 0 && r.ids_complete === r.listed} label={r.listed ? `IDs ${r.ids_complete}/${r.listed}` : 'IDs'} />
                <Mark ok={r.certification} label="Certification" />
                <Mark ok={r.designation} label="Designation" />
              </span>
            </li>
          )
        })}
      </ul>
    </Box>
  )
}
