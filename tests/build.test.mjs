import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildProject, validateJournal, validateArticle, validateOrcid, escapeHtml, safeJsonLd } from '../scripts/build.mjs';

const journal = { title: 'The Human Question', subtitle: 'A Journal of Humanistic Inquiry', description: 'Human-centred inquiry.', founder: 'Albert Tan', officialWebsite: 'https://www.alberttansinhon.com', sourceCode: 'https://github.com/Albertito-AI/open-humanities-journal', siteUrl: 'https://preview.example.org', intendedDomain: 'https://thehumanquestionjournal.com', submissionEmail: null, issn: null, language: 'en-GB', stage: 'pilot', robotsIndex: false };
const issue = { slug: 'volume-1-issue-1', title: 'First issue', volume: '1', number: '1', year: 2026, publishedDate: '2026-11-08' };
const article = { slug: 'human-institutions', title: 'Human institutions', authors: ['A. Scholar'], abstract: 'A study of people and institutions.', keywords: ['law'], pdf: '/articles/human-institutions.pdf', publishedDate: '2026-11-08', licence: 'CC-BY-4.0', issueSlug: issue.slug, pages: '1–10' };

test('ORCID validation accepts checked identifiers and rejects invalid identifiers and markup', () => {
  assert.equal(validateOrcid('0009-0001-8996-7933'), '0009-0001-8996-7933');
  assert.equal(validateOrcid(null), null);
  for (const id of ['0009-0001-8996-7934', 'https://orcid.org/0009-0001-8996-7933', '<img src=x>']) assert.throws(() => validateOrcid(id), /ORCID/);
});

test('issue publication preserves absent volume and verified ORCID in readable citation records', async t => {
  const f = await fixture(t, true);
  await writeFile(join(f.rootDir, 'content/issues.json'), JSON.stringify([{ ...issue, volume: null, title: '2026, Number 1' }]));
  await writeFile(join(f.rootDir, 'content/articles.json'), JSON.stringify([{ ...article, orcids: ['0009-0001-8996-7933'] }]));
  const result = await buildProject(f);
  const html = await readFile(join(result.outputDirectory, 'articles/human-institutions/index.html'), 'utf8');
  assert.equal(html.match(/<a class="author-orcid" href="([^"]+)"/)[1], 'https://orcid.org/0009-0001-8996-7933');
  assert.equal(html.includes('citation_volume'), false);
  assert.equal(html.includes('citation_doi'), false);
  assert.equal(html.includes('citation_issn'), false);
  const metadata = JSON.parse(await readFile(join(result.outputDirectory, 'articles/human-institutions.json'), 'utf8'));
  assert.equal(metadata.author[0].sameAs, 'https://orcid.org/0009-0001-8996-7933');
  assert.equal(metadata.isPartOf.isPartOf['@type'], 'Periodical');
  assert.equal((await readFile(join(result.outputDirectory, 'articles/human-institutions.bib'), 'utf8')).includes('volume'), false);
  const ris = await readFile(join(result.outputDirectory, 'articles/human-institutions.ris'), 'utf8');
  assert.ok(ris.includes('SP  - 1\r\nEP  - 10'));
  assert.equal(ris.includes('VL  -'), false);
  const issueHtml = await readFile(join(result.outputDirectory, 'issues/volume-1-issue-1/index.html'), 'utf8');
  assert.ok(issueHtml.includes('/articles/human-institutions/'));
  assert.ok(issueHtml.includes('noindex, nofollow'));
});

async function fixture(t, withArticle = false) {
  const rootDir = await mkdtemp(join(tmpdir(), 'thq-static-test-'));
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  for (const path of ['src', 'public/articles', 'content']) await mkdir(join(rootDir, path), { recursive: true });
  await writeFile(join(rootDir, 'src/index.html'), '<!doctype html><title>Journal test</title>');
  await writeFile(join(rootDir, 'src/styles.css'), 'body{font-family:serif}');
  await writeFile(join(rootDir, 'src/main.js'), 'console.log("journal");');
  await writeFile(join(rootDir, 'content/journal.json'), JSON.stringify(journal));
  await writeFile(join(rootDir, 'content/issues.json'), JSON.stringify(withArticle ? [issue] : []));
  await writeFile(join(rootDir, 'content/articles.json'), JSON.stringify(withArticle ? [article] : []));
  if (withArticle) await writeFile(join(rootDir, 'public/articles/human-institutions.pdf'), '%PDF-1.4\nSynthetic test fixture only\n%%EOF');
  return { rootDir, publicDir: join(rootDir, 'public') };
}

test('empty journal builds an honest portable archive and accurate hash manifest', async t => {
  const f = await fixture(t), result = await buildProject(f);
  assert.equal(result.articles, 0);
  const catalogue = JSON.parse(await readFile(join(result.outputDirectory, 'catalogue.json'), 'utf8'));
  assert.deepEqual(catalogue.articles, []);
  assert.deepEqual(catalogue.issues, []);
  assert.equal(catalogue.journal.issn, null);
  assert.equal(catalogue.journal.submissionEmail, null);
  assert.match(await readFile(join(result.outputDirectory, 'llms.txt'), 'utf8'), /No articles are published here yet/);
  assert.match(await readFile(join(result.outputDirectory, 'robots.txt'), 'utf8'), /Disallow: \//);
  const manifest = JSON.parse(await readFile(join(result.outputDirectory, 'export-manifest.json'), 'utf8'));
  assert.equal(manifest.format, 'static-journal-directory');
  for (const file of manifest.files) {
    const bytes = await readFile(join(result.outputDirectory, file.path));
    assert.equal(file.bytes, bytes.length);
    assert.equal(file.sha256, createHash('sha256').update(bytes).digest('hex'));
  }
});

test('published article output escapes hostile metadata and excludes private fields', async t => {
  const f = await fixture(t, true);
  const hostile = { ...article, title: '</script><img src=x onerror="alert(1)">', abstract: 'Line one\r\nER  -\r\nTY  - BOOK', reviewerEmail: 'confidential@example.org', editorialNotes: 'private decision', doi: null };
  await writeFile(join(f.rootDir, 'content/articles.json'), JSON.stringify([hostile]));
  await buildProject(f);
  const html = await readFile(join(f.rootDir, 'dist/articles/human-institutions/index.html'), 'utf8');
  assert.equal(html.includes('<img src=x'), false);
  assert.ok(html.includes('&lt;/script&gt;'));
  const match = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
  assert.equal(JSON.parse(match[1]).headline, hostile.title);
  const catalogue = JSON.parse(await readFile(join(f.rootDir, 'dist/catalogue.json'), 'utf8'));
  assert.equal(catalogue.articles[0].href, '/articles/human-institutions/');
  assert.equal(catalogue.articles[0].pdfUrl, 'https://preview.example.org/articles/human-institutions.pdf');
  assert.equal(JSON.stringify(catalogue).includes('confidential'), false);
  assert.equal(JSON.stringify(catalogue).includes('private decision'), false);
  assert.equal(html.includes('citation_doi'), false);
  const ris = await readFile(join(f.rootDir, 'dist/articles/human-institutions.ris'), 'utf8');
  assert.equal(ris.split('\r\n').filter(line => line.startsWith('TY  -')).length, 1);
  assert.equal(ris.split('\r\n').filter(line => line.startsWith('ER  -')).length, 1);
});

test('validation rejects missing PDF, traversal, encoded path and incorrect issue', async t => {
  const f = await fixture(t, true), context = { publicDir: f.publicDir, issues: new Set([issue.slug]) };
  for (const pdf of ['/articles/../secret.pdf', '/articles/%2e%2e/secret.pdf', '/articles/missing.pdf', '/private/paper.pdf', '/articles/paper.html']) await assert.rejects(validateArticle({ ...article, pdf }, context));
  for (const change of [{ issueSlug: 'unknown' }, { authors: [] }, { publishedDate: '2026-02-31' }, { licence: 'made-up' }]) await assert.rejects(validateArticle({ ...article, ...change }, context));
});

test('public asset copying refuses hidden files, symlinks and unreferenced manuscripts', async t => {
  const f = await fixture(t);
  await writeFile(join(f.publicDir, '.env'), 'SECRET=value');
  await assert.rejects(buildProject(f), /Hidden public asset/);
  await rm(join(f.publicDir, '.env'));
  await writeFile(join(f.rootDir, 'private.txt'), 'private');
  await symlink(join(f.rootDir, 'private.txt'), join(f.publicDir, 'leak.txt'));
  await assert.rejects(buildProject(f), /Symbolic links/);
  await rm(join(f.publicDir, 'leak.txt'));
  await writeFile(join(f.publicDir, 'articles/unpublished.pdf'), '%PDF-1.4\nprivate draft');
  await assert.rejects(buildProject(f), /Unreferenced file/);
});

test('journal metadata omits unknown fields and prevents premature indexing', () => {
  const j = validateJournal({ ...journal, smtpPassword: 'secret', privateNotes: 'hidden' });
  assert.equal('smtpPassword' in j, false);
  assert.equal('privateNotes' in j, false);
  assert.throws(() => validateJournal({ ...journal, robotsIndex: true }), /connected intended domain/);
  assert.throws(() => validateJournal({ ...journal, issn: '1234-5678' }), /check digit/);
  assert.throws(() => validateJournal({ ...journal, sourceCode: 'javascript:alert(1)' }), /HTTPS/);
  assert.equal(escapeHtml('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
  assert.equal(safeJsonLd({ title: '</script>' }).includes('<'), false);
});

test('failed validation preserves the preceding working distribution', async t => {
  const f = await fixture(t);
  await buildProject(f);
  await writeFile(join(f.rootDir, 'content/articles.json'), JSON.stringify([article]));
  await assert.rejects(buildProject(f));
  assert.deepEqual(JSON.parse(await readFile(join(f.rootDir, 'dist/catalogue.json'), 'utf8')).articles, []);
});


test('approved NC-ND rights and confirmed editorial roles survive publication exports', async t => {
  const f = await fixture(t, true);
  const name = 'Albert Tan Sin Hon';
  await writeFile(join(f.rootDir, 'content/journal.json'), JSON.stringify({ ...journal, president: name, editorInChief: name }));
  await writeFile(join(f.rootDir, 'content/articles.json'), JSON.stringify([{ ...article, licence: 'CC-BY-NC-ND-4.0' }]));
  const result = await buildProject(f);
  const licence = 'https://creativecommons.org/licenses/by-nc-nd/4.0/';
  const catalogue = JSON.parse(await readFile(join(result.outputDirectory, 'catalogue.json'), 'utf8'));
  assert.equal(catalogue.journal.president, name);
  assert.equal(catalogue.journal.editorInChief, name);
  assert.equal(catalogue.articles[0].licenceUrl, licence);
  const html = await readFile(join(result.outputDirectory, 'articles/human-institutions/index.html'), 'utf8');
  assert.ok(html.includes(`rel="license" href="${licence}"`));
  assert.equal(JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]).license, licence);
  const guide = await readFile(join(result.outputDirectory, 'llms.txt'), 'utf8');
  assert.ok(guide.includes(`President: ${name}`));
  assert.ok(guide.includes(`Editor-in-Chief: ${name}`));
});


test('published home binds its navigation assets to their current bytes', async t => {
  const f = await fixture(t);
  await writeFile(join(f.rootDir, 'src/index.html'), '<link rel="stylesheet" href="/styles.css"><script src="/main.js" defer></script>');
  const first = await buildProject(f);
  const html = await readFile(join(first.outputDirectory, 'index.html'), 'utf8');
  const script = html.match(/src="\/(main\.[a-f0-9]{12}\.js)"/)[1];
  assert.equal(await readFile(join(first.outputDirectory, script), 'utf8'), 'console.log("journal");');
  await writeFile(join(f.rootDir, 'src/main.js'), 'console.log("policies");');
  await buildProject(f);
  const changed = await readFile(join(first.outputDirectory, 'index.html'), 'utf8');
  assert.ok(!changed.includes(script));
  const next = changed.match(/src="\/(main\.[a-f0-9]{12}\.js)"/)[1];
  assert.equal(await readFile(join(first.outputDirectory, next), 'utf8'), 'console.log("policies");');
});

test('deployment includes strict browser headers and public document rules', async t => {
  const f = await fixture(t, true);
  await buildProject(f);
  const headers = await readFile(join(f.rootDir, 'dist/_headers'), 'utf8');
  for (const control of ["default-src 'none'", "frame-ancestors 'none'", "object-src 'none'", "form-action 'none'", 'X-Content-Type-Options: nosniff', 'Strict-Transport-Security: max-age=31536000']) assert.ok(headers.includes(control));
  assert.ok(!headers.includes('unsafe-inline') && !headers.includes('unsafe-eval'));
  const html = await readFile(join(f.rootDir, 'dist/articles/human-institutions/index.html'), 'utf8');
  assert.doesNotMatch(html, /\sstyle=/);
  for (const name of ['guide.docx', 'payload.js', 'payload.css', 'payload.html']) {
    await writeFile(join(f.publicDir, name), 'test fixture');
    await assert.rejects(buildProject(f), /Unsupported public asset extension/);
    await rm(join(f.publicDir, name));
  }
});

test('the call for papers is a complete static page with the deployed origin and discovery links', async t => {
  const f = await fixture(t);
  const template = await readFile(new URL('../src/call-for-papers.html', import.meta.url), 'utf8');
  await writeFile(join(f.rootDir, 'src/call-for-papers.html'), template);
  await writeFile(join(f.rootDir, 'content/journal.json'), JSON.stringify({ ...journal, siteUrl: journal.intendedDomain, robotsIndex: true }));
  const result = await buildProject(f);
  const html = await readFile(join(result.outputDirectory, 'call-for-papers/index.html'), 'utf8');
  const url = `${journal.intendedDomain}/call-for-papers/`;
  assert.ok(html.includes(`<link rel="canonical" href="${url}">`));
  assert.ok(html.includes(`<meta property="og:url" content="${url}">`));
  assert.ok(html.includes(`${journal.intendedDomain}/brand/The_Human_Question_Logo.png`));
  assert.doesNotMatch(html, /\{\{|<script\b|noindex|\sstyle=/);
  assert.match(html, /<h1\b[^>]*>Call for <em>papers<\/em><\/h1>/);
  const stylesheet = html.match(/href="\/(styles\.[a-f0-9]{12}\.css)"/)[1];
  assert.equal(await readFile(join(result.outputDirectory, stylesheet), 'utf8'), 'body{font-family:serif}');
  assert.ok((await readFile(join(result.outputDirectory, 'sitemap.xml'), 'utf8')).includes(`<loc>${url}</loc>`));
  assert.ok((await readFile(join(result.outputDirectory, 'llms.txt'), 'utf8')).includes(`[Call for papers](${url})`));
  const manifest = JSON.parse(await readFile(join(result.outputDirectory, 'export-manifest.json'), 'utf8'));
  assert.ok(manifest.files.some(file => file.path === 'call-for-papers/index.html'));

  await writeFile(join(f.rootDir, 'content/journal.json'), JSON.stringify(journal));
  await buildProject(f);
  const preview = await readFile(join(result.outputDirectory, 'call-for-papers/index.html'), 'utf8');
  assert.match(preview, /<meta name="robots" content="noindex, nofollow">/);
  assert.ok(preview.includes(`${journal.siteUrl}/call-for-papers/`));
  assert.ok(!preview.includes(`${journal.intendedDomain}/call-for-papers/`));
});

test('the call for papers links to existing author resources and retains homepage hash views', async () => {
  const home = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
  const cfp = await readFile(new URL('../src/call-for-papers.html', import.meta.url), 'utf8');
  assert.ok((home.match(/href="\/call-for-papers\/"/g) ?? []).length >= 3);
  for (const match of cfp.matchAll(/(?:href|src)="(\/[^\"]*)"/g)) {
    const path = match[1];
    if (path === '/' || path === '/call-for-papers/' || path === '/styles.css') continue;
    if (path.startsWith('/#')) {
      assert.ok(home.includes(`id="${path.slice(2)}" data-view="${path.slice(2)}"`), `Existing hash view: ${path}`);
    } else {
      await access(new URL(`../public${path}`, import.meta.url));
    }
  }
  assert.ok(cfp.includes('mailto:editor@thehumanquestionjournal.com'));
});

test('affiliation corrections survive public exports and reject author misalignment', async t => {
  const f = await fixture(t, true);
  const corrected = { ...article, affiliations: ['Pro-Link Insurance Agency, Singapore'], authorRoles: ['Director'], correction: { date: '2026-11-13', note: 'Affiliation corrected; scholarly content unchanged.' } };
  await writeFile(join(f.rootDir, 'content/articles.json'), JSON.stringify([corrected]));
  const result = await buildProject(f);
  const html = await readFile(join(result.outputDirectory, 'articles/human-institutions/index.html'), 'utf8');
  assert.ok(html.includes('Director, Pro-Link Insurance Agency, Singapore'));
  assert.ok(html.includes('name="citation_author_institution" content="Pro-Link Insurance Agency, Singapore"'));
  assert.ok(html.includes('Affiliation corrected; scholarly content unchanged.'));
  const metadata = JSON.parse(await readFile(join(result.outputDirectory, 'articles/human-institutions.json'), 'utf8'));
  assert.equal(metadata.author[0].affiliation.name, corrected.affiliations[0]);
  assert.equal(metadata.author[0].jobTitle, 'Director');
  assert.equal(metadata.datePublished, article.publishedDate);
  assert.equal(metadata.dateModified, '2026-11-13');
  const context = { publicDir: f.publicDir, issues: new Set([issue.slug]) };
  await assert.rejects(validateArticle({ ...corrected, affiliations: [] }, context), /match the author list/);
  await assert.rejects(validateArticle({ ...corrected, correction: { date: '2026-02-31', note: 'Invalid' } }, context), /real YYYY-MM-DD/);
});

test('corrected PDFs use fresh links throughout publication and keep old URLs as temporary redirects', async t => {
  const f = await fixture(t, true);
  const pdf = '/articles/human-institutions_corrected_20261113.pdf';
  const issuePdf = `/issues/${issue.slug}/complete_corrected_20261113.pdf`;
  const routes = [{ from: article.pdf, to: pdf }, { from: `/issues/${issue.slug}/complete.pdf`, to: issuePdf }];
  await writeFile(join(f.publicDir, pdf), await readFile(join(f.publicDir, article.pdf)));
  await rm(join(f.publicDir, article.pdf));
  await mkdir(join(f.publicDir, 'issues', issue.slug), { recursive: true });
  await writeFile(join(f.publicDir, issuePdf), '%PDF-1.4\nCorrected issue fixture\n%%EOF');
  await writeFile(join(f.rootDir, 'content/articles.json'), JSON.stringify([{ ...article, pdf }]));
  await writeFile(join(f.rootDir, 'content/issues.json'), JSON.stringify([{ ...issue, pdf: issuePdf }]));
  await writeFile(join(f.rootDir, 'content/pdf-redirects.json'), JSON.stringify(routes));
  const result = await buildProject(f);
  assert.equal(await readFile(join(result.outputDirectory, '_redirects'), 'utf8'), routes.map(route => `${route.from} ${route.to} 302`).join('\n') + '\n');
  const html = await readFile(join(result.outputDirectory, 'articles/human-institutions/index.html'), 'utf8');
  const issueHtml = await readFile(join(result.outputDirectory, `issues/${issue.slug}/index.html`), 'utf8');
  const metadata = JSON.parse(await readFile(join(result.outputDirectory, 'articles/human-institutions.json'), 'utf8'));
  const catalogue = JSON.parse(await readFile(join(result.outputDirectory, 'catalogue.json'), 'utf8'));
  assert.ok(html.includes(`href="${pdf}"`));
  assert.ok(html.includes(`name="citation_pdf_url" content="${journal.siteUrl}${pdf}"`));
  assert.ok(issueHtml.includes(`href="${pdf}"`) && issueHtml.includes(`href="${issuePdf}"`));
  assert.equal(metadata.encoding.contentUrl, `${journal.siteUrl}${pdf}`);
  assert.equal(catalogue.articles[0].pdfPath, pdf);
  assert.equal(catalogue.issues[0].pdf, issuePdf);
  for (const route of routes) {
    await assert.rejects(access(join(result.outputDirectory, route.from)), { code: 'ENOENT' });
    for (const output of [html, issueHtml, JSON.stringify(metadata), JSON.stringify(catalogue)]) assert.ok(!output.includes(route.from));
  }
  const headers = await readFile(join(result.outputDirectory, '_headers'), 'utf8');
  assert.ok(headers.includes('Cache-Control: public, no-cache, max-age=0, must-revalidate'));
  for (const path of routes.flatMap(route => [route.from, route.to])) assert.ok(headers.includes(`\n${path}\n  ! Cache-Control\n  Cache-Control: no-store\n`));
  const manifest = JSON.parse(await readFile(join(result.outputDirectory, 'export-manifest.json'), 'utf8'));
  assert.ok(manifest.files.some(file => file.path === '_redirects'));
});

test('PDF redirect configuration is optional and malformed configurations fail without replacing a working build', async t => {
  const f = await fixture(t, true);
  await buildProject(f);
  await assert.rejects(access(join(f.rootDir, 'dist/_redirects')), { code: 'ENOENT' });
  const original = await readFile(join(f.rootDir, 'dist/catalogue.json'), 'utf8');
  for (const config of [null, {}, [{ from: '/articles/old.pdf' }], [{ from: '/articles/old.pdf', to: article.pdf }, { from: '/articles/old.pdf', to: article.pdf }]]) {
    await writeFile(join(f.rootDir, 'content/pdf-redirects.json'), JSON.stringify(config));
    await assert.rejects(buildProject(f), /PDF redirect|Duplicate/);
    assert.equal(await readFile(join(f.rootDir, 'dist/catalogue.json'), 'utf8'), original);
  }
});

test('PDF redirects reject external URLs, path tricks and configuration injection', async t => {
  const f = await fixture(t, true);
  for (const path of ['https://attacker.example/old.pdf', '//attacker.example/old.pdf', '/resources/old.pdf', '/articles/../private.pdf', '/articles/%2e%2e/private.pdf', '/articles/.hidden/old.pdf', '/articles//old.pdf', '/articles/old.pdf?version=1', '/articles/old.pdf#page=1', '/articles/old.pdf\n/evil /elsewhere 302', '/articles/*/old.pdf', '/articles/\\old.pdf']) {
    for (const config of [[{ from: path, to: article.pdf }], [{ from: '/articles/old.pdf', to: path }]]) {
      await writeFile(join(f.rootDir, 'content/pdf-redirects.json'), JSON.stringify(config));
      await assert.rejects(buildProject(f), /safe same-site PDF path/);
    }
  }
});

test('PDF redirects reject loops, chains, unpublished destinations and remaining obsolete assets', async t => {
  const f = await fixture(t, true);
  const old = '/articles/old.pdf', intermediate = '/articles/intermediate.pdf';
  for (const routes of [
    [{ from: old, to: old }],
    [{ from: old, to: intermediate }, { from: intermediate, to: old }],
    [{ from: old, to: intermediate }, { from: intermediate, to: article.pdf }],
    [{ from: old, to: '/issues/volume-1-issue-1/unpublished.pdf' }],
  ]) {
    await writeFile(join(f.rootDir, 'content/pdf-redirects.json'), JSON.stringify(routes));
    await assert.rejects(buildProject(f), /themselves, chain or form loops|published article or issue PDF/);
  }
  const obsolete = `/issues/${issue.slug}/obsolete.pdf`;
  await mkdir(join(f.publicDir, 'issues', issue.slug), { recursive: true });
  await writeFile(join(f.publicDir, obsolete), '%PDF-1.4\nObsolete fixture\n%%EOF');
  await writeFile(join(f.rootDir, 'content/pdf-redirects.json'), JSON.stringify([{ from: obsolete, to: article.pdf }]));
  await assert.rejects(buildProject(f), /source still exists as a public asset/);
});
