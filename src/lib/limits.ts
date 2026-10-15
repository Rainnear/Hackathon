import { supabase, type Role } from './supabase'

/** One amendment of a barangay's tanod limit, as logged by Supabase. */
export interface LimitChange {
  id: number
  year: number | null
  old_limit: number
  new_limit: number
  reason: string
  changed_by_name: string
  changed_by_role: Role | null
  created_at: string
}

/**
 * Saves a new limit with the reason for it (the provincial office only). Needs internet: the change is
 * official and logged. year is the year the amendment is for, if known.
 */
export async function setTanodLimit(barangayId: number, limit: number, reason: string, year: number | null): Promise<number> {
  const { data, error } = await supabase.rpc('set_tanod_limit', { p_barangay: barangayId, p_limit: limit, p_reason: reason, p_year: year })
  if (error) throw error
  return data as number
}

export async function fetchLimitChanges(barangayId: number): Promise<LimitChange[]> {
  const { data, error } = await supabase
    .from('tanod_limit_changes')
    .select('id, year, old_limit, new_limit, reason, changed_by_name, changed_by_role, created_at')
    .eq('barangay_id', barangayId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return (data ?? []) as LimitChange[]
}

export function limitErrorMessage(e: unknown): string {
  const m = String((e as Error)?.message ?? e)
  if (!navigator.onLine || /failed to fetch|networkerror|load failed/i.test(m)) return 'There is no internet connection. Connect, then try again.'
  if (/could not find the function|PGRST202|PGRST205|tanod_limit_changes.* does not exist/i.test(m))
    return 'Changing limits is not set up in Supabase yet. Ask the Sakto team to run the database scripts 0900 and 1000.'
  // The database's own messages are written for people (reason missing, list locked, and so on).
  return m
}
