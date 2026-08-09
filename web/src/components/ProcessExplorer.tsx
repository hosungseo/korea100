"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type {
  AgentReadiness,
  ProcessLaneGroup,
  ProcessModel,
  ProcessNode,
  SourceVerification,
} from "@/lib/types";
import { trackEvent } from "@/lib/client-events";
import { getNodeVerification } from "@/lib/process-verification";
import DesktopProcessBoard from "./DesktopProcessBoard";
import PortraitProcessBoard from "./PortraitProcessBoard";
import { VerificationMark } from "./ProcessVerification";

type ProcessMode = "summary" | "full";

export default function ProcessExplorer({
  process,
  verification,
  slug,
  laneGroups,
}: {
  process: ProcessModel;
  verification?: SourceVerification;
  slug: string;
  laneGroups?: ProcessLaneGroup[];
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
    <div className="process-explorer process-explorer-v2">
      <div className="process-mode-bar">
        <p>
          {mode === "summary"
            ? "단계별 핵심 업무를 빠르게 훑어봅니다."
            : "행위자 레인과 게이트를 전체 표시합니다."}
        </p>
        <div className="process-view-controls">
          <div
            className="process-mode-control"
            role="group"
            aria-label="업무구조도 표시 범위"
          >
            <button
              type="button"
              aria-pressed={mode === "summary"}
              onClick={() => selectMode("summary")}
            >
              핵심 흐름
            </button>
            <button
              type="button"
              aria-pressed={mode === "full"}
              onClick={() => selectMode("full")}
            >
              전체 구조도
            </button>
          </div>
        </div>
      </div>

      <div className="process-desktop-board">
        <DesktopProcessBoard
          process={process}
          compact={mode === "summary"}
          selectedNodeId={selectedNode.id}
          onNodeChange={handleNodeChange}
        />
      </div>

      <div className="process-mobile-board">
        <PortraitProcessBoard
          key={slug}
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
        <ProcessNodeInspector
          node={selectedNode}
          verification={verification}
          readiness={process.agent_readiness}
        />
      )}
    </div>
  );
}

function ProcessNodeInspector({
  node,
  verification,
  readiness,
}: {
  node: ProcessNode;
  verification?: SourceVerification;
  readiness?: AgentReadiness;
}) {
  const status = statusMeta(node.status);
  const verificationResult = getNodeVerification(node, verification);
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
        <div className="process-node-inspector-laws-heading">
          <span>법적 근거</span>
          <VerificationMark result={verificationResult} />
        </div>
        <div className="process-node-inspector-laws-list">
          {(node.legal_basis ?? []).map((basis) => (
            <article key={`${basis.law}:${basis.article}`}>
              <strong>{basis.law} {basis.article}</strong>
              {basis.text && <p>{basis.text}</p>}
            </article>
          ))}
          {!node.legal_basis?.length && <p>명시 조문 확인 필요</p>}
        </div>
      </div>

      {node.agent && readiness && (
        <div className="process-node-inspector-agent">
          <div className="process-node-inspector-agent-heading">
            <div>
              <span>행정절차 에이전트 샘플</span>
              <strong>{readiness.level} · 다음 행동 데이터</strong>
            </div>
            <span data-status={readiness.last_live_check?.status ?? "failed"}>
              <i aria-hidden="true" />
              제도 전체 조문 {readiness.last_live_check?.verified_references ?? 0}/
              {readiness.last_live_check?.article_references ?? 0}
            </span>
          </div>

          <div className="process-node-inspector-agent-grid">
            <div>
              <span>시작 조건</span>
              <p>{node.agent.trigger_condition}</p>
            </div>
            <div>
              <span>완료 기준</span>
              <p>{node.agent.completion_condition}</p>
            </div>
            <div>
              <span>다음 인계</span>
              <p>{node.agent.handoff_recipients.join(" · ") || "동일 담당자 내부 완료"}</p>
            </div>
          </div>

          <div className="process-node-inspector-agent-meta">
            <span>
              기한 · {deadlineRuleLabel(node.agent.deadline_rule.type)}
              {node.agent.deadline_rule.expression ? ` · ${node.agent.deadline_rule.expression}` : ""}
            </span>
            <strong>사람 확인 필수</strong>
          </div>
        </div>
      )}
    </section>
  );
}

function deadlineRuleLabel(type: NonNullable<ProcessNode["agent"]>["deadline_rule"]["type"]) {
  const labels = {
    statutory: "법정기한",
    "internal-target": "내부 목표",
    "document-defined": "개별 문서 기준",
    "not-specified": "명시 없음",
    "needs-verification": "추가 확인",
  };
  return labels[type];
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
