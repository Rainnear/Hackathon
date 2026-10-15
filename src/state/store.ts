import { del, get, set } from 'idb-keyval'
import { useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'

import { findMunicipality } from '../data/municipalities'
import { newSubmission, normalizeSubmission } from '../domain/submission'
import type { Barangay, Departure, DocKey, Filter, Focal, ObrKey, Officials, SignatoryKey, Submission, Tanod } from '../domain/types'

// IndexedDB keeps the data on this device and survives restarts; localStorage is smaller and cleared more readily.
const idbStorage: StateStorage = {
  getItem: async (name) => (await get<string>(name)) ?? null,
  setItem: (name, value) => set(name, value),
  removeItem: (name) => del(name),
}

export type SubmissionStatus = 'open' | 'submitted' | 'closed'

/** Which Supabase submission this device's copy belongs to. Null until the first download. */
export interface Remote {
  userId: string
  municipalityId: number
  /** Secretaries download only their own barangay; reps and admins the whole municipality. */
  barangayId: number | null
  submissionId: number
  year: number
  status: SubmissionStatus
  /** Barangay name → Supabase id, for uploads. */
  brgyIds: Record<string, number>
  pulledAt: string
}

/**
 * Changes made on this device that Supabase has not confirmed yet. Each value is a stamp that changes
 * on every edit, so an upload only clears what it actually sent (an edit made mid-upload stays pending).
 */
export interface Pending {
  tanods: Record<string, number>
  /** Removed tanod id → its barangay. */
  removed: Record<string, string>
  /** Barangays whose row order changed. */
  order: Record<string, number>
  /** Barangays whose documents or focal person changed. */
  reqs: Record<string, number>
  /** Year-wide fields: amount, signatories, ObR. */
  sub: number
  /** Tanods whose "why they left" record changed (added, edited or cleared). */
  departures: Record<string, number>
}

/** Last year's lists, kept on the device so "Copy last year's tanods" works offline too. */
export interface Previous {
  year: number
  brgys: Record<string, Tanod[]>
}

export const emptyPending = (): Pending => ({ tanods: {}, removed: {}, order: {}, reqs: {}, sub: 0, departures: {} })
export const pendingCount = (p: Pending) =>
  Object.keys(p.tanods).length + Object.keys(p.removed).length + Object.keys(p.order).length + Object.keys(p.reqs).length + Object.keys(p.departures).length + (p.sub ? 1 : 0)

/**
 * Changes that can actually go up. A row still missing a last or first name waits on the device
 * (the editor flags it), so it isn't counted as "waiting to upload".
 */
export function waitingCount(s: { pending: Pending; sub: Submission }) {
  const unnamed = new Set(s.sub.brgys.flatMap((b) => b.tanods.filter((t) => !t.last.trim() || !t.first.trim()).map((t) => t.id)))
  return pendingCount(s.pending) - Object.keys(s.pending.tanods).filter((id) => unnamed.has(id)).length
}

let lastStamp = Date.now()
const stamp = () => ++lastStamp

interface SaktoState {
  sub: Submission
  filter: Filter
  lastBrgy: string | null
  lastBackupAt: string | null
  remote: Remote | null
  pending: Pending
  previous: Previous | null

  setSubmissionField: (patch: Partial<Pick<Submission, 'amount' | 'barangayDue'>>) => void
  setSignatory: (key: SignatoryKey, value: string) => void
  setObr: (key: ObrKey, value: string) => void
  setDoc: (brgy: string, key: DocKey, value: boolean) => void
  setFocal: (brgy: string, key: keyof Focal, value: string) => void
  setOfficial: (brgy: string, key: keyof Officials, value: string) => void
  updateTanod: (brgy: string, id: string, patch: Partial<Tanod>) => void
  addTanods: (brgy: string, tanods: Tanod[]) => void
  removeTanod: (brgy: string, id: string) => { index: number; tanod: Tanod } | null
  insertTanod: (brgy: string, index: number, tanod: Tanod) => void
  /** Restoring a backup: every barangay's list becomes the backup's, and all of it is queued for upload. */
  replaceRosters: (from: Submission) => void
  /** Removes a tanod who was on last year's list, recording why they left. */
  removeWithReason: (brgy: string, id: string, d: Omit<Departure, 'tanodId'>) => { index: number; tanod: Tanod } | null
  /** Fills empty barangays with last year's tanods: the same people, signatures reset for the new year. */
  copyPrevious: (brgys: string[]) => number
  /** A limit Supabase has already saved (set_tanod_limit), so nothing is queued for upload. */
  applyLimit: (brgy: string, limit: number) => void
  /** Local-only replace, for the device copy before anything is online (sample data, erase). */
  replaceSubmission: (sub: Submission) => void
  setFilter: (f: Filter) => void
  setLastBrgy: (name: string) => void
  markBackedUp: () => void
}

const dropLeft = (b: Barangay, ids: string[]) => b.left.filter((d) => !ids.includes(d.tanodId))

const mapBrgy = (sub: Submission, name: string, fn: (b: Barangay) => Barangay): Submission => ({
  ...sub,
  brgys: sub.brgys.map((b) => (b.name === name ? fn(b) : b)),
})

export const useStore = create<SaktoState>()(
  persist(
    (setState, getState) => {
      const edit = (fn: (s: Submission) => Submission, mark: (p: Pending) => void) =>
        setState((st) => {
          const pending = { ...st.pending, tanods: { ...st.pending.tanods }, removed: { ...st.pending.removed }, order: { ...st.pending.order }, reqs: { ...st.pending.reqs }, departures: { ...st.pending.departures } }
          mark(pending)
          return { sub: fn(st.sub), pending }
        })
      return {
        sub: newSubmission(findMunicipality('Ajuy')!, new Date().getFullYear()),
        filter: 'all',
        lastBrgy: null,
        lastBackupAt: null,
        remote: null,
        pending: emptyPending(),
        previous: null,

        setSubmissionField: (patch) => edit((s) => ({ ...s, ...patch }), (p) => (p.sub = stamp())),
        setSignatory: (key, value) => edit((s) => ({ ...s, sig: { ...s.sig, [key]: value } }), (p) => (p.sub = stamp())),
        setObr: (key, value) => edit((s) => ({ ...s, obr: { ...s.obr, [key]: value } }), (p) => (p.sub = stamp())),
        setDoc: (brgy, key, value) =>
          edit(
            (s) =>
              mapBrgy(s, brgy, (b) => ({
                ...b,
                // Turning off "claiming through a representative" also clears the SPA it required.
                docs: { ...b.docs, [key]: value, ...(key === 'viaRep' && !value ? { spa: false } : {}) },
              })),
            (p) => (p.reqs[brgy] = stamp()),
          ),
        setFocal: (brgy, key, value) =>
          edit((s) => mapBrgy(s, brgy, (b) => ({ ...b, focal: { ...b.focal, [key]: value } })), (p) => (p.reqs[brgy] = stamp())),
        setOfficial: (brgy, key, value) =>
          edit((s) => mapBrgy(s, brgy, (b) => ({ ...b, officials: { ...b.officials, [key]: value } })), (p) => (p.reqs[brgy] = stamp())),
        updateTanod: (brgy, id, patch) =>
          edit(
            (s) => mapBrgy(s, brgy, (b) => ({ ...b, tanods: b.tanods.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
            (p) => (p.tanods[id] = stamp()),
          ),
        addTanods: (brgy, tanods) =>
          edit(
            (s) => mapBrgy(s, brgy, (b) => ({ ...b, tanods: [...b.tanods, ...tanods], left: dropLeft(b, tanods.map((t) => t.id)) })),
            (p) => {
              const s = getState().sub.brgys.find((b) => b.name === brgy)
              for (const t of tanods) {
                p.tanods[t.id] = stamp()
                if (s?.left.some((d) => d.tanodId === t.id)) p.departures[t.id] = stamp()
              }
            },
          ),
        removeTanod: (brgy, id) => {
          const b = getState().sub.brgys.find((x) => x.name === brgy)
          const index = b?.tanods.findIndex((t) => t.id === id) ?? -1
          if (!b || index < 0) return null
          const tanod = b.tanods[index]
          edit(
            (s) => mapBrgy(s, brgy, (x) => ({ ...x, tanods: x.tanods.filter((t) => t.id !== id) })),
            (p) => {
              delete p.tanods[id]
              p.removed[id] = brgy
              p.order[brgy] = stamp()
            },
          )
          return { index, tanod }
        },
        insertTanod: (brgy, index, tanod) =>
          edit(
            (s) =>
              mapBrgy(s, brgy, (b) => {
                const tanods = [...b.tanods]
                tanods.splice(Math.min(index, tanods.length), 0, tanod)
                return { ...b, tanods, left: dropLeft(b, [tanod.id]) }
              }),
            (p) => {
              if (getState().sub.brgys.find((b) => b.name === brgy)?.left.some((d) => d.tanodId === tanod.id)) p.departures[tanod.id] = stamp()
              delete p.removed[tanod.id]
              p.tanods[tanod.id] = stamp()
              p.order[brgy] = stamp()
            },
          ),
        replaceRosters: (from) =>
          edit(
            (s) => ({
              ...s,
              amount: from.amount,
              sig: from.sig,
              obr: from.obr,
              brgys: s.brgys.map((b) => {
                const f = from.brgys.find((x) => x.name === b.name)
                return f ? { ...b, tanods: f.tanods, docs: f.docs, focal: f.focal } : b
              }),
            }),
            (p) => {
              const s = getState().sub
              p.sub = stamp()
              for (const b of s.brgys) {
                const f = from.brgys.find((x) => x.name === b.name)
                if (!f) continue
                const keep = new Set(f.tanods.map((t) => t.id))
                for (const t of b.tanods) if (!keep.has(t.id)) p.removed[t.id] = b.name
                for (const t of f.tanods) {
                  p.tanods[t.id] = stamp()
                  delete p.removed[t.id]
                }
                p.order[b.name] = stamp()
                p.reqs[b.name] = stamp()
              }
            },
          ),
        removeWithReason: (brgy, id, d) => {
          const b = getState().sub.brgys.find((x) => x.name === brgy)
          const index = b?.tanods.findIndex((t) => t.id === id) ?? -1
          if (!b || index < 0) return null
          const tanod = b.tanods[index]
          edit(
            (s) =>
              mapBrgy(s, brgy, (x) => ({
                ...x,
                tanods: x.tanods.filter((t) => t.id !== id),
                left: [...dropLeft(x, [id]), { tanodId: id, ...d }],
              })),
            (p) => {
              delete p.tanods[id]
              p.removed[id] = brgy
              p.order[brgy] = stamp()
              p.departures[id] = stamp()
            },
          )
          return { index, tanod }
        },
        copyPrevious: (names) => {
          const prev = getState().previous
          if (!prev) return 0
          let n = 0
          for (const name of names) {
            const b = getState().sub.brgys.find((x) => x.name === name)
            const rows = prev.brgys[name] ?? []
            if (!b || b.tanods.length || !rows.length) continue
            getState().addTanods(name, rows.map((t) => ({ ...t, ids: 0 })))
            getState().setLastBrgy(name)
            n += rows.length
          }
          return n
        },
        applyLimit: (name, limit) => setState((st) => ({ sub: mapBrgy(st.sub, name, (b) => ({ ...b, limit })) })),
        replaceSubmission: (sub) => setState({ sub, filter: 'all', lastBrgy: null }),
        setFilter: (filter) => setState({ filter }),
        setLastBrgy: (lastBrgy) => setState({ lastBrgy }),
        markBackedUp: () => setState({ lastBackupAt: new Date().toISOString() }),
      }
    },
    {
      name: 'sakto',
      version: 1,
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({ sub: s.sub, filter: s.filter, lastBrgy: s.lastBrgy, lastBackupAt: s.lastBackupAt, remote: s.remote, pending: s.pending, previous: s.previous }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SaktoState>
        return {
          ...current,
          ...p,
          sub: normalizeSubmission(p.sub) ?? current.sub,
          remote: p.remote ?? null,
          previous: p.previous ?? null,
          pending: { ...emptyPending(), ...p.pending },
        }
      },
    },
  ),
)

const subscribeHydration = (cb: () => void) => useStore.persist.onFinishHydration(cb)
const getHydrated = () => useStore.persist.hasHydrated()

/** False until the saved data has been read from IndexedDB. */
export const useHydrated = () => useSyncExternalStore(subscribeHydration, getHydrated, getHydrated)
