import { useEffect } from 'react'
import {
  MC_CHECK_DESCRIPTION,
  MC_CHECK_FAQS,
  MC_CHECK_H1,
  MC_CHECK_LEAD,
  MC_CHECK_SECTIONS,
  MC_CHECK_TITLE,
  MC_CHECK_URL,
  buildMcCheckJsonLd,
} from '../../seo/mcCheckSeo'

const JSON_LD_ID = 'mc-check-jsonld'

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

/** Sets head tags for the public MC check page (the prerendered file already carries them for crawlers). */
function useMcCheckHead() {
  useEffect(() => {
    const previousTitle = document.title
    document.title = MC_CHECK_TITLE
    upsertMeta('name', 'description', MC_CHECK_DESCRIPTION)
    upsertMeta('property', 'og:title', MC_CHECK_TITLE)
    upsertMeta('property', 'og:description', MC_CHECK_DESCRIPTION)
    upsertMeta('property', 'og:url', MC_CHECK_URL)

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (!canonical) {
      canonical = document.createElement('link')
      canonical.rel = 'canonical'
      document.head.appendChild(canonical)
    }
    canonical.href = MC_CHECK_URL

    document.getElementById(JSON_LD_ID)?.remove()
    const script = document.createElement('script')
    script.id = JSON_LD_ID
    script.type = 'application/ld+json'
    script.textContent = JSON.stringify(buildMcCheckJsonLd())
    document.head.appendChild(script)

    return () => {
      document.title = previousTitle
      document.getElementById(JSON_LD_ID)?.remove()
    }
  }, [])
}

/** Crawlable explainer content shown beneath the MC check tool. */
export function McCheckSeoContent() {
  useMcCheckHead()
  return (
    <section className="credyx-mc-seo" aria-labelledby="mc-seo-h1">
      <h1 id="mc-seo-h1">{MC_CHECK_H1}</h1>
      <p>{MC_CHECK_LEAD}</p>
      {MC_CHECK_SECTIONS.map((section) => (
        <div key={section.heading}>
          <h2>{section.heading}</h2>
          {section.paragraphs?.map((text) => <p key={text}>{text}</p>)}
          {section.bullets ? (
            <ul>
              {section.bullets.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : null}
        </div>
      ))}
      <h2>Frequently asked questions</h2>
      {MC_CHECK_FAQS.map((faq) => (
        <div key={faq.question}>
          <h3>{faq.question}</h3>
          <p>{faq.answer}</p>
        </div>
      ))}
    </section>
  )
}
