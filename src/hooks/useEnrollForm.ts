import { useState } from 'react'
import { createClient } from '../services/clientRegistry'
import { notifyAdminClientEnrolled } from '../services/adminNotificationService'
import { sendTransactionalEmail } from '../services/emailService'
import { getRuntimeEnvString } from '../platform/runtimeEnv'
import type { ServiceTier } from '../types/client'

function getAdminAlertEmail(): string {
  return getRuntimeEnvString('VITE_ADMIN_ALERT_EMAIL') ?? 'admin@credyx.com'
}

export interface EnrollFormData {
  companyName: string
  contactPerson: string
  email: string
  phone: string
  fleetSize: string
}

const INITIAL_FORM: EnrollFormData = {
  companyName: '',
  contactPerson: '',
  email: '',
  phone: '',
  fleetSize: '',
}

/**
 * Manages the two-step enrollment flow: plan selection then contact details.
 * Returns form state plus handlers; `submit` registers the client and
 * notifies admins.
 */
export function useEnrollForm() {
  const [step, setStep] = useState<1 | 2>(1)
  const [selectedTier, setSelectedTier] = useState<ServiceTier>('managed')
  const [formData, setFormData] = useState<EnrollFormData>(INITIAL_FORM)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updateField = (field: keyof EnrollFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      // Brief delay so the submitting state is perceivable
      await new Promise((resolve) => setTimeout(resolve, 800))

      const client = await createClient({
        name: formData.companyName,
        contact_person: formData.contactPerson,
        email: formData.email,
        phone: formData.phone,
        fleet_size: formData.fleetSize,
        service_tier: selectedTier,
        status: 'pending',
      })

      notifyAdminClientEnrolled({
        clientId: client.id,
        clientName: client.name,
        email: client.email ?? formData.email,
        tier: selectedTier,
      })

      await sendTransactionalEmail('admin_enrollment_alert', getAdminAlertEmail(), {
        clientName: client.name,
        email: client.email ?? formData.email,
      })

      setSubmitted(true)
    } catch {
      setError('Something went wrong submitting your application. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    step,
    setStep,
    selectedTier,
    setSelectedTier,
    formData,
    updateField,
    isSubmitting,
    submitted,
    error,
    submit,
  }
}
