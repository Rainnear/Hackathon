import { useState } from 'react'

import { recheck } from '../state/connection'
import { useStore, waitingCount } from '../state/store'
import { useSync } from '../state/sync'

/** Stays above every page while there is no connection, so nobody wonders why something isn't uploading. */
export function ConnectionBanner() {
  const online = useSync((s) => s.online)
  const n = useStore(waitingCount)
  const [busy, setBusy] = useState(false)
  if (online) return null
  return (
    <div className="banner warn" role="status" aria-live="polite">
      <span>
        <b>No internet connection.</b> You can keep working: everything is saved on this device
        {n ? ` (${n} ${n === 1 ? 'change is' : 'changes are'} waiting to upload)` : ''} and uploads by itself when the connection returns.
        Scanning photos, changing tanod limits and managing accounts need internet.
      </span>
      <button
        type="button"
        className="btn sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          await recheck()
          setBusy(false)
        }}
      >
        {busy ? 'Checking…' : 'Check connection'}
      </button>
    </div>
  )
}
