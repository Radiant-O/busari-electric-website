# Busari Electric website

Marketing site and EV station finder for Busari Electric. It's a fast static site: plain HTML, CSS and JavaScript, with no framework and no database.

## Run it locally

```bash
npm start          # builds the site, then serves it at http://localhost:4173
npm run build      # rebuild public/ only
```

Requires Node 18 or newer. Always edit files in `src/`. `public/` is generated output and gets overwritten on every build.

## Where things live

| What | File |
|---|---|
| Business name, email, phone, address, domain, **prices** | `src/site.json` |
| **Charging stations** shown on the map | `src/data/stations.json` |
| Pages | `src/pages/*.html` (the JSON block at the top of each sets its SEO title and description) |
| Header, footer, `<head>` | `src/partials/layout.html` |
| Styles | `src/assets/css/styles.css` |
| Map / station finder | `src/assets/js/locations.js` |
| Photos | `src/assets/img/` (from Pexels, free for commercial use) |

## Adding a station

Add an object to `stations` in `src/data/stations.json`:

```json
{
  "id": "atlanta-peachtree",
  "name": "Busari Electric Atlanta Peachtree",
  "street": "123 Peachtree St NE",
  "city": "Atlanta", "state": "GA", "zip": "30303",
  "lat": 33.7590, "lng": -84.3880,
  "hours": "Open 24 hours",
  "amenities": ["Restrooms", "Coffee"],
  "connectors": [
    { "type": "CCS1", "level": "dc", "kw": 350, "count": 4, "available": 4 },
    { "type": "NACS", "level": "dc", "kw": 250, "count": 2, "available": 2 }
  ]
}
```

- `type` is `CCS1`, `NACS` or `J1772`. `level` is `dc` (fast) or `l2` (Level 2).
- Get `lat`/`lng` by right-clicking the spot in Google Maps.
- **Delete every station marked `"sample": true` before launch.** When no sample stations remain, the "Preview data" notice disappears, and real stations are added to the structured data search engines read.

### Live availability

Set `liveStatusUrl` in `stations.json` to an endpoint from your charger management software (CSMS) that returns:

```json
{ "atlanta-peachtree": { "CCS1": 3, "NACS": 1 } }
```

The map fetches it every 60 seconds and updates the free-plug counts. Until it's set, the map shows the `available` numbers from the file.

## Forms

The business and contact forms work without a backend: they open the visitor's email app with the message filled in. To receive submissions directly, create a form endpoint (for example Formspree) and put its URL in `formEndpoint` in `src/site.json`.

## SEO and AEO (answer engines)

Built in on every build:

- A unique title, meta description, canonical URL, and Open Graph/Twitter card on every page
- JSON-LD structured data: Organization, WebSite (with a site search action), BreadcrumbList, FAQPage (generated from the visible FAQ text, so the two always match), and station listings for real stations
- `sitemap.xml`, `robots.txt` (also allows AI crawlers such as GPTBot, ClaudeBot and PerplexityBot), and `llms.txt` (a plain-text summary for AI assistants)
- Question-and-answer page structure, one H1 per page, descriptive image alt text, responsive WebP images, and fonts that don't block rendering

After launch, submit `https://<your-domain>/sitemap.xml` in Google Search Console and Bing Webmaster Tools.

## Preview link (GitHub Pages)

Every push to `main` rebuilds and publishes a preview to GitHub Pages (`.github/workflows/deploy.yml`). The preview is built with `PREVIEW=1`, so search engines are told not to index it. When this becomes the live site on the real domain, remove `PREVIEW` and `BASE_PATH` from the workflow, or host it somewhere else.

## Hosting

Upload the contents of `public/` to any static host: Netlify, Cloudflare Pages, Vercel, or cPanel. On Netlify or Cloudflare Pages, set the build command to `npm run build` and the publish directory to `public`. `public/_headers` sets caching and security headers on those hosts.

The map uses free OpenStreetMap tiles and the Nominatim place search, which is fine for launch-level traffic. For heavy traffic, switch `TILE_URL` and `GEOCODE_URL` at the top of `locations.js` to a paid provider such as MapTiler, Stadia or Mapbox.
