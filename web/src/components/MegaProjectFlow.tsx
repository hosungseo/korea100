"use client";

import Link from "next/link";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
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
import styles from "./MegaProjectFlow.module.css";

interface MegaProjectFlowProps {
  project: MegaProject;
  artifacts: MegaArtifact[];
  templates: Record<string, string>;
  detailTemplates: Record<string, MegaDetailTemplate>;
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
  title: string;
}

const LANES = [
  { id: "applicant", label: "신청인·사업자" },
  { id: "residents", label: "주민·이해관계자" },
  { id: "local", label: "지자체·인허가부서" },
  { id: "central", label: "중앙부처" },
  { id: "expert", label: "위원회·전문기관" },
  { id: "operator", label: "행정청·집행·시스템" },
] as const;

const EDGE_KINDS: { kind: EdgeKind; label: string }[] = [
  { kind: "sequence", label: "제도 내 순서" },
  { kind: "chain", label: "제도 간 연결" },
  { kind: "internal", label: "마일스톤 선행(기관 내)" },
  { kind: "handoff", label: "기관 간 인계" },
  { kind: "conditional", label: "미확정 분기" },
];

function laneOf(actor: string): number {
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
}: MegaProjectFlowProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const procRefs = useRef(new Map<string, HTMLElement>());
  const [edgePaths, setEdgePaths] = useState<FlowEdgePath[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [hiddenKinds, setHiddenKinds] = useState<Set<EdgeKind>>(new Set());

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
    const laneTopActors: string[][] = LANES.map(() => []);
    const laneOtherActors: string[][] = LANES.map(() => []);
    sortedActors.forEach(([actor]) => {
      if (topActors.has(actor)) laneTopActors[laneOf(actor)].push(actor);
      else laneOtherActors[laneOf(actor)].push(actor);
    });
    const subColumnOfActor = new Map<string, number>();
    const subColumns: { label: string; lane: number; isOther: boolean }[] = [];
    const laneSubColumnCounts: number[] = LANES.map(() => 0);
    LANES.forEach((_, laneIndex) => {
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
              const subColumn = subColumnOfActor.get(proc.actor) ?? 0;
              const cell = cells.get(subColumn) ?? [];
              cell.push({
                key: `${group.id}:${proc.id}`,
                mapping: group.mapping,
                procId: proc.id,
                procName: proc.name,
                procType: proc.type,
                procActor: proc.actor,
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

        return {
          stageId: stage.id,
          label: `${String(stageIndex + 1).padStart(2, "0")} ${stage.label}`,
          shortLabel: `${String(stageIndex + 1).padStart(2, "0")} ${stage.label}`,
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

    return {
      edges,
      stageBands,
      subColumns,
      laneSubColumnCounts,
      totalProcs,
      neighborsByNode,
      gridTemplate,
    };
  }, [artifacts, detailTemplates, project, templates]);

  const {
    edges,
    stageBands,
    subColumns,
    laneSubColumnCounts,
    totalProcs,
    neighborsByNode,
    gridTemplate,
  } = derived;

  const updateGeometry = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const paths = edges.flatMap((edge) => {
      const source = procRefs.current.get(edge.source);
      const target = procRefs.current.get(edge.target);
      if (!source || !target) return [];
      const sourceRect = source.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const sourceCenterX =
        sourceRect.left - canvasRect.left + sourceRect.width / 2;
      const targetCenterX =
        targetRect.left - canvasRect.left + targetRect.width / 2;
      const sameColumn =
        Math.abs(sourceCenterX - targetCenterX) < sourceRect.width * 0.6;
      let path: string;
      if (sameColumn) {
        const goDown = targetRect.top >= sourceRect.top;
        const sourceY = goDown
          ? sourceRect.bottom - canvasRect.top
          : sourceRect.top - canvasRect.top;
        const targetY = goDown
          ? targetRect.top - canvasRect.top
          : targetRect.bottom - canvasRect.top;
        const bend = Math.max(4, Math.abs(targetY - sourceY) * 0.35);
        const direction = goDown ? 1 : -1;
        path = `M ${sourceCenterX} ${sourceY} C ${sourceCenterX + 5} ${sourceY + bend * direction}, ${targetCenterX - 5} ${targetY - bend * direction}, ${targetCenterX} ${targetY}`;
      } else {
        const goRight = targetCenterX > sourceCenterX;
        const sourceX = goRight
          ? sourceRect.right - canvasRect.left
          : sourceRect.left - canvasRect.left;
        const sourceY = sourceRect.top - canvasRect.top + sourceRect.height / 2;
        const targetX = goRight
          ? targetRect.left - canvasRect.left
          : targetRect.right - canvasRect.left;
        const targetY = targetRect.top - canvasRect.top + targetRect.height / 2;
        const dx = Math.max(18, Math.abs(targetX - sourceX) * 0.3);
        const direction = goRight ? 1 : -1;
        path = `M ${sourceX} ${sourceY} C ${sourceX + dx * direction} ${sourceY}, ${targetX - dx * direction} ${targetY}, ${targetX} ${targetY}`;
      }
      return [{ ...edge, path }];
    });
    setSize({ width: canvas.scrollWidth, height: canvas.scrollHeight });
    setEdgePaths(paths);
  }, [edges]);

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

  return (
    <div className={`${styles.page} mega-flow-page`}>
      <header className={styles.header}>
        <p className={styles.kicker}>
          MEGA / PERMIT GIANT SWIMLANE
          <span className={styles.kickerLinks}>
            <Link href={`/mega-projects/${project.id}/`}>전경</Link>
            <Link href={`/mega-projects/${project.id}/unfold/`}>펼쳐보기</Link>
            <Link href={`/mega-projects/${project.id}/table/`}>전체표</Link>
          </span>
        </p>
        <div className={styles.headerRow}>
          <div>
            <h1>{project.name} 절차 스윔레인</h1>
            <p className={styles.meta}>
              기준일 {formatDate(project.asOfDate)} · 절차 {totalProcs}개 ·
              연결선 {edges.length}건 · 가로 {LANES.length}개 주체군 ×{" "}
              {subColumns.length}개 담당자 · 세로 {stageBands.length}개 게이트
              × 49개 마일스톤
            </p>
          </div>
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
        </p>
      </header>

      <div className={styles.viewport} ref={viewportRef}>
        <div
          className={styles.sheet}
          style={{ "--flow-columns": gridTemplate } as CSSProperties}
        >
          <div className={styles.laneHeader}>
            <span className={styles.laneHeaderGate}>게이트 / 마일스톤</span>
            {LANES.map((lane, laneIndex) => {
              const count = laneSubColumnCounts[laneIndex];
              if (count === 0) return null;
              return (
                <span
                  className={styles.laneGroupHead}
                  key={lane.id}
                  style={{ gridColumn: `span ${count}` }}
                >
                  {lane.label}
                  <small>{count}</small>
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
                data-other={subColumn.isOther ? "true" : "false"}
                data-first={
                  index === 0 || subColumns[index - 1].lane !== subColumn.lane
                    ? "true"
                    : "false"
                }
                title={subColumn.label}
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
              {edgePaths
                .filter((edge) => !hiddenKinds.has(edge.kind))
                .map((edge) => {
                  const active =
                    hoverKey !== null &&
                    (edge.source === hoverKey || edge.target === hoverKey);
                  return (
                    <path
                      key={edge.id}
                      className={styles.edge}
                      d={edge.path}
                      data-kind={edge.kind}
                      data-active={active ? "true" : "false"}
                      data-dim={
                        hoverKey !== null && !active ? "true" : "false"
                      }
                    />
                  );
                })}
            </svg>

            {stageBands.map((band) => (
              <section
                className={styles.stageBand}
                key={band.stageId}
                id={`gate-${band.stageId}`}
              >
                <h2 className={styles.stageTitle}>
                  <span>{band.label}</span>
                  <small>{band.milestones.length}개 마일스톤</small>
                </h2>
                {band.milestones.map((milestone) => (
                  <div
                    className={styles.milestoneStrip}
                    key={milestone.id}
                    id={milestone.id}
                    data-status={milestone.status}
                  >
                    <div className={styles.milestoneGutter}>
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
                      <small>{milestone.procCount}개 절차</small>
                    </div>
                    {[...milestone.cells.entries()].map(
                      ([subColumn, procs]) => (
                        <div
                          className={styles.cell}
                          key={subColumn}
                          data-lane={subColumns[subColumn]?.lane}
                          style={{ gridColumn: subColumn + 2 }}
                        >
                          {procs.map((proc) => {
                            const isHovered = hoverKey === proc.key;
                            const isNeighbor =
                              hoverNeighbors?.has(proc.key) ?? false;
                            return (
                              <span
                                className={styles.proc}
                                key={proc.key}
                                ref={setProcRef(proc.key)}
                                data-mapping={proc.mapping}
                                data-type={proc.procType}
                                data-hover={isHovered ? "true" : "false"}
                                data-dim={
                                  hoverKey !== null &&
                                  !isHovered &&
                                  !isNeighbor
                                    ? "true"
                                    : "false"
                                }
                                title={proc.title}
                                onMouseEnter={() => setHoverKey(proc.key)}
                              >
                                <b>{proc.procId}</b>
                                <i>{proc.procName}</i>
                                {subColumns[subColumn]?.isOther && (
                                  <small>{proc.procActor}</small>
                                )}
                              </span>
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
