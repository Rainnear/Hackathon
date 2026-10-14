import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

/** False until .env.local has the project URL and publishable key. */
export const supabaseConfigured = Boolean(url && key)

// The session is kept in localStorage, so a signed-in user stays signed in offline.
export const supabase = createClient(url || 'http://localhost', key || 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export type Role = 'pending' | 'secretary' | 'rep' | 'admin'

export interface Profile {
  id: string
  full_name: string
  phone: string
  role: Role
  municipality_id: number | null
  barangay_id: number | null
  municipality: string | null
  barangay: string | null
}

export interface BarangayRow {
  id: number
  municipality_id: number
  name: string
  tanod_limit: number
  sort_order: number
}

export interface MunicipalityRow {
  id: number
  province: string
  name: string
}

export const ROLE_LABELS: Record<Role, string> = {
  pending: 'Waiting for approval',
  secretary: 'Barangay secretary',
  rep: 'Municipal Tanod Rep',
  admin: 'Administrator',
}

const PROFILE_COLUMNS = 'id, full_name, phone, role, municipality_id, barangay_id, municipalities(name), barangays(name)'

type ProfileRow = Omit<Profile, 'municipality' | 'barangay'> & {
  municipalities: { name: string } | null
  barangays: { name: string } | null
}

export const toProfile = (r: ProfileRow): Profile => ({
  id: r.id,
  full_name: r.full_name,
  phone: r.phone,
  role: r.role,
  municipality_id: r.municipality_id,
  barangay_id: r.barangay_id,
  municipality: r.municipalities?.name ?? null,
  barangay: r.barangays?.name ?? null,
})

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle()
  if (error) throw error
  return data ? toProfile(data as unknown as ProfileRow) : null
}

// Supabase returns at most 1,000 rows per request; Iloilo alone has 1,719 barangays.
const PAGE = 1000
async function fetchAllPages<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: Error | null }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return out
  }
}

/** Every profile the signed-in rep or admin is allowed to see (row-level security does the filtering). */
export async function fetchManagedProfiles(): Promise<Profile[]> {
  const rows = await fetchAllPages((from, to) =>
    supabase.from('profiles').select(PROFILE_COLUMNS).order('created_at').order('id').range(from, to) as unknown as PromiseLike<{ data: ProfileRow[] | null; error: Error | null }>,
  )
  return rows.map(toProfile)
}

/** Every barangay in every municipality, for the administrator's province view. */
export async function fetchAllBarangays(): Promise<BarangayRow[]> {
  return fetchAllPages((from, to) =>
    supabase.from('barangays').select('id, municipality_id, name, tanod_limit, sort_order').order('municipality_id').order('sort_order').order('id').range(from, to),
  )
}

// ---------- Problem reports from the Help page ----------
export interface SupportRequest {
  id: number
  message: string
  details: Record<string, string | number | boolean | null>
  status: 'open' | 'solved'
  created_at: string
  solved_at: string | null
  sender: { full_name: string; phone: string; municipality: string | null; barangay: string | null } | null
}

type SupportRow = Omit<SupportRequest, 'sender'> & {
  profiles: { full_name: string; phone: string; municipalities: { name: string } | null; barangays: { name: string } | null } | null
}

export async function sendSupportRequest(message: string, details: SupportRequest['details']) {
  const { error } = await supabase.from('support_requests').insert({ message, details })
  if (error) throw error
}

/** Your own reports; for an administrator, everyone's. Newest first. */
export async function fetchSupportRequests(): Promise<SupportRequest[]> {
  const { data, error } = await supabase
    .from('support_requests')
    .select('id, message, details, status, created_at, solved_at, profiles(full_name, phone, municipalities(name), barangays(name))')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return (data as unknown as SupportRow[]).map(({ profiles: p, ...r }) => ({
    ...r,
    sender: p ? { full_name: p.full_name, phone: p.phone, municipality: p.municipalities?.name ?? null, barangay: p.barangays?.name ?? null } : null,
  }))
}

export async function setSupportStatus(id: number, status: SupportRequest['status']) {
  const { data, error } = await supabase.from('support_requests').update({ status }).eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Only an administrator can change a report.')
}

export async function fetchMunicipalities(): Promise<MunicipalityRow[]> {
  const { data, error } = await supabase.from('municipalities').select('id, province, name').order('name')
  if (error) throw error
  return data
}

export async function fetchBarangays(municipalityId: number): Promise<BarangayRow[]> {
  const { data, error } = await supabase
    .from('barangays')
    .select('id, municipality_id, name, tanod_limit, sort_order')
    .eq('municipality_id', municipalityId)
    .order('sort_order')
  if (error) throw error
  return data
}

/** Turns Supabase's error text into something a secretary can act on. */
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'That email and password do not match. Check them, or reset your password.'
  if (m.includes('email not confirmed')) return 'Confirm your email first. Open the link we sent you, then sign in.'
  if (m.includes('already registered') || m.includes('already been registered')) return 'An account with this email already exists. Sign in instead, or reset the password.'
  if (m.includes('password should be') || m.includes('weak')) return 'Choose a longer password: at least 8 characters, mixing letters and numbers.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Wait a few minutes, then try again.'
  if (m.includes('failed to fetch') || m.includes('network')) return 'No internet connection. Signing in needs internet; try again once you are online.'
  if (m.includes('only the municipal tanod rep')) return 'Only the municipal Tanod Rep or an administrator can change roles and assignments.'
  return message
}
