import type { Session } from '@supabase/supabase-js'
import { create } from 'zustand'

import { destroyDeviceKey, lockWrites, unlockWrites, vaultDel } from '../lib/vault'
import { fetchProfile, supabase, supabaseConfigured, type Profile } from '../lib/supabase'
import { leaveMunicipality } from './adminView'
import { useScans } from './scans'
import { PRESYNC_KEY } from './sync'
import { resetLocalStore } from './store'

type Status = 'loading' | 'signedOut' | 'signedIn' | 'recovery'

interface AuthState {
  status: Status
  session: Session | null
  profile: Profile | null
  /** False while the first profile lookup after sign-in is still running and there is no cached copy. */
  profileLoaded: boolean
  /** True when the profile shown is the cached copy because the network was unavailable. */
  offline: boolean
  /** Set once the person has chosen a new password this session (see mustChangePassword). */
  passwordChanged: boolean
  markPasswordChanged: () => void
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
  finishRecovery: () => void
}

// A copy of the profile lets a signed-in secretary open the app with no signal.
const CACHE_KEY = 'sakto-profile'
const readCache = (userId: string): Profile | null => {
  try {
    const p = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as Profile | null
    return p && p.id === userId ? p : null
  } catch {
    return null
  }
}
const writeCache = (p: Profile | null) => {
  try {
    if (p) localStorage.setItem(CACHE_KEY, JSON.stringify(p))
    else localStorage.removeItem(CACHE_KEY)
  } catch {
    /* storage blocked: the app still works online */
  }
}

/** Everything Sakto keeps on this device for the person who just signed out, so the next person finds nothing. */
async function wipeLocalData() {
  lockWrites()
  writeCache(null)
  leaveMunicipality()
  for (const k of ['sakto-help-draft', 'sakto-certification']) {
    try {
      localStorage.removeItem(k)
    } catch {
      /* storage blocked: nothing was kept */
    }
  }
  useScans.setState({ list: [], queue: null, index: 0 })
  await Promise.allSettled([resetLocalStore(), vaultDel(PRESYNC_KEY)])
  await destroyDeviceKey().catch(() => {})
}

export const useAuth = create<AuthState>()((set, get) => ({
  status: supabaseConfigured ? 'loading' : 'signedOut',
  session: null,
  profile: null,
  profileLoaded: false,
  offline: false,
  passwordChanged: false,
  markPasswordChanged: () => set({ passwordChanged: true }),

  refreshProfile: async () => {
    const session = get().session
    if (!session) return
    try {
      const profile = await fetchProfile(session.user.id)
      writeCache(profile)
      set({ profile, offline: false, profileLoaded: true })
    } catch {
      set({ profile: readCache(session.user.id), offline: true, profileLoaded: true })
    }
  },

  signOut: async () => {
    // Local scope signs out on this device even without internet.
    await supabase.auth.signOut({ scope: 'local' })
    await wipeLocalData()
    set({ status: 'signedOut', session: null, profile: null, profileLoaded: false, passwordChanged: false })
  },

  finishRecovery: () => set({ status: 'signedIn' }),
}))

if (supabaseConfigured) {
  supabase.auth.onAuthStateChange((event, session) => {
    // Supabase warns against awaiting other Supabase calls inside this callback, so defer the profile fetch.
    setTimeout(() => {
      const prev = useAuth.getState()
      if (event === 'PASSWORD_RECOVERY') {
        useAuth.setState({ status: 'recovery', session })
        return
      }
      if (!session) {
        useAuth.setState({ status: 'signedOut', session: null, profile: null, profileLoaded: false })
        return
      }
      const sameUser = prev.session?.user.id === session.user.id
      const profile = sameUser ? prev.profile : readCache(session.user.id)
      useAuth.setState({
        session,
        status: prev.status === 'recovery' ? 'recovery' : 'signedIn',
        profile,
        profileLoaded: sameUser ? prev.profileLoaded : profile !== null,
      })
      if (!sameUser || event === 'SIGNED_IN' || event === 'USER_UPDATED') void useAuth.getState().refreshProfile()
    }, 0)
  })
}

/**
 * Accounts made with a starting password (the built-in administrator accounts) carry
 * app_metadata.must_change_password until the password really changes; Supabase removes the mark then.
 */
export const useMustChangePassword = () =>
  useAuth((s) => s.status === 'signedIn' && !s.passwordChanged && s.session?.user.app_metadata?.must_change_password === true)

// A new sign-in may save on this device again.
useAuth.subscribe((s) => {
  if (s.status === 'signedIn') unlockWrites()
})
