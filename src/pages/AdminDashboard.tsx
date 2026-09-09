import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SummaryCards } from '../components/admin/SummaryCards'
import { CollectionsQueue } from '../components/admin/CollectionsQueue'
import { ClientWorkQueuePanel } from '../components/admin/ClientWorkQueuePanel'
import { QuickActions } from '../components/admin/QuickActions'
import { SectionHeader } from '../components/admin/SectionHeader'
import { ARTrendChart } from '../components/admin/charts/ARTrendChart'
import { AgingDistributionChart } from '../components/admin/charts/AgingDistributionChart'
import { CriticalAlerts } from '../components/admin/widgets/CriticalAlerts'
import { BatchPipeline } from '../components/admin/widgets/BatchPipeline'
import { TodaysActions } from '../components/admin/widgets/TodaysActions'
import ManagedIntakeWidget from '../components/admin/ManagedIntakeWidget'
import BatchStatusWidget from '../components/client/BatchStatusWidget'
import { getAllBatches } from '../data/mockBatches'
import { mockInvoices } from '../data/mockInvoices'
import { markBrokerContactedForCollections } from '../utils/collectionsChase'
import { PendingBatch, CollectionsAlert, AgingAR } from '../types/admin'
import { formatCurrency } from '../utils/format'
import { useTenantDataRevision } from '../hooks/useTenantDataRevision'
import { useAdminCapabilities } from '../hooks/useAdminCapabilities'
import { getAllClients, getClientById } from '../services/clientRegistry'
import { buildClientWorkSummaries } from '../utils/clientWorkQueue'
import { useClientTheme } from '../theme/ThemeContext'
import { getAgingArBucketKey, getInvoiceAgeDays, isOpenArInvoice } from '../utils/invoiceAging'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const c = useClientTheme()
  const tenantRevision = useTenantDataRevision()
  const { capabilities } = useAdminCapabilities()
  const [widgetClientFilter, setWidgetClientFilter] = useState('')

  // Get all real data (re-read when realtime updates land)
  const allBatches = useMemo(() => getAllBatches(), [tenantRevision])
  const allInvoices = useMemo(() => [...mockInvoices], [tenantRevision])
  const clients = useMemo(
    () =>
      getAllClients()
        .map((client) => ({ id: client.id, name: client.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [tenantRevision]
  )
  const workSummaries = useMemo(
    () =>
      buildClientWorkSummaries({
        invoices: allInvoices,
        batches: allBatches.filter(
          (batch): batch is PendingBatch =>
            batch.status === 'ready_to_post' ||
            batch.status === 'verification' ||
            batch.status === 'approval'
        ),
      }),
    [allInvoices, allBatches]
  )
  
  // Calculate pending batches from real data
  const pendingBatches = useMemo(() => {
    return allBatches.filter((batch): batch is PendingBatch => 
      batch.status === 'ready_to_post' || 
      batch.status === 'verification' || 
      batch.status === 'approval'
    ).sort((a, b) => {
      return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
    })
  }, [allBatches])
  
  // Calculate invoices on hold
  const invoicesOnHold = useMemo(() => {
    return allInvoices.filter(inv => inv.status === 'hold').length
  }, [allInvoices])
  
  // Calculate total A/R
  const totalAR = useMemo(() => {
    return allInvoices
      .filter((inv) => isOpenArInvoice(inv))
      .reduce((sum, inv) => sum + inv.amount, 0)
  }, [allInvoices])
  
  // Calculate collections alerts
  const collectionsAlerts = useMemo(() => {
    return allInvoices.filter(inv => {
      const daysSinceExpected = inv.days_since_expected || 0
      return daysSinceExpected >= 15 && inv.status !== 'paid' && inv.status !== 'force_closed' && inv.status !== 'written_off'
    }).length
  }, [allInvoices])
  
  // Calculate collections queue
  const collectionsQueue = useMemo((): CollectionsAlert[] => {
    return allInvoices
      .filter(inv => {
        const daysSinceExpected = inv.days_since_expected || 0
        return daysSinceExpected >= 15 && inv.status !== 'paid' && inv.status !== 'force_closed' && inv.status !== 'written_off'
      })
      .map(inv => ({
          invoice_id: inv.id,
          inv_number: inv.invoice_number,
          client_id: inv.client_id,
          client_name: inv.client_name,
          broker_name: inv.broker_name,
          amount: inv.amount,
          expected_payment_date:
            inv.expected_payment_date || inv.due_date || inv.invoice_date,
          days_since_expected: inv.days_since_expected || 0,
          client_response: (inv.broker_contacted ? 'not_received' : 'no_response') as CollectionsAlert['client_response'],
          broker_contacted: inv.broker_contacted || false,
          last_broker_contact: inv.last_broker_contact || null,
        }))
      .sort((a, b) => b.days_since_expected - a.days_since_expected)
      .slice(0, 10)
  }, [allInvoices])
  
  // Force-close rate — managed-tier clients only (self-service has no force-close).
  const forceCloseRate = useMemo(() => {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const recentManaged = allInvoices.filter((inv) => {
      const client = getClientById(inv.client_id)
      if (client?.service_tier !== 'managed') return false
      const updatedAt = inv.updated_at ? new Date(inv.updated_at) : new Date(inv.created_at)
      return updatedAt >= thirtyDaysAgo
    })

    if (recentManaged.length === 0) return 0

    const forceClosed = recentManaged.filter((inv) => inv.status === 'force_closed').length
    return ((forceClosed / recentManaged.length) * 100).toFixed(1)
  }, [allInvoices])
  
  // Calculate average review time
  const avgReviewTime = useMemo(() => {
    const reviewedBatches = allBatches.filter(b => b.reviewed_at && b.submitted_at)
    if (reviewedBatches.length === 0) return 0
    
    const totalHours = reviewedBatches.reduce((sum, batch) => {
      const submitted = new Date(batch.submitted_at)
      const reviewed = new Date(batch.reviewed_at!)
      const diffMs = reviewed.getTime() - submitted.getTime()
      const diffHours = diffMs / (1000 * 60 * 60)
      return sum + diffHours
    }, 0)
    
    return (totalHours / reviewedBatches.length).toFixed(1)
  }, [allBatches])
  
  // Calculate unattached documents
  const unattachedDocuments = useMemo(() => {
    return allInvoices.filter(inv => !inv.documents_count || inv.documents_count === 0).length
  }, [allInvoices])

  // Calculate Aging A/R from real invoices
  const agingAR = useMemo((): AgingAR => {
    const aging: AgingAR = {
      '1_15': 0,
      '16_30': 0,
      '31_45': 0,
      '46_60': 0,
      '61_90': 0,
      over_91: 0,
      total: 0,
    }
    
    allInvoices
      .filter((inv) => isOpenArInvoice(inv))
      .forEach((inv) => {
        const bucket = getAgingArBucketKey(getInvoiceAgeDays(inv))
        aging[bucket] += inv.amount
        aging.total += inv.amount
      })
    
    return aging
  }, [allInvoices])

  // Calculate A/R Trend Chart Data (last 30 days)
  const arTrendData = useMemo(() => {
    const data: Array<{ date: string; totalAR: number; collected: number }> = []
    const today = new Date()
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      
      const totalAR = allInvoices
        .filter(inv => {
          if (!isOpenArInvoice(inv)) {
            return false
          }
          const approvedDate = inv.approved_at ? new Date(inv.approved_at) : new Date(inv.created_at)
          return approvedDate <= date
        })
        .reduce((sum, inv) => sum + inv.amount, 0)
      
      const collected = allInvoices
        .filter(inv => inv.status === 'paid' && inv.approved_at)
        .filter(inv => {
          const paidDate = new Date(inv.approved_at!)
          return paidDate <= date
        })
        .reduce((sum, inv) => sum + inv.amount, 0)
      
      data.push({ date: dateStr, totalAR, collected })
    }
    
    return data
  }, [allInvoices])

  // Calculate Critical Alerts
  const criticalAlerts = useMemo(() => {
    const alerts: Array<{
      id: string
      type: 'stale_batch' | 'overdue_invoice' | 'missing_document' | 'short_paid'
      severity: 'high' | 'medium' | 'low'
      title: string
      description: string
      relatedId?: string
      relatedType?: 'batch' | 'invoice'
      timestamp?: string
      clientId?: string
    }> = []
    
    // Stale batches (in same stage >48 hours)
    const now = new Date()
    allBatches.forEach(batch => {
      const submitted = new Date(batch.submitted_at)
      const hoursSinceSubmitted = (now.getTime() - submitted.getTime()) / (1000 * 60 * 60)
      
      if (hoursSinceSubmitted > 48 && (batch.status === 'ready_to_post' || batch.status === 'verification' || batch.status === 'approval')) {
        alerts.push({
          id: `stale-${batch.id}`,
          type: 'stale_batch',
          severity: hoursSinceSubmitted > 72 ? 'high' : 'medium',
          title: `Batch ${batch.batch_number} stuck in ${batch.status}`,
          description: `Batch has been in ${batch.status} for ${Math.round(hoursSinceSubmitted)} hours`,
          relatedId: batch.id,
          relatedType: 'batch',
          timestamp: batch.submitted_at,
          clientId: batch.client_id,
        })
      }
    })
    
    // Overdue invoices >60 days
    allInvoices
      .filter(inv => {
        const daysSinceExpected = inv.days_since_expected || 0
        return daysSinceExpected > 60 && inv.status !== 'paid' && inv.status !== 'force_closed' && inv.status !== 'written_off'
      })
      .forEach(inv => {
        alerts.push({
          id: `overdue-${inv.id}`,
          type: 'overdue_invoice',
          severity: (inv.days_since_expected || 0) > 90 ? 'high' : 'medium',
          title: `Invoice ${inv.invoice_number} overdue ${inv.days_since_expected} days`,
          description: `${formatCurrency(inv.amount)} from ${inv.client_name} - ${inv.broker_name}`,
          relatedId: inv.id,
          relatedType: 'invoice',
          timestamp: inv.created_at,
          clientId: inv.client_id,
        })
      })
    
    return alerts.sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 }
      return severityOrder[a.severity] - severityOrder[b.severity]
    })
  }, [allBatches, allInvoices])

  // Calculate Batch Pipeline
  const batchPipeline = useMemo(() => {
    const stages = [
      { stage: 'ready_to_post', label: 'Ready to Post', count: 0, totalAmount: 0, avgTimeHours: 0, color: '#C2A558' },
      { stage: 'verification', label: 'Verification', count: 0, totalAmount: 0, avgTimeHours: 0, color: '#819291' },
      { stage: 'approval', label: 'Approval', count: 0, totalAmount: 0, avgTimeHours: 0, color: '#113543' },
      { stage: 'submitted', label: 'Submitted', count: 0, totalAmount: 0, avgTimeHours: 0, color: '#2E7D32' },
    ]
    
    const now = new Date()
    allBatches.forEach(batch => {
      const stageIndex = stages.findIndex(s => s.stage === batch.status)
      if (stageIndex >= 0) {
        stages[stageIndex].count += 1
        stages[stageIndex].totalAmount += batch.total_amount
        
        const submitted = new Date(batch.submitted_at)
        const hoursSinceSubmitted = (now.getTime() - submitted.getTime()) / (1000 * 60 * 60)
        if (stages[stageIndex].avgTimeHours === 0) {
          stages[stageIndex].avgTimeHours = hoursSinceSubmitted
        } else {
          stages[stageIndex].avgTimeHours = (stages[stageIndex].avgTimeHours + hoursSinceSubmitted) / 2
        }
      }
    })
    
    return stages.filter(s => s.count > 0)
  }, [allBatches])

  // Calculate Today's Actions
  const todaysActions = useMemo(() => {
    const actions: Array<{
      id: string
      type: 'batch_review' | 'broker_call' | 'document_upload' | 'invoice_approval'
      title: string
      description: string
      priority: 'high' | 'medium' | 'low'
      relatedId?: string
      clientId?: string
    }> = []
    
    // Batches to review (oldest first)
    pendingBatches.forEach(batch => {
      const hoursSinceSubmitted = (new Date().getTime() - new Date(batch.submitted_at).getTime()) / (1000 * 60 * 60)
      actions.push({
        id: `batch-${batch.id}`,
        type: 'batch_review',
        title: `Review batch ${batch.batch_number}`,
        description: `${batch.client_name} - ${batch.total_invoices} invoices`,
        priority: hoursSinceSubmitted > 24 ? 'high' : 'medium',
        relatedId: batch.id,
        clientId: batch.client_id,
      })
    })
    
    // Broker calls needed (overdue invoices not contacted)
    allInvoices
      .filter(inv => {
        const daysSinceExpected = inv.days_since_expected || 0
        return daysSinceExpected >= 15 && !inv.broker_contacted && inv.status !== 'paid' && inv.status !== 'force_closed' && inv.status !== 'written_off'
      })
      .forEach(inv => {
        actions.push({
          id: `call-${inv.id}`,
          type: 'broker_call',
          title: `Call broker for ${inv.invoice_number}`,
          description: `${inv.broker_name} - ${inv.days_since_expected} days overdue`,
          priority: (inv.days_since_expected || 0) > 30 ? 'high' : 'medium',
          relatedId: inv.id,
          clientId: inv.client_id,
        })
      })
    
    return actions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 }
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    })
  }, [pendingBatches, allInvoices])

  const filteredCriticalAlerts = useMemo(() => {
    const rows = widgetClientFilter
      ? criticalAlerts.filter((alert) => alert.clientId === widgetClientFilter)
      : criticalAlerts
    return rows.slice(0, 10)
  }, [criticalAlerts, widgetClientFilter])

  const filteredTodaysActions = useMemo(() => {
    const rows = widgetClientFilter
      ? todaysActions.filter((action) => action.clientId === widgetClientFilter)
      : todaysActions
    return rows.slice(0, 8)
  }, [todaysActions, widgetClientFilter])

  const handleCardClick = (cardType: string) => {
    switch (cardType) {
      case 'batches':
        navigate('/batches')
        break
      case 'invoices':
        navigate('/invoices')
        break
      case 'ar':
        navigate('/aging-ar')
        break
      case 'collections':
        navigate('/collections')
        break
      default:
        break
    }
  }

  const handleBatchClick = (batchId: string) => {
    navigate(`/batches?batch=${batchId}`)
  }

  const handleInvoiceClick = (invoiceId: string) => {
    navigate(`/invoices?invoice=${invoiceId}`)
  }

  const handleCallBroker = (invoiceId: string) => {
    navigate(`/collections?invoice=${invoiceId}`)
  }

  const handleMarkContacted = (invoiceId: string) => {
    void markBrokerContactedForCollections(invoiceId)
  }

  const handleAlertClick = (alert: any) => {
    if (alert.relatedType === 'batch' && alert.relatedId) {
      navigate(`/batches?batch=${alert.relatedId}`)
    } else if (alert.relatedType === 'invoice' && alert.relatedId) {
      navigate(`/invoices?invoice=${alert.relatedId}`)
    }
  }

  const handleStageClick = (stage: string) => {
    navigate(`/batches?stage=${stage}`)
  }

  const handleActionClick = (action: any) => {
    if (action.type === 'batch_review' && action.relatedId) {
      navigate(`/batches?batch=${action.relatedId}`)
    } else if (action.type === 'broker_call' && action.relatedId) {
      navigate(`/collections?invoice=${action.relatedId}`)
    } else if (action.type === 'document_upload' && action.relatedId) {
      navigate(`/invoices?invoice=${action.relatedId}`)
    }
  }

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    []
  )

  const attentionCount = filteredCriticalAlerts.length + filteredTodaysActions.length

  return (
    <div className="client-shell-scroll h-full min-h-0 overflow-y-auto p-5">
      <div className="space-y-5">
        {/* 1. Page header: title + client filter + compact Quick Actions */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight" style={{ color: c.primary }}>
              Dashboard
            </h1>
            <p className="text-xs mt-0.5" style={{ color: c.secondary }}>
              {todayLabel}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 lg:justify-end flex-1 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <label className="text-xs font-medium shrink-0" style={{ color: c.secondary }}>
                Client
              </label>
              <select
                value={widgetClientFilter}
                onChange={(e) => setWidgetClientFilter(e.target.value)}
                className="client-input text-xs min-w-[10rem]"
                style={{ height: 32 }}
                aria-label="Filter alerts and actions by client"
              >
                <option value="">All clients</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>

            <QuickActions
              compact
              pendingBatchesCount={pendingBatches.length}
              collectionsAlertsCount={collectionsAlerts}
              unattachedDocumentsCount={unattachedDocuments}
              onReviewBatch={() => {
                if (pendingBatches.length > 0) {
                  handleBatchClick(pendingBatches[0].id)
                } else {
                  navigate('/batches')
                }
              }}
              onCollectionsQueue={() => navigate('/collections')}
              onUnattachedDocuments={() => navigate('/invoices')}
              onCreateBroker={() => navigate('/brokers')}
              onCreateClient={() => navigate('/clients')}
              onUploadDocuments={() => navigate('/invoices')}
              canCreateUser={capabilities.canManageUsers}
              onCreateUser={() => navigate('/users?add=1')}
            />
          </div>
        </div>

        {/* 2. Needs Attention Now — most urgent */}
        <section className="space-y-3">
          <SectionHeader label="Needs attention now" count={attentionCount} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CriticalAlerts alerts={filteredCriticalAlerts} onAlertClick={handleAlertClick} />
            <TodaysActions actions={filteredTodaysActions} onActionClick={handleActionClick} />
          </div>
        </section>

        {/* 3. KPI cards — urgent counts first, health metrics last */}
        <SummaryCards
          totalBatchesPending={pendingBatches.length}
          totalInvoicesHLD={invoicesOnHold}
          totalAR={totalAR}
          collectionsAlerts={collectionsAlerts}
          forceCloseRate={parseFloat(String(forceCloseRate))}
          avgReviewTime={parseFloat(String(avgReviewTime))}
          onCardClick={handleCardClick}
        />

        {/* 4. Work queues — day's workload */}
        <section className="space-y-3">
          <SectionHeader label="Work queues" />
          <ClientWorkQueuePanel summaries={workSummaries} />
          <CollectionsQueue
            alerts={collectionsQueue}
            onInvoiceClick={handleInvoiceClick}
            onCallBroker={handleCallBroker}
            onMarkContacted={handleMarkContacted}
          />
        </section>

        {/* 5. Operations — pipeline & intake */}
        <section className="space-y-3">
          <SectionHeader label="Operations" />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <BatchPipeline stages={batchPipeline} onStageClick={handleStageClick} />
            <BatchStatusWidget />
            <ManagedIntakeWidget />
          </div>
        </section>

        {/* 6. Analytics — least urgent */}
        <section className="space-y-3">
          <SectionHeader label="Analytics" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ARTrendChart data={arTrendData} />
            <AgingDistributionChart aging={agingAR} />
          </div>
        </section>
      </div>
    </div>
  )
}
