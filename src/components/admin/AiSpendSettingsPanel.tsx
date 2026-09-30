/**
 * Settings → System: master AI switch, org caps, and carrier spend this month.
 * Turning AI off never blocks document uploads — only packet/review spend.
 */
import { FormEvent, useCallback, useEffect, useState } from 'react'
import { DollarSign, Power, RefreshCw } from 'lucide-react'
import { AI_POLICY, type AiPolicySettings } from '../../config/aiPolicy'
import { useClientTheme } from '../../theme/ThemeContext'
import {
  applyAiPolicy,
  fetchCarrierAiSpendRows,
  fetchOrgSpendUsdThisMonth,
  formatAiUsd,
  loadAiPolicy,
  saveAiPolicy,
  type CarrierAiSpendRow,
} from '../../services/aiSpendService'

export default function AiSpendSettingsPanel() {
  const c = useClientTheme()
  const [policy, setPolicy] = useState<AiPolicySettings>(() => ({ ...AI_POLICY }))
  const [orgSpent, setOrgSpent] = useState(0)
  const [rows, setRows] = useState<CarrierAiSpendRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const loaded = await loadAiPolicy()
      applyAiPolicy(loaded)
      setPolicy(loaded)
      const [spent, spendRows] = await Promise.all([
        fetchOrgSpendUsdThisMonth(),
        fetchCarrierAiSpendRows(),
      ])
      setOrgSpent(spent)
      setRows(spendRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load AI spend data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleSave = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const saved = await saveAiPolicy(policy)
      setPolicy(saved)
      setMessage(
        !saved.aiEnabled
          ? 'AI processing disabled platform-wide. Uploads still work.'
          : saved.autoInvoiceCreationEnabled
            ? 'AI processing enabled. Automatic invoice creation is on.'
            : 'Automatic AI invoice creation is off. Uploads still work; existing invoices can still be reviewed.'
      )
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save AI policy')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="dashboard-card p-5 space-y-5">
      <div className="flex items-start gap-3">
        <div
          className="flex-shrink-0 p-2 rounded border"
          style={{ borderColor: c.border, backgroundColor: c.card, color: c.secondary }}
        >
          <DollarSign className="w-5 h-5" style={{ color: c.secondary }} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold" style={{ color: c.primary }}>
            AI spend &amp; carrier caps
          </h2>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: c.secondary }}>
            Master switch and monthly USD caps for DocSort / review. When AI is off or a cap is
            hit, carriers can still upload paperwork — Credyx processes packets manually.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="dashboard-btn-secondary text-xs inline-flex items-center gap-1.5"
          disabled={loading}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
        <label
          className="flex items-start gap-3 rounded border px-3 py-3"
          style={{ borderColor: c.border }}
        >
          <input
            type="checkbox"
            className="mt-0.5"
            checked={policy.aiEnabled}
            onChange={(e) => setPolicy((p) => ({ ...p, aiEnabled: e.target.checked }))}
          />
          <span>
            <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: c.primary }}>
              <Power className="w-3.5 h-3.5" />
              AI processing enabled (all carriers)
            </span>
            <span className="block text-xs mt-0.5" style={{ color: c.secondary }}>
              Uncheck to stop AI packet creation and review spend. Uploads stay open.
            </span>
          </span>
        </label>

        <label
          className="flex items-start gap-3 rounded border px-3 py-3"
          style={{ borderColor: c.border }}
        >
          <input
            type="checkbox"
            className="mt-0.5"
            checked={policy.autoInvoiceCreationEnabled}
            disabled={!policy.aiEnabled}
            onChange={(e) =>
              setPolicy((p) => ({ ...p, autoInvoiceCreationEnabled: e.target.checked }))
            }
          />
          <span>
            <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: c.primary }}>
              <Power className="w-3.5 h-3.5" />
              Automatic AI invoice creation
            </span>
            <span className="block text-xs mt-0.5" style={{ color: c.secondary }}>
              Uncheck to keep uploads, and stop AI from creating invoices. Review of invoices
              that already exist still runs. Turn this back on before retrying Packet Rework.
            </span>
          </span>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <span
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: c.secondary }}
            >
              Platform monthly cap (USD)
            </span>
            <input
              type="number"
              min={0}
              step={1}
              placeholder="No cap"
              value={policy.monthlySpendCapUsd ?? ''}
              onChange={(e) => {
                const v = e.target.value.trim()
                setPolicy((p) => ({
                  ...p,
                  monthlySpendCapUsd: v === '' ? null : Number(v),
                }))
              }}
              className="w-full px-3 py-2 text-sm border rounded outline-none"
              style={{ borderColor: c.border, color: c.primary, backgroundColor: c.card }}
            />
          </label>
          <label className="block space-y-1.5">
            <span
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: c.secondary }}
            >
              Default carrier monthly cap (USD)
            </span>
            <input
              type="number"
              min={0}
              step={1}
              placeholder="No default"
              value={policy.defaultClientMonthlyCapUsd ?? ''}
              onChange={(e) => {
                const v = e.target.value.trim()
                setPolicy((p) => ({
                  ...p,
                  defaultClientMonthlyCapUsd: v === '' ? null : Number(v),
                }))
              }}
              className="w-full px-3 py-2 text-sm border rounded outline-none"
              style={{ borderColor: c.border, color: c.primary, backgroundColor: c.card }}
            />
          </label>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 border rounded" style={{ borderColor: c.border }}>
            <dt style={{ color: c.secondary }}>Org spend this month</dt>
            <dd className="mt-1 font-semibold tabular-nums" style={{ color: c.primary }}>
              {formatAiUsd(orgSpent)}
              {policy.monthlySpendCapUsd != null
                ? ` / ${formatAiUsd(policy.monthlySpendCapUsd)}`
                : ''}
            </dd>
          </div>
          <div className="p-3 border rounded" style={{ borderColor: c.border }}>
            <dt style={{ color: c.secondary }}>Status</dt>
            <dd className="mt-1 font-semibold" style={{ color: c.primary }}>
              {!policy.aiEnabled
                ? 'AI off — uploads only'
                : policy.autoInvoiceCreationEnabled
                  ? 'AI on'
                  : 'Review on — automatic invoices off'}
            </dd>
          </div>
        </dl>

        {error ? (
          <p className="text-xs" style={{ color: '#b91c1c' }}>
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="text-xs" style={{ color: '#15803d' }}>
            {message}
          </p>
        ) : null}

        <button type="submit" className="dashboard-btn-primary text-xs" disabled={saving}>
          {saving ? 'Saving…' : 'Save AI spend settings'}
        </button>
      </form>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: c.secondary }}>
          Carrier spend this month
        </h3>
        {loading ? (
          <p className="text-xs" style={{ color: c.secondary }}>
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <p className="text-xs" style={{ color: c.secondary }}>
            No AI usage recorded yet this month.
          </p>
        ) : (
          <div className="overflow-x-auto border rounded" style={{ borderColor: c.border }}>
            <table className="dashboard-table dashboard-table--compact w-full min-w-[520px]">
              <thead>
                <tr>
                  <th>Carrier</th>
                  <th className="text-right">Spend</th>
                  <th className="text-right">Tokens</th>
                  <th className="text-right">Calls</th>
                  <th>Limit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.clientId}>
                    <td className="font-medium">{row.clientName}</td>
                    <td className="text-right tabular-nums">{formatAiUsd(row.spentUsd)}</td>
                    <td className="text-right tabular-nums">
                      {row.totalTokens.toLocaleString()}
                    </td>
                    <td className="text-right tabular-nums">{row.eventCount}</td>
                    <td className="text-xs" style={{ color: c.secondary }}>
                      {row.aiEnabled === false
                        ? 'AI off'
                        : row.limitEnabled && row.monthlyCapUsd != null
                          ? `Cap ${formatAiUsd(row.monthlyCapUsd)}`
                          : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
