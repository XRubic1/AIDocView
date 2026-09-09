import AdminSharedCalendar from '../components/admin/AdminSharedCalendar'

/**
 * Admin shared calendar — meetings and carrier events across clients.
 * Same events appear in each client’s Assistant calendar.
 */
export default function AdminCalendar() {
  return (
    <div className="assistant-page admin-calendar-page">
      <AdminSharedCalendar />
    </div>
  )
}
