import { useEffect, useState, type ReactNode } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

import { useStore } from '../state/store'
import { href, type Route } from '../state/route'
import { useToast } from '../state/toast'
import { useAuth } from '../state/auth'
import { ROLE_LABELS } from '../lib/supabase'
import { peso } from '../domain/format'
import type { Analysis } from '../domain/analyze'
import type { Tone } from '../domain/types'
import { NavIcon } from './icons'
import { SyncBadge } from './SyncStatus'
import { useSafeSignOut } from '../state/access'

interface NavItem {
  to: Route
  label: string
  /** "Step 1" etc. The four steps are done in order, so the menu says so. */
  step?: string
  icon: ReactNode
  badge?: { text: string; tone: Tone | '' }
}

/** One list of pages for the sidebar and the phone tab bar, with each step's status. */
function useNavItems(route: Route, A: Analysis): NavItem[] {
  const sub = useStore((s) => s.sub)
  const lastBrgy = useStore((s) => s.lastBrgy)
  const role = useAuth((s) => s.profile?.role)
  if (role === 'secretary') {
    const b = sub.brgys[0]
    const n = b?.tanods.length ?? 0
    return [
      { to: { page: 'dashboard' }, label: 'My barangay', icon: NavIcon.home },
      {
        to: { page: 'barangays', brgy: null }, label: 'Tanods', step: 'Encode the list', icon: NavIcon.barangays,
        badge: b ? { text: `${n}/${b.limit}`, tone: n > b.limit || A.errs ? 'bad' : n && !A.issues.length ? 'ok' : '' } : undefined,
      },
      { to: { page: 'records', brgy: null }, label: 'Records', step: 'Past and present tanods', icon: NavIcon.records },
    ]
  }
  const setupIssues = A.issues.filter((i) => i.kind === 'setup')
  const setupErrs = setupIssues.filter((i) => i.level === 'error').length
  const total = sub.brgys.length
  const items: NavItem[] = [
    { to: { page: 'dashboard' }, label: 'Dashboard', icon: NavIcon.home },
    {
      to: { page: 'setup' }, label: 'Setup', step: 'Step 1', icon: NavIcon.setup,
      badge: { text: setupErrs ? String(setupErrs) : setupIssues.length ? 'Check' : 'Done', tone: setupErrs ? 'bad' : setupIssues.length ? 'warn' : 'ok' },
    },
    {
      to: { page: 'barangays', brgy: lastBrgy }, label: 'Barangays', step: 'Step 2', icon: NavIcon.barangays,
      badge: { text: `${A.ready}/${total}`, tone: A.ready === total ? 'ok' : '' },
    },
    {
      to: { page: 'review' }, label: 'Review', step: 'Step 3', icon: NavIcon.review,
      badge: { text: A.errs ? String(A.errs) : 'Clear', tone: A.errs ? 'bad' : 'ok' },
    },
    {
      to: { page: 'print', doc: route.page === 'print' ? route.doc : 'masterlist' }, label: 'Print', step: 'Step 4', icon: NavIcon.print,
      badge: { text: A.errs ? 'Draft' : 'Ready', tone: A.errs ? 'warn' : 'ok' },
    },
  ]
  items.push({ to: { page: 'records', brgy: null }, label: 'Tanod records', icon: NavIcon.records })
  if (role === 'rep' || role === 'admin') items.push({ to: { page: 'accounts' }, label: 'Accounts', icon: NavIcon.accounts })
  return items
}

function SignOutButton({ className = '' }: { className?: string }) {
  const signOut = useSafeSignOut()
  return (
    <button type="button" className={`btn ${className}`} onClick={signOut}>
      {NavIcon.signOut} Sign out
    </button>
  )
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** Chrome and Edge offer an install prompt; Safari users install with Share › Add to Home Screen. */
function InstallButton() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null)
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setEvt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setEvt(null)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])
  if (!evt) return null
  return (
    <button
      type="button"
      className="btn sm"
      onClick={async () => {
        await evt.prompt()
        await evt.userChoice
        setEvt(null)
      }}
    >
      Install app
    </button>
  )
}

function Brand() {
  return (
    <a className="side-brand" href={href({ page: 'dashboard' })}>
      <img src="/logo.svg" alt="" width="36" height="36" />
      <span>
        <b>Sakto</b>
        <small>Tanod incentive · Iloilo</small>
      </span>
    </a>
  )
}

/** Help remembers the page it was opened from, so a problem report says where it happened. */
function HelpLink({ route, className }: { route: Route; className: string }) {
  const from = route.page === 'help' ? route.from : location.hash || null
  return (
    <a className={className} href={href({ page: 'help', from })} aria-current={route.page === 'help' ? 'page' : undefined}>
      {NavIcon.help}
      <span className="lbl">
        Help
        <small>Problems and questions</small>
      </span>
    </a>
  )
}

/** The left menu on computers and tablets. */
export function Sidebar({ route, A }: { route: Route; A: Analysis }) {
  const items = useNavItems(route, A)
  const profile = useAuth((s) => s.profile)
  const offline = useAuth((s) => s.offline)
  const where = profile?.role === 'secretary' && profile.barangay ? `Brgy. ${profile.barangay}, ${profile.municipality}` : profile?.municipality
  return (
    <aside className="side no-print">
      <Brand />
      <nav className="side-nav" aria-label="Main">
        {items.map((it) => (
          <a key={it.label} className="side-link" href={href(it.to)} aria-current={route.page === it.to.page ? 'page' : undefined}>
            {it.icon}
            <span className="lbl">
              {it.label}
              {it.step && <small>{it.step}</small>}
            </span>
            {it.badge && <span className={`badge ${it.badge.tone}`}>{it.badge.text}</span>}
          </a>
        ))}
      </nav>
      {profile && (
        <div className="side-foot">
          <HelpLink route={route} className="side-link" />
          <div className="who">
            <b>{profile.full_name || 'Signed in'}</b>
            <span>{ROLE_LABELS[profile.role]}</span>
            {where && <span>{where}</span>}
            {offline && <span className="off">Offline: changes are saved on this device</span>}
          </div>
          <InstallButton />
          <SignOutButton className="block" />
        </div>
      )}
    </aside>
  )
}

/** The bottom tab bar on phones, where a sidebar would take the whole screen. */
export function TabBar({ route, A }: { route: Route; A: Analysis }) {
  const role = useAuth((s) => s.profile?.role)
  // The phone tab bar holds the everyday pages; Records and Accounts stay in the menu above.
  const items = useNavItems(route, A).filter((it) => it.to.page !== 'accounts' && (role === 'secretary' || it.to.page !== 'records'))
  // Secretaries have only two pages, so Help gets a tab of its own.
  if (role === 'secretary') items.push({ to: { page: 'help', from: route.page === 'help' ? route.from : location.hash || null }, label: 'Help', icon: NavIcon.help })
  return (
    <nav className="tabbar no-print" aria-label="Main" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((it) => (
        <a key={it.label} href={href(it.to)} aria-current={route.page === it.to.page ? 'page' : undefined}>
          {it.icon}
          <span>{it.label}</span>
          {it.badge?.tone === 'bad' && <i className="dot" aria-label={`${it.badge.text} to fix`} />}
        </a>
      ))}
    </nav>
  )
}

/** The strip above every page: what is being prepared, and (on phones) who is signed in. */
export function TopBar({ route, A }: { route: Route; A: Analysis }) {
  const sub = useStore((s) => s.sub)
  const role = useAuth((s) => s.profile?.role)
  const total = sub.brgys.length
  const b = sub.brgys[0]
  return (
    <header className="topbar no-print">
      <div className="only-phone">
        <Brand />
      </div>
      {role === 'secretary' && b ? (
        <div className="ctx">
          <b>Brgy. {b.name}</b>
          <span>{sub.municipality}</span>
          <span>CY <span className="num">{sub.year}</span></span>
          <span><span className="num">{b.tanods.length}</span> of {b.limit} tanods</span>
          <SyncBadge />
        </div>
      ) : (
        <div className="ctx">
          <b>{sub.municipality}</b>
          <span>CY <span className="num">{sub.year}</span></span>
          <span><span className="num">{A.totals.n}</span> tanods</span>
          <span className="num">{peso(A.totals.amt)}</span>
          <span className="ready">
            <span className="bar">
              <i className={A.ready === total ? 'ok' : ''} style={{ width: `${total ? (A.ready / total) * 100 : 0}%` }} />
            </span>
            <span>
              <span className="num">{A.ready}</span> of {total} barangays ready
            </span>
          </span>
          <SyncBadge />
        </div>
      )}
      <div className="only-phone row">
        {role !== 'secretary' && <HelpLink route={route} className="btn sm help-btn" />}
        {(role === 'rep' || role === 'admin') && <a className="btn sm" href={href({ page: 'accounts' })}>Accounts</a>}
        <SignOutButton className="sm" />
      </div>
    </header>
  )
}

export function Toast() {
  const { id, msg, action, hide } = useToast()
  if (!msg) return null
  return (
    <div className="toast no-print" role="status" key={id}>
      <span>{msg}</span>
      {action && (
        <button
          type="button"
          onClick={() => {
            hide()
            action.run()
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

/** Tells the user when the app has been cached for offline use, and when a newer version is waiting. */
export function UpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!offlineReady && !needRefresh) return null
  return (
    <div className="updatebar no-print" role="status">
      <span>{needRefresh ? 'A new version of Sakto is ready. Your data stays as it is.' : 'Sakto is saved on this device and now works without internet.'}</span>
      {needRefresh && (
        <button type="button" className="btn sm primary" onClick={() => updateServiceWorker(true)}>
          Update now
        </button>
      )}
      <button
        type="button"
        className="btn sm"
        onClick={() => {
          setOfflineReady(false)
          setNeedRefresh(false)
        }}
      >
        {needRefresh ? 'Later' : 'OK'}
      </button>
    </div>
  )
}
