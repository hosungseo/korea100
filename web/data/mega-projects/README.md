# Mega-project overlays

This directory composes reusable Korea100 institution processes into a project-level dependency graph.

The overlay does not mutate or duplicate the institution source files in `data/institutions`. It references them as templates, then connects procedures through canonical artifacts such as an industrial-complex designation notice, an environmental consultation result, or a grid-connection clearance.

## Files

- `artifacts.json`: canonical cross-process outputs and milestone definitions.
- `projects/*.json`: project instances with actual status, conditional rules, requirements, outputs, evidence, and Korea100 references.
- `map-tracks/*.json`: presentation config for the warroom dependency map (`/warroom/map/`) — title, nav links, chip tracks, and either an explicit `layout` or a `columns` assignment for auto-layout. One file per project id.
- `../../scripts/validate-mega-projects.mjs`: structural, reference, rule, cycle, and readiness validation.

## Warroom dependency map

`npm run generate:warroom-map:all` renders every project into `public/warroom/map/`. The default project (Gwangju) writes to that directory directly so its URL stays stable; any other project writes to `public/warroom/map/<projectId>/` and the page reads it via `/warroom/map/?p=<projectId>`.

The generator emits `data.json`, `procedures.json`, and `config.json`. Everything project-specific in the page — heading, nav, level chips, track chips, canvas layout — comes from `config.json`, so the map HTML itself stays project-neutral. Counts in the "전체" blurb are interpolated from real node and edge counts (`{gates}`, `{deps}`, `{completed}`, `{active}`, `{remaining}`), never hand-written.

Track chips support three selection modes:

- `target`: highlight the full ancestor cone of one gate, optionally trimmed to `stages`. Use where a genuine finish-to-start chain exists.
- `nodes`: highlight an explicit gate set. Use where a policy field is a bundle of parallel tasks and ancestor tracing would collapse to a single root.
- computed views: `pmbrief`, `critical`, `bottleneck`, `risk`, `signals`. The signals chip is dropped automatically when the project has no `signals.json`.

### Decision tiers

The "보는 급" lens ranks each gate by its `actorRoles.decision` entries, falling back to `lead` when `decision` is empty. That fallback is a silent accuracy trap: a gate whose decision-maker is unrecorded gets classified by its lead ministry instead, which pushed 14 of the 5극3특 gates into "실무·사업자·기타" until the field was filled. **Fill `actorRoles.decision` for every gate** — an empty one is a validation error, not an optional field.

Two tiers exist beyond the Gwangju set, added for policy projects:

- `legislature` — 국회 / 지방의회. A gate that cannot advance until a statute is enacted or amended. Matched on anchored tokens so committee names ending in 의회 (전력정책심의회) are not caught. Where a gate needs both legislation and ministry execution, list both actors; the tier resolves to the higher one.
- `presidential_committee` — 대통령 소속 위원회 whose deliberation is a statutory precondition (지방시대위원회 per 균형성장법 §62, whose 심의·의결 is required by §9, §23, §31; 국토정책위원회 per 국토기본법 §12). Ranked below 국회 and above 부처 장관, because a general 심의위원회 tier would understate it.

### Artifact categories

`legal` and `financial` were added to the whitelist for policy projects: a physical development project has no artifact that is "a statute being enacted" or "a budget account being created", so the original vocabulary had no slot for them. Do not reach for them when an existing category fits — 광역철도 확충 and 거점공항 육성 are `infrastructure`, and an 예타면제 의결 that fixes project scope is `plan`.

## Dependency model

Each project node declares:

- `leadActor`: the single responsibility lane where the node is rendered. A node is never duplicated across lanes.
- `actorRoles`: explicit `lead`, `consult`, and `decision` institutions for the handoff. The legacy `authority` string remains descriptive evidence, not a lane-classification shortcut.
- `requires`: artifact dependencies. Each dependency is typed by relation, strength, and basis.
- `produces`: canonical artifact IDs emitted when the node completes.
- `activation`: whether the node is always present or selected by a scenario rule.
- `templateRefs`: optional references to reusable Korea100 institution process nodes.

### Detail expansion states

Project nodes are milestone containers rather than leaf procedures. The Gwangju audit currently separates 49 intermediate milestones, while the count may change when a new independent statutory output or cross-agency handoff is verified. On 4K displays the board expands each container with its referenced Korea100 subprocesses and marks the confidence of that expansion:

- `MAP`: `templateRefs.nodeIds` explicitly selects the subprocess nodes applied to the project milestone. `mappingStatus` is omitted or set to `exact`.
- `TPL`: the institution template is connected as an applicability candidate until project-specific law and facts are checked. Omitting `nodeIds` shows the full template; `mappingStatus: "candidate"` may be combined with `nodeIds` to show only the relevant candidate subset without claiming that it applies.
- `MIX`: a milestone combines explicitly selected nodes and whole-template candidates.
- `GAP`: the milestone still needs a reusable template or a project-specific subprocess decomposition.

Candidate nodes must not be reported as confirmed project requirements. Counts in the UI are occurrence counts inside milestone containers; the same reusable template may appear under more than one milestone. Internal template edges are visually faint, while cross-milestone artifact handoffs remain prominent.

The 2026-08-17 Gwangju expansion links 91 unique Korea100 templates across the 49 milestones. The third audit added 17 reusable models for building demolition, asbestos, construction waste, fugitive dust and specific construction, nonpoint pollution, water reuse, ecosystem-conservation charges, metropolitan transport, landscape review, mechanical and ICT inspections, elevators, heat-use equipment, environmental liability insurance, odor facilities, cadastral confirmation, and dedicated waterworks. It also connected eight existing operation-stage templates that had not yet appeared in this project overlay: occupational risk assessment, serious-accident governance, national-core-technology review, two foreign-investment paths, strategic-goods export control, critical-information-infrastructure protection, and research-lab safety. Project facts such as facility capacity, excavation depth, annual chemical volume, emissions, equipment type, development area, investor nationality, technology or infrastructure designation, and road class remain unresolved, so those paths are selected `TPL` candidates rather than confirmed requirements. Construction-waste, construction-environment reporting, nonpoint-source implementation, building-system inspections, ICT inspections, cadastral confirmation, and industrial-complex occupancy are mapped as explicit continuations of stated project milestones.

Dependency relations:

- `finish_to_start`: the producer must complete before the consumer may start.
- `start_to_start`: the predecessor allows parallel pre-work; it is not a completion gate.
- `finish_to_finish`: both may run in parallel, but the predecessor must complete before the consumer completes.
- `satisfied_by`: a consolidated approval legally satisfies a referenced permit path without deleting its substantive requirements.

Strengths:

- `hard`: used for readiness and critical-path calculation.
- `soft`: coordination or best-practice dependency shown as a warning, not a legal lock.

Kinds distinguish `legal`, `protection`, `technical`, `policy`, and `financial` dependencies. A legal or technical prerequisite must never be inferred solely from sequence in a Korea100 diagram; it needs a source or an explicit `modeled` note.

Project-level `actors` define the ordered responsibility lanes. The UI keeps stages on the horizontal axis, actors on the vertical axis, and visually strengthens edges whose producer and consumer have different `leadActor` values.

## Conditional paths

Project rules are deliberately three-state or enumerated. An unresolved rule remains `unknown`; the validator does not silently choose a favorable path. This is used for issues such as:

- whether private-land compensation is required outside the former military-airport parcel;
- whether a national-heritage impact diagnosis is triggered;
- whether the project follows formal grid-impact assessment or an exemption/expedited route.

## Status semantics

- `completed`: official evidence confirms completion; its artifacts satisfy downstream requirements.
- `active`: officially under way but not complete.
- `planned`: announced or modeled as a future step.
- `unknown`: the public record is insufficient.

The validator reports nodes that are ready now based only on completed hard prerequisites and resolved activation rules.
