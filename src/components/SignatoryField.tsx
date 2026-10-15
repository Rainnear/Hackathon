import { SIG_LABELS, SIG_REQUIRED } from '../domain/analyze'
import { clean } from '../domain/format'
import type { SignatoryKey } from '../domain/types'
import { useEditable } from '../state/access'
import { useStore } from '../state/store'
import { CommitInput } from './ui'

/** A name printed on the forms. Setup and the Templates page edit the same value. */
export function SignatoryField({ k, label, hint }: { k: SignatoryKey; label?: string; hint?: string }) {
  const value = useStore((s) => s.sub.sig[k])
  const setSignatory = useStore((s) => s.setSignatory)
  const editable = useEditable()
  const optional = !SIG_REQUIRED.includes(k) && k !== 'authPos'
  return (
    <div className="field">
      <label htmlFor={`sig_${k}`}>
        {label ?? SIG_LABELS[k]}
        {optional && ' (optional)'}
      </label>
      <CommitInput
        key={value}
        id={`sig_${k}`}
        value={value}
        autoComplete="off"
        disabled={!editable}
        placeholder={hint}
        className={k === 'authPos' ? '' : 'upper'}
        onCommit={(v) => {
          const c = k === 'authPos' ? v.trim() : clean(v)
          setSignatory(k, c)
          return c
        }}
      />
    </div>
  )
}
