import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildProject, validateJournal, validateArticle, escapeHtml, safeJsonLd } from '../scripts/build.mjs';

const journal = { title: 'The Human Question', subtitle: 'A Journal of Humanistic Inquiry', description: 'Human-centred inquiry.', founder: 'Albert Tan', officialWebsite: 'https://www.alberttansinhon.com', sourceCode: 'https://github.com/Albertito-AI/open-humanities-journal', siteUrl: 'https://preview.example.org', intendedDomain: 'https://thehumanquestionjournal.com', submissionEmail: null, issn: null, language: 'en-GB', stage: 'pilot', robotsIndex: false };
const issue = { slug: 'volume-1-issue-1', title: 'First issue', volume: '1', number: '1', year: 2026, publishedDate: '2026-11-08' };
const article = { slug: 'human-institutions', title: 'Human institutions', authors: ['A. Scholar'], abstract: 'A study of people and institutions.', keywords: ['law'], pdf: '/articles/human-institutions.pdf', publishedDate: '2026-11-08', licence: 'CC-BY-4.0', issueSlug: issue.slug, pages: '1–10' };

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
