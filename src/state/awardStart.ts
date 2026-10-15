import { useEffect, useState } from 'react'

import { supabase } from '../lib/supabase'
import { useStore } from './store'
import { useSync } from './sync'

/**
 * For a barangay secretary: how many tanods the barangays before theirs have listed, so their part of
 * the payroll carries the municipal award numbers. Read as counts only (municipality_progress), never
 * the other barangays' names. null while offline or not yet known.
 */
export function useAwardStart(on: boolean): number | null {
  const sid = useStore((s) => s.remote?.submissionId)
  const bid = useStore((s) => s.remote?.barangayId)
  const online = useSync((s) => s.online)
  const [got, setGot] = useState<{ key: string; start: number } | null>(null)
  const key = `${sid}:${bid}`
  useEffect(() => {
    if (!on || !sid || !bid || !online) return
    let live = true
    void supabase.rpc('municipality_progress', { p_submission: sid }).then(({ data, error }) => {
      if (!live || error || !Array.isArray(data)) return
      const rows = data as { barangay_id: number; listed: number }[]
      const at = rows.findIndex((r) => Number(r.barangay_id) === bid)
      if (at >= 0) setGot({ key, start: rows.slice(0, at).reduce((a, r) => a + Number(r.listed), 0) })
    })
    return () => {
      live = false
    }
  }, [on, sid, bid, online, key])
  return got?.key === key ? got.start : null
}
