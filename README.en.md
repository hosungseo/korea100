<p align="center">
  <img src="assets/readme/korea100-hero.svg" alt="Korea100 — a map for reading Korea's public systems" width="100%" />
</p>

<p align="center">
  <a href="README.md">한국어</a>
  &nbsp;·&nbsp;
  <strong>English</strong>
</p>

<p align="center">
  <a href="https://hosungseo.github.io/korea100/"><strong>Open the service</strong></a>
  &nbsp;·&nbsp;
  <a href="https://hosungseo.github.io/korea100/verification/"><strong>Verification ledger</strong></a>
  &nbsp;·&nbsp;
  <a href="#principles-for-reading-the-data"><strong>Validation principles</strong></a>
  &nbsp;·&nbsp;
  <a href="docs/development.md"><strong>Development documentation</strong></a>
</p>

> **A public web service that breaks down Korea's key public systems into laws, agencies, documents, deadlines, and bottlenecks—then makes them readable through one-page briefs and process maps.**
>
> Just as a business has a business model, a country has institutional models. Korea100 turns those models into administrative literacy that anyone can follow.

## Read public systems this way

| Dense source text | Korea100 structure | Questions it helps answer |
| --- | --- | --- |
| Statutes, agencies, and deadlines scattered across source material | **One-page brief**: purpose, authority, flows of money and documents, bottlenecks | Why does this system exist, and what do I need to do? |
| Application, review, notice, and objection procedures | **Process map**: actor lanes, stages, legal basis, return paths | Who decides what and when—and where do I go if the process stalls? |
| Operating information that statutes alone cannot verify | **Verification ledger**: published sources and reasons further confirmation is needed | What has been verified, and what still needs checking? |

**Korea100 does not stop at summarizing statutes. It turns prose into structure maps so the path through an administrative system becomes visible.**

## What you can explore now

| 509 | 6,883 | 8,746 | 1,924 |
| :---: | :---: | :---: | :---: |
| systems | process nodes | legal citations | items requiring field verification |

- **Find a system** — Search 509 systems by laws, agencies, documents, or bottlenecks, and compare up to three with the same criteria.
- **One-page system briefs** — Read the purpose, stakeholders, legal basis, institutional authority, flows of money and documents, bottlenecks, and improvement points on one screen.
- **Process maps** — See how actors such as residents, reviewing bodies, and information systems work in sequence, including the return paths for applications, rejections, and objections.
- **Verification ledger** — Rather than hide or guess at information that statutes alone cannot establish, Korea100 publishes [the reason confirmation is needed](https://hosungseo.github.io/korea100/verification/).

## Principles for reading the data

Accuracy is a core value of this project. Citations to statutes, administrative rules, and treaties attached to process nodes are managed through these principles.

1. **Compare against primary text** — Check the current text in the Korean Law Information Center, confirming not only article numbers but also whether they substantiate the stated action, actor, and deadline.
2. **Validate at multiple levels** — Combine automated checks for structure, citation format, and reachability with substantive comparison of provisions, independent process reconstruction, and stakeholder-perspective walkthroughs.
3. **Do not invent citations** — When directives, notices, or internal rules cannot be confirmed through public APIs, do not infer article numbers; mark them as `unverified`.
4. **Publish correction history** — Record discovered and corrected errors with dates and sources in the `warnings` field of each system's data.

## Use the data and technology further

Korea100 is both a public reading service and a foundation for connecting institutional data to other tools and workflows.

- [Development environment, data contract, and validation scripts](docs/development.md)
- [Administrative Procedure MCP v0.2](mcp/README.md) — query R2 validation procedures and generate next-action packets
- [Chrome side panel](chrome-extension/README.md) — duplicate a system into a personal draft and edit stages, links, and sources
- [Comparative-law pilot: Japan environmental impact assessment](docs/comparative-law-pilot/japan-environmental-impact-assessment.md)
- [Comparative-law pilot: Vietnam commercial import customs clearance](docs/comparative-law-pilot/vietnam-commercial-import-customs.md)

## Systems we can build together

If a system you want to understand is not yet included, submit it through the [request page](https://hosungseo.github.io/korea100/request/). Entries are not stored on a server; they only create a draft in your email app.

## Notes

- Statuses such as “in progress” in the process maps are editorial states used to explain institutional flows, not real-time administrative data.
- Each system shows its legal reference date as `asOfDate`. Laws change, so consult the original text again before making an important decision.
- This content is a guide to understanding public systems. It is not legal advice or an official interpretation by a government agency.

## License

The software in this repository is released under the [MIT License](LICENSE).
