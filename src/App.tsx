import { useEffect, useMemo, useState } from 'react'

import { Sidebar, TabBar, Toast, TopBar, UpdatePrompt } from './components/Shell'
import { ScanReview } from './components/ScanReview'
import { SyncBanners, SyncGate } from './components/SyncStatus'
import { analyze, scopeToBarangay } from './domain/analyze'
import { supabaseConfigured } from './lib/supabase'
import { AccountsPage } from './pages/AccountsPage'
import { AuthScreen, NewPassword, NotConfigured, Pending, ProfileMissing } from './pages/AuthPages'
import { BarangaysPage } from './pages/BarangaysPage'
import { CertificatePage } from './pages/CertificatePage'
import { RecordsPage } from './pages/RecordsPage'
import { DashboardPage } from './pages/DashboardPage'
import { HelpPage } from './pages/HelpPage'
import { PrintPage } from './pages/PrintPage'
import { ReviewPage } from './pages/ReviewPage'
import { SetupPage } from './pages/SetupPage'
import { useAuth } from './state/auth'
import { useRoute } from './state/route'
import { useHydrated, useStore } from './state/store'
import { useScanSync } from './state/scans'
import { startSync, useSync } from './state/sync'

/** Decides between the sign-in screens and the app. */
export default function App() {
  const status = useAuth((s) => s.status)
  const profile = useAuth((s) => s.profile)
  const profileLoaded = useAuth((s) => s.profileLoaded)

  let screen
  if (!supabaseConfigured) screen = <NotConfigured />
  else if (status === 'loading' || (status === 'signedIn' && !profileLoaded)) screen = <div className="loading">Opening Sakto…</div>
  else if (status === 'recovery') screen = <NewPassword />
  else if (status === 'signedOut') screen = <AuthScreen />
  else if (!profile) screen = <ProfileMissing />
  else if (profile.role === 'pending') screen = <Pending />
  else screen = <Workspace />

  return (
    <>
      {screen}
      <Toast />
      <UpdatePrompt />
    </>
  )
}

// Setup, Review, Print and Accounts belong to the Tanod Rep.
const SECRETARY_PAGES = new Set(['dashboard', 'barangays', 'help', 'certificate', 'records'])

function Workspace() {
  const hydrated = useHydrated()
  const profile = useAuth((s) => s.profile)!
  const phase = useSync((s) => s.phase)
  const sub = useStore((s) => s.sub)
  const route = useRoute()
  const isSecretary = profile.role === 'secretary'
  // The year only matters for the "wrong CY" warning, so reading it once per launch is enough.
  const [currentYear] = useState(() => new Date().getFullYear())
  const A = useMemo(() => {
    const all = analyze(sub, currentYear)
    return isSecretary && sub.brgys[0] ? scopeToBarangay(all, sub.brgys[0].name) : all
  }, [sub, currentYear, isSecretary])

  // Restart syncing when the person, their role or their assignment changes.
  const who = `${profile.id}|${profile.role}|${profile.municipality_id}|${profile.barangay_id}`
  useEffect(() => {
    if (!hydrated) return
    return startSync(useAuth.getState().profile!)
  }, [hydrated, who])
  useScanSync()

  if (!hydrated) return <div className="loading">Opening your saved data…</div>
  if (phase !== 'ready')
    return route.page === 'help' ? (
      <div className="app-main solo">
        <main>
          <HelpPage from={route.from} />
        </main>
      </div>
    ) : (
      <SyncGate />
    )

  const page = isSecretary && !SECRETARY_PAGES.has(route.page) ? 'dashboard' : route.page

  return (
    <div className="app">
      <Sidebar route={route} A={A} />
      <div className="app-main">
        <TopBar route={route} A={A} />
        <SyncBanners />
        <main>
          {page === 'dashboard' && <DashboardPage A={A} view={route.page === 'dashboard' ? route.view : undefined} />}
          {page === 'setup' && <SetupPage A={A} />}
          {route.page === 'barangays' && <BarangaysPage A={A} brgy={route.brgy} />}
          {page === 'review' && <ReviewPage A={A} />}
          {page === 'print' && route.page === 'print' && <PrintPage A={A} doc={route.doc} />}
          {page === 'accounts' && <AccountsPage />}
          {route.page === 'help' && <HelpPage from={route.from} />}
          {route.page === 'certificate' && <CertificatePage brgy={route.brgy} />}
          {route.page === 'records' && <RecordsPage brgy={route.brgy} />}
        </main>
      </div>
      <TabBar route={route} A={A} />
      <ScanReview />
    </div>
  )
}
