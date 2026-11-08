# Research and agent discovery

This journal is a static website. It has no backend, manuscript upload service, MCP server, login, automated reviewer or email sender.

| Path | Contents |
| --- | --- |
| `/catalogue.json` | `{journal, issues, articles}` with actual published metadata and PDF links |
| `/journal.json` | Public journal information and configured submission contact |
| `/llms.txt` | Concise scope and discovery links |
| `/articles/SLUG/` | Human-readable article landing page |
| `/articles/SLUG.json` | Schema.org scholarly metadata |
| `/articles/SLUG.bib` | BibTeX citation |
| `/articles/SLUG.ris` | RIS citation |
| `/export-manifest.json` | Distribution files, sizes and SHA-256 hashes |

The initial catalogue is empty. The submission mailbox and ISSN are unconfigured. No publication, identifier, endorsement or indexing claim has been invented.

Agents can retrieve article text and metadata when the hosting access settings permit it. Each article's stated licence governs reuse. Summaries and citations should represent the actual source. No hidden promotional instructions or ranking manipulation is embedded in the files.

Submission and peer review take place by email outside this website. Author accounts are unnecessary. Submissions remain closed until a real mailbox is configured. The machine-readable files do not send messages or accept submissions.

The build exports an explicit public-field allowlist and refuses unreferenced manuscripts under `public/articles/`. Private drafts and editorial correspondence must never be committed to this public repository, even if the build would exclude their metadata fields.

See [ADDING_ARTICLES.md](ADDING_ARTICLES.md) for publication and portability instructions.
