
export function hasClearLegalBasis(candidate) {
  const name = String(candidate?.name ?? "");
  const basis = String(candidate?.basis ?? "").trim();
  if (!basis || basis.startsWith("확인 필요") || /^확인 필요/.test(basis)) return false;
  if (/국방\s*표준화|국방규격·국제표준|나토 표준 제공/.test(name)) return false;
  if (/제정안|국회\s*통과/.test(basis) && /확인 필요/.test(basis)) return false;
  // need a statute-like anchor
  if (!/(법(?:률)?|령)/.test(basis)) return false;
  // secondary norms alone are not enough
  if (/(훈령|지침)/.test(basis) && !/법(?:률)?/.test(basis)) return false;
  return true;
}

/**
 * Institution-candidate (queue item) → Korea100-style DRAFT process model.
 *
 * Source of truth for WHAT to model is the discovered 제도 name/basis/ministry,
 * not the policy-briefing headline. Briefings are only discovery signals.
 */

function slugify(name) {
  return String(name)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "institution-draft";
}

function parseBasis(basis) {
  const raw = String(basis ?? "확인 필요").trim();
  if (!raw || raw === "확인 필요" || raw.startsWith("확인 필요")) {
    return [{ law: "확인 필요", articles: "법령 대조 전", kind: "미검증" }];
  }
  // crude split: "법률명(조문 단서)"
  const m = raw.match(/^(.+?)(?:\((.+)\))?$/);
  return [{
    law: (m?.[1] || raw).trim(),
    articles: (m?.[2] || "관련 조문 확인 필요").trim(),
    kind: "후보단서",
  }];
}

/**
 * Build a draft process skeleton for a named administrative institution.
 */
export function institutionCandidateToProcessDraft(candidate, { index = 0, runDate = null } = {}) {
  const name = String(candidate.name ?? "").trim();
  const basis = String(candidate.basis ?? "확인 필요");
  const ministry = String(candidate.ministry ?? "관계 중앙행정기관");
  const why = String(candidate.why ?? "");
  const articles = Array.isArray(candidate.articles) ? candidate.articles : [];
  const slugSeed = candidate.slug || slugify(name);
  const slug = `inst-draft-${runDate ?? "undated"}-${String(index + 1).padStart(2, "0")}-${slugSeed}`.slice(0, 110);

  const text = `${name} ${basis} ${why}`;
  const hasApply = /신청|청구|접수|신고|등록/.test(text);
  const hasReview = /심사|심의|평가|인가|허가|승인|지정/.test(text);
  const hasSupport = /지원|지급|보상|감액|제공|관리|조치|차단|삭제/.test(text);
  const hasAppeal = /이의|불복|심판|소송|재심|면책|손실보상/.test(text);

  const lanes = ["신청·대상", ministry.split("·")[0] || ministry, "심의·결정", "이행·관리"].filter((v, i, a) => a.indexOf(v) === i);
  const stages = ["G0 제도 개요", "G1 신청·접수", "G2 심사·결정", "G3 이행·관리", ...(hasAppeal ? ["G4 불복·구제"] : [])];

  const nodes = [];
  const push = (partial) => {
    const id = `P${String(nodes.length + 1).padStart(2, "0")}`;
    nodes.push({
      id,
      type: partial.type ?? "task",
      status: "draft",
      progress: 0,
      confidence: 0.4,
      deadline: null,
      legal_basis: [],
      output_documents: partial.output_documents ?? [],
      name: partial.name,
      lane: partial.lane,
      stage: partial.stage,
      actor: partial.actor,
      action: partial.action,
    });
  };

  push({
    name: `${name} 절차 개시`,
    lane: lanes[0],
    stage: stages[0],
    type: "notice",
    actor: "신청인·대상 / 소관기관",
    action: "제도 목적·적용 대상을 확인하고 절차를 시작한다(초안).",
    output_documents: ["제도 안내"],
  });

  if (hasApply) {
    push({
      name: "신청·등록·신고 접수",
      lane: lanes[0],
      stage: stages[1],
      actor: "신청인·대상",
      action: "법령상 신청·등록·신고 서류를 제출하고 소관기관이 접수한다(초안).",
      output_documents: ["신청서", "접수증"],
    });
  } else {
    push({
      name: "요건 확인·자료 준비",
      lane: lanes[0],
      stage: stages[1],
      actor: "신청인·대상",
      action: "적용 요건과 제출 자료를 확인한다(초안).",
      output_documents: ["요건 체크리스트"],
    });
  }

  if (hasReview) {
    push({
      name: "심사·심의·지정/인가 판단",
      lane: "심의·결정",
      stage: stages[2],
      type: "gateway",
      actor: ministry,
      action: "요건 심사·심의 후 지정·인가·허가·승인 여부를 판단한다(초안).",
      output_documents: ["심의결과", "결정통지"],
    });
  } else {
    push({
      name: "기준 적용·결정",
      lane: "심의·결정",
      stage: stages[2],
      type: "gateway",
      actor: ministry,
      action: "운영 기준을 적용해 처리 방향을 결정한다(초안).",
      output_documents: ["결정 통지"],
    });
  }

  push({
    name: hasSupport ? "이행·지원·관리" : "시행·이행·공개",
    lane: "이행·관리",
    stage: stages[3],
    actor: ministry,
    action: hasSupport
      ? "지원·지급·제공·관리·조치 등 이행하고 이력을 관리한다(초안)."
      : "결정 내용을 시행·이행하고 필요 시 공개한다(초안).",
    output_documents: hasSupport ? ["이행 결과", "지원·관리 대장"] : ["시행 공고"],
  });

  if (hasAppeal) {
    push({
      name: "이의·구제·면책 등 후속",
      lane: lanes[0],
      stage: stages[4],
      type: "gateway",
      actor: "신청인·이해관계인",
      action: "결정·조치에 대한 이의·보상·면책 등 구제 절차를 이용한다(초안).",
      output_documents: ["이의신청서"],
    });
  }

  const edges = nodes.slice(0, -1).map((node, i) => ({
    id: `E${String(i + 1).padStart(2, "0")}`,
    source: node.id,
    target: nodes[i + 1].id,
    type: "sequence",
    label: null,
  }));

  const legalBasis = parseBasis(basis);
  const sourceNews = articles[0]
    ? {
        title: articles[0].title,
        url: articles[0].url,
        sourceName: articles[0].sourceName,
        publishedAt: articles[0].publishedAt,
      }
    : null;

  return {
    slug,
    name,
    oneLiner: why || `${name} 행정절차 초안`,
    type: "제도후보-초안",
    priority: 8000 + index,
    category: "institution-candidate-draft",
    whyFirst: "정책브리핑·뉴스에서 발굴한 제도 후보의 구조도 초안. 법령 검증 전 등재 금지.",
    asOfDate: runDate ?? new Date().toISOString().slice(0, 10),
    status: "institution-draft",
    sourceInstitutionCandidate: {
      name,
      basis,
      ministry,
      why,
      status: candidate.status ?? "proposed",
      source: candidate.source ?? null,
      firstSeen: candidate.firstSeen ?? null,
      articles,
    },
    sourceNews,
    canvas: {
      purpose: why || name,
      stakeholders: `${ministry}, 신청·대상, 심의기구(추정)`,
      legalBasis,
      authorities: [{ name: ministry, role: "소관 추정" }],
      procedure: nodes.map((n) => n.name),
      moneyFlow: "미검증",
      docsFlow: nodes.flatMap((n) => n.output_documents).filter(Boolean).join(" → ") || "미검증",
      bottlenecks: ["법령 원문 미대조", "실무 담당·기한 미확인", "후보 제도 기반 추정 단계"],
      reformPoints: ["institution-creation 레시피로 검증 후 등재"],
    },
    related: [],
    fieldVerification: ["법령 조문 확인", "담당 부서 확인", "실제 단계·기한 확인"],
    verification: {
      status: "unverified-institution-draft",
      verifiedAt: null,
      method: "from-institution-candidate-queue",
      scope: "제도 후보 이름/근거 단서 기반 구조도 초안. 조문·기한·권한 미검증.",
      sources: [],
    },
    process: {
      institution_name: name,
      law_name: legalBasis[0]?.law ?? "확인 필요",
      lanes,
      stages,
      nodes,
      edges,
      warnings: [
        "institution-draft: 정책브리핑은 발굴 신호일 뿐, 모델링 대상은 제도 후보이다.",
        "본 카탈로그(web/data/institutions)에 넣지 말 것.",
      ],
    },
  };
}

export function selectInstitutionCandidatesForDraft(queue, { limit = 12, statuses = ["proposed"], clearBasis = true } = {}) {
  const wanted = new Set(statuses);
  const requireClearBasis = clearBasis !== false;
  const list = (queue?.candidates ?? []).filter((c) => wanted.has(c.status) && c.name && (!requireClearBasis || hasClearLegalBasis(c)));
  // Prefer those with basis + why, and news-backed articles.
  return list
    .map((c, i) => ({
      c,
      score:
        (c.basis && c.basis !== "확인 필요" ? 3 : 0) +
        (c.why ? 2 : 0) +
        (Array.isArray(c.articles) && c.articles.length ? 2 : 0) +
        (c.source === "news" ? 1 : 0) -
        i * 0.01,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.c);
}

export function institutionCandidatesToProcessDrafts(queue, options = {}) {
  const selected = selectInstitutionCandidatesForDraft(queue, options);
  const runDate = options.runDate ?? null;
  return selected.map((candidate, index) => institutionCandidateToProcessDraft(candidate, { index, runDate }));
}
