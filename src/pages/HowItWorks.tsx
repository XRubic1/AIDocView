import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import {
  Upload,
  FileText,
  Send,
  PhoneCall,
  DollarSign,
  CheckCircle,
  BarChart3,
  Clock,
  Shield,
  Users,
  ArrowRight,
  ArrowDown,
  CheckSquare,
} from 'lucide-react'

export default function HowItWorks() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const isScrolling = useRef(false)

  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current || isScrolling.current) return

      const scrollTop = window.scrollY
      const windowHeight = window.innerHeight
      const containerTop = containerRef.current.offsetTop
      const scrollWithinContainer = scrollTop - containerTop

      if (scrollWithinContainer < 0) {
        setCurrentStep(0)
        return
      }

      // Each step takes one full viewport height of scroll
      const stepIndex = Math.floor(scrollWithinContainer / windowHeight)
      const maxStep = 6 // 7 steps, index 0-6
      
      if (stepIndex >= 0 && stepIndex <= maxStep) {
        setCurrentStep(stepIndex)
      }
    }

    window.addEventListener('scroll', handleScroll)
    handleScroll() // Initial call

    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const steps = [
    {
      number: 1,
      icon: Upload,
      title: 'Submit Your Documents',
      description: 'Upload your delivery documents through our secure portal',
      details: [
        'Upload POD (Proof of Delivery)',
        'BOL (Bill of Lading)',
        'Rate confirmations',
        'Any supporting documentation',
      ],
      benefit: 'Simple drag-and-drop interface accessible 24/7 from any device',
    },
    {
      number: 2,
      icon: CheckSquare,
      title: 'Professional Document Review',
      description: 'Our experienced team reviews every document for accuracy and completeness',
      details: [
        'Thorough document verification',
        'Rate confirmation matching',
        'Missing information identification',
        'Prompt communication if issues found',
      ],
      benefit: 'Catch errors before billing - we notify you immediately if anything is missing or needs correction',
    },
    {
      number: 3,
      icon: FileText,
      title: 'Automated Invoice Creation',
      description: 'Our system creates professional invoices within minutes',
      details: [
        'Automated invoice generation',
        'Rate verification against confirmations',
        'Professional formatting',
        'Accurate broker information',
      ],
      benefit: 'Invoices ready in minutes, not hours or days',
    },
    {
      number: 4,
      icon: Send,
      title: 'Instant Broker Delivery',
      description: 'Invoices sent directly to brokers via their preferred method',
      details: [
        'Email delivery with read receipts',
        'Portal submissions where required',
        'Proper documentation attachments',
        'Confirmation tracking',
      ],
      benefit: 'Zero delays - brokers receive invoices immediately',
    },
    {
      number: 5,
      icon: PhoneCall,
      title: 'Professional Follow-Up',
      description: 'We handle all broker communication and payment tracking',
      details: [
        'Regular payment status checks',
        'Professional broker communication',
        'Deduction resolution',
        'Dispute handling',
      ],
      benefit: 'No more chasing brokers - we do it for you',
    },
    {
      number: 6,
      icon: DollarSign,
      title: 'Payment Monitoring',
      description: 'Track every payment from submission to receipt',
      details: [
        'Real-time payment tracking',
        'Aging A/R monitoring',
        'Payment reminders to brokers',
        'Collections escalation when needed',
      ],
      benefit: 'Complete visibility into your cash flow',
    },
    {
      number: 7,
      icon: CheckCircle,
      title: 'You Get Paid',
      description: 'Payments go directly to your account or factoring company',
      details: [
        'Direct payment to your bank',
        'Or coordination with your factoring company',
        'Payment reconciliation',
        'Clear reporting',
      ],
      benefit: 'Faster payments with full transparency',
    },
  ]

  const features = [
    {
      icon: BarChart3,
      title: 'Real-Time Dashboard',
      description: 'Monitor all invoices, payments, and outstanding A/R at any time',
    },
    {
      icon: Clock,
      title: 'Automated Reminders',
      description: 'Automatic follow-up emails to brokers approaching payment terms',
    },
    {
      icon: Shield,
      title: 'Secure Document Storage',
      description: 'All documents securely stored and accessible whenever you need them',
    },
    {
      icon: Users,
      title: 'Dedicated Support',
      description: 'Experienced team available to handle any billing questions or issues',
    },
  ]

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFFFFF' }}>
      <style>
        {`
          @keyframes bounce {
            0%, 20%, 50%, 80%, 100% {
              transform: translateY(0);
            }
            40% {
              transform: translateY(-10px);
            }
            60% {
              transform: translateY(-5px);
            }
          }

          @keyframes pulse {
            0% {
              transform: scale(1);
            }
            50% {
              transform: scale(1.05);
            }
            100% {
              transform: scale(1);
            }
          }
        `}
      </style>
      {/* Header */}
      <header className="border-b sticky top-0 z-50 bg-white" style={{ borderColor: '#819291' }}>
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <img 
              src="/Logo.png" 
              alt="CREDYX A/R SOLUTIONS" 
              className="h-10 w-auto cursor-pointer"
              style={{ maxHeight: '40px' }}
              onClick={() => navigate('/enroll')}
            />
            <div className="flex items-center space-x-6">
              <button
                onClick={() => navigate('/enroll')}
                className="text-sm font-medium transition-colors"
                style={{ color: '#819291' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#113543')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#819291')}
              >
                Home
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
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-5xl font-bold mb-6" style={{ color: '#113543' }}>
              How CREDYX Works
            </h1>
            <p className="text-xl" style={{ color: '#819291' }}>
              A simple, automated workflow that gets you paid faster without the hassle of managing billing staff
            </p>
          </div>
        </div>
      </section>

      {/* Step-by-Step Process with Scroll Effect */}
      <section 
        ref={containerRef}
        style={{ 
          backgroundColor: '#FFFFFF',
          height: `${steps.length * 100}vh`, // Total height for all steps
          position: 'relative',
        }}
      >
         <div 
           style={{
             position: 'sticky',
             top: '70px',
             height: 'calc(100vh - 70px)',
             display: 'flex',
             alignItems: 'center',
             justifyContent: 'center',
             overflow: 'hidden',
           }}
         >
          <div className="max-w-5xl mx-auto px-6 w-full">
            {steps.map((step, index) => {
              const Icon = step.icon
              const isActive = currentStep === index
              const isPast = currentStep > index
              const isFuture = currentStep < index
              
              return (
                 <div 
                   key={index}
                   style={{
                     position: 'absolute',
                     top: '40%',
                     left: '50%',
                     width: '100%',
                     maxWidth: '80rem',
                     padding: '0 1.5rem',
                     opacity: isActive ? 1 : 0,
                     transform: `translate(-50%, -40%) scale(${isActive ? 1 : 0.8}) ${
                       isPast ? 'translateY(-100px)' : isFuture ? 'translateY(100px)' : ''
                     }`,
                     transition: 'opacity 0.8s ease-out, transform 0.8s ease-out',
                     pointerEvents: isActive ? 'auto' : 'none',
                   }}
                 >
                  <div className="flex flex-col md:flex-row gap-8 items-center">
                    {/* Left: Icon and Number */}
                    <div className="flex-shrink-0">
                      <div className="relative">
                        <div
                          className="w-32 h-32 rounded-full flex items-center justify-center"
                          style={{ 
                            backgroundColor: '#C2A558',
                            animation: isActive ? 'pulse 2s ease-in-out infinite' : 'none',
                          }}
                        >
                          <Icon className="w-16 h-16 text-white" />
                        </div>
                        <div
                          className="absolute -top-2 -right-2 w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg"
                          style={{ 
                            backgroundColor: '#113543',
                          }}
                        >
                          {step.number}
                        </div>
                      </div>
                    </div>

                    {/* Right: Content */}
                    <div className="flex-1">
                      <h3 className="text-3xl font-bold mb-4" style={{ color: '#113543' }}>
                        {step.title}
                      </h3>
                      <p className="text-xl mb-6" style={{ color: '#819291' }}>
                        {step.description}
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white border rounded-lg p-6" style={{ borderColor: '#819291' }}>
                          <h4 className="font-semibold mb-4 text-base" style={{ color: '#113543' }}>
                            What We Do:
                          </h4>
                          <ul className="space-y-3">
                            {step.details.map((detail, idx) => (
                              <li key={idx} className="flex items-start space-x-3">
                                <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#C2A558' }} />
                                <span className="text-base" style={{ color: '#819291' }}>{detail}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                          <h4 className="font-semibold mb-3 text-base" style={{ color: '#059669' }}>
                            Your Benefit:
                          </h4>
                          <p className="text-base" style={{ color: '#047857' }}>
                            {step.benefit}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step Progress Indicator */}
                  <div className="flex justify-center mt-8 space-x-2">
                    {steps.map((_, idx) => (
                      <div
                        key={idx}
                        style={{
                          width: idx === index ? '32px' : '8px',
                          height: '8px',
                          borderRadius: '4px',
                          backgroundColor: idx === index ? '#C2A558' : idx < index ? '#819291' : '#E5E7EB',
                          transition: 'all 0.3s ease',
                        }}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

           {/* Scroll indicator */}
           {currentStep < steps.length - 1 && (
             <div 
               style={{
                 position: 'absolute',
                 bottom: '2rem',
                 left: 0,
                 right: 0,
                 display: 'flex',
                 flexDirection: 'column',
                 alignItems: 'center',
                 justifyContent: 'center',
                 animation: 'bounce 2s infinite',
               }}
             >
               <ArrowDown className="w-8 h-8 mx-auto" style={{ color: '#C2A558' }} />
               <p className="text-sm mt-2 text-center" style={{ color: '#819291', whiteSpace: 'nowrap' }}>
                 Scroll to continue
               </p>
             </div>
           )}
        </div>
      </section>

      {/* Platform Features */}
      <section className="py-16" style={{ backgroundColor: '#F5F5F5' }}>
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl font-bold mb-12 text-center" style={{ color: '#113543' }}>
            Powerful Platform Features
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => {
              const Icon = feature.icon
              return (
                <div
                  key={index}
                  className="bg-white border rounded-lg p-6 text-center"
                  style={{ borderColor: '#819291' }}
                >
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ backgroundColor: '#C2A558' }}>
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="font-bold mb-2" style={{ color: '#113543' }}>
                    {feature.title}
                  </h3>
                  <p className="text-sm" style={{ color: '#819291' }}>
                    {feature.description}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* What Makes Us Different */}
      <section className="py-16" style={{ backgroundColor: '#FFFFFF' }}>
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold mb-8 text-center" style={{ color: '#113543' }}>
            What Makes CREDYX Different
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="text-4xl font-bold mb-2" style={{ color: '#C2A558' }}>
                Automation
              </div>
              <h3 className="font-semibold mb-2" style={{ color: '#113543' }}>
                Technology-Driven
              </h3>
              <p className="text-sm" style={{ color: '#819291' }}>
                Automated invoice creation and delivery means your invoices are sent in minutes, not days. 
                Fast billing leads to faster payments.
              </p>
            </div>

            <div className="text-center">
              <div className="text-4xl font-bold mb-2" style={{ color: '#C2A558' }}>
                Human Touch
              </div>
              <h3 className="font-semibold mb-2" style={{ color: '#113543' }}>
                Professional Follow-Up
              </h3>
              <p className="text-sm" style={{ color: '#819291' }}>
                While technology handles the paperwork, our experienced team handles broker communication, 
                disputes, and collections—the human element that matters.
              </p>
            </div>

            <div className="text-center">
              <div className="text-4xl font-bold mb-2" style={{ color: '#C2A558' }}>
                Flexibility
              </div>
              <h3 className="font-semibold mb-2" style={{ color: '#113543' }}>
                Works With Your Setup
              </h3>
              <p className="text-sm" style={{ color: '#819291' }}>
                Whether you work with a factoring company or collect directly, we integrate seamlessly 
                with your existing payment structure.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Service tiers */}
      <section className="py-16" style={{ backgroundColor: '#FFFFFF' }}>
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-4" style={{ color: '#113543' }}>
            Choose how you work with Credyx
          </h2>
          <p className="text-center text-lg mb-10" style={{ color: '#819291' }}>
            Same platform — you run operations, or we do it for you
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border rounded-xl p-6" style={{ borderColor: '#819291' }}>
              <h3 className="text-xl font-bold mb-2" style={{ color: '#113543' }}>
                Self-Service
              </h3>
              <p className="text-sm mb-4" style={{ color: '#819291' }}>
                Full portal access — you upload docs, build batches, and manage collections.
              </p>
              <p className="text-2xl font-bold mb-1" style={{ color: '#113543' }}>
                $99<span className="text-sm font-normal">/mo</span>
              </p>
              <p className="text-xs" style={{ color: '#819291' }}>
                + storage · you operate the platform
              </p>
            </div>
            <div className="border-2 rounded-xl p-6" style={{ borderColor: '#113543', backgroundColor: '#f8fafc' }}>
              <h3 className="text-xl font-bold mb-2" style={{ color: '#113543' }}>
                Managed
              </h3>
              <p className="text-sm mb-4" style={{ color: '#819291' }}>
                Credyx handles batch processing and collections — you send docs and track results.
              </p>
              <p className="text-2xl font-bold mb-1" style={{ color: '#113543' }}>
                $99<span className="text-sm font-normal">/mo app</span>
              </p>
              <p className="text-sm font-medium" style={{ color: '#C2A558' }}>
                + A/R collection % from Fee Terms
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16" style={{ backgroundColor: '#F5F5F5' }}>
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold mb-4" style={{ color: '#113543' }}>
            Ready to Get Started?
          </h2>
          <p className="text-lg mb-8" style={{ color: '#819291' }}>
            Join trucking companies across the country who trust CREDYX to handle their billing and collections
          </p>
          <button
            onClick={() => {
              navigate('/enroll')
              setTimeout(() => {
                document.getElementById('enroll-form')?.scrollIntoView({ behavior: 'smooth' })
              }, 100)
            }}
            className="inline-flex items-center space-x-2 px-8 py-4 text-lg font-medium text-white rounded transition-colors"
            style={{ backgroundColor: '#113543' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0a2529')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#113543')}
          >
            <span>Get Started Today</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8" style={{ backgroundColor: '#FFFFFF', borderColor: '#819291' }}>
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

