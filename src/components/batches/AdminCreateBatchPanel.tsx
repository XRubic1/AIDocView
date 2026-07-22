import { useState } from 'react'
import { Plus } from 'lucide-react'
import { getAllClients, getClientById } from '../../services/clientRegistry'
import BatchAiUploadFlow from '../client/BatchAiUploadFlow'
import ManualBatchBuilder from './ManualBatchBuilder'

type CreateStep = 'client' | 'choose' | 'ai' | 'manual'

interface AdminCreateBatchPanelProps {
  onComplete: (batchId: string) => void
  onCancel: () => void
  /** Display name for AI confirm / audit trail */
  adminName?: string
}

/**
 * Admin batch creation: pick client, then AI or manual upload (same pipeline as client).
 */
export default function AdminCreateBatchPanel({
  onComplete,
  onCancel,
  adminName = 'Admin User',
}: AdminCreateBatchPanelProps) {
  const [step, setStep] = useState<CreateStep>('client')
  const [clientId, setClientId] = useState('')
  const selectedClient = getClientById(clientId)

  const resetToClient = () => {
    setStep('client')
    setClientId('')
  }

  const handleComplete = (batchId: string) => {
    onComplete(batchId)
    resetToClient()
  }

  if (step === 'client') {
    return (
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold" style={{ color: '#113543' }}>
              Create batch
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#819291' }}>
              Select client, then AI or manual upload
            </p>
          </div>
          <button
            type="button"
            className="text-sm underline"
            style={{ color: '#819291' }}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
            Client <span style={{ color: '#C2A558' }}>*</span>
          </label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full max-w-md px-3 py-2 text-sm border rounded"
            style={{ borderColor: '#819291', color: '#113543' }}
          >
            <option value="">Choose a client…</option>
            {getAllClients().map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          disabled={!clientId}
          className="flex items-center space-x-2 px-6 py-2 text-sm font-medium rounded transition-colors"
          style={{
            backgroundColor: clientId ? '#113543' : '#cccccc',
            color: '#FFFFFF',
            cursor: clientId ? 'pointer' : 'not-allowed',
          }}
          onClick={() => setStep('choose')}
        >
          <Plus className="w-4 h-4" />
          <span>Continue</span>
        </button>
      </div>
    )
  }

  if (!selectedClient) {
    resetToClient()
    return null
  }

  if (step === 'choose') {
    return (
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-base font-bold" style={{ color: '#113543' }}>
              {selectedClient.name}
            </h2>
            <button
              type="button"
              className="text-sm underline mt-1"
              style={{ color: '#819291' }}
              onClick={() => setStep('client')}
            >
              Change client
            </button>
          </div>
          <button type="button" className="text-sm underline" style={{ color: '#819291' }} onClick={onCancel}>
            Cancel
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            type="button"
            className="p-4 border-2 rounded text-left transition-shadow hover:shadow-md"
            style={{ borderColor: '#C2A558' }}
            onClick={() => setStep('ai')}
          >
            <h3 className="text-sm font-bold mb-1" style={{ color: '#113543' }}>
              AI upload
            </h3>
            <p className="text-xs" style={{ color: '#819291' }}>
              Sort PDFs by load, confirm in a table, then submit
            </p>
          </button>
          <button
            type="button"
            className="p-4 border-2 rounded text-left transition-shadow hover:shadow-md"
            style={{ borderColor: '#819291' }}
            onClick={() => setStep('manual')}
          >
            <h3 className="text-sm font-bold mb-1" style={{ color: '#113543' }}>
              Manual batch
            </h3>
            <p className="text-xs" style={{ color: '#819291' }}>
              Enter invoices and attach PDFs
            </p>
          </button>
        </div>
      </div>
    )
  }

  if (step === 'ai') {
    return (
      <div className="px-4 py-3 border-t flex flex-col min-h-0" style={{ borderColor: '#819291' }}>
        <div className="flex items-center justify-between gap-2 mb-2 shrink-0 text-xs">
          <p style={{ color: '#819291' }}>
            Client: <strong style={{ color: '#113543' }}>{selectedClient.name}</strong>
          </p>
          <button type="button" className="underline" style={{ color: '#819291' }} onClick={() => setStep('choose')}>
            Back
          </button>
        </div>
        <BatchAiUploadFlow
          clientId={selectedClient.id}
          clientName={selectedClient.name}
          confirmedBy={adminName}
          crossCarrierLoadWarnings
          onCancel={() => setStep('choose')}
          onComplete={handleComplete}
        />
      </div>
    )
  }

  return (
    <div className="p-6 border-t" style={{ borderColor: '#819291' }}>
      <ManualBatchBuilder
        clientId={selectedClient.id}
        clientName={selectedClient.name}
        onBack={() => setStep('choose')}
        onSuccess={handleComplete}
      />
    </div>
  )
}
