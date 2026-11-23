// RSS 2.0: https://www.rssboard.org/rss-specification
// Scholar PDF locality: https://scholar.google.com/intl/en/scholar/inclusion.html
const xml = value => String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);

export function articlePdfAlias(article) {
  return `/articles/${article.slug}/${article.pdf.split('/').at(-1)}`;
}

export function rssDiscoveryTag(journal) {
  return journal.siteUrl ? `<link rel="alternate" type="application/rss+xml" title="${xml(journal.title)} articles" href="${xml(new URL('/rss.xml', journal.siteUrl).href)}">` : '';
}

export function renderRss(articles, journal) {
  if (!journal.siteUrl) throw new Error('RSS requires the journal origin');
  const home = new URL('/', journal.siteUrl).href;
  const self = new URL('/rss.xml', journal.siteUrl).href;
  const items = articles.map(article => `    <item>
      <title>${xml(article.title)}</title>
      <link>${xml(article.url)}</link>
      <guid isPermaLink="true">${xml(article.url)}</guid>
      <pubDate>${new Date(article.publishedDate + 'T00:00:00Z').toUTCString()}</pubDate>
${article.authors.map(name => `      <dc:creator>${xml(name)}</dc:creator>`).join('\n')}
      <description>${xml(article.abstract)}</description>
${article.keywords.map(keyword => `      <category>${xml(keyword)}</category>`).join('\n')}
      <dc:rights>${xml(article.licenceUrl)}</dc:rights>${article.doi ? `\n      <dc:identifier>https://doi.org/${xml(article.doi)}</dc:identifier>` : ''}
    </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${xml(journal.title)}: ${xml(journal.subtitle)}</title>
    <link>${xml(home)}</link>
    <description>${xml(journal.description)}</description>
    <language>${xml(journal.language)}</language>
    <atom:link href="${xml(self)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}
