import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  className?: string
  overlayClassName?: string
}

/** Shared dialog material, focus containment, dismissal, and focus restoration. */
export function ModalShell({ title, onClose, children, className = '', overlayClassName = '' }: Props) {
  const panel = useRef<HTMLElement>(null)
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose }, [onClose])
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    const app = document.getElementById('root')
    const previousInert = app?.inert ?? false
    document.body.style.overflow = 'hidden'
    if (app) app.inert = true
    const dialog = panel.current!
    const elements = () => [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
      .filter(element => element.getClientRects().length > 0)
    ;(dialog.querySelector<HTMLElement>('[autofocus]') || dialog).focus({ preventScroll: true })
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current() }
      if (event.key !== 'Tab') return
      const focusable = elements()
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first) { event.preventDefault(); dialog.focus(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKey, true)
    return () => {
      document.removeEventListener('keydown', handleKey, true)
      document.body.style.overflow = previousOverflow
      if (app) app.inert = previousInert
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [])
  return createPortal(
    <div className={`dialog-backdrop ${overlayClassName}`} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={panel} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={`dialog-panel ${className}`}>
        {children}
      </section>
    </div>, document.body,
  )
}
