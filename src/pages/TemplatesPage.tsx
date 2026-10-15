import { useState } from 'react'

import { SignatoryField } from '../components/SignatoryField'
import { Box, CommitInput, PageHead } from '../components/ui'
import { BarangayCertification, type CertOptions } from '../documents/Certification'
import { CoverSheet, Masterlist, Payroll } from '../documents/Documents'
import { scopeToBarangay, type Analysis } from '../domain/analyze'
import { clean, fullName, plural } from '../domain/format'
import type { Barangay, TemplateId } from '../domain/types'
import { IdCopy } from '../documents/IdCopy'
import { useAuth } from '../state/auth'
import { useScans } from '../state/scans'
import { certDatesFor, legacyCaptain, setCertDates, useCertSaved, type CertDates } from '../state/certOptions'
import { useEditable } from '../state/access'
import { href, navigate } from '../state/route'
import { useStore } from '../state/store'

interface Template {
  id: TemplateId
  title: string
  /** What the form is for, in a sentence. */
  what: string
  signs: string
  fills: string
  paper: 'portrait' | 'landscape'
  /** Can be printed with empty lines, to write by hand. */
  blank: boolean
  /** Can be printed for one barangay. */
  perBrgy: boolean
  /** Secretaries see it too (their own barangay only). */
  secretary: boolean
}

const TEMPLATES: Template[] = [
  {
    id: 'certification', title: 'Barangay Certification',
    what: "The Punong Barangay certifies that the barangay's tanods have served at least six months and planted at least five trees this year.",
    signs: 'Punong Barangay', fills: 'Barangay, municipality, tanod names, dates',
    paper: 'portrait', blank: true, perBrgy: true, secretary: true,
  },
  {
    id: 'masterlist', title: 'Masterlist of Barangay Tanods',
    what: 'Every tanod in the municipality with their award number and address. It goes with the payroll and uses the same award numbers.',
    signs: 'Liga President and MLGOO, on every page', fills: 'Award numbers, names, addresses, year, signatories',
    paper: 'portrait', blank: true, perBrgy: true, secretary: true,
  },
  {
    id: 'payroll', title: 'Provincial Payroll',
    what: 'The paying document. Each tanod signs beside their name when they receive the incentive. The grand total must match the ObR.',
    signs: 'Each tanod, and the officials in boxes A to E', fills: 'Award numbers, names, positions, amounts, totals, signatories',
    paper: 'landscape', blank: true, perBrgy: true, secretary: true,
  },
  {
    id: 'cover', title: 'Submission cover sheet',
    what: "The first page of the municipality's set: counts, total and a QR code the province scans to check them.",
    signs: 'No signatures', fills: 'Counts per barangay, total, ObR number, check code',
    paper: 'portrait', blank: false, perBrgy: false, secretary: false,
  },
  {
    id: 'idcopy', title: 'ID photocopy for signing',
    what: "A tanod's ID, front and back, with three lines for their signature. Print it, have the tanod sign it three times, and add it to the set.",
    signs: 'The tanod, three times', fills: 'Name, position, barangay and the scanned ID (or boxes to attach a photocopy)',
    paper: 'portrait', blank: false, perBrgy: true, secretary: true,
  },
]

/** Print once every ID photo on the page has loaded, so none prints as an empty box. */
async function printWhenReady() {
  const imgs = [...document.querySelectorAll<HTMLImageElement>('.docs img')].filter((i) => !i.complete)
  await Promise.race([
    Promise.all(
      imgs.map(
        (i) =>
          new Promise((r) => {
            i.addEventListener('load', r, { once: true })
            i.addEventListener('error', r, { once: true })
          }),
      ),
    ),
    new Promise((r) => setTimeout(r, 8000)),
  ])
  window.print()
}

export function TemplatesPage({ A, doc, brgy, tanod = null }: { A: Analysis; doc: TemplateId | null; brgy: string | null; tanod?: string | null }) {
  const solo = useAuth((s) => s.profile?.role === 'secretary')
  const list = TEMPLATES.filter((t) => !solo || t.secretary)
  const t = list.find((x) => x.id === doc)
  return t ? <TemplateView key={t.id} t={t} A={A} brgy={solo ? null : brgy} tanod={tanod} solo={solo} /> : <Gallery list={list} />
}

function Gallery({ list }: { list: Template[] }) {
  return (
    <section className="page-section">
      <PageHead
        title="Document templates"
        sub="The forms for the tanod incentive. Each one can be filled in from the tanod list in Sakto, or printed blank to write by hand."
      />
      <div className="tpl-grid">
        {list.map((t) => (
          <article className="box tpl-card" key={t.id}>
            <div className={`tpl-paper ${t.paper}`} aria-hidden="true"><i /><i /><i /><i /><i /></div>
            <div className="tpl-bd">
              <h3>{t.title}</h3>
              <p>{t.what}</p>
              <dl className="tpl-facts">
                <dt>Signed by</dt><dd>{t.signs}</dd>
                <dt>Filled in</dt><dd>{t.fills}</dd>
                <dt>Paper</dt><dd>Long bond, {t.paper}{t.blank ? ' · can print blank' : ''}</dd>
              </dl>
            </div>
            <div className="tpl-ft">
              <a className="btn primary block" href={href({ page: 'templates', doc: t.id, brgy: null })}>
                {t.blank ? 'Fill in and print' : 'Open and print'}
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function TemplateView({ t, A, brgy, tanod, solo }: { t: Template; A: Analysis; brgy: string | null; tanod: string | null; solo: boolean }) {
  const sub = useStore((s) => s.sub)
  const scans = useScans((s) => s.list)
  const profileName = useAuth((s) => s.profile?.full_name)
  const [blank, setBlank] = useState(false)
  const saved = useCertSaved()
  const setOfficial = useStore((s) => s.setOfficial)
  const editable = useEditable()
  // A secretary's list holds only their own barangay.
  const b = solo ? sub.brgys[0] : t.perBrgy && brgy ? sub.brgys.find((x) => x.name === brgy) : undefined
  const only = b?.name ?? null
  const listed = sub.brgys.filter((x) => x.tanods.length)
  const count = b ? b.tanods.length : listed.reduce((a, x) => a + x.tanods.length, 0)
  const nothing = !blank && count === 0
  // Blank forms carry no names to check. One barangay's part is marked only for that barangay's problems.
  const errs = solo || !only ? A.errs : scopeToBarangay(A, only).errs
  const isId = t.id === 'idcopy'
  const draft = !blank && t.id !== 'certification' && !isId && errs > 0
  // ID pages: one tanod (from "Print ID for signing"), or everyone in the barangay(s) shown.
  const idPeople = (b ? [b] : listed).flatMap((x) => x.tanods.filter((p) => !tanod || p.id === tanod).map((p) => ({ b: x, t: p })))
  const idScan = (id: string) => scans.find((x) => x.tanod_id === id && x.status === 'saved')

  const isCert = t.id === 'certification'
  const yearOpts = certDatesFor(saved, sub.year)
  const update = (patch: Partial<CertDates>) => setCertDates(sub.year, patch)
  // The Punong Barangay's name: from the barangay's details (Setup), or one typed on this device before.
  const captainOf = (x: Barangay | null | undefined) => (x ? x.officials.captain || legacyCaptain(saved, sub.municipality, x.name) : '')
  const certOpts = (x: Barangay | null): CertOptions => ({
    ...(blank ? { asOf: '', issued: '', blankDay: true } : yearOpts),
    captain: captainOf(x),
  })
  const certs: (Barangay | null)[] = blank ? [b ?? null] : b ? [b] : listed

  // A secretary's copy: their barangay only, award numbers left to the Liga Rep, signed in the barangay.
  const props = { sub, A, draft, only, blank, barangayCopy: solo ? { preparedBy: (b?.officials.secretary || profileName || '').toUpperCase(), captain: captainOf(b).toUpperCase() } : undefined }
  const pages = isCert ? (blank ? 1 : certs.length) : 0

  return (
    <section className="page-section">
      <PageHead
        title={t.title}
        sub={`${t.what} Print on long bond paper (8.5 × 13 in)${t.paper === 'landscape' ? ', landscape' : ''}. In the print window, turn off headers and footers and set margins to none.`}
      >
        <div className="row">
          <a className="btn" href={href({ page: 'templates', doc: null, brgy: null })}>All templates</a>
          <button type="button" className="btn primary" onClick={() => void printWhenReady()} disabled={nothing || (isId && !idPeople.length)}>
            Print{isCert && pages > 1 ? ` ${plural(pages, 'certification')}` : ''}
          </button>
        </div>
      </PageHead>

      {(t.blank || (t.perBrgy && !solo) || isCert || isId) && (
        <Box
          title="Fill in"
          className="no-print"
          tip={
            <>
              {fillNote(t.id, blank, b?.name ?? null, b?.limit ?? 0, solo)}
              {(t.id === 'masterlist' || t.id === 'payroll') && !solo && (
                <>
                  {' '}
                  {t.id === 'masterlist' ? 'The names are printed above the two signature lines on every page.' : 'The names are printed in boxes A to E and in the opening line.'} They are
                  the same names as on the Setup page, so a change here changes them there too.
                </>
              )}
              {isCert && !blank && !b && " To add a Punong Barangay's name, choose that barangay. Names you enter are kept on this device."}
            </>
          }
        >
          <div className="box-bd stack">
            {t.blank && (
              <div className="field">
                <span className="lbl-like">Names</span>
                <div className="seg" role="group" aria-label="Names">
                  <button type="button" aria-pressed={!blank} onClick={() => setBlank(false)}>From the tanod list</button>
                  <button type="button" aria-pressed={blank} onClick={() => setBlank(true)}>Blank, to write by hand</button>
                </div>
              </div>
            )}
            <div className="fields">
              {isId && b && (
                <div className="field">
                  <label htmlFor="t_tanod">Tanod</label>
                  <select
                    id="t_tanod"
                    value={tanod ?? ''}
                    onChange={(e) => navigate({ page: 'templates', doc: t.id, brgy: b.name, ...(e.target.value ? { tanod: e.target.value } : {}) }, { replace: true, scroll: false })}
                  >
                    <option value="">Everyone in Brgy. {b.name} ({b.tanods.length})</option>
                    {b.tanods.map((x) => <option key={x.id} value={x.id}>{fullName(x) || 'No name yet'}</option>)}
                  </select>
                </div>
              )}
              {t.perBrgy && !solo && (
                <div className="field">
                  <label htmlFor="t_brgy">Barangay</label>
                  <select
                    id="t_brgy"
                    value={only ?? ''}
                    onChange={(e) => navigate({ page: 'templates', doc: t.id, brgy: e.target.value || null }, { replace: true, scroll: false })}
                  >
                    <option value="">
                      {blank ? (isCert ? 'None: leave the barangay blank' : 'None: leave the addresses blank') : isCert ? `All barangays with tanods (${listed.length})` : 'All barangays'}
                    </option>
                    {sub.brgys.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
                  </select>
                </div>
              )}
              {isCert && !blank && (
                <>
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
                </>
              )}
              {isCert && b && (
                <div className="field">
                  <label htmlFor="c_cap">Punong Barangay's name (optional)</label>
                  <CommitInput
                    key={b.name + captainOf(b)}
                    id="c_cap"
                    className="upper"
                    value={captainOf(b)}
                    placeholder="Leave blank to write by hand"
                    autoComplete="off"
                    disabled={!editable}
                    onCommit={(v) => {
                      const c = clean(v)
                      setOfficial(b.name, 'captain', c)
                      return c
                    }}
                  />
                </div>
              )}
            </div>
            {t.id === 'masterlist' && !solo && (
              <div className="fields">
                <SignatoryField k="liga" label="Liga ng mga Barangay President" />
                <SignatoryField k="mlgoo" label="MLGOO (Municipal Local Government Operations Officer)" />
              </div>
            )}
            {t.id === 'payroll' && !solo && (
              <div className="fields">
                {(['treas', 'auth', 'authPos', 'acct', 'lce', 'disb'] as const).map((k) => <SignatoryField key={k} k={k} />)}
              </div>
            )}
          </div>
        </Box>
      )}

      {nothing && (
        <div className="banner no-print">
          {b ? `No tanods listed for Brgy. ${b.name} yet.` : 'No tanods listed yet.'}{' '}
          {t.blank && 'Choose "Blank, to write by hand" to print an empty form.'}
          <a className="btn sm" href={href({ page: 'barangays', brgy: b?.name ?? null })}>Add tanods</a>
        </div>
      )}
      {draft && (
        <div className="banner bad no-print">
          {plural(errs, 'blocking issue')}{only ? ` in Brgy. ${only}` : ''}. Pages are marked DRAFT until they are fixed.
          {!solo && <a className="btn sm" href={href({ page: 'review' })}>See issues</a>}
        </div>
      )}

      {!nothing && (
        <div className="docs">
          {t.id === 'masterlist' && <Masterlist {...props} />}
          {t.id === 'payroll' && <Payroll {...props} />}
          {t.id === 'cover' && <CoverSheet {...props} />}
          {isId &&
            idPeople.map(({ b: x, t: p }) => {
              const sc = idScan(p.id)
              return <IdCopy key={p.id} municipality={sub.municipality} year={sub.year} b={x} t={p} front={sc?.front_path ?? null} back={sc?.back_path ?? null} />
            })}
          {isCert && certs.map((x) => <BarangayCertification key={x?.name ?? 'blank'} municipality={sub.municipality} b={x} o={certOpts(x)} blank={blank} />)}
        </div>
      )}
    </section>
  )
}

/** One line under the options saying what will be filled in and what is left blank. */
function fillNote(id: TemplateId, blank: boolean, brgy: string | null, limit: number, solo = false) {
  const lines = brgy ? `${plural(limit, 'line')} (the limit for Brgy. ${brgy})` : null
  if (id === 'idcopy')
    return 'One page per tanod. A scanned ID prints on the page; without one, the boxes are left to attach the photocopy. The tanod signs on all three lines.'
  if (id === 'cover') return 'Filled in from the whole municipality: counts per barangay, total and check code.'
  if (solo && !blank && id === 'masterlist')
    return `Your barangay's copy: check every name against the IDs, then have it signed by the Punong Barangay. The Liga Rep's masterlist uses the municipal award numbers.`
  if (solo && !blank && id === 'payroll')
    return `Your barangay's part of the payroll, to check every name and position. The Liga Rep prints the official payroll with the award numbers.`
  if (!blank) {
    if (id === 'certification') return brgy ? `Filled in with the tanods of Brgy. ${brgy}.` : 'One certification for each barangay that has tanods.'
    return brgy
      ? `Only the tanods of Brgy. ${brgy}, with their municipal award numbers.${id === 'payroll' ? ' The total is for this barangay only, not the ObR.' : ''}`
      : 'Every tanod in the municipality, in award-number order.'
  }
  if (id === 'certification') return `${lines ?? '15 lines'} for names. The municipality is filled in; the dates are left for the Punong Barangay.`
  if (id === 'masterlist') return `${lines ?? '139 numbered lines on 4 pages, like the provincial template'}. The year, municipality and signatories are filled in.`
  return `${lines ?? 'One page of lines'}. The year, municipality and the officials in boxes A to E are filled in; names and amounts are left blank.`
}
