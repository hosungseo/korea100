import Link from "next/link";
import type {
  MegaArtifact,
  MegaDetailTemplate,
  MegaDisplayStatus,
  MegaProject,
} from "@/lib/mega-project-types";
import {
  buildMegaProjectGraph,
  CLASSIFICATION_LABELS,
  CONFIDENCE_META,
  formatCompactActors,
  formatDate,
  STATUS_META,
} from "@/lib/mega-project-graph";
import MegaViewNav from "./MegaViewNav";
import styles from "./MegaProjectTable.module.css";

interface MegaProjectTableProps {
  project: MegaProject;
  artifacts: MegaArtifact[];
  templates: Record<string, string>;
  detailTemplates: Record<string, MegaDetailTemplate>;
}

const MAPPING_CODE: Record<string, string> = {
  exact: "MAP",
  mixed: "MIX",
  template: "TPL",
  missing: "GAP",
};

interface TableRow {
  rowKey: string;
  anchorStage?: string;
  isFirstOfMilestone: boolean;
  milestoneRowSpan: number;
  stageLabel: string;
  milestoneId: string;
  milestoneName: string;
  status: MegaDisplayStatus;
  classification: string;
  confidence: string;
  lead: string;
  consult: string;
  decision: string;
  authority: string;
  successors: string;
  blockerLabel: string;
  isFirstOfGroup: boolean;
  groupRowSpan: number;
  mapping: string;
  templateId?: string;
  templateName: string;
  stepId: string;
  stepName: string;
  stepType: string;
  stepActor: string;
  stepStage: string;
  outputs: string;
  legalBasisCount: number;
}

export default function MegaProjectTable({
  project,
  artifacts,
  templates,
  detailTemplates,
}: MegaProjectTableProps) {
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

  const rows: TableRow[] = [];
  const seenStages = new Set<string>();
  project.nodes.forEach((node) => {
    const groups = graph.detailGroupsByNode.get(node.id) ?? [];
    const status = graph.displayStatusByNode.get(node.id) ?? "blocked";
    const successors = graph.downstreamByNode.get(node.id) ?? [];
    const blockers = graph.blockersByNode.get(node.id) ?? [];
    const blockerLabel =
      blockers
        .map(
          (blocker) =>
            graph.artifactMap.get(blocker.dependency.artifact)?.label ??
            blocker.dependency.artifact,
        )
        .join(" · ") || "없음";
    const milestoneRowSpan =
      groups.reduce((total, group) => total + group.nodes.length, 0) || 1;

    let milestoneRowIndex = 0;
    groups.forEach((group) => {
      const groupRowSpan = group.nodes.length || 1;
      group.nodes.forEach((step, stepIndex) => {
        const anchorStage =
          milestoneRowIndex === 0 && stepIndex === 0 && !seenStages.has(node.stage)
            ? node.stage
            : undefined;
        if (anchorStage) seenStages.add(node.stage);
        rows.push({
          rowKey: `${node.id}:${group.id}:${step.id}:${stepIndex}`,
          anchorStage,
          isFirstOfMilestone: milestoneRowIndex === 0,
          milestoneRowSpan,
          stageLabel: stageLabelById.get(node.stage) ?? node.stage,
          milestoneId: node.id,
          milestoneName: node.name,
          status,
          classification: CLASSIFICATION_LABELS[node.classification],
          confidence: CONFIDENCE_META[node.confidence].label,
          lead: formatCompactActors(node.actorRoles.lead),
          consult: formatCompactActors(node.actorRoles.consult) || "없음",
          decision: formatCompactActors(node.actorRoles.decision),
          authority: node.authority,
          successors: successors.length > 0 ? successors.join(" · ") : "END",
          blockerLabel,
          isFirstOfGroup: stepIndex === 0,
          groupRowSpan,
          mapping: MAPPING_CODE[group.mapping],
          templateId: group.templateId,
          templateName: group.templateName,
          stepId: step.id,
          stepName: step.name,
          stepType: step.type,
          stepActor: step.actor,
          stepStage: step.stage,
          outputs: step.outputDocuments.join(" · ") || "—",
          legalBasisCount: step.legalBasisCount,
        });
        milestoneRowIndex += 1;
      });
    });
  });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>MEGA / PERMIT MASTER TABLE</p>
        <MegaViewNav projectId={project.id} active="table" />
        <h1>{project.name} 전체표</h1>
        <p className={styles.summary}>{project.summary}</p>
        <p className={styles.meta}>
          기준일 {formatDate(project.asOfDate)} · {project.stages.length}개
          게이트 · {project.nodes.length}개 마일스톤 · {rows.length}행(하위절차
          기준) · {graph.detailInventory.uniqueTemplates}개 제도 템플릿
        </p>
        <nav className={styles.gateJump} aria-label="게이트 바로가기">
          {project.stages.map((stage, index) => (
            <a key={stage.id} href={`#gate-${stage.id}`}>
              {String(index + 1).padStart(2, "0")} {stage.label}
            </a>
          ))}
        </nav>
      </header>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={`${styles.groupHeadMilestone} ${styles.stick1}`}>단계</th>
              <th className={`${styles.groupHeadMilestone} ${styles.stick2}`}>마일스톤 ID</th>
              <th className={`${styles.groupHeadMilestone} ${styles.stick3}`}>마일스톤명</th>
              <th className={styles.groupHeadMilestone}>상태</th>
              <th className={styles.groupHeadMilestone}>분류</th>
              <th className={styles.groupHeadMilestone}>신뢰도</th>
              <th className={styles.groupHeadMilestone}>주관</th>
              <th className={styles.groupHeadMilestone}>협의</th>
              <th className={styles.groupHeadMilestone}>결정</th>
              <th className={styles.groupHeadMilestone}>원문 담당</th>
              <th className={styles.groupHeadMilestone}>다음 마일스톤</th>
              <th className={styles.groupHeadMilestone}>대기 조건</th>
              <th className={styles.groupHeadInstitution}>매핑</th>
              <th className={styles.groupHeadInstitution}>제도</th>
              <th className={styles.groupHeadStep}>절차 ID</th>
              <th className={styles.groupHeadStep}>절차명</th>
              <th className={styles.groupHeadStep}>유형</th>
              <th className={styles.groupHeadStep}>절차 담당</th>
              <th className={styles.groupHeadStep}>절차 단계</th>
              <th className={styles.groupHeadStep}>산출물</th>
              <th className={styles.groupHeadStep}>법적 근거</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.rowKey}
                data-status={row.status}
                id={row.anchorStage ? `gate-${row.anchorStage}` : undefined}
              >
                {row.isFirstOfMilestone && (
                  <>
                    <td className={`${styles.milestoneCell} ${styles.stick1}`} rowSpan={row.milestoneRowSpan}>
                      {row.stageLabel}
                    </td>
                    <td className={`${styles.milestoneCell} ${styles.stick2}`} rowSpan={row.milestoneRowSpan}>
                      <Link href={`/mega-projects/${project.id}/#${row.milestoneId}`}>
                        {row.milestoneId}
                      </Link>
                    </td>
                    <td className={`${styles.milestoneCell} ${styles.stick3}`} rowSpan={row.milestoneRowSpan}>
                      {row.milestoneName}
                    </td>
                    <td className={styles.milestoneCell} rowSpan={row.milestoneRowSpan}>
                      <span className={styles.statusBadge} data-status={row.status}>
                        {STATUS_META[row.status].code}
                      </span>
                    </td>
                    <td className={styles.milestoneCell} rowSpan={row.milestoneRowSpan}>
                      {row.classification}
                    </td>
                    <td className={styles.milestoneCell} rowSpan={row.milestoneRowSpan}>
                      {row.confidence}
                    </td>
                    <td className={styles.milestoneCell} rowSpan={row.milestoneRowSpan}>
                      {row.lead}
                    </td>
                    <td className={styles.milestoneCell} rowSpan={row.milestoneRowSpan}>
                      {row.consult}
                    </td>
                    <td className={styles.milestoneCell} rowSpan={row.milestoneRowSpan}>
                      {row.decision}
                    </td>
                    <td className={styles.milestoneCell} rowSpan={row.milestoneRowSpan}>
                      {row.authority}
                    </td>
                    <td className={styles.milestoneCell} rowSpan={row.milestoneRowSpan}>
                      {row.successors}
                    </td>
                    <td className={styles.milestoneCell} rowSpan={row.milestoneRowSpan}>
                      {row.blockerLabel}
                    </td>
                  </>
                )}
                {row.isFirstOfGroup && (
                  <>
                    <td className={styles.institutionCell} rowSpan={row.groupRowSpan}>
                      <span className={styles.mappingBadge} data-mapping={row.mapping}>
                        {row.mapping}
                      </span>
                    </td>
                    <td className={styles.institutionCell} rowSpan={row.groupRowSpan}>
                      {row.templateId ? (
                        <Link href={`/model/${row.templateId}/`}>{row.templateName}</Link>
                      ) : (
                        row.templateName
                      )}
                    </td>
                  </>
                )}
                <td className={styles.stepCell}>{row.stepId}</td>
                <td className={styles.stepCell}>{row.stepName}</td>
                <td className={styles.stepCell}>{row.stepType}</td>
                <td className={styles.stepCell}>{row.stepActor}</td>
                <td className={styles.stepCell}>{row.stepStage}</td>
                <td className={styles.stepCell}>{row.outputs}</td>
                <td className={styles.stepCell}>{row.legalBasisCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
