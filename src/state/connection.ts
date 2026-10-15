// Watches the real connection to Supabase and tells the person when it drops or comes back.
//
// The browser's own "online" flag only says there is a network (Wi-Fi with no internet still counts as
// online). So while the app is open we also ping Supabase now and then. sync.ts already flips
// `useSync.online` when an upload or download fails; this module covers the quiet times in between,
// shows a message on every change, and restarts the sync as soon as the connection is back.
import { useEffect } from 'react'

import { supabaseConfigured } from '../lib/supabase'
import { syncNow, useSync } from './sync'
import { toast } from './toast'

const URL = import.meta.env.VITE_SUPABASE_URL?.trim()
const ONLINE_EVERY = 30_000 // while connected: a quiet check twice a minute
const OFFLINE_EVERY = 10_000 // while disconnected: look again sooner, so recovery feels quick
const TIMEOUT = 6_000

/** True if Supabase answers at all. Any reply counts (even an error page); only "no route / timeout" is down. */
export async function checkConnection(): Promise<boolean> {
  if (!navigator.onLine) return false
  if (!supabaseConfigured || !URL) return true
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT)
  try {
    // no-cors: we only care that the server was reached, and it avoids any cross-origin failure.
    await fetch(`${URL}/auth/v1/health`, { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(t)
  }
}

let misses = 0
/** One check now (also used by the "Check connection" button). Returns whether Supabase is reachable. */
export async function recheck(): Promise<boolean> {
  const ok = await checkConnection()
  const was = useSync.getState().online
  if (ok) {
    misses = 0
    if (!was) {
      useSync.setState({ online: true })
      void syncNow() // upload what waited on this device, then bring in everyone else's changes
    }
  } else if (was && ++misses >= 2) {
    // Two misses in a row, so one slow reply doesn't raise a false alarm.
    useSync.setState({ online: false })
  }
  return ok
}

/** Runs while the workspace is open: periodic checks, plus a message whenever the state changes. */
export function useConnectionWatch() {
  useEffect(() => {
    let stop = false
    let timer: ReturnType<typeof setTimeout>
    const loop = async () => {
      await recheck()
      if (!stop) timer = setTimeout(loop, useSync.getState().online ? ONLINE_EVERY : OFFLINE_EVERY)
    }
    timer = setTimeout(loop, ONLINE_EVERY)

    // Say so when the state changes, whoever noticed first (this module, a failed upload, or the browser).
    const unsub = useSync.subscribe((s, prev) => {
      if (s.online === prev.online || s.phase !== 'ready') return
      if (s.online) toast('Back online. Uploading what was saved on this device…')
      else toast('Connection lost. Keep working: everything is saved on this device and uploads when you are back online.')
    })
    const nudge = () => void recheck()
    window.addEventListener('online', nudge)
    window.addEventListener('offline', nudge)
    return () => {
      stop = true
      clearTimeout(timer)
      unsub()
      window.removeEventListener('online', nudge)
      window.removeEventListener('offline', nudge)
    }
  }, [])
}
