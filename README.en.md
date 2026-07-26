# Korea100 — Korea's Public Systems in One View

<p align="center">
  <a href="README.md">한국어</a>
  &nbsp;·&nbsp;
  <strong>English</strong>
</p>

> Just as a business has a business model, a country has institutional models.

[![License: MIT](https://img.shields.io/badge/License-MIT-0f9f72.svg)](LICENSE)

Korea100 is a public web service that breaks down **505** of Korea's major public systems into laws, organizations, processes, documents, and deadlines. Each system is presented through a **one-page brief (canvas)** and a **process map (swimlane)**. It began with 100 representative systems and has grown to 505 through public requests.

**👉 Explore it now: https://hosungseo.github.io/korea100/**

## What can you explore?

- **Find a system** — Search 505 systems from the home page by law, agency, document, or bottleneck keywords, browse by topic, and compare up to three systems side by side using the same criteria.
- **One-page system brief** — Read each system's purpose, stakeholders, legal basis, institutional authority, flows of money and documents, bottlenecks, and improvement points in a nine-panel canvas.
- **Process map** — See who does what, when, and under which legal provisions. The map includes applicants, reviewing bodies, objections, and return paths.
- **Open verification ledger** — The [/verification/](https://hosungseo.github.io/korea100/verification/) page openly lists 1,924 items that cannot be confirmed from statutes alone and require field verification, together with the reason for each item.

## Comparative-law pilots

Alongside the 505 domestic systems, Korea100 publishes two pilots that read procedures from overseas laws using the same process-map format. These pilots are not included in the domestic total.

- [Japan environmental impact assessment process map](docs/comparative-law-pilot/japan-environmental-impact-assessment.md)
- [Vietnam commercial import customs-clearance process map](docs/comparative-law-pilot/vietnam-commercial-import-customs.md)

## How is this data verified?

Accuracy is a core value of this project. The 6,883 process nodes, 7,615 connections, and 10,286 links to statutory source text are managed using the following principles.

1. **Compare primary text** — Every citation is checked against the current source text in the Korean Law Information Center. We verify not only that an article number exists, but that it actually establishes the stated action, actor, and deadline.
2. **Validate at multiple levels** — We combine automated checks for structure, citation format, and reachability with substantive comparison of provisions, independent reconstruction of the procedure from legal text, cross-checks against the existing map, and stakeholder walkthroughs for applicants and objectors.
3. **Do not invent citations** — For citations that cannot be confirmed from primary text—such as directives, notices, or internal rules unavailable through public APIs—we do not infer article numbers. They are marked `unverified` and passed to the field-verification ledger.
4. **Publish correction history** — Discovered and corrected errors are retained in each system's `warnings` data with dates and sources.

## Notes

- Node statuses in process maps, such as “in progress,” are editorial states used to explain institutional flows; they are not real-time administrative data.
- Each system displays a legal reference date as `asOfDate`. Laws change, so consult the original source before making an important decision.
- This content is a guide to understanding public systems. It does **not** replace legal advice or an official interpretation by a government agency.

## Request a system

If a system you want to understand is not yet included, submit it through the [request page](https://hosungseo.github.io/korea100/request/). Entries are not stored on a server; they only create a draft in your email application.

---

## For developers and contributors

For local setup, the data contract, validation scripts, and repository structure, see [docs/development.md](docs/development.md).

## License

Except for clearly identified third-party materials, this repository's source code and project-created documents, data, and images are released under the [MIT License](LICENSE). You may use, copy, modify, merge, publish, distribute, sublicense, and sell copies, provided that the copyright notice and MIT permission notice are included in copies or substantial portions. The project is provided as-is, without warranty.

Rights and terms of use for third-party materials—such as source text from the Korean Law Information Center and externally linked materials—remain with their respective original sources.
