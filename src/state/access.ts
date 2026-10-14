import { useAuth } from './auth'
import { useStore, waitingCount } from './store'

/** Whether the signed-in person may change the list right now. */
export function useEditable() {
  const role = useAuth((s) => s.profile?.role)
  const status = useStore((s) => s.remote?.status)
  if (!status || status === 'open') return true
  return status === 'submitted' && role !== 'secretary'
}

/** Sign out, warning first if this device still has changes that never reached Supabase. */
export function useSafeSignOut() {
  const signOut = useAuth((s) => s.signOut)
  const n = useStore(waitingCount)
  return () => {
    if (n && !window.confirm(`${n} ${n === 1 ? 'change has' : 'changes have'} not been uploaded yet. If you sign out now, ${n === 1 ? 'it' : 'they'} will be lost. Sign out anyway?`)) return
    void signOut()
  }
}
