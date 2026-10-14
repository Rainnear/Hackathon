import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

import { fnv } from './checkcode'
import { clean, fullName, money, peso, plural } from '../domain/format'
import type { Analysis } from '../domain/analyze'
import type { Barangay, Submission, Tanod } from '../domain/types'

// These pages reproduce the official templates, so they stay black on white in every theme.

function chunk<T>(arr: T[], first: number, rest: number): T[][] {
  const out = [arr.slice(0, first)]
  for (let i = first; i < arr.length; i += rest) out.push(arr.slice(i, i + rest))
  return out
}

const Empty = () => <p className="empty">No tanods listed yet. Add them on the Barangays step.</p>

export function Masterlist({ sub, A, draft }: { sub: Submission; A: Analysis; draft: boolean }) {
  const rows = sub.brgys.flatMap((b) => b.tanods.map((t) => ({ t, b })))
  if (!rows.length) return <Empty />
  const pages = chunk(rows, 39, 44)
  return pages.map((pg, pi) => (
    <div className={`page portrait ${draft ? 'draft' : ''}`} key={pi}>
      <div className="ml-head">
        Republic of the Philippines<br />
        <b>PROVINCE OF ILOILO</b><br />
        <b>City/Municipality of <u>{sub.municipality.toUpperCase()}</u></b>
        <div className="t">MASTERLIST OF BARANGAY TANODS CY <u>{sub.year}</u></div>
      </div>
      <table className="paper">
        <thead>
          <tr>
            <th style={{ width: '7%' }}>NO.</th><th>LAST NAME</th><th>FIRST NAME</th>
            <th style={{ width: '10%' }}>MIDDLE INITIAL</th><th style={{ width: '8%' }}>SUFFIX</th><th style={{ width: '22%' }}>ADDRESS</th>
          </tr>
        </thead>
        <tbody>
          {pg.map(({ t, b }) => (
            <tr key={t.id}>
              <td className="c">{A.awards[t.id]}</td><td>{clean(t.last)}</td><td>{clean(t.first)}</td>
              <td className="c">{t.mi}</td><td className="c">{t.suffix}</td><td>Brgy. {b.name}, {sub.municipality}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="sigrow">
        <div><div className="nm">{sub.sig.liga}</div>LIGA PRESIDENT</div>
        <div><div className="nm">{sub.sig.mlgoo}</div>MLGOO</div>
      </div>
      <div className="pgno">Page {pi + 1} of {pages.length}</div>
    </div>
  ))
}

function CertBlock({ sub }: { sub: Submission }) {
  const s = sub.sig
  return (
    <div className="cert">
      <div><span className="k">A&nbsp; CERTIFIED: Services duly rendered as stated</span><span className="nm">{s.auth}</span>Signature over Printed Name / Position · Date<br />{s.authPos}</div>
      <div><span className="k">B&nbsp; CERTIFIED: Supporting documents complete and proper</span><span className="nm">{s.acct}</span>Signature over Printed Name · Date<br />Head of Accounting Division/Unit</div>
      <div><span className="k">C&nbsp; CERTIFIED: Cash available for the purpose</span><span className="nm">{s.treas}</span>Signature over Printed Name · Date<br />Head of Treasury Division/Unit</div>
      <div><span className="k">D&nbsp; APPROVED FOR PAYMENT</span><span className="nm">{s.lce}</span>Signature over Printed Name / Position · Date<br />Local Chief Executive</div>
      <div><span className="k">E&nbsp; CERTIFIED: Each employee whose name appears on the payroll has been paid the amount indicated</span><span className="nm">{s.disb || ' '}</span>Signature over Printed Name · Date<br />Disbursing Officer</div>
      <div><span className="k">F</span><span className="mt">CAFOA No.: {sub.obr.no || '________________'}</span><span className="mta">Date: ____________</span></div>
    </div>
  )
}

type PayLine = { band: string } | { t: Tanod; b: Barangay }

export function Payroll({ sub, A, draft }: { sub: Submission; A: Analysis; draft: boolean }) {
  const lines: PayLine[] = sub.brgys.flatMap((b) => (b.tanods.length ? [{ band: b.name }, ...b.tanods.map((t) => ({ t, b }))] : []))
  if (!lines.length) return <Empty />
  const pages = chunk(lines, 20, 22)
  return pages.map((pg, pi) => {
    const pageTotal = pg.filter((l) => 't' in l).length * sub.amount
    const last = pi === pages.length - 1
    return (
      <div className={`page landscape ${draft ? 'draft' : ''}`} key={pi}>
        <div className="pay-title">PROVINCIAL PAYROLL</div>
        <div className="pay-sub">For the period CY {sub.year}</div>
        <div className="pay-ack">
          We hereby acknowledge to have received from <b>{sub.sig.treas}</b>, Provincial Treasurer of Iloilo, the sum herein specified opposite our respective names, as Financial Assistance to Barangay Tanods in their services;
        </div>
        <table className="paper tight">
          <thead>
            <tr>
              <th rowSpan={2} style={{ width: '6%' }}>AWARD NUMBER</th><th colSpan={2}>NAME</th><th rowSpan={2} style={{ width: '15%' }}>ADDRESS</th>
              <th rowSpan={2} style={{ width: '9%' }}>AMOUNT DUE</th><th rowSpan={2} style={{ width: '6%' }}>AWARD NUMBER</th>
              <th rowSpan={2} style={{ width: '9%' }}>REMARKS</th><th rowSpan={2} style={{ width: '17%' }}>SIGNATURE</th>
            </tr>
            <tr><th>CLAIMANT</th><th style={{ width: '11%' }}>POSITION</th></tr>
          </thead>
          <tbody>
            {pi === 0 && <tr className="muni"><td colSpan={8}>MUNICIPALITY OF {sub.municipality.toUpperCase()}</td></tr>}
            {pg.map((l) =>
              'band' in l ? (
                <tr className="band" key={'b' + l.band}><td /><td colSpan={7}>BARANGAY {l.band.toUpperCase()}</td></tr>
              ) : (
                <tr key={l.t.id}>
                  <td className="c">{A.awards[l.t.id]}</td><td>{fullName(l.t)}</td><td>{l.t.pos}</td><td>Brgy. {l.b.name}</td>
                  <td className="r">{money(sub.amount)}</td><td className="c">{A.awards[l.t.id]}</td><td /><td />
                </tr>
              ),
            )}
            <tr className="tot"><td colSpan={4} className="r">Page total</td><td className="r">{money(pageTotal)}</td><td colSpan={3} /></tr>
            {last && <tr className="tot"><td colSpan={4} className="r">GRAND TOTAL (must equal ObR)</td><td className="r">{money(A.totals.amt)}</td><td colSpan={3} /></tr>}
          </tbody>
        </table>
        <CertBlock sub={sub} />
        <div className="pgno">Page {pi + 1} of {pages.length}</div>
      </div>
    )
  })
}

function coverData(sub: Submission, A: Analysis) {
  const roster = sub.brgys.flatMap((b) => b.tanods.map((t) => A.awards[t.id] + ':' + fullName(t)))
  return {
    m: sub.municipality,
    cy: sub.year,
    n: A.totals.n,
    amt: A.totals.amt,
    per: sub.amount,
    b: sub.brgys.filter((b) => b.tanods.length).map((b) => [b.name, b.tanods.length]),
    h: fnv(roster.join('|') + sub.year + sub.amount),
  }
}

export function CoverSheet({ sub, A, draft }: { sub: Submission; A: Analysis; draft: boolean }) {
  const d = coverData(sub, A)
  const payload = JSON.stringify(d)
  const [qr, setQr] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    QRCode.toDataURL(payload, { errorCorrectionLevel: 'L', margin: 0, width: 360 }).then(
      (url) => live && setQr(url),
      () => live && setQr(''),
    )
    return () => {
      live = false
    }
  }, [payload])
  const listed = sub.brgys.filter((b) => b.tanods.length)
  return (
    <div className={`page portrait cover ${draft ? 'draft' : ''}`}>
      <div className="ml-head">Republic of the Philippines<br /><b>PROVINCE OF ILOILO</b></div>
      <div className="cover-grid">
        <div>
          <h4>Submission cover sheet</h4>
          <div>Financial Assistance to Barangay Tanods · CY {d.cy}</div>
          <div className="cover-facts">
            Municipality: <b>{d.m}</b><br />
            Barangays included: <b>{listed.length}</b> of {sub.brgys.length}<br />
            Tanods: <b>{d.n}</b> × {peso(d.per)} = <b>{peso(d.amt)}</b><br />
            ObR No.: <b>{sub.obr.no || '—'}</b><br />
            Set check code: <b className="mono">{d.h}</b>
          </div>
        </div>
        <div>
          <div className="qr">{qr ? <img src={qr} alt="QR code with the set's counts and total" /> : qr === '' ? 'QR could not be drawn' : null}</div>
          <div className="qr-cap">Scan to verify counts and total</div>
        </div>
      </div>
      <table className="paper roomy">
        <thead>
          <tr><th>Barangay</th><th style={{ width: '14%' }}>Tanods</th><th style={{ width: '14%' }}>Limit</th><th style={{ width: '18%' }}>Award nos.</th><th style={{ width: '14%' }}>Cert.</th><th style={{ width: '14%' }}>IDs signed</th></tr>
        </thead>
        <tbody>
          {listed.map((b) => (
            <tr key={b.name}>
              <td>{b.name}</td><td className="c">{b.tanods.length}</td><td className="c">{b.limit}</td>
              <td className="c">{A.awards[b.tanods[0].id]}–{A.awards[b.tanods[b.tanods.length - 1].id]}</td>
              <td className="c">{b.docs.cert ? '✓' : '✗'}</td><td className="c">{b.tanods.filter((t) => t.ids >= 3).length}/{b.tanods.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="enclosed">
        <b>Documents enclosed:</b> ☐ Payroll ☐ Masterlist (signed every page) ☐ Barangay Certifications ☐ ID photocopies (3 signatures each) ☐ Proof of designation ☐ SPA (if applicable)
      </div>
      {A.errs > 0 && <div className="warnline"><b>{plural(A.errs, 'unresolved issue')}. Do not submit.</b></div>}
    </div>
  )
}
