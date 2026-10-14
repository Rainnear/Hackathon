import { useState } from 'react'

import { Box, PageHead } from '../components/ui'
import { BarangayCertification, type CertOptions } from '../documents/Certification'
import { plural } from '../domain/format'
import { useAuth } from '../state/auth'
import { href, navigate } from '../state/route'
import { useStore } from '../state/store'

// Remembered on this device: the dates for each year, the Punong Barangay's name for each barangay.
const KEY = 'sakto-certification'
interface Saved {
  years: Record<string, { asOf: string; issued: string; blankDay: boolean }>
  captains: Record<string, string>
}
function readSaved(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null
    return { years: s?.years ?? {}, captains: s?.captains ?? {} }
  } catch {
    return { years: {}, captains: {} }
  }
}
function writeSaved(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage blocked: options just aren't remembered */
  }
}
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function CertificatePage({ brgy }: { brgy: string | null }) {
  const sub = useStore((s) => s.sub)
  const solo = useAuth((s) => s.profile?.role === 'secretary')
  const [saved, setSaved] = useState(readSaved)
  const all = !solo && brgy === null
  const b = solo ? sub.brgys[0] : sub.brgys.find((x) => x.name === brgy)
  const capKey = (name: string) => `${sub.municipality}/${name}`
  const yearOpts = saved.years[sub.year] ?? { asOf: today(), issued: today(), blankDay: true }

  const update = (patch: Partial<Saved['years'][string]>, captain?: string) => {
    const next: Saved = {
      years: { ...saved.years, [sub.year]: { ...yearOpts, ...patch } },
      captains: b && captain !== undefined ? { ...saved.captains, [capKey(b.name)]: captain } : saved.captains,
    }
    setSaved(next)
    writeSaved(next)
  }
  const opts = (name: string): CertOptions => ({ ...yearOpts, captain: saved.captains[capKey(name)] ?? '' })
  const listed = sub.brgys.filter((x) => x.tanods.length)
  const shown = all ? listed : b ? [b] : []

  return (
    <section className="page-section">
      <PageHead
        title="Barangay Certification"
        sub="Filled in from the tanod list. Print it on long bond paper (8.5 × 13 in) for the Punong Barangay to sign. In the print window, turn off headers and footers and set margins to none."
      >
        <div className="row">
          {!solo && (
            <select
              aria-label="Barangay"
              value={brgy ?? ''}
              onChange={(e) => navigate({ page: 'certificate', brgy: e.target.value || null }, { replace: true, scroll: false })}
            >
              <option value="">All barangays with tanods ({listed.length})</option>
              {sub.brgys.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
            </select>
          )}
          <button type="button" className="btn primary" onClick={() => window.print()} disabled={!shown.length}>
            Print {all ? plural(shown.length, 'certification') : ''}
          </button>
        </div>
      </PageHead>

      <Box title="Fill in" className="no-print">
        <div className="box-bd fields">
          <div className="field">
            <label htmlFor="c_asof">Service rendered as of</label>
            <input id="c_asof" type="date" value={yearOpts.asOf} onChange={(e) => update({ asOf: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="c_issued">Date issued</label>
            <input id="c_issued" type="date" value={yearOpts.issued} onChange={(e) => update({ issued: e.target.value })} />
            <label className="check-inline small">
              <input type="checkbox" checked={yearOpts.blankDay} onChange={(e) => update({ blankDay: e.target.checked })} />
              Leave the day blank, to write by hand when signed
            </label>
          </div>
          {b && !all && (
            <div className="field">
              <label htmlFor="c_cap">Punong Barangay's name (optional)</label>
              <input
                id="c_cap"
                className="upper"
                value={saved.captains[capKey(b.name)] ?? ''}
                placeholder="Leave blank to write by hand"
                autoComplete="off"
                onChange={(e) => update({}, e.target.value)}
              />
            </div>
          )}
        </div>
        {all && <p className="box-bd note pt0">To add a Punong Barangay's name, choose that barangay above. Names you enter are kept on this device.</p>}
      </Box>

      {b && !b.tanods.length && !all && (
        <div className="banner no-print">
          No tanods listed for Brgy. {b.name} yet. <a className="btn sm" href={href({ page: 'barangays', brgy: b.name })}>Add tanods</a>
        </div>
      )}
      <div className="docs">
        {shown.length ? (
          shown.map((x) => <BarangayCertification key={x.name} municipality={sub.municipality} b={x} o={opts(x.name)} />)
        ) : (
          <p className="empty">No barangay has tanods listed yet.</p>
        )}
      </div>
    </section>
  )
}
