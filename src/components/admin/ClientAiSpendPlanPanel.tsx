/**
 * Clients → Plan: per-carrier AI toggle, optional monthly cap, and spend this month.
 */
import { useEffect, useState } from 'react'
import { normalizeClientAiSettings, type ClientAiSettings } from '../../config/aiPolicy'
import type { Client } from '../../types/client'
import {
  fetchClientSpendUsdThisMonth,
  formatAiUsd,
} from '../../services/aiSpendService'
import { updateClient } from '../../services/clientRegistry'

type ClientAiSpendPlanPanelProps = {
  client: Client
  onUpdated: (next: Client) => void
  showToast: (message: string, kind?: 'success' | 'error' | 'info') => void
}

export default function ClientAiSpendPlanPanel({
  client,
  onUpdated,
  showToast,
}: ClientAiSpendPlanPanelProps) {
  const settings = normalizeClientAiSettings(client.ai_settings)
  const [draft, setDraft] = useState<ClientAiSettings>(settings)
  const [spent, setSpent] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(normalizeClientAiSettings(client.ai_settings))
  }, [client.id, client.ai_settings])

  useEffect(() => {
    let cancelled = false
    void fetchClientSpendUsdThisMonth(client.id).then((usd) => {
      if (!cancelled) setSpent(usd)
    })
    return () => {
      cancelled = true
    }
  }, [client.id])

  const save = async (next: ClientAiSettings) => {
    setSaving(true)
    try {
      const normalized = normalizeClientAiSettings(next)
      const updated = await updateClient(client.id, { ai_settings: normalized })
      if (updated) {
        onUpdated(updated)
        setDraft(normalized)
        showToast('AI spend settings saved', 'success')
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save AI settings', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 space-y-3 sm:col-span-2">
      <div>
        <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">
          AI processing &amp; spend
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Limit DocSort / review token spend for this carrier. Uploads always stay available.
        </p>
      </div>

      <p className="text-sm text-slate-800">
        Spend this month:{' '}
        <span className="font-semibold tabular-nums">{formatAiUsd(spent)}</span>
        {draft.limitEnabled && draft.monthlyCapUsd != null
          ? ` / ${formatAiUsd(draft.monthlyCapUsd)} cap`
          : ''}
      </p>

      <label className="flex items-center gap-2 text-sm text-slate-800">
        <input
          type="checkbox"
          checked={draft.aiEnabled !== false}
          disabled={saving}
          onChange={(e) => {
            const next = { ...draft, aiEnabled: e.target.checked ? true : false }
            setDraft(next)
            void save(next)
          }}
        />
        Allow AI packet creation &amp; review for this carrier
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-800">
        <input
          type="checkbox"
          checked={Boolean(draft.limitEnabled)}
          disabled={saving}
          onChange={(e) => {
            const next = { ...draft, limitEnabled: e.target.checked }
            setDraft(next)
            void save(next)
          }}
        />
        Enforce monthly AI spend cap
      </label>

      {draft.limitEnabled ? (
        <label className="block text-xs max-w-xs">
          <span className="font-medium text-slate-600 uppercase tracking-wide">
            Monthly cap (USD)
          </span>
          <input
            type="number"
            min={1}
            step={1}
            className="client-input mt-1 w-full text-sm"
            value={draft.monthlyCapUsd ?? ''}
            disabled={saving}
            onChange={(e) => {
              const v = e.target.value.trim()
              setDraft((p) => ({
                ...p,
                monthlyCapUsd: v === '' ? null : Number(v),
              }))
            }}
            onBlur={() => void save(draft)}
          />
        </label>
      ) : null}
    </div>
  )
}
