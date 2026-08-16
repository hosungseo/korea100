# Mega-project overlays

This directory composes reusable Korea100 institution processes into a project-level dependency graph.

The overlay does not mutate or duplicate the institution source files in `data/institutions`. It references them as templates, then connects procedures through canonical artifacts such as an industrial-complex designation notice, an environmental consultation result, or a grid-connection clearance.

## Files

- `artifacts.json`: canonical cross-process outputs and milestone definitions.
- `projects/*.json`: project instances with actual status, conditional rules, requirements, outputs, evidence, and Korea100 references.
- `../../scripts/validate-mega-projects.mjs`: structural, reference, rule, cycle, and readiness validation.

## Dependency model

Each project node declares:

- `leadActor`: the single responsibility lane where the node is rendered. A node is never duplicated across lanes.
- `actorRoles`: explicit `lead`, `consult`, and `decision` institutions for the handoff. The legacy `authority` string remains descriptive evidence, not a lane-classification shortcut.
- `requires`: artifact dependencies. Each dependency is typed by relation, strength, and basis.
- `produces`: canonical artifact IDs emitted when the node completes.
- `activation`: whether the node is always present or selected by a scenario rule.
- `templateRefs`: optional references to reusable Korea100 institution process nodes.

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
