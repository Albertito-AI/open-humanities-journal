# Operating the journal website

The website is a static publication site. The editorial office manages submissions and peer review by email. There are no author accounts, database services or online manuscript-tracking requirements.

## Before opening submissions

Confirm the submission inbox, test receipt and replies, and decide who may access it. The actual address has not yet been supplied. Keep `submissionEmail` as `null` until it is verified; do not invent an address at the journal's domain.

Publish the journal's agreed scope, author instructions, house style, review procedure, responsible editors and contact details. Confirm any statements about charges, author rights and licences. The editor decides when the office is ready to receive papers.

## Editorial process

1. Receive the manuscript by email and give it a stable reference.
2. Make a desk decision on scope and basic suitability.
3. Arrange human peer review, recording reviewer expertise, conflicts and reports privately.
4. Communicate the decision and handle revisions by email.
5. Prepare the accepted text as a final PDF in the journal's house style. Obtain author approval and confirm publication rights and licence.
6. Add the approved PDF and accurate article metadata to the website source, check the build and publish it.

An editor's own manuscript requires independent handling. The website does not assess scholarly quality, verify peer review or grant publication permission. Keep the actual editorial evidence in the office's private records.

## Website updates

Edit public settings in `content/journal.json`, articles in `content/articles.json` and issues in `content/issues.json`. Follow [adding articles](ADDING_ARTICLES.md). Only final files approved for public release belong in `public/articles/`. Keep house-style downloads under `public/resources/`. Check author names, title, abstract, publication date, licence and PDF link against the final approved version. Leave unassigned identifiers absent.

Run `npm test` and `npm run build`, then inspect the generated `dist/` pages and downloads. Check a narrow screen, keyboard navigation and the final PDF. Deploy the checked output using the host's supported workflow. Record the source revision and confirm the deployed result.

GitHub changes and a successful local build do not themselves prove that the live website has been updated. Domain connection also requires the host's actual DNS records and successful validation. Keep this journal separate from Albert Tan's personal website.

## Records and recovery

Keep confidential submissions, review reports, correspondence and credentials out of GitHub. Back up the editorial mailbox and its attachments through the chosen email service, with access limited to authorised staff.

Git retains the public website's source history, but keep an independent copy of the source and final published PDFs as well. Verify that these copies can rebuild the site. The static site does not automatically back up the mailbox or provide a preservation service.

For a website mistake, restore or correct the relevant source and rebuild. Scholarly corrections require an editor's decision and a visible, dated notice where appropriate; do not silently replace an article in a way that obscures a substantive change.

## Maintenance

Check the domain renewal, hosting account and published links periodically. Keep contact information and instructions accurate. The operator remains responsible for the domain, repository, mailbox and host account. Another maintainer should be able to rebuild the website using the README without access to this conversation.
