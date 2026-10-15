import { useEffect, useState, type FormEvent, type ReactNode } from 'react'

import {
  fetchBarangays,
  fetchMunicipalities,
  friendlyAuthError,
  isUsernameAccount,
  loginEmail,
  supabase,
  type BarangayRow,
  type MunicipalityRow,
} from '../lib/supabase'
import { useAuth } from '../state/auth'
import { ReportProblem } from './HelpPage'

function AuthCard({ title, sub, children, footer }: { title: string; sub?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/logo.svg" alt="" width="36" height="36" />
          <div>
            <b>Sakto</b>
            <span>Tanod incentive documents · Province of Iloilo</span>
          </div>
        </div>
        <h2>{title}</h2>
        {sub && <p className="sub">{sub}</p>}
        {children}
      </div>
      {footer && <div className="auth-foot">{footer}</div>}
    </div>
  )
}

function Message({ tone, children }: { tone: 'bad' | 'ok'; children: ReactNode }) {
  return (
    <p className={`auth-msg ${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>
      {children}
    </p>
  )
}

function PasswordField({ id, label, value, onChange, autoComplete, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string; hint?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="pw">
        <input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required minLength={8} />
        <button type="button" className="linkbtn" onClick={() => setShow(!show)} aria-pressed={show}>
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      {hint && <small className="note">{hint}</small>}
    </div>
  )
}

type Mode = 'signin' | 'signup' | 'forgot'

function SignIn({ go }: { go: (m: Mode) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail(email), password })
    setBusy(false)
    if (error) setError(friendlyAuthError(error.message))
  }
  return (
    <AuthCard
      title="Sign in"
      sub="Barangay secretaries, the municipal Liga Rep and the provincial office sign in here."
      footer={<>New here? <button type="button" className="linkbtn" onClick={() => go('signup')}>Create an account</button></>}
    >
      <form className="stack" onSubmit={submit}>
        <div className="field">
          <label htmlFor="si_email">Email or username</label>
          <input
            id="si_email"
            type="text"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <PasswordField id="si_pw" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
        {error && <Message tone="bad">{error}</Message>}
        <button type="submit" className="btn primary block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <button type="button" className="linkbtn center" onClick={() => go('forgot')}>Forgot your password?</button>
      </form>
    </AuthCard>
  )
}

function SignUp({ go }: { go: (m: Mode) => void }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '', municipality: '', barangay: '' })
  // Barangay secretary: one barangay. Liga Rep: the whole municipality.
  const [as, setAs] = useState<'secretary' | 'rep'>('secretary')
  const rep = as === 'rep'
  const [munis, setMunis] = useState<MunicipalityRow[]>([])
  const [brgys, setBrgys] = useState<BarangayRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<'confirm' | null>(null)
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    fetchMunicipalities().then(
      (m) => {
        setMunis(m)
        if (m.length === 1) setForm((f) => ({ ...f, municipality: String(m[0].id) }))
      },
      (e: Error) => setError(friendlyAuthError(e.message)),
    )
  }, [])
  useEffect(() => {
    if (!form.municipality) return
    let live = true
    fetchBarangays(Number(form.municipality)).then(
      (b) => live && setBrgys(b),
      (e: Error) => live && setError(friendlyAuthError(e.message)),
    )
    return () => {
      live = false
    }
  }, [form.municipality])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.municipality) return setError('Choose your municipality.')
    if (!rep && !form.barangay) return setError('Choose your barangay.')
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        emailRedirectTo: location.origin,
        data: rep
          ? { full_name: form.name.trim(), phone: form.phone.trim(), requested_role: 'rep', municipality_id: form.municipality }
          : { full_name: form.name.trim(), phone: form.phone.trim(), requested_role: 'secretary', barangay_id: form.barangay },
      },
    })
    setBusy(false)
    if (error) return setError(friendlyAuthError(error.message))
    // With email confirmation on (the Supabase default) there is no session until the link is opened.
    if (!data.session) setDone('confirm')
  }

  if (done)
    return (
      <AuthCard
        title="Check your email"
        sub={
          <>
            We sent a confirmation link to <b>{form.email}</b>. Open it on this device, then sign in. After that,{' '}
            {rep ? 'the provincial office (OPPDC) approves you as Liga Rep.' : `the ${munis.find((m) => String(m.id) === form.municipality)?.name ?? 'municipal'} Liga Rep approves your account.`}
          </>
        }
        footer={<button type="button" className="linkbtn" onClick={() => go('signin')}>Back to sign in</button>}
      >
        <span />
      </AuthCard>
    )

  return (
    <AuthCard
      title="Create an account"
      sub="For barangay secretaries and Liga Reps. Each account is approved before it can see any tanods."
      footer={<>Already have an account? <button type="button" className="linkbtn" onClick={() => go('signin')}>Sign in</button></>}
    >
      <form className="stack" onSubmit={submit}>
        <fieldset className="plain su-as">
          <legend className="lbl-like">I am signing up as</legend>
          <label className={`reason ${!rep ? 'on' : ''}`}>
            <input type="radio" name="su_as" checked={!rep} onChange={() => setAs('secretary')} />
            <span>
              Barangay secretary
              <small>Represents one barangay. Approved by the municipality's Liga Rep.</small>
            </span>
          </label>
          <label className={`reason ${rep ? 'on' : ''}`}>
            <input type="radio" name="su_as" checked={rep} onChange={() => setAs('rep')} />
            <span>
              Liga Rep
              <small>Represents the whole municipality. Approved by the provincial office.</small>
            </span>
          </label>
        </fieldset>
        <div className="field">
          <label htmlFor="su_name">Full name</label>
          <input id="su_name" value={form.name} onChange={(e) => set('name')(e.target.value)} autoComplete="name" required />
        </div>
        <div className="fields">
          <div className="field">
            <label htmlFor="su_muni">Municipality</label>
            <select id="su_muni" value={form.municipality} onChange={(e) => setForm((f) => ({ ...f, municipality: e.target.value, barangay: '' }))} required>
              <option value="">Choose…</option>
              {munis.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          {!rep && (
            <div className="field">
              <label htmlFor="su_brgy">Barangay</label>
              <select id="su_brgy" value={form.barangay} onChange={(e) => set('barangay')(e.target.value)} required disabled={!brgys.length}>
                <option value="">Choose…</option>
                {brgys.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="field">
          <label htmlFor="su_phone">Mobile number</label>
          <input id="su_phone" type="tel" inputMode="tel" value={form.phone} onChange={(e) => set('phone')(e.target.value)} autoComplete="tel" placeholder="0917 123 4567" />
        </div>
        <div className="field">
          <label htmlFor="su_email">Email</label>
          <input id="su_email" type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} autoComplete="email" required />
        </div>
        <PasswordField id="su_pw" label="Password" value={form.password} onChange={set('password')} autoComplete="new-password" hint="At least 8 characters." />
        {error && <Message tone="bad">{error}</Message>}
        <button type="submit" className="btn primary block" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
    </AuthCard>
  )
}

function Forgot({ go }: { go: (m: Mode) => void }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    if (!email.includes('@') || isUsernameAccount(email)) {
      setBusy(false)
      setError('Accounts that sign in with a username have no email to send a link to. Ask the Sakto team to reset the password.')
      return
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin })
    setBusy(false)
    if (error) setError(friendlyAuthError(error.message))
    else setSent(true)
  }
  return (
    <AuthCard
      title="Reset your password"
      sub="Enter the email you signed up with. We'll send a link to set a new password."
      footer={<button type="button" className="linkbtn" onClick={() => go('signin')}>Back to sign in</button>}
    >
      {sent ? (
        <Message tone="ok">If an account uses {email}, a reset link is on its way. Open it on this device.</Message>
      ) : (
        <form className="stack" onSubmit={submit}>
          <div className="field">
            <label htmlFor="fp_email">Email</label>
            <input id="fp_email" type="text" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </div>
          {error && <Message tone="bad">{error}</Message>}
          <button type="submit" className="btn primary block" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
        </form>
      )}
    </AuthCard>
  )
}

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signin')
  if (mode === 'signup') return <SignUp go={setMode} />
  if (mode === 'forgot') return <Forgot go={setMode} />
  return <SignIn go={setMode} />
}

export function NewPassword() {
  const finishRecovery = useAuth((s) => s.finishRecovery)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setError(friendlyAuthError(error.message))
    else finishRecovery()
  }
  return (
    <AuthCard title="Set a new password">
      <form className="stack" onSubmit={submit}>
        <PasswordField id="np_pw" label="New password" value={password} onChange={setPassword} autoComplete="new-password" hint="At least 8 characters." />
        {error && <Message tone="bad">{error}</Message>}
        <button type="submit" className="btn primary block" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
      </form>
    </AuthCard>
  )
}

/**
 * Accounts made with a starting password (OPPDC-ADMIN, DEV-Admin) must choose their own before Sakto
 * opens. Supabase drops the account's "must change password" mark when the password changes.
 */
export function FirstPassword() {
  const session = useAuth((s) => s.session)
  const markPasswordChanged = useAuth((s) => s.markPasswordChanged)
  const signOut = useAuth((s) => s.signOut)
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const email = session?.user.email ?? ''
  const who = isUsernameAccount(email) ? email.split('@')[0].toUpperCase() : email
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password !== again) return setError('The two passwords are different. Type the same new password twice.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setBusy(false)
      return setError(friendlyAuthError(error.message))
    }
    // A fresh session carries the account without the mark, so the next sign-in goes straight in.
    await supabase.auth.refreshSession().catch(() => {})
    setBusy(false)
    markPasswordChanged()
  }
  return (
    <AuthCard
      title="Choose your own password"
      sub={
        <>
          You signed in{who ? <> as <b>{who}</b></> : null} with a starting password that other people know. Choose a new one that only you know before
          you continue. You will sign in with it from now on.
        </>
      }
      footer={<button type="button" className="linkbtn" onClick={signOut}>Sign out</button>}
    >
      <form className="stack" onSubmit={submit}>
        <PasswordField id="fp_new" label="New password" value={password} onChange={setPassword} autoComplete="new-password" hint="At least 8 characters. Not the starting password." />
        <PasswordField id="fp_again" label="Type it again" value={again} onChange={setAgain} autoComplete="new-password" />
        {error && <Message tone="bad">{error}</Message>}
        <button type="submit" className="btn primary block" disabled={busy}>{busy ? 'Saving…' : 'Save and continue'}</button>
      </form>
    </AuthCard>
  )
}

export function Pending() {
  const { profile, signOut, refreshProfile, offline, session } = useAuth()
  const askedRep = session?.user.user_metadata?.requested_role === 'rep'
  const [checking, setChecking] = useState(false)
  const [helping, setHelping] = useState(false)
  return (
    <AuthCard
      title="Waiting for approval"
      sub={
        <>
          {askedRep ? (
            <>
              Your account as Liga Rep{profile?.municipality ? ` of ${profile.municipality}` : ''} is set up. The provincial office (OPPDC) needs to approve it before you can see
              the municipality's lists. Let them know you've signed up.
            </>
          ) : (
            <>
              Your account{profile?.barangay ? ` for Brgy. ${profile.barangay}` : ''} is set up. The {profile?.municipality ?? 'municipal'} Liga Rep needs to approve it before you can see
              and encode tanods. Let them know you've signed up.
            </>
          )}
        </>
      }
      footer={<button type="button" className="linkbtn" onClick={signOut}>Sign out</button>}
    >
      {offline && <Message tone="bad">You're offline. Connect to check whether you've been approved.</Message>}
      <button
        type="button"
        className="btn primary block"
        disabled={checking}
        onClick={async () => {
          setChecking(true)
          await refreshProfile()
          setChecking(false)
        }}
      >
        {checking ? 'Checking…' : 'Check again'}
      </button>
      {helping ? (
        <ReportProblem from="#/waiting-for-approval" />
      ) : (
        <button type="button" className="linkbtn center" onClick={() => setHelping(true)}>Having a problem? Tell the Sakto team</button>
      )}
    </AuthCard>
  )
}

export function ProfileMissing() {
  const signOut = useAuth((s) => s.signOut)
  return (
    <AuthCard title="Account not set up" sub="You're signed in, but there's no Sakto profile for this account yet. If you just signed up, wait a moment and reload. Otherwise ask your Liga Rep or administrator." footer={<button type="button" className="linkbtn" onClick={signOut}>Sign out</button>}>
      <button type="button" className="btn primary block" onClick={() => location.reload()}>Reload</button>
    </AuthCard>
  )
}

export function NotConfigured() {
  return (
    <AuthCard title="Connect Sakto to Supabase" sub="The app needs your Supabase project's address and publishable key before anyone can sign in.">
      <ol className="steps-list">
        <li>In the <code>sakto</code> folder, copy <code>.env.example</code> to a new file named <code>.env.local</code>.</li>
        <li>In the Supabase dashboard, open <b>Project Settings › API</b> and copy the <b>Project URL</b> and the <b>publishable</b> (or <b>anon public</b>) key into it.</li>
        <li>Stop the dev server with Ctrl+C and start it again with <code>npm run dev</code>.</li>
      </ol>
    </AuthCard>
  )
}
