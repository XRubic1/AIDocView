import { useMemo } from 'react'
import { AlertTriangle, CreditCard, Lock, Mail } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getClientBills, getBillingStanding } from '../../services/arBillingService'
import { clearClientSession } from '../../utils/clearClientSession'
import { clearClientTenantCache } from '../../data/clientDemoData'
import { formatCurrency } from '../../utils/format'
import type { Client } from '../../types/client'

interface ClientBillingLockScreenProps {
  client: Client
}

/** Full-screen lock for suspended clients with outstanding bills. */
export default function ClientBillingLockScreen({ client }: ClientBillingLockScreenProps) {
  const navigate = useNavigate()
  const bills = useMemo(() => getClientBills(client.id), [client.id])
  const unpaid = bills.filter((b) => b.status === 'open' || b.status === 'overdue')
  const standing = getBillingStanding(client, bills)
  const totalDue = unpaid.reduce((sum, b) => sum + b.amount, 0)

  const handleLogout = () => {
    clearClientSession()
    clearClientTenantCache()
    localStorage.removeItem('clientId')
    navigate('/client/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-lg w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <Lock className="w-7 h-7 text-red-600" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2 text-center">Account locked</h1>
        <p className="text-sm text-slate-600 mb-4 text-center">
          <strong>{client.name}</strong> has an outstanding balance that must be settled before
          portal access is restored.
        </p>

        {standing === 'warning' && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              Your account will be locked if payment is not received soon.
            </p>
          </div>
        )}

        <div className="border border-slate-200 rounded-xl overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Period</th>
                <th className="text-right px-3 py-2 font-medium text-slate-600">Amount</th>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {unpaid.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-center text-slate-500">
                    No open bills on file — contact support to restore access.
                  </td>
                </tr>
              ) : (
                unpaid.map((bill) => (
                  <tr key={bill.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-700">{bill.period}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {formatCurrency(bill.amount)}
                    </td>
                    <td className="px-3 py-2 capitalize text-slate-600">{bill.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalDue > 0 && (
          <p className="text-sm font-semibold text-slate-900 text-center mb-4">
            Total due: {formatCurrency(totalDue)}
          </p>
        )}

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="w-4 h-4 text-slate-600" />
            <p className="text-sm font-semibold text-slate-900">How to pay</p>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Pay via the Payoneer payment request sent to your billing email. Use ACH debit, card, or
            bank transfer to our USD receiving account. Reference your company name and billing
            period when paying.
          </p>
          {unpaid[0]?.payoneer_reference && (
            <p className="text-xs text-slate-500 mt-2 font-mono">
              Ref: {unpaid[0].payoneer_reference}
            </p>
          )}
        </div>

        <p className="text-xs text-slate-500 flex items-center justify-center gap-1.5 mb-4">
          <Mail className="w-3.5 h-3.5" />
          Questions?{' '}
          <a href="mailto:billing@credyx.com" className="text-blue-600 hover:underline">
            billing@credyx.com
          </a>
        </p>

        <button
          type="button"
          onClick={handleLogout}
          className="w-full text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
