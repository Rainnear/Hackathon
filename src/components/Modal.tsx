import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { Icon } from './icons'

/** A pop-up window. Uses the browser's own <dialog>, so Esc closes it and focus stays inside. */
export function Modal({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  // Rendered at the end of <body>, so a pop-up opened from a locked (disabled) list still works.
  return createPortal(
    <dialog
      ref={ref}
      className={`modal ${wide ? 'wide' : ''}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      {open && (
        <>
          <div className="modal-hd">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="iconbtn" aria-label="Close" onClick={onClose}>
              {Icon.x}
            </button>
          </div>
          {children}
        </>
      )}
    </dialog>,
    document.body,
  )
}
