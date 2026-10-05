"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import type { Article, Edge, EdgeKind, Lane, LawMapTexts } from "@/lib/law-map-types";
import type { LawMapRoute } from "@/lib/law-map-route.mjs";
import { EDGE_COLORS, EDGE_LABELS, EDGE_ORDER, TIER_LABELS } from "./law-map-constants";
import styles from "./LawMapBoard.module.css";

interface Props {
  selected: string | null;
  articleById: Map<string, Article>;
  laneById: Map<string, Lane>;
  edgesByNode: Map<string, Edge[]>;
  institutionsByArticle: Map<string, { slug: string; name: string }[]>;
  texts: LawMapTexts | null;
  route: LawMapRoute | null;
  routeMiss: boolean;
  routeFrom: string | null;
  onFocus: (id: string) => void;
}

export default function LawMapPanel({
  selected, articleById, laneById, edgesByNode, institutionsByArticle, texts, route, routeMiss, routeFrom, onFocus,
}: Props) {
  const nodeLabel = (id: string) => {
    const article = articleById.get(id);
    if (article) return `${laneById.get(article.laneId)?.name ?? ""} ${article.label}`.trim();
    return laneById.get(id)?.name ?? id;
  };

  if (!selected) {
    return (
      <aside className={styles.panel} data-empty="true" aria-label="선택 조문">
        <p className={styles.panelEmpty}>
          조문 카드를 클릭하면 원문 미리보기, 위임선, 이 조문을 쓰는 제도가 여기에 뜹니다.
          카드에 올리면 그 조문의 위임선만 그립니다. 경로 추적을 켜고 조문 두 개를 고르면 사이 경로를 보여줍니다.
        </p>
      </aside>
    );
  }

  const article = articleById.get(selected) ?? null;
  const lane = article ? laneById.get(article.laneId) ?? null : laneById.get(selected) ?? null;
  const touching = edgesByNode.get(selected) ?? [];
  const outgoing = touching.filter((e) => e.from === selected);
  const incoming = touching.filter((e) => e.to === selected);
  const institutions = institutionsByArticle.get(selected) ?? [];
  const text = article ? texts?.[article.id] : undefined;

  return (
    <aside className={styles.panel} data-empty="false" aria-label="선택 조문">
      <div className={styles.panelKicker}>
        {lane ? `${TIER_LABELS[lane.tier]} · ${lane.kind} · ${lane.name}` : ""}
      </div>
      <h2>{article ? `${article.label}${article.title ? `(${article.title})` : ""}` : lane?.name}</h2>
      <a className={styles.panelLink} href={article?.officialUrl ?? lane?.officialUrl} target="_blank" rel="noreferrer">법제처 원문 ↗</a>

      {article && (
        texts === null
          ? <p className={styles.panelText}>원문을 불러오는 중…</p>
          : text
            ? <p className={styles.panelText}>{text}</p>
            : <p className={styles.panelText}>미리보기가 없습니다. 원문은 법제처에서 확인하세요.</p>
      )}

      {route && routeFrom && (
        <section className={styles.panelSection}>
          <h3>경로 {route.edges.length}단계</h3>
          <ol className={styles.routeSteps}>
            {route.nodes.map((id) => (
              <li key={id}><button type="button" onClick={() => onFocus(id)}>{nodeLabel(id)}</button></li>
            ))}
          </ol>
        </section>
      )}
      {routeMiss && routeFrom && (
        <section className={styles.panelSection}>
          <h3>경로</h3>
          <p className={styles.unresolved}>{nodeLabel(routeFrom)}에서 {nodeLabel(selected)}까지 직접 위임 경로가 없습니다.</p>
        </section>
      )}

      {EDGE_ORDER.map((kind) => {
        const list = outgoing.filter((e) => e.kind === kind);
        if (!list.length) return null;
        return (
          <section key={kind} className={styles.panelSection}>
            <h3><i className={styles.swatch} style={{ background: EDGE_COLORS[kind] }} aria-hidden />{EDGE_LABELS[kind]} {list.length}</h3>
            <ul className={styles.edgeList}>
              {list.map((e) => <EdgeItem key={e.id} edge={e} kind={kind} onFocus={onFocus} nodeLabel={nodeLabel} />)}
            </ul>
          </section>
        );
      })}

      {incoming.length > 0 && (
        <section className={styles.panelSection}>
          <h3>이 조문으로 위임한 조문 {incoming.length}</h3>
          <ul className={styles.edgeList}>
            {incoming.map((e) => (
              <li key={e.id} className={styles.edgeItem} style={{ "--kind-color": EDGE_COLORS[e.kind] } as CSSProperties}>
                <button type="button" onClick={() => onFocus(e.from)}>{nodeLabel(e.from)}{e.fromClause ? ` ${e.fromClause.replace(/^제\d+조(의\d+)?/, "")}` : ""}</button>
                <small>{e.phrase}</small>
              </li>
            ))}
          </ul>
        </section>
      )}

      {institutions.length > 0 && (
        <section className={styles.panelSection}>
          <h3>이 조문을 쓰는 제도 {institutions.length}</h3>
          <ul className={styles.instList}>
            {institutions.map((inst) => (
              <li key={inst.slug}><Link href={`/model/${inst.slug}/`}>{inst.name}</Link></li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}

function EdgeItem({ edge, kind, onFocus, nodeLabel }: { edge: Edge; kind: EdgeKind; onFocus: (id: string) => void; nodeLabel: (id: string) => string }) {
  const clause = edge.fromClause ? edge.fromClause.replace(/^제\d+조(의\d+)?/, "") : "";
  const titleSuffix = edge.targetTitle ? `(${edge.targetTitle})` : "";
  const targetText = edge.targetLabel ? `${edge.targetName} ${edge.targetLabel}${titleSuffix}` : edge.targetName;
  const target = edge.to
    ? <button type="button" onClick={() => onFocus(edge.to as string)}>{edge.targetLabel ? targetText : nodeLabel(edge.to)}</button>
    : <strong>{targetText}</strong>;
  return (
    <li className={styles.edgeItem} style={{ "--kind-color": EDGE_COLORS[kind] } as CSSProperties}>
      {target}
      <small>{clause ? `${clause} · ` : ""}{edge.phrase}</small>
      {edge.unresolved && <span className={styles.unresolved}>현행 조문에서 미확인</span>}
    </li>
  );
}
