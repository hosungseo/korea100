# Korea Institution 100 Design System

## 1. Atmosphere & Identity

A quiet public-policy command desk. The site should feel like a trustworthy reference product rather than a campaign page: clear, structured, calm, and ready for repeated use by 공무원, 보좌진, 연구자, 기자, and policy-curious readers. The signature is the `제도 모델 패널`: a dense but readable structure that pairs legal basis, actors, status, and bottlenecks in one view.

## 2. Color

### Palette

| Role | Token | Value | Usage |
| --- | --- | --- | --- |
| Canvas | `--color-canvas` | `#fcfcfb` | Page background |
| Surface | `--color-surface` | `#ffffff` | Main panels and content blocks |
| Surface muted | `--color-surface-muted` | `#f5f7f6` | Subtle bands and inactive rows |
| Surface tint | `--color-surface-tint` | `#eef8f3` | Accent-backed summaries |
| Text primary | `--color-text` | `#111714` | Headings and primary copy |
| Text secondary | `--color-muted` | `#5d6b63` | Body support copy |
| Text faint | `--color-faint` | `#87938d` | Metadata and helper labels |
| Border | `--color-border` | `#dde5df` | Separators and panel borders |
| Border strong | `--color-border-strong` | `#bdcbc4` | Active panel borders |
| Accent | `--color-accent` | `#0f9f72` | Primary action, focus, active states |
| Accent dark | `--color-accent-dark` | `#087452` | Hover and high-contrast accent text |
| Accent soft | `--color-accent-soft` | `#dff5eb` | Badges and selected backgrounds |
| Warning | `--color-warning` | `#c78116` | Bottleneck and risk labels |
| Ink | `--color-ink` | `#0b1410` | Dark buttons and high-contrast chips |

### Rules

- Accent green is functional: active states, primary actions, selected rows, focus rings.
- Warning amber is used only for bottlenecks, review-needed markers, or status risk.
- Use borders and tonal shifts for hierarchy; avoid heavy shadows.
- No decorative purple/blue gradients.

## 3. Typography

### Scale

| Level | Size | Weight | Line Height | Tracking | Usage |
| --- | --- | --- | --- | --- | --- |
| Display | `48px` desktop / `32px` mobile | 720 | 1.1 | 0 | Product title |
| H1 | `36px` desktop / `30px` mobile | 720 | 1.15 | 0 | Detail and utility page title |
| H2 | `28px` | 680 | 1.2 | 0 | Panel heading |
| H3 | `20px` | 680 | 1.3 | 0 | Card title |
| Body large | `18px` | 450 | 1.65 | 0 | Lead copy |
| Body | `16px` | 430 | 1.65 | 0 | Default copy |
| Body small | `14px` | 450 | 1.55 | 0 | Metadata and helper copy |
| Label | `12px` | 700 | 1.4 | 0.06em | Uppercase labels |
| Mono | `12px` | 650 | 1.5 | 0.04em | Step codes and evidence IDs |

### Font Stack

- Primary: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif`
- Mono: `"SFMono-Regular", "Roboto Mono", "Cascadia Code", ui-monospace, monospace`

### Rules

- Korean display text uses 0 letter spacing to avoid awkward CJK texture.
- Use platform optical sizing and tabular numerals for changing counts and status metrics.
- Font sizes change only at explicit breakpoints; do not scale type continuously with viewport width.
- Headings may be large only in the top product area; panels use compact heading sizes.
- Do not place a final particle or short Korean ending alone if manual copy can avoid it.

## 4. Spacing & Layout

### Base Unit

All spacing derives from 4px.

| Token | Value | Usage |
| --- | --- | --- |
| `--space-1` | `4px` | Tight inline gaps |
| `--space-2` | `8px` | Button/icon gaps |
| `--space-3` | `12px` | Compact padding |
| `--space-4` | `16px` | Default gap |
| `--space-5` | `20px` | Panel inner rhythm |
| `--space-6` | `24px` | Card padding |
| `--space-8` | `32px` | Section gap |
| `--space-10` | `40px` | Large panel padding |
| `--space-12` | `48px` | Section padding |
| `--space-16` | `64px` | Major vertical rhythm |

### Grid

- Max content width: `1200px` (`1248px` including shell padding)
- Home hierarchy: hero, featured process structure, then the searchable catalog
- Desktop catalog: compact controls above a three-column card grid
- Detail: single reading column with sticky section tools; process boards own their horizontal overflow
- Mobile: one-column catalog, fixed-format controls, vertical process timelines, and no document-level horizontal overflow

## 5. Components

### Top Navigation

- Structure: brand text, anchor links, primary CTA.
- States: hover underline, focus ring, active hash target state.
- Accessibility: anchors remain real links.

### Institution Card

- Structure: priority, category, title, type, one-line promise, verification summary, compare checkbox.
- States: hover border tint, selected comparison state, keyboard focus.
- Twelve cards render first; additional cards load without changing control dimensions.

### Comparison Table

- Supports two or three institutions and ten shared comparison rows.
- On mobile the table scrolls inside its own wrapper; the page itself never scrolls horizontally.
- A fixed action bar makes selected count, clear, and compare actions predictable.

### Detail And Process Tools

- Section links cover summary, process, evidence, issues, and related institutions.
- Share, PNG export, and print/PDF are explicit commands with status feedback.
- Process is the first detail section and defaults to the full swimlane. The core-flow summary remains URL-addressable with `?process=summary`.
- Below `900px`, full mode defaults to the same swimlane representation inside a bounded two-axis viewport. Stage headers stay pinned to the top and actor lanes stay pinned to the left.
- Mobile offers compact stage jumps, native touch panning and browser zoom, keyboard arrow navigation, and a vertical timeline alternative with actor filtering.
- Both mobile representations open the same verified detail drawer as desktop nodes, preserving legal evidence, URL state, focus trapping, and focus restoration.

### Verification Queue

- Structure: public totals, trust definitions, search and domain filters, evidence cards.
- Status language distinguishes article existence, scope review, and field verification.
- Public evidence links warn against personal information and non-public internal material.

### Request Form

- Structure: 제도명, 궁금한 지점, 이용자 유형, submit.
- States: default, validation error, and mail-app handoff.
- Build a `mailto:` draft in memory without sending form values to a server or browser storage.
- Accessibility: all inputs have visible labels.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
| --- | --- | --- | --- |
| Press | `120ms` | `cubic-bezier(.23,1,.32,1)` | Pointer-down feedback |
| State | `140–180ms` | `cubic-bezier(.23,1,.32,1)` | Selection, comparison, feedback |
| On-screen move | `180ms` | `cubic-bezier(.77,0,.175,1)` | Connected state changes |
| Drawer | `240ms` enter / `160ms` exit | `cubic-bezier(.32,.72,0,1)` | Node detail from and to the right edge |

### Rules

- Animate only `opacity` and `transform`; never use `transition: all` or animate layout dimensions.
- Repeated operational states use static emphasis. No decorative pulse or ambient loops.
- Gate hover effects behind `hover: hover` and `pointer: fine`.
- `prefers-reduced-motion` keeps short color and opacity feedback but removes movement.
- `prefers-reduced-transparency` replaces blurred sticky surfaces with solid backgrounds.
- Drawers trap focus, restore it to the triggering node, and close immediately on Escape.
- Motion signals spatial origin, state change, or direct feedback only.

## 7. Depth & Surface

### Strategy

Use mixed borders and tonal shifts. Shadows are minimal and used only for the sticky nav and focused preview surface.

| Level | Value | Usage |
| --- | --- | --- |
| Border subtle | `1px solid var(--color-border)` | Panels and rows |
| Border active | `1px solid var(--color-border-strong)` | Selected elements |
| Shadow soft | `0 16px 48px rgba(16, 33, 24, .08)` | Preview surface only |

### Rules

- Cards and framed tools use at most 8px radius; compact buttons use 4–6px radius.
- Reserve circles for status dots and icon-only controls. Do not use text pills when a standard control fits.
- Do not nest cards inside cards. Repeated items may be cards; full sections are unframed or single panels.
