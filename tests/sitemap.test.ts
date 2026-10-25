import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildRobotsWithSitemap, buildSitemap, generateSeo, readSiteUrl } from '../scripts/generate-sitemap.mjs'

let workDir
let configPath
let robotsPath
let outDir

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'reflexlab-seo-'))
  configPath = join(workDir, 'site.config.json')
  robotsPath = join(workDir, 'robots.txt')
  outDir = join(workDir, 'dist')
  mkdirSync(join(workDir, 'public'), { recursive: true })
  writeFileSync(robotsPath, 'User-agent: *\nAllow: /\n')
})

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true })
})

const withConfig = (siteUrl) =>
  writeFileSync(configPath, JSON.stringify({ _comment: 'test', name: 'x', siteUrl }))

describe('readSiteUrl', () => {
  it('reads the siteUrl and strips trailing slashes', () => {
    withConfig('https://example.com/')
    expect(readSiteUrl(configPath)).toBe('https://example.com')
  })

  it('returns empty string when unset', () => {
    withConfig('')
    expect(readSiteUrl(configPath)).toBe('')
  })
})

describe('buildSitemap', () => {
  it('emits a valid single-URL sitemap for the hash-routed app', () => {
    const xml = buildSitemap('https://example.com', '2026-10-25T00:00:00Z')
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<loc>https://example.com/</loc>')
    expect(xml).toContain('<lastmod>2026-10-25T00:00:00Z</lastmod>')
    // Hash routes are not separate documents; only the root may appear.
    expect(xml).not.toContain('#')
    expect(xml.match(/<url>/g)).toHaveLength(1)
  })
})

describe('buildRobotsWithSitemap', () => {
  it('appends the Sitemap directive without duplicating it', () => {
    const out = buildRobotsWithSitemap('User-agent: *\nAllow: /\n', 'https://example.com')
    expect(out).toContain('Allow: /')
    expect(out.trimEnd().endsWith('Sitemap: https://example.com/sitemap.xml')).toBe(true)
  })
})

describe('generateSeo', () => {
  it('writes nothing while siteUrl is unconfigured (no placeholder leak)', () => {
    withConfig('')
    const result = generateSeo({ configPath, robotsPath, outDir })
    expect(result.skipped).toBe(true)
    expect(result.wrote).toBeUndefined()
  })

  it('writes sitemap.xml and robots.txt when configured', () => {
    withConfig('https://example.com')
    const result = generateSeo({
      configPath,
      robotsPath,
      outDir,
      now: () => new Date('2026-10-25T12:00:00Z'),
    })
    expect(result.skipped).toBe(false)
    expect(result.wrote).toEqual(['sitemap.xml', 'robots.txt'])
    expect(readFileSync(join(outDir, 'sitemap.xml'), 'utf8')).toContain('https://example.com/')
    expect(readFileSync(join(outDir, 'robots.txt'), 'utf8')).toContain(
      'Sitemap: https://example.com/sitemap.xml',
    )
  })
})
