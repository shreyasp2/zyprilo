import { useEffect } from 'react'
import { SITE, hasSiteUrl } from '../site'

export interface DocumentMetaOptions {
  /** Page-specific unique title. */
  title: string
  /** Page-specific unique meta description (keep under ~160 characters). */
  description: string
  /**
   * schema.org object describing VISIBLE page content. Rendered as a single
   * managed JSON-LD script; never include ratings or usage counts we don't have.
   */
  jsonLd?: Record<string, unknown>
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string | null) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (content === null) {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertLink(rel: string, href: string | null) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (href === null) {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

/**
 * Sets the document title, description, social-sharing tags, canonical URL and
 * structured data for the current screen. All tags are upserted (never
 * duplicated) and the JSON-LD node is a single managed element.
 *
 * Canonical/og:url are only emitted when a production siteUrl is configured:
 * the app uses hash routing, so every screen is the same document and the
 * canonical is always the site root — emitting a placeholder would be worse
 * than emitting nothing.
 */
export default function useDocumentMeta({ title, description, jsonLd }: DocumentMetaOptions) {
  useEffect(() => {
    document.title = title
    upsertMeta('name', 'description', description)
    upsertMeta('property', 'og:title', title)
    upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'og:type', 'website')
    upsertMeta('property', 'og:site_name', SITE.name)
    upsertMeta('name', 'twitter:card', 'summary')
    upsertMeta('name', 'twitter:title', title)
    upsertMeta('name', 'twitter:description', description)
    if (hasSiteUrl) {
      upsertLink('canonical', `${SITE.siteUrl}/`)
      upsertMeta('property', 'og:url', `${SITE.siteUrl}/`)
    }
    const scriptId = 'structured-data'
    let script = document.getElementById(scriptId) as HTMLScriptElement | null
    if (jsonLd) {
      if (!script) {
        script = document.createElement('script')
        script.id = scriptId
        script.type = 'application/ld+json'
        document.head.appendChild(script)
      }
      script.textContent = JSON.stringify(jsonLd)
    } else {
      script?.remove()
    }
  }, [title, description, jsonLd])
}
