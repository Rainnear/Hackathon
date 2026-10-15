import { useState } from 'react'

import { IssueItem } from '../components/Issues'
import { Box, Chip, PageHead } from '../components/ui'
import type { Analysis } from '../domain/analyze'
import { clean, fullName, plural } from '../domain/format'
import type { Issue, RowNote, Tanod } from '../domain/types'
import { acceptListName, readCertificationPhoto } from '../lib/scans'
import { useEditable } from '../state/access'
import { buildReferences } from '../state/references'
import { href } from '../state/route'
import { useScans } from '../state/scans'
import { useStore } from '../state/store'
import { useSync } from '../state/sync'
import { toast } from '../state/toast'

type Mark = { tone: 'ok' | 'warn' | 'bad' | 'idle'; text: string }
const MARK: Record<Mark['tone'], string> = { ok: '✓', warn: '!', bad: '✗', idle: '–' }

function Cell({ m }: { m: Mark }) {
  return (
    <td className={`dc ${m.tone}`}>
      <span className="dc-mark" aria-hidden="true">{MARK[m.tone]}</span> {m.text}
    </td>
  )
}

/**
 * The barangay secretary's last check before printing: each tanod across the Masterlist, Payroll,
 * Barangay Certification and ID photocopy, with exactly what is wrong and where, and the documents.
 */
export function SecretaryReviewPage({ A }: { A: Analysis }) {
  const sub = useStore((s) => s.sub)
  const brgyIds = useStore((s) => s.remote?.brgyIds)
  const scans = useScans((s) => s.list)
  const upsert = useScans((s) => s.upsert)
  const online = useSync((s) => s.online)
  const editable = useEditable()
  const [reading, setReading] = useState(false)
  const b = sub.brgys[0]
  if (!b) return null
  const bid = brgyIds?.[b.name]
  const refs = buildReferences(scans, brgyIds)
  const certScan = [...scans].reverse().find((x) => x.kind === 'certification' && x.barangay_id === bid && x.status === 'saved')
  const certNames = refs.certs[b.name]
  const notes = (t: Tanod): RowNote[] => A.notes[t.id] ?? []
  const has = (t: Tanod, prefix: string) => notes(t).find((n) => n.text.startsWith(prefix))

  const listMark = (t: Tanod): Mark => {
    const bad = notes(t).find((n) => n.level === 'error' && n.kind !== 'ids')
    if (!clean(t.last) || !clean(t.first)) return { tone: 'bad', text: 'Name incomplete' }
    if (bad) return { tone: 'bad', text: 'Must fix' }
    return { tone: 'ok', text: 'Prints' }
  }
  const certMark = (t: Tanod): Mark => {
    if (!certScan) return { tone: 'idle', text: 'No photo yet' }
    if (!certNames) return { tone: 'idle', text: 'Not read yet' }
    const n = has(t, 'Certification:')
    if (!n) return { tone: 'ok', text: 'On it' }
    return n.text.includes('not on the signed') ? { tone: 'bad', text: 'Missing' } : { tone: 'warn', text: 'Differs' }
  }
  const idMark = (t: Tanod): Mark => {
    if (!refs.ids[t.id]) return { tone: 'idle', text: 'Not scanned' }
    return has(t, 'ID:') ? { tone: 'warn', text: 'Differs' } : { tone: 'ok', text: 'Matches' }
  }
  const signMark = (t: Tanod): Mark => (t.ids >= 3 ? { tone: 'ok', text: 'Signed' } : { tone: 'bad', text: 'Not yet' })

  const readCert = async () => {
    if (!certScan) return
    setReading(true)
    const s = await readCertificationPhoto(certScan)
    setReading(false)
    if (!s) return toast('The certification photo could not be read. Check your internet, or attach a clearer photo.')
    upsert(s)
    toast(s.fields.rows?.length ? `${plural(s.fields.rows.length, 'name')} read from the signed certification.` : 'No names could be read from the photo. Attach a clearer photo.')
  }

  // The ID was checked again and the list is right: update the ID record, and the warning goes.
  const keepList = async (t: Tanod) => {
    const sc = scans.find((x) => x.kind === 'id' && x.tanod_id === t.id && x.status === 'saved')
    if (!sc) return
    try {
      upsert(await acceptListName(sc, { last: t.last, first: t.first, mi: t.mi, suffix: t.suffix }))
      toast(`The ID record of ${fullName(t)} now matches the list.`)
    } catch {
      toast('That did not save. Check your internet and try again.')
    }
  }

  const rank = (i: Issue) => (i.level === 'error' ? 0 : i.kind === 'check' ? 2 : 1)
  const general = A.issues.filter((i) => !i.rows && (i.brgy === b.name || i.also === b.name)).sort((x, y) => rank(x) - rank(y))
  const errs = A.issues.filter((i) => i.level === 'error').length
  const checks = A.issues.length - errs

  return (
    <section className="page-section">
      <PageHead
        title="Check before printing"
        sub="Every tanod across the four documents you hand to the Liga Rep: the Masterlist, the Payroll, the signed Barangay Certification and the ID photocopy. Each problem says exactly what differs; Go to it opens the row."
      />
      <div className={`banner ${errs ? 'bad' : checks ? '' : 'ok'}`}>
        {errs
          ? `${plural(errs, 'problem')} must be fixed before printing${checks ? `, and ${plural(checks, 'thing')} to double-check` : ''}.`
          : checks
            ? `Nothing blocks printing. ${plural(checks, 'thing')} to double-check below.`
            : 'Everything matches. The documents are ready to print.'}
      </div>

      <Box title="The documents" tip="Print them on long bond paper. The Masterlist, Payroll and Certification all come from your tanod list, so they always name the same people.">
        <ul className="doc-links">
          <li><a href={href({ page: 'templates', doc: 'masterlist', brgy: null })}>Masterlist (your barangay's copy)</a></li>
          <li><a href={href({ page: 'templates', doc: 'payroll', brgy: null })}>Payroll (your barangay's part)</a></li>
          <li><a href={href({ page: 'templates', doc: 'certification', brgy: b.name })}>Barangay Certification</a></li>
          <li><a href={href({ page: 'templates', doc: 'idcopy', brgy: null })}>ID photocopies for signing</a></li>
        </ul>
        <div className="box-ft">
          {!certScan ? (
            <span className="note">
              No photo of the signed certification yet. Once it's signed, attach a photo under Requirements on the{' '}
              <a className="linkbtn" href={href({ page: 'barangays', brgy: b.name })}>Tanods</a> page; Sakto reads the names and checks them against your list.
            </span>
          ) : (
            <span className="row">
              <span className="note">
                Signed certification photo: {certNames ? `${plural(certNames.length, 'name')} read from it and checked below.` : 'attached, names not read yet.'}
              </span>
              {editable && online && (
                <button type="button" className="btn sm" disabled={reading} onClick={() => void readCert()}>
                  {reading ? 'Reading…' : certNames ? 'Read again' : 'Read the names'}
                </button>
              )}
            </span>
          )}
        </div>
      </Box>

      <Box title="Each tanod, document by document" aside={<Chip tone={errs ? 'bad' : checks ? 'warn' : 'ok'}>{b.tanods.length} tanods</Chip>}>
        {b.tanods.length ? (
          <div className="doc-table-wrap">
            <table className="doc-table">
              <thead>
                <tr>
                  <th>No.</th><th>Tanod</th><th>Masterlist &amp; Payroll</th><th>Certification</th><th>ID scan</th><th>ID signed</th><th>What to fix</th>
                </tr>
              </thead>
              <tbody>
                {b.tanods.map((t, i) => {
                  const ns = notes(t)
                  return (
                    <tr key={t.id} className={ns.some((n) => n.level === 'error') ? 'err' : ns.length ? 'warnf' : ''}>
                      <td className="num">{i + 1}</td>
                      <td><b>{fullName(t) || 'No name yet'}</b></td>
                      <Cell m={listMark(t)} />
                      <Cell m={certMark(t)} />
                      <Cell m={idMark(t)} />
                      <Cell m={signMark(t)} />
                      <td className="fix">
                        {ns.length ? (
                          <>
                            <ul>{ns.map((n, k) => <li key={k} className={n.level}>{n.text}</li>)}</ul>
                            <span className="row">
                              <a className="linkbtn" href={href({ page: 'barangays', brgy: b.name, focus: t.id })}>Go to it</a>
                              {idMark(t).tone === 'warn' && editable && online && (
                                <button type="button" className="linkbtn" onClick={() => void keepList(t)} title="You checked the ID again and the list is right: the ID record takes the list's spelling.">
                                  The list is right
                                </button>
                              )}
                            </span>
                          </>
                        ) : (
                          <span className="note">Nothing</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">No tanods listed yet.</p>
        )}
      </Box>

      {general.length > 0 && (
        <Box title="For the whole barangay">
          <ul className="issues">{general.map((i, k) => <IssueItem key={k} issue={i} where="local" A={A} />)}</ul>
        </Box>
      )}
    </section>
  )
}
