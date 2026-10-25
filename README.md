# Zyprilo — 14 Free Speed & Reflex Games

A fully client-side React + Vite app: 14 playable games, a deterministic daily
challenge, and local-only result history (localStorage). No backend, no
accounts, no analytics, no paid APIs.

## Commands

```bash
npm install
npm run dev        # local dev server
npm run lint       # ESLint
npm test           # Vitest unit tests
npm run build      # type-check + production build + SEO file generation
npm run preview    # serve the production build locally
```

## Configuration (single file: `src/site.config.json`)

| Key           | Purpose                                                      |
| ------------- | ------------------------------------------------------------ |
| `name`        | Site name used across the UI header, titles and meta tags     |
| `tagline`     | Short descriptor used in titles                               |
| `description` | Default meta description                                      |
| `siteUrl`     | **Production origin, e.g. `https://example.com` (no trailing slash). Leave empty until confirmed.** |

While `siteUrl` is empty the app intentionally emits **no canonical URL, no
`og:url` and no `sitemap.xml`** — nothing can accidentally publish a
placeholder domain. Once you set it and run `npm run build`:

- `<link rel="canonical">` and `og:url` point at the site root (see SEO notes).
- `dist/sitemap.xml` is generated (single root URL — see SEO notes).
- `dist/robots.txt` gets a `Sitemap:` line appended.

## SEO notes and limitations

The app uses **hash routing** (`/#/game/<id>`). Consequences:

- Google treats `/#/game/typing` and `/` as the **same document** — fragments
  are not sent to servers and are ignored for indexing. All 14 games therefore
  live on one crawlable URL (the homepage).
- Per-game titles/descriptions are set at runtime (good for users and shared
  links), but crawlers see one page. The canonical URL is correctly the site
  root for every screen.
- The sitemap intentionally contains only the root URL.
- Game cards are real `<a href="#/game/…">` links, so the homepage exposes all
  14 games as crawlable anchors with their names and descriptions in the DOM.

**Smallest suitable upgrade path (not done in this release):** migrate the
router from hash fragments to the History API (`/game/<id>` paths), keep the
same component tree, and add a `404.html` copy of `index.html` for GitHub
Pages refresh support. Then per-game canonical URLs, a 14-entry sitemap and
static per-game meta become possible (or prerender at build time).

Structured data: a single accurate `WebApplication` JSON-LD per screen (name,
description, category, free offer). No ratings, review counts or usage figures
are published because none exist.

## GitHub Pages publishing

1. Push the repository to GitHub (any account/repo name works).
2. Ensure `.github/workflows/deploy.yml` is on your default branch.
3. Repository **Settings → Pages → Source: GitHub Actions**.
4. Push to the default branch (or run the workflow manually). The workflow
   derives the asset base path from the repository name automatically.

Manual alternative without Actions:

```bash
npm run build -- --base=/<your-repo-name>/   # project site
npx gh-pages -d dist                          # or commit dist/ to the gh-pages branch
```

Routing/refresh behavior on GitHub Pages: because routing is hash-based, the
server only ever serves `/` (or `/<repo>/`), so deep links and refreshes work
without any 404 fallback. If you later migrate to path routing, copy
`dist/index.html` to `dist/404.html` during the build.

## Privacy

- Results, daily-challenge completion and personal bests are stored only in
  the visitor's browser (localStorage, `reflexlab:*` keys).
- No analytics, cookies, or network requests after page load.
