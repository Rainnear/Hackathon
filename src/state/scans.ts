import { useEffect } from 'react'
import { create } from 'zustand'

import { fetchScans, watchScans, type Scan } from '../lib/scans'
import { useStore } from './store'

interface ScanState {
  list: Scan[]
  /** Scan ids in the review pop-up, in order; null when it is closed. */
  queue: string[] | null
  index: number
  setList: (list: Scan[]) => void
  upsert: (scan: Scan) => void
  remove: (id: string) => void
  /** Opens the pop-up on the given scans (default: everything waiting), or adds them if it is already open. */
  review: (ids?: string[]) => void
  next: () => void
  close: () => void
}

/** ID and list scans waiting for the secretary: read (or failed to read) but not yet added as tanods. */
export const isWaiting = (s: Scan) => (s.kind === 'id' || s.kind === 'list') && (s.status === 'ready' || s.status === 'failed')

export const useScans = create<ScanState>()((set, get) => ({
  list: [],
  queue: null,
  index: 0,
  setList: (list) => set({ list }),
  upsert: (scan) =>
    set((st) => {
      const i = st.list.findIndex((s) => s.id === scan.id)
      if (scan.status === 'discarded') return { list: st.list.filter((s) => s.id !== scan.id) }
      if (i < 0) return { list: [...st.list, scan] }
      const list = [...st.list]
      list[i] = { ...list[i], ...scan }
      return { list }
    }),
  remove: (id) => set((st) => ({ list: st.list.filter((s) => s.id !== id) })),
  review: (ids) => {
    const st = get()
    const add = ids ?? st.list.filter(isWaiting).map((s) => s.id)
    if (!add.length) return
    if (st.queue) set({ queue: [...st.queue, ...add.filter((id) => !st.queue!.includes(id))] })
    else set({ queue: add, index: 0 })
  },
  next: () =>
    set((st) => {
      if (!st.queue || st.index + 1 >= st.queue.length) return { queue: null, index: 0 }
      return { index: st.index + 1 }
    }),
  close: () => set({ queue: null, index: 0 }),
}))

/** Keeps the scan list current for the open submission while the workspace is open. */
export function useScanSync() {
  const submissionId = useStore((s) => s.remote?.submissionId)
  useEffect(() => {
    if (!submissionId) return
    let alive = true
    const load = () =>
      fetchScans(submissionId).then(
        (list) => alive && useScans.getState().setList(list),
        () => {}, // offline: the list just stays as it was
      )
    void load()
    const stop = watchScans(submissionId, (scan, event) => {
      const st = useScans.getState()
      if (event === 'DELETE') return st.remove(scan.id)
      st.upsert(scan)
      // A scan sent from the phone opens the review pop-up by itself.
      if (scan.source === 'phone' && isWaiting(scan)) st.review([scan.id])
    })
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      stop()
      document.removeEventListener('visibilitychange', onVisible)
      useScans.setState({ list: [], queue: null, index: 0 })
    }
  }, [submissionId])
}
