import { MIN_AMOUNT, PROVINCIAL_SIGNATORIES, findMunicipality, type MunicipalityRef } from '../data/municipalities'
import { isUuid, newId } from './format'
import { DEPARTURE_REASONS, POSITIONS, SUFFIXES, type Barangay, type Departure, type Position, type Signatories, type Submission, type Suffix, type Tanod } from './types'

export const blankBarangay = (name: string, limit: number): Barangay => ({
  name,
  limit,
  tanods: [],
  docs: { cert: false, designation: false, viaRep: false, spa: false },
  focal: { name: '', phone: '' },
  officials: { captain: '', secretary: '' },
  left: [],
})

export const blankTanod = (): Tanod => ({ id: newId(), last: '', first: '', mi: '', suffix: '', pos: 'BARANGAY TANOD', ids: 0 })

const blankSignatories = (): Signatories => ({ liga: '', mlgoo: '', disb: '', ...PROVINCIAL_SIGNATORIES })

export function newSubmission(muni: MunicipalityRef, year: number): Submission {
  return {
    version: 1,
    municipality: muni.name,
    year,
    amount: MIN_AMOUNT,
    sig: blankSignatories(),
    obr: { no: '', payee: '', amount: '' },
    brgys: muni.barangays.map(([name, limit]) => blankBarangay(name, limit)),
    barangayDue: '',
    provinceDue: '',
  }
}

// ---------- Sample data: invented tanod names, for trying the app ----------
const LASTS = ['DELA CRUZ', 'SANTOS', 'REYES', 'GARCIA', 'MENDOZA', 'TORRES', 'VILLANUEVA', 'CASTILLO', 'FLORES', 'RAMOS', 'GONZAGA', 'PALMA', 'SOLIS', 'DIONISIO', 'ESPINOSA', 'LIM', 'TAN', 'GALLEGO', 'BELARMINO', 'CABALUNA', 'DORADO', 'FUENTES', 'JAVELLANA', 'LEDESMA', 'MONTINOLA', 'PEÑAFLORIDA', 'SALCEDO', 'TUPAS', 'VILLAREAL', 'ZAMORA']
const FIRSTS = ['JUAN', 'PEDRO', 'JOSE', 'RAMON', 'MARIO', 'ROLANDO', 'ERNESTO', 'ARNEL', 'JOEL', 'DANILO', 'ROMEO', 'RENATO', 'EDGAR', 'NESTOR', 'ANTONIO', 'FELIPE', 'RICARDO', 'MANUEL', 'BENJIE', 'JUNREY', 'MARIA', 'ROSALIE', 'ELENA', 'GLORIA', 'LIEZEL']
const MIS = 'ABCDEFGJLMNOPRSTV'

export function sampleSubmission(year: number): Submission {
  let seed = 7
  const rnd = (n: number) => {
    seed = (seed * 9301 + 49297) % 233280
    return Math.floor((seed / 233280) * n)
  }
  const fake = (i: number): Tanod => ({
    id: newId(),
    last: LASTS[rnd(LASTS.length)],
    first: FIRSTS[rnd(FIRSTS.length)],
    mi: MIS[rnd(MIS.length)] + '.',
    suffix: rnd(9) === 0 ? 'JR.' : '',
    pos: i === 0 ? 'CHIEF TANOD' : 'BARANGAY TANOD',
    ids: 3,
  })

  const sub = newSubmission(findMunicipality('Ajuy')!, year)
  sub.sig.liga = 'HON. RODEL C. SAMPLE'
  sub.sig.mlgoo = 'ENGR. MARIA T. SAMPLE'
  const fill = (name: string, n: number, o: { cert?: boolean; des?: boolean; focal: string; phone: string }) => {
    const b = sub.brgys.find((x) => x.name === name)!
    for (let i = 0; i < n; i++) b.tanods.push(fake(i))
    b.docs.cert = o.cert !== false
    b.docs.designation = o.des !== false
    b.focal = { name: o.focal, phone: o.phone }
    return b
  }
  const adc = fill('Adcadarao', 13, { focal: 'Kgd. Lito Javellana', phone: '0917 555 0101' })
  fill('Agbobolo', 9, { focal: 'Kgd. Ana Palma', phone: '0918 555 0102' })
  const bad = fill('Badiangan', 10, { focal: 'Kgd. Ramil Tupas', phone: '0919 555 0103' })
  bad.tanods[3].ids = 1
  bad.tanods[7].ids = 2
  fill('Central', 9, { cert: false, focal: 'Kgd. Joy Salcedo', phone: '0920 555 0104' })
  const nas = fill('Nasidman', 7, { focal: 'Kgd. Ben Dorado', phone: '0921 555 0105' })
  const roj = fill('Rojas', 6, { des: false, focal: 'Kgd. Cora Lim', phone: '0922 555 0106' })
  const a = adc.tanods[2]
  roj.tanods[4] = { ...roj.tanods[4], last: a.last, first: a.first, mi: a.mi, suffix: a.suffix }
  const c = adc.tanods[5]
  nas.tanods[2] = { ...nas.tanods[2], last: c.last, first: c.first, mi: c.mi === 'A.' ? 'B.' : 'A.', suffix: c.suffix }
  fill('Luca', 12, { focal: 'Kgd. Nonoy Gallego', phone: '0923 555 0107' })
  return sub
}

// ---------- Loading saved or imported data defensively ----------
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

function toTanod(raw: unknown): Tanod | null {
  if (!isObj(raw)) return null
  const suffix = SUFFIXES.includes(raw.suffix as Suffix) ? (raw.suffix as Suffix) : ''
  const pos = POSITIONS.some((p) => p.value === raw.pos) ? (raw.pos as Position) : 'BARANGAY TANOD'
  const ids = Math.max(0, Math.min(3, Math.floor(Number(raw.ids) || 0)))
  // Older saves used short non-UUID ids; Supabase needs UUIDs.
  return { id: isUuid(str(raw.id)) ? str(raw.id) : newId(), last: str(raw.last), first: str(raw.first), mi: str(raw.mi), suffix, pos, ids }
}

function toDeparture(raw: Record<string, unknown>): Departure[] {
  const reason = DEPARTURE_REASONS.find((r) => r.value === raw.reason)?.value
  return isUuid(str(raw.tanodId)) && reason ? [{ tanodId: str(raw.tanodId), name: str(raw.name), reason, note: str(raw.note) }] : []
}

/** Accepts anything that looks like a submission (including the HTML prototype's saved state) and fills gaps. */
export function normalizeSubmission(raw: unknown): Submission | null {
  if (!isObj(raw) || !Array.isArray(raw.brgys)) return null
  // Barangays and limits come from the saved data when it has them (they were downloaded from Supabase),
  // otherwise from the built-in reference list.
  const saved = raw.brgys.filter(isObj).filter((b) => str(b.name) && Number(b.limit) > 0)
  const muni: MunicipalityRef =
    saved.length === raw.brgys.length && saved.length > 0
      ? { name: str(raw.municipality), barangays: saved.map((b) => [str(b.name), Number(b.limit)] as [string, number]) }
      : (findMunicipality(str(raw.municipality)) ?? findMunicipality('Ajuy')!)
  const base = newSubmission(muni, Number(raw.year) || new Date().getFullYear())
  const byName = new Map(raw.brgys.filter(isObj).map((b) => [str(b.name), b]))
  const sig = isObj(raw.sig) ? raw.sig : {}
  const obr = isObj(raw.obr) ? raw.obr : {}
  return {
    ...base,
    amount: Math.max(MIN_AMOUNT, Number(raw.amount) || MIN_AMOUNT),
    sig: Object.fromEntries(Object.entries(base.sig).map(([k, v]) => [k, typeof sig[k] === 'string' ? sig[k] : v])) as unknown as Signatories,
    obr: { no: str(obr.no), payee: str(obr.payee), amount: str(obr.amount) },
    barangayDue: str(raw.barangayDue),
    provinceDue: str(raw.provinceDue),
    // Barangays and limits always come from the reference list; saved rosters attach by name.
    brgys: base.brgys.map((b) => {
      const s = byName.get(b.name)
      if (!s) return b
      const docs = isObj(s.docs) ? s.docs : {}
      const focal = isObj(s.focal) ? s.focal : {}
      const officials = isObj(s.officials) ? s.officials : {}
      return {
        ...b,
        tanods: Array.isArray(s.tanods) ? s.tanods.map(toTanod).filter((t): t is Tanod => !!t) : [],
        docs: { cert: !!docs.cert, designation: !!docs.designation, viaRep: !!docs.viaRep, spa: !!docs.spa },
        focal: { name: str(focal.name), phone: str(focal.phone) },
        officials: { captain: str(officials.captain), secretary: str(officials.secretary) },
        left: Array.isArray(s.left) ? s.left.filter(isObj).flatMap(toDeparture) : [],
      }
    }),
  }
}

// ---------- Backup files ----------
export interface BackupFile {
  app: 'sakto'
  kind: 'backup'
  version: 1
  savedAt: string
  submission: Submission
}

export const backupFileName = (sub: Submission, d = new Date()) =>
  `sakto-${sub.municipality.toLowerCase().replace(/\W+/g, '-')}-cy${sub.year}-${d.toISOString().slice(0, 10)}.json`

export const makeBackup = (sub: Submission): string =>
  JSON.stringify({ app: 'sakto', kind: 'backup', version: 1, savedAt: new Date().toISOString(), submission: sub } satisfies BackupFile, null, 2)

export type ParsedBackup = { ok: true; sub: Submission; savedAt: string | null } | { ok: false; error: string }

export function parseBackup(text: string): ParsedBackup {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: 'This file is not a Sakto backup. Choose the .json file you exported from Sakto.' }
  }
  const inner = isObj(data) && data.app === 'sakto' ? data.submission : data
  const sub = normalizeSubmission(inner)
  if (!sub) return { ok: false, error: 'This file does not contain Sakto data. Choose the .json file you exported from Sakto.' }
  return { ok: true, sub, savedAt: isObj(data) && typeof data.savedAt === 'string' ? data.savedAt : null }
}
