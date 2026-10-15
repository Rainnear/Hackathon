import { useAuth } from './auth'
import { useStore, waitingCount } from './store'
import { syncNow, useSync } from './sync'

/** Whether the signed-in person may change the list right now. */
export function useEditable() {
  const role = useAuth((s) => s.profile?.role)
  const status = useStore((s) => s.remote?.status)
  // The provincial office views each municipality read-only (it changes only tanod limits, separately).
  if (role === 'admin') return false
  if (!status || status === 'open') return true
  return status === 'submitted' && role !== 'secretary'
}

/** Sign out, warning first if this device still has changes that never reached Supabase. */
export function useSafeSignOut() {
  const signOut = useAuth((s) => s.signOut)
  const n = useStore(waitingCount)
  return async () => {
    // Online: send what is waiting first, so signing out loses nothing.
    if (n && useSync.getState().online) await syncNow().catch(() => {})
    const left = waitingCount(useStore.getState())
    if (left && !window.confirm(`${left} ${left === 1 ? 'change has' : 'changes have'} not been uploaded yet. If you sign out now, ${left === 1 ? 'it' : 'they'} will be erased from this device. Sign out anyway?`)) return
    void signOut()
  }
}
