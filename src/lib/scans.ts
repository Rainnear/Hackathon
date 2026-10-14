// Scans: ID and document photos in Supabase Storage, with a row in public.scans for each.
import { newId } from '../domain/format'
import { extensionFor, shrinkPhoto } from './images'
import { blankFields, readId, type IdFields } from './reader'
import { supabase } from './supabase'

export type ScanKind = 'id' | 'certification' | 'designation' | 'spa'
export type ScanStatus = 'uploading' | 'reading' | 'ready' | 'failed' | 'saved' | 'discarded'

export interface Scan {
  id: string
  submission_id: number
  barangay_id: number
  kind: ScanKind
  status: ScanStatus
  front_path: string | null
  back_path: string | null
  fields: Partial<IdFields>
  error: string | null
  tanod_id: string | null
  source: 'web' | 'phone'
  created_at: string
}

const BUCKET = 'scans'
const COLS = 'id, submission_id, barangay_id, kind, status, front_path, back_path, fields, error, tanod_id, source, created_at'

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

async function upload(path: string, file: Blob) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false })
  fail(error)
}

/**
 * Uploads the photos, records the scan, and (for an ID) reads it. An ID scan ends as "ready" for the
 * review pop-up; a document scan is saved straight away, since there is nothing to type from it.
 */
export async function createScan(o: { submissionId: number; barangayId: number; kind: ScanKind; front: Blob; back: Blob | null }): Promise<Scan> {
  const id = newId()
  const dir = `${o.submissionId}/${o.barangayId}/${id}`
  const front = await shrinkPhoto(o.front)
  const back = o.back ? await shrinkPhoto(o.back) : null
  const frontPath = `${dir}/front.${extensionFor(front.type)}`
  const backPath = back ? `${dir}/back.${extensionFor(back.type)}` : null
  await upload(frontPath, front)
  if (back && backPath) await upload(backPath, back)

  const isId = o.kind === 'id'
  const ins = await supabase
    .from('scans')
    .insert({ id, submission_id: o.submissionId, barangay_id: o.barangayId, kind: o.kind, status: isId ? 'reading' : 'saved', front_path: frontPath, back_path: backPath, source: 'web' })
    .select(COLS)
    .single()
  fail(ins.error)
  if (!isId) return ins.data as Scan

  let fields: IdFields
  let status: ScanStatus = 'ready'
  let error: string | null = null
  try {
    fields = await readId(front, back)
  } catch (e) {
    // Reading failed, but the photos are safe: the secretary can still type the details in the pop-up.
    fields = blankFields()
    status = 'failed'
    error = (e as Error).message
  }
  const upd = await supabase.from('scans').update({ fields, status, error }).eq('id', id).select(COLS).single()
  fail(upd.error)
  return upd.data as Scan
}

/** Every scan in this submission that the signed-in person may see (row-level security filters by barangay). */
export async function fetchScans(submissionId: number): Promise<Scan[]> {
  const { data, error } = await supabase
    .from('scans')
    .select(COLS)
    .eq('submission_id', submissionId)
    .neq('status', 'discarded')
    .order('created_at')
    .limit(2000)
  fail(error)
  return data as Scan[]
}

export async function markScanSaved(id: string, tanodId: string | null, fields: Partial<IdFields>) {
  const { data, error } = await supabase.from('scans').update({ status: 'saved', tanod_id: tanodId, fields }).eq('id', id).select('id')
  fail(error)
  if (!data?.length) throw new Error('The list is locked, so this scan can no longer be saved.')
}

/** Removes the photos and the scan. */
export async function deleteScans(scans: Pick<Scan, 'id' | 'front_path' | 'back_path'>[]) {
  const paths = scans.flatMap((s) => [s.front_path, s.back_path]).filter((p): p is string => !!p)
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100))
    fail(error)
  }
  const ids = scans.map((s) => s.id)
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await supabase.from('scans').delete().in('id', ids.slice(i, i + 200))
    fail(error)
  }
}

/** Closing the year: every photo in it is deleted (kept only as long as the submission needs them). */
export async function purgeSubmissionScans(submissionId: number) {
  const { data, error } = await supabase.from('scans').select('id, front_path, back_path').eq('submission_id', submissionId).limit(5000)
  fail(error)
  if (data?.length) await deleteScans(data)
}

// Signed links last an hour; keep them so re-renders don't ask Supabase again.
const urls = new Map<string, { url: string; until: number }>()
export async function photoUrl(path: string): Promise<string> {
  const hit = urls.get(path)
  if (hit && hit.until > Date.now()) return hit.url
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  fail(error)
  urls.set(path, { url: data!.signedUrl, until: Date.now() + 50 * 60_000 })
  return data!.signedUrl
}

/** Live updates, so scans sent from the phone app show up (and open the review pop-up) as they arrive. */
export function watchScans(submissionId: number, onChange: (scan: Scan, event: 'INSERT' | 'UPDATE' | 'DELETE') => void) {
  const channel = supabase
    .channel(`scans-${submissionId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'scans', filter: `submission_id=eq.${submissionId}` }, (payload) => {
      const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Scan
      onChange(row, payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE')
    })
    .subscribe()
  return () => void supabase.removeChannel(channel)
}
