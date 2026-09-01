/**
 * News/policy candidate → Korea100-style DRAFT process model.
 * Not law-verified. status=news-draft. Do not promote to production catalog without institution-creation recipe.
 */

const MINISTRY_HINTS = [
  ["기후에너지환경부", /기후|에너지|환경|재생에너지|탄소|배출/],
  ["국토교통부", /주택|부동산|재건축|재개발|PF|건설|청사|기숙사|교통|도로/],
  ["기획재정부", /예산|재정|예타|조세|취득세|직불/],
  ["행정안전부", /지방|자치|민원|정보공개|중수청|재난|소방/],
  ["산업통상자원부", /산업|무역|전기요금|원전|반도체|공장/],
  ["금융위원회", /금융|보금자리|ETF|대출|금리|모기지/],
  ["보건복지부", /의료|치료제|질환|복지|돌봄/],
  ["농림축산식품부", /농|직불금|축산|수산/],
  ["방위사업청", /방사청|국방|나토|방산/],
  ["방송통신위원회", /불법촬영|통신|방통/],
  ["해양수산부", /해상|해양|수난|구조/],
  ["법제처", /법령|입법|행정규칙|예고/],
];

function slugify(name) {
  return String(name)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "draft-institution";
}

function guessMinistry(text) {
  for (const [name, re] of MINISTRY_HINTS) {
    if (re.test(text)) return name;
  }
  return "관계 중앙행정기관";
}

function cleanTitle(title) {
  return String(title ?? "")
    .replace(/\[.*?\]/g, "")
    .replace(/["“”]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}


/** Reject legislative packages / one-off announcements that are not procedure systems. */
export function evaluateProcessCandidacy(candidate) {
  const title = String(candidate?.title ?? "");
  const body = String(candidate?.body ?? "");
  const text = `${title} ${body}`;

  const rejectRules = [
    [/국회\s*통과/, "legislative-passage"],
    [/법안\s*\d+\s*개/, "multi-bill-package"],
    [/후속법안/, "follow-up-bills"],
    [/법안\s*통과/, "bill-passage"],
    [/본회의\s*통과/, "plenary-passage"],
    [/여행경비|반값\s*여행|관광\s*이벤트/, "promo-event"],
    [/펀드[^\n]{0,12}투자|대출지원도$/, "one-off-finance-announce"],
    [/상품권/, "voucher-announce"],
    [/\d+조\s*투입|예산\s*투입|재정\s*투입/, "budget-announce"],
    [/사실은\s*이렇습니다|사실은이렇습니다/, "fact-check-explain"],
    [/^\[사실은/, "fact-check-explain"],
  ];
  for (const [re, reason] of rejectRules) {
    if (re.test(text) || re.test(title)) {
      return { ok: false, reason, score: -1 };
    }
  }

  // Title-first. Policy briefing bodies often contain generic 신청/운영 boilerplate.
  const procedureSignals = [
    /신청/, /청구/, /접수/, /심사/, /심의/, /인가/, /허가/, /승인/, /신고/,
    /지정/, /인증/, /평가/, /지침/, /절차/, /패스트트랙/, /신속심사/,
    /제공\s*·?\s*관리/, /삭제|차단/, /보상/, /면책/, /적발/, /자격\s*박탈/,
    /센터/, /통관플랫폼|시범운영/,
  ];
  const titleHits = procedureSignals.filter((re) => re.test(title)).length;
  if (titleHits === 0) {
    return { ok: false, reason: "no-title-procedure-signal", score: 0 };
  }

  if (/감면|기준\s*상향|인하|인상|차등\s*반영|요금/.test(title)
      && !/(신청|심사|인가|허가|지정|지침|패스트트랙|신속심사|센터|적발|자격)/.test(title)) {
    return { ok: false, reason: "rate-or-threshold-only", score: titleHits };
  }
  if (/(AI\s*상담|본격\s*추진)/.test(title)
      && !/(신청|심사|인가|허가|적발|자격|제재)/.test(title)) {
    return { ok: false, reason: "service-launch-or-slogan", score: titleHits };
  }

  let score = titleHits * 4 + (candidate.score ?? 0);
  if (/신설|제정|도입|마련/.test(title)) score += 3;
  if (/패스트트랙|신속심사|인가|허가|신청|지침/.test(title)) score += 3;
  return { ok: true, reason: "procedure-like", score };
}


export function selectProcessWorthyCandidates(candidates, { limit = 8 } = {}) {
  const ranked = [];
  for (const candidate of candidates ?? []) {
    const ev = evaluateProcessCandidacy(candidate);
    if (!ev.ok) continue;
    ranked.push({ candidate, ...ev });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit).map((row) => row.candidate);
}

/**
 * Build a generic but readable 5-stage admin procedure skeleton from news text.
 * Nodes are hypotheses for human/law verification — confidence low.
 */
export function candidateToProcessDraft(candidate, { index = 0, runDate = null } = {}) {
  const title = cleanTitle(candidate.title);
  const body = String(candidate.body ?? "").replace(/\s+/g, " ").trim();
  const text = `${title} ${body}`;
  const ministry = guessMinistry(text);
  const slugBase = slugify(title);
  const slug = `news-draft-${runDate ?? "undated"}-${String(index + 1).padStart(2, "0")}-${slugBase}`.slice(0, 100);

  const hasAppeal = /이의|불복|심판|소송|재심|감면|면책/.test(text);
  const hasApply = /신청|청구|접수|제출|신고/.test(text);
  const hasReview = /심사|검토|심의|평가|인가|허가|승인/.test(text);
  const hasImplement = /시행|가동|반영|지원|공급|운영|조치/.test(text);

  const lanes = ["신청·대상", ministry, "심의·결정", "이행·공개"].filter((v, i, a) => a.indexOf(v) === i);
  const stages = ["G0 발단", "G1 신청·접수", "G2 심사·결정", "G3 이행", ...(hasAppeal ? ["G4 불복"] : [])];

  const nodes = [];
  const push = (partial) => {
    const id = `P${String(nodes.length + 1).padStart(2, "0")}`;
    nodes.push({
      id,
      type: partial.type ?? "task",
      status: "draft",
      progress: 0,
      confidence: 0.35,
      deadline: null,
      legal_basis: [],
      output_documents: partial.output_documents ?? [],
      ...partial,
      name: partial.name,
      lane: partial.lane,
      stage: partial.stage,
      actor: partial.actor,
      action: partial.action,
    });
  };

  push({
    name: "정책·제도 이슈 발생",
    lane: lanes[0],
    stage: stages[0],
    type: "notice",
    actor: "언론·정책브리핑",
    action: "관련 기사·브리핑이 제도 이슈를 제기한다.",
    output_documents: ["뉴스·정책브리핑"],
  });

  if (hasApply) {
    push({
      name: "신청·청구 접수",
      lane: lanes[0],
      stage: stages[1],
      actor: "신청인·대상 기관",
      action: "법령상 신청·청구 서류를 제출·접수한다(초안 추정).",
      output_documents: ["신청서"],
    });
  } else {
    push({
      name: "제도 설계·입안 착수",
      lane: ministry,
      stage: stages[1],
      actor: ministry,
      action: "소관 기관이 제도·기준 마련에 착수한다(초안 추정).",
      output_documents: ["입안 자료"],
    });
  }

  if (hasReview) {
    push({
      name: "심사·심의·인가 판단",
      lane: "심의·결정",
      stage: stages[2],
      type: "gateway",
      actor: ministry,
      action: "요건 심사·심의 후 허가·인가·승인 여부를 판단한다(초안 추정).",
      output_documents: ["심의결과", "결정통지"],
    });
  } else {
    push({
      name: "기준·방침 확정",
      lane: "심의·결정",
      stage: stages[2],
      type: "gateway",
      actor: ministry,
      action: "운영 기준·방침을 확정한다(초안 추정).",
      output_documents: ["기준안"],
    });
  }

  if (hasImplement || true) {
    push({
      name: "시행·이행·공개",
      lane: "이행·공개",
      stage: stages[3],
      actor: ministry,
      action: "확정된 제도·조치를 시행하고 결과를 공개한다(초안 추정).",
      output_documents: ["시행 공고", "이행 결과"],
    });
  }

  if (hasAppeal) {
    push({
      name: "이의·불복 절차",
      lane: lanes[0],
      stage: stages[4],
      type: "gateway",
      actor: "신청인·이해관계인",
      action: "결정에 불복하면 이의·심판·소송 등 구제 절차를 이용한다(초안 추정).",
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

  return {
    slug,
    name: title.length > 4 ? title : `뉴스 제도 초안 ${index + 1}`,
    oneLiner: body.slice(0, 120) || title,
    type: "뉴스발굴-초안",
    priority: 9000 + index,
    category: "news-draft",
    whyFirst: "뉴스·정책브리핑 후보에서 자동 생성한 구조도 초안. 법령 검증 전 등재 금지.",
    asOfDate: runDate ?? new Date().toISOString().slice(0, 10),
    status: "news-draft",
    sourceNews: {
      title: candidate.title,
      url: candidate.url,
      sourceName: candidate.sourceName,
      sourceType: candidate.sourceType,
      publishedAt: candidate.publishedAt,
      score: candidate.score,
    },
    canvas: {
      purpose: body.slice(0, 200) || title,
      stakeholders: `${ministry}, 신청·대상, 심의기구(추정)`,
      legalBasis: [{ law: "확인 필요", articles: "법령 대조 전", kind: "미검증" }],
      authorities: [{ name: ministry, role: "소관 추정" }],
      procedure: nodes.map((n) => n.name),
      moneyFlow: "미검증",
      docsFlow: nodes.flatMap((n) => n.output_documents).join(" → ") || "미검증",
      bottlenecks: ["법령 원문 미대조", "실무 담당·기한 미확인", "뉴스 기반 추정 단계"],
      reformPoints: ["institution-creation 레시피로 검증 후 등재"],
    },
    related: (candidate.existingMatches ?? []).map((m) => m.name ?? m).filter(Boolean),
    fieldVerification: ["법령 조문 확인", "담당 부서 확인", "실제 단계·기한 확인"],
    verification: {
      status: "unverified-news-draft",
      verifiedAt: null,
      method: "heuristic-from-news-candidate",
      scope: "구조도 초안만 생성. 조문·기한·권한은 미검증.",
      sources: [],
    },
    process: {
      institution_name: title,
      law_name: "확인 필요",
      lanes,
      stages,
      nodes,
      edges,
      warnings: [
        "news-draft: 자동 생성 초안입니다. Korea100 본 카탈로그에 넣지 마세요.",
        "모든 노드 confidence≤0.35, legal_basis 비어 있음.",
      ],
    },
  };
}

export function candidatesToProcessDrafts(candidates, { limit = 8, runDate = null } = {}) {
  const selected = selectProcessWorthyCandidates(candidates, { limit });
  return selected.map((candidate, index) => candidateToProcessDraft(candidate, { index, runDate }));
}
