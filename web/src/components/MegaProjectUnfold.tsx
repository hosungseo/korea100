import Link from "next/link";
import type {
  MegaArtifact,
  MegaDetailTemplate,
  MegaProject,
} from "@/lib/mega-project-types";
import {
  buildMegaProjectGraph,
  CLASSIFICATION_LABELS,
  CONFIDENCE_META,
  COUNT_ORDER,
  formatCompactActors,
  formatDate,
  STATUS_META,
} from "@/lib/mega-project-graph";
import styles from "./MegaProjectUnfold.module.css";

interface MegaProjectUnfoldProps {
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

export default function MegaProjectUnfold({
  project,
  artifacts,
  templates,
  detailTemplates,
}: MegaProjectUnfoldProps) {
  const graph = buildMegaProjectGraph(
    project,
    artifacts,
    templates,
    detailTemplates,
  );
  const actorById = new Map(project.actors.map((actor) => [actor.id, actor]));

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>
          MEGA / PERMIT UNFOLD
          <span className={styles.kickerLinks}>
            <Link href={`/mega-projects/${project.id}/`}>← 전경(포스터)으로</Link>
            <Link href={`/mega-projects/${project.id}/table/`}>전체표 보기 →</Link>
          </span>
        </p>
        <h1>{project.name} 행정절차 전체 펼쳐보기</h1>
        <p className={styles.summary}>{project.summary}</p>
        <dl className={styles.statusMatrix} aria-label="절차 상태 집계">
          {COUNT_ORDER.map((status) => (
            <div key={status} data-status={status}>
              <dt>{STATUS_META[status].label}</dt>
              <dd>{graph.counts[status]}</dd>
            </div>
          ))}
        </dl>
        <p className={styles.meta}>
          기준일 {formatDate(project.asOfDate)} · {project.stages.length}개 게이트 ·{" "}
          {project.nodes.length}개 마일스톤 ·{" "}
          {graph.detailInventory.exact + graph.detailInventory.template}개 하위절차 ·{" "}
          {graph.detailInventory.uniqueTemplates}개 제도 템플릿
        </p>
      </header>

      <ol className={styles.stageList}>
        {project.stages.map((stage, stageIndex) => {
          const stageNodes = project.nodes.filter(
            (node) => node.stage === stage.id,
          );
          if (stageNodes.length === 0) return null;
          return (
            <li className={styles.stageSection} key={stage.id}>
              <h2 className={styles.stageTitle}>
                <span>{String(stageIndex + 1).padStart(2, "0")}</span>
                {stage.label}
                <small>{stageNodes.length}개 절차</small>
              </h2>

              <ol className={styles.milestoneList}>
                {stageNodes.map((node) => {
                  const status = graph.displayStatusByNode.get(node.id) ?? "blocked";
                  const detailMapping =
                    graph.detailMappingByNode.get(node.id) ?? "missing";
                  const detailGroups = graph.detailGroupsByNode.get(node.id) ?? [];
                  const actor = actorById.get(node.leadActor);
                  const successors = graph.downstreamByNode.get(node.id) ?? [];
                  const blockers = graph.blockersByNode.get(node.id) ?? [];

                  return (
                    <li
                      className={styles.milestone}
                      key={node.id}
                      data-status={status}
                      id={node.id}
                    >
                      <div className={styles.milestoneHead}>
                        <span className={styles.nodeCode}>{node.id}</span>
                        <span className={styles.statusBadge} data-status={status}>
                          {STATUS_META[status].code}
                        </span>
                        <span className={styles.mappingBadge} data-mapping={detailMapping}>
                          {MAPPING_CODE[detailMapping]}
                        </span>
                        <h3>{node.name}</h3>
                        <span className={styles.classification}>
                          {CLASSIFICATION_LABELS[node.classification]}
                        </span>
                      </div>

                      <p className={styles.roles}>
                        <span>
                          <b>주관</b>
                          {formatCompactActors(node.actorRoles.lead)}
                        </span>
                        <span>
                          <b>협의</b>
                          {formatCompactActors(node.actorRoles.consult) || "없음"}
                        </span>
                        <span>
                          <b>결정</b>
                          {formatCompactActors(node.actorRoles.decision)}
                        </span>
                        <span>
                          <b>담당</b>
                          {actor?.label ?? node.authority}
                        </span>
                        <span data-confidence={node.confidence}>
                          <b>근거</b>
                          {CONFIDENCE_META[node.confidence].label}
                        </span>
                        {successors.length > 0 && (
                          <span>
                            <b>다음</b>
                            {successors.join(" · ")}
                          </span>
                        )}
                        {blockers.length > 0 && (
                          <span className={styles.blocked}>
                            <b>대기</b>
                            {blockers
                              .map(
                                (blocker) =>
                                  graph.artifactMap.get(blocker.dependency.artifact)
                                    ?.label ?? blocker.dependency.artifact,
                              )
                              .join(" · ")}
                          </span>
                        )}
                      </p>

                      <ol className={styles.institutionList}>
                        {detailGroups.map((group) => (
                          <li
                            className={styles.institution}
                            key={group.id}
                            data-mapping={group.mapping}
                          >
                            <div className={styles.institutionHead}>
                              <b>{MAPPING_CODE[group.mapping]}</b>
                              {group.templateId ? (
                                <Link href={`/model/${group.templateId}/`}>
                                  {group.templateName}
                                </Link>
                              ) : (
                                <strong>{group.templateName}</strong>
                              )}
                              <small>{group.nodes.length}개 절차</small>
                            </div>
                            <ol className={styles.stepList}>
                              {group.nodes.map((step) => (
                                <li key={step.id}>
                                  <b>{step.id}</b>
                                  <span>{step.name}</span>
                                  <small>
                                    {step.actor}
                                    {step.outputDocuments.length > 0
                                      ? ` · 산출물 ${step.outputDocuments.join(" · ")}`
                                      : ""}
                                    {step.legalBasisCount > 0
                                      ? ` · 법적 근거 ${step.legalBasisCount}건`
                                      : ""}
                                  </small>
                                </li>
                              ))}
                            </ol>
                          </li>
                        ))}
                      </ol>
                    </li>
                  );
                })}
              </ol>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
