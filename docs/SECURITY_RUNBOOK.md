# Journal security maintenance

The production journal is a static Cloudflare Pages deployment. Its main remaining trust boundaries are the GitHub publishing account, Cloudflare/domain account, editorial mailbox and the final files authorised for publication. Website code cannot enforce security settings on those accounts.

## Access and release

Use a passkey or two-factor authentication on GitHub, Cloudflare and the mailbox, and keep recovery codes in a password manager. Verify account recovery addresses, domain auto-renewal and registrar lock. Give collaborators only the access they need; review GitHub Apps, deploy keys and Cloudflare API tokens when responsibilities change. Never store credentials in Google Docs, this repository or public files. Account-level authentication and Cloudflare token scope require owner verification and are not certified by this code audit.

Publish through a pull request to `main`. Require the `check` workflow to pass against the up-to-date base and resolve review conversations. Block force pushes and branch deletion. A single maintainer must not configure a second-person approval requirement that nobody can fulfil. Obtain independent review for changes to workflows, build rules and security controls whenever another trusted maintainer is available. CODEOWNERS routes review; it does not grant access or enforce approvals by itself.

Cloudflare production should track only `main`, publish `dist`, and run the documented build. Keep preview deployments free of secrets and confidential submissions. Do not put confidential content into any branch of a public repository. A preview URL is not an access-control boundary.

Do not auto-merge dependency proposals. Review upstream changes and hashes, rerun CI, and inspect the resulting site. The maintenance workflow has actions/issues write permissions for its existing retry and incident functions; it is pinned and receives no inherited secrets. Validation itself remains read-only. Revisit this exception if the maintenance function is retired.

## Publication checks

Only final authorised PDFs go in `public/articles`, paired with accurate catalogue records. Journal guides and forms are PDF-only under `public/resources`; temporary editable production sources stay outside the public distribution. Verify permissions, metadata, anonymity and the content visually. The PDF parser is a limited active-content gate, not antivirus or a complete PDF conformance validator. It allows ordinary HTTPS/HTTP/email links and internal destinations, and forbids embedded programs, attachments, automatic actions and interactive forms. Flatten approved forms before publication if necessary; do not disable the gate merely to pass an unexplained file.

The build emits Cloudflare `_headers`. After deployment, inspect actual response headers on the homepage and an article page. Test navigation, catalogue search, the local email draft helper and PDF downloads. Confirm that the Content Security Policy blocks framing and inline/external code without breaking these functions. Other hosts need equivalent header configuration. Check `.well-known/security.txt` before its 8 November 2027 expiry and renew its contact/date.

Keep recoverable Git history and separate copies of the approved public PDFs, catalogue and source. Store confidential editorial records privately with restricted access and an independently tested backup. GitHub history and a Cloudflare deployment history are not substitutes for a complete archival-preservation arrangement.

## Incident response

1. Record the affected URL, time, deployed commit and evidence privately. Do not redistribute a suspicious download.
2. If readers are exposed, roll back Cloudflare to a known-good deployment and pause further production releases. Preserve the suspect commit for investigation.
3. If an account or token is compromised, the owner revokes sessions/tokens, changes credentials through the provider and checks GitHub/Cloudflare/mailbox audit logs, collaborators, DNS and forwarding rules.
4. Correct the cause in a reviewed pull request. Run all checks and independently inspect public files before redeployment. Verify the live result.
5. Notify affected people through the editorial office when appropriate, record corrective action privately, and publish a factual notice if the scholarly record was affected.

## Scope of the 8 November 2026 review

The review covers this repository's static build, browser code, public document formats and GitHub configuration. It is not a penetration test of Cloudflare, GitHub, email providers or unrelated repositories. It does not establish that all of Albert's other GitHub projects have the same protections. New accounts, uploads, APIs, payment functions or third-party scripts require another security review before release.
