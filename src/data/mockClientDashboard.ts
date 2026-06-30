import { ClientDashboardData } from '../types/clientDashboard'
import { buildClientDashboardData } from './clientDemoData'

/** Default demo dashboard for ABC Trucking (client-1). */
export const mockClientDashboardData: ClientDashboardData = buildClientDashboardData(
  'client-1',
  'ABC Trucking'
)
