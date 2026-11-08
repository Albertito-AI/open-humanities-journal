# Add an accepted article

This site publishes final PDFs and their metadata. Submission, peer review, revisions and acceptance take place by email. Adding a record is a publication action: complete the editorial process and obtain the authors' approval and agreed reuse licence first.

Keep submitted drafts, reviewer reports, contact information and editorial correspondence outside this repository. Everything under `public/` is intended to be published. The build rejects unreferenced files under `public/articles/`, hidden files and symbolic links.

## Journal settings

Edit `content/journal.json`. The submission email is `editor@thehumanquestionjournal.com`; the ISSN remains `null`. Albert confirmed successful email delivery on 8 November 2026. Add only the ISSN actually assigned to this journal; checksum validation is not proof of assignment.

`siteUrl` is the active hosting origin. `intendedDomain` records the intended custom domain and does not establish that its DNS is connected. Keep `robotsIndex` false during the pilot. After the custom domain works, set `siteUrl` to that origin before enabling indexing. Search-engine indexing is never guaranteed.

## Add an issue

Add an object to the array in `content/issues.json`:

| Field | Required content |
| --- | --- |
| `slug` | Unique lowercase words separated by hyphens |
| `title` | Actual issue title |
| `volume` | Volume number as a string |
| `number` | Issue number as a string |
| `year` | Publication year as a number |
| `publishedDate` | Actual publication date, `YYYY-MM-DD` |

Do not add an issue solely to make the archive appear populated. Both issue and article arrays are intentionally empty at launch.

## Add the final PDF and metadata

Put the approved final PDF in `public/articles/`, with a filename such as `short-article-title.pdf`. Use letters, digits and hyphens. It must have a PDF signature and be no larger than 100 MB. This verifies the format signature, not malware safety or accessibility.

Add an object to `content/articles.json`:

| Field | Required content |
| --- | --- |
| `slug` | Unique lowercase article identifier separated by hyphens |
| `title` | Complete published title |
| `authors` | Array of published author names, in the agreed order |
| `abstract` | Final abstract as plain text |
| `keywords` | Array of keywords; may be empty |
| `pdf` | `/articles/FILENAME.pdf`, matching the file in `public/articles/` |
| `publishedDate` | Actual publication date, `YYYY-MM-DD` |
| `licence` | Normally `CC-BY-NC-ND-4.0`; the build also supports `CC-BY-4.0` and `CC-BY-SA-4.0` for explicitly agreed exceptions |
| `issueSlug` | The slug of an existing issue |
| `pages` | Published page range or article number |
| `doi` | Optional assigned DOI beginning `10.`; omit or use `null` if none |

No sample paper is included in the live catalogue. Confirm that the PDF states the same title, authors, pages and licence as the metadata. Entering a DOI does not register one.

## Build and inspect

```sh
npm test
npm run build
```

The build exports only explicit public metadata fields. Unknown fields are excluded, but private information must still be kept out of the public repository.

For each article, the build creates a landing page at `dist/articles/SLUG/index.html`, copies the final PDF, adds BibTeX and RIS citation downloads, produces Schema.org JSON-LD, and updates `dist/catalogue.json`. These are static files. There is no application server, login, manuscript upload form or database.

Inspect the landing page, PDF download, author order, licence and citation files before deploying.

## Preserve and move the site

Copy the entire `dist/` directory to any static web host that serves directory `index.html` files. `dist/export-manifest.json` lists the other distribution files, their sizes and SHA-256 hashes. Keep separate copies of the repository, final PDFs and built distribution. The manifest supports integrity checks; it is not a preservation-service deposit.

If the domain changes, update `siteUrl` and rebuild so canonical URLs and citations change consistently. Preserve established article slugs and configure host-level redirects when replacing an existing domain or URL.
