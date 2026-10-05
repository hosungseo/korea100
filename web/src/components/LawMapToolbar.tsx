"use client";

import type { CSSProperties } from "react";
import type { EdgeKind, LawMapView } from "@/lib/law-map-types";
import { EDGE_COLORS, EDGE_LABELS, EDGE_ORDER } from "./law-map-constants";
import styles from "./LawMapBoard.module.css";

const VIEWS: { id: LawMapView; label: string }[] = [
  { id: "overview", label: "큰 그림" },
  { id: "detail", label: "자세히" },
];

interface Props {
  view: LawMapView;
  onChangeView: (view: LawMapView) => void;
  kinds: Set<EdgeKind>;
  onToggleKind: (kind: EdgeKind) => void;
  query: string;
  onQuery: (value: string) => void;
  onSearchSubmit: () => void;
  routeMode: boolean;
  onToggleRoute: () => void;
  routeFromLabel: string | null;
  onClear: () => void;
}

export default function LawMapToolbar({
  view, onChangeView, kinds, onToggleKind, query, onQuery, onSearchSubmit, routeMode, onToggleRoute, routeFromLabel, onClear,
}: Props) {
  return (
    <div className={styles.toolbar} role="toolbar" aria-label="법령 지도 도구">
      <div className={styles.segmented} role="group" aria-label="보기">
        {VIEWS.map((item) => (
          <button key={item.id} type="button" aria-pressed={view === item.id} onClick={() => onChangeView(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <div className={styles.kinds}>
        {EDGE_ORDER.map((kind) => (
          <label key={kind} className={styles.kind} data-off={!kinds.has(kind)} style={{ "--kind-color": EDGE_COLORS[kind] } as CSSProperties}>
            <input type="checkbox" checked={kinds.has(kind)} onChange={() => onToggleKind(kind)} />
            <i className={styles.swatch} aria-hidden />
            {EDGE_LABELS[kind]}
          </label>
        ))}
      </div>
      <form
        className={styles.search}
        onSubmit={(event) => { event.preventDefault(); onSearchSubmit(); }}
      >
        <input
          type="search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="조문 번호·제목 검색 (예: 제11조, 건축허가)"
          aria-label="조문 검색"
        />
        <button type="submit">이동</button>
      </form>
      <button type="button" className={styles.routeBtn} data-on={routeMode} onClick={onToggleRoute}>
        {routeMode ? "경로 모드 끄기" : "경로 추적"}
      </button>
      {routeMode && (
        <span className={styles.hint}>
          {routeFromLabel ? `출발 ${routeFromLabel} → 도착 조문을 클릭` : "출발 조문을 클릭하세요"}
        </span>
      )}
      <button type="button" className={styles.clearBtn} onClick={onClear}>선택 해제</button>
    </div>
  );
}
