#!/usr/bin/env node
// Discover NEW institution candidates for korea100 from news/policy briefings.
// Feed: docs/news-candidates/latest.json (discover-news-candidates.mjs 산출).
// A claude -p judge proposes 행정 제도(법령 기반 절차 체계) that are absent
// from the 586-institution manifest and the pending queue. Candidates go to
// docs/institution-candidates/queue.json — 제작·등재는 institution-creation
// 레시피로 사람이/세션이 수행한다(발굴→검토→등재, 지어내기 금지).
// Flags: --no-collect (수집 생략, 기존 latest.json 사용), --no-judge
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(WEB, "..");
const FEED = join(REPO, "docs/news-candidates/latest.json");
const OUT_DIR = join(REPO, "docs/institution-candidates");
const QUEUE = join(OUT_DIR, "queue.json");
const QUEUE_MD = join(OUT_DIR, "queue.md");
const MANIFEST = join(REPO, "docs/institutions-100-manifest.json");

const today = new Date().toISOString().slice(0, 10);

if (!process.argv.includes("--no-collect")) {
  try {
    execFileSync("node", [join(WEB, "scripts/discover-news-candidates.mjs")], {
      cwd: WEB, encoding: "utf8", timeout: 300_000, stdio: ["ignore", "inherit", "inherit"],
    });
  } catch (e) {
    console.warn(`수집 실패(${e.message}) — 기존 latest.json 사용`);
  }
}

const feed = JSON.parse(readFileSync(FEED, "utf8")).candidates ?? [];
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const names = manifest.map((m) => m.name);

// 워룸 갭 시드: 관문 절차 전개가 제도 모델 부재로 막힌 항목(이슈 #139)
const SEED = [
  {
    name: "댐 건설·관리", basis: "댐건설ㆍ관리 및 주변지역지원 등에 관한 법률(댐건설기본계획 §11)",
    ministry: "기후에너지환경부", status: "proposed", firstSeen: "2026-08-28", source: "warroom-gap",
    why: "워룸 N50(동복댐 증축) 절차 전개가 대응 제도 부재로 보류 — 등재 시 templateRefs 연결",
    articles: [],
  },
  {
    name: "행정규칙 제정·행정예고", basis: "행정절차법 §41~§46(입법예고·행정예고), 법제업무 운영규정",
    ministry: "법제처·각 부처", status: "proposed", firstSeen: "2026-08-28", source: "warroom-gap",
    why: "워룸 N54(노동쟁의 시행지침) 절차 전개가 대응 제도 부재로 보류 — 훈령·예규·고시 제정의 공통 절차",
    articles: [],
  },
];

let queue = { candidates: [] };
if (existsSync(QUEUE)) queue = JSON.parse(readFileSync(QUEUE, "utf8"));
for (const s of SEED) {
  if (!queue.candidates.some((c) => c.name === s.name)) queue.candidates.push(s);
}

let added = 0;
if (!process.argv.includes("--no-judge") && feed.length) {
  try {
    const payload = feed.map((c, i) => ({
      i, t: c.title, d: (c.body ?? "").slice(0, 160),
      m: (c.existingMatches ?? []).map((x) => x.name ?? x).slice(0, 3),
    }));
    const prompt =
      "korea100은 대한민국 행정 제도(법령 기반 절차 체계)를 한 장씩 모델링하는 아카이브다. " +
      "현재 등재된 제도 이름 목록:\n" + names.join("·") + "\n" +
      "검토 큐에 이미 있는 후보: " + (queue.candidates.map((c) => c.name).join(", ") || "없음") + "\n" +
      "아래 기사들에서, 위 목록·큐 어디에도 없는 '제도'만 후보로 제안하라. 제도란 법령에 근거해 " +
      "반복 운영되는 절차 체계(인허가·심사·지원·신고·계획 등)다. 제외: 일회성 사업·지역 단일 " +
      "프로젝트·기존 제도의 단순 개정·예산 발표·정치 일정. m은 이미 매칭된 기존 제도이니 그 " +
      "기사는 대개 제외 대상이다. 확신 없으면 제안하지 마라.\n" +
      'JSON만 출력: {"candidates":[{"name":"제도명(간결)","basis":"근거 법령 단서(모르면 확인 필요)",' +
      '"ministry":"소관 추정","why":"한 줄 근거","refs":[기사 i 배열]}]}\n' +
      JSON.stringify(payload);
    const out = execFileSync("claude", ["-p", prompt], { encoding: "utf8", timeout: 240_000 });
    const parsed = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
    for (const c of parsed.candidates ?? []) {
      if (!c.name) continue;
      if (names.includes(c.name)) continue;
      if (queue.candidates.some((q) => q.name === c.name)) continue;
      queue.candidates.push({
        name: c.name, basis: c.basis ?? "확인 필요", ministry: c.ministry ?? "?",
        why: c.why ?? "", status: "proposed", firstSeen: today, source: "news",
        articles: (c.refs ?? []).map((i) => feed[i]).filter(Boolean)
          .map((a) => ({ title: a.title, url: a.url, publishedAt: a.publishedAt, sourceName: a.sourceName })),
      });
      added++;
    }
  } catch (e) {
    console.warn(`judge skipped (${e.message})`);
  }
}

queue.updatedAt = today;
queue.note = "기사·정책브리핑에서 발굴한 korea100 신규 제도 후보 — institution-creation 레시피로 검증·제작 후 등재";
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(QUEUE, `${JSON.stringify(queue, null, 1)}\n`);

const open = queue.candidates.filter((c) => c.status === "proposed");
const md = [
  `# korea100 신규 제도 후보 검토 큐 (${today})`,
  "",
  "기사·정책브리핑에서 발굴한 **미검증 제도 후보**입니다. `docs/recipes/institution-creation`",
  "레시피로 법령 검증·모델링 후 등재하거나 기각하세요(queue.json의 status를 accepted/rejected로).",
  "",
  ...open.map((c) => [
    `## ${c.name}`,
    `- 근거 단서: ${c.basis} · 소관 추정: ${c.ministry}`,
    `- 출처: ${c.source} · 최초 ${c.firstSeen}`,
    `- 제안 근거: ${c.why}`,
    ...c.articles.slice(0, 3).map((a) => `- ${a.publishedAt} [${a.title}](${a.url}) (${a.sourceName})`),
    "",
  ].join("\n")),
].join("\n");
writeFileSync(QUEUE_MD, md + "\n");
console.log(`new-institution-candidates: ${added} (미처리 ${open.length})`);
