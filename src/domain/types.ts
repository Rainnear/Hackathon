export const SUFFIXES = ['', 'JR.', 'SR.', 'II', 'III', 'IV'] as const
export type Suffix = (typeof SUFFIXES)[number]

export const POSITIONS = [
  { value: 'BARANGAY TANOD', label: 'Barangay tanod' },
  { value: 'CHIEF TANOD', label: 'Chief tanod' },
] as const
export type Position = (typeof POSITIONS)[number]['value']

export interface Tanod {
  id: string
  last: string
  first: string
  /** Stored as typed while editing; cleaned to "A." on blur. */
  mi: string
  suffix: Suffix
  pos: Position
  /** Signatures on the ID photocopy, 0 to 3. */
  ids: number
}

export interface BarangayDocs {
  cert: boolean
  designation: boolean
  viaRep: boolean
  spa: boolean
}
export type DocKey = keyof BarangayDocs

export interface Focal {
  name: string
  phone: string
}

export const DEPARTURE_REASONS = [
  { value: 'resigned', label: 'Resigned' },
  { value: 'removed', label: 'Removed' },
  { value: 'deceased', label: 'Passed away' },
  { value: 'moved', label: 'Moved away' },
  { value: 'other', label: 'Other reason' },
] as const
export type DepartureReason = (typeof DEPARTURE_REASONS)[number]['value']

/** A tanod from last year who is not in this year's list, and why. */
export interface Departure {
  tanodId: string
  /** Their name as it was, since they are no longer in the list. */
  name: string
  reason: DepartureReason
  note: string
}

export interface Barangay {
  name: string
  limit: number
  tanods: Tanod[]
  docs: BarangayDocs
  focal: Focal
  /** Last year's tanods who did not continue this year. */
  left: Departure[]
}

export interface Signatories {
  liga: string
  mlgoo: string
  auth: string
  authPos: string
  acct: string
  treas: string
  lce: string
  disb: string
}
export type SignatoryKey = keyof Signatories

export interface Obr {
  no: string
  payee: string
  amount: string
}
export type ObrKey = keyof Obr

export interface Submission {
  version: 1
  municipality: string
  year: number
  amount: number
  sig: Signatories
  obr: Obr
  brgys: Barangay[]
}

export type Level = 'error' | 'warn'
export type IssueKind = 'limit' | 'name' | 'ids' | 'dup' | 'similar' | 'doc' | 'empty' | 'setup' | 'obr'

export interface Issue {
  level: Level
  kind: IssueKind
  /** null means the issue is about the whole submission. */
  brgy: string | null
  /** A second barangay the issue touches (a duplicate name across barangays). */
  also: string | null
  /** Short notes shown under specific roster rows, keyed by tanod id. */
  rows: Record<string, string> | null
  msg: string
  why: string
  sms: string | null
}

export interface RowNote {
  level: Level
  kind: IssueKind
  text: string
  sms: string | null
  brgy: string | null
}

export type Tone = 'idle' | 'bad' | 'warn' | 'ok'
export interface BarangayStatus {
  tone: Tone
  label: string
}

export type Filter = 'all' | 'todo' | 'ready' | 'empty'
export type DocView = 'masterlist' | 'payroll' | 'cover'
