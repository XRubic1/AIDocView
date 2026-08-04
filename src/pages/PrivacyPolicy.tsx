import { Link } from 'react-router-dom'
import { LegalPageShell } from '../components/enroll/LegalPageShell'

/** Public Privacy Policy — mirrors docs/legal/PRIVACY_POLICY.md */
export default function PrivacyPolicy() {
  return (
    <LegalPageShell
      title="Privacy Policy"
      subtitle="Effective date: July 29, 2026"
    >
      <p>
        This Privacy Policy explains how <strong>Electro Pionir DOOEL</strong>, doing business as{' '}
        <strong>Credyx A/R Solutions</strong> (“
        <strong>Credyx</strong>,” “<strong>we</strong>,” “<strong>us</strong>,” or “
        <strong>our</strong>”) collects, uses, shares, and protects information when you use our
        websites, waitlist, client portal, and related A/R back-office services (the “
        <strong>Services</strong>”).
      </p>
      <p>
        Credyx provides accounts receivable and back-office support for trucking carriers. We are{' '}
        <strong>not</strong> a factor, lender, cash-advance provider, or freight broker.
      </p>
      <p>
        Contact for privacy requests: <strong>privacy@credyx.net</strong>
      </p>

      <h2>1. Information we collect</h2>
      <h3>1.1 Information you provide</h3>
      <ul>
        <li>
          <strong>Waitlist / marketing:</strong> company name, contact name, email, phone, fleet
          size, how you heard about us, and optional notes.
        </li>
        <li>
          <strong>Account &amp; enrollment:</strong> business and contact details needed to create
          a carrier account and communicate with your team.
        </li>
        <li>
          <strong>Login credentials:</strong> authentication data processed through our identity
          provider (currently Supabase Auth).
        </li>
        <li>
          <strong>Setup / compliance documents</strong> you upload to the document vault, which may
          include W-9, certificate of insurance (COI), MC/DOT authority documents, voided check or
          bank letter, and Notice of Assignment (NOA) when a factoring arrangement applies.
        </li>
        <li>
          <strong>Operational documents &amp; data:</strong> rate confirmations, bills of lading,
          proofs of delivery, invoices, broker contacts, remittance instructions, payment records,
          holds/disputes notes, and related freight paperwork you or your team submit.
        </li>
        <li>
          <strong>Support &amp; communications:</strong> messages you send to Credyx (email, portal,
          or assistant features).
        </li>
      </ul>

      <h3>1.2 Information we generate or receive in providing Services</h3>
      <ul>
        <li>
          Invoice status, aging, collections activity, billing and fee records for Credyx’s
          platform charges.
        </li>
        <li>Broker responses and payment confirmations related to loads we handle for you.</li>
        <li>
          Technical logs needed to operate and secure the Services (e.g., timestamps, approximate
          device/browser data, IP address, error logs).
        </li>
      </ul>

      <h3>1.3 Cookies and similar technologies</h3>
      <p>
        We may use essential cookies or local storage required for login sessions and basic site
        function. On the waitlist / marketing site, we also collect{' '}
        <strong>anonymous usage events</strong> (for example page views, button clicks, and which
        sections were viewed) tied to a temporary session identifier stored in your browser, plus
        approximate <strong>IP address and region</strong> used to understand where traffic comes
        from, and whether the visit was from a <strong>mobile or desktop</strong> device. These
        events help us understand how visitors use the site. They do not include your name or email
        unless you submit the waitlist form separately.
      </p>

      <h2>2. How we use information</h2>
      <p>We use information to:</p>
      <ul>
        <li>Operate the waitlist and contact you about Credyx.</li>
        <li>
          Provide A/R services: receive and verify paperwork, prepare and submit invoice packets to
          brokers, follow up on holds/disputes, track payment status, and keep you informed.
        </li>
        <li>
          Communicate with brokers and payors <strong>as your authorized back-office / A/R agent</strong>{' '}
          (not as a purchaser of your invoices, unless a separate factoring arrangement exists
          between you and a third party).
        </li>
        <li>
          Bill you for Credyx platform and service fees and process related payment requests.
        </li>
        <li>
          Secure, troubleshoot, and improve the Services, including using automated and AI-assisted
          tools to classify, extract, or review document content for operational accuracy.
        </li>
        <li>Comply with law, enforce agreements, and protect Credyx, our users, and others.</li>
      </ul>
      <p>
        We do <strong>not</strong> sell your personal information.
      </p>

      <h2>3. How we share information</h2>
      <p>We may share information with:</p>
      <ul>
        <li>
          <strong>Service providers</strong> who help us run the Services (for example
          hosting/database, authentication, email delivery, and payment or payout tooling such as
          Payoneer), under obligations to protect the data.
        </li>
        <li>
          <strong>Brokers, shippers, and payors</strong> when needed to invoice, follow up, or
          confirm payment <strong>on your behalf</strong> as part of the Services you requested.
        </li>
        <li>
          <strong>Your authorized users</strong> on your carrier account.
        </li>
        <li>
          <strong>Professional advisors</strong> (legal, accounting) under confidentiality.
        </li>
        <li>
          <strong>Authorities or other parties</strong> when required by law, legal process, or to
          protect rights and safety.
        </li>
        <li>
          A <strong>successor</strong> in connection with a merger, acquisition, or asset sale,
          subject to appropriate protections.
        </li>
      </ul>
      <p>
        We do not share your vault documents or freight data for unrelated marketing by third
        parties.
      </p>

      <h2>4. AI and document processing</h2>
      <p>
        Freight and setup documents may be processed with automated systems and AI-assisted review
        to classify pages, extract fields, flag missing items, and support human operators. Outputs
        are used to deliver the Services; humans remain involved in operational decisions as
        appropriate to the service plan (Managed or Self-Service).
      </p>
      <p>
        Do not upload information you are not authorized to share with Credyx for these purposes.
      </p>

      <h2>5. Retention</h2>
      <p>
        We retain information for as long as needed to provide the Services, meet legal/accounting
        obligations, resolve disputes, and enforce agreements. When you leave Credyx, we may retain
        limited records as required by law or legitimate business needs (for example billing
        history). You may request deletion as described below; we will honor requests where we are
        not required or permitted to keep the data.
      </p>

      <h2>6. Security</h2>
      <p>
        We use administrative, technical, and organizational measures designed to protect
        information (access controls, encryption in transit where supported by our providers, and
        role-based access within Credyx). No method of transmission or storage is 100% secure.
      </p>

      <h2>7. Your choices and rights</h2>
      <p>
        Depending on your location, you may have rights to access, correct, delete, or restrict
        certain personal information, or to object to certain processing. To exercise a request,
        email <strong>privacy@credyx.net</strong>. We may need to verify your identity and
        account relationship before responding.
      </p>
      <p>
        You may unsubscribe from marketing emails using the link in those messages. Service and
        transactional messages related to your account or invoices may still be sent.
      </p>

      <h2>8. Children’s privacy</h2>
      <p>
        The Services are directed to businesses and are not intended for individuals under 18. We
        do not knowingly collect personal information from children.
      </p>

      <h2>9. International users</h2>
      <p>
        Information may be processed in the United States and other locations where Credyx or our
        service providers (for example hosting and authentication) operate. If you access the
        Services from outside those locations, you understand your information may be transferred to
        and processed in those places.
      </p>

      <h2>10. Third-party sites</h2>
      <p>
        Our sites may link to third-party websites or tools. Their privacy practices are governed
        by their own policies.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may update this Privacy Policy from time to time. We will post the updated version with
        a revised effective date. Continued use of the Services after changes means you acknowledge
        the updated Policy, except where additional consent is required by law.
      </p>

      <h2>12. Contact</h2>
      <p>
        <strong>Credyx A/R Solutions</strong>
        <br />
        Electro Pionir DOOEL
        <br />
        Registered office: Oktomvriska Revolucija 22A lok.3, Skopje, Republic of North Macedonia
        <br />
        Privacy: <strong>privacy@credyx.net</strong>
        <br />
        Notices: <strong>notices@credyx.net</strong>
      </p>
      <p>
        Related: <Link to="/terms">Website Terms of Use</Link>
      </p>
    </LegalPageShell>
  )
}
