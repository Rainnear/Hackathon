import { useEffect, useMemo, useState } from 'react'

import { Sidebar, TabBar, Toast, TopBar, UpdatePrompt } from './components/Shell'
import { DeadlineBanner } from './components/DeadlineBanner'
import { ScanReview } from './components/ScanReview'
import { SyncBanners, SyncGate } from './components/SyncStatus'
import { analyze, scopeToBarangay } from './domain/analyze'
import { supabaseConfigured } from './lib/supabase'
import { AccountsPage } from './pages/AccountsPage'
import { AuthScreen, FirstPassword, NewPassword, NotConfigured, Pending, ProfileMissing } from './pages/AuthPages'
import { BarangaysPage } from './pages/BarangaysPage'
import { RecordsPage } from './pages/RecordsPage'
import { DashboardPage } from './pages/DashboardPage'
import { HelpPage } from './pages/HelpPage'
import { PrintPage } from './pages/PrintPage'
import { ReviewPage } from './pages/ReviewPage'
import { SetupPage } from './pages/SetupPage'
import { BarangaySetupPage } from './pages/BarangaySetupPage'
import { SecretaryReviewPage } from './pages/SecretaryReviewPage'
import { TemplatesPage } from './pages/TemplatesPage'
import type { Profile } from './lib/supabase'
import { useAdminView, type AdminMunicipality } from './state/adminView'
import { useAuth, useMustChangePassword } from './state/auth'
import { href, navigate, useRoute, type Route } from './state/route'
import { useHydrated, useStore } from './state/store'
import { useScanSync, useScans } from './state/scans'
import { buildReferences } from './state/references'
import { startSync, useSync } from './state/sync'

/** Decides between the sign-in screens and the app. */
export default function App() {
  const status = useAuth((s) => s.status)
  const profile = useAuth((s) => s.profile)
  const profileLoaded = useAuth((s) => s.profileLoaded)
  const mustChangePassword = useMustChangePassword()

  let screen
  if (!supabaseConfigured) screen = <NotConfigured />
  else if (status === 'loading' || (status === 'signedIn' && !profileLoaded)) screen = <div className="loading">Opening Sakto…</div>
  else if (status === 'recovery') screen = <NewPassword />
  else if (status === 'signedOut') screen = <AuthScreen />
  else if (mustChangePassword) screen = <FirstPassword />
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

// Setup, Review, Print and Accounts belong to the Liga Rep.
const SECRETARY_PAGES = new Set(['dashboard', 'setup', 'barangays', 'review', 'help', 'templates', 'records'])

/**
 * The profile to sync as. Administrators (the provincial office) belong to no municipality: they sync
 * the one they opened, read-only, or nothing while they are on "All of Iloilo".
 */
function syncProfile(p: Profile, muni: AdminMunicipality | null): Profile | null {
  if (p.role !== 'admin') return p
  return muni ? { ...p, municipality_id: muni.id, municipality: muni.name, barangay_id: null } : null
}

/** Where an administrator may be: only the province, Accounts and Help until a municipality is opened; never Setup. */
function adminRedirect(route: Route, opened: boolean): Route | null {
  const province: Route = { page: 'dashboard', view: 'province' }
  if (!opened) return route.page === 'accounts' || route.page === 'help' || (route.page === 'dashboard' && route.view === 'province') ? null : province
  return route.page === 'setup' ? { page: 'dashboard' } : null
}

function Workspace() {
  const hydrated = useHydrated()
  const profile = useAuth((s) => s.profile)!
  const phase = useSync((s) => s.phase)
  const sub = useStore((s) => s.sub)
  const previous = useStore((s) => s.previous)
  const route = useRoute()
  const isSecretary = profile.role === 'secretary'
  const isAdmin = profile.role === 'admin'
  const adminMuni = useAdminView((s) => s.muni)
  // The provincial office before it opens a municipality: nothing is synced, only the province is shown.
  const provinceOnly = isAdmin && !adminMuni
  // The year only matters for the "wrong CY" warning, so reading it once per launch is enough.
  const [currentYear] = useState(() => new Date().getFullYear())
  // The scanned IDs and signed certifications the list is cross-checked against.
  const scans = useScans((s) => s.list)
  const brgyIds = useStore((s) => s.remote?.brgyIds)
  const refs = useMemo(() => buildReferences(scans, brgyIds), [scans, brgyIds])
  const A = useMemo(() => {
    const all = analyze(sub, currentYear, previous, refs)
    return isSecretary && sub.brgys[0] ? scopeToBarangay(all, sub.brgys[0].name) : all
  }, [sub, currentYear, isSecretary, previous, refs])

  // Restart syncing when the person, their role, their assignment or (for administrators) the open municipality changes.
  const syncAs = syncProfile(profile, adminMuni)
  const who = syncAs ? `${syncAs.id}|${syncAs.role}|${syncAs.municipality_id}|${syncAs.barangay_id}` : 'province'
  useEffect(() => {
    if (!hydrated) return
    const p = syncProfile(useAuth.getState().profile!, useAdminView.getState().muni)
    if (p) return startSync(p)
  }, [hydrated, who])
  useScanSync()

  const redirect = isAdmin ? adminRedirect(route, !provinceOnly) : null
  const redirectTo = redirect ? href(redirect) : null
  useEffect(() => {
    if (redirect) navigate(redirect, { replace: true })
    // redirectTo stands in for the route object, which is new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redirectTo])

  if (!hydrated) return <div className="loading">Opening your saved data…</div>
  if (!provinceOnly && phase !== 'ready')
    return route.page === 'help' ? (
      <div className="app-main solo">
        <main>
          <HelpPage from={route.from} />
        </main>
      </div>
    ) : (
      <SyncGate />
    )

  const page = (isSecretary && !SECRETARY_PAGES.has(route.page)) || redirect ? 'dashboard' : route.page

  return (
    <div className="app">
      <Sidebar route={route} A={A} />
      <div className="app-main">
        {!provinceOnly && <DeadlineBanner A={A} />}
        <TopBar route={route} A={A} />
        {!provinceOnly && <SyncBanners />}
        <main>
          {page === 'dashboard' && <DashboardPage A={A} view={provinceOnly ? 'province' : route.page === 'dashboard' ? route.view : undefined} />}
          {page === 'setup' && (isSecretary ? <BarangaySetupPage /> : <SetupPage A={A} />)}
          {page === 'barangays' && route.page === 'barangays' && <BarangaysPage A={A} brgy={route.brgy} focus={route.focus ?? null} />}
          {page === 'review' && (isSecretary ? <SecretaryReviewPage A={A} /> : <ReviewPage A={A} />)}
          {page === 'print' && route.page === 'print' && <PrintPage A={A} doc={route.doc} />}
          {page === 'accounts' && <AccountsPage />}
          {route.page === 'help' && <HelpPage from={route.from} />}
          {page === 'templates' && route.page === 'templates' && <TemplatesPage A={A} doc={route.doc} brgy={route.brgy} tanod={route.tanod ?? null} />}
          {page === 'records' && route.page === 'records' && <RecordsPage brgy={route.brgy} />}
        </main>
      </div>
      <TabBar route={route} A={A} />
      {!provinceOnly && <ScanReview />}
    </div>
  )
}
