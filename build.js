#!/usr/bin/env node
/*
 * BusterElectric static site build.
 * Reads src/, writes a ready-to-host site to public/.
 *   node build.js
 * No dependencies: plain Node 18+.
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'public');

const site = JSON.parse(fs.readFileSync(path.join(SRC, 'site.json'), 'utf8'));
const icons = JSON.parse(fs.readFileSync(path.join(SRC, 'icons.json'), 'utf8'));
const stationData = JSON.parse(fs.readFileSync(path.join(SRC, 'data', 'stations.json'), 'utf8'));
const SITE_URL = site.url.replace(/\/$/, '');
// BASE_PATH: set when the site is served from a sub-folder, e.g. GitHub Pages at /busari-electric-website
const BASE = (process.env.BASE_PATH || '').replace(/\/$/, '');
// PREVIEW=1: draft deploy. Pages get noindex and robots.txt blocks crawlers, so the preview never shows up in Google.
const PREVIEW = process.env.PREVIEW === '1';
const withBase = (html) =>
  BASE ? html.replace(/((?:href|src|action)=")\/(?!\/)/g, '$1' + BASE + '/').replace(/([\s,"])\/assets\//g, '$1' + BASE + '/assets/') : html;
const today = new Date().toISOString().slice(0, 10);

/* ---------- helpers ---------- */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rmrf = (p) => fs.rmSync(p, { recursive: true, force: true });
const mkdirp = (p) => fs.mkdirSync(p, { recursive: true });
function copyDir(from, to) {
  mkdirp(to);
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    e.isDirectory() ? copyDir(a, b) : fs.copyFileSync(a, b);
  }
}
function icon(name, extra = '') {
  if (!icons[name]) throw new Error(`Unknown icon "${name}"`);
  return `<svg class="icon${extra ? ' ' + extra : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${icons[name]}</svg>`;
}
const jsonLd = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

const addr = site.address || {};
const hasAddress = Boolean(addr.street && addr.city);
const vars = {
  'site.name': site.name,
  'site.url': SITE_URL,
  'site.email': site.email,
  'site.phone': site.phone,
  'site.phoneHref': (site.phone || '').replace(/[^+\d]/g, ''),
  'site.tagline': site.tagline,
  'site.address': hasAddress ? `${addr.street}, ${addr.city}, ${addr.region} ${addr.postalCode}` : '',
  'site.formEndpoint': site.formEndpoint || '',
  year: String(new Date().getFullYear()),
};
const partner = site.partner || {};
Object.assign(vars, {
  'site.legalName': site.legalName,
  'site.phoneLabel': site.phoneLabel || 'Phone',
  'site.street': addr.street || '',
  'site.cityLine': hasAddress ? `${addr.city}, ${addr.region} ${addr.postalCode}` : '',
  'site.directions': hasAddress ? 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(`${addr.street}, ${addr.city}, ${addr.region} ${addr.postalCode}`) : '',
  'partner.name': partner.name || '',
  'partner.url': partner.url || '',
  'partner.appIos': partner.appIos || '',
  'partner.appAndroid': partner.appAndroid || '',
});
const realStations = stationData.stations.filter((s) => !s.sample);
const allStations = stationData.stations;
vars['stations.count'] = String(allStations.length);
vars['stations.states'] = String(new Set(allStations.map((s) => s.state)).size);

function render(tpl, ctx) {
  let s = tpl;
  // partials
  s = s.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, n) => render(fs.readFileSync(path.join(SRC, 'partials', n + '.html'), 'utf8'), ctx));
  // conditional blocks: {{#key}}...{{/key}} shown only when value is non-empty
  s = s.replace(/\{\{#([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, k, inner) => ((ctx[k] ?? vars[k]) ? inner : ''));
  s = s.replace(/\{\{icon:([\w-]+)(?:\s+([\w-]+))?\}\}/g, (_, n, cls) => icon(n, cls));
  s = s.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, k) => {
    const v = ctx[k] ?? vars[k];
    if (v === undefined) throw new Error(`Unknown template variable ${m}`);
    return v;
  });
  return s;
}

/* ---------- structured data shared by every page ---------- */
const orgId = SITE_URL + '/#organization';
const organization = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': orgId,
  name: site.name,
  legalName: site.legalName,
  url: SITE_URL + '/',
  logo: SITE_URL + '/assets/img/logo-512.png',
  description: `${site.name} is an EV charging outlet in Arlington, Texas, operating in partnership with station owners, currently ${partner.name}. It also arranges Level 1 and Level 2 home charger installation.`,
  slogan: 'A charger close by and ready, wherever you drive.',
  knowsAbout: ['EV charging', 'DC fast charging', 'Tesla NACS charging', 'CCS1 charging', 'Level 2 home charger installation'],
  areaServed: ['Arlington', 'Grand Prairie', 'Mansfield', 'Pantego', 'Dalworthington Gardens', 'Kennedale', 'Fort Worth', 'Dallas'].map((name) => ({ '@type': 'City', name, containedInPlace: { '@type': 'State', name: 'Texas' } })),
  email: site.email,
  ...(site.phone ? { telephone: site.phone, contactPoint: [{ '@type': 'ContactPoint', telephone: site.phone, contactType: 'customer support', areaServed: 'US', availableLanguage: ['English'] }] } : {}),
  ...(hasAddress ? { address: { '@type': 'PostalAddress', streetAddress: addr.street, addressLocality: addr.city, addressRegion: addr.region, postalCode: addr.postalCode, addressCountry: addr.country || 'US' } } : {}),
  ...(site.social && site.social.length ? { sameAs: site.social } : {}),
};
const website = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': SITE_URL + '/#website',
  url: SITE_URL + '/',
  name: site.name,
  publisher: { '@id': orgId },
  inLanguage: 'en-US',
  potentialAction: {
    '@type': 'SearchAction',
    target: { '@type': 'EntryPoint', urlTemplate: SITE_URL + '/locations/?q={search_term_string}' },
    'query-input': 'required name=search_term_string',
  },
};

/* Real (non-sample) stations become schema.org places so search engines and answer engines can list them. */
function stationSchema(s) {
  const dc = s.connectors.filter((c) => c.level === 'dc');
  return {
    '@type': 'AutomotiveBusiness',
    '@id': `${SITE_URL}/locations/#${s.id}`,
    name: s.name,
    url: `${SITE_URL}/locations/?station=${encodeURIComponent(s.id)}`,
    parentOrganization: { '@id': orgId },
    address: { '@type': 'PostalAddress', streetAddress: s.street, addressLocality: s.city, addressRegion: s.state, postalCode: s.zip, addressCountry: 'US' },
    geo: { '@type': 'GeoCoordinates', latitude: s.lat, longitude: s.lng },
    openingHours: /24/.test(s.hours) ? 'Mo-Su 00:00-23:59' : undefined,
    openingHoursSpecification: /24/.test(s.hours) ? [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], opens: '00:00', closes: '23:59' }] : undefined,
    telephone: site.phone || undefined,
    image: SITE_URL + '/assets/img/og-image.jpg',
    paymentAccepted: 'Credit card, debit card, ' + (s.network || partner.name) + ' app',
    publicAccess: true,
    hasMap: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s.street + ', ' + s.city + ', ' + s.state + ' ' + s.zip),
    description: `EV charging station${s.network ? ' on the ' + s.network + ' network' : ''}: ${s.connectors.map((c) => `${c.type} ${c.level === 'dc' ? 'DC fast' : 'Level 2'}`).join(', ')}.`,
    amenityFeature: [
      ...(dc.length ? [{ '@type': 'LocationFeatureSpecification', name: 'DC fast charging', value: true }] : []),
      ...s.amenities.map((a) => ({ '@type': 'LocationFeatureSpecification', name: a, value: true })),
    ],
  };
}

/* ---------- pages ---------- */
function parsePage(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^<!---\s*([\s\S]*?)\s*--->\s*/);
  if (!m) throw new Error(`${file} is missing its <!--- {front matter} ---> header`);
  return { meta: JSON.parse(m[1]), body: raw.slice(m[0].length) };
}

const pageFiles = fs.readdirSync(path.join(SRC, 'pages')).filter((f) => f.endsWith('.html'));

/* ---------- blog ---------- */
// Each post is src/posts/<slug>.html with a front matter block: title, headline, description, date, image, imageAlt, minutes.
const postDir = path.join(SRC, 'posts');
const posts = (fs.existsSync(postDir) ? fs.readdirSync(postDir).filter((f) => f.endsWith('.html')) : [])
  .map((f) => ({ slug: f.replace(/\.html$/, ''), ...parsePage(path.join(postDir, f)) }))
  .sort((a, b) => (b.meta.pin ? 1 : 0) - (a.meta.pin ? 1 : 0) || b.meta.date.localeCompare(a.meta.date) || a.slug.localeCompare(b.slug));
const fmtDate = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
const postImg = (m, sizes) => `<img src="/assets/img/${m.image}-800.webp" srcset="/assets/img/${m.image}-800.webp 800w, /assets/img/${m.image}-1600.webp 1600w" sizes="${sizes}" width="800" height="533" loading="lazy" alt="${esc(m.imageAlt)}">`;
const postCard = (pp) => `<li class="post-card"><a href="/blog/${pp.slug}/">${postImg(pp.meta, '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw')}<div class="post-card-body"><h2>${esc(pp.meta.headline || pp.meta.title)}</h2><p>${esc(pp.meta.description)}</p><span class="post-card-meta"><time datetime="${pp.meta.date}">${fmtDate(pp.meta.date)}</time>, ${pp.meta.minutes} min read</span></div></a></li>`;
vars['blog.list'] = posts.map(postCard).join('\n');
vars['blog.latest'] = posts.slice(0, 3).map(postCard).join('\n');

const pageList = [
  ...pageFiles.map((f) => ({ f, ...parsePage(path.join(SRC, 'pages', f)) })),
  ...posts.map((pp) => {
    const m = pp.meta;
    const related = posts.filter((o) => o.slug !== pp.slug).slice(0, 3).map(postCard).join('\n');
    const body = `<article class="post">
  <header class="page-intro post-intro">
    <div class="wrap post-wrap">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/blog/">Blog</a> / <span aria-current="page">${esc(m.headline || m.title)}</span></nav>
      <h1>${esc(m.headline || m.title)}</h1>
      <p class="post-meta">By the {{site.name}} team. <time datetime="${m.date}">${fmtDate(m.date)}</time>. ${m.minutes} min read.</p>
    </div>
  </header>
  <div class="wrap post-wrap post-body">
    <figure class="post-hero">${postImg(m, '(min-width: 860px) 780px, 100vw').replace(' loading="lazy"', ' fetchpriority="high"')}</figure>
${pp.body.trim()}
    <aside class="post-cta">
      <h2>Charge with us in Arlington</h2>
      <p>{{site.street}}, {{site.cityLine}}. Open 24 hours, with CCS1 and NACS (Tesla) plugs.</p>
      <div class="cta-actions"><a class="btn btn-primary" href="{{site.directions}}" target="_blank" rel="noopener">{{icon:navigation}}Get directions</a><a class="btn btn-outline" href="/locations/">See it on the map</a></div>
    </aside>
  </div>
</article>
${related ? `<section class="section section-white" aria-labelledby="more-title"><div class="wrap"><h2 id="more-title">More from the blog</h2><ul class="post-grid">${related}</ul></div></section>` : ''}`;
    return { f: 'post:' + pp.slug, meta: { ...m, path: `/blog/${pp.slug}/`, nav: 'blog', crumbParent: { name: 'Blog', path: '/blog/' }, breadcrumb: m.headline || m.title, post: true, priority: 0.7 }, body };
  }),
];
const sitemapUrls = [];

rmrf(OUT);
mkdirp(OUT);

for (const { f, meta, body } of pageList) {
  meta.title = render(meta.title, {});
  meta.description = render(meta.description, {});
  const pagePath = meta.path; // e.g. "/" or "/locations/"
  const canonical = SITE_URL + pagePath;
  const ogImage = SITE_URL + (meta.ogImage || (meta.post ? '/assets/img/' + meta.image + '-1600.webp' : '/assets/img/og-image.jpg'));
  const ctx = {
    'page.title': esc(meta.title),
    'page.description': esc(meta.description),
    'page.canonical': canonical,
    'page.ogImage': ogImage,
    'page.ogType': pagePath === '/' ? 'website' : 'article',
    'page.robots': meta.noindex || PREVIEW ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1',
    'page.head': meta.head || '',
    'page.scripts': (meta.scripts || []).map((s) => (s.startsWith('http') ? `<script src="${s}" defer crossorigin="anonymous"></script>` : `<script src="${s}" defer></script>`)).join('\n'),
    'page.styles': (meta.styles || []).map((s) => `<link rel="stylesheet" href="${s}"${s.startsWith('http') ? ' crossorigin="anonymous"' : ''}>`).join('\n'),
    'page.bodyClass': meta.bodyClass || '',
  };
  for (const n of ['home', 'locations', 'pricing', 'business', 'homeCharging', 'about', 'blog', 'contact']) ctx['nav.' + n] = meta.nav === n ? ' aria-current="page"' : '';

  // structured data
  const schemas = [organization, website];
  if (pagePath !== '/' && !meta.noindex) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL + '/' },
        ...(meta.crumbParent ? [{ '@type': 'ListItem', position: 2, name: meta.crumbParent.name, item: SITE_URL + meta.crumbParent.path }] : []),
        { '@type': 'ListItem', position: meta.crumbParent ? 3 : 2, name: meta.breadcrumb || meta.title, item: canonical },
      ],
    });
  }
  schemas.push({
    '@context': 'https://schema.org',
    '@type': meta.schemaType || 'WebPage',
    '@id': canonical + '#webpage',
    url: canonical,
    name: meta.title,
    description: meta.description,
    isPartOf: { '@id': SITE_URL + '/#website' },
    about: { '@id': orgId },
    inLanguage: 'en-US',
    dateModified: meta.updated || meta.date || today,
    primaryImageOfPage: ogImage,
  });
  if (meta.post) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      '@id': canonical + '#article',
      mainEntityOfPage: { '@id': canonical + '#webpage' },
      headline: meta.headline || meta.title,
      description: meta.description,
      image: [SITE_URL + '/assets/img/' + meta.image + '-1600.webp'],
      datePublished: meta.date,
      dateModified: meta.updated || meta.date,
      author: { '@id': orgId },
      publisher: { '@id': orgId },
      inLanguage: 'en-US',
      ...(meta.keywords ? { keywords: meta.keywords } : {}),
    });
  }
  if (meta.faqFromPage) {
    // Build FAQPage schema from the page's own <details class="faq"> markup so the visible text and schema always match.
    const rendered = render(body, ctx);
    const qa = [...rendered.matchAll(/<details class="faq[^"]*"[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>\s*<div class="faq-a">([\s\S]*?)<\/div>\s*<\/details>/g)];
    const strip = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: qa.map(([, q, a]) => ({ '@type': 'Question', name: strip(q), acceptedAnswer: { '@type': 'Answer', text: strip(a) } })),
    });
  }
  if (meta.stationsSchema && realStations.length) {
    schemas.push({ '@context': 'https://schema.org', '@type': 'ItemList', name: `${site.name} charging stations`, itemListElement: realStations.map((s, i) => ({ '@type': 'ListItem', position: i + 1, item: stationSchema(s) })) });
  }
  if (meta.schema) schemas.push(...meta.schema);
  ctx['page.schema'] = schemas.map(jsonLd).join('\n');

  const html = withBase(
    render(fs.readFileSync(path.join(SRC, 'partials', 'layout.html'), 'utf8').replace('{{content}}', body), ctx).replace('<html lang="en-US">', `<html lang="en-US" data-base="${BASE}">`)
  );
  const dest = pagePath === '/' ? path.join(OUT, 'index.html') : f === '404.html' ? path.join(OUT, '404.html') : path.join(OUT, pagePath, 'index.html');
  mkdirp(path.dirname(dest));
  fs.writeFileSync(dest, html);
  if (!meta.noindex) sitemapUrls.push({ loc: canonical, priority: meta.priority || 0.7, lastmod: meta.updated || meta.date || today });
  console.log('page', pagePath, '->', path.relative(ROOT, dest));
}

/* ---------- assets ---------- */
copyDir(path.join(SRC, 'assets'), path.join(OUT, 'assets'));
mkdirp(path.join(OUT, 'assets', 'data'));
fs.writeFileSync(path.join(OUT, 'assets', 'data', 'stations.json'), JSON.stringify({ liveStatusUrl: stationData.liveStatusUrl || '', stations: stationData.stations }));
fs.writeFileSync(path.join(OUT, 'assets', 'data', 'site.json'), JSON.stringify({ name: site.name, email: site.email, formEndpoint: site.formEndpoint || '' }));

/* ---------- crawler files: sitemap, robots, llms.txt ---------- */
fs.writeFileSync(
  path.join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    sitemapUrls.sort((a, b) => b.priority - a.priority).map((u) => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod><priority>${u.priority}</priority></url>`).join('\n') +
    `\n</urlset>\n`
);
const rssEsc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
fs.writeFileSync(
  path.join(OUT, 'blog', 'feed.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${rssEsc(site.name)} Blog</title><link>${SITE_URL}/blog/</link><description>EV charging guides from ${rssEsc(site.name)} in Arlington, Texas.</description><language>en-us</language>\n` +
    posts.map((pp) => `<item><title>${rssEsc(pp.meta.headline || pp.meta.title)}</title><link>${SITE_URL}/blog/${pp.slug}/</link><guid>${SITE_URL}/blog/${pp.slug}/</guid><pubDate>${new Date(pp.meta.date + 'T12:00:00Z').toUTCString()}</pubDate><description>${rssEsc(pp.meta.description)}</description></item>`).join('\n') +
    `\n</channel></rss>\n`
);
fs.writeFileSync(
  path.join(OUT, 'robots.txt'),
  PREVIEW ? `# Preview deploy: not for search engines.\nUser-agent: *\nDisallow: /\n` : `# Search engines and AI answer engines are welcome to read this site.\nUser-agent: *\nAllow: /\n\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: OAI-SearchBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nUser-agent: Claude-SearchBot\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n\nUser-agent: Google-Extended\nAllow: /\n\nUser-agent: Applebot-Extended\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`
);
const llms = `# ${site.name}

> ${site.name} (${site.legalName}) is an electric vehicle (EV) charging outlet in Arlington, Texas. It works in partnership with charging station owners, currently ${partner.name}. Drivers charge and pay through ${partner.name}.

## Key facts
- Station: ${vars['site.address']}
- Hours: open 24 hours, 7 days a week
- Cars: any EV with a CCS1 or NACS (Tesla) port, including Tesla, Ford, Chevrolet, Cadillac, GMC, Hyundai, Kia, Genesis, BMW, Mercedes-Benz, Audi, Volkswagen, Porsche, Nissan (Ariya), Toyota, Lexus, Honda, Acura, Volvo, Polestar, Rivian, Lucid, MINI, Subaru, Mazda, Jeep, Fiat, Chrysler and Ram
- Pricing: standard ${partner.name} rates, no extra fees; shown in the ${partner.name} app and on the charger screen
- Payment: the ${partner.name} app (iPhone: ${partner.appIos}, Android: ${partner.appAndroid}), or a credit/debit card at the charger
- Home charging: ${site.name} arranges Level 1 and Level 2 home charger installation on request
- Fleets and businesses can arrange to charge company vehicles at the station
- Charger support: ${site.phone} (${partner.name})
- Vision: a future where no driver has to worry about where to charge
- Mission: make charging easy for every electric vehicle, starting in Arlington, Texas
- Email: ${site.email}

## Pages
- [Find the station](${SITE_URL}/locations/): map, address and directions
- [Pricing and payment](${SITE_URL}/pricing/)
- [Home charging](${SITE_URL}/home-charging/): request a Level 1 or Level 2 installation
- [For business](${SITE_URL}/business/): fleet and company charging
- [About](${SITE_URL}/about/)
- [Blog](${SITE_URL}/blog/): EV charging guides
${posts.map((pp) => `- [${pp.meta.headline || pp.meta.title}](${SITE_URL}/blog/${pp.slug}/): ${pp.meta.description}`).join('\n')}
- [Contact](${SITE_URL}/contact/)
`;
fs.writeFileSync(path.join(OUT, 'llms.txt'), llms);

/* ---------- favicon, manifest, host config ---------- */
const mark = (size) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}"><rect width="64" height="64" rx="14" fill="#111813"/><rect x="4" y="4" width="56" height="56" rx="10" fill="none" stroke="#39FF14" stroke-width="3"/><path d="M36 10 18 36h12l-4 18 20-28H34z" fill="#39FF14"/></svg>`;
fs.writeFileSync(path.join(OUT, 'favicon.svg'), mark(64));
fs.writeFileSync(
  path.join(OUT, 'site.webmanifest'),
  JSON.stringify({ name: site.name, short_name: 'BusterElectric', start_url: BASE + '/', display: 'standalone', background_color: '#F4F6F4', theme_color: '#111813', icons: [{ src: BASE + '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }, { src: BASE + '/assets/img/logo-512.png', sizes: '512x512', type: 'image/png' }] }, null, 2)
);
// Netlify / Cloudflare Pages headers: long cache for assets, security headers everywhere.
fs.writeFileSync(
  path.join(OUT, '_headers'),
  `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: geolocation=(self), camera=(), microphone=()\n  X-Frame-Options: SAMEORIGIN\n\n/assets/img/*\n  Cache-Control: public, max-age=31536000, immutable\n`
);
console.log(`\nBuilt ${sitemapUrls.length} indexable pages into public/. ${realStations.length} stations.`);
