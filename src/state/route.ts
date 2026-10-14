import { useSyncExternalStore } from 'react'

import type { DocView } from '../domain/types'

// Hash routes work offline from any static host with no server rewrites, and keep the back button useful.
export type Route =
  /** view "province" is the administrator's all-of-Iloilo dashboard. */
  | { page: 'dashboard'; view?: 'province' }
  | { page: 'setup' }
  | { page: 'barangays'; brgy: string | null }
  | { page: 'review' }
  | { page: 'print'; doc: DocView }
  | { page: 'accounts' }
  /** from: the page they came from, sent along with a problem report. */
  | { page: 'help'; from: string | null }
  /** The Punong Barangay's certification; brgy null means every barangay (Tanod Rep). */
  | { page: 'certificate'; brgy: string | null }
  /** Everyone who has served; brgy null means the whole municipality (Tanod Rep). */
  | { page: 'records'; brgy: string | null }

const DOCS: DocView[] = ['masterlist', 'payroll', 'cover']

export function parseRoute(hash: string): Route {
  const [page, arg] = hash.replace(/^#\/?/, '').split('/')
  if (page === 'setup') return { page: 'setup' }
  if (page === 'review') return { page: 'review' }
  if (page === 'accounts') return { page: 'accounts' }
  if (page === 'help') return { page: 'help', from: arg ? decodeURIComponent(arg) : null }
  if (page === 'records') return { page: 'records', brgy: arg ? decodeURIComponent(arg) : null }
  if (page === 'certificate') return { page: 'certificate', brgy: arg ? decodeURIComponent(arg) : null }
  if (page === 'dashboard' && arg === 'province') return { page: 'dashboard', view: 'province' }
  if (page === 'print') return { page: 'print', doc: DOCS.includes(arg as DocView) ? (arg as DocView) : 'masterlist' }
  if (page === 'barangays') return { page: 'barangays', brgy: arg ? decodeURIComponent(arg) : null }
  return { page: 'dashboard' }
}

export function href(r: Route): string {
  switch (r.page) {
    case 'barangays':
      return r.brgy ? `#/barangays/${encodeURIComponent(r.brgy)}` : '#/barangays'
    case 'print':
      return `#/print/${r.doc}`
    case 'dashboard':
      return r.view ? `#/dashboard/${r.view}` : '#/dashboard'
    case 'help':
      return r.from ? `#/help/${encodeURIComponent(r.from)}` : '#/help'
    case 'records':
      return r.brgy ? `#/records/${encodeURIComponent(r.brgy)}` : '#/records'
    case 'certificate':
      return r.brgy ? `#/certificate/${encodeURIComponent(r.brgy)}` : '#/certificate'
    default:
      return `#/${r.page}`
  }
}

export function navigate(r: Route, opts: { replace?: boolean; scroll?: boolean } = {}) {
  const target = href(r)
  if (opts.replace) history.replaceState(null, '', target)
  else history.pushState(null, '', target)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
  if (opts.scroll !== false) window.scrollTo({ top: 0 })
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}
const getHash = () => location.hash

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash, getHash)
  return parseRoute(hash)
}
