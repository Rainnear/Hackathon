import { useStore } from '../state/store'
import { href, navigate } from '../state/route'
import { toast } from '../state/toast'
import { matchesFilter, type Analysis } from '../domain/analyze'
import type { Issue } from '../domain/types'

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Older browsers and plain-http LAN testing: fall back to a hidden textarea.
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

/** Copy the reminder, and on phones open the SMS app addressed to the barangay focal person. */
export function SmsActions({ text, brgy, compact = false }: { text: string; brgy: string | null; compact?: boolean }) {
  const focal = useStore((s) => s.sub.brgys.find((b) => b.name === brgy)?.focal)
  const phone = focal?.phone.replace(/[^\d+]/g, '') ?? ''
  const who = focal?.name || focal?.phone
  const copy = async () => {
    const ok = await copyText(text)
    toast(ok ? `Message copied.${who ? ` Send it to ${[focal?.name, focal?.phone].filter(Boolean).join(', ')}.` : ''}` : 'Copy did not work. Select the text and copy it by hand.')
  }
  if (compact)
    return (
      <>
        {' · '}
        <button type="button" className="linkbtn" onClick={copy}>Copy SMS</button>
        {phone && <> · <a className="linkbtn" href={`sms:${phone}?body=${encodeURIComponent(text)}`}>Text {focal?.name || 'focal person'}</a></>}
      </>
    )
  return (
    <>
      <button type="button" className="btn sm" onClick={copy}>Copy SMS reminder</button>
      {phone && <a className="btn sm" href={`sms:${phone}?body=${encodeURIComponent(text)}`}>Text {who}</a>}
    </>
  )
}

export function IssueItem({ issue, where, A }: { issue: Issue; where: 'review' | 'local'; A: Analysis }) {
  const sub = useStore((s) => s.sub)
  const setFilter = useStore((s) => s.setFilter)
  const showEmpty = () => {
    setFilter('empty')
    const first = sub.brgys.find((b) => matchesFilter('empty', A.status[b.name].tone))
    navigate({ page: 'barangays', brgy: first?.name ?? null })
  }
  const nav = where === 'review' && !issue.brgy
  const hasActs = issue.sms || (nav && (issue.kind === 'setup' || issue.kind === 'empty'))
  return (
    <li className={`issue ${issue.level}`}>
      <span className="sev" title={issue.level === 'error' ? 'Blocks printing' : 'Needs a check'} />
      <div>
        <div className="t">{issue.msg}</div>
        {issue.why && <div className="w">{issue.why}</div>}
        {hasActs && (
          <div className="acts">
            {nav && issue.kind === 'setup' && <a className="btn sm" href={href({ page: 'setup' })}>Open Setup</a>}
            {nav && issue.kind === 'empty' && <button type="button" className="btn sm" onClick={showEmpty}>Show them</button>}
            {issue.sms && <SmsActions text={issue.sms} brgy={issue.brgy} />}
          </div>
        )}
      </div>
    </li>
  )
}
