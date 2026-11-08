# Static-site security review

Review date: 8 November 2026.

The primary release is a static journal website: public information, submission instructions, house-style resources and an archive of approved article PDFs. Peer review and author correspondence take place by email. This release has no manuscript-upload form, reviewer account system, editorial database or private editorial API.

This review concerns the website's source, generated pages and publication build. It does not certify email confidentiality, independently verify peer review, or constitute a penetration test.

## Publication boundary

Everything deliberately placed in the generated website is public when the Site is made public. Publish only final articles and other material cleared for release. Author contact details, unpublished drafts, referee reports, editorial correspondence and credentials belong outside this repository and its `public` directory.

The build is expected to emit a limited public metadata model. HTML text, attributes, structured metadata and citations must remain data, even when source strings contain markup. Article PDF references must resolve to real files inside the designated public article directory. A path traversal, external file path or symlink must not cause a private file to enter the publication output.

## Verification record

The independent static-site security suite passed all 11 checks on 8 November 2026:

```sh
node --test tests/security-static.test.mjs
```

| Area | What was checked |
| --- | --- |
| PDF publication paths | Traversal, encoded traversal, remote paths, hidden paths, missing files, non-PDF signatures, file symlinks and symlinked parent directories are rejected. |
| Accidental file publication | Hidden public assets, unrelated symlinks and unreferenced article PDFs fail the build. A validation failure leaves the previous distribution intact. |
| Public metadata | Unknown author-email, review, credential and private-file-key fields are omitted from the generated catalogue and pages. |
| Page and citation injection | Hostile titles, authors, abstracts and keywords remain escaped text. Structured metadata cannot close its script element. Citation exports prevent newline-based record injection. |
| Links | Journal website URLs require HTTPS and reject embedded credentials. Links opening new browsing contexts include `noopener`. |
| Covering-email privacy | The draft button is disabled until JavaScript loads, is not a native submit button, and the document's content policy blocks native form submissions. The helper cannot fall back to submitting personal fields through a GET form when its script fails. |

Source inspection of `src/main.js` found article metadata rendered through DOM `textContent` and draft text through a textarea value. The helper makes no network write and uses no server storage. Catalogue reads are same-origin. Copying or saving a draft is initiated by the visitor and does not send an email.

The supplied Word template's ZIP structure was also inspected: no macro or embedded-object entries and no external-target relationship parts were found. This is a limited package inspection, not a malware scan.

The tests use temporary synthetic publications and do not publish those fixtures. They exercise the build and generated output, not a browser penetration test or the hosting provider's infrastructure. The owner's browser and deployed-URL checks are separate verification steps.

## Human publication checks

Before adding an article, the responsible editor must confirm the editorial decision, completed review process, author approval of the proof, rights to publish and the stated reuse licence. The website records published material; it cannot establish that these matters are true simply from a metadata field.

Inspect the final PDF for accuracy, accessibility and unintended document properties or comments. A PDF signature check establishes only a limited file-format property. It is not a malware scan or a check of publication permission.

## Operational limits

The site does not operate an email service. A submission address must be a working mailbox controlled by the journal, with its own access and retention arrangements. A `mailto:` link opens a visitor's email application; it does not confirm that a message was sent or received.

Keep independent copies of the source, final PDFs and published metadata. Test that the site can be rebuilt from a fresh checkout. Hosting and domain continuity still depend on their providers and the account owner's arrangements.
