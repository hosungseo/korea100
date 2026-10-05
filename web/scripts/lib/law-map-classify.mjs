// 조문 분류 v0 — 규율 단계(stage) × 주체 레인(actor)을 규칙으로 추론하는 순수 함수.
// 네트워크·파일 입출력 없음. 모든 판정은 추론이며 근거(evidence)·신뢰도(confidence)·방법(method)을 함께 돌려준다.
// 근거 없는 판정은 하지 않는다: 단서가 하나도 안 걸리면 "unknown".
//
// 단서표는 데이터로 파일 맨 위에 둔다. 튜닝은 여기서만. 단서는 문자열(포함 검사) 또는 RegExp.

export const STAGES = ["purpose", "standard", "procedure", "organization", "supervision", "penalty", "misc", "unknown"];
export const ACTORS = ["citizen", "central", "local", "committee", "court", "none", "unknown"];

/**
 * 제목 단서. 배열 순서 = 동률일 때의 우선순위(앞이 강함).
 * 한 제목에 여러 단계가 걸리면 가장 뒤에 걸린 단서(한국어 제목의 머리말)를 1순위 후보로 삼고 본문 단서로 확인한다.
 * 긴 단서가 짧은 단서를 품으면(권한의 위임 ⊃ 위임, 업무제한 ⊃ 제한) 긴 쪽만 남긴다.
 */
export const STAGE_TITLE_CUES = [
  { stage: "penalty", cues: ["벌칙", "과태료", "양벌규정", "징역", "벌금", "몰수"] },
  { stage: "misc", cues: ["권한의 위임", "위임", "위탁", "수수료", "청문", "공무원 의제", "공무원으로 의제", "보칙", "시행일", "준용", "다른 법령", "다른 법률과의 관계", "관계 법령", "과의 관계", "시효", "비용부담", "비용 부담", "대리인", "대행", "효력", "승계"] },
  { stage: "supervision", cues: ["검사", "감독", "보고", "자료 제출", "자료제출", "시정명령", "시정", "취소", "정지", "점검", "이행강제금", "위반", "업무제한", "지도", "조사", "모니터링", "공사중지", "대집행", "자료요청", "자료 요청"] },
  { stage: "organization", cues: ["위원회", "설치", "구성", "운영", "센터", "사무국", "특별회계", "설립", "기구", "운영회", "전문기관", "민원실"] },
  { stage: "procedure", cues: ["허가", "신고", "등록", "승인", "인가", "인정", "인증", "지정", "신청", "심의", "협의", "통보", "통지", "변경", "갱신", "절차", "사전결정", "공고", "공개", "폐지", "체결", "조정", "재정", "청구", "청취", "촉탁", "회부", "제시", "평가"] },
  { stage: "standard", cues: ["기준", "의무", "금지", "제한", "구조", "높이", "조경", "건폐율", "용적률", "확보", "설비", "재료", "방화", "피난", "지하층", "공지", "오차", "산정", "예치금", "계약"] },
  { stage: "purpose", cues: ["목적", /(^|[\sㆍ])정의($|[\sㆍ])/, "책무", "기본계획", "기본원칙", "기본이념", "적용 범위", "적용범위", "적용 제외", "적용제외"] },
];

/** 약한 제목 단서. 다른 제목 단서가 하나도 없을 때만 쓴다(0.6). 특례·배제는 보칙 성격, 범위·종류·구분·대상은 정의 성격으로 본다. */
export const STAGE_TITLE_WEAK_CUES = [
  { stage: "misc", cues: ["특례", "배제", "조례"] },
  { stage: "purpose", cues: ["범위", "종류", "구분", "대상", "적용례", "용어"] },
  { stage: "organization", cues: ["기관"] },
];

/** 장(章) 제목 단서. 제목·본문 단서가 없을 때만 쓴다(0.5). 제목과 일치하면 보강(+0.1). */
export const STAGE_CHAPTER_CUES = [
  { stage: "purpose", pattern: /총칙/ },
  { stage: "misc", pattern: /보칙/ },
  { stage: "penalty", pattern: /벌칙/ },
];

/**
 * 본문 단서. 제목이 두 단계 이상에 걸릴 때의 결정권자, 제목 단서가 없을 때의 2순위(0.6). 조문 전체에서 센다(단서당 최대 5회).
 * "하여야 한다"류는 모든 조문에 나오므로 가중치를 낮춘다.
 */
export const STAGE_TEXT_CUES = [
  { stage: "penalty", cues: ["징역", "벌금", "과태료", "처한다", "몰수"] },
  { stage: "supervision", cues: ["시정명령", "취소할 수 있다", "취소하여야", "정지를 명", "검사하게", "보고하게", "자료의 제출", "자료를 제출", "점검", "이행강제금", "출입하여", "감독", "시정을 명"] },
  { stage: "misc", cues: ["위임할 수 있다", "위탁할 수 있다", "수수료", "청문을", "공무원으로 본다", "준용한다", "다른 법률에 특별한 규정"] },
  { stage: "organization", cues: ["위원회를 둔다", "위원회를 두어야", "위원으로 구성", "위원장", "사무국을", "센터를 설치", "회계를 설치", "설립할 수 있다", "운영할 수 있다"] },
  { stage: "procedure", cues: ["허가를 받아야", "신고하여야", "신고를 하여야", "신청하여야", "신청할 수 있다", "신청서를", "승인을 받아", "인가를 받아", "통보하여야", "협의하여야", "심의를 거쳐", "지정할 수 있다", "공고하여야", "공고하고", "통지하여야", "변경하려면", "등록하여야", "청구할 수 있다"] },
  { stage: "standard", cues: [{ cue: "하여야 한다", weight: 0.5 }, { cue: "아니 된다", weight: 0.5 }, "할 수 없다", "기준에 맞게", "기준에 따라", "이상이어야", "이하이어야", "접하여야"] },
  { stage: "purpose", cues: ["목적으로 한다", "용어의 뜻", "책무", "노력하여야", "계획을 수립"] },
];

/**
 * 주체 단서. 주어 구간(첫 항 첫 문장의 '은/는' 앞)에서 먼저 찾고, 없으면 본문 전체에서 센다.
 * generic: 일반형(…하려는 자, …자는). 주어 토큰의 머리가 다른 주체(허가권자·업무대행자·위원회)면 일반형은 무시한다.
 */
export const ACTOR_CUES = [
  { actor: "court", patterns: [/법원/, /검찰/, /판사/, /재판/] },
  { actor: "central", patterns: [/[가-힣]+부장관/, /(?<!구)청장/, /중앙행정기관의 장/, /주무부장관/, /국토교통부(?!령)/, /(?<![가-힣])국가(?=[\s,ㆍ나와및의가는은또]|$)/, /(?<![가-힣])정부(?=[\s,는은의가와])/] },
  { actor: "local", patterns: [/시[ㆍ·]도지사/, /시장[ㆍ·]군수[ㆍ·]구청장/, /특별시장|광역시장|특별자치시장/, /도지사/, /군수/, /구청장/, /허가권자/, /인가권자/, /신고수리권자/, /지방자치단체/] },
  { actor: "committee", patterns: [/위원회/, /(?<!농)공단(?!지)/, /(토지주택|도시|시설|관리|철도|도로|수자원|전력|가스|관광|농어촌|환경|보증)공사/, /진흥원/, /연구원/, /협회/, /전문기관/, /공공기관/, /관리원/, /센터/, /운영회/, /사무국/, /인정기관/, /업무대행자/] },
  { actor: "citizen", patterns: [/건축주/, /설계자/, /시공자/, /감리자/, /사업자/, /소유자/, /신청인/, /관리자/, /당사자/, /협정체결자/, /제조업자/, /유통업자/, /관계전문기술자/, /건축관계자/, /점유자/, /임차인/, /입주자/, /사용자/, /국민/, /건축사(?!법)/], generic: [/하려는 자/, /받은 자/, /한 자/, /해당하는 자/, /자(?:에게)?는$/] },
];

/** 제목에 주체가 직접 적힌 경우("건축주 등의 의무", "허가권자 등의 의무"). */
export const ACTOR_TITLE_CUES = [
  { actor: "citizen", patterns: [/건축주/, /설계자/, /시공자/, /감리자/, /사업자/, /소유자/, /신청인/, /관계자/, /국민/] },
  { actor: "central", patterns: [/장관/, /(?<!구)청장/, /국가의 책무/, /국가 등의 책무/] },
  { actor: "local", patterns: [/허가권자/, /지방자치단체/, /시[ㆍ·]도지사/] },
  { actor: "committee", patterns: [/위원회/, /전문기관/, /운영회/] },
  { actor: "court", patterns: [/법원/, /소송/] },
];

export const CONFIDENCE = {
  title: 0.8, // 제목 단서 하나로 결정
  titleAgree: 0.9, // 제목 단서 + 장/제목 주체가 같은 쪽
  text: 0.6, // 본문 단서만
  weakTitle: 0.6, // 약한 제목 단서(특례·배제)만
  nominative: 0.7, // 주어가 "…이/가"로 표시된 경우(토큰 자체가 주체 명사일 때만)
  chapterOnly: 0.5, // 장 제목만
  conflictResolved: 0.5, // 단서 충돌을 머리말/본문으로 풀었음
  conflict: 0.4, // 단서 충돌, 결정이 약함
  fallback: 0.5, // 주어 밖 본문 단서·단계에서 유추
  floor: 0.4, // 이 아래면 unknown
  deleted: 1,
};

const DELETED = /^삭제(\s*<[^>]*>)?$/;
/** '…는'으로 끝나지만 주어가 아닌 토큰: 관형사형(하는·있는·되는·려는…), 조사 결합(에는·서는·로는…), 접속부사(또는). */
const NOT_SUBJECT_NEUN = /(하|있|없|되|받|려|않|르|치|쓰|짓|같|보|두|오|니|드|뜨|끼|내|때|서|로|와|과|여|까지|부터|마는|에)는$/;
/** '…은'으로 끝나지만 주어가 아닌 토큰: 관형사형 과거(받은·얻은·많은·같은·높은·낮은…). */
const NOT_SUBJECT_EUN = /(받|얻|넣|많|같|작|높|낮|좋|않|적|깊|좁|넓|붙|믿|잡|남|담|밟|맡|닫|묶|섞|씻|찾|쌓|앉|걸|끊|입|읽|굳|묻|뽑|좇|쫓|꺾|겪|얹|심|씹|빚)은$/;
const CONNECTIVE = /^(또는|그러나|다만|혹은|및|또한|즉|하지만|이는|그는|이에는)$/;
const DATIVE_SUBJECT = /에게는$/;
/** 위임 조문("…에 관하여 필요한 사항은 대통령령으로 정한다"). */
const DELEGATION_ONLY = /(대통령령|[가-힣]+부령|총리령|조례|규칙)(?:으|이)?로 정한다\.?$/;
/** 주체 탐색 때 지우는 위임 문구("국토교통부령으로 정하는 바에 따라"): 부처명이 주체처럼 잡히는 것을 막는다. */
const DELEGATION_PHRASE = /(대통령령|[가-힣]+부령|총리령|조례|규칙)(?:으|이)?로 정하[가-힣]*/g;

/** 본문을 비교 가능한 모양으로: 중점 통일, <개정 …> 표지 제거, 공백 정리. */
export function normalizeText(text) {
  return String(text ?? "")
    .replace(/[·‧∙•]/g, "ㆍ")
    .replace(/<(개정|신설|전문개정|삭제|본조신설|본항신설|본호신설)[^>]*>/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function normalizeTitle(title) {
  return String(title ?? "").replace(/[·‧∙•]/g, "ㆍ").replace(/\s+/g, " ").trim();
}

/** 첫 항의 첫 문장. "① …다. ② …" → "…다." 각 호 목록(줄바꿈 뒤 "1.")은 뺀다. */
export function firstSentence(text) {
  const t = normalizeText(text);
  const firstPara = t.split(/\n?\s*[②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/)[0] ?? "";
  const noItems = firstPara.split(/\n\s*\d+(?:의\d+)?\.\s/)[0] ?? firstPara;
  const body = noItems.replace(/^\s*①\s*/, "").replace(/\n/g, " ").trim();
  const m = body.match(/^[\s\S]*?다\.(?=\s|$)/);
  return (m ? m[0] : body).trim();
}

/** 첫 문장에서 주어 토큰('…은/는')과 그 앞 구간을 찾는다. 없으면 null. */
export function findSubject(sentence) {
  const s = String(sentence ?? "");
  const re = /(\S+?)(은|는)(?=[\s,]|$)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const token = m[0];
    if (CONNECTIVE.test(token)) continue;
    if (/^[\d「]/.test(token) && !/[)\]」](은|는)$/.test(token)) continue;
    if (DATIVE_SUBJECT.test(token)) {
      // "…자에게는 과태료를 부과한다" — 부과 상대방을 주어로 본다.
    } else if (m[2] === "는" && NOT_SUBJECT_NEUN.test(token)) {
      continue;
    } else if (m[2] === "은" && NOT_SUBJECT_EUN.test(token)) {
      continue;
    }
    const end = m.index + token.length;
    const span = s.slice(Math.max(0, end - 120), end).trim();
    const core = token.replace(/(에게는|은|는)$/, "").replace(/[)\]」]+$/, "");
    return { token, core, span, index: m.index };
  }
  return null;
}

/** '은/는' 주어가 없을 때: 첫 문장에서 '…이/가' 토큰 중 토큰 자체가 주체 명사로 끝나는 것(건축주가, 허가권자가, 국토교통부장관이). */
export function findNominativeSubject(sentence, table = ACTOR_CUES) {
  const s = String(sentence ?? "");
  const re = /(\S+?)(이|가)(?=[\s,]|$)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const core = m[1].replace(/[)\]」]+$/, "");
    for (const row of table) {
      for (const p of row.patterns) {
        const hit = core.match(p);
        if (hit && core.endsWith(hit[0])) return { token: m[0], core, actor: row.actor, cue: hit[0], index: m.index };
      }
    }
  }
  return null;
}

function cueMatch(text, cue) {
  if (cue instanceof RegExp) {
    const m = text.match(cue);
    return m ? { index: m.index ?? 0, length: m[0].length, label: cue.source.replace(/[^가-힣ㆍ ]/g, "").trim() || String(cue) } : null;
  }
  const idx = text.indexOf(cue);
  return idx >= 0 ? { index: idx, length: cue.length, label: cue } : null;
}

function matchTitleStages(title) {
  const hits = [];
  STAGE_TITLE_CUES.forEach(({ stage, cues }, priority) => {
    for (const cue of cues) {
      const m = cueMatch(title, cue);
      if (m) hits.push({ stage, cue: m.label, start: m.index, end: m.index + m.length, priority });
    }
  });
  // 긴 단서가 짧은 단서를 품으면(어느 단계든) 긴 쪽만.
  return hits.filter((h) => !hits.some((o) => o !== h && o.cue !== h.cue && o.start <= h.start && o.end >= h.end));
}

function countTextStages(text) {
  const counts = new Map();
  const evidence = [];
  for (const { stage, cues } of STAGE_TEXT_CUES) {
    for (const entry of cues) {
      const cue = typeof entry === "string" ? entry : entry.cue;
      const weight = typeof entry === "string" ? 1 : entry.weight;
      let n = 0;
      let from = 0;
      while (n < 5) {
        const i = text.indexOf(cue, from);
        if (i < 0) break;
        n += 1;
        from = i + cue.length;
      }
      if (n > 0) {
        counts.set(stage, (counts.get(stage) ?? 0) + n * weight);
        evidence.push(`text:${cue}×${n}`);
      }
    }
  }
  return { counts, evidence };
}

function chapterStage(chapter) {
  const c = String(chapter ?? "");
  for (const { stage, pattern } of STAGE_CHAPTER_CUES) if (pattern.test(c)) return { stage, cue: `chapter:${c}` };
  return null;
}

function best(counts) {
  let top = null;
  let tie = false;
  for (const [key, n] of counts) {
    if (!top || n > top.n) { top = { key, n }; tie = false; }
    else if (n === top.n) tie = true;
  }
  return top ? { ...top, tie } : null;
}

export function classifyStage({ title, chapter, text }) {
  const t = normalizeTitle(title);
  const body = normalizeText(text);
  const chap = chapterStage(chapter);

  if (DELETED.test(t) || DELETED.test(body) || (!t && /^삭제/.test(body))) {
    return { stage: "unknown", confidence: CONFIDENCE.deleted, evidence: ["title:삭제"], method: "rule:title", deleted: true };
  }

  const titleHits = matchTitleStages(t);
  const titleStages = [...new Set(titleHits.map((h) => h.stage))];
  const textCount = countTextStages(body);
  const textEvidence = textCount.evidence.slice(0, 6);

  if (titleStages.length === 1) {
    const stage = titleStages[0];
    const evidence = titleHits.map((h) => `title:${h.cue}`);
    let confidence = CONFIDENCE.title;
    if (chap?.stage === stage) { confidence = CONFIDENCE.titleAgree; evidence.push(chap.cue); }
    return { stage, confidence, evidence, method: "rule:title" };
  }

  if (titleStages.length > 1) {
    // 머리말(가장 뒤에 걸린 단서)을 1순위 후보로. 본문 단서가 동의하거나 침묵하면 0.5, 다른 후보를 밀면 그쪽 0.4.
    const head = [...titleHits].sort((a, b) => b.end - a.end || a.priority - b.priority)[0];
    const evidence = titleHits.map((h) => (h === head ? `title:${h.cue}(머리말)` : `title:${h.cue}`));
    const candidates = new Set(titleStages);
    const scored = new Map([...textCount.counts].filter(([s]) => candidates.has(s)));
    const top = best(scored);
    evidence.push(...textEvidence);
    if (!top || top.key === head.stage || top.tie) {
      return { stage: head.stage, confidence: CONFIDENCE.conflictResolved, evidence, method: "rule:title" };
    }
    return { stage: top.key, confidence: CONFIDENCE.conflict, evidence, method: "rule:title" };
  }

  // 제목 단서 없음 → 약한 제목 단서(특례·배제) → 본문 단서.
  for (const { stage, cues } of STAGE_TITLE_WEAK_CUES) {
    const hit = cues.map((c) => cueMatch(t, c)).find(Boolean);
    if (hit) return { stage, confidence: CONFIDENCE.weakTitle, evidence: [`title:${hit.label}(약한 단서)`, ...textEvidence.slice(0, 3)], method: "rule:title" };
  }
  const top = best(textCount.counts);
  if (top && !top.tie) {
    const evidence = [...textEvidence];
    let confidence = CONFIDENCE.text;
    if (chap?.stage === top.key) { confidence = 0.7; evidence.push(chap.cue); }
    return { stage: top.key, confidence, evidence, method: "rule:text" };
  }
  if (top?.tie) {
    const tied = [...textCount.counts].filter(([, n]) => n === top.n).map(([s]) => s);
    const evidence = [...textEvidence];
    if (chap && tied.includes(chap.stage)) {
      evidence.push(chap.cue);
      return { stage: chap.stage, confidence: CONFIDENCE.conflict, evidence, method: "rule:text" };
    }
    const order = STAGE_TEXT_CUES.map((r) => r.stage);
    const stage = tied.sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
    return { stage, confidence: CONFIDENCE.conflict, evidence, method: "rule:text" };
  }

  if (chap) return { stage: chap.stage, confidence: CONFIDENCE.chapterOnly, evidence: [chap.cue], method: "rule:chapter" };
  return { stage: "unknown", confidence: 0, evidence: [], method: "unknown" };
}

function matchActors(span, table = ACTOR_CUES, { generic = true } = {}) {
  const found = [];
  for (const row of table) {
    const patterns = generic ? [...row.patterns, ...(row.generic ?? [])] : row.patterns;
    for (const p of patterns) {
      const m = span.match(p);
      if (m) found.push({ actor: row.actor, cue: m[0], index: m.index ?? 0, generic: (row.generic ?? []).includes(p) });
    }
  }
  return found;
}

/** 같은 주체의 중복 단서를 합치고, 등장 순서로 정렬한다. */
function distinctActors(found) {
  const byActor = new Map();
  for (const f of found) {
    const cur = byActor.get(f.actor);
    if (!cur || f.index < cur.index) byActor.set(f.actor, f);
  }
  return [...byActor.values()].sort((a, b) => a.index - b.index);
}

function countActors(found) {
  const counts = new Map();
  for (const f of found) counts.set(f.actor, (counts.get(f.actor) ?? 0) + 1);
  return counts;
}

export function classifyActor({ title, text, stage, deleted }) {
  if (deleted) return { actor: "none", confidence: CONFIDENCE.deleted, evidence: ["title:삭제"], method: "rule:title" };

  const t = normalizeTitle(title);
  const body = normalizeText(text).replace(DELEGATION_PHRASE, " ");
  const sentence = firstSentence(body);
  const subject = findSubject(sentence);
  const titleActors = distinctActors(matchActors(t, ACTOR_TITLE_CUES, { generic: false }));
  const evidence = [];

  // 1. 주어 구간의 주체 단서.
  if (subject) {
    evidence.push(`subject:${subject.token}`);
    let hits = matchActors(subject.span);
    const headIsOther = hits.some((h) => !h.generic && h.actor !== "citizen" && subject.core.endsWith(h.cue));
    if (headIsOther) hits = hits.filter((h) => !h.generic);
    const inSubject = distinctActors(hits);
    if (inSubject.length >= 1) {
      const [first, ...rest] = inSubject;
      const others = distinctActors(matchActors(sentence)).filter((o) => !inSubject.some((s) => s.actor === o.actor));
      evidence.push(`cue:${first.cue}`);
      if (rest.length === 0) {
        for (const o of others) evidence.push(`also:${o.actor}(${o.cue})`);
        let confidence = CONFIDENCE.title;
        if (titleActors.length === 1 && titleActors[0].actor === first.actor) { confidence = CONFIDENCE.titleAgree; evidence.push(`title:${titleActors[0].cue}`); }
        return { actor: first.actor, confidence, evidence, method: "rule:text" };
      }
      // 공동 주어("국토교통부장관, 시ㆍ도지사 및 시장ㆍ군수ㆍ구청장은") → 먼저 적힌 쪽, 나머지는 근거에.
      for (const r of rest) evidence.push(`joint:${r.actor}(${r.cue})`);
      return { actor: first.actor, confidence: CONFIDENCE.conflictResolved, evidence, method: "rule:text" };
    }
    evidence.push("subject:주체 단서 없음");
  }
  // 1b. '…이/가' 주어("건축주가 … 신청하여야 한다").
  if (!subject) {
    const nom = findNominativeSubject(sentence);
    if (nom) {
      evidence.push(`subject:${nom.token}`, `cue:${nom.cue}`);
      const others = distinctActors(matchActors(sentence)).filter((o) => o.actor !== nom.actor);
      for (const o of others) evidence.push(`also:${o.actor}(${o.cue})`);
      return { actor: nom.actor, confidence: CONFIDENCE.nominative, evidence, method: "rule:text" };
    }
  }

  // 2. 제목에 적힌 주체.
  if (titleActors.length === 1) {
    evidence.push(`title:${titleActors[0].cue}`);
    return { actor: titleActors[0].actor, confidence: subject ? CONFIDENCE.text : CONFIDENCE.title, evidence, method: "rule:title" };
  }
  // 3. 목적·정의 조문 → 주체 없음.
  if (stage === "purpose") {
    return { actor: "none", confidence: subject ? CONFIDENCE.title : CONFIDENCE.text, evidence: [...evidence, "stage:purpose→none"], method: "rule:text" };
  }
  // 4. 위임 조문("…은 대통령령으로 정한다") → 주체 없음.
  if (DELEGATION_ONLY.test(sentence)) {
    return { actor: "none", confidence: CONFIDENCE.text, evidence: [...evidence, "text:…으로 정한다(위임 조문)"], method: "rule:text" };
  }
  // 5. 벌칙 → 수범자.
  if (stage === "penalty") {
    return { actor: "citizen", confidence: CONFIDENCE.fallback, evidence: [...evidence, "stage:penalty→citizen(수범자 추정)"], method: "rule:text" };
  }
  // 6. 본문 전체의 주체 단서(가장 많이 나온 쪽).
  const bodyHits = matchActors(body);
  if (bodyHits.length > 0) {
    const distinct = distinctActors(bodyHits);
    for (const f of distinct) evidence.push(`body:${f.actor}(${f.cue})`);
    const top = best(countActors(bodyHits));
    if (top && !top.tie) return { actor: top.key, confidence: subject ? CONFIDENCE.fallback : CONFIDENCE.conflict, evidence, method: "rule:text" };
    return { actor: distinct[0].actor, confidence: CONFIDENCE.conflict, evidence, method: "rule:text" };
  }
  // 7. 기준 조문인데 주체가 안 보임 → 수범자(건축주 등) 추정.
  if (stage === "standard") {
    return { actor: "citizen", confidence: CONFIDENCE.conflict, evidence: [...evidence, "stage:standard→citizen(수범자 추정)"], method: "rule:text" };
  }
  // 8. 본문 어디에도 주체 단서가 없음 → 주체 없음.
  if (body.length > 0) {
    return { actor: "none", confidence: CONFIDENCE.fallback, evidence: [...evidence, "text:본문에 주체 단서 없음→none"], method: "rule:text" };
  }
  return { actor: "unknown", confidence: 0, evidence, method: "unknown" };
}

/**
 * 조문 하나를 분류한다.
 * @param {{label?: string, title?: string, chapter?: string|null, text?: string}} article
 * @returns {{stage: string, actor: string, confidence: number, evidence: string[], method: string, stageMethod: string, actorMethod: string, stageConfidence: number, actorConfidence: number, deleted?: boolean}}
 */
export function classifyArticle({ label, title, chapter, text } = {}) {
  const s = classifyStage({ title, chapter, text });
  const a = classifyActor({ title, text, stage: s.stage, deleted: s.deleted });
  const stage = s.confidence < CONFIDENCE.floor ? "unknown" : s.stage;
  const actor = a.confidence < CONFIDENCE.floor ? "unknown" : a.actor;
  const evidence = [...s.evidence.map((e) => `stage/${e}`), ...a.evidence.map((e) => `actor/${e}`)];
  // method는 단계 판정의 방법(단계가 unknown이면 주체 판정의 방법). 축별 방법은 stageMethod/actorMethod에.
  const method = s.method !== "unknown" ? s.method : a.method;
  const out = {
    stage,
    actor,
    confidence: Math.round(Math.min(s.confidence, a.confidence) * 100) / 100,
    stageConfidence: s.confidence,
    actorConfidence: a.confidence,
    evidence,
    method,
    stageMethod: s.method,
    actorMethod: a.method,
  };
  if (s.deleted) out.deleted = true;
  if (label) out.label = label;
  return out;
}
