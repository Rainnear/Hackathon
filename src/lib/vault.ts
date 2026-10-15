// Encrypts what this device keeps offline (the saved tanod lists and the pre-sync copy).
//
// A random AES-GCM key is made once per device with the browser's Web Crypto and stored as a
// NON-EXPORTABLE CryptoKey in its own IndexedDB database. Page scripts can use the key but can never
// read its bytes, so what DevTools shows for the saved data is unreadable text, and copying the
// browser's storage to another computer gives nothing that can be decrypted.
//
// What this does NOT do: anyone who can open Sakto on a still-signed-in device is the same as the
// owner as far as the app is concerned, because the app itself holds the key. Signing out wipes the
// data and the key (see wipeLocalData in state/auth.ts).
import { createStore, del, get, set, type UseStore } from 'idb-keyval'
import type { StateStorage } from 'zustand/middleware'

const PREFIX = 'v1.'
let keyStore: UseStore | null = null
let keyPromise: Promise<CryptoKey> | null = null

const hasCrypto = () => typeof crypto !== 'undefined' && !!crypto.subtle
const keys = () => (keyStore ??= createStore('sakto-vault', 'keys'))

const toB64 = (b: Uint8Array) => {
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s)
}
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

function deviceKey(): Promise<CryptoKey> {
  keyPromise ??= (async () => {
    const existing = await get<CryptoKey>('device-key', keys())
    if (existing) return existing
    const made = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    await set('device-key', made, keys())
    return made
  })().catch((e) => {
    keyPromise = null
    throw e
  })
  return keyPromise
}

const aad = (name: string) => new TextEncoder().encode(name)

/** Encrypts text. The record name is bound in, so one record cannot be swapped for another. */
export async function encrypt(name: string, plain: string): Promise<string> {
  if (!hasCrypto()) return plain // not a secure context (plain http): nothing to encrypt with
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(name) }, await deviceKey(), new TextEncoder().encode(plain))
  return `${PREFIX}${toB64(iv)}.${toB64(new Uint8Array(ct))}`
}

/** Decrypts text. Data saved before encryption existed is plain text and is returned as is (and is encrypted on its next save). */
export async function decrypt(name: string, stored: string): Promise<string> {
  if (!stored.startsWith(PREFIX)) return stored
  const [iv, ct] = stored.slice(PREFIX.length).split('.')
  const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv), additionalData: aad(name) }, await deviceKey(), fromB64(ct))
  return new TextDecoder().decode(buf)
}

// Writes go through one queue so a later save or wipe can never be overtaken by an earlier one.
let chain: Promise<unknown> = Promise.resolve()
const queued = <T>(job: () => Promise<T>): Promise<T> => {
  const next = chain.then(job, job)
  chain = next.catch(() => {})
  return next
}

export const vaultSet = (name: string, value: string) => queued(async () => set(name, await encrypt(name, value)))
export const vaultDel = (name: string) => queued(() => del(name))
export const vaultGet = async (name: string): Promise<string | null> => {
  const raw = await get<string>(name)
  if (raw == null) return null
  try {
    return await decrypt(name, raw)
  } catch {
    // The key is gone or the record was altered: it cannot be read, so treat it as empty.
    // The workspace downloads again from Supabase; only changes that never uploaded are lost.
    return null
  }
}

/** The zustand storage for the main saved state. */
export const vaultStorage: StateStorage = {
  getItem: (name) => vaultGet(name),
  setItem: (name, value) => vaultSet(name, value),
  removeItem: (name) => vaultDel(name),
}

/** Forgets the device key. Anything still encrypted with it can never be read again. */
export const destroyDeviceKey = () =>
  queued(async () => {
    keyPromise = null
    await del('device-key', keys())
  })
