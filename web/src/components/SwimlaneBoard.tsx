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
  done:    { bg: "#f0fdf6", border: "#0f9f72", dot: "#0f9f72", label: "선행",  ink: "#0b3d28", sub: "#1a7a52" },
  current: { bg: "#0f9f72", border: "#0f9f72", dot: "#fff",    label: "핵심", ink: "#ffffff", sub: "rgba(255,255,255,.8)" },
  waiting: { bg: "#f5f7f6", border: "#dde5df", dot: "#bdcbc4", label: "후속",  ink: "#111714", sub: "#87938d" },
  risk:    { bg: "#fffbf0", border: "#d97706", dot: "#d97706", label: "병목",  ink: "#92400e", sub: "#d97706" },
  loop:    { bg: "#eff6ff", border: "#2563eb", dot: "#2563eb", label: "회귀",  ink: "#1e3a8a", sub: "#2563eb" },
  gateway: { bg: "#f5f7f6", border: "#c4cfc8", dot: "#87938d", label: "판단",  ink: "#111714", sub: "#87938d" },
};
function ss(status: string) { return SS[status] ?? SS.waiting; }

// ── Stage status helper ───────────────────────────────────────────────────────
function stageStatus(stage: string, nodes: ProcessNode[]): string {
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
            st === "done" || st === "current" ? "#0f9f72" : st === "risk" ? "#d97706" : "transparent";
          const dotBorder =
            st === "done" || st === "current" ? "#0f9f72" : st === "risk" ? "#d97706" : "#bdcbc4";
          const labelColor =
            st === "current" || st === "done" ? "#0f9f72" : st === "risk" ? "#d97706" : "#87938d";

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
                      transition: "all 200ms ease",
                    }}
                  />
                  {st === "current" && (
                    <div
                      style={{
                        position: "absolute",
                        inset: -4,
                        borderRadius: "50%",
                        border: "2px solid #0f9f72",
                        opacity: 0,
                        animation: "pulse-ring 2s ease-out infinite",
                        pointerEvents: "none",
                      }}
                    />
                  )}
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
                    transition: "background 200ms ease",
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

// ── Compact Node Card ─────────────────────────────────────────────────────────
function SwimlaneNodeCard({
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
      ref={setRef as React.Ref<HTMLButtonElement>}
      data-node-id={node.id}
      onClick={() => onClick(node)}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      aria-label={`${node.name} — ${c.label} — ${verificationResult.label}`}
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        maxWidth: 148,
        height: node.blocker ? 132 : 112,
        textAlign: "left",
        padding: "8px 9px",
        background: c.bg,
        border: `1.5px solid ${c.border}`,
        borderRadius: 8,
        cursor: "pointer",
        transition: "opacity 140ms ease, box-shadow 140ms ease, border-color 140ms ease",
        opacity: dimmed ? 0.28 : 1,
        boxShadow: isCurrent
          ? "0 0 0 3px rgba(15,159,114,.18), 0 2px 8px rgba(11,20,16,.06)"
          : highlighted
          ? "0 4px 16px rgba(11,20,16,.12)"
          : "0 1px 3px rgba(11,20,16,.05)",
        position: "relative",
        flexShrink: 0,
        zIndex: 4,
      }}
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

      {/* pulse ring for current */}
      {isCurrent && (
        <div
          style={{
            position: "absolute",
            inset: -3,
            borderRadius: 8,
            border: "1.5px solid #0f9f72",
            opacity: 0,
            animation: "pulse-ring 2s ease-out infinite",
            pointerEvents: "none",
          }}
        />
      )}
    </button>
  );
}

// ── Node Drawer ───────────────────────────────────────────────────────────────
function NodeDrawer({
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

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(11,20,16,.35)",
          zIndex: 100,
          animation: "fade-in 220ms cubic-bezier(.2,.8,.2,1)",
        }}
        aria-hidden="true"
      />
      <div
        className="process-node-drawer"
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
          animation: "slide-in-right 220ms cubic-bezier(.2,.8,.2,1)",
          boxShadow: "-8px 0 48px rgba(11,20,16,.12)",
        }}
      >
        {/* header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <span className="mono" style={{ color: "#87938d" }}>{node.id}</span>
              <span style={{
                fontSize: 12, fontWeight: 600, padding: "2px 8px",
                borderRadius: 4, background: c.bg, color: c.sub,
                border: `1px solid ${c.border}`,
              }}>{c.label}</span>
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 680, color: "#111714", lineHeight: 1.3, margin: 0 }}>
              {node.name}
            </h2>
          </div>
          <button
            onClick={onClose}
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
          <DrawerSection title="병목">
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

      <style>{`
        @keyframes fade-in { from{opacity:0} to{opacity:1} }
        @keyframes slide-in-right { from{transform:translateX(24px);opacity:0} to{transform:translateX(0);opacity:1} }
      `}</style>
    </>
  );
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
function Legend() {
  const items = [
    { status: "done", label: "선행 단계" },
    { status: "current", label: "핵심 단계" },
    { status: "waiting", label: "후속 단계" },
    { status: "risk", label: "병목·위험" },
    { status: "loop", label: "보완 회귀" },
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
}: {
  process: ProcessModel;
  verification?: SourceVerification;
  initialNodeId?: string;
  onNodeChange?: (nodeId: string | null) => void;
}) {
  const { lanes, stages, nodes, edges } = process;

  const [activeNode,    setActiveNode]    = useState<ProcessNode | null>(() =>
    nodes.find((node) => node.id === initialNodeId) ?? null
  );
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [edgePaths,     setEdgePaths]     = useState<ComputedEdge[]>([]);
  const [svgH,          setSvgH]          = useState(0);
  const [svgW,          setSvgW]          = useState(0);
  const boardRef       = useRef<HTMLDivElement>(null);
  const nodeRefs       = useRef<Map<string, HTMLElement>>(new Map());
  const stageHdrRefs   = useRef<Map<string, HTMLElement>>(new Map());

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

  const handleStageClick = useCallback((stage: string) => {
    const el = stageHdrRefs.current.get(stage);
    if (el) el.scrollIntoView({ inline: "start", behavior: "smooth" });
  }, []);

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
    <div style={{ width: "100%" }}>
      <ProcessVerificationSummaryBar process={process} verification={verification} />

      {/* Gate timeline */}
      <div style={{ marginBottom: 16 }}>
        <GateTimeline stages={stages} nodes={nodes} onStageClick={handleStageClick} />
      </div>

      {/* Horizontal scroll container */}
      <div
        className="process-board-scroll"
        style={{ overflowX: "auto", overflowY: "visible", position: "relative" }}
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
                    style={{ transition: "opacity 120ms ease" }}
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
                ref={(el) => { if (el) stageHdrRefs.current.set(stage, el); else stageHdrRefs.current.delete(stage); }}
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

      {/* Drawer */}
      {activeNode && (
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
