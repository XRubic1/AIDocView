import { useNavigate } from 'react-router-dom'
import { Clock, Mail } from 'lucide-react'
import { getTierLabel } from '../../utils/clientCapabilities'
import type { Client } from '../../types/client'

interface ClientPendingApprovalProps {
  client: Client
}

export default function ClientPendingApproval({ client }: ClientPendingApprovalProps) {
  const navigate = useNavigate()
  const tier = client.service_tier ?? 'self_service'

  const handleLogout = () => {
    localStorage.removeItem('clientAuthenticated')
    localStorage.removeItem('clientEmail')
    localStorage.removeItem('clientRole')
    localStorage.removeItem('clientId')
    navigate('/client/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
          <Clock className="w-7 h-7 text-amber-600" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Application under review</h1>
        <p className="text-sm text-slate-600 mb-4">
          Thanks for enrolling, <strong>{client.name}</strong>. Your{' '}
          <strong>{getTierLabel(tier)}</strong> application is being reviewed by our team.
        </p>
        <p className="text-xs text-slate-500 flex items-center justify-center gap-1.5 mb-6">
          <Mail className="w-3.5 h-3.5" />
          We&apos;ll email {client.email ?? 'you'} when your account is activated.
        </p>
        <button
          type="button"
          onClick={handleLogout}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
