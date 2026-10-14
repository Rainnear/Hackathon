// Keeps this device's copy of the submission and Supabase in step.
//
// Every edit is saved on the device first (the store is persisted to IndexedDB) and recorded in
// `pending`. Uploads send what is pending; downloads bring in everyone else's changes but keep
// anything still pending here, so nothing typed offline is overwritten. Last upload wins when two
// people change the same row. Uploads and downloads run one at a time, never interleaved.
import { del, set as idbSet } from 'idb-keyval'
import { create } from 'zustand'

import { MIN_AMOUNT, PROVINCIAL_SIGNATORIES } from '../data/municipalities'
import { clean, cleanMI, fullName } from '../domain/format'
import { POSITIONS, SUFFIXES, type Barangay, type DepartureReason, type Position, type Signatories, type Submission, type Suffix, type Tanod } from '../domain/types'
import { fetchAllPages, supabase, type Profile } from '../lib/supabase'
import { emptyPending, pendingCount, useStore, waitingCount, type Pending, type Previous, type SubmissionStatus } from './store'

export const PRESYNC_KEY = 'sakto-presync'

type Phase = 'loading' | 'ready' | 'no-submission' | 'no-assignment' | 'offline-empty' | 'error'

interface SyncState {
  /** Whether the workspace has data to show. */
  phase: Phase
  activity: 'idle' | 'uploading' | 'downloading'
  online: boolean
  /** The last upload or download problem that was not just "no internet". */
  error: string | null
  lastSyncAt: string | null
}

export const useSync = create<SyncState>(() => ({
  phase: 'loading',
  activity: 'idle',
  online: navigator.onLine,
  error: null,
  lastSyncAt: null,
}))

let me: Profile | null = null

// ---------- One job at a time ----------
let chain: Promise<unknown> = Promise.resolve()
function exclusive<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job, job)
  chain = run.catch(() => {})
  return run
}

interface DbError {
  message: string
  code?: string
}
function check<T>(res: { data: T; error: DbError | null }): T {
  if (res.error) throw res.error
  return res.data
}
const isNetworkError = (e: unknown) => {
  const m = String((e as DbError)?.message ?? e).toLowerCase()
  return !navigator.onLine || m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed') || m.includes('network request failed')
}
function describe(e: unknown): string {
  const err = e as DbError
  if (err?.code === '42501' || /row-level security|permission denied/i.test(err?.message ?? ''))
    return 'Supabase refused the change. The list may have been submitted by the Tanod Rep, or your access changed.'
  return err?.message || 'Something went wrong while saving online.'
}

// ---------- Shapes from Supabase ----------
const SUB_COLS = 'id, year, status, amount_per_tanod, signatories, obr_no, obr_payee, obr_amount'
interface SubRow {
  id: number
  year: number
  status: SubmissionStatus
  amount_per_tanod: number
  signatories: Partial<Signatories> | null
  obr_no: string
  obr_payee: string
  obr_amount: string
}
interface BrgyRow {
  id: number
  name: string
  tanod_limit: number
}
interface EntryRow {
  tanod_id: string
  barangay_id: number
  position: Position
  id_signatures: number
  tanods: { last_name: string; first_name: string; middle_initial: string; suffix: string } | null
}
interface ReqRow {
  barangay_id: number
  certification: boolean
  designation: boolean
  via_representative: boolean
  spa: boolean
  focal_name: string
  focal_phone: string
}

interface DepRow {
  tanod_id: string
  barangay_id: number
  reason: DepartureReason
  note: string
  tanods: EntryRow['tanods']
}
const DEP_COLS = 'tanod_id, barangay_id, reason, note, tanods(last_name, first_name, middle_initial, suffix)'
const ENTRY_COLS = 'tanod_id, barangay_id, position, id_signatures, tanods(last_name, first_name, middle_initial, suffix)'

function toTanod(e: Pick<EntryRow, 'tanod_id' | 'tanods'> & Partial<Pick<EntryRow, 'position' | 'id_signatures'>>): Tanod {
  const t = e.tanods
  return {
    id: e.tanod_id,
    last: t?.last_name ?? '',
    first: t?.first_name ?? '',
    mi: t?.middle_initial ?? '',
    suffix: (SUFFIXES as readonly string[]).includes(t?.suffix ?? '') ? (t!.suffix as Suffix) : '',
    pos: POSITIONS.some((p) => p.value === e.position) ? e.position! : 'BARANGAY TANOD',
    ids: Math.max(0, Math.min(3, e.id_signatures ?? 0)),
  }
}

const defaultSignatories = (): Signatories => ({ liga: '', mlgoo: '', disb: '', ...PROVINCIAL_SIGNATORIES })

function groupBy<T, K>(xs: T[], key: (x: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>()
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x])
  return m
}

function buildSubmission(muni: string, s: SubRow, brgys: BrgyRow[], entries: EntryRow[], reqs: ReqRow[], deps: DepRow[]): Submission {
  const byBrgy = groupBy(entries, (e) => e.barangay_id)
  const depBy = groupBy(deps, (d) => d.barangay_id)
  const reqBy = new Map(reqs.map((r) => [r.barangay_id, r]))
  const sig = defaultSignatories()
  for (const [k, v] of Object.entries(s.signatories ?? {})) if (k in sig && typeof v === 'string') sig[k as keyof Signatories] = v
  return {
    version: 1,
    municipality: muni,
    year: s.year,
    amount: Number(s.amount_per_tanod) || MIN_AMOUNT,
    sig,
    obr: { no: s.obr_no, payee: s.obr_payee, amount: s.obr_amount },
    brgys: brgys.map((b): Barangay => {
      const r = reqBy.get(b.id)
      return {
        name: b.name,
        limit: b.tanod_limit,
        tanods: (byBrgy.get(b.id) ?? []).map(toTanod),
        docs: { cert: !!r?.certification, designation: !!r?.designation, viaRep: !!r?.via_representative, spa: !!r?.spa },
        focal: { name: r?.focal_name ?? '', phone: r?.focal_phone ?? '' },
        left: (depBy.get(b.id) ?? []).map((d) => ({ tanodId: d.tanod_id, name: fullName(toTanod(d)), reason: d.reason, note: d.note })),
      }
    }),
  }
}

/**
 * Supabase's copy, with this device's not-yet-uploaded changes laid on top.
 * A barangay with pending row changes keeps its local order; rows changed elsewhere are refreshed,
 * rows deleted elsewhere drop out, and rows added elsewhere are appended.
 */
export function mergeServer(server: Submission, local: Submission, pending: Pending): Submission {
  const localBy = new Map(local.brgys.map((b) => [b.name, b]))
  const removedIn = new Set(Object.values(pending.removed))
  return {
    ...server,
    ...(pending.sub ? { amount: local.amount, sig: local.sig, obr: local.obr } : {}),
    brgys: server.brgys.map((sb) => {
      const lb = localBy.get(sb.name)
      if (!lb) return sb
      const docs = pending.reqs[sb.name] ? lb.docs : sb.docs
      const focal = pending.reqs[sb.name] ? lb.focal : sb.focal
      const left = [...sb.left.filter((d) => !pending.departures[d.tanodId]), ...lb.left.filter((d) => pending.departures[d.tanodId])]
      const touched = !!pending.order[sb.name] || removedIn.has(sb.name) || lb.tanods.some((t) => pending.tanods[t.id])
      if (!touched) return { ...sb, docs, focal, left }
      const fromServer = new Map(sb.tanods.map((t) => [t.id, t]))
      const here = new Set(lb.tanods.map((t) => t.id))
      const kept = lb.tanods.flatMap((t) => (pending.tanods[t.id] ? [t] : fromServer.has(t.id) ? [fromServer.get(t.id)!] : []))
      const added = sb.tanods.filter((t) => !here.has(t.id) && !pending.removed[t.id])
      return { ...sb, docs, focal, left, tanods: [...kept, ...added] }
    }),
  }
}

// ---------- Download ----------
async function pull(year?: number) {
  const p = me
  if (!p?.municipality_id) return
  const st = useStore.getState()
  const brgyId = p.role === 'secretary' ? p.barangay_id : null
  useSync.setState({ activity: 'downloading' })

  let s: SubRow | null
  if (p.role === 'secretary') {
    // The Tanod Rep opens each year; secretaries work in the open one (or see the latest, read-only).
    const rows = check(await supabase.from('submissions').select(SUB_COLS).eq('municipality_id', p.municipality_id).order('year', { ascending: false }).limit(5)) as SubRow[]
    s = rows.find((r) => r.status === 'open') ?? rows[0] ?? null
    if (!s) {
      useSync.setState({ phase: st.remote ? 'ready' : 'no-submission' })
      return
    }
  } else {
    const y = year ?? st.remote?.year ?? new Date().getFullYear()
    s = check(await supabase.from('submissions').select(SUB_COLS).eq('municipality_id', p.municipality_id).eq('year', y).maybeSingle()) as SubRow | null
    if (!s)
      s = check(
        await supabase.from('submissions').insert({ municipality_id: p.municipality_id, year: y, signatories: defaultSignatories() }).select(SUB_COLS).single(),
      ) as SubRow
  }

  const brgys = brgyId
    ? (check(await supabase.from('barangays').select('id, name, tanod_limit').eq('id', brgyId)) as BrgyRow[])
    : await fetchAllPages<BrgyRow>((from, to) =>
        supabase.from('barangays').select('id, name, tanod_limit').eq('municipality_id', p.municipality_id!).order('sort_order').order('id').range(from, to),
      )
  const subId = s.id
  const entries = await fetchAllPages<EntryRow>((from, to) => {
    let q = supabase
      .from('roster_entries')
      .select(ENTRY_COLS)
      .eq('submission_id', subId)
    if (brgyId) q = q.eq('barangay_id', brgyId)
    return q.order('barangay_id').order('sort_order').order('created_at').order('tanod_id').range(from, to) as unknown as PromiseLike<{ data: EntryRow[] | null; error: Error | null }>
  })
  let rq = supabase.from('barangay_requirements').select('barangay_id, certification, designation, via_representative, spa, focal_name, focal_phone').eq('submission_id', subId)
  if (brgyId) rq = rq.eq('barangay_id', brgyId)
  const reqs = check(await rq) as ReqRow[]
  let dq = supabase.from('tanod_departures').select(DEP_COLS).eq('submission_id', subId)
  if (brgyId) dq = dq.eq('barangay_id', brgyId)
  const deps = check(await dq) as unknown as DepRow[]

  // Last year's lists, for "Copy last year's tanods" and for asking why someone left.
  const prevRows = check(
    await supabase.from('submissions').select('id, year').eq('municipality_id', p.municipality_id).lt('year', s.year).order('year', { ascending: false }).limit(1),
  ) as { id: number; year: number }[]
  let previous: Previous | null = null
  if (prevRows[0]) {
    const pid = prevRows[0].id
    const prevEntries = await fetchAllPages<EntryRow>((from, to) => {
      let q = supabase.from('roster_entries').select(ENTRY_COLS).eq('submission_id', pid)
      if (brgyId) q = q.eq('barangay_id', brgyId)
      return q.order('barangay_id').order('sort_order').order('created_at').order('tanod_id').range(from, to) as unknown as PromiseLike<{ data: EntryRow[] | null; error: Error | null }>
    })
    const nameOf = new Map(brgys.map((b) => [b.id, b.name]))
    const grouped = groupBy(prevEntries, (e) => e.barangay_id)
    previous = {
      year: prevRows[0].year,
      brgys: Object.fromEntries([...grouped].filter(([id]) => nameOf.has(id)).map(([id, es]) => [nameOf.get(id)!, es.map(toTanod)])),
    }
  }

  const server = buildSubmission(p.municipality ?? '', s, brgys, entries, reqs, deps)
  const sid = s.id
  const status = s.status
  const year2 = s.year
  useStore.setState((cur) => {
    const same = cur.remote?.submissionId === sid
    const pending = same ? cur.pending : emptyPending()
    return {
      sub: same ? mergeServer(server, cur.sub, pending) : server,
      pending,
      previous,
      remote: {
        userId: p.id,
        municipalityId: p.municipality_id!,
        barangayId: brgyId,
        submissionId: sid,
        year: year2,
        status,
        brgyIds: Object.fromEntries(brgys.map((b) => [b.name, b.id])),
        pulledAt: new Date().toISOString(),
      },
    }
  })
  useSync.setState({ phase: 'ready', lastSyncAt: new Date().toISOString(), online: true })
}

// ---------- Upload ----------
const CHUNK = 500
const chunks = <T>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / CHUNK) }, (_, i) => xs.slice(i * CHUNK, (i + 1) * CHUNK))

async function push(): Promise<boolean> {
  const { pending, remote, sub } = useStore.getState()
  if (!remote || !pendingCount(pending)) return false
  // Secretaries can only change an open year; the database would refuse anyway.
  if (me?.role === 'secretary' && remote.status !== 'open') return false
  useSync.setState({ activity: 'uploading' })

  const sid = remote.submissionId
  const where = new Map<string, { b: Barangay; i: number; t: Tanod }>()
  for (const b of sub.brgys) b.tanods.forEach((t, i) => where.set(t.id, { b, i, t }))
  const sent: Pending = emptyPending()
  const named = (t: Tanod) => clean(t.last) && clean(t.first)

  const tRows: object[] = []
  const eRows: object[] = []
  for (const [id, s] of Object.entries(pending.tanods)) {
    const w = where.get(id)
    const bid = w && remote.brgyIds[w.b.name]
    if (!w || !bid) {
      sent.tanods[id] = s // no longer on this device: nothing to send
      continue
    }
    if (!named(w.t)) continue // half-typed rows wait until they have both names
    tRows.push({ id, barangay_id: bid, last_name: clean(w.t.last), first_name: clean(w.t.first), middle_initial: cleanMI(w.t.mi), suffix: w.t.suffix })
    eRows.push({ submission_id: sid, barangay_id: bid, tanod_id: id, position: w.t.pos, id_signatures: w.t.ids, sort_order: w.i + 1 })
    sent.tanods[id] = s
  }
  for (const c of chunks(tRows)) check(await supabase.from('tanods').upsert(c, { onConflict: 'id' }))
  for (const c of chunks(eRows)) check(await supabase.from('roster_entries').upsert(c, { onConflict: 'submission_id,tanod_id' }))

  const removed = Object.keys(pending.removed)
  for (const c of chunks(removed)) check(await supabase.from('roster_entries').delete().eq('submission_id', sid).in('tanod_id', c))
  for (const id of removed) sent.removed[id] = pending.removed[id]

  for (const [name, s] of Object.entries(pending.order)) {
    const b = sub.brgys.find((x) => x.name === name)
    const bid = remote.brgyIds[name]
    if (b && bid) check(await supabase.rpc('set_roster_order', { p_submission: sid, p_barangay: bid, p_tanods: b.tanods.map((t) => t.id) }))
    sent.order[name] = s
  }

  const rRows = Object.keys(pending.reqs).flatMap((name) => {
    const b = sub.brgys.find((x) => x.name === name)
    const bid = remote.brgyIds[name]
    return b && bid
      ? [{
          submission_id: sid, barangay_id: bid,
          certification: b.docs.cert, designation: b.docs.designation, via_representative: b.docs.viaRep, spa: b.docs.spa,
          focal_name: b.focal.name, focal_phone: b.focal.phone,
        }]
      : []
  })
  if (rRows.length) check(await supabase.from('barangay_requirements').upsert(rRows, { onConflict: 'submission_id,barangay_id' }))
  for (const [name, s] of Object.entries(pending.reqs)) sent.reqs[name] = s

  for (const [id, s] of Object.entries(pending.departures)) {
    const where = sub.brgys.find((b) => b.left.some((d) => d.tanodId === id))
    const d = where?.left.find((x) => x.tanodId === id)
    const bid = where && remote.brgyIds[where.name]
    if (d && bid)
      check(await supabase.from('tanod_departures').upsert({ submission_id: sid, tanod_id: id, barangay_id: bid, reason: d.reason, note: d.note }, { onConflict: 'submission_id,tanod_id' }))
    else check(await supabase.from('tanod_departures').delete().eq('submission_id', sid).eq('tanod_id', id))
    sent.departures[id] = s
  }

  if (pending.sub) {
    check(
      await supabase
        .from('submissions')
        .update({ amount_per_tanod: sub.amount, signatories: sub.sig, obr_no: sub.obr.no, obr_payee: sub.obr.payee, obr_amount: sub.obr.amount })
        .eq('id', sid),
    )
    sent.sub = pending.sub
  }

  // Clear only what was sent and not edited again since.
  useStore.setState((cur) => {
    const p: Pending = { tanods: { ...cur.pending.tanods }, removed: { ...cur.pending.removed }, order: { ...cur.pending.order }, reqs: { ...cur.pending.reqs }, sub: cur.pending.sub, departures: { ...cur.pending.departures } }
    for (const [k, v] of Object.entries(sent.departures)) if (p.departures[k] === v) delete p.departures[k]
    for (const [k, v] of Object.entries(sent.tanods)) if (p.tanods[k] === v) delete p.tanods[k]
    for (const [k, v] of Object.entries(sent.removed)) if (p.removed[k] === v) delete p.removed[k]
    for (const [k, v] of Object.entries(sent.order)) if (p.order[k] === v) delete p.order[k]
    for (const [k, v] of Object.entries(sent.reqs)) if (p.reqs[k] === v) delete p.reqs[k]
    if (sent.sub && p.sub === sent.sub) p.sub = 0
    return { pending: p }
  })
  useSync.setState({ lastSyncAt: new Date().toISOString(), online: true })
  return true
}

/** A secretary with changes that can no longer go up because the Tanod Rep locked the year. */
function lockedMessage(): string | null {
  const st = useStore.getState()
  const r = st.remote
  const n = waitingCount(st)
  if (me?.role !== 'secretary' || !r || r.status === 'open' || !n) return null
  return `The Tanod Rep has locked the CY ${r.year} list, so ${n === 1 ? '1 change' : `${n} changes`} made on this device can't be uploaded. Ask the Tanod Rep to reopen it, or discard ${n === 1 ? 'it' : 'them'}.`
}

// ---------- Running it ----------
async function run(kind: 'upload' | 'full', year?: number) {
  return exclusive(async () => {
    const firstLoad = useSync.getState().phase === 'loading'
    let error: string | null = null
    try {
      let refused: unknown = null
      try {
        await push()
      } catch (e) {
        if (isNetworkError(e)) throw e
        refused = e
      }
      // After a refused upload, download anyway: the usual reason is that the Tanod Rep locked the year,
      // and the fresh status lets the message say so.
      if (kind === 'full' || firstLoad || refused) await pull(year)
      error = lockedMessage() ?? (refused ? describe(refused) : null)
    } catch (e) {
      // Plain "no internet" is not an error: the badge already says the work is waiting on this device.
      if (isNetworkError(e)) useSync.setState({ online: false, ...(firstLoad ? { phase: 'offline-empty' } : {}) })
      else {
        error = describe(e)
        if (firstLoad) useSync.setState({ phase: 'error' })
      }
    } finally {
      useSync.setState({ activity: 'idle', error })
    }
  })
}

let timer: ReturnType<typeof setTimeout> | undefined
let timerKind: 'upload' | 'full' = 'upload'
function schedule(kind: 'upload' | 'full', ms: number) {
  if (timer && timerKind === 'full') kind = 'full'
  clearTimeout(timer)
  timerKind = kind
  timer = setTimeout(() => {
    timer = undefined
    void run(kind)
  }, ms)
}

/** Upload anything waiting and download the latest now (the "Sync now" / "Try again" button). */
export const syncNow = () => run('full')

/**
 * Point this device at the signed-in person's submission. A different person, barangay or year
 * starts from a fresh download; work saved here before Sakto went online is kept aside to upload.
 */
async function open(profile: Profile, year?: number) {
  me = profile
  if (!profile.municipality_id || (profile.role === 'secretary' && !profile.barangay_id)) {
    useSync.setState({ phase: 'no-assignment' })
    return
  }
  const st = useStore.getState()
  const r = st.remote
  const brgyId = profile.role === 'secretary' ? profile.barangay_id : null
  const same = r && r.userId === profile.id && r.municipalityId === profile.municipality_id && r.barangayId === brgyId && (year === undefined || r.year === year)
  if (!same) {
    const n = st.sub.brgys.reduce((a, b) => a + b.tanods.length, 0)
    if (!r && n) await idbSet(PRESYNC_KEY, JSON.stringify(st.sub)).catch(() => {})
    useStore.setState({ remote: null, pending: emptyPending(), lastBrgy: null, filter: 'all' })
    useSync.setState({ phase: 'loading', error: null })
  } else useSync.setState({ phase: 'ready' })
  await run('full', year ?? r?.year)
}

/** Starts syncing for the signed-in person. Returns a function that stops it. */
export function startSync(profile: Profile): () => void {
  void open(profile)
  const unsub = useStore.subscribe((s, prev) => {
    if (s.pending !== prev.pending && pendingCount(s.pending)) schedule('upload', 1500)
  })
  const onOnline = () => {
    useSync.setState({ online: true })
    schedule('full', 0)
  }
  const onOffline = () => useSync.setState({ online: false })
  const onVisible = () => {
    if (document.visibilityState === 'visible') schedule('full', 0)
  }
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  document.addEventListener('visibilitychange', onVisible)
  // Bring in other people's changes about once a minute while the app is open.
  const iv = setInterval(() => schedule('full', 0), 60_000)
  return () => {
    unsub()
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    document.removeEventListener('visibilitychange', onVisible)
    clearInterval(iv)
    clearTimeout(timer)
  }
}

/** Tanod Rep: switch to another calendar year (opening it if it doesn't exist yet). */
export async function switchYear(year: number) {
  if (!me) return
  if (pendingCount(useStore.getState().pending)) throw new Error('Wait until your changes are uploaded before switching years.')
  await open(me, year)
}

/** Tanod Rep: open, submit (locks secretaries out) or close the year. */
export async function setSubmissionStatus(status: SubmissionStatus) {
  const remote = useStore.getState().remote
  if (!remote) return
  await syncNow()
  const res = await supabase.from('submissions').update({ status }).eq('id', remote.submissionId).select('id')
  if (res.error) throw new Error(describe(res.error))
  if (!res.data?.length) throw new Error('Only the Tanod Rep or an administrator can change this.')
  await syncNow()
}

/** Throw away changes that will not upload (for example after the list was submitted), then reload. */
export async function discardPending() {
  useStore.setState({ pending: emptyPending() })
  useSync.setState({ error: null })
  await syncNow()
}

/** After uploading the old device copy, forget it. */
export const forgetPresync = () => del(PRESYNC_KEY).catch(() => {})
