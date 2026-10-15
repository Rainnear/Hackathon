import { useEffect, useState } from 'react'

import { fullName } from '../domain/format'
import type { Tanod } from '../domain/types'
import { photoUrl } from '../lib/scans'

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
    </figure>
  )
}

/**
 * One page per tanod, laid out like a plain ID photocopy so it matches the ones tanods print themselves:
 * no header, the front above the back at the ID's real size, and three signature lines with the
 * tanod's name at the bottom. Without a scanned ID, the boxes are left to attach a photocopy.
 */
export function IdCopy({ t, front, back }: { t: Tanod; front: string | null; back: string | null }) {
  const name = fullName(t)
  return (
    <div className="page portrait idcopy">
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
