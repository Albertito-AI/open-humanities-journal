import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildProject, validateArticle, validateJournal, escapeHtml, safeJsonLd, renderArticle, bibtex, ris } from '../scripts/build.mjs';

const journalInput = {
  title: 'The Human Question', subtitle: 'A Journal of Humanistic Inquiry',
  description: 'A journal about human life.', founder: 'Albert Tan',
  officialWebsite: 'https://www.alberttansinhon.com', sourceCode: 'https://github.com/example/journal',
  siteUrl: 'https://journal.example.org', intendedDomain: 'https://journal.example.org',
  submissionEmail: null, issn: null, language: 'en-GB', stage: 'pilot', robotsIndex: false
};
const issue = { slug: 'volume-one', title: 'The first issue', volume: '1', number: '1', year: 2026, publishedDate: '2026-11-08' };
const articleInput = {
  slug: 'example-article', title: 'A synthetic article', authors: ['Synthetic Author'], abstract: 'A synthetic abstract.', keywords: ['humanities'],
  pdf: '/articles/article.pdf', publishedDate: '2026-11-08', licence: 'CC-BY-4.0', issueSlug: issue.slug, pages: '1–12', doi: null
};
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'thq-static-security-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await Promise.all(['src', 'content', 'public/articles'].map(p => mkdir(join(root, p), { recursive: true })));
  await Promise.all([
    writeFile(join(root, 'src/index.html'), '<!doctype html><html><head></head><body>Journal</body></html>'),
    writeFile(join(root, 'src/main.js'), '"use strict";'), writeFile(join(root, 'src/styles.css'), 'body{color:black}'),
    writeFile(join(root, 'content/journal.json'), JSON.stringify(journalInput)),
    writeFile(join(root, 'content/issues.json'), JSON.stringify([issue])),
    writeFile(join(root, 'content/articles.json'), JSON.stringify([articleInput])),
    writeFile(join(root, 'public/articles/article.pdf'), '%PDF-1.7\nSynthetic fixture only\n%%EOF')
  ]);
  return root;
}
async function validateAt(root, overrides = {}) {
  return validateArticle({ ...articleInput, ...overrides }, { publicDir: join(root, 'public'), issues: new Set([issue.slug]) });
}
async function textFiles(directory) {
  const results = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) results.push(...await textFiles(path));
    else if (!path.endsWith('.pdf')) results.push(await readFile(path, 'utf8'));
  }
  return results.join('\n');
}

test('article PDF paths reject traversal, encoded traversal, remote URLs and hidden paths', async t => {
  const root = await fixture(t);
  for (const pdf of ['/articles/../secret.pdf', '/articles/nested/../../secret.pdf', '/articles/%2e%2e/secret.pdf', 'https://attacker.example.org/article.pdf', '//attacker.example.org/article.pdf', '/articles/.private.pdf', '/articles/article.pdf?secret=1', '/articles/\\secret.pdf']) {
    await assert.rejects(validateAt(root, { pdf }), /PDF path/);
  }
});

test('article validation rejects missing, non-PDF and symlinked files', async t => {
  const root = await fixture(t);
  await assert.rejects(validateAt(root, { pdf: '/articles/missing.pdf' }), /does not exist/);
  await writeFile(join(root, 'public/articles/not-pdf.pdf'), '<html>private</html>');
  await assert.rejects(validateAt(root, { pdf: '/articles/not-pdf.pdf' }), /PDF signature/);
  await writeFile(join(root, 'secret.pdf'), '%PDF-secret');
  await symlink(join(root, 'secret.pdf'), join(root, 'public/articles/link.pdf'));
  await assert.rejects(validateAt(root, { pdf: '/articles/link.pdf' }), /symbolic link/);
});

test('a symlinked parent directory cannot bring a private PDF into the archive', async t => {
  const root = await fixture(t);
  await mkdir(join(root, 'private'));
  await writeFile(join(root, 'private/article.pdf'), '%PDF-private');
  await symlink(join(root, 'private'), join(root, 'public/articles/linked-directory'));
  await assert.rejects(validateAt(root, { pdf: '/articles/linked-directory/article.pdf' }), /outside|symbolic-link/);
});

test('a failed build preserves the previous distribution when an unreferenced PDF is present', async t => {
  const root = await fixture(t);
  await mkdir(join(root, 'dist'));
  await writeFile(join(root, 'dist/previous.txt'), 'previous release');
  await writeFile(join(root, 'public/articles/unpublished-draft.pdf'), '%PDF-confidential');
  await assert.rejects(buildProject({ rootDir: root }), /Unreferenced file/);
  assert.equal(await readFile(join(root, 'dist/previous.txt'), 'utf8'), 'previous release');
});

test('public asset copying rejects hidden files and unrelated symlinks', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'public/.env'), 'SECRET_TEST_VALUE');
  await assert.rejects(buildProject({ rootDir: root }), /Hidden public asset/);
  await rm(join(root, 'public/.env'));
  await writeFile(join(root, 'private-notes.txt'), 'SECRET_TEST_VALUE');
  await symlink(join(root, 'private-notes.txt'), join(root, 'public/notes.txt'));
  await assert.rejects(buildProject({ rootDir: root }), /Symbolic links/);
});

test('the publication build drops unknown private journal and article fields', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'content/journal.json'), JSON.stringify({ ...journalInput, privateCredentials: 'SECRET_CONFIG_VALUE', editorialBoardEmails: ['private-editor@example.org'] }));
  await writeFile(join(root, 'content/articles.json'), JSON.stringify([{ ...articleInput, authorEmails: ['private-author@example.org'], reviews: ['SECRET_REVIEW_VALUE'], privateFileKey: 'secret/manuscript' }]));
  await buildProject({ rootDir: root });
  const output = await textFiles(join(root, 'dist'));
  for (const secret of ['SECRET_CONFIG_VALUE', 'private-editor@example.org', 'private-author@example.org', 'SECRET_REVIEW_VALUE', 'secret/manuscript']) assert.equal(output.includes(secret), false, secret);
  const catalogue = JSON.parse(await readFile(join(root, 'dist/catalogue.json'), 'utf8'));
  assert.equal(catalogue.articles.length, 1);
  assert.equal(catalogue.articles[0].title, articleInput.title);
});

test('hostile article metadata remains escaped text and cannot end a JSON-LD script', async t => {
  const root = await fixture(t);
  const hostile = '</title><script>alert("x")</script><img src=x onerror="alert(1)"> & \'';
  const validated = await validateAt(root, { title: hostile, authors: [hostile], abstract: hostile, keywords: [hostile] });
  const journal = validateJournal(journalInput);
  const article = { ...validated, url: 'https://journal.example.org/articles/example-article/', pdfUrl: 'https://journal.example.org/articles/article.pdf', pdfPath: '/articles/article.pdf', citations: { bibtex: '/articles/example-article.bib', ris: '/articles/example-article.ris', jsonld: '/articles/example-article.json' } };
  const html = renderArticle(article, issue, journal);
  assert.equal(html.includes('<img src=x'), false);
  assert.equal(html.includes('<script>alert'), false);
  assert.equal((html.match(/<script\b/g) ?? []).length, 1);
  assert.ok(html.includes(escapeHtml(hostile)));
  const json = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)?.[1];
  assert.equal(JSON.parse(json).headline, hostile);
  assert.equal(safeJsonLd({ text: '</script>' }).includes('</script>'), false);
});

test('citation exports prevent newline-based RIS and BibTeX record injection', () => {
  const hostile = 'Title\r\nUR  - https://attacker.example.org\r\n@misc{evil, title={injected}}';
  const article = { ...articleInput, title: hostile, authors: [hostile], abstract: hostile, url: 'https://journal.example.org/articles/example-article/' };
  const risText = ris(article, issue, validateJournal(journalInput));
  assert.equal(risText.split('\r\n').filter(line => line.startsWith('UR  - ')).length, 1);
  assert.equal(risText.split('\r\n').filter(line => line.startsWith('TY  - ')).length, 1);
  const bibText = bibtex(article, issue, validateJournal(journalInput));
  assert.equal(bibText.split('\n').filter(line => line.startsWith('@')).length, 1);
  assert.ok(bibText.includes('\\{evil'));
});

test('journal website links require HTTPS and reject embedded credentials', () => {
  for (const officialWebsite of ['javascript:alert(1)', 'data:text/html,hello', 'http://example.org', 'https://user:password@example.org']) assert.throws(() => validateJournal({ ...journalInput, officialWebsite }), /HTTPS/);
});

test('the email draft helper cannot fall back to submitting personal fields to the host', async () => {
  const html = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
  const csp = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i)?.[1];
  assert.ok(csp, 'CSP meta is present even if scripts fail to load');
  assert.match(csp, /form-action\s+'none'/);
  const form = html.match(/<form[^>]*id="email-form"[^>]*>(.*?)<\/form>/s)?.[1];
  assert.ok(form);
  assert.equal(/type="submit"/.test(form), false);
  assert.match(form, /<button[^>]*type="button"[^>]*disabled|<button[^>]*disabled[^>]*type="button"/);
});

test('links opening a new browsing context explicitly use noopener', async () => {
  const html = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
  const links = html.match(/<a\b[^>]*target="_blank"[^>]*>/g) ?? [];
  assert.ok(links.length > 0);
  for (const link of links) assert.match(link, /rel="[^"]*\bnoopener\b[^"]*"/);
});
