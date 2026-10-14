// Reads a tanod's name off the front and back photos of their ID.
//
// STAND-IN: no OCR service is connected yet. To connect one, replace readId's body with a call to it,
// ideally a Supabase Edge Function (supabase.functions.invoke('read-id', ...)) so the service's API key
// stays on the server, then set READER_CONNECTED to true. Keep the IdFields shape: the review pop-up,
// the scans table and the phone app all use it.
import type { Suffix } from '../domain/types'

export type IdField = 'last' | 'first' | 'mi' | 'suffix' | 'birthdate'

export interface IdFields {
  last: string
  first: string
  mi: string
  suffix: Suffix
  /** As printed on the ID, if found. Shown to help tell apart people with the same name. */
  birthdate: string
  /** 0 to 1 per field; the pop-up asks the secretary to check anything below 0.8 or empty. */
  confidence: Partial<Record<IdField, number>>
  /** Which reader produced this: 'none' until a service is connected. */
  reader: string
}

/** False while readId is the stand-in. The review pop-up then asks the secretary to type from the photo. */
export const READER_CONNECTED = false

export const blankFields = (reader = 'none'): IdFields => ({ last: '', first: '', mi: '', suffix: '', birthdate: '', confidence: {}, reader })

const SAMPLE_LAST = ['DELA CRUZ', 'SANTOS', 'GALLEGO', 'JAVELLANA', 'PEÑAFLORIDA', 'TUPAS', 'VILLAREAL']
const SAMPLE_FIRST = ['JUAN', 'MARIA', 'ROLANDO', 'LIEZEL', 'JUNREY', 'ERNESTO']

export async function readId(front: Blob, back: Blob | null): Promise<IdFields> {
  void front
  void back
  // Development only: made-up values with mixed confidence, so the review screens can be tried out.
  // Production builds never invent names; the fields stay empty for the secretary to type.
  if (import.meta.env.DEV) {
    const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]
    return {
      last: pick(SAMPLE_LAST),
      first: pick(SAMPLE_FIRST),
      mi: pick(['A.', 'B.', 'S.', '']),
      suffix: pick(['', '', '', 'JR.'] as Suffix[]),
      birthdate: '1980-05-14',
      confidence: { last: 0.97, first: 0.93, mi: 0.55, suffix: 0.9, birthdate: 0.8 },
      reader: 'sample (development only)',
    }
  }
  return blankFields()
}
