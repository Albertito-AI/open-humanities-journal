# The Human Question: publication operating standard

**Version 1.0 | Effective 8 November 2026**

**Albert Tan Sin Hon, President and Editor-in-Chief**  
The Human Question: A Journal of Humanistic Inquiry  
Editorial office: editor@thehumanquestionjournal.com

Albert approved the house-style sample on 8 November 2026 and instructed that it be saved and published as the operating standard. This version adopts that design for final article production and the journal's policy documents. The original full logo, deep green headings and restrained rust accents form the approved visual identity.

## Authoritative documents

The [publication style guide](../../public/resources/The_Human_Question_Publication_Style_Guide.pdf) specifies typography, layout, references, declarations and final checks. Use the [PDF house-style specimen](../../public/resources/The_Human_Question_House_Style_Template.pdf) for accepted articles. The specimen is instructional and has no publication status.

The [editorial handbook](../../public/resources/The_Human_Question_Editorial_Handbook.pdf) combines the style guide, specimen, author instructions, editorial and peer-review policy, publication ethics, access/rights/privacy policy, reviewer guide and blank author declaration/agreement. Individual PDFs are available at [Policies](https://thehumanquestionjournal.com/#policies) and [House style](https://thehumanquestionjournal.com/#style).

## Publication workflow

1. Receive the manuscript, separate title page and declarations privately by email. Record the manuscript reference, correspondence and desk decision.
2. Assign an independent handling editor when the President and Editor-in-Chief, another editor or a connected person is an author. The conflicted person takes no part in reviewer selection or the decision.
3. Research articles and scholarly or critical essays require at least two independent double-anonymous reports. Record revisions, responses and a reasoned human editorial decision. Label other content according to its actual assessment route.
4. After acceptance, obtain the completed publication agreement, check authorship and permissions, and format the manuscript using the approved template. Authors retain copyright. The normal published article licence is CC BY-NC-ND 4.0. There are no author fees.
5. Check every quotation, citation, pinpoint, link, figure credit, declaration and metadata field against the final text. Remove instructional placeholders. Obtain all authors' final proof approval through the corresponding author and keep the evidence privately.
6. Publish only the agreed final PDF and public metadata. Follow [Adding articles](../ADDING_ARTICLES.md), run the repository checks, inspect the built files and verify live downloads. Keep confidential drafts, reports and correspondence outside the public repository.
7. Preserve the final sources, PDFs and metadata in separate controlled copies. Apply the corrections policy after publication. An archive webpage is not an external preservation deposit.

## Version control and changes

The guide and template control production; the current dated policies control editorial handling and rights. Do not silently change an executed author agreement. Any exception requires an explicit recorded editorial decision and, where rights or approved text change, the relevant author's agreement. Record a new version and effective date for substantive changes and retain the preceding edition.

The current journal has no published articles or assigned ISSN. Do not add identifiers, indexing, memberships, editorial appointments or preservation-service participation without evidence.

## Maintainer checks

Rebuild temporary production masters outside the public directory with `python docs/publication/build_publication_documents.py` in an environment with python-docx and the documented fonts. Render and inspect every page before replacing PDFs. The combined handbook must reproduce those final PDFs and retain navigable section bookmarks. The generator does not itself approve text or execute agreements.
