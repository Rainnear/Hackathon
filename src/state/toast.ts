import { create } from 'zustand'

interface ToastAction {
  label: string
  run: () => void
}

interface ToastState {
  id: number
  msg: string | null
  action: ToastAction | null
  show: (msg: string, action?: ToastAction) => void
  hide: () => void
}

let timer: ReturnType<typeof setTimeout> | undefined

export const useToast = create<ToastState>()((set) => ({
  id: 0,
  msg: null,
  action: null,
  show: (msg, action) => {
    clearTimeout(timer)
    set((s) => ({ id: s.id + 1, msg, action: action ?? null }))
    timer = setTimeout(() => set({ msg: null, action: null }), action ? 6000 : 3000)
  },
  hide: () => {
    clearTimeout(timer)
    set({ msg: null, action: null })
  },
}))

export const toast = (msg: string, action?: ToastAction) => useToast.getState().show(msg, action)
