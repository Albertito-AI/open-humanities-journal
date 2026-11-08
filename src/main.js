'use strict';

const $ = (selector) => document.querySelector(selector);
const views = new Set(['journal', 'authors', 'style', 'archive']);
let articles = [];
let submissionEmail = null;
let catalogueLoaded = false;
let catalogueFailed = false;

function showView(shouldFocus = false) {
  const requested = window.location.hash.slice(1);
  const view = views.has(requested) ? requested : 'journal';
  document.querySelectorAll('[data-view]').forEach(section => { section.hidden = section.dataset.view !== view; });
  document.querySelectorAll('.site-header nav a').forEach(link => {
    if (link.getAttribute('href') === '#' + view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (shouldFocus) {
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.querySelector(`[data-view="${view}"] h1`)?.focus({ preventScroll: true });
  }
}
window.addEventListener('hashchange', () => showView(true));
showView();

function make(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value !== undefined) element.textContent = String(value);
  return element;
}
function authorNames(article) {
  if (!Array.isArray(article.authors)) return [];
  return article.authors.map(author => typeof author === 'string' ? author : typeof author?.name === 'string' ? author.name : '').filter(Boolean);
}
function safeSlug(slug) {
  return typeof slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : null;
}
function localPdf(article) {
  const path = article.pdfPath || article.pdf;
  if (typeof path !== 'string') return null;
  // PDF links are deployment-local and must not redirect to an arbitrary origin.
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || path.includes('..') || /[?#]/.test(path) || !/\.pdf$/i.test(path)) return null;
  return path;
}
function renderArchive() {
  if (!catalogueLoaded) {
    $('#archive-results').replaceChildren(make('div', 'empty-state', catalogueFailed ? 'The published archive is temporarily unavailable.' : 'Loading the published archive…'));
    return;
  }
  const query = $('#archive-search').value.trim().toLocaleLowerCase('en-GB');
  const results = $('#archive-results');
  const visible = articles.filter(article => [article.title, article.abstract, authorNames(article).join(' '), Array.isArray(article.keywords) ? article.keywords.join(' ') : ''].join(' ').toLocaleLowerCase('en-GB').includes(query));
  $('#archive-count').textContent = articles.length ? `${visible.length} OF ${articles.length} PUBLISHED ${articles.length === 1 ? 'ARTICLE' : 'ARTICLES'}` : 'PUBLISHED ARTICLES';
  results.replaceChildren();
  if (!visible.length) {
    const empty = make('div', 'empty-state');
    empty.append(make('h2', '', query ? 'No matching articles.' : 'The first issue is in preparation.'));
    empty.append(make('p', '', query ? 'Try another title, author name or keyword.' : 'No articles have been published on this website yet. Accepted papers will appear here after peer review, revision and final proof approval.'));
    if (query) {
      const clear = make('button', 'button button-secondary', 'Clear search');
      clear.type = 'button'; clear.addEventListener('click', () => { $('#archive-search').value = ''; renderArchive(); $('#archive-search').focus(); });
      empty.append(clear);
    } else {
      const link = make('a', 'button button-secondary', 'Read the author guidance');link.href = '#authors';empty.append(link);
    }
    results.append(empty);return;
  }
  const grid = make('div', 'article-grid');
  visible.forEach(article => {
    const slug = safeSlug(article.slug);
    if (!slug) return;
    const card = make('article', 'article-card');
    card.append(make('span', 'article-label', article.issueTitle || 'Research article'));
    const heading = make('h3');const permalink = make('a', '', article.title);permalink.href = `/articles/${slug}/`;heading.append(permalink);card.append(heading);
    card.append(make('p', 'article-authors', authorNames(article).join(' · ')));
    card.append(make('p', 'article-abstract', article.abstract || ''));
    const bottom = make('div', 'article-bottom');
    const published = article.publishedDate || article.publishedAt;
    const date = published && !Number.isNaN(Date.parse(published)) ? new Date(published).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}) : '';
    bottom.append(make('span', '', date));
    const pdf = localPdf(article);
    if (pdf) { const link = make('a','text-button','Download PDF ↗');link.href=pdf;link.target='_blank';link.rel='noopener noreferrer';bottom.append(link); }
    else { const link=make('a','text-button','Read article ↗');link.href=`/articles/${slug}/`;bottom.append(link); }
    card.append(bottom);grid.append(card);
  });
  results.append(grid);
}
$('#archive-search').addEventListener('input', renderArchive);

function configureEmail(journal) {
  const value = journal?.submissionEmail;
  if (typeof value !== 'string' || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value)) return;
  submissionEmail = value;
  $('#submission-status-label').textContent = 'Submission address';
  const link = make('a', '', value);link.href = 'mailto:' + encodeURIComponent(value);
  $('#submission-address').replaceChildren(link);
  $('#submission-status-text').textContent = 'Submit by email. Include your manuscript, a title page and a covering message. The editors will correspond with you directly.';
}
// Keep the public contact and draft helper available if catalogue requests fail.
configureEmail({submissionEmail: $('#submission-address a')?.textContent.trim()});

async function loadCatalogue() {
  try {
    const response = await fetch('/catalogue.json', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Catalogue unavailable');
    const catalogue = await response.json();
    if (!catalogue || !Array.isArray(catalogue.articles)) throw new Error('Invalid catalogue');
    articles = catalogue.articles.filter(article => article && safeSlug(article.slug) && typeof article.title === 'string');
    configureEmail(catalogue.journal);catalogueLoaded=true;renderArchive();
  } catch {
    catalogueFailed = true;
    $('#archive-status').textContent = 'The article catalogue could not be loaded. Please refresh the page to try again.';
    // Keep the archive status honest rather than representing a network failure as a verified empty catalogue.
    $('#archive-results').replaceChildren(make('div', 'empty-state', 'The published archive is temporarily unavailable.'));
  }
}
loadCatalogue();
fetch('/journal.json', {credentials:'same-origin'}).then(response=>response.ok?response.json():null).then(info=>configureEmail(info?.journal||info)).catch(()=>{});

function prepareEmail() {
  const form = $('#email-form');
  if (!form.reportValidity()) return;
  const values = new FormData(form);
  const field = name => String(values.get(name) || '').trim();
  const recipient = submissionEmail ? `To: ${submissionEmail}\n` : '';
  $('#email-draft-text').value = `${recipient}Subject: Submission to The Human Question: ${field('title')}\n\nDear Editors,\n\nPlease consider my manuscript, “${field('title')}”, for publication in The Human Question: A Journal of Humanistic Inquiry.\n\n${field('contribution')}\n\nAuthor(s): ${field('authors')}\nCorresponding author: ${field('contact')}\n\nConflicts of interest: ${field('conflicts')}\n\n[Before sending: confirm that all authors approve this submission, disclose any simultaneous submission, and explain any use of artificial intelligence or other assistance relevant to the work.]\n\n[Attach the manuscript and a separate title page. Check the journal’s confirmed author guidelines before sending.]\n\nThank you for considering the paper.\n\nKind regards,\n${field('name')}`;
  $('#email-draft-panel').hidden = false;
  $('#copy-draft').textContent = 'Copy draft';
  $('#draft-status').textContent = 'Nothing has been sent. Review the bracketed notes, attach your manuscript and ' + (submissionEmail ? 'send it to the confirmed submission address.' : 'wait for the confirmed submission address.');
  $('#email-draft-text').focus();
}
$('#prepare-draft').disabled = false;
$('#prepare-draft').addEventListener('click', prepareEmail);
$('#email-form').addEventListener('submit', event => { event.preventDefault(); prepareEmail(); });
$('#email-draft-text').addEventListener('input',()=>{$('#copy-draft').textContent='Copy draft';});
$('#copy-draft').addEventListener('click', async () => {
  try {await navigator.clipboard.writeText($('#email-draft-text').value);$('#copy-draft').textContent='Copied';$('#draft-status').textContent='Draft copied. Nothing has been sent. Review the draft in your email application before sending.';}
  catch {$('#email-draft-text').focus();$('#email-draft-text').select();$('#draft-status').textContent='Select and copy the draft manually. Automatic copying is unavailable in this browser.';}
});
$('#save-draft').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([$('#email-draft-text').value], {type:'text/plain;charset=utf-8'}));
  const link=make('a');link.href=url;link.download='the-human-question-submission-email.txt';document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  $('#draft-status').textContent='Your browser has been asked to save the draft. Nothing has been sent.';
});
