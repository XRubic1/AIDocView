/** Single source of truth for the public free MC broker check SEO page (React + build-time prerender). */

export const SITE_URL = 'https://credyx.net'
export const MC_CHECK_PATH = '/free-broker-mc-check'
export const MC_CHECK_URL = `${SITE_URL}${MC_CHECK_PATH}`

export const MC_CHECK_TITLE = 'Free MC Broker Check — Verify Freight Broker Authority & Risk | Credyx'
export const MC_CHECK_DESCRIPTION =
  'Run a free MC broker check before you book a load. Look up any freight broker by MC number and see FMCSA authority status, insurance and BMC-84 bond, safety flags and payment risk in seconds.'
export const MC_CHECK_H1 = 'Free MC Broker Check'
export const MC_CHECK_LEAD =
  'Look up any freight broker by MC number and see whether their authority is active, whether insurance and bond are on file, and whether they pay carriers on time, before you haul their freight.'

export type McCheckSection = { heading: string; paragraphs?: string[]; bullets?: string[] }
export type McCheckFaq = { question: string; answer: string }

export const MC_CHECK_SECTIONS: McCheckSection[] = [
  {
    heading: 'What the free broker check shows',
    bullets: [
      'FMCSA operating authority: active, inactive or revoked broker authority for the MC number.',
      'Insurance and bond: whether a BMC-84 surety bond or BMC-85 trust fund is on file, and whether coverage has been cancelled.',
      'Company details: legal name, DBA, address, phone and DOT number, so you can confirm you are dealing with the right company.',
      'Risk signals: authority changes, missing or cancelled filings and payment risk flags that call for a closer look before you book.',
    ],
  },
  {
    heading: 'How to vet a freight broker before booking',
    paragraphs: [
      'Brokers are not all equal, and a double-brokered or fraudulent load can cost a small carrier weeks of unpaid work. A two-minute check helps you avoid most of that.',
    ],
    bullets: [
      'Confirm the broker has active property broker authority under the MC number they gave you.',
      'Check that the bond is on file and not cancelled. A cancelled bond is a serious warning sign.',
      'Make sure the company name, phone number and email domain match the FMCSA record.',
      'Be wary of brokers whose authority was granted very recently and who offer rates well above market.',
      'Check payment terms and days-to-pay before the load, not after delivery.',
    ],
  },
  {
    heading: 'Why carriers use Credyx to check brokers',
    paragraphs: [
      'Credyx is an accounts-receivable service built for trucking companies. The same broker data that powers this free MC check helps our clients collect on invoices faster, so we keep the check free and quick for every carrier.',
    ],
  },
]

export const MC_CHECK_FAQS: McCheckFaq[] = [
  {
    question: 'What is an MC number?',
    answer:
      'An MC (Motor Carrier) number is the docket number the FMCSA issues to for-hire carriers and freight brokers. A broker needs active broker authority under their MC number to legally arrange freight.',
  },
  {
    question: 'How do I check if a freight broker is legit?',
    answer:
      'Look up the broker by MC number and confirm their authority is active, their BMC-84 bond or BMC-85 trust fund is on file and not cancelled, and that their name, phone and email match the FMCSA record.',
  },
  {
    question: 'Is the MC broker check really free?',
    answer:
      'Yes. Enter your carrier MC number to unlock free broker lookups. There is no credit card and no subscription.',
  },
  {
    question: 'What is a BMC-84 bond?',
    answer:
      'A BMC-84 is a $75,000 surety bond that property brokers must keep on file with the FMCSA. It exists to protect carriers if a broker fails to pay.',
  },
  {
    question: 'Where does the data come from?',
    answer:
      'Authority, insurance and company details come from FMCSA public records. Records can change daily, so confirm anything critical with the broker before you book.',
  },
]

export function buildMcCheckJsonLd(): Record<string, unknown>[] {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Credyx Free MC Broker Check',
      url: MC_CHECK_URL,
      description: MC_CHECK_DESCRIPTION,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Any',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      publisher: { '@type': 'Organization', name: 'Credyx', url: SITE_URL },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: MC_CHECK_FAQS.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Credyx', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: MC_CHECK_H1, item: MC_CHECK_URL },
      ],
    },
  ]
}
