import { Box, CommitInput, PageHead } from '../components/ui'
import { clean, peso } from '../domain/format'
import { deadlineInfo } from '../domain/deadline'
import { useEditable } from '../state/access'
import { useAuth } from '../state/auth'
import { certDatesFor, legacyCaptain, setCertDates, useCertSaved } from '../state/certOptions'
import { useStore } from '../state/store'

/**
 * A barangay secretary's Setup: their barangay's own details, which print on the Barangay Certification
 * and the barangay's masterlist copy. The municipality's settings are the Liga Rep's; shown read-only.
 */
export function BarangaySetupPage() {
  const sub = useStore((s) => s.sub)
  const setOfficial = useStore((s) => s.setOfficial)
  const setFocal = useStore((s) => s.setFocal)
  const profileName = useAuth((s) => s.profile?.full_name ?? '')
  const editable = useEditable()
  const saved = useCertSaved()
  const b = sub.brgys[0]
  if (!b) return null
  const dates = certDatesFor(saved, sub.year)
  const captain = b.officials.captain || legacyCaptain(saved, sub.municipality, b.name)
  const day = (iso: string) => (iso ? deadlineInfo(iso)?.long ?? iso : 'Not set')

  return (
    <section className="page-section">
      <PageHead
        title={`Barangay details · Brgy. ${b.name}`}
        sub="Set these once. They print on the Barangay Certification and on your barangay's copy of the masterlist, so every page names the same people."
      />
      <fieldset className="plain" disabled={!editable}>
        <div className="grid2 even">
          <Box title="Who signs" tip="The Punong Barangay signs the Barangay Certification and certifies your masterlist copy. You prepare them as barangay secretary.">
            <div className="box-bd fields">
              <div className="field">
                <label htmlFor="bs_cap">Punong Barangay</label>
                <CommitInput key={'c' + captain} id="bs_cap" className="upper" value={captain} autoComplete="off" placeholder="Full name"
                  onCommit={(v) => { const c = clean(v); setOfficial(b.name, 'captain', c); return c }} />
              </div>
              <div className="field">
                <label htmlFor="bs_sec">Barangay secretary</label>
                <CommitInput key={'s' + b.officials.secretary} id="bs_sec" className="upper" value={b.officials.secretary} autoComplete="off" placeholder={profileName.toUpperCase() || 'Full name'}
                  onCommit={(v) => { const c = clean(v); setOfficial(b.name, 'secretary', c); return c }} />
              </div>
            </div>
          </Box>
          <Box title="Focal person" tip="The person the Liga Rep texts about this barangay's list.">
            <div className="box-bd fields">
              <div className="field">
                <label htmlFor="bs_fname">Name</label>
                <CommitInput key={'f' + b.focal.name} id="bs_fname" value={b.focal.name} autoComplete="off" onCommit={(v) => setFocal(b.name, 'name', v.trim())} />
              </div>
              <div className="field">
                <label htmlFor="bs_fphone">Mobile number</label>
                <CommitInput key={'p' + b.focal.phone} id="bs_fphone" value={b.focal.phone} inputMode="tel" autoComplete="off" placeholder="0917 123 4567" onCommit={(v) => setFocal(b.name, 'phone', v.trim())} />
              </div>
            </div>
          </Box>
          <Box title="Barangay Certification dates" tip="Printed on the certification. Kept on this device for each year.">
            <div className="box-bd fields">
              <div className="field">
                <label htmlFor="bs_asof">Service rendered as of</label>
                <input id="bs_asof" type="date" value={dates.asOf} onChange={(e) => setCertDates(sub.year, { asOf: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="bs_issued">Date issued</label>
                <input id="bs_issued" type="date" value={dates.issued} onChange={(e) => setCertDates(sub.year, { issued: e.target.value })} />
                <label className="check-inline small">
                  <input type="checkbox" checked={dates.blankDay} onChange={(e) => setCertDates(sub.year, { blankDay: e.target.checked })} />
                  Leave the day blank, to write by hand when signed
                </label>
              </div>
            </div>
          </Box>
          <Box title={`${sub.municipality} · CY ${sub.year}`} tip="Set by the Liga Rep for the whole municipality. Shown here so you can check them; ask the Liga Rep if something is wrong.">
            <dl className="box-bd facts">
              <dt>Amount per tanod</dt><dd>{peso(sub.amount)}</dd>
              <dt>Tanod limit, Brgy. {b.name}</dt><dd>{b.limit}</dd>
              <dt>Your deadline</dt><dd>{day(sub.barangayDue)}</dd>
              <dt>Province's deadline</dt><dd>{day(sub.provinceDue)}</dd>
              <dt>Liga President</dt><dd>{sub.sig.liga || '—'}</dd>
              <dt>MLGOO</dt><dd>{sub.sig.mlgoo || '—'}</dd>
            </dl>
          </Box>
        </div>
      </fieldset>
    </section>
  )
}
