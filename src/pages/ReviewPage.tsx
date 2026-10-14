import { Box, Chip, NextStep, PageHead } from '../components/ui'
import { IssueItem } from '../components/Issues'
import { expectedPayee, type Analysis } from '../domain/analyze'
import { digits, norm, peso, plural } from '../domain/format'
import type { ObrKey } from '../domain/types'
import { href } from '../state/route'
import { useStore } from '../state/store'

function Stats({ A }: { A: Analysis }) {
  const sub = useStore((s) => s.sub)
  const notStarted = sub.brgys.filter((b) => !b.tanods.length).length
  return (
    <div className="stats">
      <div className="stat"><div className="eyebrow">Barangays ready</div><div className="v">{A.ready} / {sub.brgys.length}</div><div className="n">{notStarted} not started</div></div>
      <div className="stat"><div className="eyebrow">Tanods listed</div><div className="v">{A.totals.n} / {A.totals.allowed}</div><div className="n">allowed for {sub.municipality}</div></div>
      <div className="stat"><div className="eyebrow">Payroll total</div><div className="v">{peso(A.totals.amt)}</div><div className="n">{A.totals.n} × {peso(sub.amount)}</div></div>
      <div className="stat"><div className="eyebrow">Blocking issues</div><div className={`v ${A.errs ? 'bad' : 'ok'}`}>{A.errs}</div><div className="n">{A.errs ? 'Documents print as DRAFT' : 'Ready to print'}</div></div>
    </div>
  )
}

function IssueGroups({ A }: { A: Analysis }) {
  const brgys = useStore((s) => s.sub.brgys)
  const whole = A.issues.filter((i) => !i.brgy)
  const groups = brgys.map((b) => ({ b, list: A.issues.filter((i) => i.brgy === b.name) })).filter((g) => g.list.length)
  if (!whole.length && !groups.length) return <p className="empty">Nothing to fix. The set is ready to print.</p>
  return (
    <>
      {whole.length > 0 && (
        <div className="group">
          <div className="ghd"><b>Whole submission</b></div>
          <ul className="issues">{whole.map((i, ix) => <IssueItem key={ix} issue={i} where="review" A={A} />)}</ul>
        </div>
      )}
      {groups.map(({ b, list }) => {
        const st = A.status[b.name]
        const focal = [b.focal.name, b.focal.phone].filter(Boolean).join(' · ')
        return (
          <div className="group" key={b.name}>
            <div className="ghd">
              <b>{b.name}</b>
              <Chip tone={st.tone}>{st.label}</Chip>
              {focal && <span className="note">{focal}</span>}
              <a className="btn sm r" href={href({ page: 'barangays', brgy: b.name })}>Open barangay</a>
            </div>
            <ul className="issues">{list.map((i, ix) => <IssueItem key={ix} issue={i} where="review" A={A} />)}</ul>
          </div>
        )
      })}
    </>
  )
}

function ObrCheck({ A }: { A: Analysis }) {
  const sub = useStore((s) => s.sub)
  const setObr = useStore((s) => s.setObr)
  const payee = expectedPayee(sub)
  const amt = A.totals.amt
  const payeeOK = !!sub.obr.payee && norm(sub.obr.payee) === norm(payee)
  const amtOK = sub.obr.amount !== '' && digits(sub.obr.amount) === amt
  const field = (k: ObrKey, label: string, extra: { placeholder?: string; inputMode?: 'decimal' } = {}) => (
    <div className="field">
      <label htmlFor={`obr_${k}`}>{label}</label>
      <input id={`obr_${k}`} value={sub.obr[k]} autoComplete="off" {...extra}
        onChange={(e) => setObr(k, e.target.value)} onBlur={(e) => setObr(k, e.target.value.trim())} />
    </div>
  )
  return (
    <Box title="Obligation Request check">
      <div className="box-bd">
        <p className="note mb3">Type the payee and amount exactly as written on the ObR from the province. They must match the payroll.</p>
        <div className="fields">
          {field('no', 'ObR number')}
          {field('payee', 'Payee on ObR', { placeholder: payee })}
          {field('amount', 'Amount on ObR', { placeholder: String(amt), inputMode: 'decimal' })}
        </div>
        <dl className="cmp">
          <dt>Payroll award #1</dt>
          <dd>{payee || '—'} {sub.obr.payee && <Chip tone={payeeOK ? 'ok' : 'bad'}>{payeeOK ? 'Matches ObR' : 'Differs from ObR'}</Chip>}</dd>
          <dt>Payroll total</dt>
          <dd>{peso(amt)} {sub.obr.amount !== '' && <Chip tone={amtOK ? 'ok' : 'bad'}>{amtOK ? 'Matches ObR' : 'Differs from ObR'}</Chip>}</dd>
        </dl>
      </div>
    </Box>
  )
}

export function ReviewPage({ A }: { A: Analysis }) {
  const sub = useStore((s) => s.sub)
  return (
    <section className="page-section">
      <PageHead
        title={`Review the ${sub.municipality} set`}
        sub="The municipality is submitted as one set, so one incomplete barangay holds up everyone. Clear every blocking issue before printing, or the pages carry a DRAFT mark."
      />
      <Stats A={A} />
      <div className="grid2">
        <Box title="What needs fixing" aside={<Chip tone={A.errs ? 'bad' : 'ok'}>{plural(A.issues.length, 'item')}</Chip>}>
          <IssueGroups A={A} />
        </Box>
        <ObrCheck A={A} />
      </div>
      <NextStep to={{ page: 'print', doc: 'masterlist' }} label="Continue to Print" />
    </section>
  )
}
