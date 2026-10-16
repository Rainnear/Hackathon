import { MIN_AMOUNT } from '../data/municipalities'
import { SIG_LABELS, SIG_REQUIRED } from './analyze'
import { clean } from './format'
import type { SignatoryKey, Submission } from './types'

export type SetupStepId = 'year' | 'deadline' | 'masterlist' | 'payroll' | 'backup'

export interface SetupStep {
  id: SetupStepId
  title: string
  /** What still has to be filled in before this step is done. */
  missing: string[]
  /** Filled in, but worth a second look. */
  warn: string[]
  /** Nice to have; never counted as missing. */
  optional?: boolean
}

export const MASTERLIST_SIGS: SignatoryKey[] = ['liga', 'mlgoo']
export const PAYROLL_SIGS: SignatoryKey[] = ['auth', 'authPos', 'acct', 'treas', 'lce', 'disb']

const blank = (sub: Submission, keys: SignatoryKey[]) =>
  keys.filter((k) => SIG_REQUIRED.includes(k) && !clean(sub.sig[k])).map((k) => `${SIG_LABELS[k]} name`)

/** The Liga Rep's setup, one step per screen, and what each step is still missing. */
export function setupSteps(sub: Submission, lastBackupAt: string | null): SetupStep[] {
  const thisYear = new Date().getFullYear()
  const late = !!sub.barangayDue && !!sub.provinceDue && sub.barangayDue > sub.provinceDue
  return [
    {
      id: 'year', title: 'Year and amount',
      missing: Number(sub.amount) >= MIN_AMOUNT ? [] : ['Amount per tanod'],
      warn: sub.year !== thisYear ? [`The year is CY ${sub.year}, not ${thisYear}`] : [],
    },
    {
      id: 'deadline', title: 'Deadlines',
      missing: sub.barangayDue ? [] : ['Date barangays submit to you'],
      warn: late ? ["Your date is after the province's deadline"] : [],
    },
    { id: 'masterlist', title: 'Masterlist signatories', missing: blank(sub, MASTERLIST_SIGS), warn: [] },
    { id: 'payroll', title: 'Payroll signatories', missing: blank(sub, PAYROLL_SIGS), warn: [] },
    { id: 'backup', title: 'Backup', missing: [], warn: lastBackupAt ? [] : ['No backup file saved yet'], optional: true },
  ]
}

/** Steps that still have something missing (the optional backup never counts). */
export const stepsLeft = (steps: SetupStep[]) => steps.filter((s) => s.missing.length > 0)
