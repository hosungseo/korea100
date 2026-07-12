"use client";

import {
  Fragment,
  useState,
  useLayoutEffect,
  useRef,
  useCallback,
  useEffect,
} from "react";
import type {
  ProcessModel,
  ProcessNode,
  ProcessEdge,
  SourceVerification,
} from "@/lib/types";
import { getNodeVerification } from "@/lib/process-verification";
import {
  NodeLegalVerification,
  ProcessVerificationSummaryBar,
  VerificationLegend,
  VerificationMark,
} from "./ProcessVerification";

// ── Constants ─────────────────────────────────────────────────────────────────
const LANE_W = 104;
const STAGE_W = 188;
type MobileBoardView = "swimlane" | "timeline";

// 카드용 법조항 축약: 첫 근거의 첫 조문만, 괄호 설명 제거. "환경영향평가법 제24조 외 2"
function compactLegal(
  lb?: Array<{ law: string; article: string }>
): string | null {
  if (!lb || lb.length === 0) return null;
  const first = lb[0];
  const art = (first.article || "")
    .split(",")[0]
    .replace(/\([^)]*\)/g, "")
    .trim();
  const more = lb.length > 1 ? ` 외 ${lb.length - 1}` : "";
  return `${first.law} ${art}${more}`.trim();
}
const LOOP_BELOW = 68;

// ── Status styles ─────────────────────────────────────────────────────────────
const SS: Record<string, { bg: string; border: string; dot: string; label: string; ink: string; sub: string }> = {
  done:    { bg: "#f5f7f6", border: "#dde5df", dot: "#bdcbc4", label: "",     ink: "#111714", sub: "#87938d" },
  current: { bg: "#0f9f72", border: "#0f9f72", dot: "#fff",    label: "핵심", ink: "#ffffff", sub: "rgba(255,255,255,.8)" },
  waiting: { bg: "#f5f7f6", border: "#dde5df", dot: "#bdcbc4", label: "",     ink: "#111714", sub: "#87938d" },
  risk:    { bg: "#fffbf0", border: "#d97706", dot: "#d97706", label: "유의",  ink: "#92400e", sub: "#d97706" },
  loop:    { bg: "#eff6ff", border: "#2563eb", dot: "#2563eb", label: "회귀",  ink: "#1e3a8a", sub: "#2563eb" },
  gateway: { bg: "#f5f7f6", border: "#c4cfc8", dot: "#87938d", label: "판단",  ink: "#111714", sub: "#87938d" },
};
function ss(status: string) { return SS[status] ?? SS.waiting; }

// ── Stage status helper ───────────────────────────────────────────────────────
export function stageStatus(stage: string, nodes: ProcessNode[]): string {
  const sn = nodes.filter((n) => n.stage === stage);
  if (!sn.length) return "waiting";
  if (sn.some((n) => n.status === "current")) return "current";
  if (sn.some((n) => n.status === "risk")) return "risk";
  if (sn.every((n) => n.status === "done")) return "done";
  return "waiting";
}

// ── GateTimeline ──────────────────────────────────────────────────────────────
function GateTimeline({
  stages,
  nodes,
  onStageClick,
}: {
  stages: string[];
  nodes: ProcessNode[];
  onStageClick: (s: string) => void;
}) {
  return (
    <div
      style={{
        overflowX: "auto",
        scrollbarWidth: "none",
        padding: "2px 0 12px",
      }}
    >
      <div
        style={{
          display: "flex",
          minWidth: "max-content",
          paddingLeft: LANE_W,
        }}
      >
        {stages.map((stage, i) => {
          const st = stageStatus(stage, nodes);
          const isLast = i === stages.length - 1;
          const [code, ...rest] = stage.split(" ");
          const dotBg =
            st === "current" ? "#0f9f72" : st === "risk" ? "#d97706" : "transparent";
          const dotBorder =
            st === "current" ? "#0f9f72" : st === "risk" ? "#d97706" : "#bdcbc4";
          const labelColor =
            st === "current" ? "#0f9f72" : st === "risk" ? "#d97706" : "#87938d";

          return (
            <div
              key={stage}
              style={{
                position: "relative",
                width: STAGE_W,
                flexShrink: 0,
              }}
            >
              <button
                onClick={() => onStageClick(stage)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  padding: "0 12px",
                  width: "100%",
                  minHeight: 50,
                  position: "relative",
                  zIndex: 2,
                }}
                aria-label={`${stage} 로 이동`}
              >
                <div style={{ position: "relative" }}>
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: dotBg,
                      border: `2px solid ${dotBorder}`,
                      boxShadow:
                        st === "current" ? "0 0 0 3px rgba(15,159,114,.2)" : "none",
                      transition:
                        "background-color 180ms var(--ease-in-out), border-color 180ms var(--ease-in-out), box-shadow 180ms var(--ease-in-out)",
                    }}
                  />
                </div>
                <div style={{ textAlign: "center" }}>
                  <span
                    className="mono"
                    style={{ color: labelColor, display: "block", fontSize: 11 }}
                  >
                    {code}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      color: st === "current" ? "#111714" : "#87938d",
                      lineHeight: 1.25,
                      fontWeight: st === "current" ? 600 : 400,
                      display: "block",
                      maxWidth: 146,
                      wordBreak: "keep-all",
                    }}
                  >
                    {rest.join(" ")}
                  </span>
                </div>
              </button>
              {!isLast && (
                <div
                  style={{
                    position: "absolute",
                    top: 5,
                    left: "calc(50% + 8px)",
                    width: "calc(100% - 16px)",
                    height: 2,
                    background:
                      st === "done" || st === "current" ? "#0f9f72" : "#dde5df",
                    transition:
                      "background-color 180ms var(--ease-in-out)",
                    zIndex: 1,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MobileSwimlaneStageNav({
  stages,
  nodes,
  onStageClick,
}: {
  stages: string[];
  nodes: ProcessNode[];
  onStageClick: (stage: string) => void;
}) {
  return (
    <nav
      className="mobile-swimlane-stage-nav mobile-process-stage-nav"
      aria-label="스윔레인 단계 바로가기"
    >
      {stages.map((stage) => {
        const [code, ...rest] = stage.split(" ");
        return (
          <button
            key={stage}
            type="button"
            data-status={stageStatus(stage, nodes)}
            onClick={() => onStageClick(stage)}
            aria-label={`${stage} 열로 이동`}
          >
            <span>{code}</span>
            <strong>{rest.join(" ")}</strong>
          </button>
        );
      })}
    </nav>
  );
}

// ── Compact Node Card ─────────────────────────────────────────────────────────
export function SwimlaneNodeCard({
  node,
  verification,
  onClick,
  highlighted,
  dimmed,
  onHover,
  onLeave,
  setRef,
}: {
  node: ProcessNode;
  verification?: SourceVerification;
  onClick: (n: ProcessNode) => void;
  highlighted: boolean;
  dimmed: boolean;
  onHover: () => void;
  onLeave: () => void;
  setRef: (el: HTMLElement | null) => void;
}) {
  const c = ss(node.status);
  const isCurrent = node.status === "current";
  const isGateway = node.type === "gateway";
  const isLoop = node.status === "loop";
  const isRisk = node.status === "risk";
  const verificationResult = getNodeVerification(node, verification);

  return (
    <button
      className="swimlane-node-card"
      ref={setRef as React.Ref<HTMLButtonElement>}
      data-node-id={node.id}
      onClick={() => onClick(node)}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      aria-label={[node.name, c.label, verificationResult.label]
        .filter(Boolean)
        .join(" — ")}
      style={{
        "--node-card-border": c.border,
        "--node-card-shadow": isCurrent
          ? "0 0 0 3px rgba(15,159,114,.18), 0 2px 8px rgba(11,20,16,.06)"
          : highlighted
          ? "0 4px 16px rgba(11,20,16,.12)"
          : "0 1px 3px rgba(11,20,16,.05)",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        maxWidth: 148,
        height: node.blocker ? 132 : 112,
        textAlign: "left",
        padding: "8px 9px",
        background: c.bg,
        borderRadius: 8,
        cursor: "pointer",
        opacity: dimmed ? 0.28 : 1,
        position: "relative",
        flexShrink: 0,
        zIndex: 4,
      } as React.CSSProperties}
    >
      {/* top row: status dot + type icon + id */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: c.dot,
            flexShrink: 0,
            boxShadow: isCurrent ? "0 0 0 2px rgba(255,255,255,.5)" : "none",
          }}
        />
        {isGateway && (
          <span style={{ fontSize: 9, color: c.sub, fontWeight: 700 }}>◇</span>
        )}
        {isLoop && (
          <span style={{ fontSize: 10, color: c.sub }}>↩</span>
        )}
        {isRisk && (
          <span style={{ fontSize: 9, color: c.sub }}>⚠</span>
        )}
        <span
          className="mono"
          style={{
            fontSize: 9,
            color: c.sub,
            marginLeft: "auto",
            letterSpacing: "0.03em",
          }}
        >
          {node.id}
        </span>
      </div>

      {/* name — 2-line clamp */}
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 620,
          color: c.ink,
          lineHeight: 1.3,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {node.name}
      </div>

      {/* actor */}
      <div
        style={{
          fontSize: 9,
          color: c.sub,
          marginTop: 2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {node.actor}
      </div>

      {/* 법조항 — 카드에서 바로 근거 확인 (상세는 drawer) */}
      {compactLegal(node.legal_basis) && (
        <div
          style={{
            fontSize: 8.5,
            color: isCurrent ? "rgba(255,255,255,.72)" : "#68766f",
            marginTop: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            letterSpacing: "0.01em",
          }}
        >
          § {compactLegal(node.legal_basis)}
        </div>
      )}

      {/* blocker */}
      {node.blocker && (
        <div
          style={{
            marginTop: 4,
            fontSize: 9,
            color: isCurrent ? "#fff0c2" : "#b86409",
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          ⚠ {node.blocker}
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          marginTop: "auto",
          paddingTop: 5,
          minWidth: 0,
        }}
      >
        <VerificationMark result={verificationResult} inverse={isCurrent} compact />
        {verificationResult.lowConfidence && (
          <span
            title={`법령 근거 확신도 ${Math.round((node.confidence ?? 0) * 100)}%`}
            style={{
              minHeight: 16,
              padding: "1px 4px",
              borderRadius: 4,
              border: `1px solid ${isCurrent ? "rgba(255,255,255,.42)" : "#ead19b"}`,
              color: isCurrent ? "#ffffff" : "#9a650f",
              background: isCurrent ? "rgba(255,255,255,.14)" : "#fef6e7",
              fontSize: 8.5,
              fontWeight: 700,
              lineHeight: 1.4,
              whiteSpace: "nowrap",
            }}
          >
            현장
          </span>
        )}
      </div>

    </button>
  );
}

// ── Mobile process flow ──────────────────────────────────────────────────────
export function MobileProcessFlow({
  process,
  verification,
  onNodeClick,
}: {
  process: ProcessModel;
  verification?: SourceVerification;
  onNodeClick: (node: ProcessNode) => void;
}) {
  const { lanes, stages, nodes } = process;
  const [laneFilter, setLaneFilter] = useState("all");
  const stageRefs = useRef<Map<string, HTMLElement>>(new Map());
  const filterChangeRef = useRef(false);
  const visibleNodes =
    laneFilter === "all"
      ? nodes
      : nodes.filter((node) => node.lane === laneFilter);
  const visibleStages = stages.filter((stage) =>
    visibleNodes.some((node) => node.stage === stage)
  );
  const firstVisibleStage = visibleStages[0];

  const scrollToStage = useCallback((stage: string) => {
    const target = stageRefs.current.get(stage);
    if (!target) return;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    target.scrollIntoView({
      block: "start",
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, []);

  useEffect(() => {
    if (!filterChangeRef.current || !firstVisibleStage) return;
    filterChangeRef.current = false;
    stageRefs.current.get(firstVisibleStage)?.scrollIntoView({
      block: "start",
      behavior: "auto",
    });
  }, [firstVisibleStage, laneFilter]);

  return (
    <div className="mobile-process-flow">
      <div className="mobile-process-toolbar">
        <p aria-live="polite">
          <strong>{visibleNodes.length}</strong>개 업무
          <span aria-hidden="true">·</span>
          {visibleStages.length}단계
        </p>
        <label>
          <span>행위자</span>
          <select
            aria-label="행위자 필터"
            value={laneFilter}
            onChange={(event) => {
              filterChangeRef.current = true;
              setLaneFilter(event.target.value);
            }}
          >
            <option value="all">전체 행위자</option>
            {lanes.map((lane) => (
              <option key={lane} value={lane}>
                {lane}
              </option>
            ))}
          </select>
        </label>
      </div>

      <nav className="mobile-process-stage-nav" aria-label="업무 단계 바로가기">
        {visibleStages.map((stage) => {
          const [code, ...rest] = stage.split(" ");
          const status = stageStatus(stage, visibleNodes);
          return (
            <button
              key={stage}
              type="button"
              data-status={status}
              onClick={() => scrollToStage(stage)}
              aria-label={`${stage} 단계로 이동`}
            >
              <span>{code}</span>
              <strong>{rest.join(" ")}</strong>
            </button>
          );
        })}
      </nav>

      <div className="mobile-process-timeline">
        {visibleStages.map((stage) => {
          const [code, ...rest] = stage.split(" ");
          const stageNodes = visibleNodes.filter(
            (node) => node.stage === stage
          );
          const status = stageStatus(stage, visibleNodes);

          return (
            <section
              key={stage}
              ref={(element) => {
                if (element) stageRefs.current.set(stage, element);
                else stageRefs.current.delete(stage);
              }}
              className="mobile-process-stage"
              data-status={status}
              aria-labelledby={`mobile-stage-${code}`}
            >
              <header>
                <span className="mobile-process-stage-marker" aria-hidden="true" />
                <div>
                  <span className="mono">{code}</span>
                  <h3 id={`mobile-stage-${code}`}>{rest.join(" ")}</h3>
                </div>
                <span>{stageNodes.length}개</span>
              </header>

              <div className="mobile-process-node-list">
                {stageNodes.map((node) => (
                  <MobileProcessNode
                    key={node.id}
                    node={node}
                    verification={verification}
                    onClick={onNodeClick}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function MobileProcessNode({
  node,
  verification,
  onClick,
}: {
  node: ProcessNode;
  verification?: SourceVerification;
  onClick: (node: ProcessNode) => void;
}) {
  const colors = ss(node.status);
  const verificationResult = getNodeVerification(node, verification);
  const legal = compactLegal(node.legal_basis);

  return (
    <button
      type="button"
      className="mobile-process-node"
      data-status={node.status}
      onClick={() => onClick(node)}
      aria-label={`${node.name} — ${colors.label} — ${verificationResult.label}`}
      style={
        {
          "--mobile-node-bg": colors.bg,
          "--mobile-node-border": colors.border,
          "--mobile-node-ink": colors.ink,
          "--mobile-node-sub": colors.sub,
        } as React.CSSProperties
      }
    >
      <span className="mobile-process-node-rail" aria-hidden="true" />
      <span className="mobile-process-node-topline">
        {colors.label && (
          <span className="mobile-process-node-status">{colors.label}</span>
        )}
        <span className="mobile-process-node-actor">{node.actor}</span>
        <span className="mono">{node.id}</span>
      </span>
      <strong>{node.name}</strong>
      {legal && <span className="mobile-process-node-legal">§ {legal}</span>}
      {node.blocker && (
        <span className="mobile-process-node-blocker">⚠ {node.blocker}</span>
      )}
      <span className="mobile-process-node-verification">
        <VerificationMark
          result={verificationResult}
          inverse={node.status === "current"}
          compact
        />
        {node.status === "loop" && <span>↩ 회귀 연결</span>}
      </span>
    </button>
  );
}

// ── Node Drawer ───────────────────────────────────────────────────────────────
export function NodeDrawer({
  node,
  edges,
  verification,
  onClose,
}: {
  node: ProcessNode;
  edges: ProcessEdge[];
  verification?: SourceVerification;
  onClose: () => void;
}) {
  const c = ss(node.status);
  const loopEdges = edges.filter(
    (e) => e.type === "loop" && (e.source === node.id || e.target === node.id)
  );
  const msgEdges = edges.filter(
    (e) => e.type === "message" && (e.source === node.id || e.target === node.id)
  );
  const lowConf = node.confidence !== undefined && node.confidence < 0.8;
  const [closing, setClosing] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const requestClose = useCallback(
    (immediate = false) => {
      if (immediate) {
        onClose();
        return;
      }
      if (closing) return;
      setClosing(true);
      closeTimerRef.current = window.setTimeout(onClose, 160);
    },
    [closing, onClose]
  );

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        requestClose(true);
        return;
      }
      if (e.key === "Tab") {
        keepFocusInDrawer(e, drawerRef.current);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [requestClose]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      previousFocusRef.current?.focus();
    };
  }, []);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <>
      <div
        className="process-node-backdrop"
        data-closing={closing}
        onClick={() => requestClose()}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(11,20,16,.35)",
          zIndex: 100,
        }}
        aria-hidden="true"
      />
      <div
        ref={drawerRef}
        className="process-node-drawer"
        data-closing={closing}
        role="dialog"
        aria-modal="true"
        aria-label={node.name}
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: "min(480px, 100vw)",
          background: "#fff",
          borderLeft: "1px solid #dde5df",
          zIndex: 101,
          overflowY: "auto",
          padding: 28,
          boxShadow: "-8px 0 48px rgba(11,20,16,.12)",
        }}
      >
        {/* header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <span className="mono" style={{ color: "#87938d" }}>{node.id}</span>
              {c.label && (
                <span style={{
                  fontSize: 12, fontWeight: 600, padding: "2px 8px",
                  borderRadius: 4, background: c.bg, color: c.sub,
                  border: `1px solid ${c.border}`,
                }}>{c.label}</span>
              )}
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 680, color: "#111714", lineHeight: 1.3, margin: 0 }}>
              {node.name}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            className="process-node-close"
            onClick={() => requestClose()}
            aria-label="닫기"
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "#87938d", fontSize: 22, lineHeight: 1,
              padding: 4, flexShrink: 0, marginLeft: 16,
            }}
          >×</button>
        </div>

        {lowConf && (
          <div style={{
            padding: "10px 14px", background: "#fef6e7",
            borderRadius: 8, border: "1px solid rgba(199,129,22,.25)",
            fontSize: 13, color: "#c78116", fontWeight: 600, marginBottom: 16,
          }}>
            ⚠ 현장 검증 필요 — 법령 근거 확신도 {Math.round((node.confidence ?? 0) * 100)}%
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <MetaItem label="레인" value={node.lane} />
          <MetaItem label="게이트" value={node.stage} />
          <MetaItem label="담당" value={node.actor} />
          {node.action && <MetaItem label="행위" value={node.action} />}
        </div>

        {node.deadline && (
          <DrawerSection title="기한">
            <p style={{ fontSize: 14, color: "#111714", margin: 0 }}>{node.deadline}</p>
          </DrawerSection>
        )}

        {node.blocker && (
          <DrawerSection title="유의">
            <div style={{
              padding: "10px 12px", background: "#fef6e7",
              borderRadius: 8, fontSize: 14, color: "#c78116", fontWeight: 500,
            }}>{node.blocker}</div>
          </DrawerSection>
        )}

        {node.output_documents && node.output_documents.length > 0 && (
          <DrawerSection title="산출 문서">
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
              {node.output_documents.map((doc, i) => (
                <li key={i} style={{
                  fontSize: 14, color: "#111714", padding: "4px 0",
                  borderBottom: i < (node.output_documents?.length ?? 0) - 1 ? "1px solid #dde5df" : "none",
                  display: "flex", gap: 6, alignItems: "center",
                }}>
                  <span style={{ color: "#0f9f72", flexShrink: 0 }}>▸</span>
                  {doc}
                </li>
              ))}
            </ul>
          </DrawerSection>
        )}

        {node.legal_basis && node.legal_basis.length > 0 && (
          <DrawerSection title="법적 근거 · 검증">
            <NodeLegalVerification node={node} verification={verification} />
          </DrawerSection>
        )}

        {loopEdges.length > 0 && (
          <DrawerSection title="회귀 루프">
            {loopEdges.map((e) => (
              <div key={e.id} style={{
                padding: "8px 12px", background: "#eff6ff",
                borderRadius: 8, fontSize: 13, color: "#2563eb",
                marginBottom: 6, display: "flex", gap: 6, alignItems: "center",
              }}>
                <span>↩</span>
                <span>{e.label ?? "보완 회귀"} ({e.source} → {e.target})</span>
              </div>
            ))}
          </DrawerSection>
        )}

        {msgEdges.length > 0 && (
          <DrawerSection title="정보 흐름">
            {msgEdges.map((e) => (
              <div key={e.id} style={{
                padding: "8px 12px", background: "#f5f7f6",
                borderRadius: 8, fontSize: 13, color: "#5d6b63",
                marginBottom: 6, display: "flex", gap: 6, alignItems: "center",
              }}>
                <span style={{ color: "#0f9f72" }}>→</span>
                <span>{e.label} ({e.source} → {e.target})</span>
              </div>
            ))}
          </DrawerSection>
        )}
      </div>

    </>
  );
}

function keepFocusInDrawer(event: KeyboardEvent, drawer: HTMLElement | null) {
  if (!drawer) return;
  const focusable = Array.from(
    drawer.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => element.getClientRects().length > 0);
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable.at(-1) ?? first;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !drawer.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !drawer.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#87938d", marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: "#111714", fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: "0.07em",
        textTransform: "uppercase", color: "#87938d",
        marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid #dde5df",
      }}>{title}</div>
      {children}
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────
export function Legend() {
  const items = [
    { status: "current", label: "핵심 단계" },
    { status: "risk", label: "유의·위험" },
    { status: "loop", label: "보완 회귀" },
    { status: "waiting", label: "일반 단계" },
  ] as const;

  const edgeItems = [
    { color: "#55685e", dash: "", label: "순서 흐름" },
    { color: "#0d8a63", dash: "6 4", label: "정보 전달" },
    { color: "#2563eb", dash: "4 3", label: "회귀 루프" },
  ];

  return (
    <div className="process-board-legend">
      <div className="process-legend-group">
        <strong>단계</strong>
        <div className="process-legend-items">
          {items.map(({ status, label }) => {
            const c = ss(status);
            return (
              <span key={status}>
                <i
                  aria-hidden="true"
                  style={{ background: c.bg, borderColor: c.border }}
                />
                {label}
              </span>
            );
          })}
        </div>
      </div>

      <VerificationLegend />

      <div className="process-legend-group">
        <strong>연결</strong>
        <div className="process-legend-items">
          {edgeItems.map(({ color, dash, label }) => (
            <span key={label}>
              <svg width={28} height={10} style={{ flexShrink: 0 }} aria-hidden="true">
                <line
                  x1={2}
                  y1={5}
                  x2={26}
                  y2={5}
                  stroke={color}
                  strokeWidth={1.5}
                  strokeDasharray={dash || undefined}
                />
                <polygon points="26,5 21,2.5 21,7.5" fill={color} />
              </svg>
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Computed edge type ────────────────────────────────────────────────────────
interface ComputedEdge {
  edge: ProcessEdge;
  path: string;
  labelX?: number;
  labelY?: number;
}

// ── Edge path computation ─────────────────────────────────────────────────────
function buildEdgePaths(
  edges: ProcessEdge[],
  nodes: ProcessNode[],
  stages: string[],
  nodeRefs: Map<string, HTMLElement>,
  boardEl: HTMLElement,
  totalH: number,
): ComputedEdge[] {
  const boardRect = boardEl.getBoundingClientRect();
  const rel = (r: DOMRect) => ({
    left:  r.left   - boardRect.left,
    right: r.right  - boardRect.left,
    top:   r.top    - boardRect.top,
    bottom: r.bottom - boardRect.top,
    cx:    (r.left + r.right)  / 2 - boardRect.left,
    cy:    (r.top  + r.bottom) / 2 - boardRect.top,
  });

  const stageIdx = (stage: string) => stages.indexOf(stage);

  return edges.flatMap((edge): ComputedEdge[] => {
    const srcEl = nodeRefs.get(edge.source);
    const tgtEl = nodeRefs.get(edge.target);
    if (!srcEl || !tgtEl) return [];

    const s = rel(srcEl.getBoundingClientRect());
    const t = rel(tgtEl.getBoundingClientRect());

    const srcNode = nodes.find((n) => n.id === edge.source);
    const tgtNode = nodes.find((n) => n.id === edge.target);
    const si = srcNode ? stageIdx(srcNode.stage) : 0;
    const ti = tgtNode ? stageIdx(tgtNode.stage) : 0;

    let path: string;
    let labelX: number | undefined;
    let labelY: number | undefined;

    if (edge.type === "loop") {
      if (si === ti) {
        // Same column: U-curve to the right
        const rx = Math.max(s.right, t.right) + 52;
        path = `M ${s.right} ${s.cy} C ${rx} ${s.cy} ${rx} ${t.cy} ${t.right} ${t.cy}`;
        labelX = rx + 10;
        labelY = (s.cy + t.cy) / 2;
      } else {
        // Backward: arc below the board
        const by = totalH + LOOP_BELOW;
        const dx = Math.abs(s.cx - t.left);
        const cpX = Math.max(40, dx * 0.3);
        path = `M ${s.cx} ${s.bottom} C ${s.cx} ${by} ${t.left - cpX} ${by} ${t.left} ${t.cy}`;
        labelX = (s.cx + t.left) / 2;
        labelY = by + 14;
      }
    } else {
      // Sequence/message: 방향 인식 라우팅 — 역방향·수직 연결을 S자로 꼬지 않는다
      const clampCp = (d: number) => Math.min(80, Math.max(24, Math.abs(d) * 0.45));
      const forwardDx = t.left - s.right;
      const backwardDx = s.left - t.right;
      const overlapX = forwardDx < 8 && backwardDx < 8; // 수평으로 겹침(같은 열)

      if (overlapX) {
        // 같은 열: 세로 베지어 (아래→위 또는 위→아래)
        if (t.cy >= s.cy) {
          const cp = clampCp(t.top - s.bottom) * 0.8;
          path = `M ${s.cx} ${s.bottom} C ${s.cx} ${s.bottom + cp} ${t.cx} ${t.top - cp} ${t.cx} ${t.top}`;
        } else {
          const cp = clampCp(s.top - t.bottom) * 0.8;
          path = `M ${s.cx} ${s.top} C ${s.cx} ${s.top - cp} ${t.cx} ${t.bottom + cp} ${t.cx} ${t.bottom}`;
        }
        labelX = (s.cx + t.cx) / 2 + 8;
        labelY = (s.cy + t.cy) / 2;
      } else if (forwardDx >= 8) {
        // 순방향: 우측 → 좌측
        const cpX = clampCp(forwardDx);
        path = `M ${s.right} ${s.cy} C ${s.right + cpX} ${s.cy} ${t.left - cpX} ${t.cy} ${t.left} ${t.cy}`;
        labelX = (s.right + t.left) / 2;
        labelY = (s.cy + t.cy) / 2 - 10;
      } else {
        // 역방향: 좌측 → 우측 (거울) — orient=auto가 화살촉을 자동 회전
        const cpX = clampCp(backwardDx);
        path = `M ${s.left} ${s.cy} C ${s.left - cpX} ${s.cy} ${t.right + cpX} ${t.cy} ${t.right} ${t.cy}`;
        labelX = (s.left + t.right) / 2;
        labelY = (s.cy + t.cy) / 2 - 10;
      }
    }

    return [{ edge, path, labelX, labelY }];
  });
}

// ── Edge color / style helpers ────────────────────────────────────────────────
// 화살표 시인성: 옅은 회녹색(#bdcbc4)은 격자 위에서 묻힌다 — 진한 색 + 굵은 선
function edgeColor(type: string) {
  if (type === "loop")    return "#2563eb";
  if (type === "message") return "#0d8a63";
  return "#55685e";
}
function edgeDash(type: string) {
  if (type === "message") return "6 4";
  if (type === "loop")    return "5 3";
  return undefined;
}
function edgeWidth(highlighted: boolean, type: string) {
  return highlighted ? 2.8 : type === "loop" ? 2.2 : 2;
}

// ── Main SwimlaneBoard ────────────────────────────────────────────────────────
export default function SwimlaneBoard({
  process,
  verification,
  initialNodeId,
  onNodeChange,
  showDrawer = true,
}: {
  process: ProcessModel;
  verification?: SourceVerification;
  initialNodeId?: string;
  onNodeChange?: (nodeId: string | null) => void;
  showDrawer?: boolean;
}) {
  const { lanes, stages, nodes, edges } = process;

  const [activeNode,    setActiveNode]    = useState<ProcessNode | null>(() =>
    nodes.find((node) => node.id === initialNodeId) ?? null
  );
  const [mobileView, setMobileView] = useState<MobileBoardView>("swimlane");
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [edgePaths,     setEdgePaths]     = useState<ComputedEdge[]>([]);
  const [svgH,          setSvgH]          = useState(0);
  const [svgW,          setSvgW]          = useState(0);
  const boardRef       = useRef<HTMLDivElement>(null);
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const nodeRefs       = useRef<Map<string, HTMLElement>>(new Map());

  const computeEdges = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;
    const totalW = board.scrollWidth;
    const totalH = board.scrollHeight;
    setSvgW(totalW);
    setSvgH(totalH + LOOP_BELOW + 24);
    const computed = buildEdgePaths(edges, nodes, stages, nodeRefs.current, board, totalH);
    setEdgePaths(computed);
  }, [edges, nodes, stages]);

  useLayoutEffect(() => {
    computeEdges();
    const ro = new ResizeObserver(computeEdges);
    if (boardRef.current) ro.observe(boardRef.current);
    return () => ro.disconnect();
  }, [computeEdges]);

  useEffect(() => {
    if (mobileView !== "swimlane") return;
    const frame = window.requestAnimationFrame(computeEdges);
    return () => window.cancelAnimationFrame(frame);
  }, [computeEdges, mobileView]);

  const handleStageClick = useCallback((stage: string) => {
    const stageIndex = stages.indexOf(stage);
    const scroller = boardScrollRef.current;
    if (stageIndex < 0 || !scroller) return;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    scroller.scrollTo({
      left: stageIndex * STAGE_W,
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [stages]);

  const handleBoardKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const scroller = boardScrollRef.current;
      if (!scroller) return;
      const horizontalStep = event.shiftKey ? STAGE_W : 72;
      const verticalStep = event.shiftKey ? 180 : 84;
      const offset =
        event.key === "ArrowRight"
          ? { left: horizontalStep, top: 0 }
          : event.key === "ArrowLeft"
            ? { left: -horizontalStep, top: 0 }
            : event.key === "ArrowDown"
              ? { left: 0, top: verticalStep }
              : event.key === "ArrowUp"
                ? { left: 0, top: -verticalStep }
                : null;
      if (!offset) return;
      event.preventDefault();
      scroller.scrollBy({ ...offset, behavior: "auto" });
    },
    []
  );

  const handleNodeClick = useCallback((n: ProcessNode) => {
    setActiveNode(n);
    onNodeChange?.(n.id);
  }, [onNodeChange]);
  const handleClose = useCallback(() => {
    setActiveNode(null);
    onNodeChange?.(null);
  }, [onNodeChange]);

  // Hover: determine highlighted / dimmed sets
  const connectedEdgeIds   = new Set<string>();
  const connectedNodeIdSet = new Set<string>();
  if (hoveredNodeId) {
    for (const e of edges) {
      if (e.source === hoveredNodeId || e.target === hoveredNodeId) {
        connectedEdgeIds.add(e.id);
        connectedNodeIdSet.add(e.source);
        connectedNodeIdSet.add(e.target);
      }
    }
  }

  const totalGridW = LANE_W + stages.length * STAGE_W;

  // Stage status for header color
  function stageHeaderColor(stage: string): string {
    const st = stageStatus(stage, nodes);
    if (st === "current") return "#0f9f72";
    if (st === "done")    return "#dff5eb";
    if (st === "risk")    return "#fef3c7";
    return "#f5f7f6";
  }
  function stageHeaderBorderColor(stage: string): string {
    const st = stageStatus(stage, nodes);
    if (st === "current") return "#0f9f72";
    if (st === "done")    return "#0f9f72";
    if (st === "risk")    return "#d97706";
    return "#dde5df";
  }

  return (
    <div
      className="swimlane-board"
      data-mobile-view={mobileView}
      style={{ width: "100%" }}
    >
      <ProcessVerificationSummaryBar process={process} verification={verification} />

      <div
        className="mobile-board-view-control"
        role="group"
        aria-label="모바일 구조도 보기 방식"
      >
        <button
          type="button"
          aria-pressed={mobileView === "swimlane"}
          onClick={() => setMobileView("swimlane")}
        >
          스윔레인
        </button>
        <button
          type="button"
          aria-pressed={mobileView === "timeline"}
          onClick={() => setMobileView("timeline")}
        >
          세로 보기
        </button>
      </div>

      <div className="swimlane-desktop-view">
        <MobileSwimlaneStageNav
          stages={stages}
          nodes={nodes}
          onStageClick={handleStageClick}
        />

        {/* Gate timeline */}
        <div className="desktop-gate-timeline" style={{ marginBottom: 16 }}>
          <GateTimeline stages={stages} nodes={nodes} onStageClick={handleStageClick} />
        </div>

        {/* Horizontal scroll container */}
        <div
          ref={boardScrollRef}
          className="process-board-scroll"
          role="region"
          aria-label="업무구조도 스윔레인 탐색 영역"
          tabIndex={0}
          onKeyDown={handleBoardKeyDown}
          style={{ position: "relative" }}
        >
        {/* Board grid — position:relative anchors the SVG overlay */}
        <div
          ref={boardRef}
          style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: `${LANE_W}px repeat(${stages.length}, ${STAGE_W}px)`,
            minWidth: totalGridW,
            paddingBottom: LOOP_BELOW + 24,
            borderRadius: 0,
          }}
        >
          {/* ── SVG overlay ── */}
          {svgW > 0 && (
            <svg
              aria-hidden="true"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                pointerEvents: "none",
                zIndex: 3,
                overflow: "visible",
              }}
              width={svgW}
              height={svgH}
            >
              <defs>
                {/* sequence arrowhead */}
                <marker
                  id="sw-arr-seq"
                  markerWidth={11} markerHeight={9}
                  refX={9} refY={4.5}
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path d="M0,0.5 L0,8.5 L10,4.5 z" fill="#55685e" />
                </marker>
                {/* message arrowhead */}
                <marker
                  id="sw-arr-msg"
                  markerWidth={11} markerHeight={9}
                  refX={9} refY={4.5}
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path d="M0,0.5 L0,8.5 L10,4.5 z" fill="#0d8a63" />
                </marker>
                {/* loop arrowhead */}
                <marker
                  id="sw-arr-loop"
                  markerWidth={11} markerHeight={9}
                  refX={9} refY={4.5}
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path d="M0,0.5 L0,8.5 L10,4.5 z" fill="#2563eb" />
                </marker>
                {/* loop-reverse arrowhead (entering from right) */}
                <marker
                  id="sw-arr-loop-r"
                  markerWidth={11} markerHeight={9}
                  refX={1} refY={4.5}
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path d="M10,0.5 L10,8.5 L0,4.5 z" fill="#2563eb" />
                </marker>
              </defs>

              {edgePaths.map(({ edge, path, labelX, labelY }) => {
                const isLoop     = edge.type === "loop";
                const isMsg      = edge.type === "message";
                const color      = edgeColor(edge.type);
                const dash       = edgeDash(edge.type);
                const isHovered  = hoveredNodeId ? connectedEdgeIds.has(edge.id) : false;
                const isDimmed   = hoveredNodeId !== null && !isHovered;
                // For same-stage loop (U-curve right), use reverse arrowhead
                const srcNode    = nodes.find((n) => n.id === edge.source);
                const tgtNode    = nodes.find((n) => n.id === edge.target);
                const si         = srcNode ? stages.indexOf(srcNode.stage) : 0;
                const ti         = tgtNode ? stages.indexOf(tgtNode.stage) : 0;
                const sameStage  = isLoop && si === ti;
                const marker     = isLoop
                  ? sameStage ? "url(#sw-arr-loop-r)" : "url(#sw-arr-loop)"
                  : isMsg
                  ? "url(#sw-arr-msg)"
                  : "url(#sw-arr-seq)";

                const labelStr = edge.label ?? null;
                const labelW   = labelStr ? Math.max(48, labelStr.length * 7) : 0;

                return (
                  <g
                    key={edge.id}
                    style={{ transition: "opacity 120ms var(--ease-out)" }}
                    opacity={isDimmed ? 0.12 : isHovered ? 1 : 0.9}
                  >
                    <path
                      d={path}
                      fill="none"
                      stroke={color}
                      strokeWidth={edgeWidth(isHovered, edge.type)}
                      strokeDasharray={dash}
                      markerEnd={marker}
                    />
                    {labelStr && labelX !== undefined && labelY !== undefined && (
                      <g>
                        <rect
                          x={labelX - labelW / 2} y={labelY - 8}
                          width={labelW} height={18}
                          rx={3}
                          fill="white"
                          stroke={color}
                          strokeWidth={0.5}
                        />
                        <text
                          x={labelX} y={labelY + 5}
                          textAnchor="middle"
                          fontSize={10}
                          fill={color}
                          fontWeight={600}
                          fontFamily="var(--font-sans)"
                        >
                          {labelStr}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          )}

          {/* ── Corner cell ── */}
          <div
            className="swimlane-corner-cell"
            style={{
              gridColumn: 1, gridRow: 1,
              position: "sticky", top: 0, left: 0, zIndex: 21,
              background: "#f5f7f6",
              borderRight: "2px solid #dde5df",
              borderBottom: "1px solid #dde5df",
            }}
          />

          {/* ── Stage headers (row 1) ── */}
          {stages.map((stage, si) => {
            const [code, ...rest] = stage.split(" ");
            const st = stageStatus(stage, nodes);
            return (
              <div
                key={`sh-${stage}`}
                className="swimlane-stage-header"
                style={{
                  gridColumn: si + 2, gridRow: 1,
                  position: "sticky", top: 0, zIndex: 10,
                  background: stageHeaderColor(stage),
                  borderBottom: `2px solid ${stageHeaderBorderColor(stage)}`,
                  borderRight: "1px solid #dde5df",
                  padding: "8px 10px",
                  display: "flex", alignItems: "center", gap: 7,
                }}
              >
                <span className="mono" style={{
                  fontSize: 11,
                  // current는 배경이 accent 초록이므로 글자는 흰색 (초록-위-초록 방지)
                  color: st === "current" ? "rgba(255,255,255,.85)"
                       : st === "done"    ? "#087452"
                       : st === "risk"    ? "#d97706"
                       : "#87938d",
                  flexShrink: 0,
                }}>
                  {code}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  color: st === "current" ? "#ffffff"
                       : st === "done"    ? "#5d6b63"
                       : "#87938d",
                  lineHeight: 1.25,
                  overflow: "hidden", display: "-webkit-box",
                  WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                }}>
                  {rest.join(" ")}
                </span>
              </div>
            );
          })}

          {/* ── Lane rows ── */}
          {lanes.flatMap((lane, li) => {
            const rowIdx = li + 2;
            const isEven = li % 2 === 0;

            return [
              // Lane header (sticky left)
              <div
                key={`lh-${lane}`}
                className="swimlane-lane-header"
                style={{
                  gridColumn: 1, gridRow: rowIdx,
                  position: "sticky", left: 0, zIndex: 9,
                  background: "#f5f7f6",
                  borderRight: "2px solid #dde5df",
                  borderBottom: "1px solid #e8ece9",
                  padding: "10px 8px",
                  display: "flex", alignItems: "flex-start",
                  justifyContent: "flex-start",
                  minHeight: 64,
                }}
              >
                <span style={{
                  fontSize: 10, fontWeight: 600, color: "#5d6b63",
                  lineHeight: 1.3, wordBreak: "keep-all",
                }}>
                  {lane}
                </span>
              </div>,

              // Stage cells for this lane
              ...stages.map((stage, si) => {
                const cellNodes = nodes.filter(
                  (n) => n.lane === lane && n.stage === stage
                );
                const cellKey = `c-${lane}-${stage}`;
                const isEmpty = cellNodes.length === 0;
                // current 게이트 컬럼 전체를 옅은 accent로 — "지금 어디인가" 시선 유도
                const isCurrentStageCol = stageStatus(stage, nodes) === "current";

                return (
                  <div
                    key={cellKey}
                    className="swimlane-stage-cell"
                    style={{
                      gridColumn: si + 2, gridRow: rowIdx,
                      borderRight: "1px solid #e8ece9",
                      borderBottom: "1px solid #e8ece9",
                      // 레인 밴딩은 노드 있는 셀에도 유지, current 게이트 컬럼은 옅은 accent
                      background: isCurrentStageCol
                        ? "#eef8f3"
                        : isEven ? "#fafbfa" : "#f6f8f7",
                      // 카드는 작게, 칸 사이 여백은 넉넉하게
                      padding: isEmpty ? 0 : "18px 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 18,
                      alignItems: "flex-start",
                      minHeight: 84,
                      position: "relative",
                    }}
                  >
                    {cellNodes.map((node) => {
                      const isHov = hoveredNodeId !== null;
                      const isConn = connectedNodeIdSet.has(node.id);
                      const isThis = hoveredNodeId === node.id;
                      return (
                        <SwimlaneNodeCard
                          key={node.id}
                          node={node}
                          verification={verification}
                          onClick={handleNodeClick}
                          highlighted={isHov && (isThis || isConn)}
                          dimmed={isHov && !isThis && !isConn}
                          onHover={() => setHoveredNodeId(node.id)}
                          onLeave={() => setHoveredNodeId(null)}
                          setRef={(el) => {
                            if (el) nodeRefs.current.set(node.id, el);
                            else nodeRefs.current.delete(node.id);
                          }}
                        />
                      );
                    })}
                  </div>
                );
              }),
            ];
          })}
        </div>
        </div>

        {/* Legend */}
        <Legend />
      </div>

      <div className="swimlane-mobile-view">
        <MobileProcessFlow
          process={process}
          verification={verification}
          onNodeClick={handleNodeClick}
        />
        <Legend />
      </div>

      {/* Drawer */}
      {showDrawer && activeNode && (
        <NodeDrawer
          node={activeNode}
          edges={edges}
          verification={verification}
          onClose={handleClose}
        />
      )}
    </div>
  );
}
