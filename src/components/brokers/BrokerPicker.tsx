import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Plus, Search } from 'lucide-react'
import { addBroker, mockBrokers } from '../../data/mockBrokers'
import { formatBrokerAddress } from '../../utils/brokerResolve'
import type { Broker } from '../../types/broker'
import '../../styles/brokerPicker.css'

export type BrokerPickerMode = 'carrier' | 'admin'

export type BrokerPickerValue = {
  broker_id: string
  broker_name: string
  /** Carrier requested a broker not in the directory. */
  pending_new?: boolean
  /** Autofill helper for forms that collect address. */
  broker_address?: string
}

interface BrokerPickerProps {
  mode: BrokerPickerMode
  value: BrokerPickerValue
  onChange: (next: BrokerPickerValue) => void
  disabled?: boolean
  /** Extra class on the root (e.g. table cell width). */
  className?: string
  inputClassName?: string
  placeholder?: string
  id?: string
  /** Compact layout for dense tables. */
  compact?: boolean
}

/**
 * Searchable broker directory picker.
 * Carrier: select existing or request a new name (no auto-create).
 * Admin: select existing or create a new broker in the directory.
 */
export default function BrokerPicker({
  mode,
  value,
  onChange,
  disabled = false,
  className = '',
  inputClassName = 'client-input',
  placeholder = 'Search brokers…',
  id,
  compact = false,
}: BrokerPickerProps) {
  const [query, setQuery] = useState(value.broker_name || '')
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuery(value.broker_name || '')
  }, [value.broker_id, value.broker_name, value.pending_new])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return mockBrokers.slice(0, 12)
    return mockBrokers
      .filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          (b.mc_number ?? '').toLowerCase().includes(q)
      )
      .slice(0, 12)
  }, [query, open]) // eslint-disable-line react-hooks/exhaustive-deps -- refresh when directory mutates via open

  const selectBroker = (broker: Broker) => {
    setQuery(broker.name)
    setOpen(false)
    onChange({
      broker_id: broker.id,
      broker_name: broker.name,
      pending_new: false,
      broker_address: formatBrokerAddress(broker),
    })
  }

  const commitRequestNew = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) {
      onChange({ broker_id: '', broker_name: '', pending_new: false })
      return
    }
    setQuery(trimmed)
    setOpen(false)
    onChange({
      broker_id: '',
      broker_name: trimmed,
      pending_new: true,
      broker_address: '',
    })
  }

  const commitAdminCreate = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const existing = mockBrokers.find((b) => b.name.toLowerCase() === trimmed.toLowerCase())
    if (existing) {
      selectBroker(existing)
      return
    }
    const broker = addBroker({
      id: `broker-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: trimmed,
    })
    selectBroker(broker)
  }

  const exactMatch = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return undefined
    return mockBrokers.find((b) => b.name.toLowerCase() === q)
  }, [query])

  return (
    <div
      ref={rootRef}
      className={`broker-picker${compact ? ' broker-picker--compact' : ''} ${className}`.trim()}
    >
      <div className="broker-picker__control">
        <Search className="broker-picker__search-icon" aria-hidden />
        <input
          id={id}
          type="text"
          className={`${inputClassName} broker-picker__input`}
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          aria-expanded={open}
          aria-autocomplete="list"
          onFocus={() => !disabled && setOpen(true)}
          onChange={(e) => {
            const next = e.target.value
            setQuery(next)
            setOpen(true)
            // Typing clears a prior locked selection until they pick / request again.
            if (value.broker_id || value.pending_new) {
              onChange({
                broker_id: '',
                broker_name: next,
                pending_new: false,
                broker_address: '',
              })
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
            if (e.key === 'Enter') {
              e.preventDefault()
              if (exactMatch) {
                selectBroker(exactMatch)
              } else if (mode === 'carrier' && query.trim()) {
                commitRequestNew(query)
              } else if (mode === 'admin' && query.trim()) {
                commitAdminCreate(query)
              }
            }
          }}
        />
        <ChevronDown className="broker-picker__chevron" aria-hidden />
      </div>

      {value.pending_new && value.broker_name && (
        <p className="broker-picker__pending" role="status">
          New broker requested — Credyx will add “{value.broker_name}” to the directory.
        </p>
      )}

      {open && !disabled && (
        <ul className="broker-picker__list" role="listbox">
          {suggestions.map((broker) => (
            <li key={broker.id} role="option">
              <button
                type="button"
                className="broker-picker__option"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectBroker(broker)}
              >
                <span className="broker-picker__option-name">{broker.name}</span>
                {broker.mc_number && (
                  <span className="broker-picker__option-meta">MC {broker.mc_number}</span>
                )}
              </button>
            </li>
          ))}

          {mode === 'carrier' && query.trim() && !exactMatch && (
            <li role="option">
              <button
                type="button"
                className="broker-picker__option broker-picker__option--action"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commitRequestNew(query)}
              >
                <Plus className="w-3.5 h-3.5" aria-hidden />
                Request new broker “{query.trim()}”
              </button>
            </li>
          )}

          {mode === 'admin' && query.trim() && !exactMatch && (
            <li role="option">
              <button
                type="button"
                className="broker-picker__option broker-picker__option--action"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commitAdminCreate(query)}
              >
                <Plus className="w-3.5 h-3.5" aria-hidden />
                Create broker “{query.trim()}”
              </button>
            </li>
          )}

          {suggestions.length === 0 && !query.trim() && (
            <li className="broker-picker__empty">No brokers in directory yet.</li>
          )}
        </ul>
      )}
    </div>
  )
}
