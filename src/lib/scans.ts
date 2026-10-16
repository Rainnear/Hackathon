// Scans: ID and document photos in Supabase Storage, with a row in public.scans for each.
import { newId } from '../domain/format'
import { extensionFor, shrinkPhoto } from './images'
import type { ListRow } from './idParse'
import { blankFields, readId, readList, type IdFields, type ListFields } from './reader'
import { meteredFetch } from './dataMeter'
import { supabase } from './supabase'

export type ScanKind = 'id' | 'list' | 'certification' | 'designation' | 'spa'
export type ScanStatus = 'uploading' | 'reading' | 'ready' | 'failed' | 'saved' | 'discarded'

export interface Scan {
  id: string
  submission_id: number
  barangay_id: number
  kind: ScanKind
  status: ScanStatus
  front_path: string | null
  back_path: string | null
  /**
   * ID scans: the name fields (as confirmed in the review), and what the reader made of the photo in
   * `read`. List scans and signed certifications: { rows, reader }, the names read from the page.
   */
  fields: Partial<IdFields> & { rows?: ListRow[]; read?: { last: string; first: string; mi: string; suffix: string; conf: number } }
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

/** Says why a scan failed in words a secretary can act on, instead of always blaming the internet. */
export function scanErrorMessage(e: unknown): string {
  const m = String((e as Error)?.message ?? e)
  if (!navigator.onLine || /failed to fetch|networkerror|load failed/i.test(m)) return 'There is no internet connection. Connect, then try again.'
  if (/bucket not found|could not find the table|relation .*scans.* does not exist|PGRST205/i.test(m))
    return 'Photo scanning is not set up in Supabase yet. Ask the Sakto team to run the scans database script (0400).'
  if (/row-level security|permission denied|42501|unauthorized/i.test(m)) return 'Supabase refused the photo. The list may be locked, or your account may not have access to this barangay.'
  if (/payload too large|exceeded the maximum|413/i.test(m)) return 'The photo is too large. Try a smaller photo (under 10 MB).'
  if (/mime|content type|invalid_mime/i.test(m)) return 'That file type is not allowed. Use a JPG or PNG photo.'
  return `The photo could not be uploaded: ${m}`
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

  // IDs and lists are read and then reviewed; a document photo is saved straight away.
  const isId = o.kind === 'id' || o.kind === 'list'
  const ins = await supabase
    .from('scans')
    .insert({ id, submission_id: o.submissionId, barangay_id: o.barangayId, kind: o.kind, status: isId ? 'reading' : 'saved', front_path: frontPath, back_path: backPath, source: 'web' })
    .select(COLS)
    .single()
  fail(ins.error)
  // A signed certification: read the names on it, to check them against the tanod list.
  if (o.kind === 'certification') return (await readCertificationPhoto(ins.data as Scan, front)) ?? (ins.data as Scan)
  if (!isId) return ins.data as Scan

  let fields: IdFields | ListFields
  let status: ScanStatus = 'ready'
  let error: string | null = null
  try {
    fields = o.kind === 'list' ? await readList(front, id) : await readId(front, back, id)
  } catch (e) {
    // Reading failed, but the photos are safe: the secretary can still type the details in the pop-up.
    fields = o.kind === 'list' ? { rows: [], reader: 'none' } : blankFields()
    status = 'failed'
    error = (e as Error).message
  }
  const upd = await supabase.from('scans').update({ fields, status, error }).eq('id', id).select(COLS).single()
  fail(upd.error)
  return upd.data as Scan
}

/** The secretary checked the ID again and the list is right: the ID record takes the list's spelling. */
export async function acceptListName(scan: Scan, name: { last: string; first: string; mi: string; suffix: string }): Promise<Scan> {
  // The reader's own reading of the photo is dropped too: the person has checked the ID themselves.
  const { read: _read, ...rest } = scan.fields
  void _read
  const { data, error } = await supabase.from('scans').update({ fields: { ...rest, ...name } }).eq('id', scan.id).select(COLS).single()
  fail(error)
  return data as Scan
}

/**
 * Reads the names on a signed Barangay Certification photo (the free reader first, the AI reader when
 * it's unsure) and keeps them on the scan as { rows, reader }. Null if it couldn't be read or saved;
 * the photo itself is unaffected. Without a photo blob, it downloads the saved one.
 */
export async function readCertificationPhoto(scan: Scan, photo?: Blob): Promise<Scan | null> {
  try {
    let blob = photo
    if (!blob) {
      if (!scan.front_path) return null
      const res = await meteredFetch(await photoUrl(scan.front_path), undefined, 'photosDown')
      if (!res.ok) return null
      blob = await res.blob()
    }
    const read = await readList(blob, scan.id)
    const upd = await supabase.from('scans').update({ fields: { ...scan.fields, rows: read.rows, reader: read.reader } }).eq('id', scan.id).select(COLS).single()
    return upd.error ? null : (upd.data as Scan)
  } catch {
    return null
  }
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

export async function markScanSaved(id: string, tanodId: string | null, fields: Scan['fields']) {
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

// Photos shown on screen are downloaded once per session and counted by the data meter. The most recent
// ones stay in memory, so moving back and forth between scans doesn't download them again.
const KEEP = 40
const blobs = new Map<string, Promise<string>>()
export function photoBlobUrl(path: string): Promise<string> {
  const hit = blobs.get(path)
  if (hit) {
    blobs.delete(path)
    blobs.set(path, hit)
    return hit
  }
  const p = photoUrl(path)
    .then((u) => meteredFetch(u, undefined, 'photosDown'))
    .then(async (res) => {
      if (!res.ok) throw new Error(`Photo could not load (${res.status}).`)
      return URL.createObjectURL(await res.blob())
    })
  p.catch(() => blobs.delete(path))
  blobs.set(path, p)
  for (const [k, old] of blobs) {
    if (blobs.size <= KEEP) break
    blobs.delete(k)
    void old.then((u) => URL.revokeObjectURL(u), () => {})
  }
  return p
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
