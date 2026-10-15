import { create } from 'zustand'

// The Barangay Certification's dates, remembered on this device for each year. (The Punong Barangay's
// name used to be kept here too; it now lives with the barangay's details, and old entries are only read.)

export interface CertDates {
  /** "as of" date for the six months of service, yyyy-mm-dd. */
  asOf: string
  /** Date issued, yyyy-mm-dd. */
  issued: string
  /** Leave the day blank, to write by hand when signed. */
  blankDay: boolean
}

const KEY = 'sakto-certification'
interface Saved {
  years: Record<string, CertDates>
  captains: Record<string, string>
}
function read(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null
    return { years: s?.years ?? {}, captains: s?.captains ?? {} }
  } catch {
    return { years: {}, captains: {} }
  }
}

export const useCertSaved = create<Saved>(read)

export const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The year's certification dates, or today's until they are set. */
export const certDatesFor = (s: Saved, year: number): CertDates => s.years[year] ?? { asOf: todayIso(), issued: todayIso(), blankDay: true }

export function setCertDates(year: number, patch: Partial<CertDates>) {
  const s = useCertSaved.getState()
  const next: Saved = { ...s, years: { ...s.years, [year]: { ...certDatesFor(s, year), ...patch } } }
  useCertSaved.setState(next)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* storage blocked: the dates just aren't remembered */
  }
}

/** A Punong Barangay's name typed on this device before it moved to the barangay's details. */
export const legacyCaptain = (s: Saved, municipality: string, barangay: string) => s.captains[`${municipality}/${barangay}`] ?? ''
