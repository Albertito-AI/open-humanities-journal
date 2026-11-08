# Open Humanities Journal

The open-source website for **The Human Question: A Journal of Humanistic Inquiry**.

[Source on GitHub](https://github.com/Albertito-AI/open-humanities-journal) · [Albert Tan's website](https://www.alberttansinhon.com)

This is a small, portable static website: journal information, submission instructions, house style, an article archive and links to final open-access PDFs. It is an independent website, not an OJS installation.

The journal's process takes place by email: **submission → desk decision → peer review → revision → final house-style PDF → publication**. Authors and reviewers do not need website accounts or ChatGPT accounts. Human editors arrange review and make decisions.

## Current status

The initial website is being prepared for private editorial review before public launch. No submission inbox has yet been supplied or verified, and no accepted articles have been supplied for publication. `submissionEmail` in `content/journal.json` remains `null`. The site must not invent an address or claim that submissions are open.

The purchased domain is `thehumanquestionjournal.com`. Its connection to the deployment must be verified separately. No ISSN, indexing, affiliations or editorial appointments should be displayed unless confirmed.

## Build and preview

Use Node.js 24. The build uses Node's standard library and needs no database, paid application server or dependency installation.

```sh
git clone https://github.com/Albertito-AI/open-humanities-journal.git
cd open-humanities-journal
npm test
npm run build
```

The generated website is in `dist/`. Preview or deploy that folder with an ordinary static web server. The build does not send emails or upload files to a host.

Sites can host the generated files through its normal deployment workflow. Other static hosts can serve the same output. Account limits, domain charges and any hosting charges depend on the chosen provider; the source licence does not guarantee free hosting.

## Maintaining the journal

- Edit the journal's public settings in `content/journal.json`. Add only the verified submission email when the editor is ready to receive manuscripts.
- Maintain articles in `content/articles.json`, issues in `content/issues.json`, and approved final PDFs in `public/articles/`. Follow [adding articles](docs/ADDING_ARTICLES.md).
- Keep author instructions and house-style resources current: [Word template](public/resources/The_Human_Question_House_Style_Template.docx) and [PDF preview](public/resources/The_Human_Question_House_Style_Preview.pdf).
- Build and check the resulting pages, links and downloads before deploying.

GitHub is the website's content-management workflow. There is no author portal, mailbox integration, manuscript tracking service or online peer-review system. Confidential manuscripts, reports, editorial correspondence and account credentials must never enter the public repository.

The editorial office keeps its email review record privately. Once the editor approves publication and the author confirms the final text and licence, the final PDF and its accurate metadata can be added to the website.

See [operations](docs/OPERATIONS.md), [the remaining launch work](docs/ROADMAP.md), [contributing](CONTRIBUTING.md) and [security](SECURITY.md).

## Reuse and licensing

The original website code is offered under the [MIT licence](LICENSE), including permission for commercial reuse subject to its conditions. Other journals can adapt the content and serve the built files on their own domain and host. Give each installation its own hosting identity; never reuse another operator's deployment project ID.

The software licence does not grant rights to articles, reviewer reports, personal information, journal names or branding. Each published article requires its own agreed licence. Keep applicable third-party notices with any reused code or assets.

Development is directed by Albert Tan with assistance from coding agents. Human editors remain responsible for peer review, publication decisions and truthful journal information.
