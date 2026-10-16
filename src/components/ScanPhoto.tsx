import { useEffect, useState } from 'react'

import { photoBlobUrl } from '../lib/scans'

/** One ID photo from private storage. Tap to open it full size. */
export function ScanPhoto({ path, label }: { path: string | null; label: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!path) return
    let alive = true
    photoBlobUrl(path).then(
      (u) => alive && setUrl(u),
      () => alive && setFailed(true),
    )
    return () => {
      alive = false
    }
  }, [path])
  if (!path) return <div className="scan-photo missing">No {label.toLowerCase()} photo</div>
  return (
    <figure className="scan-photo">
      {url && !failed ? (
        <a href={url} target="_blank" rel="noopener noreferrer" title="Open full size">
          <img src={url} alt={`${label} of the ID`} onError={() => setFailed(true)} />
        </a>
      ) : (
        <div className="ph">{failed ? 'Photo could not load. Check your internet.' : 'Loading photo…'}</div>
      )}
      <figcaption>{label} · tap to enlarge</figcaption>
    </figure>
  )
}
