import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileUp, UserPlus, Inbox } from 'lucide-react'
import DashboardPanel from '../client/dashboard/DashboardPanel'
import { useClientTheme } from '../../theme/ThemeContext'
import { getAllBatches } from '../../data/mockBatches'
import { getAllClients } from '../../services/clientRegistry'

/** Pending enrollments + managed doc handoff batches for admin ops. */
export default function ManagedIntakeWidget() {
  const navigate = useNavigate()
  const c = useClientTheme()

  const { pendingClients, handoffBatches } = useMemo(() => {
    const clients = getAllClients()
    const batches = getAllBatches()
    return {
      pendingClients: clients.filter((cl) => cl.status === 'pending'),
      handoffBatches: batches.filter(
        (b) => b.upload_mode === 'handoff' && b.status === 'ready_to_post'
      ),
    }
  }, [])

  const total = pendingClients.length + handoffBatches.length
  if (total === 0) return null

  return (
    <DashboardPanel title="Managed intake" icon={Inbox} iconTone="amber" interactive={false}>
      <div className="p-4">
        <div className="flex items-center justify-end mb-3">
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full tabular-nums"
            style={{ backgroundColor: c.stat.amber, color: c.warning }}
          >
            {total} item{total === 1 ? '' : 's'}
          </span>
        </div>
        <ul className="space-y-2">
          {pendingClients.slice(0, 3).map((client) => (
            <li key={client.id} className="flex items-center gap-2 text-sm" style={{ color: c.primary }}>
              <UserPlus className="w-4 h-4 shrink-0" style={{ color: c.warning }} />
              <span className="truncate flex-1">
                {client.name} — enrollment ({client.service_tier === 'managed' ? 'Managed' : 'Self-Service'})
              </span>
              <button
                type="button"
                onClick={() => navigate('/clients')}
                className="text-xs font-medium shrink-0 hover:opacity-70"
                style={{ color: c.info }}
              >
                Review
              </button>
            </li>
          ))}
          {handoffBatches.slice(0, 3).map((batch) => (
            <li key={batch.id} className="flex items-center gap-2 text-sm" style={{ color: c.primary }}>
              <FileUp className="w-4 h-4 shrink-0" style={{ color: c.info }} />
              <span className="truncate flex-1">
                {batch.client_name} — doc handoff ({batch.batch_number})
              </span>
              <button
                type="button"
                onClick={() => navigate('/batches')}
                className="text-xs font-medium shrink-0 hover:opacity-70"
                style={{ color: c.info }}
              >
                Open
              </button>
            </li>
          ))}
        </ul>
      </div>
    </DashboardPanel>
  )
}
