/**
 * Build-time SEO generator for static hosting.
 *
 * Reads siteUrl from src/site.config.json and writes into the dist/ folder:
 *  - sitemap.xml — only when siteUrl is configured
 *  - robots.txt  — the Sitemap directive is appended only when siteUrl is set
 *
 * While siteUrl is empty NOTHING is written, so a placeholder domain can
 * never leak into canonical URLs, robots.txt or the sitemap.
 *
 * The app uses hash routing (#/game/<id>): every screen is served by the same
 * document at the site root, so the sitemap intentionally lists only the root
 * URL. Game screens are not independently crawlable URLs (see README).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

export function readSiteUrl(configPath) {
  const raw = readFileSync(configPath, 'utf8')
  // Strip the _comment line so the JSON stays human-friendly.
  const json = JSON.parse(
    raw.replace(/^\s*"_comment":.*,\s*$/m, ''),
  )
  return typeof json.siteUrl === 'string' ? json.siteUrl.replace(/\/+$/, '') : ''
}

export function buildSitemap(siteUrl, lastmodISO) {
  const url = `${siteUrl}/`
  const lastmod = lastmodISO ? `<lastmod>${lastmodISO}</lastmod>` : ''
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `  <url><loc>${url}</loc>${lastmod}</url>`,
    '</urlset>',
    '',
  ].join('\n')
}

export function buildRobotsWithSitemap(robotsTxt, siteUrl) {
  return `${robotsTxt.trimEnd()}\nSitemap: ${siteUrl}/sitemap.xml\n`
}

/**
 * Generates SEO files into outDir. Returns a report of what was written.
 * Pure side-effectful function separated from the CLI for testability.
 */
export function generateSeo({ configPath, robotsPath, outDir, now = () => new Date() }) {
  const siteUrl = readSiteUrl(configPath)
  if (!siteUrl) {
    return { skipped: true, reason: 'siteUrl is not configured in src/site.config.json' }
  }
  mkdirSync(outDir, { recursive: true })
  const robots = readFileSync(robotsPath, 'utf8')
  writeFileSync(resolve(outDir, 'sitemap.xml'), buildSitemap(siteUrl, now().toISOString()))
  writeFileSync(resolve(outDir, 'robots.txt'), buildRobotsWithSitemap(robots, siteUrl))
  return { skipped: false, siteUrl, wrote: ['sitemap.xml', 'robots.txt'] }
}

// CLI entry: `node scripts/generate-sitemap.mjs [distDir]`
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const outDir = resolve(here, '..', process.argv[2] ?? 'dist')
  const configPath = resolve(here, '..', 'src', 'site.config.json')
  const robotsPath = resolve(here, '..', 'public', 'robots.txt')
  const result = generateSeo({ configPath, robotsPath, outDir })
  if (result.skipped) {
    console.log(`[seo] Skipped sitemap generation: ${result.reason}.`)
    console.log('[seo] Set "siteUrl" in src/site.config.json to your final domain, then rebuild.')
  } else {
    console.log(`[seo] Wrote ${result.wrote.join(' and ')} for ${result.siteUrl} into ${outDir}`)
  }
}
