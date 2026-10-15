import { useEffect } from 'react'
import { create } from 'zustand'

import { fetchReviews, watchReviews, type Review } from '../lib/reviews'
import { useStore } from './store'

interface ReviewState {
  /** false until loaded, and while the database doesn't have the reviews table yet. */
  available: boolean
  list: Review[]
  add: (r: Review) => void
}

export const useReviews = create<ReviewState>()((set) => ({
  available: false,
  list: [],
  add: (r) => set((st) => (st.list.some((x) => x.id === r.id) ? st : { list: [...st.list, r] })),
}))

/** A barangay's history, oldest first. */
export const historyOf = (list: Review[], barangayId: number | undefined) => (barangayId ? list.filter((r) => r.barangay_id === barangayId) : [])
/** Where a barangay stands now: its newest step, or null if the Liga Rep hasn't reviewed it yet. */
export const latestOf = (list: Review[], barangayId: number | undefined) => historyOf(list, barangayId).at(-1) ?? null

/** Keeps the reviews of the open submission current while the workspace is open. */
export function useReviewSync() {
  const submissionId = useStore((s) => s.remote?.submissionId)
  useEffect(() => {
    if (!submissionId) return
    let alive = true
    const load = () =>
      fetchReviews(submissionId).then(
        (list) => alive && useReviews.setState(list ? { available: true, list } : { available: false, list: [] }),
        () => {}, // offline: keep what is shown
      )
    void load()
    const stop = watchReviews(submissionId, (r) => useReviews.getState().add(r))
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      stop()
      document.removeEventListener('visibilitychange', onVisible)
      useReviews.setState({ available: false, list: [] })
    }
  }, [submissionId])
}
