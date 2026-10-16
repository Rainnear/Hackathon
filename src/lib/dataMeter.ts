import { create } from 'zustand'

/**
 * Counts the data Sakto sends and receives, by what it was for, so a barangay on a weak or prepaid
 * connection can see what each step costs. Sizes are close estimates: bodies plus request headers,
 * the size on the wire when the server says so, otherwise the size after unzipping.
 */
export type DataKind = 'app' | 'signin' | 'sync' | 'live' | 'photosUp' | 'photosDown' | 'ai' | 'model'

export const DATA_LABELS: Record<DataKind, string> = {
  signin: 'Sign-in',
  sync: 'Tanod list sync',
  live: 'Live updates',
  photosUp: 'Photos uploaded',
  photosDown: 'Photos viewed',
  ai: 'AI reader',
  model: 'Reader model',
  app: 'App files',
}
export const DATA_ORDER: DataKind[] = ['signin', 'sync', 'live', 'photosUp', 'photosDown', 'ai', 'model', 'app']

type Tally = Record<DataKind, number>
const zero = (): Tally => ({ app: 0, signin: 0, sync: 0, live: 0, photosUp: 0, photosDown: 0, ai: 0, model: 0 })

// Kept for the browser tab (a reload is part of the same session); a new tab starts at zero.
const KEY = 'sakto.data-meter'
function load(): { bytes: Tally; since: string } {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as { bytes: Partial<Tally>; since: string } | null
    if (v?.since) return { bytes: { ...zero(), ...v.bytes }, since: v.since }
  } catch {
    // Blocked storage: count from zero.
  }
  return { bytes: zero(), since: new Date().toISOString() }
}

interface DataMeter {
  bytes: Tally
  since: string
  add: (k: DataKind, n: number) => void
  reset: () => void
}

export const useDataMeter = create<DataMeter>((set) => ({
  ...load(),
  add: (k, n) => {
    if (!(n > 0)) return
    set((s) => ({ bytes: { ...s.bytes, [k]: s.bytes[k] + n } }))
  },
  reset: () => set({ bytes: zero(), since: new Date().toISOString() }),
}))

useDataMeter.subscribe((s) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ bytes: s.bytes, since: s.since }))
  } catch {
    // Blocked storage: the count lasts until the page is reloaded.
  }
})

const add = (k: DataKind, n: number) => useDataMeter.getState().add(k, n)

export function formatBytes(n: number) {
  if (n < 1024) return `${Math.round(n)} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

const enc = new TextEncoder()
function sizeOf(b: unknown): number {
  if (b == null) return 0
  if (typeof b === 'string') return enc.encode(b).length
  if (b instanceof Blob) return b.size
  if (b instanceof ArrayBuffer) return b.byteLength
  if (ArrayBuffer.isView(b)) return b.byteLength
  if (b instanceof URLSearchParams) return b.toString().length
  if (b instanceof FormData) {
    let n = 0
    b.forEach((v, k) => (n += k.length + sizeOf(v)))
    return n
  }
  return 0
}
function headerSize(h: HeadersInit | undefined) {
  let n = 0
  new Headers(h).forEach((v, k) => (n += k.length + v.length + 4))
  return n
}

/** Which part of Supabase a request goes to. */
function kindOf(url: string, method: string): DataKind {
  if (url.includes('/auth/v1/')) return 'signin'
  if (url.includes('/functions/v1/')) return 'ai'
  if (url.includes('/storage/v1/')) {
    const upload = (method === 'POST' || method === 'PUT') && !url.includes('/object/sign') && !url.includes('/object/list')
    return upload ? 'photosUp' : 'photosDown'
  }
  return 'sync'
}

/** fetch, counted. Supabase's client uses it for everything; pass kind for other downloads. */
export async function meteredFetch(input: RequestInfo | URL, init?: RequestInit, kind?: DataKind): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  const k = kind ?? kindOf(url, method)
  add(k, url.length + method.length + headerSize(init?.headers) + sizeOf(init?.body))
  const res = await fetch(input, init)
  const len = Number(res.headers.get('content-length'))
  if (len > 0) add(k, len)
  else if (res.body) res.clone().arrayBuffer().then((b) => add(k, b.byteLength), () => {})
  return res
}

/** WebSocket, counted: Supabase's live updates (reviews, scans arriving from the phone). */
export class MeteredWebSocket extends WebSocket {
  constructor(address: string | URL, protocols?: string | string[]) {
    super(address, protocols)
    this.addEventListener('message', (e: MessageEvent) => add('live', sizeOf(e.data)))
  }
  send(data: Parameters<WebSocket['send']>[0]) {
    add('live', sizeOf(data))
    super.send(data)
  }
}

/** Sakto's own files (the page, scripts, styles, fonts, pictures) that came over the network, not from the device. */
function watchAppFiles() {
  if (typeof PerformanceObserver === 'undefined') return
  const take = (e: PerformanceEntry) => {
    const r = e as PerformanceResourceTiming
    if (r.name.startsWith(location.origin) && r.transferSize > 0) add('app', r.transferSize)
  }
  // What this page load already fetched, then everything after it.
  performance.getEntriesByType('navigation').forEach(take)
  performance.getEntriesByType('resource').forEach(take)
  new PerformanceObserver((list) => list.getEntries().forEach(take)).observe({ type: 'resource' })
}
try {
  watchAppFiles()
} catch {
  // Older browsers without resource timing: app files just aren't counted.
}
