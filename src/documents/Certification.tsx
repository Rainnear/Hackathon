import { fullName } from '../domain/format'
import type { Barangay } from '../domain/types'

// The Punong Barangay's certification of the barangay's tanods, from the provincial template
// "CERTIFICATION OF BARANGAY TANODS". Each blank in the template is filled in and underlined.

export interface CertOptions {
  /** "as of" date for the six months of service, as yyyy-mm-dd. */
  asOf: string
  /** Date issued, as yyyy-mm-dd. */
  issued: string
  /** Leave the day blank ("____ day of …") so it is written by hand when signed. */
  blankDay: boolean
  /** Punong Barangay's name; blank leaves a line to sign and print by hand. */
  captain: string
}

const longDate = (iso: string) => {
  const d = new Date(iso + 'T00:00:00')
  return isNaN(+d) ? '' : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}
const ordinal = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')

/** A filled-in blank: underlined, or a plain line when there is nothing to fill. */
const Fill = ({ children, width = '9em' }: { children?: string; width?: string }) =>
  children ? <u className="fill">{children}</u> : <span className="blank" style={{ width }} />

export function BarangayCertification({ municipality, b, o }: { municipality: string; b: Barangay; o: CertOptions }) {
  const names = b.tanods.map(fullName).filter(Boolean)
  const issued = new Date(o.issued + 'T00:00:00')
  const ok = !isNaN(+issued)
  const month = ok ? issued.toLocaleDateString('en-US', { month: 'long' }) : ''
  const year = ok ? String(issued.getFullYear()) : ''
  const day = ok && !o.blankDay ? ordinal(issued.getDate()) : ''
  return (
    <div className="page portrait bcert">
      <div className="bc-head">
        <div className="script">Republic of the Philippines</div>
        <b>PROVINCE OF ILOILO</b>
        <div><b>City/Municipality of</b> <Fill>{municipality.toUpperCase()}</Fill></div>
        <div className="bc-brgy">BARANGAY <Fill>{b.name.toUpperCase()}</Fill></div>
        <div className="bc-office">OFFICE OF THE PUNONG BARANGAY</div>
        <div className="bc-title">CERTIFICATION</div>
      </div>
      <p className="bc-to">TO WHOM IT MAY CONCERN:</p>
      <p className="ind">This is to certify that the following names:</p>
      {names.length ? (
        <ol className={`bc-names ${names.length > 20 ? 'two' : ''}`}>
          {names.map((n, i) => <li key={i}><u>{n}</u></li>)}
        </ol>
      ) : (
        <ol className="bc-names"><li><span className="blank" style={{ width: '20em' }} /></li></ol>
      )}
      <p className="ind">
        Are Barangay Tanod members of Barangay <Fill>{b.name}</Fill>, <Fill>{municipality}</Fill>, Iloilo have rendered at least six (6) months of service as of{' '}
        <Fill width="12em">{longDate(o.asOf)}</Fill>.
      </p>
      <p className="ind">This is to certify further that the above-said names of Barangay Tanod have planted and grown at least five (5) trees within this year.</p>
      <p className="ind">This certification is issued for whatever legal purpose it may serve.</p>
      <p className="ind">
        Done this <Fill width="4em">{day}</Fill> day of <Fill width="7em">{month}</Fill>, <Fill width="4em">{year}</Fill> at Barangay <Fill>{b.name}</Fill>,{' '}
        <Fill>{municipality}</Fill>, Iloilo.
      </p>
      <div className="bc-sign">
        <div className="nm">{o.captain ? o.captain.toUpperCase() : ' '}</div>
        {!o.captain && <div className="cap sig">(Signature over Printed Name)</div>}
        <div className="cap">Punong Barangay</div>
      </div>
    </div>
  )
}
