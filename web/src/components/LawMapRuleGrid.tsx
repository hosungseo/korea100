"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import type { EdgeKind, LawMap, LawMapClass } from "@/lib/law-map-types";
import { CELL_CHIP_LIMIT, buildRuleGrid, describeEvidence } from "@/lib/law-map-rule-layout.mjs";
import type { RuleCell, RuleChip } from "@/lib/law-map-rule-layout.mjs";
import { ACTOR_LABELS, EDGE_COLORS, EDGE_LABELS, STAGE_LABELS } from "./law-map-constants";
import styles from "./LawMapBoard.module.css";

interface Props {
  map: LawMap;
  classMap: LawMapClass | null;
  kinds: Set<EdgeKind>;
  selected: string | null;
  onPick: (id: string) => void;
}

const ROW_HEAD_W = 128;
/** 열 너비(px). 칩이 이 안에서 줄바꿈한다. 열이 적으면 1fr로 늘어나 상자를 채운다. */
const COL_W = 236;

/**
 * 규율 보기: 주체 레인(세로) × 규율 단계(가로) 격자에 법률 조문을 칩으로 놓는다.
 * 칸은 칩 5개까지 보이고 "+N"을 누르면 제자리에서 펼쳐진다. 칩을 누르면 자세히 보기로 넘어가 그 조문을 연다.
 */
export default function LawMapRuleGrid({ map, classMap, kinds, selected, onPick }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [hover, setHover] = useState<RuleChip | null>(null);
  const [canHover] = useState(() => typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches);

  const grid = useMemo(() => buildRuleGrid(map, classMap), [map, classMap]);

  const onMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    const tip = tooltipRef.current;
    const host = hostRef.current;
    if (!tip || !host) return;
    const base = host.getBoundingClientRect();
    const px = event.clientX - base.left;
    const py = event.clientY - base.top;
    const flip = px + 280 > base.width;
    tip.style.left = `${(flip ? px - 12 : px + 14) + host.scrollLeft}px`;
    tip.style.top = `${py + 14 + host.scrollTop}px`;
    tip.style.transform = flip ? "translateX(-100%)" : "";
  };

  const toggle = (key: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const tooltip = hover && canHover ? describeChip(hover, kinds) : null;
  const columnsCss = `${ROW_HEAD_W}px repeat(${grid.columns.length}, minmax(${COL_W}px, 1fr))`;
  const ariaLabel = `${map.name} 규율 구조도 — 세로 ${grid.rows.map((r) => r.label).join("·")}, 가로 ${grid.columns.map((c) => c.label).join("·")}. 법률 조문 ${grid.total}개를 규칙으로 분류해 놓은 격자.`;

  return (
    <div className={styles.rgWrap}>
      <div className={styles.ovHead}>
        <p className={styles.ovTitle}>{grid.headline.title}</p>
        <p className={styles.ovSub}>
          {grid.headline.subtitle} · 법률 조문 {grid.total}개{grid.deleted > 0 ? ` (삭제 ${grid.deleted} 제외)` : ""}
          {grid.withSecondary > 0 ? ` · ↔ 보조 주체 있음 ${grid.withSecondary}` : ""}
        </p>
      </div>
      <div className={styles.rgHost} ref={hostRef} onMouseMove={onMouseMove} onMouseLeave={() => setHover(null)}>
        {grid.total > 0 && (
          <div
            className={styles.rgGrid}
            style={{ gridTemplateColumns: columnsCss, width: `max(100%, ${ROW_HEAD_W + COL_W * grid.columns.length}px)` }}
            aria-label={ariaLabel}
          >
            <div className={styles.rgCorner} aria-hidden>
              <span>주체 ↓</span>
              <span>단계 →</span>
            </div>
            {grid.columns.map((col) => (
              <div key={col.stage} className={styles.rgColHead} data-unclassified={col.stage === "unknown" || undefined}>
                <strong>{col.label}</strong>
                <span>{col.count}</span>
              </div>
            ))}
            {grid.rows.map((row) => (
              <Fragment key={row.actor}>
                <div className={styles.rgRowHead} data-unclassified={row.actor === "unknown" || undefined}>
                  <strong>{row.label}</strong>
                  <span>{row.count}</span>
                </div>
                {grid.columns.map((col) => {
                  const cell = grid.cellOf(col.stage, row.actor);
                  const key = `${col.stage}|${row.actor}`;
                  return (
                    <div
                      key={key}
                      className={styles.rgCell}
                      data-empty={!cell || undefined}
                      data-unclassified={col.stage === "unknown" || row.actor === "unknown" || undefined}
                    >
                      {cell && (
                        <CellView
                          cell={cell}
                          cellId={`rg-${map.lawId}-${col.stage}-${row.actor}`}
                          expanded={expanded.has(key)}
                          onToggle={() => toggle(key)}
                          kinds={kinds}
                          selected={selected}
                          onPick={onPick}
                          onHover={setHover}
                        />
                      )}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        )}
        <div ref={tooltipRef} className={styles.tooltip} data-show={tooltip !== null} role="presentation">
          {tooltip && (
            <>
              <strong>{tooltip.title}</strong>
              <span className={styles.tooltipSub}>{tooltip.sub}</span>
              {tooltip.secondary && <span className={styles.tooltipSub}>{tooltip.secondary}</span>}
              {tooltip.items.length > 0 && (
                <span className={styles.tooltipList}>
                  {tooltip.items.map((item, i) => <span key={i}>{item}</span>)}
                  {tooltip.more > 0 && <span>외 근거 {tooltip.more}</span>}
                </span>
              )}
              {tooltip.kinds.length > 0 && (
                <span className={styles.tooltipKinds}>
                  {tooltip.kinds.map(([kind, count]) => (
                    <span key={kind}><i style={{ background: EDGE_COLORS[kind] }} />{EDGE_LABELS[kind]} {count}</span>
                  ))}
                </span>
              )}
              <span className={styles.tooltipHint}>클릭하면 자세히 보기로 이동</span>
            </>
          )}
        </div>
      </div>
      <p className={styles.rgNote}>
        조문의 단계·주체는 규칙 기반 추론({grid.method?.replace(/^rule-based\s*/, "") ?? "v0.2"})입니다. 근거는 각 조문 툴팁에 있고, 원문이 기준입니다. 공무원도 수범자(국민·사업자 레인)로 셉니다.
      </p>
    </div>
  );
}

interface CellProps {
  cell: RuleCell;
  cellId: string;
  expanded: boolean;
  onToggle: () => void;
  kinds: Set<EdgeKind>;
  selected: string | null;
  onPick: (id: string) => void;
  onHover: (chip: RuleChip | null) => void;
}

function CellView({ cell, cellId, expanded, onToggle, kinds, selected, onPick, onHover }: CellProps) {
  const shown = expanded ? cell.articles : cell.articles.slice(0, CELL_CHIP_LIMIT);
  const hidden = cell.articles.length - shown.length;
  const badges: [EdgeKind, number][] = (["decree", "rule"] as const)
    .filter((kind) => kinds.has(kind) && cell.delegations[kind] > 0)
    .map((kind) => [kind, cell.delegations[kind]]);
  return (
    <>
      <div className={styles.rgChips} id={cellId}>
        {shown.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={styles.rgChip}
            data-node-id={chip.id}
            data-low={chip.lowConfidence || undefined}
            data-selected={selected === chip.id || undefined}
            onClick={() => { onHover(null); onPick(chip.id); }}
            onMouseEnter={() => onHover(chip)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(chip)}
            onBlur={() => onHover(null)}
          >
            <b>{chip.label}</b>
            <span>{chip.title}</span>
            {chip.secondary.length > 0 && <i aria-label={`보조 주체 ${chip.secondary.map((s) => ACTOR_LABELS[s.actor]).join(", ")}`}>↔</i>}
          </button>
        ))}
        {hidden > 0 && (
          <button type="button" className={styles.rgMore} onClick={onToggle} aria-expanded={false} aria-controls={cellId} aria-label={`조문 ${hidden}개 더 보기`}>+{hidden}</button>
        )}
        {expanded && cell.articles.length > CELL_CHIP_LIMIT && (
          <button type="button" className={styles.rgMore} onClick={onToggle} aria-expanded aria-controls={cellId}>접기</button>
        )}
      </div>
      {badges.length > 0 && (
        <div className={styles.rgBadges}>
          {badges.map(([kind, count]) => (
            <span key={kind} style={{ "--kind-color": EDGE_COLORS[kind] } as CSSProperties}>
              {kind === "decree" ? "시행령" : "시행규칙"} ↓{count}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

interface ChipTooltip { title: string; sub: string; secondary: string | null; items: string[]; more: number; kinds: [EdgeKind, number][] }

function describeChip(chip: RuleChip, kinds: Set<EdgeKind>): ChipTooltip {
  const conf = chip.confidence.toFixed(2).replace(/0$/, "");
  const sub = `${STAGE_LABELS[chip.stage]} · ${ACTOR_LABELS[chip.actor]} · 신뢰도 ${conf}${chip.lowConfidence ? " (0.5 미만, 점선)" : ""}`;
  const secondary = chip.secondary.length > 0
    ? `보조 주체: ${chip.secondary.map((s) => `${ACTOR_LABELS[s.actor]}${s.evidence[0] ? `(${s.evidence[0].replace(/^(cue|joint):/, "")})` : ""}`).join(", ")}`
    : null;
  const items = describeEvidence(chip.evidence, 6);
  const delegationKinds: [EdgeKind, number][] = (["decree", "rule"] as const)
    .filter((kind) => kinds.has(kind) && chip.delegations[kind] > 0)
    .map((kind) => [kind, chip.delegations[kind]]);
  return {
    title: `${chip.label} ${chip.title}`.trim(),
    sub,
    secondary,
    items,
    more: Math.max(0, chip.evidence.length - items.length),
    kinds: delegationKinds,
  };
}
