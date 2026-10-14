import { del, get, set } from 'idb-keyval'
import { useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'

import { findMunicipality } from '../data/municipalities'
import { newSubmission, normalizeSubmission } from '../domain/submission'
import type { Barangay, DocKey, Filter, Focal, ObrKey, SignatoryKey, Submission, Tanod } from '../domain/types'

// IndexedDB keeps the data on this device and survives restarts; localStorage is smaller and cleared more readily.
const idbStorage: StateStorage = {
  getItem: async (name) => (await get<string>(name)) ?? null,
  setItem: (name, value) => set(name, value),
  removeItem: (name) => del(name),
}

interface SaktoState {
  sub: Submission
  filter: Filter
  lastBrgy: string | null
  lastBackupAt: string | null

  setSubmissionField: (patch: Partial<Pick<Submission, 'year' | 'amount'>>) => void
  setSignatory: (key: SignatoryKey, value: string) => void
  setObr: (key: ObrKey, value: string) => void
  setDoc: (brgy: string, key: DocKey, value: boolean) => void
  setFocal: (brgy: string, key: keyof Focal, value: string) => void
  updateTanod: (brgy: string, id: string, patch: Partial<Tanod>) => void
  addTanods: (brgy: string, tanods: Tanod[]) => void
  removeTanod: (brgy: string, id: string) => { index: number; tanod: Tanod } | null
  insertTanod: (brgy: string, index: number, tanod: Tanod) => void
  replaceSubmission: (sub: Submission) => void
  setFilter: (f: Filter) => void
  setLastBrgy: (name: string) => void
  markBackedUp: () => void
}

const mapBrgy = (sub: Submission, name: string, fn: (b: Barangay) => Barangay): Submission => ({
  ...sub,
  brgys: sub.brgys.map((b) => (b.name === name ? fn(b) : b)),
})

export const useStore = create<SaktoState>()(
  persist(
    (setState, getState) => {
      const edit = (fn: (s: Submission) => Submission) => setState((st) => ({ sub: fn(st.sub) }))
      return {
        sub: newSubmission(findMunicipality('Ajuy')!, new Date().getFullYear()),
        filter: 'all',
        lastBrgy: null,
        lastBackupAt: null,

        setSubmissionField: (patch) => edit((s) => ({ ...s, ...patch })),
        setSignatory: (key, value) => edit((s) => ({ ...s, sig: { ...s.sig, [key]: value } })),
        setObr: (key, value) => edit((s) => ({ ...s, obr: { ...s.obr, [key]: value } })),
        setDoc: (brgy, key, value) =>
          edit((s) =>
            mapBrgy(s, brgy, (b) => ({
              ...b,
              // Turning off "claiming through a representative" also clears the SPA it required.
              docs: { ...b.docs, [key]: value, ...(key === 'viaRep' && !value ? { spa: false } : {}) },
            })),
          ),
        setFocal: (brgy, key, value) => edit((s) => mapBrgy(s, brgy, (b) => ({ ...b, focal: { ...b.focal, [key]: value } }))),
        updateTanod: (brgy, id, patch) =>
          edit((s) => mapBrgy(s, brgy, (b) => ({ ...b, tanods: b.tanods.map((t) => (t.id === id ? { ...t, ...patch } : t)) }))),
        addTanods: (brgy, tanods) => edit((s) => mapBrgy(s, brgy, (b) => ({ ...b, tanods: [...b.tanods, ...tanods] }))),
        removeTanod: (brgy, id) => {
          const b = getState().sub.brgys.find((x) => x.name === brgy)
          const index = b?.tanods.findIndex((t) => t.id === id) ?? -1
          if (!b || index < 0) return null
          const tanod = b.tanods[index]
          edit((s) => mapBrgy(s, brgy, (x) => ({ ...x, tanods: x.tanods.filter((t) => t.id !== id) })))
          return { index, tanod }
        },
        insertTanod: (brgy, index, tanod) =>
          edit((s) =>
            mapBrgy(s, brgy, (b) => {
              const tanods = [...b.tanods]
              tanods.splice(Math.min(index, tanods.length), 0, tanod)
              return { ...b, tanods }
            }),
          ),
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
      partialize: (s) => ({ sub: s.sub, filter: s.filter, lastBrgy: s.lastBrgy, lastBackupAt: s.lastBackupAt }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SaktoState>
        return { ...current, ...p, sub: normalizeSubmission(p.sub) ?? current.sub }
      },
    },
  ),
)

const subscribeHydration = (cb: () => void) => useStore.persist.onFinishHydration(cb)
const getHydrated = () => useStore.persist.hasHydrated()

/** False until the saved data has been read from IndexedDB. */
export const useHydrated = () => useSyncExternalStore(subscribeHydration, getHydrated, getHydrated)
