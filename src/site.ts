import siteConfig from './site.config.json'

/**
 * Site identity + SEO configuration. All values come from src/site.config.json so
 * a rebrand or the final production domain is a single-file change.
 *
 * `siteUrl` MUST stay empty until the real domain is confirmed. Every feature
 * that requires an absolute URL (canonical link, og:url, sitemap.xml) checks
 * `hasSiteUrl` first and is skipped otherwise — an empty configuration emits
 * nothing rather than advertising a placeholder domain.
 */
export const SITE = {
  name: siteConfig.name,
  tagline: siteConfig.tagline,
  description: siteConfig.description,
  siteUrl: siteConfig.siteUrl,
} as const

export const hasSiteUrl = SITE.siteUrl.length > 0
