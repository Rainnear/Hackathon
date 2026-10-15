import { useEffect, useId, useLayoutEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'

import { href, type Route } from '../state/route'
import type { Tone } from '../domain/types'
import { Icon } from './icons'

export function Chip({ tone, children, className = '' }: { tone: Tone; children: ReactNode; className?: string }) {
  return <span className={`chip ${tone} ${className}`}>{children}</span>
}

/**
 * A small "i" beside a heading: the explanation shows on hover, on keyboard focus, or when tapped, so
 * screens stay uncluttered and the help is still one tap away.
 */
export function InfoTip({ children, label = 'More about this' }: { children: ReactNode; label?: string }) {
  const id = useId()
  const wrap = useRef<HTMLSpanElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const body = useRef<HTMLSpanElement>(null)
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const open = hover || focus

  // Placed against the screen, not its box: panels that scroll or clip can't cut the text off.
  // Below the "i" when it fits, above it otherwise; never past the screen's edges.
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const b = btn.current?.getBoundingClientRect()
      const el = body.current
      if (!b || !el) return
      const gap = 8
      const w = el.offsetWidth
      const h = el.offsetHeight
      const left = Math.max(gap, Math.min(b.left - gap, window.innerWidth - w - gap))
      const below = b.bottom + gap
      const top = below + h <= window.innerHeight - gap || b.top - gap - h < gap ? below : b.top - gap - h
      el.style.left = `${left}px`
      el.style.top = `${top}px`
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    // Escape, or a tap anywhere else (phones don't always move focus on a tap), closes it.
    const close = () => {
      setHover(false)
      setFocus(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close()
    const away = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && close()
    window.addEventListener('keydown', esc)
    document.addEventListener('pointerdown', away)
    return () => {
      window.removeEventListener('keydown', esc)
      document.removeEventListener('pointerdown', away)
    }
  }, [open])

  return (
    <span ref={wrap} className="tip" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        ref={btn}
        type="button"
        className="tip-btn"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={open}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        onClick={() => setFocus(true)}
      >
        i
      </button>
      <span ref={body} role="tooltip" id={id} className={`tip-body${open ? ' on' : ''}`}>{children}</span>
    </span>
  )
}

const shutKey = (k: string) => `sakto.box-shut.${k}`
function readShut(k: string) {
  try {
    return localStorage.getItem(shutKey(k)) === '1'
  } catch {
    return false
  }
}

/**
 * tip: help text for the box, shown from an "i" beside the title.
 * collapsible: a name to remember it by; a caret beside the title folds the box away (remembered on
 * this device). While folded, alert shows a red (bad) or amber (warn) dot so waiting items aren't missed.
 */
export function Box({ title, aside, tip, children, className = '', id, collapsible, alert }: {
  title?: ReactNode; aside?: ReactNode; tip?: ReactNode; children: ReactNode; className?: string; id?: string
  collapsible?: string; alert?: 'bad' | 'warn' | null
}) {
  const [shut, setShut] = useState(() => (collapsible ? readShut(collapsible) : false))
  const bodyId = useId()
  const toggle = () => {
    const next = !shut
    setShut(next)
    try {
      localStorage.setItem(shutKey(collapsible!), next ? '1' : '0')
    } catch {
      // Private window or blocked storage: it just won't be remembered.
    }
  }
  const folded = !!collapsible && shut
  return (
    <section className={`box ${className}${folded ? ' shut' : ''}`} id={id}>
      {title && (
        <div className="box-hd">
          {collapsible && (
            <button type="button" className="box-caret" aria-expanded={!shut} aria-controls={bodyId} aria-label={shut ? 'Show this section' : 'Hide this section'} onClick={toggle}>
              <span className="chev" aria-hidden="true" />
            </button>
          )}
          <h3>{title}{tip && <InfoTip>{tip}</InfoTip>}</h3>
          {folded && alert && (
            <span className={`box-alert ${alert}`} role="img" aria-label={alert === 'bad' ? 'Has items that must be fixed' : 'Has items waiting'} />
          )}
          {aside && <div className="r">{aside}</div>}
        </div>
      )}
      {collapsible ? <div id={bodyId} hidden={shut}>{children}</div> : children}
    </section>
  )
}

export function PageHead({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="phead no-print">
      <div>
        <h2>{title}{sub && <InfoTip>{sub}</InfoTip>}</h2>
      </div>
      {children}
    </div>
  )
}

export function NextStep({ to, label }: { to: Route; label: string }) {
  return (
    <div className="next no-print">
      <a className="btn primary" href={href(to)} onClick={() => window.scrollTo({ top: 0 })}>
        {label} {Icon.next}
      </a>
    </div>
  )
}

type CommitInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange'> & {
  value: string
  /** Called on blur or Enter. Return a string to show instead (a cleaned or reverted value). */
  onCommit: (draft: string) => string | void
}

/**
 * Keeps typing local and saves on blur, for fields where half-typed values would mislead
 * (a year of "20", an amount below the floor). Give it key={value} so outside changes reset it.
 */
export function CommitInput({ value, onCommit, ...rest }: CommitInputProps) {
  const [draft, setDraft] = useState(value)
  const commit = () => {
    const shown = onCommit(draft)
    if (typeof shown === 'string') setDraft(shown)
  }
  return (
    <input
      {...rest}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}
