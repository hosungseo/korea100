import type { CSSProperties } from "react";
import Link from "next/link";
import type { ProcessNode } from "@/lib/types";

interface LawToProcessHeroProps {
  modelCount: number;
  lawName: string;
  checkedAt: string;
  verifiedReferences: number;
  articleReferences: number;
  processNodeCount: number;
  nodes: ProcessNode[];
}

const STATUS_LABELS: Record<ProcessNode["status"], string> = {
  done: "완료",
  current: "핵심",
  waiting: "대기",
  risk: "병목",
  loop: "회귀",
};

function RollingNumber({ value }: { value: number }) {
  const digits = String(value).split("");

  return (
    <span className="law-rolling-number" aria-label={String(value)}>
      <span className="law-rolling-digits" aria-hidden="true">
        {digits.map((digit, index) => (
          <span className="law-rolling-digit" key={`${digit}-${index}`}>
            <span
              className="law-rolling-track"
              style={
                {
                  "--law-digit-shift": `-${Number(digit)}em`,
                  "--law-digit-delay": `${index * 70}ms`,
                } as CSSProperties
              }
            >
              {Array.from({ length: 10 }, (_, number) => (
                <span key={number}>{number}</span>
              ))}
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}

export default function LawToProcessHero({
  modelCount,
  lawName,
  checkedAt,
  verifiedReferences,
  articleReferences,
  processNodeCount,
  nodes,
}: LawToProcessHeroProps) {
  return (
    <section className="law-process-hero" id="featured-process">
      <div className="law-process-hero-inner">
        <header className="law-process-heading">
          <p className="law-process-kicker">
            <span aria-hidden="true" />
            법령에서 업무로
          </p>
          <h1>대한민국 제도 {modelCount}</h1>
          <p className="law-process-lead">
            법령을 읽고 담당자, 절차, 병목으로 재구성합니다.
          </p>
        </header>

        <div
          className="law-process-scene"
          aria-label={`${lawName} 조문 근거를 업무구조도로 변환한 대표 병목 경로`}
        >
          <div className="law-source-panel" aria-hidden="true">
            <div className="law-source-heading">
              <span>검증된 조문 근거</span>
              <strong>{lawName}</strong>
            </div>

            <div className="law-source-rows">
              {nodes.map((node) => {
                const basis = node.legal_basis?.[0];
                return (
                  <div className="law-source-row" key={node.id}>
                    <span>{basis?.article ?? node.stage.split(" ")[0]}</span>
                    <p>{basis?.text ?? node.name}</p>
                  </div>
                );
              })}
            </div>

            <div className="law-source-foot">
              <span className="law-source-check">확인</span>
              국가법령정보센터 원문 대조
            </div>
          </div>

          <div className="law-extraction-layer" aria-hidden="true">
            <span>평가대행자</span>
            <span>평가서 초안</span>
            <span>보완 회귀</span>
          </div>

          <div className="law-map-layer">
            <div className="law-map-heading">
              <span>환경영향평가 대표 병목 경로</span>
              <time dateTime={checkedAt}>기준일 {checkedAt.replaceAll("-", ".")}</time>
            </div>

            <div className="law-flow-nodes">
              {nodes.map((node) => (
                <article
                  className={`law-flow-node is-${node.status}`}
                  key={node.id}
                >
                  <div className="law-flow-node-topline">
                    <div>
                      <span className="law-flow-node-id">{node.id}</span>
                      <span className="law-flow-node-stage">
                        {node.stage.split(" ")[0]}
                      </span>
                    </div>
                    <span className="law-flow-node-status">
                      {STATUS_LABELS[node.status]}
                    </span>
                  </div>
                  <p>{node.lane}</p>
                  <h2>{node.name}</h2>
                  <div className="law-flow-node-detail">
                    <span aria-hidden="true">
                      {node.status === "loop" ? "↩" : "!"}
                    </span>
                    {node.blocker ?? "조문 근거 확인 완료"}
                  </div>
                </article>
              ))}
            </div>

            <div className="law-verification-strip">
              <div>
                <strong>
                  <RollingNumber value={verifiedReferences} />
                  <span>/{articleReferences}</span>
                </strong>
                <span>명시 조문 확인</span>
              </div>
              <span className="law-verification-divider" aria-hidden="true" />
              <div>
                <strong>
                  <RollingNumber value={processNodeCount} />
                </strong>
                <span>근거 노드</span>
              </div>
              <p>
                <span aria-hidden="true">✓</span>
                공식 원문 검증
              </p>
            </div>
          </div>
        </div>

        <nav className="law-process-actions" aria-label="업무구조도 바로가기">
          <Link
            href="/model/environmental-impact-assessment/"
            className="law-process-primary pressable-link"
          >
            환경영향평가 전체 보기 <span aria-hidden="true">→</span>
          </Link>
          <Link href="#institutions" className="pressable-link">
            {modelCount}개 구조도 보기
          </Link>
        </nav>
      </div>
    </section>
  );
}
