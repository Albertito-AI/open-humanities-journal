import { readFile, writeFile, mkdir, readdir, lstat, realpath, stat, rm, rename, mkdtemp } from 'node:fs/promises';
import { resolve, join, relative, dirname, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const LICENCES = {
  'CC-BY-4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'CC-BY-NC-ND-4.0': 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
  'CC-BY-SA-4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
};
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ASSET_EXTENSIONS = new Set(['.pdf', '.txt', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.woff', '.woff2']);

function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`); return value; }
function text(value, label, max = 10000) { if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label} must be a non-empty string of at most ${max} characters`); return value.trim(); }
function slug(value, label) { const s = text(value, label, 100); if (!SLUG.test(s)) throw new Error(`${label} must contain lowercase words separated by hyphens`); return s; }
function date(value, label) { const s = text(value, label, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0, 10) !== s) throw new Error(`${label} must be a real YYYY-MM-DD date`); return s; }
function url(value, label, originOnly = false) { const s = text(value, label, 2048); let u; try { u = new URL(s); } catch { throw new Error(`${label} must be a valid HTTPS URL`); } if (u.protocol !== 'https:' || u.username || u.password || (originOnly && (u.pathname !== '/' || u.search || u.hash))) throw new Error(`${label} must be an HTTPS ${originOnly ? 'origin' : 'URL'} without credentials`); return originOnly ? u.origin : s; }
function strings(value, label, min = 0, max = 30) { if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error(`${label} must be an array of ${min} to ${max} strings`); return value.map(v => text(v, label, 300)); }
function optionalText(value, label, max = 1000) { return value == null || value === '' ? null : text(value, label, max); }
function within(parent, child) { return child === parent || child.startsWith(parent + sep); }
function absolute(journal, path) { return journal.siteUrl ? new URL(path, journal.siteUrl).href : path; }

export function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
export function safeJsonLd(value) { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); }

export function validateJournal(input) {
  const j = object(input, 'Journal');
  let issn = null;
  if (j.issn != null && j.issn !== '') {
    issn = text(j.issn, 'ISSN', 9);
    if (!/^\d{4}-\d{3}[\dX]$/.test(issn)) throw new Error('ISSN format is invalid');
    const chars = issn.replace('-', '').split('');
    if (chars.reduce((sum, char, i) => sum + (char === 'X' ? 10 : Number(char)) * (8 - i), 0) % 11 !== 0) throw new Error('ISSN check digit is invalid');
  }
  const submissionEmail = optionalText(j.submissionEmail, 'Submission email', 254);
  if (submissionEmail && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(submissionEmail)) throw new Error('Submission email is invalid');
  const journal = {
    title: text(j.title, 'Journal title', 200), subtitle: text(j.subtitle, 'Journal subtitle', 300),
    description: text(j.description, 'Journal description', 5000), founder: text(j.founder, 'Founder', 200),
    editorInChief: optionalText(j.editorInChief, 'Editor-in-Chief', 200), president: optionalText(j.president, 'President', 200), publisher: optionalText(j.publisher, 'Publisher', 200),
    officialWebsite: url(j.officialWebsite, 'Official website'), sourceCode: url(j.sourceCode, 'Source repository'),
    siteUrl: j.siteUrl == null || j.siteUrl === '' ? null : url(j.siteUrl, 'Site URL', true),
    intendedDomain: url(j.intendedDomain, 'Intended domain', true), submissionEmail, issn,
    language: text(j.language, 'Language', 30), stage: text(j.stage, 'Stage', 30), robotsIndex: j.robotsIndex === true,
    submissionMethod: 'email',
  };
  if (journal.robotsIndex && journal.siteUrl !== journal.intendedDomain) throw new Error('Enable indexing only after siteUrl matches the connected intended domain');
  return journal;
}

export function validateIssue(input) {
  const i = object(input, 'Issue');
  const year = Number(i.year);
  if (!Number.isInteger(year) || year < 1900 || year > 9999) throw new Error('Issue year is invalid');
  const issueSlug = slug(i.slug, 'Issue slug');
  const asset = (value, extension, label) => {
    if (value == null) return null;
    const path = text(value, label, 500);
    if (!new RegExp(`^/issues/${issueSlug}/[a-zA-Z0-9][a-zA-Z0-9_-]*\\.${extension}$`).test(path)) throw new Error(`${label} must be a safe issue-local path`);
    return path;
  };
  return { slug: issueSlug, title: text(i.title, 'Issue title', 300), volume: i.volume == null ? null : optionalText(String(i.volume), 'Volume', 30), number: text(String(i.number ?? ''), 'Issue number', 30), year, publishedDate: date(i.publishedDate, 'Issue publication date'), pdf: asset(i.pdf, 'pdf', 'Issue PDF'), cover: asset(i.cover, '(?:jpg|jpeg|png|webp)', 'Issue cover'), description: optionalText(i.description, 'Issue description', 2000), pages: optionalText(i.pages, 'Issue pages', 100) };
}

export function validateOrcid(value) {
  if (value == null) return null;
  const id = text(value, 'ORCID', 19);
  if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(id)) throw new Error('ORCID format is invalid');
  const digits = id.replaceAll('-', '');
  let total = 0;
  for (const char of digits.slice(0, 15)) total = (total + Number(char)) * 2;
  const check = (12 - total % 11) % 11;
  if (digits[15] !== (check === 10 ? 'X' : String(check))) throw new Error('ORCID check digit is invalid');
  return id;
}

export async function validateArticle(input, { issues, publicDir }) {
  const a = object(input, 'Article');
  const issueSlug = slug(a.issueSlug, 'Article issue slug');
  if (!issues.has(issueSlug)) throw new Error(`Article references unknown issue: ${issueSlug}`);
  const pdf = text(a.pdf, 'Article PDF path', 500);
  if (!/^\/articles\/[a-zA-Z0-9][a-zA-Z0-9._/-]*\.pdf$/i.test(pdf) || pdf.split('/').some(segment => segment === '.' || segment === '..' || segment.startsWith('.'))) throw new Error('PDF path must be a safe /articles/name.pdf path');
  const publicRoot = resolve(publicDir), localPdf = resolve(publicRoot, '.' + pdf);
  if (!within(publicRoot, localPdf)) throw new Error('PDF path leaves public directory');
  let pdfStat;
  try { pdfStat = await lstat(localPdf); } catch { throw new Error(`Referenced PDF does not exist: ${pdf}`); }
  if (pdfStat.isSymbolicLink() || !pdfStat.isFile()) throw new Error('PDF must be a regular file, not a symbolic link');
  const realRoot = await realpath(publicRoot), realPdf = await realpath(localPdf);
  if (!within(realRoot, realPdf)) throw new Error('PDF path resolves outside public directory');
  let parent = dirname(localPdf);
  while (within(publicRoot, parent)) { if ((await lstat(parent)).isSymbolicLink()) throw new Error('PDF path includes a symbolic-link directory'); if (parent === publicRoot) break; parent = dirname(parent); }
  if (pdfStat.size < 5 || pdfStat.size > 100 * 1024 * 1024) throw new Error('PDF must be non-empty and at most 100 MB');
  const bytes = await readFile(localPdf);
  if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Referenced file lacks a PDF signature');
  const licence = text(a.licence, 'Article licence', 30);
  if (!Object.hasOwn(LICENCES, licence)) throw new Error('Article licence must be CC-BY-4.0, CC-BY-SA-4.0 or CC-BY-NC-ND-4.0');
  const doi = optionalText(a.doi, 'DOI', 300);
  if (doi && !/^10\.\d{4,9}\/[^\s]+$/.test(doi)) throw new Error('DOI must be the assigned identifier beginning 10., not a URL');
  const authors = strings(a.authors, 'Authors', 1, 50);
  const orcids = a.orcids == null ? authors.map(() => null) : a.orcids;
  if (!Array.isArray(orcids) || orcids.length !== authors.length) throw new Error('ORCID list must match the author list');
  return {
    slug: slug(a.slug, 'Article slug'), title: text(a.title, 'Article title', 1000), authors, orcids: orcids.map(validateOrcid),
    abstract: text(a.abstract, 'Abstract', 30000), keywords: strings(a.keywords, 'Keywords', 0, 30),
    pdf, publishedDate: date(a.publishedDate, 'Article publication date'), licence, licenceUrl: LICENCES[licence],
    issueSlug, pages: text(String(a.pages ?? ''), 'Pages or article number', 100), doi,
  };
}

function oneLine(value) { return String(value).replace(/[\r\n\u0000-\u001f\u007f]+/g, ' ').trim(); }
function bibEscape(value) { const replacements = { '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '%': '\\%', '&': '\\&', '#': '\\#', '_': '\\_', '$': '\\$', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}' }; return oneLine(value).replace(/[\\{}%&#_$~^]/g, c => replacements[c]); }
export function bibtex(article, issue, journal) {
  const fields = { title: article.title, author: article.authors.join(' and '), journal: `${journal.title}: ${journal.subtitle}`, ...(issue.volume ? { volume: issue.volume } : {}), number: issue.number, year: article.publishedDate.slice(0, 4), pages: article.pages, url: article.url, ...(article.doi ? { doi: article.doi } : {}) };
  return `@article{thq_${article.slug},\n${Object.entries(fields).map(([key, value]) => `  ${key} = {${bibEscape(value)}}`).join(',\n')}\n}\n`;
}
export function ris(article, issue, journal) {
  const range = oneLine(article.pages).split(/[–-]/);
  return ['TY  - JOUR', `TI  - ${oneLine(article.title)}`, ...article.authors.map(name => `AU  - ${oneLine(name)}`), `JO  - ${oneLine(`${journal.title}: ${journal.subtitle}`)}`, ...(issue.volume ? [`VL  - ${oneLine(issue.volume)}`] : []), `IS  - ${oneLine(issue.number)}`, `PY  - ${article.publishedDate.slice(0, 4)}`, `SP  - ${range[0]}`, ...(range[1] ? [`EP  - ${range[1]}`] : []), `AB  - ${oneLine(article.abstract)}`, ...article.keywords.map(k => `KW  - ${oneLine(k)}`), `UR  - ${oneLine(article.url)}`, ...(article.doi ? [`DO  - ${oneLine(article.doi)}`] : []), 'ER  -', ''].join('\r\n');
}

export function articleJsonLd(article, issue, journal) {
  const periodical = { '@type': 'Periodical', name: `${journal.title}: ${journal.subtitle}`, ...(journal.issn ? { issn: journal.issn } : {}) };
  return { '@context': 'https://schema.org', '@type': 'ScholarlyArticle', '@id': article.url, url: article.url, headline: article.title, abstract: article.abstract, author: article.authors.map((name, index) => ({ '@type': 'Person', name, ...(article.orcids?.[index] ? { sameAs: `https://orcid.org/${article.orcids[index]}` } : {}) })), datePublished: article.publishedDate, keywords: article.keywords, inLanguage: journal.language, isAccessibleForFree: true, license: article.licenceUrl, pagination: article.pages, ...(journal.publisher ? { publisher: { '@type': 'Organization', name: journal.publisher } } : {}), ...(article.doi ? { identifier: { '@type': 'PropertyValue', propertyID: 'DOI', value: article.doi }, sameAs: `https://doi.org/${article.doi}` } : {}), isPartOf: { '@type': 'PublicationIssue', issueNumber: issue.number, datePublished: issue.publishedDate, url: absolute(journal, `/issues/${issue.slug}/`), isPartOf: issue.volume ? { '@type': 'PublicationVolume', volumeNumber: issue.volume, isPartOf: periodical } : periodical }, encoding: { '@type': 'MediaObject', encodingFormat: 'application/pdf', contentUrl: article.pdfUrl } };
}

export function renderArticle(article, issue, journal) {
  const e = escapeHtml;
  const meta = (name, value) => `<meta name="${e(name)}" content="${e(value)}">`;
  const range = article.pages.split(/[–-]/);
  const authorMarkup = article.authors.map((name, index) => `<div><span>${e(name)}</span>${article.orcids?.[index] ? `<a class="author-orcid" href="https://orcid.org/${e(article.orcids[index])}">ORCID ${e(article.orcids[index])}</a>` : ''}</div>`).join('');
  return `<!doctype html>\n<html lang="${e(journal.language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(article.title)} | ${e(journal.title)}</title><meta name="description" content="${e(article.abstract.slice(0, 240))}">${journal.robotsIndex ? '' : '<meta name="robots" content="noindex, nofollow">'}${journal.siteUrl ? `<link rel="canonical" href="${e(article.url)}">` : ''}<meta property="og:type" content="article"><meta property="og:title" content="${e(article.title)}"><meta property="og:description" content="${e(article.abstract.slice(0, 240))}"><meta property="og:url" content="${e(article.url)}">${issue.cover ? `<meta property="og:image" content="${e(absolute(journal, issue.cover))}">` : ''}<link rel="stylesheet" href="/styles.css">${meta('citation_title', article.title)}${article.authors.map(author => meta('citation_author', author)).join('')}${meta('citation_journal_title', `${journal.title}: ${journal.subtitle}`)}${meta('citation_publication_date', article.publishedDate.replaceAll('-', '/'))}${issue.volume ? meta('citation_volume', issue.volume) : ''}${meta('citation_issue', issue.number)}${meta('citation_firstpage', range[0])}${range[1] ? meta('citation_lastpage', range[1]) : ''}${meta('citation_pdf_url', article.pdfUrl)}${article.doi ? meta('citation_doi', article.doi) : ''}${journal.issn ? meta('citation_issn', journal.issn) : ''}<script type="application/ld+json">${safeJsonLd(articleJsonLd(article, issue, journal))}</script></head>
<body><main class="article-landing"><a href="/">← ${e(journal.title)}</a><p class="article-kicker">Open-access research article · <a href="/issues/${e(issue.slug)}/">${e(issue.title)}</a></p><h1 class="article-title">${e(article.title)}</h1><div class="article-authors article-author-list">${authorMarkup}</div><p>Published <time datetime="${e(article.publishedDate)}">${e(article.publishedDate)}</time> · Pages ${e(article.pages)}</p><p><a rel="license" href="${e(article.licenceUrl)}">${e(article.licence)}</a>${article.doi ? ` · DOI: <a href="${e(`https://doi.org/${article.doi}`)}">${e(article.doi)}</a>` : ''}</p><nav aria-label="Article downloads" class="article-downloads"><a href="${e(article.pdfPath)}" download>Download article PDF</a><a href="${e(article.citations.bibtex)}" download>BibTeX citation</a><a href="${e(article.citations.ris)}" download>RIS citation</a><a href="${e(article.citations.jsonld)}" download>Metadata (JSON-LD)</a></nav><section class="article-abstract"><h2>Abstract</h2><p class="article-abstract-text">${e(article.abstract)}</p></section>${article.keywords.length ? `<p><strong>Keywords:</strong> ${article.keywords.map(e).join('; ')}</p>` : ''}<p><a href="/issues/${e(issue.slug)}/">Read the complete issue</a> · <a href="/#archive">Browse the archive</a></p><footer class="article-footer"><p>${e(journal.title)}: ${e(journal.subtitle)}</p><p>${e(journal.publisher ?? journal.title)} · <a href="mailto:${e(journal.submissionEmail ?? '')}">Contact the editor</a></p></footer></main></body></html>\n`;
}

export function renderIssue(issue, articles, journal) {
  const e = escapeHtml, issueUrl = absolute(journal, `/issues/${issue.slug}/`);
  const cards = articles.map(a => `<li><div><h2><a href="${e(a.href)}">${e(a.title)}</a></h2><p>${a.authors.map(e).join(' · ')}</p><div class="issue-item-links"><a href="${e(a.href)}">Abstract and citation</a><a href="${e(a.pdfPath)}" download>Article PDF</a></div></div><span class="issue-pages">${e(a.pages)}</span></li>`).join('');
  return `<!doctype html><html lang="${e(journal.language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(issue.title)} | ${e(journal.title)}</title>${journal.robotsIndex ? '' : '<meta name="robots" content="noindex, nofollow">'}<meta name="description" content="${e(issue.description ?? issue.title)}"><link rel="canonical" href="${e(issueUrl)}"><meta property="og:type" content="website"><meta property="og:title" content="${e(journal.title)} · ${e(issue.title)}"><meta property="og:description" content="${e(issue.description ?? issue.title)}"><meta property="og:url" content="${e(issueUrl)}">${issue.cover ? `<meta property="og:image" content="${e(absolute(journal, issue.cover))}"><meta property="og:image:alt" content="${e(journal.title)} ${e(issue.title)} cover">` : ''}<meta name="twitter:card" content="summary_large_image"><link rel="stylesheet" href="/styles.css"></head><body class="issue-page"><header class="issue-masthead"><a href="/">The Human Question<span>A Journal of Humanistic Inquiry</span></a><nav aria-label="Issue navigation"><a href="/#archive">Archive</a><a href="/call-for-papers/">For contributors</a></nav></header><main class="issue-main"><section class="issue-opening"><div><p class="eyebrow">The founding issue · Open access</p><h1>${e(issue.title)}</h1><p class="issue-intro">${e(issue.description ?? '')}</p><p class="issue-date">Published <time datetime="${e(issue.publishedDate)}">${e(new Date(issue.publishedDate + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }))}</time>${issue.pages ? ` · pp. ${e(issue.pages)}` : ''}</p>${issue.pdf ? `<a class="button button-primary" href="${e(issue.pdf)}" download>Download the complete issue <span aria-hidden="true">↓</span></a>` : ''}<p class="small-print">Free to read and share under the articles’ stated licence.</p></div>${issue.cover ? `<a href="${e(issue.pdf ?? '#contents')}" aria-label="Read the complete issue"><img class="published-issue-cover" src="${e(issue.cover)}" alt="${e(journal.title)} ${e(issue.title)}: abstract green cover with a terracotta accent" width="893" height="1263"></a>` : ''}</section><section id="contents" class="issue-contents"><p class="eyebrow">Contents</p><ol>${cards}</ol></section><aside class="issue-invitation"><p class="eyebrow">Continue the inquiry</p><h2>Read, share and contribute.</h2><p>We welcome original scholarship on what ideas, institutions and discoveries mean for human life. Submissions are considered on a rolling basis.</p><a class="text-button" href="/call-for-papers/">Read the call for papers →</a></aside></main><footer class="cfp-footer"><a href="/">The Human Question</a><p>An open-access journal of the future</p><a href="/#policies">Editorial policies</a></footer></body></html>\n`;
}

async function publicAssets(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) throw new Error(`Hidden public asset is not allowed: ${entry.name}`);
    const pathname = join(directory, entry.name), relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const info = await lstat(pathname);
    if (info.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in public assets: ${relativePath}`);
    if (info.isDirectory()) files.push(...await publicAssets(pathname, relativePath));
    else if (info.isFile()) { if (!ASSET_EXTENSIONS.has(extname(entry.name).toLowerCase())) throw new Error(`Unsupported public asset extension: ${relativePath}`); files.push({ source: pathname, path: relativePath }); }
    else throw new Error(`Unsupported public asset type: ${relativePath}`);
  }
  return files;
}
async function write(directory, path, contents) { const target = join(directory, path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, contents); }
async function allFiles(directory, prefix = '') { const result = []; for (const item of await readdir(directory, { withFileTypes: true })) { const path = prefix ? `${prefix}/${item.name}` : item.name; if (item.isDirectory()) result.push(...await allFiles(join(directory, item.name), path)); else result.push(path); } return result.sort(); }
async function jsonFile(path) { return JSON.parse(await readFile(path, 'utf8')); }

export async function buildProject({ rootDir = process.cwd() } = {}) {
  const root = resolve(rootDir), publicDir = join(root, 'public');
  const journal = validateJournal(await jsonFile(join(root, 'content/journal.json')));
  const rawIssues = await jsonFile(join(root, 'content/issues.json')), rawArticles = await jsonFile(join(root, 'content/articles.json'));
  if (!Array.isArray(rawIssues) || !Array.isArray(rawArticles)) throw new Error('Issues and articles must be JSON arrays');
  const issues = rawIssues.map(validateIssue), issueSlugs = new Set(issues.map(issue => issue.slug));
  if (issueSlugs.size !== issues.length) throw new Error('Duplicate issue slug');
  const articles = [];
  for (const value of rawArticles) {
    const article = await validateArticle(value, { issues: issueSlugs, publicDir });
    const href = `/articles/${article.slug}/`;
    articles.push({ ...article, href, url: absolute(journal, href), pdfPath: article.pdf, pdfUrl: absolute(journal, article.pdf), citations: { bibtex: `/articles/${article.slug}.bib`, ris: `/articles/${article.slug}.ris`, jsonld: `/articles/${article.slug}.json` } });
  }
  if (new Set(articles.map(article => article.slug)).size !== articles.length) throw new Error('Duplicate article slug');
  if (new Set(articles.map(article => article.pdf)).size !== articles.length) throw new Error('Two articles must not refer to the same PDF');
  articles.sort((a, b) => b.publishedDate.localeCompare(a.publishedDate) || a.issueSlug.localeCompare(b.issueSlug) || (parseInt(a.pages, 10) || 0) - (parseInt(b.pages, 10) || 0) || a.slug.localeCompare(b.slug));
  issues.sort((a, b) => b.publishedDate.localeCompare(a.publishedDate) || a.slug.localeCompare(b.slug));
  await mkdir(publicDir, { recursive: true });
  const assets = await publicAssets(publicDir);
  for (const issue of issues) {
    for (const path of [issue.pdf, issue.cover].filter(Boolean)) {
      const asset = assets.find(a => a.path === path.slice(1));
      if (!asset) throw new Error(`Referenced issue asset does not exist: ${path}`);
      if (path.endsWith('.pdf') && !(await readFile(asset.source)).subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Issue file lacks a PDF signature');
    }
  }
  const publishedPdfs = new Set(articles.map(article => article.pdf.slice(1)));
  for (const asset of assets) if (asset.path.startsWith('articles/') && !publishedPdfs.has(asset.path)) throw new Error(`Unreferenced file under public/articles would be exposed: ${asset.path}`);
  const sources = Object.fromEntries(await Promise.all(['index.html', 'styles.css', 'main.js'].map(async name => [name, await readFile(join(root, 'src', name))])));
  const cfpSource = await readFile(join(root, 'src/call-for-papers.html'), 'utf8').catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  const reserved = new Set(['call-for-papers/index.html', 'index.html', 'styles.css', 'main.js', 'catalogue.json', 'journal.json', 'llms.txt', 'robots.txt', 'sitemap.xml', 'export-manifest.json', '_headers']);
  for (const asset of assets) if (reserved.has(asset.path) || /^(?:styles|main)\.[a-f0-9]{12}\.(?:css|js)$/.test(asset.path) || articles.some(a => asset.path === `articles/${a.slug}/index.html` || asset.path === `articles/${a.slug}.json` || asset.path === `articles/${a.slug}.ris` || asset.path === `articles/${a.slug}.bib`)) throw new Error(`Public asset conflicts with a generated file: ${asset.path}`);
  const staging = await mkdtemp(join(root, '.static-build-'));
  try {
    // Version browser assets by their bytes so an earlier cached script cannot
    // leave newly published navigation routes inaccessible.
    let homeHtml = sources['index.html'].toString('utf8');
    let cfpHtml = cfpSource;
    if (cfpHtml !== null) {
      const cfpUrl = escapeHtml(absolute(journal, '/call-for-papers/'));
      const metadata = (journal.siteUrl ? `<link rel="canonical" href="${cfpUrl}">\n  <meta property="og:url" content="${cfpUrl}">` : '') + (journal.robotsIndex ? '' : '\n  <meta name="robots" content="noindex, nofollow">');
      cfpHtml = cfpHtml.replaceAll('{{PAGE_METADATA}}', metadata).replaceAll('{{LOGO_URL}}', escapeHtml(absolute(journal, '/brand/The_Human_Question_Logo.png')));
    }
    for (const name of ['styles.css', 'main.js']) {
      const digest = createHash('sha256').update(sources[name]).digest('hex').slice(0, 12);
      const versioned = name.replace('.', `.${digest}.`);
      homeHtml = homeHtml.replaceAll(`"/${name}"`, `"/${versioned}"`);
      if (cfpHtml !== null) cfpHtml = cfpHtml.replaceAll(`"/${name}"`, `"/${versioned}"`);
      await write(staging, versioned, sources[name]);
      await write(staging, name, sources[name]);
    }
    await write(staging, 'index.html', homeHtml);
    if (cfpHtml !== null) await write(staging, 'call-for-papers/index.html', cfpHtml);
    for (const asset of assets) await write(staging, asset.path, await readFile(asset.source));
    for (const article of articles) {
      const issue = issues.find(i => i.slug === article.issueSlug);
      await write(staging, `articles/${article.slug}/index.html`, renderArticle(article, issue, journal));
      await write(staging, `articles/${article.slug}.bib`, bibtex(article, issue, journal));
      await write(staging, `articles/${article.slug}.ris`, ris(article, issue, journal));
      await write(staging, `articles/${article.slug}.json`, JSON.stringify(articleJsonLd(article, issue, journal), null, 2) + '\n');
    }
    for (const issue of issues) await write(staging, `issues/${issue.slug}/index.html`, renderIssue(issue, articles.filter(a => a.issueSlug === issue.slug), journal));
    await write(staging, 'catalogue.json', JSON.stringify({ journal, issues, articles }, null, 2) + '\n');
    await write(staging, 'journal.json', JSON.stringify(journal, null, 2) + '\n');
    await write(staging, 'llms.txt', `# ${journal.title}: ${journal.subtitle}\n\n${journal.description}\n\nThis is a static open-access journal site. ${articles.length ? `${articles.length} article(s) are published in the catalogue.` : 'No articles are published here yet; the archive is empty.'}\n\nSubmission method: email. ${journal.submissionEmail ? `Contact: ${journal.submissionEmail}.` : 'The submission mailbox is not configured, so submissions are not yet open.'}\nPresident: ${journal.president ?? 'not recorded'}.\nEditor-in-Chief: ${journal.editorInChief ?? 'not recorded'}.\nISSN: ${journal.issn ?? 'not assigned'}.\n\n${issues.map(i => `- [${i.title}](${absolute(journal, `/issues/${i.slug}/`)}): complete issue and article contents.\n`).join('')}- [Catalogue](${absolute(journal, '/catalogue.json')}): published metadata, article links and PDF links.\n- [Journal information](${absolute(journal, '/journal.json')})\n- [Portable file manifest](${absolute(journal, '/export-manifest.json')})\n- [Source code](${journal.sourceCode})\n- [President and Editor-in-Chief’s official website](${journal.officialWebsite})\n${cfpSource !== null ? `- [Call for papers](${absolute(journal, '/call-for-papers/')}): scope, contribution types and rolling submissions.\n` : ''}- [Author instructions](${absolute(journal, '/#authors')})\n- [Approved publication standard](${absolute(journal, '/#style')})\n- [Editorial policies](${absolute(journal, '/#policies')})\n- [Connected research and learning](https://www.alberttansinhon.com/explore/)\n\nEach article has a landing page, BibTeX and RIS citations, and Schema.org JSON-LD. Use the article’s actual content and stated licence. This site has no agent write tools, manuscript upload service, MCP server or automated email sending. It makes no claim of automatic indexing or endorsement.\n`);
    await write(staging, 'robots.txt', `User-agent: *\n${journal.robotsIndex ? 'Allow: /' : 'Disallow: /'}\n${journal.robotsIndex && journal.siteUrl ? `Sitemap: ${journal.siteUrl}/sitemap.xml\n` : ''}`);
    if (journal.siteUrl && journal.robotsIndex) await write(staging, 'sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[journal.siteUrl + '/', ...(cfpSource !== null ? [absolute(journal, '/call-for-papers/')] : []), ...issues.map(i => absolute(journal, `/issues/${i.slug}/`)), ...articles.map(a => a.url)].map(value => `<url><loc>${escapeHtml(value)}</loc></url>`).join('')}</urlset>\n`);
    await write(staging, '_headers', `/*
  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'none'; frame-src 'none'; worker-src 'none'; upgrade-insecure-requests
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Strict-Transport-Security: max-age=31536000
  Cross-Origin-Opener-Policy: same-origin
  Cache-Control: public, max-age=0, must-revalidate
`);
    if (journal.siteUrl && journal.submissionEmail) await write(staging, '.well-known/security.txt', `Contact: mailto:${journal.submissionEmail}\nExpires: 2027-11-08T00:00:00Z\nPreferred-Languages: en\nCanonical: ${journal.siteUrl}/.well-known/security.txt\n`);
    const files = [];
    for (const path of await allFiles(staging)) { const bytes = await readFile(join(staging, path)); files.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }); }
    await write(staging, 'export-manifest.json', JSON.stringify({ schemaVersion: 1, format: 'static-journal-directory', description: 'All public distribution files except this manifest. Copy the complete directory to any static web host; see source repository for rebuilding and changing the site origin.', sourceCode: journal.sourceCode, siteUrl: journal.siteUrl, articleCount: articles.length, issueCount: issues.length, files }, null, 2) + '\n');
    await rm(join(root, 'dist'), { recursive: true, force: true });
    await rename(staging, join(root, 'dist'));
    return { outputDirectory: join(root, 'dist'), articles: articles.length, issues: issues.length, files: files.length + 1 };
  } catch (error) { await rm(staging, { recursive: true, force: true }); throw error; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  buildProject().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(`Build failed: ${error.message}`); process.exitCode = 1; });
}
