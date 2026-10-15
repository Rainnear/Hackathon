import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'

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
  return (
    <span className="tip">
      <button type="button" className="tip-btn" aria-label={label} aria-describedby={id}>i</button>
      <span role="tooltip" id={id} className="tip-body">{children}</span>
    </span>
  )
}

/** tip: help text for the box, shown from an "i" beside the title. */
export function Box({ title, aside, tip, children, className = '', id }: { title?: ReactNode; aside?: ReactNode; tip?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section className={`box ${className}`} id={id}>
      {title && (
        <div className="box-hd">
          <h3>{title}{tip && <InfoTip>{tip}</InfoTip>}</h3>
          {aside && <div className="r">{aside}</div>}
        </div>
      )}
      {children}
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
