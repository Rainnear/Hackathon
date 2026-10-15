import { clean, cleanMI, digits, fullName, nameKey, norm, peso, plural } from './format'
import type { BarangayStatus, Filter, Issue, RowNote, SignatoryKey, Submission, Tanod, Tone } from './types'

export const SIG_LABELS: Record<SignatoryKey, string> = {
  liga: 'Liga President',
  mlgoo: 'MLGOO',
  auth: 'Authorized Official',
  authPos: "Authorized Official's position",
  acct: 'Head of Accounting',
  treas: 'Provincial Treasurer',
  lce: 'Local Chief Executive',
  disb: 'Disbursing Officer',
}
export const SIG_REQUIRED: SignatoryKey[] = ['liga', 'mlgoo', 'auth', 'acct', 'treas', 'lce']

/** Award numbers run as one sequence across the municipality, in barangay order. */
export function awards(sub: Submission) {
  const m: Record<string, number> = {}
  let n = 0
  for (const b of sub.brgys) for (const t of b.tanods) m[t.id] = ++n
  return m
}

export function totals(sub: Submission) {
  const n = sub.brgys.reduce((a, b) => a + b.tanods.length, 0)
  return { n, amt: n * Number(sub.amount || 0), allowed: sub.brgys.reduce((a, b) => a + b.limit, 0) }
}

/** The ObR payee must read as award #1 followed by "ET AL." */
export function expectedPayee(sub: Submission) {
  for (const b of sub.brgys) if (b.tanods.length) return fullName(b.tanods[0]) + ' ET AL.'
  return ''
}

/** Last year's lists by barangay, for comparing spellings. */
export interface LastYear {
  year: number
  brgys: Record<string, Tanod[]>
}

/** Edit distance, giving up past max (only small differences matter here). */
function distance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      best = Math.min(best, cur[j])
    }
    if (best > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}
/** One or two letters apart, on names long enough for that to mean a likely typo. */
const nearly = (a: string, b: string) => a !== b && Math.min(a.length, b.length) >= 4 && distance(a, b) <= 2

/**
 * Advice about names, checked within the list and against last year's: nearly identical names, a
 * spelling or middle initial that changed since last year, a missing middle initial. Never blocking:
 * two different people can have nearly the same name, and some people have no middle name.
 */
function nameChecks(sub: Submission, last: LastYear | null): Issue[] {
  const out: Issue[] = []
  const add = (o: Pick<Issue, 'brgy' | 'msg' | 'why' | 'rows'> & { also?: string | null }) =>
    out.push({ level: 'warn', kind: 'check', also: null, sms: null, ...o })
  const named = sub.brgys.flatMap((b) => b.tanods.filter((t) => clean(t.last) && clean(t.first)).map((t) => ({ t, b: b.name })))

  // Nearly the same name: same last name and a first name a letter or two off, or the other way round.
  const pairs = new Set<string>()
  const byLast = new Map<string, typeof named>()
  const byFirst = new Map<string, typeof named>()
  for (const x of named) {
    ;(byLast.get(clean(x.t.last)) ?? byLast.set(clean(x.t.last), []).get(clean(x.t.last))!).push(x)
    ;(byFirst.get(clean(x.t.first)) ?? byFirst.set(clean(x.t.first), []).get(clean(x.t.first))!).push(x)
  }
  const compare = (group: typeof named, field: 'first' | 'last') => {
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j]
        const key = [a.t.id, b.t.id].sort().join('|')
        if (pairs.has(key) || !nearly(clean(a.t[field]), clean(b.t[field]))) continue
        pairs.add(key)
        const an = fullName(a.t), bn = fullName(b.t)
        const here = a.b === b.b
        add({
          brgy: a.b, also: here ? null : b.b,
          rows: {
            [a.t.id]: `Almost the same as ${bn}${here ? '' : ` (Brgy. ${b.b})`}. Check the spelling on both IDs.`,
            [b.t.id]: `Almost the same as ${an}${here ? '' : ` (Brgy. ${a.b})`}. Check the spelling on both IDs.`,
          },
          msg: `Names almost the same: ${an} and ${bn}${here ? '' : ` (Brgy. ${b.b})`}`,
          why: 'One may be misspelled. If they are two different people, leave both as they are.',
        })
      }
  }
  for (const g of byLast.values()) if (g.length > 1) compare(g, 'first')
  for (const g of byFirst.values()) if (g.length > 1) compare(g, 'last')

  // Against last year's list, barangay by barangay.
  if (last)
    for (const b of sub.brgys) {
      const before = (last.brgys[b.name] ?? []).filter((t) => clean(t.last) && clean(t.first))
      if (!before.length) continue
      const byId = new Map(before.map((t) => [t.id, t]))
      const keys = new Set(b.tanods.map(nameKey))
      for (const t of b.tanods) {
        if (!clean(t.last) || !clean(t.first)) continue
        const nm = fullName(t)
        const old = byId.get(t.id)
        if (old) {
          if (nameKey(old) !== nameKey(t))
            add({
              brgy: b.name, rows: { [t.id]: `Spelled ${fullName(old)} in CY ${last.year}. Check which is right on the ID.` },
              msg: `${nm}: spelled differently in CY ${last.year} (${fullName(old)})`,
              why: 'If the name was corrected on purpose, leave it.',
            })
          else if (cleanMI(old.mi) && cleanMI(t.mi) && cleanMI(old.mi) !== cleanMI(t.mi))
            add({
              brgy: b.name, rows: { [t.id]: `Middle initial was ${cleanMI(old.mi)} in CY ${last.year}. Check the ID.` },
              msg: `${nm}: middle initial was ${cleanMI(old.mi)} in CY ${last.year}`,
              why: 'The middle initial should match the ID.',
            })
          continue
        }
        // A new row that looks like someone from last year: a misspelled copy of the same person?
        const like = before.find((o) => !keys.has(nameKey(o)) && ((clean(o.last) === clean(t.last) && nearly(clean(o.first), clean(t.first))) || (clean(o.first) === clean(t.first) && nearly(clean(o.last), clean(t.last)))))
        if (like)
          add({
            brgy: b.name, rows: { [t.id]: `Looks like ${fullName(like)} from CY ${last.year}. Check the spelling on the ID.` },
            msg: `${nm} looks like CY ${last.year}'s ${fullName(like)}`,
            why: 'If it is the same person, use the spelling on their ID.',
          })
      }
    }

  // No middle initial: one note per barangay, with every row marked.
  for (const b of sub.brgys) {
    const none = b.tanods.filter((t) => clean(t.last) && clean(t.first) && !cleanMI(t.mi))
    if (none.length)
      add({
        brgy: b.name, rows: Object.fromEntries(none.map((t) => [t.id, 'No middle initial. Add it if the ID shows one.'])),
        msg: none.length === 1 ? `${fullName(none[0])} has no middle initial` : `${plural(none.length, 'tanod')} have no middle initial`,
        why: 'Add it if their ID shows a middle name.',
      })
  }
  return out
}

/** A name as written on a document: the list, an ID, or the signed certification. */
export interface NameOnDoc {
  last: string
  first: string
  mi: string
  suffix: string
}

/** What the list is checked against, from the photos: scanned IDs and signed certifications. */
export interface References {
  /** Per tanod id: the name confirmed when their ID was scanned, and what the reader made of the photo. */
  ids: Record<string, { confirmed: NameOnDoc; read?: NameOnDoc & { conf: number } }>
  /** Per barangay: the names read from the photo of its signed Barangay Certification. */
  certs: Record<string, NameOnDoc[]>
}

const show = (n: NameOnDoc) => [clean(n.first), cleanMI(n.mi), clean(n.last), n.suffix].filter(Boolean).join(' ')
const sameName = (a: NameOnDoc, b: NameOnDoc) => clean(a.last) === clean(b.last) && clean(a.first) === clean(b.first)
const nearName = (a: NameOnDoc, b: NameOnDoc) =>
  (clean(a.last) === clean(b.last) && nearly(clean(a.first), clean(b.first))) || (clean(a.first) === clean(b.first) && nearly(clean(a.last), clean(b.last)))

/**
 * The list against the documents it must agree with. Every message names the document, the row and
 * exactly what differs. Advice, not blocking: photos can be read wrong, so a person checks each one.
 */
function crossChecks(sub: Submission, refs: References | null): Issue[] {
  if (!refs) return []
  const out: Issue[] = []
  const add = (o: Pick<Issue, 'brgy' | 'msg' | 'why' | 'rows'>) => out.push({ level: 'warn', kind: 'check', also: null, sms: null, ...o })
  for (const b of sub.brgys) {
    b.tanods.forEach((t, i) => {
      if (!clean(t.last) || !clean(t.first)) return
      const id = refs.ids[t.id]
      if (!id) return
      const row = `Row ${i + 1}`
      const nm = fullName(t)
      const c = id.confirmed
      // Changed in the list after the ID was checked against the photo.
      const diff = [
        clean(c.last) !== clean(t.last) && `last name ${clean(c.last)}`,
        clean(c.first) !== clean(t.first) && `first name ${clean(c.first)}`,
        cleanMI(c.mi) !== cleanMI(t.mi) && (cleanMI(c.mi) ? `M.I. ${cleanMI(c.mi)}` : 'no M.I.'),
        (c.suffix || '') !== (t.suffix || '') && (c.suffix ? `suffix ${c.suffix}` : 'no suffix'),
      ].filter(Boolean)
      if (diff.length) {
        add({
          brgy: b.name,
          rows: { [t.id]: `ID: when the ID was scanned and checked it said ${diff.join(', ')} (${show(c)}). Make the list match the ID.` },
          msg: `ID · ${row}, ${nm}: the list differs from the scanned ID (${diff.join(', ')})`,
          why: `Checked from the ID photo: ${show(c)}. The Masterlist, Payroll and Certification print what the list says.`,
        })
        return
      }
      // The photo shows a middle initial or suffix the list left out.
      const r = id.read
      if (r && r.conf >= 0.8) {
        const missing = [cleanMI(r.mi) && !cleanMI(t.mi) && `M.I. ${cleanMI(r.mi)}`, r.suffix && !t.suffix && `suffix ${r.suffix}`].filter(Boolean)
        if (missing.length)
          add({
            brgy: b.name,
            rows: { [t.id]: `ID: the photo of the ID shows ${missing.join(' and ')}, which the list leaves out.` },
            msg: `ID · ${row}, ${nm}: the ID photo shows ${missing.join(' and ')}`,
            why: 'If the ID has it, add it: the Masterlist, Payroll and Certification would print the name without it.',
          })
      }
    })

    // The signed Barangay Certification: every tanod on it, and nobody else.
    const cert = refs.certs[b.name]
    if (!cert?.length) continue
    const used = new Set<number>()
    b.tanods.forEach((t, i) => {
      if (!clean(t.last) || !clean(t.first)) return
      const row = `Row ${i + 1}`
      const nm = fullName(t)
      let k = cert.findIndex((c, j) => !used.has(j) && sameName(c, t))
      if (k >= 0) {
        used.add(k)
        const c = cert[k]
        if (cleanMI(c.mi) && cleanMI(t.mi) && cleanMI(c.mi) !== cleanMI(t.mi))
          add({
            brgy: b.name,
            rows: { [t.id]: `Certification: written with M.I. ${cleanMI(c.mi)} on the signed certification.` },
            msg: `Certification · ${row}, ${nm}: M.I. is ${cleanMI(c.mi)} on the signed certification`,
            why: 'The certification and the list must name each tanod the same way. Fix whichever is wrong.',
          })
        return
      }
      k = cert.findIndex((c, j) => !used.has(j) && nearName(c, t))
      if (k >= 0) {
        used.add(k)
        add({
          brgy: b.name,
          rows: { [t.id]: `Certification: spelled ${show(cert[k])} on the signed certification.` },
          msg: `Certification · ${row}, ${nm}: spelled ${show(cert[k])} on the signed certification`,
          why: 'The certification and the list must spell each name the same way. Fix whichever is wrong; a corrected certification needs signing again.',
        })
        return
      }
      add({
        brgy: b.name,
        rows: { [t.id]: 'Certification: not on the signed certification.' },
        msg: `Certification · ${row}, ${nm}: not on the signed certification`,
        why: 'Every tanod on the list must be named on the Barangay Certification. Print it again from Templates and have it signed.',
      })
    })
    cert.forEach((c, j) => {
      if (used.has(j) || !clean(c.last)) return
      add({
        brgy: b.name,
        rows: null,
        msg: `Certification: ${show(c)} is on the signed certification but not on the list`,
        why: 'Add them to the list if they are a tanod this year; otherwise the certification needs correcting.',
      })
    })
  }
  return out
}

export function validate(sub: Submission, currentYear: number, last: LastYear | null = null, refs: References | null = null): Issue[] {
  const out: Issue[] = []
  const add = (o: Partial<Issue> & Pick<Issue, 'kind' | 'msg'>) =>
    out.push({ level: 'error', brgy: null, also: null, rows: null, why: '', sms: null, ...o })
  const seen = new Map<string, { t: Tanod; b: string }>()
  const tag = `– Liga Rep, ${sub.municipality}`

  for (const b of sub.brgys) {
    const n = b.tanods.length
    if (!n) continue
    if (n > b.limit)
      add({
        kind: 'limit', brgy: b.name,
        msg: `${n} tanods listed, but the limit is ${b.limit}`,
        why: `Remove ${plural(n - b.limit, 'name')}. The whole municipality's set is returned if any barangay is over its limit.`,
      })

    for (const t of b.tanods) {
      const nm = fullName(t) || 'Unnamed row'
      if (!clean(t.last) || !clean(t.first))
        add({
          kind: 'name', brgy: b.name, rows: { [t.id]: 'Needs both a last name and a first name' },
          msg: 'A row is missing a last or first name', why: 'Every row needs both names.',
        })

      const ids = t.ids || 0
      if (ids < 3)
        add({
          kind: 'ids', brgy: b.name, rows: { [t.id]: 'ID photocopy not signed yet' },
          msg: `${nm}: ID photocopy not signed yet`, why: 'Print it (Templates, ID photocopy for signing), have the tanod sign it three times, then tick "ID signed".',
          sms: `Hi ${clean(t.first) || 'po'}, kulang pa sang ${3 - ids} ka pirma ang imo ID photocopy para sa Tanod Incentive CY ${sub.year}. Palihog pirmahi kag ipasa sa barangay hall dayon. Salamat! ${tag}`,
        })

      if (!clean(t.last) || !clean(t.first)) continue
      const k = nameKey(t)
      const p = seen.get(k)
      if (!p) {
        seen.set(k, { t, b: b.name })
        continue
      }
      const here = p.b === b.name
      const other = fullName(p.t)
      if (cleanMI(p.t.mi) === cleanMI(t.mi) && p.t.suffix === t.suffix)
        add({
          kind: 'dup', brgy: b.name, also: here ? null : p.b,
          rows: {
            [t.id]: here ? 'Listed twice in this barangay' : `Also listed in ${p.b}`,
            [p.t.id]: here ? 'Listed twice in this barangay' : `Also listed in ${b.name}`,
          },
          msg: here ? `${nm} is listed twice` : `${nm} is also listed in ${p.b}`,
          why: 'A tanod can be listed only once in the municipality. Remove one of the two rows.',
        })
      else
        add({
          level: 'warn', kind: 'similar', brgy: b.name, also: here ? null : p.b,
          rows: {
            [t.id]: `Similar to ${other}${here ? '' : ' in ' + p.b}. Check the ID.`,
            [p.t.id]: `Similar to ${nm}${here ? '' : ' in ' + b.name}. Check the ID.`,
          },
          msg: `Similar names: ${nm} and ${other}${here ? '' : ` (${p.b})`}`,
          why: 'Check the spelling and middle initial against their IDs.',
        })
    }

    if (!b.docs.cert)
      add({
        kind: 'doc', brgy: b.name, msg: 'Barangay Certification not yet received',
        why: 'Signed by the Punong Barangay. Required for every barangay.',
        sms: `Good day! Paalala para sa Tanod Incentive CY ${sub.year}: kinahanglan pa ang Barangay Certification sang Brgy. ${b.name}. Palihog ipasa sa labing madali. ${tag}`,
      })
    if (!b.docs.designation)
      add({
        kind: 'doc', brgy: b.name, msg: 'Proof of designation of the authorized representative is missing',
        why: 'The representative can change each year, so this is needed every year.',
        sms: `Good day! Kinahanglan pa ang proof of designation sang authorized representative sang Brgy. ${b.name} para sa Tanod Incentive CY ${sub.year}. Salamat! ${tag}`,
      })
    if (b.docs.viaRep && !b.docs.spa)
      add({ kind: 'doc', brgy: b.name, msg: 'Claiming through a representative, but no SPA yet', why: 'Attach the Special Power of Attorney.' })
  }

  const empty = sub.brgys.filter((b) => !b.tanods.length)
  if (empty.length)
    add({
      level: 'warn', kind: 'empty', msg: `${plural(empty.length, 'barangay')} not started yet`,
      why: empty.slice(0, 6).map((b) => b.name).join(', ') + (empty.length > 6 ? `, and ${empty.length - 6} more` : ''),
    })

  const blank = SIG_REQUIRED.filter((k) => !clean(sub.sig[k]))
  if (blank.length)
    add({
      kind: 'setup', msg: `Signatory name blank: ${blank.map((k) => SIG_LABELS[k]).join(', ')}`,
      why: 'Every page prints these names. Fill them in under Setup.',
    })
  if (sub.year !== currentYear)
    add({
      level: 'warn', kind: 'setup', msg: `Calendar year is set to ${sub.year}`,
      why: `Payroll and masterlist titles will say CY ${sub.year}. This year is ${currentYear}.`,
    })

  const { amt } = totals(sub)
  const payee = expectedPayee(sub)
  if (sub.obr.payee || sub.obr.amount) {
    if (norm(sub.obr.payee) !== norm(payee))
      add({ kind: 'obr', msg: 'ObR payee does not match the payroll', why: `ObR says “${sub.obr.payee || '—'}”. Payroll award #1 is “${payee}”.` })
    if (digits(sub.obr.amount) !== amt)
      add({ kind: 'obr', msg: 'ObR amount does not match the payroll total', why: `ObR: ${peso(digits(sub.obr.amount))}. Payroll: ${peso(amt)}.` })
  } else add({ level: 'warn', kind: 'obr', msg: 'Obligation Request not entered yet', why: 'Enter the ObR payee and amount once the province issues it.' })

  return [...out, ...nameChecks(sub, last), ...crossChecks(sub, refs)]
}

export interface Analysis {
  issues: Issue[]
  notes: Record<string, RowNote[]>
  status: Record<string, BarangayStatus>
  errs: number
  ready: number
  awards: Record<string, number>
  totals: ReturnType<typeof totals>
}

/** Everything the screens need, computed once per change. */
export function analyze(sub: Submission, currentYear: number, last: LastYear | null = null, refs: References | null = null): Analysis {
  const issues = validate(sub, currentYear, last, refs)
  const notes: Record<string, RowNote[]> = {}
  for (const i of issues)
    if (i.rows)
      for (const [id, text] of Object.entries(i.rows))
        (notes[id] ??= []).push({ level: i.level, kind: i.kind, text, sms: i.sms, brgy: i.brgy })

  const status: Record<string, BarangayStatus> = {}
  for (const b of sub.brgys) {
    if (!b.tanods.length) {
      status[b.name] = { tone: 'idle', label: 'Not started' }
      continue
    }
    // Advice ('check') is shown but doesn't hold a barangay back from "Ready".
    const mine = issues.filter((i) => (i.brgy === b.name || i.also === b.name) && i.kind !== 'check')
    const e = mine.filter((i) => i.level === 'error').length
    status[b.name] = e
      ? { tone: 'bad', label: plural(e, 'issue') }
      : mine.length ? { tone: 'warn', label: 'Check names' } : { tone: 'ok', label: 'Ready' }
  }

  return {
    issues,
    notes,
    status,
    errs: issues.filter((i) => i.level === 'error').length,
    ready: sub.brgys.filter((b) => status[b.name].tone === 'ok').length,
    awards: awards(sub),
    totals: totals(sub),
  }
}

/** A secretary works on one barangay: municipality-wide setup and ObR checks are the Liga Rep's. */
export function scopeToBarangay(A: Analysis, name: string): Analysis {
  const issues = A.issues.filter((i) => i.brgy === name)
  return { ...A, issues, errs: issues.filter((i) => i.level === 'error').length }
}

export const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'todo', label: 'Needs work' },
  { value: 'ready', label: 'Ready' },
  { value: 'empty', label: 'Not started' },
]

export const matchesFilter = (f: Filter, tone: Tone) =>
  f === 'all' || (f === 'todo' && (tone === 'bad' || tone === 'warn')) || (f === 'ready' && tone === 'ok') || (f === 'empty' && tone === 'idle')
