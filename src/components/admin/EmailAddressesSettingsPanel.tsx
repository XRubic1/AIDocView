/**
 * Settings → Addresses — editable Credyx mailboxes + action map.
 * Saved to platform_settings; send-email prefers these for From / Reply-To.
 */
import { useClientTheme } from '../../theme/ThemeContext'
import {
  EMAIL_ADDRESS_MAP,
  audienceLabel,
} from '../../config/emailAddressMap'
import {
  formatResendFrom,
  type EmailMailboxSettings,
} from '../../config/emailMailboxes'

type EmailAddressesSettingsPanelProps = {
  settings: EmailMailboxSettings
  onChange: (patch: Partial<EmailMailboxSettings>) => void
}

function MailboxField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint?: string
  value: string
  onChange: (value: string) => void
}) {
  const c = useClientTheme()
  return (
    <div className="client-settings-field">
      <label className="client-label" style={{ color: c.secondary }}>
        {label}
      </label>
      <input
        type="email"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="client-input w-full font-mono text-sm"
        style={{ backgroundColor: c.card, color: c.primary }}
        autoComplete="off"
      />
      {hint ? (
        <p className="client-label-hint" style={{ color: c.mutedLight }}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export default function EmailAddressesSettingsPanel({
  settings,
  onChange,
}: EmailAddressesSettingsPanelProps) {
  const c = useClientTheme()

  const resolveIntended = (rowId: string): string => {
    switch (rowId) {
      case 'ppw':
      case 'ppw-chase':
      case 'pay-chase':
      case 'waitlist-welcome':
        return formatResendFrom('Credyx Billing', settings.billingEmail)
      case 'client-invite':
      case 'carrier-batch':
      case 'carrier-billing':
      case 'carrier-docs':
        return formatResendFrom('Credyx Ops', settings.opsEmail)
      case 'admin-alerts':
      case 'staff-digest':
        return formatResendFrom('Credyx Ops', settings.adminEmail || settings.opsEmail)
      case 'remittance-copy':
        return `${settings.remittanceAdviceEmail} + ${settings.contactEmail}`
      case 'collections-inbox':
        return settings.collectionsInbox
      case 'remittance-inbox':
        return settings.remittanceInbox
      default:
        return settings.opsEmail
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold" style={{ color: c.primary }}>
          Mailboxes
        </h2>
        <p className="text-xs mt-1 max-w-2xl" style={{ color: c.secondary }}>
          Set which Credyx address is used for ops, billing, and replies. Save applies in-app
          contact copy immediately; outbound From also reads these from the database when
          sending (Resend domain must still be verified).
        </p>
      </div>

      <div className="client-settings-grid client-settings-grid--preferences">
        <MailboxField
          label="Ops email (carriers)"
          hint="Invites, batch updates, carrier contact — Credyx Ops From"
          value={settings.opsEmail}
          onChange={(opsEmail) => onChange({ opsEmail })}
        />
        <MailboxField
          label="Billing email (brokers)"
          hint="PPW and chase From — Credyx Billing"
          value={settings.billingEmail}
          onChange={(billingEmail) => onChange({ billingEmail })}
        />
        <MailboxField
          label="Admin / staff From"
          hint="Enrollment and waitlist alerts (defaults to ops)"
          value={settings.adminEmail}
          onChange={(adminEmail) => onChange({ adminEmail })}
        />
        <MailboxField
          label="Notifications fallback"
          hint="Used when a more specific From is missing"
          value={settings.notificationsEmail}
          onChange={(notificationsEmail) => onChange({ notificationsEmail })}
        />
        <MailboxField
          label="Reply-To (broker mail)"
          value={settings.replyToBroker}
          onChange={(replyToBroker) => onChange({ replyToBroker })}
        />
        <MailboxField
          label="Reply-To (carrier mail)"
          value={settings.replyToCarrier}
          onChange={(replyToCarrier) => onChange({ replyToCarrier })}
        />
        <MailboxField
          label="Contact email (templates)"
          hint="Shown as “contact us” in carrier emails"
          value={settings.contactEmail}
          onChange={(contactEmail) => onChange({ contactEmail })}
        />
        <MailboxField
          label="Remittance advice"
          hint="Printed on invoices / PPW for brokers"
          value={settings.remittanceAdviceEmail}
          onChange={(remittanceAdviceEmail) => onChange({ remittanceAdviceEmail })}
        />
        <MailboxField
          label="Collections inbox"
          hint="Inbound chase / PPW replies"
          value={settings.collectionsInbox}
          onChange={(collectionsInbox) => onChange({ collectionsInbox })}
        />
        <MailboxField
          label="Remittance inbox"
          value={settings.remittanceInbox}
          onChange={(remittanceInbox) => onChange({ remittanceInbox })}
        />
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2" style={{ color: c.primary }}>
          What uses which address
        </h3>
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: c.border }}>
          <table className="dashboard-table dashboard-table--compact w-full min-w-[640px]">
            <thead>
              <tr>
                <th className="text-left">Action</th>
                <th className="text-left">Audience</th>
                <th className="text-left">Address</th>
              </tr>
            </thead>
            <tbody>
              {EMAIL_ADDRESS_MAP.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="font-medium" style={{ color: c.primary }}>
                      {row.action}
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: c.secondary }}>
                      {row.examples}
                    </div>
                  </td>
                  <td>
                    <span className="status-pill status-pill--pending">
                      {audienceLabel(row.audience)}
                    </span>
                  </td>
                  <td className="font-mono text-[12px]" style={{ color: c.primary }}>
                    {resolveIntended(row.id)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
