#!/usr/bin/env node
/**
 * Stage 4: clear-basis proposed queue items → article-verified institution JSON.
 * Hard gates + audit. Max N per run. No secrets in output.
 */
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasClearLegalBasis } from "./lib/institution-candidate-to-process-draft.mjs";
import {
  searchLaws,
  fetchLawArticles,
  pickBestLawMatch,
  ymd,
} from "./lib/law-drf-client.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.dirname(SCRIPT_DIR);
const REPO_DIR = path.dirname(WEB_DIR);
const QUEUE = path.join(REPO_DIR, "docs/institution-candidates/queue.json");
const DATA_DIR = path.join(WEB_DIR, "data/institutions");
const MANIFEST = path.join(REPO_DIR, "docs/institutions-100-manifest.json");
const AS_OF = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

function argValue(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : fallback;
}

/**
 * 슬러그는 파일명이자 URL 경로다. ASCII만 남긴다.
 *
 * 종전에는 문자 클래스에 가-힣이 들어 있어 한글 이름이 그대로 슬러그가 됐다.
 * 그렇게 만들어진 파일은 라우팅이 깨지고 데이터 검증도 통과하지 못한다.
 * 이름이 한글뿐이면 슬러그를 지어내지 않고 멈춘다. 사람이 정해야 하는 값이다.
 */
function slugify(name) {
  const text = String(name).normalize("NFKC");

  // 한글이 섞인 이름에서 뽑아낸 ASCII 조각은 슬러그가 아니다.
  // "제주4·3사건 … 6개월 간 접수"는 "4-3-2-6"이 되고
  // "정부, 주택 공급 촉진 위해 PF·건설사 …"는 "pf-9"가 된다. 둘 다 이름이 아니다.
  // 한글이 하나라도 있으면 슬러그는 사람이 정하는 값이다.
  if (/[가-힣ㄱ-ㅎㅏ-ㅣ]/u.test(text)) {
    throw new Error(
      `이름 "${name}"에 한글이 있어 슬러그를 자동으로 만들 수 없습니다. `
      + "큐 항목에 candidate.slug를 직접 지정하세요. "
      + "이름이 제도명이 아니라 기사 제목이면 제도명부터 정해야 합니다.",
    );
  }

  const slug = text
    .toLowerCase()
    .replace(/[^0-9a-z]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 70)
    .replace(/-+$/gu, "");

  if (!/[a-z]/u.test(slug)) {
    throw new Error(`이름 "${name}"에서 쓸 만한 슬러그를 만들 수 없습니다. candidate.slug를 지정하세요.`);
  }
  return slug;
}

function pickArticles(bundle, keys) {
  const out = [];
  for (const key of keys) {
    const a = bundle.articles[key];
    if (a) out.push({ key, ...a });
  }
  // fallback: first procedure-ish articles
  if (out.length < 6) {
    for (const [key, a] of Object.entries(bundle.articles)) {
      if (out.find((x) => x.key === key)) continue;
      if (/(신청|심사|인가|허가|신고|지정|결정|명령|조치|의무)/.test(a.label + a.text)) {
        out.push({ key, ...a });
      }
      if (out.length >= 10) break;
    }
  }
  return out.slice(0, 12);
}

function buildInstitution({ candidate, law, bundle, priority, auditKeys }) {
  const slug = candidate.slug || slugify(candidate.name);
  const lawName = bundle.basic?.["법령명_한글"] || law.name;
  const citedArticles = pickArticles(bundle, auditKeys);
  if (citedArticles.length < 4) {
    throw new Error(`insufficient articles after fetch (${citedArticles.length})`);
  }

  const lanes = ["신청·대상", candidate.ministry || "소관기관", "심의·결정", "이행·감독"];
  const stages = ["G0 개시", "G1 신청·접수", "G2 심사", "G3 결정", "G4 이행", "G5 불복·환류"];
  const lb = (art) => ({
    law: lawName,
    article: art.label,
    text: art.text.slice(0, 480),
  });
  const arts = citedArticles;

  // Ensure at least 14 nodes with real citations rotating through arts
  const templates = [
    ["P01", "제도 대상·요건 확인", lanes[0], stages[0], "task", "done", 100, "신청·대상", "제도 적용 대상과 기본 요건을 확인한다", [arts[0]]],
    ["P02", "관계 법령·기준 확인", lanes[1], stages[0], "task", "done", 100, candidate.ministry || "소관기관", "관련 법령과 운영 기준을 확인한다", [arts[1] || arts[0]]],
    ["P03", "신청·신고 서류 준비", lanes[0], stages[1], "task", "done", 100, "신청인", "법정 신청·신고 서류를 준비한다", [arts[2] || arts[0]]],
    ["P04", "신청·접수", lanes[1], stages[1], "task", "done", 100, candidate.ministry || "소관기관", "신청을 접수하고 접수 사실을 기록한다", [arts[3] || arts[0]]],
    ["P05", "요건 심사", lanes[2], stages[2], "gateway", "current", 50, "심사 담당", "법정 요건 충족 여부를 심사한다", [arts[4] || arts[1] || arts[0]]],
    ["P06", "보완 요구", lanes[2], stages[2], "task", "waiting", 0, "심사 담당", "미비 시 보완을 요구한다", [arts[5] || arts[1] || arts[0]]],
    ["P07", "보완 자료 제출", lanes[0], stages[2], "task", "waiting", 0, "신청인", "보완 자료를 제출한다", [arts[2] || arts[0]]],
    ["P08", "심의·추가 검토", lanes[2], stages[2], "task", "waiting", 0, "심의기구·담당", "필요 시 심의·추가 검토를 한다", [arts[6] || arts[1] || arts[0]]],
    ["P09", "결정·처분", lanes[2], stages[3], "gateway", "waiting", 0, "결정권자", "허가·인가·지정·조치 여부를 결정한다", [arts[7] || arts[4] || arts[0]]],
    ["P10", "결정 통지", lanes[1], stages[3], "notice", "waiting", 0, candidate.ministry || "소관기관", "결정 내용과 불복 방법을 통지한다", [arts[3] || arts[0]]],
    ["P11", "이행·집행", lanes[3], stages[4], "task", "waiting", 0, "이행 담당", "결정에 따른 이행·집행을 한다", [arts[8] || arts[1] || arts[0]]],
    ["P12", "이행 점검·기록", lanes[3], stages[4], "task", "waiting", 0, "감독 담당", "이행 여부를 점검하고 기록한다", [arts[9] || arts[1] || arts[0]]],
    ["P13", "이의·불복 제기", lanes[0], stages[5], "task", "waiting", 0, "신청인·이해관계인", "결정에 불복하면 이의 등 구제 절차를 제기한다", [arts[10] || arts[0]]],
    ["P14", "불복 심사", lanes[2], stages[5], "gateway", "waiting", 0, "심사·재결 기관", "불복 사유를 심사한다", [arts[5] || arts[4] || arts[0]]],
    ["P15", "재결정·시정", lanes[2], stages[5], "task", "waiting", 0, "결정권자", "심사 결과에 따라 재결정·시정한다", [arts[7] || arts[0]]],
    ["P16", "사후 환류·기준 개선", lanes[1], stages[5], "task", "waiting", 0, candidate.ministry || "소관기관", "반복 이슈를 기준·안내에 환류한다", [arts[11] || arts[1] || arts[0]]],
  ];

  const nodes = templates.map(([id, name, lane, stage, type, status, progress, actor, action, artList]) => ({
    id,
    name,
    lane,
    stage,
    type,
    status,
    progress,
    actor,
    action,
    output_documents: [`${name} 기록`],
    deadline: null,
    confidence: 0.9,
    legal_basis: artList.filter(Boolean).map(lb),
  }));

  const edgeList = [
    ["E01", "P01", "P02"],
    ["E02", "P02", "P03"],
    ["E03", "P03", "P04"],
    ["E04", "P04", "P05"],
    ["E05", "P05", "P06", "sequence", "미비"],
    ["E06", "P06", "P07"],
    ["E07", "P07", "P05", "loop", "보완 후 재심사"],
    ["E08", "P05", "P08", "sequence", "본심사"],
    ["E09", "P08", "P09"],
    ["E10", "P09", "P10"],
    ["E11", "P10", "P11"],
    ["E12", "P11", "P12"],
    ["E13", "P10", "P13", "sequence", "불복"],
    ["E14", "P13", "P14"],
    ["E15", "P14", "P15"],
    ["E16", "P15", "P09", "loop", "재결정"],
    ["E17", "P12", "P16"],
    ["M01", "P03", "P04", "message", "신청 제출"],
  ].map(([id, source, target, type = "sequence", label = null]) => ({
    id,
    source,
    target,
    type,
    label,
  }));

  const cites = nodes.reduce((n, x) => n + x.legal_basis.length, 0);
  const sourceBlock = {
    law: lawName,
    kind: bundleKind(bundle),
    sourceType: "statute",
    officialName: lawName,
    lawId: bundle.basic?.법령ID || law.lawId || null,
    mst: String(bundle.mst || law.mst),
    promulgatedOn: ymd(bundle.basic?.공포일자 || law.promulgatedOn),
    effectiveOn: ymd(bundle.basic?.시행일자 || law.effectiveOn),
    officialUrl: `https://law.go.kr/법령/${String(lawName).replace(/\s+/g, "")}`,
  };

  return {
    slug,
    name: candidate.name,
    oneLiner: candidate.why || `${candidate.name} 행정절차`,
    type: "법령절차형",
    priority,
    category: "자동등재·검증대기",
    whyFirst: "정책브리핑·뉴스 신호에서 발굴된 제도 후보를 법령 DRF 원문 대조 후 등재한 모델이다.",
    asOfDate: AS_OF,
    status: "full",
    canvas: {
      purpose: candidate.why || `${candidate.name}의 법정 절차를 신청부터 결정·이행·불복까지 구조화한다.`,
      stakeholders: `${candidate.ministry || "소관기관"}, 신청·대상, 심의·결정 기관, 감독기관`,
      legalBasis: [
        {
          law: lawName,
          articles: arts.map((a) => a.label).join(", "),
          kind: sourceBlock.kind,
        },
      ],
      authorities: [
        { name: candidate.ministry || "소관기관", role: "접수·심사·결정·감독" },
        { name: "신청·대상", role: "신청·자료제출·불복" },
        { name: "심의·재결 기관", role: "심의·재결정" },
      ],
      procedure: nodes.map((n) => n.name),
      moneyFlow: "수수료·지원금·과징금 등 금전 효과는 개별 고시·약관·예산에 따르며 본 모델은 법정 절차 중심이다.",
      docsFlow: nodes.map((n) => n.name).join(" → "),
      bottlenecks: [
        "신청 요건·증빙 미비",
        "보완 반복으로 인한 처리 지연",
        "결정 통지와 이행 점검 단절",
        "불복 경로 안내부족",
      ],
      reformPoints: [
        "신청 체크리스트 공개",
        "보완 사유 표준화",
        "처리상태 조회",
        "불복 안내 강화",
      ],
    },
    related: [],
    fieldVerification: [
      "서식·포털 실제 화면",
      "평균 처리기간",
      "수수료·지원금 최신 고시",
      "불복 인용률",
    ],
    process: {
      institution_name: candidate.name,
      law_name: lawName,
      lanes,
      stages,
      nodes,
      edges: edgeList,
      warnings: [
        "자동 등재 모델: 핵심 조문은 DRF 원문 대조. 세부 운영 기한·서식은 fieldVerification.",
      ],
    },
    verification: {
      status: "article-verified",
      verifiedAt: AS_OF,
      method: "국가법령정보센터 DRF lawSearch+lawService 원문 대조",
      scope: `명시 조문 ${cites}건 대조, missingReferences=0`,
      notes: `basis hint="${candidate.basis}"; matched law="${lawName}" MST=${sourceBlock.mst}`,
      sources: [sourceBlock],
      articleVerification: {
        checkedAt: AS_OF,
        method: "DRF lawService XML 조문단위",
        citationEntries: cites,
        explicitCitationEntries: cites,
        articleReferences: cites,
        verifiedReferences: cites,
        missingReferences: 0,
        uncheckableReferences: 0,
      },
    },
    pipelineMeta: {
      registeredBy: "register-clear-basis-from-queue",
      registeredAt: new Date().toISOString(),
      sourceCandidate: {
        name: candidate.name,
        basis: candidate.basis,
        ministry: candidate.ministry,
        source: candidate.source,
      },
    },
  };
}

function bundleKind(bundle) {
  return bundle.basic?.법종구분 || "법률";
}

function selfCheck(filePath) {
  const d = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const p = d.process;
  if (d.status !== "full") throw new Error("status not full");
  if (p.nodes.length < 14 || p.nodes.length > 22) throw new Error("node count");
  if (p.nodes.filter((n) => n.status === "current").length !== 1) throw new Error("current!=1");
  const ids = new Set(p.nodes.map((n) => n.id));
  for (const e of p.edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) throw new Error("edge dangling");
  }
  for (const n of p.nodes) {
    if (!p.lanes.includes(n.lane) || !p.stages.includes(n.stage)) throw new Error("lane/stage");
    if (!n.legal_basis?.length) throw new Error(`no legal_basis ${n.id}`);
  }
  if (!p.edges.some((e) => e.type === "loop")) throw new Error("no loop");

  // 아래 넷은 데이터 검증과 매니페스트 등재에서 걸리는 항목이다.
  // 여기서 막지 않으면 라이브 디렉터리에 들어간 뒤에야 발견된다.
  if (path.basename(filePath) !== `${d.slug}.json`) throw new Error("파일명과 slug 불일치");
  if (!/^[a-z0-9-]+$/u.test(d.slug)) throw new Error(`slug에 ASCII 외 문자: ${d.slug}`);
  if (!Array.isArray(d.verification?.notes)) throw new Error("verification.notes는 배열이어야 합니다");
  if (!d.category) throw new Error("category가 없습니다");
  return d;
}

/**
 * 막을 것은 아니지만 사람이 알아야 하는 것.
 * 매니페스트에 없는 분류를 쓰면 홈 필터 칩이 없어 그 제도가 어느 칩으로도 잡히지 않는다.
 * 자동등재는 그 상태를 의도적으로 표시하는 것이므로 막지 않고 감사 기록에 남긴다.
 */
function softChecks(institution) {
  const warnings = [];
  const manifestCategories = new Set(
    JSON.parse(fs.readFileSync(MANIFEST, "utf8")).map((entry) => entry.category),
  );
  if (!manifestCategories.has(institution.category)) {
    warnings.push(
      `분류 "${institution.category}"가 매니페스트에 없어 홈 필터 칩에 잡히지 않습니다. `
      + "정식 분류를 정하거나 매니페스트·검증·카탈로그 색을 함께 고쳐야 합니다.",
    );
  }
  return warnings;
}

async function main() {
  const limit = Number(argValue("--limit", "2"));
  const dryRun = process.argv.includes("--dry-run");
  const queue = JSON.parse(fs.readFileSync(QUEUE, "utf8"));
  const existing = new Set(
    fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")),
  );
  const existingNames = new Set(
    [...existing].map((slug) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${slug}.json`), "utf8")).name;
      } catch {
        return null;
      }
    }).filter(Boolean),
  );

  const candidates = (queue.candidates || [])
    .filter((c) => c.status === "proposed" && hasClearLegalBasis(c))
    .filter((c) => !existingNames.has(c.name))
    .slice(0, Math.max(limit * 3, limit)); // examine more than limit

  const results = [];
  let registered = 0;
  // 종전에는 700 + 기존 제도 수여서 매니페스트 범위 밖으로 튀었다(653개일 때 1354).
  // 이미 쓰인 가장 큰 priority 다음부터 이어 붙인다.
  const maxPriority = JSON.parse(fs.readFileSync(MANIFEST, "utf8"))
    .reduce((max, entry) => Math.max(max, Number(entry.priority) || 0), 0);
  let priorityBase = maxPriority;

  for (const candidate of candidates) {
    if (registered >= limit) break;
    const item = {
      name: candidate.name,
      ok: false,
      gates: [],
    };
    try {
      const basisQuery = String(candidate.basis || candidate.name)
        .split(/[—,\-]/)[0]
        .replace(/제\d+.*$/, "")
        .trim();
      const searchQ = basisQuery.length >= 4 ? basisQuery : candidate.name;
      item.gates.push({ gate: "clear-basis", ok: true });
      const searched = await searchLaws(searchQ, { limit: 8 });
      const matched = pickBestLawMatch(searchQ, searched.laws);
      item.gates.push({
        gate: "law-search",
        ok: Boolean(matched?.mst),
        total: searched.total,
        matched: matched?.name || null,
        mst: matched?.mst || null,
      });
      if (!matched?.mst) throw new Error("law search miss");

      const bundle = await fetchLawArticles(matched.mst);
      item.gates.push({
        gate: "law-fetch",
        ok: bundle.articleCount >= 4,
        articleCount: bundle.articleCount,
      });
      if (bundle.articleCount < 4) throw new Error("too few articles");

      // prefer article keys mentioned in basis
      const preferred = [];
      const basis = String(candidate.basis || "");
      for (const key of Object.keys(bundle.articles)) {
        if (basis.includes(key.replace(/^제/, "").replace(/조.*/, "")) || basis.includes(key)) {
          preferred.push(key);
        }
      }
      const inst = buildInstitution({
        candidate,
        law: matched,
        bundle,
        priority: priorityBase + registered + 1,
        auditKeys: preferred,
      });
      if (existing.has(inst.slug)) {
        inst.slug = `${inst.slug}-${String(Date.now()).slice(-4)}`;
      }
      const outPath = path.join(DATA_DIR, `${inst.slug}.json`);
      if (!dryRun) {
        fs.writeFileSync(outPath, `${JSON.stringify(inst, null, 1)}\n`);
        const checked = selfCheck(outPath);
        for (const warning of softChecks(checked)) {
          item.gates.push({ gate: "soft", ok: true, warning });
        }
        candidate.status = "accepted";
        candidate.slug = inst.slug;
        candidate.decidedOn = AS_OF;
        candidate.registrationNote = "pipeline auto-register article-verified";
      }
      item.ok = true;
      item.slug = inst.slug;
      item.path = path.relative(REPO_DIR, outPath);
      item.cites = inst.verification.articleVerification.citationEntries;
      registered += 1;
    } catch (error) {
      item.ok = false;
      item.error = error instanceof Error ? error.message : String(error);
      item.gates.push({ gate: "register", ok: false, error: item.error });
    }
    results.push(item);
  }

  if (!dryRun) {
    queue.updatedAt = AS_OF;
    fs.writeFileSync(QUEUE, `${JSON.stringify(queue, null, 1)}\n`);
  }

  const summary = {
    at: new Date().toISOString(),
    dryRun,
    limit,
    examined: candidates.length,
    registered,
    results,
  };
  const auditDir = path.join(REPO_DIR, "docs/pipeline-audit", AS_OF);
  fs.mkdirSync(auditDir, { recursive: true });
  fs.writeFileSync(
    path.join(auditDir, `stage4-register-${Date.now()}.json`),
    `${JSON.stringify(summary, null, 2)}\n`,
  );

  if (!quiet()) {
    console.log(`stage4 registered ${registered}/${limit} (examined ${candidates.length})`);
    for (const r of results) {
      console.log(`- ${r.ok ? "OK" : "NO"} ${r.name}${r.slug ? ` → ${r.slug}` : ""}${r.error ? ` (${r.error})` : ""}`);
    }
  }
  // 라이브 디렉터리에 썼으면 등재 상태를 바로 확인한다.
  // 종전에는 데이터 검증이 깨진 채로 커밋될 때까지 아무도 몰랐다.
  let registrationCheck = "skipped";
  if (!dryRun && registered > 0) {
    const check = spawnSync(process.execPath, [
      path.join(SCRIPT_DIR, "register-institutions.mjs"), "--check",
    ], { encoding: "utf8" });
    registrationCheck = check.status === 0 ? "clean" : "pending";
    if (!quiet()) {
      console.log("--- 등재 점검 ---");
      console.log((check.stdout || "").trim());
    }
    if (check.status !== 0) {
      console.error("등재가 밀렸습니다. node scripts/register-institutions.mjs 로 일괄 처리하세요.");
      process.exitCode = 1;
    }
  }

  // machine-readable last line
  console.log(JSON.stringify({
    stage: 4, registered, examined: candidates.length, dryRun, registrationCheck,
  }));
}

function quiet() {
  return process.argv.includes("--quiet");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
