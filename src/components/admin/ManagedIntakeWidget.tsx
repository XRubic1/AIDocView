import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileUp, UserPlus } from 'lucide-react'
import { getAllBatches } from '../../data/mockBatches'
import { getAllClients } from '../../services/clientRegistry'

/** Pending enrollments + managed doc handoff batches for admin ops. */
export default function ManagedIntakeWidget() {
  const navigate = useNavigate()

  const { pendingClients, handoffBatches } = useMemo(() => {
    const clients = getAllClients()
    const batches = getAllBatches()
    return {
      pendingClients: clients.filter((c) => c.status === 'pending'),
      handoffBatches: batches.filter(
        (b) => b.upload_mode === 'handoff' && b.status === 'ready_to_post'
      ),
    }
  }, [])

  const total = pendingClients.length + handoffBatches.length
  if (total === 0) return null

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Managed intake</h3>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
          {total} item{total === 1 ? '' : 's'}
        </span>
      </div>
      <ul className="space-y-2">
        {pendingClients.slice(0, 3).map((client) => (
          <li key={client.id} className="flex items-center gap-2 text-sm text-gray-700">
            <UserPlus className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="truncate flex-1">
              {client.name} — enrollment ({client.service_tier === 'managed' ? 'Managed' : 'Self-Service'})
            </span>
            <button
              type="button"
              onClick={() => navigate('/clients')}
              className="text-xs text-blue-600 hover:underline shrink-0"
            >
              Review
            </button>
          </li>
        ))}
        {handoffBatches.slice(0, 3).map((batch) => (
          <li key={batch.id} className="flex items-center gap-2 text-sm text-gray-700">
            <FileUp className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="truncate flex-1">
              {batch.client_name} — doc handoff ({batch.batch_number})
            </span>
            <button
              type="button"
              onClick={() => navigate('/batches')}
              className="text-xs text-blue-600 hover:underline shrink-0"
            >
              Open
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
