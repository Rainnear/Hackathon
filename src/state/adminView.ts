import { create } from 'zustand'

// Administrators (the provincial office) are not tied to one municipality. They start on "All of Iloilo"
// and can open any municipality's dashboard, read-only. The one they opened is remembered on this device.

export interface AdminMunicipality {
  id: number
  name: string
}

const KEY = 'sakto-admin-municipality'
const read = (): AdminMunicipality | null => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as AdminMunicipality | null
    return v && typeof v.id === 'number' && typeof v.name === 'string' ? v : null
  } catch {
    return null
  }
}
const write = (v: AdminMunicipality | null) => {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v))
    else localStorage.removeItem(KEY)
  } catch {
    /* storage blocked: the choice lasts until the page is reloaded */
  }
}

export const useAdminView = create<{ muni: AdminMunicipality | null }>(() => ({ muni: read() }))

export function openMunicipality(m: AdminMunicipality) {
  write(m)
  useAdminView.setState({ muni: m })
}

export function leaveMunicipality() {
  write(null)
  useAdminView.setState({ muni: null })
}
