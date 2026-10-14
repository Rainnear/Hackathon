import { PageHead } from '../components/ui'
import { CoverSheet, Masterlist, Payroll } from '../documents/Documents'
import type { Analysis } from '../domain/analyze'
import { plural } from '../domain/format'
import type { DocView } from '../domain/types'
import { href } from '../state/route'
import { useStore } from '../state/store'

const DOCS: { value: DocView; label: string }[] = [
  { value: 'masterlist', label: 'Masterlist' },
  { value: 'payroll', label: 'Payroll' },
  { value: 'cover', label: 'Cover sheet + QR' },
]

export function PrintPage({ A, doc }: { A: Analysis; doc: DocView }) {
  const sub = useStore((s) => s.sub)
  const draft = A.errs > 0
  const props = { sub, A, draft }
  return (
    <section className="page-section">
      <PageHead
        title="Print the documents"
        sub="Use long bond paper, 8.5 × 13 in. The payroll prints landscape. In the print dialog, turn off headers and footers and set margins to none."
      >
        <div className="row">
          <div className="seg" role="group" aria-label="Document">
            {DOCS.map((d) => (
              <a key={d.value} href={href({ page: 'print', doc: d.value })} aria-pressed={doc === d.value} role="button">
                {d.label}
              </a>
            ))}
          </div>
          <button type="button" className="btn primary" onClick={() => window.print()}>Print</button>
        </div>
      </PageHead>
      {draft ? (
        <div className="banner bad no-print">
          {plural(A.errs, 'blocking issue')}. Pages are marked DRAFT until they are fixed.
          <a className="btn sm" href={href({ page: 'review' })}>See issues</a>
        </div>
      ) : (
        <div className="banner ok no-print">All checks passed. Award numbers, names, year and total match across every document.</div>
      )}
      <div className="docs">
        {doc === 'payroll' ? <Payroll {...props} /> : doc === 'cover' ? <CoverSheet {...props} /> : <Masterlist {...props} />}
      </div>
    </section>
  )
}
