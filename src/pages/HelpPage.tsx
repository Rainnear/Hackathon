import { useEffect, useState } from 'react'

import { HowItWorks } from '../components/Illustrations'
import { Box, Chip, PageHead } from '../components/ui'
import { formatDateTime } from '../domain/format'
import { fetchSupportRequests, sendSupportRequest, type SupportRequest } from '../lib/supabase'
import { useAuth } from '../state/auth'
import { href } from '../state/route'
import { useStore } from '../state/store'

const DRAFT_KEY = 'sakto-help-draft'
const readDraft = () => {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? ''
  } catch {
    return ''
  }
}
const writeDraft = (text: string) => {
  try {
    if (text) localStorage.setItem(DRAFT_KEY, text)
    else localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* storage blocked: the draft just isn't kept */
  }
}

/** What a developer needs to reproduce a problem, gathered so nobody has to describe their phone. */
function useTechDetails(from: string | null): SupportRequest['details'] {
  const profile = useAuth((s) => s.profile)
  const sub = useStore((s) => s.sub)
  const lastBackupAt = useStore((s) => s.lastBackupAt)
  return {
    page: from ?? location.hash ?? '#/',
    online: navigator.onLine,
    role: profile?.role ?? null,
    municipality: profile?.municipality ?? null,
    barangay: profile?.barangay ?? null,
    saved_municipality: sub.municipality,
    saved_year: sub.year,
    saved_tanods: sub.brgys.reduce((a, b) => a + b.tanods.length, 0),
    last_backup: lastBackupAt,
    screen: `${window.innerWidth}×${window.innerHeight}`,
    device: navigator.userAgent,
  }
}

/** The "tell us what went wrong" form. Used on the Help page and on the waiting-for-approval screen. */
export function ReportProblem({ from, onSent }: { from: string | null; onSent?: () => void }) {
  const [text, setText] = useState(readDraft)
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const details = useTechDetails(from)

  const send = async () => {
    const message = text.trim()
    if (!message) return
    setState('sending')
    try {
      await sendSupportRequest(message, details)
      setText('')
      writeDraft('')
      setState('sent')
      onSent?.()
    } catch {
      setState('failed')
    }
  }

  return (
    <div className="report">
      <label htmlFor="help_msg" className="report-l">What went wrong?</label>
      <p className="note">Write it in your own words, in English, Tagalog or Hiligaynon. For example: "When I tap Print, the payroll does not show."</p>
      <textarea
        id="help_msg"
        rows={5}
        value={text}
        maxLength={4000}
        onChange={(e) => {
          setText(e.target.value)
          writeDraft(e.target.value)
          if (state !== 'sending') setState('idle')
        }}
      />
      <p className="note">
        We also send the page you were on, your phone or computer type, and whether you were online, so you don't have to explain them.
      </p>
      {state === 'sent' && <div className="banner ok">Sent. The Sakto team will look into it. You can see your message below.</div>}
      {state === 'failed' && (
        <div className="banner bad">
          It didn't send. {navigator.onLine ? 'Please try again in a moment.' : 'You have no internet right now.'} Your message is kept here, so tap Send again when you have signal.
        </div>
      )}
      <button type="button" className="btn primary big" onClick={send} disabled={!text.trim() || state === 'sending'}>
        {state === 'sending' ? 'Sending…' : 'Send to the Sakto team'}
      </button>
    </div>
  )
}

function MyReports({ version }: { version: number }) {
  const [rows, setRows] = useState<SupportRequest[] | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    fetchSupportRequests().then(
      (r) => {
        setRows(r)
        setError(false)
      },
      () => setError(true),
    )
  }, [version])
  if (error) return <p className="empty big">Your earlier messages show here when you're online.</p>
  if (!rows) return <p className="empty big">Loading…</p>
  if (!rows.length) return <p className="empty big">You haven't sent any messages yet.</p>
  return (
    <ul className="reports">
      {rows.map((r) => (
        <li key={r.id}>
          <div className="row">
            <Chip tone={r.status === 'solved' ? 'ok' : 'warn'}>{r.status === 'solved' ? 'Solved' : 'Being looked into'}</Chip>
            <span className="note">Sent {formatDateTime(r.created_at)}</span>
          </div>
          <p className="report-msg">{r.message}</p>
        </li>
      ))}
    </ul>
  )
}

const ANSWERS: { q: string; a: string }[] = [
  {
    q: 'I forgot my password',
    a: 'Sign out, then tap "Forgot your password?" on the sign-in screen. We email you a link; open it on the same phone or computer and choose a new password.',
  },
  {
    q: 'My account says "Waiting for approval"',
    a: 'Your municipal Liga Rep has to approve new accounts. Tell them you have signed up. Once they approve you, tap "Check again".',
  },
  {
    q: 'I have no internet or weak signal',
    a: 'You can keep encoding. Everything you type is saved on this phone or computer. Signing in for the first time and sending messages to the Sakto team need internet.',
  },
  {
    q: 'My tanods are gone, or I changed phones',
    a: 'Your list is saved online as soon as the phone or computer has internet. Sign in on the new device and it downloads by itself. Anything typed with no signal uploads the next time that device is online, so open Sakto on the old device once with internet before you stop using it.',
  },
  {
    q: 'It says "A new version of Sakto is ready"',
    a: 'Tap "Update now". Your saved tanods stay as they are. If the app looks wrong after an update, close it completely and open it again.',
  },
  {
    q: 'The printed pages are cut off or the wrong size',
    a: 'Print from Google Chrome on a computer. In the print window choose the 8.5 × 13 in paper size (called "Long" or "Folio" on some printers), set Margins to "None", and turn on "Background graphics".',
  },
  {
    q: 'The words are too small',
    a: 'On a computer, hold Ctrl and press + to make everything bigger (Ctrl and 0 to go back). On a phone, spread two fingers on the screen to zoom in.',
  },
]

export function HelpPage({ from }: { from: string | null }) {
  const isAdmin = useAuth((s) => s.profile?.role === 'admin')
  const [version, setVersion] = useState(0)
  const phone = import.meta.env.VITE_SUPPORT_PHONE?.trim()
  const email = import.meta.env.VITE_SUPPORT_EMAIL?.trim()

  return (
    <section className="page-section">
      <PageHead title="Help" sub="Answers to common problems, and a way to tell the Sakto team when something isn't working." />
      <Box title="How Sakto works">
        <div className="box-bd"><HowItWorks /></div>
      </Box>
      <div className="grid2 even">
        <div className="col">
          <Box title="Report a problem">
            <div className="box-bd">
              <ReportProblem from={from} onSent={() => setVersion((v) => v + 1)} />
            </div>
          </Box>
          {(phone || email) && (
            <Box title="Contact the Sakto team">
              <div className="box-bd stack">
                {phone && (
                  <div className="row">
                    <a className="btn big" href={`tel:${phone.replace(/[^\d+]/g, '')}`}>Call {phone}</a>
                    <a className="btn big" href={`sms:${phone.replace(/[^\d+]/g, '')}`}>Text</a>
                  </div>
                )}
                {email && <a className="btn big" href={`mailto:${email}?subject=${encodeURIComponent('Sakto: problem report')}`}>Email {email}</a>}
              </div>
            </Box>
          )}
          <Box title={isAdmin ? 'Problem reports' : 'Your messages'}>
            {isAdmin ? (
              <p className="empty big">
                Reports from everyone are on the <a className="linkbtn" href={href({ page: 'dashboard', view: 'province' })}>All of Iloilo dashboard</a>.
              </p>
            ) : (
              <MyReports version={version} />
            )}
          </Box>
        </div>
        <Box title="Quick answers">
          <div className="faq">
            {ANSWERS.map((x) => (
              <details key={x.q}>
                <summary>{x.q}</summary>
                <p>{x.a}</p>
              </details>
            ))}
          </div>
        </Box>
      </div>
    </section>
  )
}
