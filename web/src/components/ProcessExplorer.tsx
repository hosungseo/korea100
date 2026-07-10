"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type {
  ProcessLaneGroup,
  ProcessModel,
  ProcessNode,
  SourceVerification,
} from "@/lib/types";
import { trackEvent } from "@/lib/client-events";
import PortraitProcessBoard from "./PortraitProcessBoard";
import ProcessBoard from "./ProcessBoard";

type ProcessMode = "summary" | "full";
type ProcessExportMeta = {
  priority: number;
  name: string;
  category: string;
  type: string;
  oneLiner: string;
  asOfDate: string;
  bottleneckCount: number;
};

export default function ProcessExplorer({
  process,
  verification,
  slug,
  laneGroups,
  exportMeta,
}: {
  process: ProcessModel;
  verification?: SourceVerification;
  slug: string;
  laneGroups?: ProcessLaneGroup[];
  exportMeta: ProcessExportMeta;
}) {
  const searchParams = useSearchParams();
  const defaultNodeId =
    searchParams.get("node") ??
    process.nodes.find((node) => node.status === "current")?.id ??
    process.nodes[0]?.id;
  const [mode, setMode] = useState<ProcessMode>(() =>
    searchParams.get("process") === "summary" ? "summary" : "full",
  );
  const [selectedNodeId, setSelectedNodeId] = useState(defaultNodeId);
  const selectedNode =
    process.nodes.find((node) => node.id === selectedNodeId) ?? process.nodes[0];

  function selectMode(nextMode: ProcessMode) {
    setMode(nextMode);
    updateDetailUrl("process", nextMode === "summary" ? "summary" : "");
    trackEvent("process_mode", { slug, mode: nextMode });
  }

  function handleNodeChange(nodeId: string | null) {
    if (!nodeId) return;
    setSelectedNodeId(nodeId);
    updateDetailUrl("node", nodeId);
    trackEvent("process_node_open", { slug, node_id: nodeId });
  }

  return (
    <div className="process-explorer">
      <div className="process-mode-bar">
        <div className="process-view-controls">
          <div
            className="process-mode-control"
            role="group"
            aria-label="업무구조도 표시 범위"
          >
            <button
              type="button"
              data-process-mode="summary"
              aria-pressed={mode === "summary"}
              onClick={() => selectMode("summary")}
            >
              핵심 흐름
            </button>
            <button
              type="button"
              data-process-mode="full"
              aria-pressed={mode === "full"}
              onClick={() => selectMode("full")}
            >
              전체 구조도
            </button>
          </div>
        </div>
        <p>
          {mode === "summary"
            ? "핵심·병목·회귀 노드를 먼저 표시합니다."
            : "원래 행위자 레인과 게이트를 전체 표시합니다."}
        </p>
      </div>

      <div className="process-desktop-board">
        <LandscapeExportHeader
          process={process}
          verification={verification}
          meta={exportMeta}
        />
        <ProcessBoard
          process={process}
          verification={verification}
          compact={mode === "summary"}
          layout="landscape"
          laneGroups={laneGroups}
          initialNodeId={defaultNodeId}
          onNodeChange={handleNodeChange}
          showDrawer={false}
        />
      </div>

      <div className="process-mobile-board">
        <PortraitProcessBoard
          process={process}
          verification={verification}
          laneGroups={laneGroups}
          initialNodeId={defaultNodeId}
          onNodeChange={handleNodeChange}
          embedded
          showDrawer={false}
        />
      </div>

      {selectedNode && (
        <ProcessNodeInspector node={selectedNode} />
      )}
    </div>
  );
}

function LandscapeExportHeader({
  process,
  verification,
  meta,
}: {
  process: ProcessModel;
  verification?: SourceVerification;
  meta: ProcessExportMeta;
}) {
  const article = verification?.articleVerification;
  const verificationLabel = article
    ? `조문 검증 ${article.verifiedReferences}/${article.articleReferences}`
    : "공식 원문 연결";
  const stats = [
    { label: "절차 노드", value: process.nodes.length },
    { label: "행위 레인", value: process.lanes.length },
    { label: "게이트", value: process.stages.length },
    { label: "병목 구간", value: meta.bottleneckCount },
  ];

  return (
    <header className="process-landscape-export-header">
      <div className="process-landscape-export-brand">
        <strong>대한민국 제도 100</strong>
        <span>업무구조도 · 가로판</span>
        <time dateTime={meta.asOfDate}>기준일 {meta.asOfDate}</time>
      </div>
      <div className="process-landscape-export-title">
        <div>
          <span>NO {meta.priority.toString().padStart(2, "0")}</span>
          <span>{meta.category}</span>
          <span>{meta.type}</span>
          <span data-verified="true">{verificationLabel}</span>
        </div>
        <h2>{meta.name}</h2>
        <p>{meta.oneLiner}</p>
      </div>
      <div className="process-landscape-export-stats" aria-label="가로판 구조 통계">
        {stats.map((stat) => (
          <div key={stat.label}>
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
          </div>
        ))}
      </div>
    </header>
  );
}

function ProcessNodeInspector({ node }: { node: ProcessNode }) {
  const status = statusMeta(node.status);
  const documents = [
    ...(node.input_documents ?? []),
    ...(node.output_documents ?? []),
  ];

  return (
    <section className="process-node-inspector" aria-label="선택한 업무 노드 상세">
      <div className="process-node-inspector-main">
        <div className="process-node-inspector-label">
          <span>노드 상세</span>
          <strong>{node.id}</strong>
          <i style={{ color: status.color, borderColor: status.color }}>
            {status.label}
          </i>
        </div>
        <h3>{node.name}</h3>
        <p>{node.stage} · {node.lane} · {node.actor}</p>
        {documents.length > 0 && (
          <div className="process-node-documents">
            {[...new Set(documents)].map((document) => (
              <span key={document}>{document}</span>
            ))}
          </div>
        )}
      </div>

      <div className="process-node-inspector-metrics">
        <div>
          <span>기한</span>
          <strong>{node.deadline ?? "—"}</strong>
        </div>
        <div>
          <span>확신도</span>
          <strong>
            {node.confidence === undefined
              ? "—"
              : `${Math.round(node.confidence * 100)}%`}
          </strong>
        </div>
        {node.blocker && (
          <p><strong>병목</strong> · {node.blocker}</p>
        )}
      </div>

      <div className="process-node-inspector-laws">
        <span>법적 근거</span>
        <div>
          {(node.legal_basis ?? []).map((basis) => (
            <article key={`${basis.law}:${basis.article}`}>
              <strong>{basis.law} {basis.article}</strong>
              {basis.text && <p>{basis.text}</p>}
            </article>
          ))}
          {!node.legal_basis?.length && <p>명시 조문 확인 필요</p>}
        </div>
      </div>
    </section>
  );
}

function statusMeta(status: ProcessNode["status"]) {
  const meta = {
    done: { label: "완료", color: "#5d6b63" },
    current: { label: "현재", color: "#087452" },
    waiting: { label: "대기", color: "#87938d" },
    risk: { label: "위험", color: "#c78116" },
    loop: { label: "회귀", color: "#c78116" },
  };
  return meta[status];
}

function updateDetailUrl(key: string, value: string) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(key, value);
  else url.searchParams.delete(key);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}
