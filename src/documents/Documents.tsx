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

export interface DocProps {
  sub: Submission
  A: Analysis
  draft: boolean
  /** One barangay's part only; award numbers stay the municipality's. */
  only?: string | null
  /** Empty lines to write by hand. The headers and signatories are still filled in. */
  blank?: boolean
  /**
   * A barangay's own copy (the secretary's): award numbers are left to the Liga Rep, and the masterlist
   * is signed by the barangay. preparedBy is the secretary's name.
   */
  barangayCopy?: { preparedBy: string; captain?: string }
}

/** Lines on a blank form: the barangay's limit, or one page when no barangay is chosen. */
const blankLines = (b: Barangay | undefined, onePage: number) => Array.from({ length: b ? b.limit : onePage }, (_, i) => i)

export function Masterlist({ sub, A, draft, only = null, blank = false, barangayCopy }: DocProps) {
  const brgys = only ? sub.brgys.filter((b) => b.name === only) : sub.brgys
  const rows: ({ t: Tanod; b: Barangay } | { line: number })[] = blank
    // With no barangay chosen, the provincial template's 139 lines (4 pages).
    ? blankLines(only ? brgys[0] : undefined, 139).map((line) => ({ line }))
    : brgys.flatMap((b) => b.tanods.map((t) => ({ t, b })))
  if (!rows.length) return <Empty />
  // As in the provincial template: 39 lines on page 1 under the title and headings, then 44 per page.
  const pages = chunk(rows, 39, 44)
  return pages.map((pg, pi) => (
    <div className={`page portrait ${draft ? 'draft' : ''}`} key={pi}>
      <div className="ml-head">
        Republic of the Philippines<br />
        <b>PROVINCE OF ILOILO</b><br />
        <b>City/Municipality of <u>{sub.municipality.toUpperCase()}</u></b>
        {pi === 0 && <div className="t">MASTERLIST OF BARANGAY TANODS CY <u>{sub.year}</u></div>}
      </div>
      <table className={`paper ${pi ? 'cont' : ''}`}>
        <colgroup>
          <col style={{ width: '7%' }} /><col /><col /><col style={{ width: '10%' }} /><col style={{ width: '8%' }} /><col style={{ width: '22%' }} />
        </colgroup>
        {pi === 0 && (
          <thead>
            <tr>
              <th>NO.</th><th>LAST NAME</th><th>FIRST NAME</th><th>MIDDLE INITIAL</th><th>SUFFIX</th><th>ADDRESS</th>
            </tr>
          </thead>
        )}
        <tbody>
          {pg.map((r) =>
            'line' in r ? (
              <tr key={r.line}>
                <td className="c">{r.line + 1}</td><td /><td /><td /><td /><td>{only ? `Brgy. ${only}, ${sub.municipality}` : ''}</td>
              </tr>
            ) : (
              <tr key={r.t.id}>
                <td className="c">{A.awards[r.t.id]}</td><td>{clean(r.t.last)}</td><td>{clean(r.t.first)}</td>
                <td className="c">{r.t.mi}</td><td className="c">{r.t.suffix}</td><td>Brgy. {r.b.name}, {sub.municipality}</td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      {barangayCopy ? (
        <div className="sigrow">
          <div><div className="nm">{barangayCopy.preparedBy}</div>PREPARED BY: BARANGAY SECRETARY</div>
          <div><div className="nm">{barangayCopy.captain || ' '}</div>CERTIFIED CORRECT: PUNONG BARANGAY</div>
        </div>
      ) : (
        <div className="sigrow">
          <div><div className="nm">{sub.sig.liga}</div>LIGA PRESIDENT</div>
          <div><div className="nm">{sub.sig.mlgoo}</div>MLGOO</div>
        </div>
      )}
      <div className="pgno">Page {pi + 1} of {pages.length}</div>
    </div>
  ))
}

function Signer({ k, what, name, cap, role }: { k: string; what: string; name: string; cap: string; role: string }) {
  return (
    <div>
      <span className="k">{k}&nbsp; {what}</span>
      <span className="sig">
        <span className="nm">{name}</span>
        <span className="cap">{cap} · Date</span>
        <span className="cap">{role}</span>
      </span>
    </div>
  )
}

function CertBlock({ sub }: { sub: Submission }) {
  const s = sub.sig
  return (
    <div className="cert">
      <Signer k="A" what="CERTIFIED: Services duly rendered as stated" name={s.auth} cap="Signature over Printed Name / Position" role={s.authPos} />
      <Signer k="B" what="CERTIFIED: Supporting documents complete and proper" name={s.acct} cap="Signature over Printed Name" role="Head of Accounting Division/Unit" />
      <Signer k="C" what="CERTIFIED: Cash available for the purpose" name={s.treas} cap="Signature over Printed Name" role="Head of Treasury Division/Unit" />
      <Signer k="D" what="APPROVED FOR PAYMENT" name={s.lce} cap="Signature over Printed Name / Position" role="Local Chief Executive" />
      <Signer k="E" what="CERTIFIED: Each employee whose name appears on the payroll has been paid the amount indicated" name={s.disb} cap="Signature over Printed Name" role="Disbursing Officer" />
      <div className="cf">
        <span className="k">F</span>
        <span>CAFOA No.: {sub.obr.no ? <u>{sub.obr.no}</u> : <span className="blank w12" />}</span>
        <span>Date: <span className="blank w12" /></span>
      </div>
    </div>
  )
}

type PayLine = { band: string; cont?: boolean } | { t: Tanod; b: Barangay } | { line: number }

// Lines per landscape sheet (barangay headings count as lines), sized so a sheet never spills over and each
// row is tall enough to sign in. The first sheet also carries the municipality's line.
const PAY_FIRST = 13
const PAY_REST = 14

/**
 * Splits the payroll into sheets. A barangay heading never ends a sheet, and a barangay that runs onto
 * the next sheet gets its heading again, marked "continued".
 */
function paySheets(lines: PayLine[]): PayLine[][] {
  const sheets: PayLine[][] = []
  let cur: PayLine[] = []
  let cap = PAY_FIRST
  let band: string | null = null
  for (const l of lines) {
    const isBand = 'band' in l
    if (isBand) band = l.band
    if (cur.length && cur.length + (isBand ? 2 : 1) > cap) {
      sheets.push(cur)
      cur = !isBand && band !== null ? [{ band, cont: true }] : []
      cap = PAY_REST
    }
    cur.push(l)
  }
  if (cur.length) sheets.push(cur)
  return sheets
}

export function Payroll({ sub, A, draft, only = null, blank = false, barangayCopy }: DocProps) {
  // The barangay's copy leaves award numbers to the Liga Rep, who numbers the whole municipality.
  const award = (t: Tanod) => (barangayCopy ? '' : A.awards[t.id])
  const brgys = only ? sub.brgys.filter((b) => b.name === only) : sub.brgys
  const lines: PayLine[] = blank
    ? [{ band: only ?? '' }, ...blankLines(only ? brgys[0] : undefined, 20).map((line) => ({ line }))]
    : brgys.flatMap((b) => (b.tanods.length ? [{ band: b.name }, ...b.tanods.map((t) => ({ t, b }))] : []))
  if (!lines.length) return <Empty />
  const pages = paySheets(lines)
  // A blank form leaves the amounts to be written in; one barangay's part has its own total, not the ObR's.
  const total = brgys.reduce((a, b) => a + b.tanods.length, 0) * sub.amount
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
        <table className="paper tight pay">
          <colgroup>
            <col style={{ width: '6%' }} /><col style={{ width: '21%' }} /><col style={{ width: '11%' }} /><col style={{ width: '12%' }} />
            <col style={{ width: '8%' }} /><col style={{ width: '6%' }} /><col style={{ width: '10%' }} /><col style={{ width: '26%' }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2}>AWARD NUMBER</th><th colSpan={2}>NAME</th><th rowSpan={2}>ADDRESS</th>
              <th rowSpan={2}>AMOUNT DUE</th><th rowSpan={2}>AWARD NUMBER</th>
              <th rowSpan={2}>REMARKS</th><th rowSpan={2}>SIGNATURE</th>
            </tr>
            <tr><th>CLAIMANT</th><th>POSITION</th></tr>
          </thead>
          <tbody>
            {pi === 0 && <tr className="pay-muni"><td colSpan={8}>MUNICIPALITY OF {sub.municipality.toUpperCase()}</td></tr>}
            {pg.map((l) =>
              'band' in l ? (
                <tr className="band" key={'b' + l.band}>
                  <td /><td colSpan={7}>BARANGAY {l.band ? l.band.toUpperCase() : <span className="blank w12" />}{l.cont && <span className="cont"> (continued)</span>}</td>
                </tr>
              ) : 'line' in l ? (
                <tr key={l.line}><td /><td /><td /><td>{only ? `Brgy. ${only}` : ''}</td><td /><td /><td /><td /></tr>
              ) : (
                <tr key={l.t.id}>
                  <td className="c">{award(l.t)}</td><td>{fullName(l.t)}</td><td>{l.t.pos}</td><td>Brgy. {l.b.name}</td>
                  <td className="r">{money(sub.amount)}</td><td className="c">{award(l.t)}</td><td /><td />
                </tr>
              ),
            )}
            <tr className="tot"><td colSpan={4} className="r">Page total</td><td className="r">{blank ? '' : money(pageTotal)}</td><td colSpan={3} /></tr>
            {last && (
              <tr className="tot">
                <td colSpan={4} className="r">{only ? `TOTAL, BARANGAY ${only.toUpperCase()}` : 'GRAND TOTAL (must equal ObR)'}</td>
                <td className="r">{blank ? '' : money(only ? total : A.totals.amt)}</td><td colSpan={3} />
              </tr>
            )}
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
