import { supabase } from './supabase'

/** returned: sent back by the Liga Rep with a reason. accepted: the Liga Rep took it. resubmitted: the secretary fixed a return. */
export type ReviewAction = 'returned' | 'accepted' | 'resubmitted'

/** One step in a barangay's review history (database script 1400). The newest is its current state. */
export interface Review {
  id: number
  submission_id: number
  barangay_id: number
  action: ReviewAction
  reason: string
  author_name: string
  created_at: string
}

const COLS = 'id, submission_id, barangay_id, action, reason, author_name, created_at'

/** null when the reviews table isn't there yet (database script 1400 not run): the feature stays hidden. */
export async function fetchReviews(submissionId: number): Promise<Review[] | null> {
  const { data, error } = await supabase.from('barangay_reviews').select(COLS).eq('submission_id', submissionId).order('created_at').order('id')
  if (error) {
    if (/barangay_reviews|relation|schema cache/i.test(error.message)) return null
    throw error
  }
  return data as Review[]
}

export async function addReview(o: { submissionId: number; barangayId: number; action: ReviewAction; reason: string }): Promise<Review> {
  const { data, error } = await supabase
    .from('barangay_reviews')
    .insert({ submission_id: o.submissionId, barangay_id: o.barangayId, action: o.action, reason: o.reason })
    .select(COLS)
    .single()
  if (error) throw new Error(/reason|why/i.test(error.message) ? 'Say why the list is returned.' : 'That did not save. Check your internet and try again.')
  return data as Review
}

/** Live: a return shows on the secretary's screen, and a fix on the Liga Rep's, as soon as it is made. */
export function watchReviews(submissionId: number, onAdd: (r: Review) => void) {
  const channel = supabase
    .channel(`reviews-${submissionId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'barangay_reviews', filter: `submission_id=eq.${submissionId}` }, (p) => onAdd(p.new as Review))
    .subscribe()
  return () => void supabase.removeChannel(channel)
}
