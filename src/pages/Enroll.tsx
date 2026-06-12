import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle,
  ArrowRight,
  Truck,
  FileText,
  DollarSign,
  Clock,
} from 'lucide-react'
import { SERVICE_PLANS } from '../config/servicePlans'
import { createClient } from '../services/clientRegistry'
import { notifyAdminClientEnrolled } from '../services/adminNotificationService'
import type { ServiceTier } from '../types/client'

export default function Enroll() {
  const navigate = useNavigate()
  const [enrollStep, setEnrollStep] = useState<1 | 2>(1)
  const [selectedTier, setSelectedTier] = useState<ServiceTier>('self_service')
  const [formData, setFormData] = useState({
    companyName: '',
    contactPerson: '',
    email: '',
    phone: '',
    fleetSize: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    await new Promise((resolve) => setTimeout(resolve, 800))

    const client = createClient({
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

    setIsSubmitting(false)
    setSubmitted(true)
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFFFFF' }}>
      {/* Header */}
      <header className="border-b sticky top-0 z-50 bg-white" style={{ borderColor: '#819291' }}>
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <img 
              src="/Logo.png" 
              alt="CREDYX A/R SOLUTIONS" 
              className="h-10 w-auto"
              style={{ maxHeight: '40px' }}
            />
            <div className="flex items-center space-x-6">
              <button
                onClick={() => navigate('/how-it-works')}
                className="text-sm font-medium transition-colors"
                style={{ color: '#819291' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#113543')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#819291')}
              >
                How It Works
              </button>
              <button
                onClick={() => navigate('/client/login')}
                className="px-6 py-2 text-sm font-medium text-white rounded transition-colors"
                style={{ backgroundColor: '#113543' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0a2529')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#113543')}
              >
                Client Login
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-16" style={{ backgroundColor: '#F5F5F5' }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left: Value Proposition */}
            <div>
              <h1 className="text-5xl font-bold mb-6" style={{ color: '#113543' }}>
                You Haul. <br />We Handle the Paperwork.
              </h1>
              <p className="text-xl mb-4" style={{ color: '#819291' }}>
                Professional back-office billing and collections for trucking companies.
              </p>
              <p className="text-lg mb-8" style={{ color: '#113543' }}>
                Get paid faster without the stress. No employees needed. 
                We work alongside your factoring company or handle everything directly.
              </p>

              {/* Key Stats */}
              <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="text-center p-4 bg-white rounded border" style={{ borderColor: '#819291' }}>
                  <div className="text-3xl font-bold mb-1" style={{ color: '#C2A558' }}>Minutes</div>
                  <div className="text-sm" style={{ color: '#819291' }}>Invoice Processing</div>
                </div>
                <div className="text-center p-4 bg-white rounded border" style={{ borderColor: '#819291' }}>
                  <div className="text-3xl font-bold mb-1" style={{ color: '#C2A558' }}>100%</div>
                  <div className="text-sm" style={{ color: '#819291' }}>Transparency</div>
                </div>
                <div className="text-center p-4 bg-white rounded border" style={{ borderColor: '#819291' }}>
                  <div className="text-3xl font-bold mb-1" style={{ color: '#C2A558' }}>1-50</div>
                  <div className="text-sm" style={{ color: '#819291' }}>Trucks</div>
                </div>
              </div>

              <button
                onClick={() => {
                  document.getElementById('enroll-form')?.scrollIntoView({ behavior: 'smooth' })
                }}
                className="flex items-center space-x-2 px-8 py-4 text-lg font-medium text-white rounded transition-colors"
                style={{ backgroundColor: '#113543' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0a2529')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#113543')}
              >
                <span>Get Started</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>

            {/* Right: How It Works */}
            <div className="bg-white border rounded-lg p-8" style={{ borderColor: '#819291' }}>
              <h2 className="text-2xl font-bold mb-6" style={{ color: '#113543' }}>
                How It Works
              </h2>
              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#C2A558' }}>
                    <span className="text-white font-bold">1</span>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1" style={{ color: '#113543' }}>Submit Your Loads</h3>
                    <p className="text-sm" style={{ color: '#819291' }}>
                      Upload your delivery documents (POD, BOL, rate confirmations) to our portal.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#C2A558' }}>
                    <span className="text-white font-bold">2</span>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1" style={{ color: '#113543' }}>We Bill the Brokers</h3>
                    <p className="text-sm" style={{ color: '#819291' }}>
                      Our automated system creates and sends professional invoices to your brokers within minutes.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#C2A558' }}>
                    <span className="text-white font-bold">3</span>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1" style={{ color: '#113543' }}>We Track & Collect</h3>
                    <p className="text-sm" style={{ color: '#819291' }}>
                      We follow up with brokers, track payment status, and handle any deductions or disputes.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#C2A558' }}>
                    <span className="text-white font-bold">4</span>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1" style={{ color: '#113543' }}>You Get Paid</h3>
                    <p className="text-sm" style={{ color: '#819291' }}>
                      Track everything in real-time through your dashboard. Monitor payments and A/R status 24/7.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose CREDYX */}
      <section className="py-16" style={{ backgroundColor: '#FFFFFF' }}>
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl font-bold mb-12 text-center" style={{ color: '#113543' }}>
            Why Trucking Companies Choose CREDYX
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="text-center p-6 bg-white border rounded-lg" style={{ borderColor: '#819291' }}>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ backgroundColor: '#C2A558' }}>
                <Truck className="w-8 h-8 text-white" />
              </div>
              <h3 className="font-bold mb-2" style={{ color: '#113543' }}>No Employees Needed</h3>
              <p className="text-sm" style={{ color: '#819291' }}>
                Skip the payroll, training, and turnover. Our experienced team handles everything from day one.
              </p>
            </div>

            <div className="text-center p-6 bg-white border rounded-lg" style={{ borderColor: '#819291' }}>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ backgroundColor: '#C2A558' }}>
                <Clock className="w-8 h-8 text-white" />
              </div>
              <h3 className="font-bold mb-2" style={{ color: '#113543' }}>Lightning Fast</h3>
              <p className="text-sm" style={{ color: '#819291' }}>
                Automated invoice processing within minutes. We focus on professional follow-up with brokers for timely payments.
              </p>
            </div>

            <div className="text-center p-6 bg-white border rounded-lg" style={{ borderColor: '#819291' }}>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ backgroundColor: '#C2A558' }}>
                <FileText className="w-8 h-8 text-white" />
              </div>
              <h3 className="font-bold mb-2" style={{ color: '#113543' }}>Complete Visibility</h3>
              <p className="text-sm" style={{ color: '#819291' }}>
                Real-time dashboard to track all invoices, payments, and outstanding A/R at any time.
              </p>
            </div>

            <div className="text-center p-6 bg-white border rounded-lg" style={{ borderColor: '#819291' }}>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ backgroundColor: '#C2A558' }}>
                <DollarSign className="w-8 h-8 text-white" />
              </div>
              <h3 className="font-bold mb-2" style={{ color: '#113543' }}>Works With Factoring</h3>
              <p className="text-sm" style={{ color: '#819291' }}>
                We integrate seamlessly with your factoring company or handle direct billing—your choice.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What We Handle */}
      <section className="py-16" style={{ backgroundColor: '#F5F5F5' }}>
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl font-bold mb-4 text-center" style={{ color: '#113543' }}>
            What We Handle For You
          </h2>
          <p className="text-center mb-12 text-lg" style={{ color: '#819291' }}>
            Focus on hauling freight. We'll handle the back office.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {[
              'Invoice creation and billing',
              'Broker invoicing and verification',
              'Collections and A/R follow-up',
              'Payment status tracking',
              'Deduction monitoring (lumper, TONU, etc.)',
              'POD/BOL verification',
              'Paperwork corrections',
              'Secure document storage',
              'Clear A/R reporting',
            ].map((item, index) => (
              <div key={index} className="flex items-center space-x-3 p-4 bg-white border rounded" style={{ borderColor: '#819291' }}>
                <CheckCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#C2A558' }} />
                <span style={{ color: '#113543' }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Enrollment Form */}
      <section id="enroll-form" className="py-16" style={{ backgroundColor: '#FFFFFF' }}>
        <div className="max-w-2xl mx-auto px-6">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-4" style={{ color: '#113543' }}>
              Ready to Get Started?
            </h2>
            <p className="text-lg" style={{ color: '#819291' }}>
              Fill out the form and we'll contact you within 24 hours
            </p>
          </div>

          {submitted ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
              <CheckCircle className="w-16 h-16 mx-auto mb-4" style={{ color: '#10b981' }} />
              <h3 className="text-2xl font-bold mb-2" style={{ color: '#059669' }}>
                Thank You!
              </h3>
              <p style={{ color: '#047857' }}>
                Your application is under review. We&apos;ll email you when your account is activated.
              </p>
            </div>
          ) : enrollStep === 1 ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {SERVICE_PLANS.map((plan) => {
                  const selected = selectedTier === plan.tier
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedTier(plan.tier)}
                      className="text-left p-6 border-2 rounded-xl transition-all"
                      style={{
                        borderColor: selected ? '#113543' : '#819291',
                        backgroundColor: selected ? '#f8fafc' : '#FFFFFF',
                      }}
                    >
                      <h3 className="text-lg font-bold mb-1" style={{ color: '#113543' }}>
                        {plan.name}
                      </h3>
                      <p className="text-sm mb-4" style={{ color: '#819291' }}>
                        {plan.tagline}
                      </p>
                      <p className="text-2xl font-bold mb-1" style={{ color: '#113543' }}>
                        ${plan.app_fee_monthly}
                        <span className="text-sm font-normal" style={{ color: '#819291' }}>
                          /mo app
                        </span>
                      </p>
                      {plan.service_fee_monthly != null && (
                        <p className="text-sm font-medium" style={{ color: '#C2A558' }}>
                          + ${plan.service_fee_monthly}/mo managed service
                        </p>
                      )}
                      <ul className="mt-4 space-y-2">
                        {plan.features.slice(0, 4).map((f) => (
                          <li key={f} className="flex items-start gap-2 text-xs" style={{ color: '#113543' }}>
                            <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: '#C2A558' }} />
                            {f}
                          </li>
                        ))}
                      </ul>
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                onClick={() => setEnrollStep(2)}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 text-lg font-medium text-white rounded"
                style={{ backgroundColor: '#113543' }}
              >
                Continue with {selectedTier === 'managed' ? 'Managed' : 'Self-Service'}
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-white border rounded-lg p-8" style={{ borderColor: '#819291' }}>
              <button
                type="button"
                onClick={() => setEnrollStep(1)}
                className="text-sm mb-4 font-medium"
                style={{ color: '#819291' }}
              >
                ← Change plan
              </button>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
                    Company Name <span style={{ color: '#C2A558' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.companyName}
                    onChange={(e) => handleInputChange('companyName', e.target.value)}
                    className="w-full px-4 py-3 text-sm border rounded focus:outline-none focus:ring-2"
                    style={{
                      borderColor: '#819291',
                      color: '#113543',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#C2A558'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(194, 165, 88, 0.1)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#819291'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
                      Contact Person <span style={{ color: '#C2A558' }}>*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.contactPerson}
                      onChange={(e) => handleInputChange('contactPerson', e.target.value)}
                      className="w-full px-4 py-3 text-sm border rounded focus:outline-none focus:ring-2"
                      style={{
                        borderColor: '#819291',
                        color: '#113543',
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = '#C2A558'
                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(194, 165, 88, 0.1)'
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#819291'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
                      Phone Number <span style={{ color: '#C2A558' }}>*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      className="w-full px-4 py-3 text-sm border rounded focus:outline-none focus:ring-2"
                      style={{
                        borderColor: '#819291',
                        color: '#113543',
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = '#C2A558'
                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(194, 165, 88, 0.1)'
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#819291'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
                      Email Address <span style={{ color: '#C2A558' }}>*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      className="w-full px-4 py-3 text-sm border rounded focus:outline-none focus:ring-2"
                      style={{
                        borderColor: '#819291',
                        color: '#113543',
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = '#C2A558'
                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(194, 165, 88, 0.1)'
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#819291'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: '#113543' }}>
                      Fleet Size <span style={{ color: '#C2A558' }}>*</span>
                    </label>
                    <select
                      required
                      value={formData.fleetSize}
                      onChange={(e) => handleInputChange('fleetSize', e.target.value)}
                      className="w-full px-4 py-3 text-sm border rounded focus:outline-none focus:ring-2"
                      style={{
                        borderColor: '#819291',
                        color: '#113543',
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = '#C2A558'
                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(194, 165, 88, 0.1)'
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#819291'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    >
                      <option value="">Select fleet size</option>
                      <option value="1-5">1-5 trucks</option>
                      <option value="6-10">6-10 trucks</option>
                      <option value="11-25">11-25 trucks</option>
                      <option value="26-50">26-50 trucks</option>
                      <option value="50+">50+ trucks</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center space-x-2 px-6 py-4 text-lg font-medium text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: isSubmitting ? '#b89547' : '#113543' }}
                  onMouseEnter={(e) => {
                    if (!isSubmitting) {
                      e.currentTarget.style.backgroundColor = '#0a2529'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSubmitting) {
                      e.currentTarget.style.backgroundColor = '#113543'
                    }
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <span>Get Started</span>
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8" style={{ backgroundColor: '#F5F5F5', borderColor: '#819291' }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <img 
              src="/Logo.png" 
              alt="CREDYX A/R SOLUTIONS" 
              className="h-8 w-auto mb-4 md:mb-0"
              style={{ maxHeight: '32px' }}
            />
            <p className="text-sm" style={{ color: '#819291' }}>
              © {new Date().getFullYear()} CREDYX A/R SOLUTIONS. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
