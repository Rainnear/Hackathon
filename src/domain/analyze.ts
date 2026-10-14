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

export function validate(sub: Submission, currentYear: number): Issue[] {
  const out: Issue[] = []
  const add = (o: Partial<Issue> & Pick<Issue, 'kind' | 'msg'>) =>
    out.push({ level: 'error', brgy: null, also: null, rows: null, why: '', sms: null, ...o })
  const seen = new Map<string, { t: Tanod; b: string }>()
  const tag = `– Tanod Rep, ${sub.municipality}`

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
          kind: 'ids', brgy: b.name, rows: { [t.id]: `ID photocopy has ${ids} of 3 signatures` },
          msg: `${nm}: ID photocopy has ${ids} of 3 signatures`, why: 'Each ID photocopy needs 3 signatures.',
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

  return out
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
export function analyze(sub: Submission, currentYear: number): Analysis {
  const issues = validate(sub, currentYear)
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
    const mine = issues.filter((i) => i.brgy === b.name || i.also === b.name)
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

/** A secretary works on one barangay: municipality-wide setup and ObR checks are the Tanod Rep's. */
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
