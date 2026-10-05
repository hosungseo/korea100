"use client";

import { Fragment, memo } from "react";
import type { Article, Edge, EdgeKind, Lane, Tier } from "@/lib/law-map-types";
import { countEdgeKinds } from "@/lib/law-map-route.mjs";
import { EDGE_COLORS, EDGE_LABELS, EDGE_ORDER, TIER_LABELS } from "./law-map-constants";
import styles from "./LawMapBoard.module.css";

interface ColumnProps {
  tier: Tier;
  lanes: Lane[];
  articlesByLane: Map<string, Article[]>;
  edgesByNode: Map<string, Edge[]>;
  selected: string | null;
  routeNodes: Set<string>;
  routeFrom: string | null;
  hasRoute: boolean;
  query: string;
  onClick: (id: string) => void;
  onHover: (id: string | null) => void;
}

function LawMapColumn({
  tier, lanes, articlesByLane, edgesByNode, selected, routeNodes, routeFrom, hasRoute, query, onClick, onHover,
}: ColumnProps) {
  const compactQuery = query.replace(/\s+/g, "");
  const isBox = tier === "adminRule" || tier === "ordinance";
  const total = lanes.reduce((sum, lane) => sum + lane.articleCount, 0);
  const headCount = tier === "ordinance"
    ? `${lanes[0]?.collapsed?.count ?? 0}건`
    : tier === "adminRule" ? `${lanes.length}건` : `${lanes.length}건 · 조문 ${total}`;

  const cardProps = (id: string, dotEdges: Edge[], matchText: string) => {
    const match = compactQuery.length > 0 && matchText.replace(/\s+/g, "").includes(compactQuery);
    return {
      id,
      dotEdges,
      selected: selected === id,
      onRoute: routeNodes.has(id),
      isFrom: routeFrom === id,
      match,
      // A search match must stay readable during a route: match wins over dim.
      dim: hasRoute && !match && !routeNodes.has(id),
      onClick,
      onHover,
    };
  };

  return (
    <section className={styles.column} data-tier={tier}>
      <header className={styles.columnHead}>
        <strong>{TIER_LABELS[tier]}</strong>
        <span>{headCount}</span>
      </header>
      {lanes.map((lane) => (
        <div key={lane.id} className={styles.lane}>
          {isBox ? (
            <NodeCard
              label={lane.kind}
              title={tier === "ordinance" ? `조례·규칙 ${lane.collapsed?.count ?? 0}건` : lane.name}
              {...cardProps(lane.id, (edgesByNode.get(lane.id) ?? []).filter((e) => e.to === lane.id), lane.name)}
            />
          ) : (
            <>
              <div className={styles.laneHead}>
                <span>{lane.kind}{lane.effectiveOn ? ` · 시행 ${lane.effectiveOn}` : ""}</span>
                <strong>{lane.name}</strong>
                <a href={lane.officialUrl} target="_blank" rel="noreferrer">법제처 ↗</a>
              </div>
              {(articlesByLane.get(lane.id) ?? []).map((article, index, all) => (
                <Fragment key={article.id}>
                  {article.chapter && (index === 0 || all[index - 1].chapter !== article.chapter) && (
                    <div className={styles.chapter}>{article.chapter}</div>
                  )}
                  <NodeCard
                    label={article.label}
                    title={article.title}
                    {...cardProps(article.id, (edgesByNode.get(article.id) ?? []).filter((e) => e.from === article.id), `${article.label}${article.title}`)}
                  />
                </Fragment>
              ))}
            </>
          )}
        </div>
      ))}
    </section>
  );
}

// Columns only re-render when their own props change; hover state lives in the board.
export default memo(LawMapColumn);

interface CardProps {
  id: string;
  label: string;
  title: string;
  dotEdges: Edge[];
  selected: boolean;
  onRoute: boolean;
  isFrom: boolean;
  match: boolean;
  dim: boolean;
  onClick: (id: string) => void;
  onHover: (id: string | null) => void;
}

function NodeCard({ id, label, title, dotEdges, selected, onRoute, isFrom, match, dim, onClick, onHover }: CardProps) {
  const counts = countEdgeKinds(dotEdges);
  return (
    <button
      type="button"
      className={styles.card}
      data-node-id={id}
      data-selected={selected}
      data-route={onRoute}
      data-from={isFrom}
      data-match={match}
      data-dim={dim}
      aria-pressed={selected}
      onClick={() => onClick(id)}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(id)}
      onBlur={() => onHover(null)}
    >
      <span className={styles.cardLabel}>{label}</span>
      <span className={styles.dots} role="img" aria-label={dotLabel(counts)}>
        {EDGE_ORDER.filter((kind) => counts[kind] > 0).map((kind) => (
          <i key={kind} className={styles.dot} style={{ background: EDGE_COLORS[kind] }}>{counts[kind]}</i>
        ))}
      </span>
      {title && <span className={styles.cardTitle}>{title}</span>}
    </button>
  );
}

function dotLabel(counts: Record<EdgeKind, number>): string {
  const parts = EDGE_ORDER.filter((kind) => counts[kind] > 0).map((kind) => `${EDGE_LABELS[kind]} ${counts[kind]}`);
  return parts.length ? parts.join(", ") : "위임 없음";
}
