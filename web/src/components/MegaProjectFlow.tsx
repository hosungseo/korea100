"use client";

import Link from "next/link";
import { useEffect, Fragment,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  MegaArtifact,
  MegaDetailTemplate,
  MegaProject,
} from "@/lib/mega-project-types";
import {
  buildMegaProjectGraph,
  formatDate,
  STATUS_META,
} from "@/lib/mega-project-graph";
import MegaViewNav from "./MegaViewNav";
import styles from "./MegaProjectFlow.module.css";

interface MegaProjectFlowProps {
  project: MegaProject;
  artifacts: MegaArtifact[];
  templates: Record<string, string>;
  detailTemplates: Record<string, MegaDetailTemplate>;
  // 메가프로젝트(사업)와 국가전략(5극3특 등)은 다른 종류 — 전략은 스윔레인 단일 뷰
  variant?: "mega" | "strategy";
}

type EdgeKind = "sequence" | "chain" | "handoff" | "internal" | "conditional";

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
}

interface FlowEdgePath extends FlowEdge {
  path: string;
}

interface ProcItem {
  key: string;
  mapping: string;
  procId: string;
  procName: string;
  procType: string;
  procActor: string;
  lane: number;
  subCol: number;
  templateName: string;
  templateId?: string;
  outputs: string;
  legalBasis: number;
  legalBasisList: { law: string; article: string }[];
  title: string;
}

// law.go.kr 한글주소 — 법령명(+조번호)으로 원문 딥링크
const lawUrlOf = (law: string, article: string) => {
  const articleHead = article.match(/^제\d+조(의\d+)?/)?.[0];
  return `https://law.go.kr/법령/${encodeURIComponent(law)}${
    articleHead ? `/${encodeURIComponent(articleHead)}` : ""
  }`;
};

// 메가프로젝트(사업)와 국가전략은 주체 구성이 다르다 —
// 전략은 입법이 관문이라 국회가 전용 레인을 가진다.
const MEGA_LANES = [
  { id: "applicant", label: "신청인·사업자" },
  { id: "residents", label: "주민·이해관계자" },
  { id: "local", label: "지자체·인허가부서" },
  { id: "central", label: "중앙부처" },
  { id: "expert", label: "위원회·전문기관" },
  { id: "operator", label: "행정청·집행·시스템" },
];
const STRATEGY_LANES = [
  { id: "applicant", label: "민간·기업·대학" },
  { id: "residents", label: "주민·이해관계자" },
  { id: "local", label: "지자체·시·도" },
  { id: "assembly", label: "국회" },
  { id: "central", label: "중앙부처" },
  { id: "expert", label: "위원회·전문기관" },
  { id: "operator", label: "행정청·집행·시스템" },
];

const EDGE_KINDS: { kind: EdgeKind; label: string }[] = [
  { kind: "sequence", label: "제도 내 순서" },
  { kind: "chain", label: "제도 간 연결" },
  { kind: "internal", label: "마일스톤 선행(기관 내)" },
  { kind: "handoff", label: "기관 간 인계" },
  { kind: "conditional", label: "미확정 분기" },
];

const EDGE_COLORS: { kind: EdgeKind; color: string }[] = [
  { kind: "sequence", color: "#16805e" },
  { kind: "chain", color: "#2168b4" },
  { kind: "internal", color: "#5b7d92" },
  { kind: "handoff", color: "#0d8160" },
  { kind: "conditional", color: "#b47a19" },
];

// 제도 내 순서(sequence) 선은 출발 주체군의 레인 색을 입는다 —
// 레인 틴트와 같은 계열의 연한 톤이라 배경과 조화되고,
// 횡단선(제도 간·인계·분기)은 별개 색으로 도드라진다.
const LANE_EDGE_COLORS = [
  "#3f8f6d", // 신청인·사업자 — 초록
  "#c47240", // 주민·이해관계자 — 테라코타
  "#3b93ad", // 지자체 — 시안
  "#8a7ac9", // 중앙부처 — 라벤더
  "#8a6a2a", // 위원회·전문기관 — 브론즈
  "#5f7568", // 행정청·집행 — 회녹
  "#4e6d80", // (전략 7레인) 행정청·집행 — 청회색
] as const;

const edgeColorOf = (kind: EdgeKind, sourceLane: number | undefined) =>
  kind === "sequence" && sourceLane !== undefined
    ? LANE_EDGE_COLORS[sourceLane]
    : EDGE_COLORS.find((item) => item.kind === kind)?.color ?? "#16805e";

// 화살촉 모양도 종류를 말한다 — 제도 간 연결은 열린 촉(다른 제도로 건너감),
// 미확정 분기는 다이아몬드(게이트웨이), 나머지는 꽉 찬 삼각.
type MarkerShape = "tri" | "open" | "diamond";
const markerShapeOf = (key: string): MarkerShape =>
  key === "chain" ? "open" : key === "conditional" ? "diamond" : "tri";
const markerPath = (shape: MarkerShape, color: string) =>
  shape === "open" ? (
    <path
      d="M 1 1 L 7 4 L 1 7"
      fill="none"
      stroke={color}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ) : shape === "diamond" ? (
    <path d="M 4 0.5 L 7.5 4 L 4 7.5 L 0.5 4 z" fill={color} />
  ) : (
    <path d="M 0 0 L 8 4 L 0 8 z" fill={color} />
  );

function laneOf(actor: string, variant: "mega" | "strategy" = "mega"): number {
  if (variant === "strategy") {
    // 국회 판별을 위원회보다 먼저 — '소관 상임위원회'가 위원회 패턴에 먹히지 않게
    if (/국회|상임위|법제사법|본회의|발의자|의안|재적의원/.test(actor)) return 3;
    if (/주민|토지소유|소유자|점유자|가족|이해관계/.test(actor)) return 1;
    if (
      /신청인|사업시행자|사업자|기업|대학|산학|스타트업|의료기관|보조사업자|시공|영업자|입주|수요|공급자/.test(
        actor,
      )
    )
      return 0;
    if (/위원회|전문기관|심사|평가|심의|조사수행|검증|연구|검사기관/.test(actor))
      return 5;
    if (/지방자치단체|지자체|시·도|시군구|시장|군수|구청장|교육감|지방의회/.test(actor))
      return 2;
    if (
      /[부처청]$|장관|기획예산처|재정경제부|중앙관서|중앙행정기관|입안 행정청|대통령|국무회의|정부|국가/.test(
        actor,
      )
    )
      return 4;
    return 6;
  }
  if (/주민|토지소유|소유자|점유자|이해관계/.test(actor)) return 1;
  if (
    /신청인|사업시행자|사업자|기업|시공|영업자|취급자|할당대상|사업장|입주|수요|공급자|운송자/.test(
      actor,
    )
  )
    return 0;
  if (/광주시|지자체|지방자치|시장|군수|구청장|시·도|재정부서|교육감/.test(actor))
    return 2;
  if (/위원회|전문기관|심사|평가|심의|조사수행|검증|연구|검사기관/.test(actor))
    return 4;
  if (
    /[부처청]$|국방부|환경부|산업통상|기후|기획예산처|해양수산|행정안전|정부|중대본|장관/.test(
      actor,
    )
  )
    return 3;
  return 5;
}

export default function MegaProjectFlow({
  project,
  artifacts,
  templates,
  detailTemplates,
  variant = "mega",
}: MegaProjectFlowProps) {
  const lanes = variant === "strategy" ? STRATEGY_LANES : MEGA_LANES;
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const procRefs = useRef(new Map<string, HTMLElement>());
  const [edgePaths, setEdgePaths] = useState<FlowEdgePath[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [hiddenKinds, setHiddenKinds] = useState<Set<EdgeKind>>(new Set());
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(1);
  // 좁은 화면 기본 축소 — SSR 하이드레이션 불일치를 피해 마운트 후 적용
  useEffect(() => {
    if (window.innerWidth < 720) setZoom(0.8);
  }, []);
  const [pinnedKey, setPinnedKey] = useState<string | null>(null);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [matchIndex, setMatchIndex] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hiddenLanes, setHiddenLanes] = useState<Set<number>>(new Set());
  const [pinnedCol, setPinnedCol] = useState<number | null>(null);
  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);
  const [scrollPos, setScrollPos] = useState<{
    gate: string;
    gateId: string;
    milestoneId: string;
    milestoneName: string;
    laneLabel: string;
  } | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!viewport || !canvas) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const strips = canvas.querySelectorAll<HTMLElement>("[data-ms-name]");
      // offsetTop은 stageBand 기준 상대값이라 못 쓴다 — 캔버스 rect 기준으로 계산
      const canvasTop = canvas.getBoundingClientRect().top;
      const marker = viewport.getBoundingClientRect().top - canvasTop + 140;
      let current: HTMLElement | null = null;
      for (const strip of strips) {
        if (strip.getBoundingClientRect().top - canvasTop <= marker) current = strip;
        else break;
      }
      if (!current) {
        setScrollPos(null);
        return;
      }
      // 가로 위치 — 뷰포트 중앙이 지나는 담당자 컬럼의 주체군을 함께 표시
      const viewportRect = viewport.getBoundingClientRect();
      const centerX = viewportRect.left + viewport.clientWidth / 2;
      let laneLabel = "";
      const headerSpans = canvas.parentElement?.querySelectorAll<HTMLElement>(
        '[class*="actorHeader"] > span[data-lane]',
      );
      if (headerSpans) {
        for (const span of headerSpans) {
          const rect = span.getBoundingClientRect();
          if (rect.left <= centerX && rect.right >= centerX) {
            const laneIndex = Number(span.dataset.lane);
            laneLabel = lanes[laneIndex]?.label ?? "";
            break;
          }
        }
      }
      setScrollPos({
        gate: current.dataset.gate ?? "",
        gateId: current.dataset.gateId ?? "",
        milestoneId: current.id,
        milestoneName: current.dataset.msName ?? "",
        laneLabel,
      });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      viewport.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [lanes]);

  const derived = useMemo(() => {
    const graph = buildMegaProjectGraph(
      project,
      artifacts,
      templates,
      detailTemplates,
    );

    const TOP_ACTORS = 30;
    const actorCounts = new Map<string, number>();
    project.nodes.forEach((node) => {
      (graph.detailGroupsByNode.get(node.id) ?? []).forEach((group) => {
        group.nodes.forEach((proc) => {
          actorCounts.set(proc.actor, (actorCounts.get(proc.actor) ?? 0) + 1);
        });
      });
    });
    const sortedActors = [...actorCounts.entries()].sort(
      (a, b) => b[1] - a[1],
    );
    const topActors = new Set(
      sortedActors.slice(0, TOP_ACTORS).map(([actor]) => actor),
    );
    const laneTopActors: string[][] = lanes.map(() => []);
    const laneOtherActors: string[][] = lanes.map(() => []);
    sortedActors.forEach(([actor]) => {
      if (topActors.has(actor)) laneTopActors[laneOf(actor, variant)].push(actor);
      else laneOtherActors[laneOf(actor, variant)].push(actor);
    });
    const subColumnOfActor = new Map<string, number>();
    const subColumns: { label: string; lane: number; isOther: boolean }[] = [];
    const laneSubColumnCounts: number[] = lanes.map(() => 0);
    lanes.forEach((_, laneIndex) => {
      laneTopActors[laneIndex].forEach((actor) => {
        subColumnOfActor.set(actor, subColumns.length);
        subColumns.push({ label: actor, lane: laneIndex, isOther: false });
        laneSubColumnCounts[laneIndex] += 1;
      });
      const others = laneOtherActors[laneIndex];
      if (others.length > 0) {
        const otherIndex = subColumns.length;
        others.forEach((actor) => subColumnOfActor.set(actor, otherIndex));
        subColumns.push({
          label: `기타 ${others.length}종`,
          lane: laneIndex,
          isOther: true,
        });
        laneSubColumnCounts[laneIndex] += 1;
      }
    });

    const milestoneEntryProc = new Map<string, string>();
    const milestoneExitProc = new Map<string, string>();
    const procLaneByKey = new Map<string, number>();
    const edges: FlowEdge[] = [];
    let totalProcs = 0;

    const stageBands = project.stages
      .map((stage, stageIndex) => {
        const stageNodes = project.nodes.filter(
          (node) => node.stage === stage.id,
        );
        const milestones: {
          id: string;
          name: string;
          status: string;
          procCount: number;
          exactCount: number;
          laneCounts: number[];
          cells: Map<number, ProcItem[]>;
        }[] = [];

        stageNodes.forEach((node) => {
          const groups = (graph.detailGroupsByNode.get(node.id) ?? []).filter(
            (group) => group.nodes.length > 0,
          );
          if (groups.length === 0) return;
          const cells = new Map<number, ProcItem[]>();
          const milestone = {
            id: node.id,
            name: node.name,
            status: graph.displayStatusByNode.get(node.id) ?? "blocked",
            procCount: 0,
            exactCount: 0,
            laneCounts: lanes.map(() => 0),
            cells,
          };
          milestones.push(milestone);
          const firstGroup = groups[0];
          const lastGroup = groups[groups.length - 1];
          milestoneEntryProc.set(
            node.id,
            `${firstGroup.id}:${firstGroup.nodes[0].id}`,
          );
          milestoneExitProc.set(
            node.id,
            `${lastGroup.id}:${lastGroup.nodes[lastGroup.nodes.length - 1].id}`,
          );
          groups.forEach((group, groupIndex) => {
            group.nodes.forEach((proc) => {
              totalProcs += 1;
              milestone.procCount += 1;
              if (group.mapping === "exact") milestone.exactCount += 1;
              const lane = laneOf(proc.actor, variant);
              milestone.laneCounts[lane] += 1;
              procLaneByKey.set(`${group.id}:${proc.id}`, lane);
              const subColumn = subColumnOfActor.get(proc.actor) ?? 0;
              const cell = cells.get(subColumn) ?? [];
              cell.push({
                key: `${group.id}:${proc.id}`,
                mapping: group.mapping,
                procId: proc.id,
                procName: proc.name,
                procType: proc.type,
                procActor: proc.actor,
                lane: subColumns[subColumn]?.lane ?? 0,
                subCol: subColumn,
                templateName: group.templateName,
                templateId: group.templateId,
                outputs: proc.outputDocuments.join(" · "),
                legalBasis: proc.legalBasisCount,
                legalBasisList: proc.legalBasis ?? [],
                title: [
                  `${node.id} ${node.name}`,
                  `${group.templateName}`,
                  `${proc.id} ${proc.name}`,
                  `담당 ${proc.actor}`,
                  proc.outputDocuments.length > 0
                    ? `산출물 ${proc.outputDocuments.join(" · ")}`
                    : "산출물 미기재",
                  `법적 근거 ${proc.legalBasisCount}건`,
                ].join(" / "),
              });
              cells.set(subColumn, cell);
            });
            group.edges.forEach((edge) => {
              edges.push({
                id: `${group.id}:${edge.id}`,
                source: `${group.id}:${edge.source}`,
                target: `${group.id}:${edge.target}`,
                kind: "sequence",
              });
            });
            const nextGroup = groups[groupIndex + 1];
            if (nextGroup) {
              edges.push({
                id: `chain:${group.id}->${nextGroup.id}`,
                source: `${group.id}:${group.nodes[group.nodes.length - 1].id}`,
                target: `${nextGroup.id}:${nextGroup.nodes[0].id}`,
                kind: "chain",
              });
            }
          });
        });

        // 게이트별 주관 — leadActor 최빈값. 과반이면 단독 주관,
        // 분산돼 있으면 하나로 퉁치지 않고 '다부처'로 상위 주체를 나열한다.
        const leadCounts = new Map<string, number>();
        stageNodes.forEach((node) => {
          leadCounts.set(node.leadActor, (leadCounts.get(node.leadActor) ?? 0) + 1);
        });
        const leadEntries = [...leadCounts.entries()].sort((a, b) => b[1] - a[1]);
        const shortOf = (id: string) =>
          project.actors.find((actor) => actor.id === id)?.shortLabel ?? id;
        let leadLabel: string | null = null;
        if (leadEntries.length > 0) {
          const concentrated =
            leadEntries.length === 1 ||
            leadEntries[0][1] / stageNodes.length >= 0.5;
          leadLabel = concentrated
            ? `주관 ${shortOf(leadEntries[0][0])}`
            : `다부처 ${leadEntries
                .slice(0, 2)
                .map(([id]) => shortOf(id))
                .join("·")}${leadEntries.length > 2 ? " 외" : ""}`;
        }
        return {
          stageId: stage.id,
          label: `${String(stageIndex + 1).padStart(2, "0")} ${stage.label}`,
          shortLabel: `${String(stageIndex + 1).padStart(2, "0")} ${stage.label}`,
          leadLaneLabel: leadLabel,
          milestones,
        };
      })
      .filter((band) => band.milestones.length > 0);

    graph.edges.forEach((edge) => {
      const source = milestoneExitProc.get(edge.source);
      const target = milestoneEntryProc.get(edge.target);
      if (!source || !target) return;
      edges.push({
        id: `dep:${edge.id}`,
        source,
        target,
        kind: edge.conditional
          ? "conditional"
          : edge.handoff
            ? "handoff"
            : "internal",
      });
    });

    const neighborsByNode = new Map<string, Set<string>>();
    edges.forEach((edge) => {
      if (!neighborsByNode.has(edge.source))
        neighborsByNode.set(edge.source, new Set());
      if (!neighborsByNode.has(edge.target))
        neighborsByNode.set(edge.target, new Set());
      neighborsByNode.get(edge.source)!.add(edge.target);
      neighborsByNode.get(edge.target)!.add(edge.source);
    });

    const gridTemplate = `var(--gutter-width) ${subColumns
      .map(() => "var(--subcol-width)")
      .join(" ")}`;

    // Lane-to-lane handoff matrix for the mini sankey summary.
    const handoffMatrix: number[][] = lanes.map(() => lanes.map(() => 0));
    let handoffTotal = 0;
    graph.edges.forEach((edge) => {
      if (!edge.handoff) return;
      const source = milestoneExitProc.get(edge.source);
      const target = milestoneEntryProc.get(edge.target);
      if (!source || !target) return;
      const sourceLane = procLaneByKey.get(source);
      const targetLane = procLaneByKey.get(target);
      if (sourceLane === undefined || targetLane === undefined) return;
      if (sourceLane === targetLane) return;
      handoffMatrix[sourceLane][targetLane] += 1;
      handoffTotal += 1;
    });

    const maxCellCount = Math.max(
      1,
      ...stageBands.flatMap((band) =>
        band.milestones.flatMap((milestone) => milestone.laneCounts),
      ),
    );
    const maxMilestoneProcs = Math.max(
      1,
      ...stageBands.flatMap((band) =>
        band.milestones.map((milestone) => milestone.procCount),
      ),
    );

    return {
      edges,
      stageBands,
      subColumns,
      laneSubColumnCounts,
      totalProcs,
      neighborsByNode,
      gridTemplate,
      handoffMatrix,
      handoffTotal,
      maxCellCount,
      maxMilestoneProcs,
    };
  }, [artifacts, detailTemplates, project, templates, variant]);

  const {
    edges,
    stageBands,
    subColumns,
    laneSubColumnCounts,
    totalProcs,
    neighborsByNode,
    handoffMatrix,
    handoffTotal,
    maxCellCount,
    maxMilestoneProcs,
    gridTemplate,
  } = derived;

  const procByKey = useMemo(() => {
    const map = new Map<
      string,
      {
        proc: ProcItem;
        milestoneId: string;
        milestoneName: string;
        gate: string;
        stageId: string;
      }
    >();
    for (const band of derived.stageBands) {
      for (const milestone of band.milestones) {
        for (const procs of milestone.cells.values()) {
          for (const proc of procs) {
            map.set(proc.key, {
              proc,
              milestoneId: milestone.id,
              milestoneName: milestone.name,
              gate: band.label,
              stageId: band.stageId,
            });
          }
        }
      }
    }
    return map;
  }, [derived]);
  // 레인 접기: 접힌 주체군의 열은 스텁 폭으로 축소
  const gridColumns = useMemo(
    () =>
      `var(--gutter-width) ${subColumns
        .map((subColumn) =>
          hiddenLanes.has(subColumn.lane)
            ? "var(--subcol-collapsed)"
            : "var(--subcol-width)",
        )
        .join(" ")}`,
    [subColumns, hiddenLanes],
  );

  const toggleLane = useCallback((laneIndex: number) => {
    setHiddenLanes((previous) => {
      const next = new Set(previous);
      if (next.has(laneIndex)) next.delete(laneIndex);
      else next.add(laneIndex);
      return next;
    });
  }, []);

  const jumpToMilestone = useCallback((stageId: string, milestoneId: string) => {
    setCollapsed((previous) => {
      if (!previous.has(stageId)) return previous;
      const next = new Set(previous);
      next.delete(stageId);
      return next;
    });
    window.setTimeout(() => {
      document
        .getElementById(milestoneId)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }, []);

  // 드래그 패닝 — 빈 캔버스를 잡고 끌어 스크롤(마우스 전용, 스크롤바 영역 제외)
  const panState = useRef({ startX: 0, startY: 0, left: 0, top: 0, moved: false });
  const panningRef = useRef(false);
  const [panning, setPanning] = useState(false);
  const onPanPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const target = event.target as HTMLElement;
    // 절차 카드 위에서는 팬을 시작하지 않는다 — 클릭(핀)이 드래그 억제에 먹히지 않게
    if (target.closest("button, a, input, [data-mapping]")) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    // clientWidth/Height는 스크롤바를 제외한다 — 스크롤바 드래그는 브라우저에 맡긴다
    if (
      event.clientX - rect.left > viewport.clientWidth ||
      event.clientY - rect.top > viewport.clientHeight
    )
      return;
    panState.current = {
      startX: event.clientX,
      startY: event.clientY,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
      moved: false,
    };
    panningRef.current = true;
    setPanning(true);
    viewport.setPointerCapture(event.pointerId);
  }, []);
  const onPanPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!panningRef.current) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const dx = event.clientX - panState.current.startX;
    const dy = event.clientY - panState.current.startY;
    if (Math.abs(dx) + Math.abs(dy) > 8) panState.current.moved = true;
    viewport.scrollLeft = panState.current.left - dx;
    viewport.scrollTop = panState.current.top - dy;
  }, []);
  const onPanPointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!panningRef.current) return;
    panningRef.current = false;
    setPanning(false);
    viewportRef.current?.releasePointerCapture?.(event.pointerId);
  }, []);
  const onPanClickCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (panState.current.moved) {
      event.preventDefault();
      event.stopPropagation();
      panState.current.moved = false;
    }
  }, []);

  // 폭맞춤 — 시트 전체 폭을 뷰포트에 맞추는 줌
  const fitWidth = useCallback(() => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!viewport || !canvas || !canvas.offsetWidth) return;
    const next = Math.min(
      1,
      Math.max(0.25, Math.floor((viewport.clientWidth / canvas.offsetWidth) * 100) / 100),
    );
    setZoom(next);
  }, []);

  const detailKey = pinnedKey ?? hoverKey;
  const hoverDetail = detailKey ? procByKey.get(detailKey) : null;
  const detailLinks = useMemo(() => {
    if (!detailKey) return [];
    return derived.edges
      .filter((edge) => edge.source === detailKey || edge.target === detailKey)
      .map((edge) => {
        const outgoing = edge.source === detailKey;
        const counterpartKey = outgoing ? edge.target : edge.source;
        const counterpart = procByKey.get(counterpartKey);
        return counterpart
          ? {
              key: counterpartKey,
              outgoing,
              kind: edge.kind,
              label: `${counterpart.proc.procId} ${counterpart.proc.procName}`,
              milestoneId: counterpart.milestoneId,
            }
          : null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [detailKey, derived.edges, procByKey]);

  const scrollToProc = useCallback(
    (key: string) => {
      const info = procByKey.get(key);
      if (info) {
        setCollapsed((previous) => {
          if (!previous.has(info.stageId)) return previous;
          const next = new Set(previous);
          next.delete(info.stageId);
          return next;
        });
      }
      setPinnedKey(key);
      setFlashKey(key);
      window.setTimeout(() => {
        procRefs.current
          .get(key)
          ?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      }, 60);
      window.setTimeout(() => setFlashKey((value) => (value === key ? null : value)), 1800);
    },
    [procByKey],
  );

  useEffect(() => {
    setMatchIndex(0);
  }, [query]);

  // 핀 절차의 전체 사슬(상류·하류) — 핀 시 경로 밖은 흐림 처리
  const adjacency = useMemo(() => {
    const forward = new Map<string, string[]>();
    const backward = new Map<string, string[]>();
    for (const edge of derived.edges) {
      if (!forward.has(edge.source)) forward.set(edge.source, []);
      forward.get(edge.source)!.push(edge.target);
      if (!backward.has(edge.target)) backward.set(edge.target, []);
      backward.get(edge.target)!.push(edge.source);
    }
    return { forward, backward };
  }, [derived.edges]);

  const pinnedPath = useMemo(() => {
    if (!pinnedKey) return null;
    const walk = (start: string, next: Map<string, string[]>) => {
      const seen = new Set<string>();
      const queue = [start];
      while (queue.length) {
        const node = queue.pop()!;
        for (const neighbor of next.get(node) ?? []) {
          if (!seen.has(neighbor)) {
            seen.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
      seen.delete(start);
      return seen;
    };
    const downstream = walk(pinnedKey, adjacency.forward);
    const upstream = walk(pinnedKey, adjacency.backward);
    const nodes = new Set<string>([pinnedKey, ...upstream, ...downstream]);
    return { nodes, upstream: upstream.size, downstream: downstream.size };
  }, [pinnedKey, adjacency]);

  // 딥링크: ?p=<절차키> — 핀과 URL 동기화, 로드 시 자동 이동
  const deepLinkApplied = useRef(false);
  useEffect(() => {
    if (deepLinkApplied.current) return;
    deepLinkApplied.current = true;
    const param = new URLSearchParams(window.location.search).get("p");
    if (param && procByKey.has(param)) {
      window.setTimeout(() => scrollToProc(param), 500);
    }
  }, [procByKey, scrollToProc]);

  useEffect(() => {
    if (!deepLinkApplied.current) return;
    const url = new URL(window.location.href);
    if (pinnedKey) url.searchParams.set("p", pinnedKey);
    else url.searchParams.delete("p");
    window.history.replaceState(null, "", url.toString());
  }, [pinnedKey]);

  // 키보드 내비게이션 — PageDown/Up 게이트 이동, +/− 줌, 0 리셋, Esc 해제
  const scrollPosRef = useRef(scrollPos);
  useEffect(() => {
    scrollPosRef.current = scrollPos;
  }, [scrollPos]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;
      if (event.key === "Escape") {
        setPinnedKey(null);
        setPinnedCol(null);
        return;
      }
      if (event.key === "PageDown" || event.key === "PageUp") {
        event.preventDefault();
        const gateId = scrollPosRef.current?.gateId;
        const index = stageBands.findIndex((band) => band.stageId === gateId);
        const next =
          event.key === "PageDown"
            ? Math.min(stageBands.length - 1, index + 1)
            : Math.max(0, index < 0 ? 0 : index - 1);
        const band = stageBands[next];
        if (band)
          document
            .getElementById(`gate-${band.stageId}`)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if (event.key === "+" || event.key === "=") {
        setZoom((value) => Math.min(1.6, Math.round((value + 0.1) * 10) / 10));
      } else if (event.key === "-") {
        setZoom((value) => Math.max(0.25, Math.round((value - 0.1) * 10) / 10));
      } else if (event.key === "0") {
        setZoom(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stageBands]);

  const updateGeometry = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    // CSS zoom 상태에서 getBoundingClientRect는 확대된 px을 주므로
    // SVG(비확대 좌표계)와 맞추려면 zoom으로 나눠 정규화한다.
    const zoomFactor = zoom || 1;

    interface Rect {
      left: number;
      right: number;
      top: number;
      bottom: number;
      cx: number;
      cy: number;
      width: number;
      height: number;
    }
    const rectCache = new Map<string, Rect>();
    const rectOf = (key: string): Rect | null => {
      const cached = rectCache.get(key);
      if (cached) return cached;
      const lane = procByKey.get(key)?.proc.lane;
      if (lane !== undefined && hiddenLanes.has(lane)) return null;
      const element = procRefs.current.get(key);
      if (!element) return null;
      const r = element.getBoundingClientRect();
      const rect: Rect = {
        left: (r.left - canvasRect.left) / zoomFactor,
        right: (r.right - canvasRect.left) / zoomFactor,
        top: (r.top - canvasRect.top) / zoomFactor,
        bottom: (r.bottom - canvasRect.top) / zoomFactor,
        cx: (r.left - canvasRect.left + r.width / 2) / zoomFactor,
        cy: (r.top - canvasRect.top + r.height / 2) / zoomFactor,
        width: r.width / zoomFactor,
        height: r.height / zoomFactor,
      };
      rectCache.set(key, rect);
      return rect;
    };

    // Route classification per edge, so ports can be grouped by node side.
    type RouteKind = "down" | "up" | "side";
    interface Routed {
      edge: FlowEdge;
      kind: RouteKind;
      s: Rect;
      t: Rect;
      goRight: boolean;
    }
    const routed: Routed[] = [];
    edges.forEach((edge) => {
      const s = rectOf(edge.source);
      const t = rectOf(edge.target);
      if (!s || !t) return;
      const verticalOverlap = t.top < s.bottom && t.bottom > s.top;
      const kind: RouteKind = verticalOverlap
        ? "side"
        : t.top >= s.bottom
          ? "down"
          : "up";
      routed.push({ edge, kind, s, t, goRight: t.cx > s.cx });
    });

    // Port assignment: spread each node's departures/arrivals along the
    // relevant box side, ordered by where the counterpart sits, so no two
    // edges share the same anchor point.
    const portGroups = new Map<string, Routed[]>();
    const groupKey = (nodeKey: string, side: string) => `${nodeKey}|${side}`;
    const sideOfSource = (r: Routed) =>
      r.kind === "side" ? (r.goRight ? "right" : "left") : r.kind === "down" ? "bottom" : "top";
    const sideOfTarget = (r: Routed) =>
      r.kind === "side" ? (r.goRight ? "left" : "right") : r.kind === "down" ? "top" : "bottom";
    routed.forEach((r) => {
      const sKey = groupKey(r.edge.source, `out-${sideOfSource(r)}`);
      const tKey = groupKey(r.edge.target, `in-${sideOfTarget(r)}`);
      (portGroups.get(sKey) ?? portGroups.set(sKey, []).get(sKey)!).push(r);
      (portGroups.get(tKey) ?? portGroups.set(tKey, []).get(tKey)!).push(r);
    });
    portGroups.forEach((group, key) => {
      const horizontal = key.endsWith("bottom") || key.endsWith("top");
      const isOut = key.includes("|out-");
      group.sort((a, b) => {
        const ra = isOut ? a.t : a.s;
        const rb = isOut ? b.t : b.s;
        return horizontal ? ra.cx - rb.cx || ra.cy - rb.cy : ra.cy - rb.cy || ra.cx - rb.cx;
      });
    });
    const portOffset = (
      nodeKey: string,
      side: string,
      r: Routed,
      rect: Rect,
    ) => {
      const group = portGroups.get(groupKey(nodeKey, side)) ?? [];
      const index = group.indexOf(r);
      const count = group.length;
      const span = side.endsWith("bottom") || side.endsWith("top")
        ? rect.width
        : rect.height;
      const usable = Math.max(8, span - 12);
      return count <= 1
        ? 0
        : ((index + 1) / (count + 1) - 0.5) * usable;
    };

    // Channel assignment: horizontal runs near the same Y (or vertical runs
    // near the same X) get successive 5px slots instead of piling up.
    const channelSlots = new Map<string, number>();
    const channelOffset = (axis: "h" | "v", base: number) => {
      const key = `${axis}:${Math.round(base / 6)}`;
      const slot = channelSlots.get(key) ?? 0;
      channelSlots.set(key, slot + 1);
      const step = Math.ceil(slot / 2) * 5;
      return slot % 2 === 1 ? step : -step;
    };

    // De-collinearising nudges: a per-kind bias keeps different edge kinds off
    // the exact same track, and a stable per-edge jitter spreads long runs
    // from different nodes that would otherwise share one column centre.
    const KIND_BIAS: Record<EdgeKind, number> = {
      sequence: 0,
      internal: -1.5,
      chain: 1.5,
      handoff: 3,
      conditional: -3,
    };
    const jitterOf = (id: string) => {
      let hash = 0;
      for (let i = 0; i < id.length; i += 1)
        hash = (hash * 31 + id.charCodeAt(i)) | 0;
      return (((hash % 7) + 7) % 7) - 3; // -3..3
    };
    const clampN = (value: number, low: number, high: number) =>
      low > high ? (low + high) / 2 : Math.min(high, Math.max(low, value));

    // 거터 라우팅 재료: 긴 선은 카드 옆 세로 거터(카드 간 빈 띠)로 다니고,
    // 가로 이동은 각 스트립 상단의 카드 없는 8px 띠에서만 한다.
    const stripTops = new Map<string, number>();
    canvas.querySelectorAll<HTMLElement>("[data-ms-name]").forEach((el) => {
      stripTops.set(
        el.id,
        (el.getBoundingClientRect().top - canvasRect.top) / zoomFactor,
      );
    });
    const gutterSlots = new Map<string, number>();
    const gutterOffset = (key: string) => {
      const slot = gutterSlots.get(key) ?? 0;
      gutterSlots.set(key, slot + 1);
      return (slot % 4) * 2 - 3; // -3, -1, 1, 3 순환
    };

    // Render an orthogonal polyline with rounded corners so long routes read
    // as flows, not empty rectangles.
    const roundedPath = (points: [number, number][]) => {
      if (points.length < 2) return "";
      let d = `M ${points[0][0]} ${points[0][1]}`;
      for (let i = 1; i < points.length - 1; i += 1) {
        const [px, py] = points[i - 1];
        const [cx, cy] = points[i];
        const [nx, ny] = points[i + 1];
        const inLen = Math.hypot(cx - px, cy - py);
        const outLen = Math.hypot(nx - cx, ny - cy);
        const r = Math.min(11, inLen / 2.2, outLen / 2.2);
        if (r < 1) {
          d += ` L ${cx} ${cy}`;
          continue;
        }
        const inX = cx - ((cx - px) / inLen) * r;
        const inY = cy - ((cy - py) / inLen) * r;
        const outX = cx + ((nx - cx) / outLen) * r;
        const outY = cy + ((ny - cy) / outLen) * r;
        d += ` L ${inX} ${inY} Q ${cx} ${cy} ${outX} ${outY}`;
      }
      const last = points[points.length - 1];
      d += ` L ${last[0]} ${last[1]}`;
      return d;
    };

    const paths = routed.map((r) => {
      const { edge, kind, s, t, goRight } = r;
      const bias = KIND_BIAS[edge.kind];
      const jitter = jitterOf(edge.id);
      let path: string;
      if (kind === "side") {
        const sx = goRight ? s.right : s.left;
        const tx = goRight ? t.left : t.right;
        const sy = clampN(
          s.cy +
            portOffset(edge.source, `out-${goRight ? "right" : "left"}`, r, s) +
            jitter * 0.5,
          s.top + 5,
          s.bottom - 5,
        );
        const ty = t.cy + portOffset(edge.target, `in-${goRight ? "left" : "right"}`, r, t);
        if (Math.abs(sy - ty) < 4) {
          path = `M ${sx} ${sy} L ${tx} ${ty}`;
        } else {
          // Vertical hop hugs the target column instead of floating mid-gap.
          const hop = 10 + Math.abs(channelOffset("v", tx));
          const rawMidX =
            (goRight
              ? Math.max(sx + 4, tx - hop)
              : Math.min(sx - 4, tx + hop)) + bias;
          const midX = goRight
            ? clampN(rawMidX, sx + 3, tx - 4)
            : clampN(rawMidX, tx + 4, sx - 3);
          path = roundedPath([
            [sx, sy],
            [midX, sy],
            [midX, ty],
            [tx, ty],
          ]);
        }
      } else {
        const down = kind === "down";
        const sy = down ? s.bottom : s.top;
        const ty = down ? t.top : t.bottom;
        const overlapLeft = Math.max(s.left, t.left);
        const overlapRight = Math.min(s.right, t.right);
        const gap = Math.abs(ty - sy);
        if (overlapRight - overlapLeft > 12 && gap < 22) {
          // Neighbouring boxes in the same stack: one straight vertical stem.
          const x = clampN(
            (s.cx + t.cx) / 2 + jitter * 0.6,
            overlapLeft + 6,
            overlapRight - 6,
          );
          path = `M ${x} ${sy} L ${x} ${ty}`;
        } else {
          // The long descent runs at the source port x — jitter spreads runs
          // from different nodes that share the same column centre.
          const sx = clampN(
            s.cx +
              portOffset(edge.source, `out-${down ? "bottom" : "top"}`, r, s) +
              jitter,
            s.left + 6,
            s.right - 6,
          );
          const tx = t.cx + portOffset(edge.target, `in-${down ? "top" : "bottom"}`, r, t);
          const dist = Math.abs(ty - sy);
          const channelStripTop = stripTops.get(
            down
              ? procByKey.get(edge.target)?.milestoneId ?? ""
              : procByKey.get(edge.source)?.milestoneId ?? "",
          );
          // 같은 스트립 안에서는 채널 띠가 출발점보다 위라 방향 역전이 생긴다 — 거터 라우팅 제외
          const channelUsable =
            channelStripTop !== undefined &&
            (down ? channelStripTop > sy + 2 : channelStripTop < sy - 9);
          if (dist > 44 && channelUsable) {
            // 긴 선은 거터 라우팅: 카드 뒤를 뚫는 대신
            // 세로는 컬럼 거터, 가로는 스트립 상단의 카드 없는 띠를 탄다.
            const dir = tx >= sx ? 1 : -1;
            const sEdge = dir > 0 ? s.right : s.left;
            const tEdge = dir > 0 ? t.left : t.right;
            const gxS = sEdge + dir * 5 + gutterOffset(`g:${Math.round(sEdge / 8)}`) + jitter * 0.3;
            const gxT = tEdge - dir * 5 + gutterOffset(`g:${Math.round(tEdge / 8)}`) + jitter * 0.3;
            const chY = clampN(
              channelStripTop + 4 + channelOffset("h", channelStripTop) * 0.5,
              channelStripTop + 1.5,
              channelStripTop + 6.5,
            );
            const stub = down ? sy + 2.5 : sy - 2.5;
            const entry = down ? ty - 2.5 : ty + 2.5;
            path = roundedPath([
              [sx, sy],
              [sx, stub],
              [gxS, stub],
              [gxS, chY],
              [gxT, chY],
              [gxT, entry],
              [tx, entry],
              [tx, ty],
            ]);
          } else if (Math.abs(sx - tx) < 4) {
            path = `M ${sx} ${sy} L ${tx} ${ty}`;
          } else {
            // Horizontal channel hugs the destination row (a few px before the
            // target edge) instead of crossing the middle of empty space.
            const gapLow = Math.min(sy, ty);
            const gapHigh = Math.max(sy, ty);
            const hug = 8 + Math.abs(channelOffset("h", ty));
            const midY = clampN(
              (down ? ty - hug : ty + hug) + bias * 0.8,
              gapLow + 3,
              gapHigh - 3,
            );
            path = roundedPath([
              [sx, sy],
              [sx, midY],
              [tx, midY],
              [tx, ty],
            ]);
          }
        }
      }
      return { ...edge, path };
    });

    // scrollHeight는 절대배치 SVG(직전 크기)를 포함해 순환 잠금을 만든다 — border box 사용
    setSize({ width: canvas.offsetWidth, height: canvas.offsetHeight });
    setEdgePaths(paths);
  }, [edges, zoom, procByKey, hiddenLanes]);

  useLayoutEffect(() => {
    updateGeometry();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(updateGeometry);
    observer.observe(canvas);
    window.addEventListener("resize", updateGeometry);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateGeometry);
    };
  }, [updateGeometry]);

  const setProcRef = useCallback(
    (id: string) => (element: HTMLElement | null) => {
      if (element) procRefs.current.set(id, element);
      else procRefs.current.delete(id);
    },
    [],
  );

  const toggleKind = useCallback((kind: EdgeKind) => {
    setHiddenKinds((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }, []);

  const jumpToGate = useCallback((stageId: string) => {
    document
      .getElementById(`gate-${stageId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const hoverNeighbors = hoverKey ? neighborsByNode.get(hoverKey) : undefined;

  // 호버 크로스헤어 — 호버 절차의 담당자 열·마일스톤 행을 함께 하이라이트
  const hoverInfo = hoverKey ? procByKey.get(hoverKey) : null;
  const hoverSubCol = hoverInfo?.proc.subCol ?? -1;
  const hoverMilestoneId = hoverInfo?.milestoneId ?? null;

  // 엣지 호버 — 선에 마우스를 올리면 그 선과 양 끝 절차를 강조
  const hoverEdge = hoverEdgeId
    ? edges.find((edge) => edge.id === hoverEdgeId) ?? null
    : null;
  const hoverEdgeEnds = hoverEdge
    ? new Set([hoverEdge.source, hoverEdge.target])
    : null;

  // 열 핀 — 담당자 헤더 클릭으로 그 열의 절차·연결만 남기고 흐림
  const toggleCol = useCallback((index: number) => {
    setPinnedCol((value) => (value === index ? null : index));
  }, []);

  const trimmedQuery = query.trim().toLowerCase();
  const queryActive = trimmedQuery.length >= 2;
  const matchKeys = new Set<string>();
  const matchList: string[] = [];
  if (queryActive) {
    stageBands.forEach((band) =>
      band.milestones.forEach((milestone) =>
        milestone.cells.forEach((procs) =>
          procs.forEach((proc) => {
            const haystack =
              `${proc.procId} ${proc.procName} ${proc.procActor} ${milestone.id} ${milestone.name}`.toLowerCase();
            if (haystack.includes(trimmedQuery)) {
              matchKeys.add(proc.key);
              matchList.push(proc.key);
            }
          }),
        ),
      ),
    );
  }
  const stepMatch = (delta: number) => {
    if (!matchList.length) return;
    const next = (matchIndex + delta + matchList.length) % matchList.length;
    setMatchIndex(next);
    scrollToProc(matchList[next]);
  };

  return (
    <div className={`${styles.page} mega-flow-page`}>
      <header className={styles.header}>
        <p className={styles.kicker}>
          {variant === "strategy"
            ? "STRATEGY / GIANT SWIMLANE"
            : "MEGA / GIANT SWIMLANE"}
        </p>
        <div className={styles.headerRow}>
          <div>
            <h1>{project.name} 절차 스윔레인</h1>
            <p className={styles.kpis}>
              <span>
                <b>{totalProcs}</b>
                <small>절차</small>
              </span>
              <span>
                <b>{edges.length}</b>
                <small>연결선</small>
              </span>
              <span>
                <b>{subColumns.length}</b>
                <small>담당자 컬럼</small>
              </span>
              <span>
                <b>{stageBands.length}</b>
                <small>게이트</small>
              </span>
              <span>
                <b>
                  {stageBands.reduce(
                    (total, band) => total + band.milestones.length,
                    0,
                  )}
                </b>
                <small>마일스톤</small>
              </span>
              <span>
                <b>{handoffTotal}</b>
                <small>기관 간 인계</small>
              </span>
              <span className={styles.kpiDate}>
                기준일 {formatDate(project.asOfDate)}
              </span>
            </p>
          </div>
          <div className={styles.headerRight}>
            {variant !== "strategy" && (
              <MegaViewNav projectId={project.id} active="flow" />
            )}
            <nav className={styles.gateNav} aria-label="게이트 바로가기">
              {stageBands.map((band) => (
                <button
                  type="button"
                  key={band.stageId}
                  onClick={() => jumpToGate(band.stageId)}
                >
                  {band.label.slice(0, 2)}
                  <small>{band.label.slice(3)}</small>
                </button>
              ))}
            </nav>
          </div>
        </div>
        <p className={styles.legend}>
          {EDGE_KINDS.map(({ kind, label }) => (
            <button
              type="button"
              key={kind}
              data-kind={kind}
              aria-pressed={!hiddenKinds.has(kind)}
              onClick={() => toggleKind(kind)}
              title={
                hiddenKinds.has(kind)
                  ? `${label} 선 표시하기`
                  : `${label} 선 숨기기`
              }
            >
              {label}
            </button>
          ))}
          <span className={styles.legendHint}>
            절차에 마우스를 올리면 연결된 선만 강조됩니다
          </span>
          <span className={styles.search}>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="절차 검색 — 이름·담당·마일스톤"
              aria-label="절차 검색"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  stepMatch(event.shiftKey ? -1 : 1);
                }
              }}
            />
            {queryActive && matchList.length > 0 && (
              <span className={styles.searchNav}>
                <button type="button" onClick={() => stepMatch(-1)} aria-label="이전 일치">
                  ‹
                </button>
                <b>
                  {Math.min(matchIndex + 1, matchList.length)}/{matchList.length}
                </b>
                <button type="button" onClick={() => stepMatch(1)} aria-label="다음 일치">
                  ›
                </button>
              </span>
            )}
            {queryActive && matchList.length === 0 && <b>일치 없음</b>}
          </span>
          <button
            type="button"
            className={styles.bulkToggle}
            onClick={() =>
              setCollapsed((previous) =>
                previous.size < stageBands.length
                  ? new Set(stageBands.map((band) => band.stageId))
                  : new Set(),
              )
            }
          >
            {collapsed.size < stageBands.length ? "모두 접기" : "모두 펼치기"}
          </button>
          <span className={styles.zoomControl} role="group" aria-label="확대·축소">
            <button
              type="button"
              onClick={() => setZoom((value) => Math.max(0.7, Math.round((value - 0.1) * 10) / 10))}
              aria-label="축소"
            >
              −
            </button>
            <button type="button" onClick={() => setZoom(1)} title="기본 크기">
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((value) => Math.min(1.6, Math.round((value + 0.1) * 10) / 10))}
              aria-label="확대"
            >
              +
            </button>
            <button
              type="button"
              onClick={fitWidth}
              title="전체 폭을 화면에 맞춤"
            >
              폭맞춤
            </button>
          </span>
        </p>

        <div className={styles.summaryStrip}>
          <div className={styles.minimap} aria-label="마일스톤×레인 밀도 미니맵">
            <p className={styles.summaryCaption}>
              <span>밀도 미니맵</span>
              <small>마일스톤 × 주체군 · 클릭하면 이동</small>
            </p>
            <div className={styles.minimapBands}>
              {stageBands.map((band) => (
                <div
                  className={styles.minimapBand}
                  key={band.stageId}
                  data-current={scrollPos?.gateId === band.stageId ? "true" : undefined}
                >
                  <div className={styles.minimapGrid}>
                    {band.milestones.map((milestone) => (
                      <button
                        type="button"
                        className={styles.minimapCol}
                        key={milestone.id}
                        data-status={milestone.status}
                        title={`${milestone.id} ${milestone.name} · ${milestone.procCount}개 절차`}
                        onClick={() => {
                          setCollapsed((previous) => {
                            if (!previous.has(band.stageId)) return previous;
                            const next = new Set(previous);
                            next.delete(band.stageId);
                            return next;
                          });
                          requestAnimationFrame(() =>
                          document
                            .getElementById(milestone.id)
                            ?.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            }),
                          );
                        }}
                      >
                        {milestone.laneCounts.map((count, laneIndex) => (
                          <i
                            key={lanes[laneIndex].id}
                            style={{
                              opacity:
                                count === 0
                                  ? 0.08
                                  : 0.25 + 0.75 * (count / maxCellCount),
                            }}
                          />
                        ))}
                      </button>
                    ))}
                  </div>
                  <small>{band.label.slice(0, 2)}</small>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.sankey} aria-label="주체군 간 인계 요약">
            <p className={styles.summaryCaption}>
              <span>레인 간 인계</span>
              <small>{handoffTotal}건</small>
            </p>
            <svg
              viewBox={`0 0 240 ${lanes.length * 19 + 8}`}
              className={styles.sankeySvg}
              style={{ height: lanes.length * 19 + 8 }}
            >
              {lanes.map((lane, index) => (
                <text
                  key={`l-${lane.id}`}
                  x={2}
                  y={index * 19 + 13}
                  className={styles.sankeyLabel}
                >
                  {lane.label.split("·")[0]}
                </text>
              ))}
              {lanes.map((lane, index) => (
                <text
                  key={`r-${lane.id}`}
                  x={238}
                  y={index * 19 + 13}
                  textAnchor="end"
                  className={styles.sankeyLabel}
                >
                  {lane.label.split("·")[0]}
                </text>
              ))}
              {handoffMatrix.flatMap((row, sourceLane) =>
                row.map((count, targetLane) => {
                  if (count === 0) return null;
                  const y1 = sourceLane * 19 + 10;
                  const y2 = targetLane * 19 + 10;
                  const width = Math.min(9, 1 + count * 0.7);
                  return (
                    <path
                      key={`${sourceLane}-${targetLane}`}
                      className={styles.sankeyBand}
                      d={`M 62 ${y1} C 120 ${y1}, 120 ${y2}, 178 ${y2}`}
                      strokeWidth={width}
                    >
                      <title>
                        {`${lanes[sourceLane].label} → ${lanes[targetLane].label} · ${count}건`}
                      </title>
                    </path>
                  );
                }),
              )}
            </svg>
          </div>
        </div>
      </header>

      {hoverDetail && (
        <aside
          className={styles.hoverPanel}
          data-pinned={pinnedKey ? "true" : "false"}
          aria-live="polite"
        >
          {pinnedKey && (
            <button
              type="button"
              className={styles.panelClose}
              onClick={() => setPinnedKey(null)}
              aria-label="고정 해제"
            >
              ×
            </button>
          )}
          <p>
            <b>{hoverDetail.proc.procId}</b> {hoverDetail.proc.procName}
          </p>
          <small>
            {hoverDetail.proc.templateId && pinnedKey ? (
              <Link
                className={styles.templateLink}
                href={`/model/${hoverDetail.proc.templateId}/#${hoverDetail.proc.procId}`}
              >
                {hoverDetail.proc.templateName} — 제도 원본에서 보기 ↗
              </Link>
            ) : (
              <>
                {hoverDetail.proc.templateName}
                {hoverDetail.proc.templateId && (
                  <em className={styles.linkHint}>
                    {" "}
                    · 절차를 클릭해 고정하면 원본 링크가 열립니다
                  </em>
                )}
              </>
            )}
          </small>
          <dl>
            <div>
              <dt>담당</dt>
              <dd>{hoverDetail.proc.procActor}</dd>
            </div>
            <div>
              <dt>마일스톤</dt>
              <dd>
                {hoverDetail.milestoneId} {hoverDetail.milestoneName}
              </dd>
            </div>
            <div>
              <dt>산출물</dt>
              <dd>{hoverDetail.proc.outputs || "미기재"}</dd>
            </div>
            <div>
              <dt>법적 근거</dt>
              <dd>
                {hoverDetail.proc.legalBasisList.length > 0 ? (
                  <ul className={styles.lawList}>
                    {hoverDetail.proc.legalBasisList.map((basis, index) => (
                      <li key={`${basis.law}:${basis.article}:${index}`}>
                        {pinnedKey ? (
                          <a
                            href={lawUrlOf(basis.law, basis.article)}
                            target="_blank"
                            rel="noreferrer"
                            title="법제처 국가법령정보센터에서 원문 보기"
                          >
                            <b>{basis.law}</b> {basis.article} ↗
                          </a>
                        ) : (
                          <span>
                            <b>{basis.law}</b> {basis.article}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  `${hoverDetail.proc.legalBasis}건`
                )}
              </dd>
            </div>
            {pinnedPath && (
              <div>
                <dt>전체 사슬</dt>
                <dd>
                  상류 {pinnedPath.upstream} · 하류 {pinnedPath.downstream} —
                  경로만 강조 중
                </dd>
              </div>
            )}
          </dl>
          {pinnedKey && (
            <button
              type="button"
              className={styles.copyLink}
              onClick={() => {
                navigator.clipboard?.writeText(window.location.href);
              }}
            >
              이 절차 링크 복사
            </button>
          )}
          {detailLinks.length > 0 && (
            <div className={styles.linkList}>
              <span>
                연결 절차 {detailLinks.length}건
                {!pinnedKey && " — 절차를 클릭하면 따라갈 수 있습니다"}
              </span>
              {pinnedKey && (
                <ul>
                  {detailLinks.slice(0, 8).map((link) => (
                    <li key={`${link.key}:${link.outgoing ? "o" : "i"}`}>
                      <button type="button" onClick={() => scrollToProc(link.key)}>
                        <em data-kind={link.kind}>{link.outgoing ? "다음 →" : "← 이전"}</em>
                        <span>{link.label}</span>
                        <small>{link.milestoneId}</small>
                      </button>
                    </li>
                  ))}
                  {detailLinks.length > 8 && <li className={styles.linkMore}>외 {detailLinks.length - 8}건</li>}
                </ul>
              )}
            </div>
          )}
        </aside>
      )}
      <nav className={styles.floatMap} aria-label="전체 지형 미니맵">
        {stageBands.map((band) => (
          <div
            key={band.stageId}
            className={styles.floatMapRow}
            data-current={scrollPos?.gateId === band.stageId ? "true" : "false"}
          >
            <b>{band.label.slice(0, 2)}</b>
            <span>
              {band.milestones.map((milestone) => (
                <i
                  key={milestone.id}
                  data-status={milestone.status}
                  title={`${milestone.id} ${milestone.name}`}
                  onClick={() => jumpToMilestone(band.stageId, milestone.id)}
                />
              ))}
            </span>
          </div>
        ))}
      </nav>
      {scrollPos && (
        <button
          type="button"
          className={styles.positionHud}
          onClick={() =>
            document
              .getElementById(scrollPos.milestoneId)
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          title="현재 위치 — 클릭하면 마일스톤 시작으로 이동"
        >
          <b>{scrollPos.gate}</b>
          <span>
            {scrollPos.milestoneId} {scrollPos.milestoneName}
          </span>
          {scrollPos.laneLabel && (
            <small className={styles.hudLane}>◫ {scrollPos.laneLabel}</small>
          )}
        </button>
      )}
      <div
        className={styles.viewport}
        ref={viewportRef}
        data-panning={panning ? "true" : "false"}
        onPointerDown={onPanPointerDown}
        onPointerMove={onPanPointerMove}
        onPointerUp={onPanPointerEnd}
        onPointerCancel={onPanPointerEnd}
        onClickCapture={onPanClickCapture}
      >
        <div
          className={styles.sheet}
          style={{ "--flow-columns": gridColumns, zoom } as CSSProperties & { zoom: number }}
        >
          <div className={styles.laneHeader}>
            <span className={styles.laneHeaderGate}>게이트 / 마일스톤</span>
            {lanes.map((lane, laneIndex) => {
              const count = laneSubColumnCounts[laneIndex];
              if (count === 0) return null;
              return (
                <span
                  className={styles.laneGroupHead}
                  key={lane.id}
                  style={{ gridColumn: `span ${count}`, cursor: "pointer" }}
                  data-collapsed={hiddenLanes.has(laneIndex) ? "true" : "false"}
                  title={hiddenLanes.has(laneIndex) ? `${lane.label} 펼치기` : `${lane.label} 접기`}
                  onClick={() => toggleLane(laneIndex)}
                >
                  {hiddenLanes.has(laneIndex) ? `▸ ${lane.label}` : `${lane.label}`}
                  {!hiddenLanes.has(laneIndex) && <small>{count}</small>}
                </span>
              );
            })}
          </div>
          <div className={styles.actorHeader}>
            <span className={styles.actorHeaderGate} />
            {subColumns.map((subColumn, index) => (
              <span
                key={`${subColumn.lane}:${subColumn.label}`}
                data-lane={subColumn.lane}
                data-hidden={hiddenLanes.has(subColumn.lane) ? "true" : "false"}
                data-other={subColumn.isOther ? "true" : "false"}
                data-col-hover={index === hoverSubCol ? "true" : "false"}
                data-col-pin={index === pinnedCol ? "true" : "false"}
                data-first={
                  index === 0 || subColumns[index - 1].lane !== subColumn.lane
                    ? "true"
                    : "false"
                }
                title={
                  index === pinnedCol
                    ? `${subColumn.label} — 열 강조 해제`
                    : `${subColumn.label} — 클릭하면 이 열만 강조`
                }
                onClick={() => toggleCol(index)}
              >
                {subColumn.label}
              </span>
            ))}
          </div>

          <div
            className={styles.canvas}
            ref={canvasRef}
            onMouseLeave={() => setHoverKey(null)}
          >
            <svg
              className={styles.edgeLayer}
              width={size.width}
              height={size.height}
              viewBox={`0 0 ${size.width} ${size.height}`}
              aria-hidden="true"
            >
              <defs>
                {[
                  ...EDGE_COLORS.map(({ kind, color }) => ({
                    key: kind as string,
                    color,
                  })),
                  ...LANE_EDGE_COLORS.map((color, laneIndex) => ({
                    key: `lane${laneIndex}`,
                    color,
                  })),
                ].map(({ key: markerKey, color }) => (
                  <Fragment key={markerKey}>
                    <marker
                      id={`flow-arrow-${markerKey}`}
                      viewBox="0 0 8 8"
                      refX="7"
                      refY="4"
                      markerWidth="5"
                      markerHeight="5"
                      orient="auto-start-reverse"
                    >
                      {markerPath(markerShapeOf(markerKey), color)}
                    </marker>
                    <marker
                      id={`flow-arrow-${markerKey}-on`}
                      viewBox="0 0 8 8"
                      refX="7"
                      refY="4"
                      markerWidth="7"
                      markerHeight="7"
                      orient="auto-start-reverse"
                    >
                      {markerPath(markerShapeOf(markerKey), color)}
                    </marker>
                  </Fragment>
                ))}
              </defs>
              {edgePaths
                .filter((edge) => !hiddenKinds.has(edge.kind))
                .map((edge) => {
                  const active =
                    hoverEdgeId === edge.id ||
                    (hoverKey !== null &&
                      (edge.source === hoverKey || edge.target === hoverKey));
                  const onPath = pinnedPath
                    ? pinnedPath.nodes.has(edge.source) &&
                      pinnedPath.nodes.has(edge.target)
                    : false;
                  const colPinMiss =
                    pinnedCol !== null &&
                    procByKey.get(edge.source)?.proc.subCol !== pinnedCol &&
                    procByKey.get(edge.target)?.proc.subCol !== pinnedCol;
                  const dim =
                    colPinMiss ||
                    (queryActive &&
                      !matchKeys.has(edge.source) &&
                      !matchKeys.has(edge.target)) ||
                    (pinnedPath ? !onPath : hoverKey !== null && !active);
                  const sourceInfo = procByKey.get(edge.source);
                  const targetInfo = procByKey.get(edge.target);
                  const kindLabel =
                    EDGE_KINDS.find((item) => item.kind === edge.kind)?.label ??
                    edge.kind;
                  const sourceLane = sourceInfo?.proc.lane;
                  const stroke = edgeColorOf(edge.kind, sourceLane);
                  const markerKey =
                    edge.kind === "sequence" && sourceLane !== undefined
                      ? `lane${sourceLane}`
                      : edge.kind;
                  return (
                    <g key={edge.id}>
                      {/* 케이싱 겸 히트 영역 — 교차부에서 아래 선을 지워 위·아래가 읽히고, 넓은 투명 획이 호버를 받는다 */}
                      <path
                        className={styles.edgeHit}
                        d={edge.path}
                        data-dim={dim ? "true" : "false"}
                        onMouseEnter={() => setHoverEdgeId(edge.id)}
                        onMouseLeave={() =>
                          setHoverEdgeId((value) =>
                            value === edge.id ? null : value,
                          )
                        }
                      >
                        <title>
                          {`${kindLabel} · ${sourceInfo?.proc.procId ?? ""} ${sourceInfo?.proc.procName ?? edge.source} → ${targetInfo?.proc.procId ?? ""} ${targetInfo?.proc.procName ?? edge.target}`}
                        </title>
                      </path>
                      <path
                        className={styles.edge}
                        d={edge.path}
                        data-kind={edge.kind}
                        data-active={active || onPath ? "true" : "false"}
                        data-flow={onPath ? "true" : "false"}
                        data-dim={dim ? "true" : "false"}
                        style={{ stroke }}
                        markerEnd={`url(#flow-arrow-${markerKey}${active || onPath ? "-on" : ""})`}
                      />
                    </g>
                  );
                })}
            </svg>

            {stageBands.map((band) => (
              <section
                className={styles.stageBand}
                key={band.stageId}
                id={`gate-${band.stageId}`}
              >
                <h2
                  className={styles.stageTitle}
                  data-collapsed={collapsed.has(band.stageId) ? "true" : "false"}
                  onClick={() =>
                    setCollapsed((previous) => {
                      const next = new Set(previous);
                      if (next.has(band.stageId)) next.delete(band.stageId);
                      else next.add(band.stageId);
                      return next;
                    })
                  }
                  title={collapsed.has(band.stageId) ? "펼치기" : "접기"}
                >
                  <span>
                    <em className={styles.stageChevron} aria-hidden="true">
                      {collapsed.has(band.stageId) ? "▸" : "▾"}
                    </em>
                    {band.label}
                    <small>
                      {band.milestones.length}개 마일스톤 ·{" "}
                      {band.milestones.reduce(
                        (total, milestone) => total + milestone.procCount,
                        0,
                      )}
                      개 절차
                      {band.leadLaneLabel && (
                        <i className={styles.leadLane}>{band.leadLaneLabel}</i>
                      )}
                      {collapsed.has(band.stageId) ? " · 접힘" : ""}
                    </small>
                  </span>
                </h2>
                {collapsed.has(band.stageId) && (
                  <div className={styles.collapsedChips}>
                    {band.milestones.map((milestone) => (
                      <button
                        type="button"
                        key={milestone.id}
                        className={styles.milestoneChip}
                        data-status={milestone.status}
                        title={`${milestone.name} · ${milestone.procCount}개 절차 — 클릭하면 펼치고 이동`}
                        onClick={() => jumpToMilestone(band.stageId, milestone.id)}
                      >
                        <i />
                        {milestone.id}
                        <small>{milestone.procCount}</small>
                      </button>
                    ))}
                  </div>
                )}
                {!collapsed.has(band.stageId) && band.milestones.map((milestone) => (
                  <div
                    className={styles.milestoneStrip}
                    key={milestone.id}
                    id={milestone.id}
                    data-status={milestone.status}
                    data-gate={band.label}
                    data-gate-id={band.stageId}
                    data-ms-name={milestone.name}
                    data-row-hover={
                      milestone.id === hoverMilestoneId ? "true" : "false"
                    }
                  >
                    <div className={styles.milestoneGutter}>
                      <div className={styles.gutterSticky}>
                      <p>
                        <b>{milestone.id}</b>
                        <small data-status={milestone.status}>
                          {
                            STATUS_META[
                              milestone.status as keyof typeof STATUS_META
                            ]?.code
                          }
                        </small>
                      </p>
                      <span>{milestone.name}</span>
                      <span
                        className={styles.gutterBullet}
                        title={`절차 ${milestone.procCount}개 중 확정 매핑(MAP) ${milestone.exactCount}개`}
                      >
                        <i
                          style={{
                            width: `${(milestone.procCount / maxMilestoneProcs) * 100}%`,
                          }}
                        >
                          <b
                            style={{
                              width: `${
                                milestone.procCount > 0
                                  ? (milestone.exactCount /
                                      milestone.procCount) *
                                    100
                                  : 0
                              }%`,
                            }}
                          />
                        </i>
                      </span>
                      <small>
                        {milestone.procCount}절차 · MAP{" "}
                        {milestone.procCount > 0
                          ? Math.round(
                              (milestone.exactCount / milestone.procCount) *
                                100,
                            )
                          : 0}
                        %
                      </small>
                      </div>
                    </div>
                    {[...milestone.cells.entries()].map(
                      ([subColumn, procs]) => (
                        <div
                          className={styles.cell}
                          key={subColumn}
                          data-lane={subColumns[subColumn]?.lane}
                          data-hidden={
                            hiddenLanes.has(subColumns[subColumn]?.lane ?? -1)
                              ? "true"
                              : "false"
                          }
                          data-col-hover={
                            subColumn === hoverSubCol ? "true" : "false"
                          }
                          data-col-pin={
                            subColumn === pinnedCol ? "true" : "false"
                          }
                          style={{ gridColumn: subColumn + 2, gridRow: 1 }}
                        >
                          {procs.map((proc, procIndex) => {
                            const showTemplate =
                              procIndex === 0 ||
                              procs[procIndex - 1].templateName !==
                                proc.templateName;
                            const isHovered =
                              hoverKey === proc.key ||
                              (hoverEdgeEnds?.has(proc.key) ?? false);
                            const isNeighbor =
                              hoverNeighbors?.has(proc.key) ?? false;
                            const colPinMiss =
                              pinnedCol !== null && proc.subCol !== pinnedCol;
                            return (
                              <Fragment key={proc.key}>
                              {showTemplate && (
                                <i
                                  className={styles.procTemplate}
                                  title={proc.templateName}
                                >
                                  {proc.templateName}
                                </i>
                              )}
                              <span
                                className={styles.proc}
                                ref={setProcRef(proc.key)}
                                data-mapping={proc.mapping}
                                data-type={proc.procType}
                                data-hover={isHovered ? "true" : "false"}
                                data-dim={
                                  colPinMiss ||
                                  (queryActive && !matchKeys.has(proc.key)) ||
                                  (pinnedPath
                                    ? !pinnedPath.nodes.has(proc.key)
                                    : hoverKey !== null &&
                                      !isHovered &&
                                      !isNeighbor)
                                    ? "true"
                                    : "false"
                                }
                                title={proc.title}
                                data-pinned={pinnedKey === proc.key ? "true" : "false"}
                                data-flash={flashKey === proc.key ? "true" : "false"}
                                onMouseEnter={() => setHoverKey(proc.key)}
                                onClick={(event) => {
                                  // 더블클릭의 두 번째 클릭이 핀을 도로 풀지 않게
                                  if (event.detail > 1) return;
                                  setPinnedKey((value) =>
                                    value === proc.key ? null : proc.key,
                                  );
                                }}
                              >
                                <b>{proc.procId}</b>
                                <i>{proc.procName}</i>
                                {subColumns[subColumn]?.isOther && (
                                  <small>{proc.procActor}</small>
                                )}
                              </span>
                              </Fragment>
                            );
                          })}
                        </div>
                      ),
                    )}
                  </div>
                ))}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
