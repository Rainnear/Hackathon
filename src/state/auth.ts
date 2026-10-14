import type { Session } from '@supabase/supabase-js'
import { create } from 'zustand'

import { fetchProfile, supabase, supabaseConfigured, type Profile } from '../lib/supabase'

type Status = 'loading' | 'signedOut' | 'signedIn' | 'recovery'

interface AuthState {
  status: Status
  session: Session | null
  profile: Profile | null
  /** False while the first profile lookup after sign-in is still running and there is no cached copy. */
  profileLoaded: boolean
  /** True when the profile shown is the cached copy because the network was unavailable. */
  offline: boolean
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

export const useAuth = create<AuthState>()((set, get) => ({
  status: supabaseConfigured ? 'loading' : 'signedOut',
  session: null,
  profile: null,
  profileLoaded: false,
  offline: false,

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
    writeCache(null)
    set({ status: 'signedOut', session: null, profile: null, profileLoaded: false })
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
