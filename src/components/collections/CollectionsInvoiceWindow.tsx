import { useEffect, useId } from 'react'
import { GripHorizontal, X } from 'lucide-react'
import AdminInvoiceDetailView from '../batches/AdminInvoiceDetailView'
import { useDraggablePanel } from '../../hooks/useDraggablePanel'
import { useIsMobileViewport } from '../../hooks/useIsMobileViewport'
import { useClientTheme } from '../../theme/ThemeContext'
import type { Invoice } from '../../types/invoice'

/**
 * Movable Collections invoice window — list stays full width underneath.
 */
export default function CollectionsInvoiceWindow({
  invoice,
  onClose,
}: {
  invoice: Invoice
  onClose: () => void
}) {
  const c = useClientTheme()
  const titleId = useId()
  const isPhone = useIsMobileViewport()
  const defaultWidth =
    typeof window !== 'undefined' ? Math.min(960, window.innerWidth - 32) : 960
  const defaultHeight =
    typeof window !== 'undefined' ? Math.min(760, window.innerHeight - 32) : 760

  const {
    panelRef,
    panelStyle,
    dragHandleProps,
    resizeHandleProps,
    isDragging,
    isResizing,
  } = useDraggablePanel({
    enabled: !isPhone,
    storageKey: 'credyx-collections-invoice-window',
    defaultWidth,
    defaultHeight,
    minWidth: 520,
    minHeight: 400,
    defaultBottomOffset: 20,
    margin: 16,
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!isPhone) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isPhone])

  return (
    <div
      ref={isPhone ? undefined : panelRef}
      className={`collections-invoice-window${isPhone ? ' is-phone' : ''}${
        isDragging || isResizing ? ' is-dragging' : ''
      }`}
      style={isPhone ? undefined : panelStyle}
      role="dialog"
      aria-modal={isPhone}
      aria-labelledby={titleId}
    >
      <header
        className="collections-invoice-window__bar"
        style={{ borderColor: c.border, backgroundColor: c.card }}
        {...(isPhone ? {} : dragHandleProps)}
      >
        {isPhone ? null : (
          <span className="collections-invoice-window__grip" aria-hidden style={{ color: c.muted }}>
            <GripHorizontal className="w-4 h-4" />
          </span>
        )}
        <div className="collections-invoice-window__titles">
          <h2 id={titleId} className="collections-invoice-window__title" style={{ color: c.primary }}>
            {invoice.invoice_number}
          </h2>
          <p className="collections-invoice-window__sub" style={{ color: c.secondary }}>
            {invoice.broker_name}
            {invoice.load_number ? ` · Load ${invoice.load_number}` : ''}
          </p>
        </div>
        <button
          type="button"
          className="collections-invoice-window__close"
          onClick={onClose}
          aria-label="Close invoice"
          data-no-drag
          style={{ color: c.secondary }}
        >
          <X className="w-4 h-4" />
        </button>
      </header>

      <div className="collections-invoice-window__body">
        <AdminInvoiceDetailView
          invoice={invoice}
          onClose={onClose}
          isCollectionsView
          embedded
          hideCloseButton
        />
      </div>

      {isPhone ? null : (
        <div
          className="collections-invoice-window__resize"
          aria-label="Resize invoice window"
          role="separator"
          aria-orientation="horizontal"
          data-no-drag
          {...resizeHandleProps}
        />
      )}
    </div>
  )
}
