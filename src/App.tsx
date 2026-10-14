import { useMemo, useState } from 'react'

import { Sidebar, TabBar, Toast, TopBar, UpdatePrompt } from './components/Shell'
import { analyze } from './domain/analyze'
import { supabaseConfigured } from './lib/supabase'
import { AccountsPage } from './pages/AccountsPage'
import { AuthScreen, NewPassword, NotConfigured, Pending, ProfileMissing } from './pages/AuthPages'
import { BarangaysPage } from './pages/BarangaysPage'
import { DashboardPage } from './pages/DashboardPage'
import { HelpPage } from './pages/HelpPage'
import { PrintPage } from './pages/PrintPage'
import { ReviewPage } from './pages/ReviewPage'
import { SetupPage } from './pages/SetupPage'
import { useAuth } from './state/auth'
import { useRoute } from './state/route'
import { useHydrated, useStore } from './state/store'

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

function Workspace() {
  const hydrated = useHydrated()
  const sub = useStore((s) => s.sub)
  const route = useRoute()
  // The year only matters for the "wrong CY" warning, so reading it once per launch is enough.
  const [currentYear] = useState(() => new Date().getFullYear())
  const A = useMemo(() => analyze(sub, currentYear), [sub, currentYear])

  if (!hydrated) return <div className="loading">Opening your saved data…</div>

  return (
    <div className="app">
      <Sidebar route={route} A={A} />
      <div className="app-main">
        <TopBar route={route} A={A} />
        <main>
          {route.page === 'dashboard' && <DashboardPage A={A} view={route.view} />}
          {route.page === 'setup' && <SetupPage A={A} />}
          {route.page === 'barangays' && <BarangaysPage A={A} brgy={route.brgy} />}
          {route.page === 'review' && <ReviewPage A={A} />}
          {route.page === 'print' && <PrintPage A={A} doc={route.doc} />}
          {route.page === 'accounts' && <AccountsPage />}
          {route.page === 'help' && <HelpPage from={route.from} />}
        </main>
      </div>
      <TabBar route={route} A={A} />
    </div>
  )
}
