import { useEffect, useState } from 'react'

import { fullName } from '../domain/format'
import { POSITIONS, type Barangay, type Tanod } from '../domain/types'
import { photoUrl } from '../lib/scans'

const POS_LABEL = Object.fromEntries(POSITIONS.map((p) => [p.value, p.label]))

/** The scanned ID photo, or an empty box to attach the photocopy by hand when there is no scan. */
function IdSide({ path, label }: { path: string | null | undefined; label: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!path) return
    let alive = true
    photoUrl(path).then(
      (u) => alive && setUrl(u),
      () => alive && setFailed(true),
    )
    return () => {
      alive = false
    }
  }, [path])
  return (
    <figure className="id-side">
      <div className="id-frame">
        {path && url ? (
          <img src={url} alt={`${label} of the ID`} />
        ) : (
          <span className="id-attach">{path && !failed ? 'Loading the photo…' : `Attach the ${label.toLowerCase()} of the ID here`}</span>
        )}
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  )
}

/**
 * One page per tanod: their ID (front and back) with three lines for their signature, for the ID
 * photocopy that goes with the set. Without a scanned ID, the boxes are left to attach a photocopy.
 */
export function IdCopy({ municipality, year, b, t, front, back }: { municipality: string; year: number; b: Barangay; t: Tanod; front: string | null; back: string | null }) {
  const name = fullName(t)
  return (
    <div className="page portrait idcopy">
      <div className="ml-head">
        Republic of the Philippines<br />
        <b>PROVINCE OF ILOILO</b><br />
        <b>Municipality of <u>{municipality.toUpperCase()}</u> · Barangay <u>{b.name.toUpperCase()}</u></b>
        <div className="t">PHOTOCOPY OF VALID ID · BARANGAY TANOD · CY {year}</div>
      </div>
      <div className="id-who">
        <span>Name: <u>{name || ' '}</u></span>
        <span>Position: <u>{POS_LABEL[t.pos] ?? t.pos}</u></span>
      </div>
      <div className="id-sides">
        <IdSide path={front} label="Front" />
        <IdSide path={back} label="Back" />
      </div>
      <div className="id-sigs">
        {[1, 2, 3].map((k) => (
          <div key={k}>
            <div className="nm">{name}</div>
            Signature {k} over printed name
          </div>
        ))}
      </div>
    </div>
  )
}
