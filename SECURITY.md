# Security and privacy

Report a suspected vulnerability through this repository's **Security → Report a vulnerability** private channel, or email **editor@thehumanquestionjournal.com** with the subject “Website security report”. Include the affected URL/version, a minimal reproduction and impact. Do not put credentials, confidential manuscripts or exploit details in a public issue. Do not test other people's data, send malicious attachments, perform denial-of-service tests or social-engineer authors and reviewers.

This is a static website with no author accounts, upload endpoint, database or mailbox integration. Its optional covering-email helper runs locally in the browser and does not send or save submissions to a server. The editorial mailbox and confidential review records are separate systems.

## Enforced in the code and CI

- Only declared public data is exported. Article identifiers, HTTPS links and PDF paths are validated; traversal, encoded paths, hidden files, symlinks and unpublished article assets are rejected.
- Metadata is escaped in HTML, JSON-LD, RIS and BibTeX. Frontend archive entries use DOM text rather than interpreted HTML.
- Public documents are PDF-only. Scripts and styles belong in reviewed source, not public upload folders. PDF inspection rejects JavaScript, automatic actions, attachments, interactive forms, encrypted documents and unsafe links. SVG inspection rejects scripts, event handlers and external references. Parsing uses time and memory limits in Linux CI.
- Cloudflare Pages `_headers` sets a restrictive Content Security Policy, anti-framing, MIME-sniffing protection, referrer and permissions policies, and HTTPS transport protection. Other hosts must configure equivalent response headers. These controls apply to static responses; adding server functions requires a fresh review.
- Browser assets have content-derived filenames. Build failures leave the preceding distribution intact.
- Validation has a read-only GitHub token and no persisted checkout credentials. Actions and the existing maintenance workflow are pinned to commit hashes. Dependabot proposes updates; merging remains a reviewed operation.

Run `npm test`, `npm run build`, then install `requirements-security.txt` with `pip --require-hashes --only-binary=:all:` in a virtual environment and run `python -m unittest discover -s tests -p 'test_security_*.py'` and `python scripts/audit_public_assets.py public` before publication. Keep the GitHub `check` status required on the production branch.

These controls reduce risk; they do not prove that a file is malware-free, that prose is truthful, or that an account cannot be compromised. Review final PDFs and scan incoming attachments with maintained endpoint protection. No confidential draft, reviewer report, password, token or private editorial record belongs in this public repository, including its issues and Actions logs.

See [the maintainer security runbook](docs/SECURITY_RUNBOOK.md) for access, release and incident procedures.
