"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type {
  MegaArtifact,
  MegaDetailTemplate,
  MegaDisplayStatus,
  MegaProject,
} from "@/lib/mega-project-types";
import {
  buildMegaProjectGraph,
  formatCompactActors,
  formatDate,
  STATUS_META,
} from "@/lib/mega-project-graph";
import {
  classifyTier,
  isDecisionStep,
  TIER_META,
  TIER_ORDER,
  type MegaTier,
} from "@/lib/mega-tier";
import MegaViewNav from "./MegaViewNav";
import styles from "./MegaProjectBriefing.module.css";

interface MegaProjectBriefingProps {
  project: MegaProject;
  artifacts: MegaArtifact[];
  templates: Record<string, string>;
  detailTemplates: Record<string, MegaDetailTemplate>;
}

interface MilestoneRow {
  id: string;
  stageLabel: string;
  name: string;
  status: MegaDisplayStatus;
  decision: string;
  authority: string;
}

interface StepRow {
  key: string;
  stageLabel: string;
  milestoneId: string;
  milestoneName: string;
  templateId?: string;
  templateName: string;
  stepId: string;
  stepName: string;
  actor: string;
  tier: MegaTier;
  decision: boolean;
  outputs: string;
  legalBasisCount: number;
}

type TierSelection = MegaTier | "all";

export default function MegaProjectBriefing({
  project,
  artifacts,
  templates,
  detailTemplates,
}: MegaProjectBriefingProps) {
  const [tier, setTier] = useState<TierSelection>("minister");
  const [decisionOnly, setDecisionOnly] = useState(true);

  const { milestoneRows, stepRows } = useMemo(() => {
    const graph = buildMegaProjectGraph(
      project,
      artifacts,
      templates,
      detailTemplates,
    );
    const stageLabelById = new Map(
      project.stages.map((stage, index) => [
        stage.id,
        `${String(index + 1).padStart(2, "0")} ${stage.label}`,
      ]),
    );
    const milestones: MilestoneRow[] = project.nodes.map((node) => ({
      id: node.id,
      stageLabel: stageLabelById.get(node.stage) ?? node.stage,
      name: node.name,
      status: graph.displayStatusByNode.get(node.id) ?? "blocked",
      decision: formatCompactActors(node.actorRoles.decision),
      authority: node.authority,
    }));
    const steps: StepRow[] = [];
    project.nodes.forEach((node) => {
      const groups = graph.detailGroupsByNode.get(node.id) ?? [];
      groups.forEach((group) => {
        if (group.mapping === "missing") return;
        group.nodes.forEach((step, stepIndex) => {
          steps.push({
            key: `${node.id}:${group.id}:${step.id}:${stepIndex}`,
            stageLabel: stageLabelById.get(node.stage) ?? node.stage,
            milestoneId: node.id,
            milestoneName: node.name,
            templateId: group.templateId,
            templateName: group.templateName,
            stepId: step.id,
            stepName: step.name,
            actor: step.actor,
            tier: classifyTier(step.actor, step.name),
            decision: isDecisionStep(step.name),
            outputs: step.outputDocuments.join(" · ") || "—",
            legalBasisCount: step.legalBasisCount,
          });
        });
      });
    });
    return { milestoneRows: milestones, stepRows: steps };
  }, [project, artifacts, templates, detailTemplates]);

  const countsByTier = useMemo(() => {
    const counts = new Map<MegaTier, { total: number; decision: number }>();
    TIER_ORDER.forEach((key) => counts.set(key, { total: 0, decision: 0 }));
    stepRows.forEach((row) => {
      const entry = counts.get(row.tier)!;
      entry.total += 1;
      if (row.decision) entry.decision += 1;
    });
    return counts;
  }, [stepRows]);

  const visibleSteps =
    tier === "cabinet"
      ? []
      : stepRows.filter(
          (row) =>
            (tier === "all" || row.tier === tier) &&
            (!decisionOnly || row.decision),
        );
  const totalDecision = stepRows.filter((row) => row.decision).length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>MEGA / LEADERSHIP BRIEFING</p>
        <MegaViewNav projectId={project.id} active="briefing" />
        <h1>{project.name} 기관장 브리핑</h1>
        <p className={styles.summary}>
          전체 절차를 위상 계층으로 접는다 — 총리 시점은 마일스톤{" "}
          {milestoneRows.length}개, 장관·지자체장 시점은 각 레벨이 결정하는
          관문만 남는다. 담당 표기 기반 규칙 분류라 경계 사례는 원문 담당을
          함께 확인한다.
        </p>
        <p className={styles.meta}>
          기준일 {formatDate(project.asOfDate)} · 하위절차 {stepRows.length}행 ·
          결정성 관문 {totalDecision}행
        </p>
        <div className={styles.tierStrip} role="tablist" aria-label="위상 계층 선택">
          <button
            type="button"
            role="tab"
            aria-selected={tier === "cabinet"}
            data-active={tier === "cabinet" || undefined}
            onClick={() => setTier("cabinet")}
          >
            <strong>{TIER_META.cabinet.label}</strong>
            <small>마일스톤 {milestoneRows.length}</small>
          </button>
          {TIER_ORDER.filter((key) => key !== "cabinet").map((key) => {
            const count = countsByTier.get(key)!;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tier === key}
                data-active={tier === key || undefined}
                onClick={() => setTier(key)}
              >
                <strong>{TIER_META[key].label}</strong>
                <small>
                  결정 {count.decision} · 전체 {count.total}
                </small>
              </button>
            );
          })}
          <button
            type="button"
            role="tab"
            aria-selected={tier === "all"}
            data-active={tier === "all" || undefined}
            onClick={() => setTier("all")}
          >
            <strong>전체</strong>
            <small>
              결정 {totalDecision} · 전체 {stepRows.length}
            </small>
          </button>
        </div>
        {tier !== "cabinet" && (
          <label className={styles.decisionToggle}>
            <input
              type="checkbox"
              checked={decisionOnly}
              onChange={(event) => setDecisionOnly(event.target.checked)}
            />
            결정성 관문만 (승인·허가·지정·고시·의결·심의)
          </label>
        )}
      </header>

      {tier === "cabinet" ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>게이트</th>
                <th>ID</th>
                <th>마일스톤</th>
                <th>상태</th>
                <th>결정 주체</th>
                <th>원문 담당</th>
              </tr>
            </thead>
            <tbody>
              {milestoneRows.map((row) => (
                <tr key={row.id} data-status={row.status}>
                  <td className={styles.stageCell}>{row.stageLabel}</td>
                  <td>
                    <Link href={`/mega-projects/${project.id}/#${row.id}`}>
                      {row.id}
                    </Link>
                  </td>
                  <td className={styles.nameCell}>{row.name}</td>
                  <td>
                    <span className={styles.statusBadge} data-status={row.status}>
                      {STATUS_META[row.status].code}
                    </span>
                  </td>
                  <td>{row.decision}</td>
                  <td className={styles.authorityCell}>{row.authority}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <p className={styles.resultLine}>
            {tier === "all" ? "전체" : TIER_META[tier as MegaTier].label} ·{" "}
            {decisionOnly ? "결정성 관문" : "전 절차"} {visibleSteps.length}행
          </p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>게이트</th>
                <th>마일스톤</th>
                <th>제도</th>
                <th>절차</th>
                <th>담당</th>
                {tier === "all" && <th>계층</th>}
                <th>성격</th>
                <th>산출물</th>
                <th>근거</th>
              </tr>
            </thead>
            <tbody>
              {visibleSteps.map((row) => (
                <tr key={row.key}>
                  <td className={styles.stageCell}>{row.stageLabel}</td>
                  <td className={styles.milestoneCell}>
                    <Link href={`/mega-projects/${project.id}/#${row.milestoneId}`}>
                      {row.milestoneId}
                    </Link>{" "}
                    {row.milestoneName}
                  </td>
                  <td className={styles.templateCell}>
                    {row.templateId ? (
                      <Link href={`/model/${row.templateId}/`}>
                        {row.templateName}
                      </Link>
                    ) : (
                      row.templateName
                    )}
                  </td>
                  <td className={styles.nameCell}>{row.stepName}</td>
                  <td className={styles.actorCell}>{row.actor}</td>
                  {tier === "all" && (
                    <td>
                      <span className={styles.tierBadge} data-tier={row.tier}>
                        {TIER_META[row.tier].label}
                      </span>
                    </td>
                  )}
                  <td>
                    <span
                      className={styles.decisionBadge}
                      data-decision={row.decision || undefined}
                    >
                      {row.decision ? "결정" : "진행"}
                    </span>
                  </td>
                  <td className={styles.outputCell}>{row.outputs}</td>
                  <td className={styles.countCell}>{row.legalBasisCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
