#!/usr/bin/env node
// 케이스 상태를 실제로 바꾸는 유일한 자리. MCP는 판정만 하고 여기로 보낸다.
//
//   node ontology/scripts/advance-case-state.mjs \
//     --case samples/information-disclosure.case.json \
//     --entity step:P09 --to done \
//     --evidence-kind user_asserted --note "이의신청서 접수증 확인" \
//     --at 2026-09-03 --actor 민원인
//
//   --dry 를 붙이면 검사만 하고 쓰지 않는다.
//   --list 는 지금 움직일 수 있는 엔티티를 보여준다.
//
// 판정은 mcp/src/case-transitions.mjs가 한다. 같은 규칙을 여기 다시 쓰지 않는다 —
// 두 벌이 되는 순간 어느 쪽이 정본인지 아무도 모르게 된다.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyTransition,
  legalTransitions,
  movableEntities,
  proposeTransitionsForEvent,
  TransitionError,
  validateTransition,
} from "../../mcp/src/case-transitions.mjs";

const ONTOLOGY_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function reportReasons(reasons) {
  for (const reason of reasons) {
    const where = reason.entity_id ? ` (${reason.entity_id})` : "";
    console.error(`  · [${reason.code}]${where} ${reason.message}`);
    if (reason.allowed_from_here) {
      console.error(`    여기서 갈 수 있는 곳: ${reason.allowed_from_here.join(", ") || "없음(종단)"}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.case) {
    console.error("사용법: --case samples/<파일>.case.json --entity <id> --to <상태> --evidence-kind <종류> --note <근거>");
    console.error("        --list 로 움직일 수 있는 엔티티만 볼 수 있습니다. --dry 는 검사만 합니다.");
    console.error("        --event <유형> 은 전자결재 이벤트가 뜻하는 전이 후보를 보여줍니다(적용 안 함).");
    process.exit(2);
  }

  const casePath = path.join(ONTOLOGY_DIR, args.case);
  const raw = await readFile(casePath, "utf8");
  const caseData = JSON.parse(raw);
  // 들여쓰기를 원본에서 읽는다. 고정값으로 쓰면 전이 한 번에 파일 전체가 재포맷돼
  // 실제 변경 두 줄이 수천 줄 diff에 묻힌다.
  const indent = (raw.match(/\n(\x20+)"/u)?.[1] ?? " ").length;

  if (args.list) {
    const movable = movableEntities(caseData);
    console.log(`${caseData.case_id} (as_of ${caseData.as_of}) — 움직일 수 있는 엔티티 ${movable.length}개`);
    for (const item of movable) {
      console.log(`  ${item.entity_id}: ${item.from} → ${item.can_become.join(" | ")}`);
    }
    return;
  }

  if (!args.entity) {
    console.error("--entity 가 필요합니다. --list 로 후보를 먼저 보세요.");
    process.exit(2);
  }

  if (args.event) {
    // 이벤트가 뜻하는 전이 후보만 보여준다. 후보가 하나여도 자동으로 적지 않는다 —
    // 무엇을 적을지 고르는 것은 사람 몫이라는 규칙이 여기서도 같아야 한다.
    const result = proposeTransitionsForEvent(caseData, { event_type: args.event, entity_id: args.entity });
    if (result.status === "unknown_event_type") {
      console.error(`모르는 이벤트 유형입니다. 아는 것: ${result.known_event_types.join(", ")}`);
      process.exit(2);
    }
    console.log(`${result.event_label ?? args.event} @ ${args.entity} — 현재 ${result.from ?? "상태 미기재"}`);
    if (result.why) console.log(`  ${result.why}`);
    for (const proposal of result.proposals) {
      console.log(`  ${proposal.allowed ? "○" : "×"} ${proposal.to} — ${proposal.meaning ?? ""}`);
      if (proposal.loop_note) console.log(`      ${proposal.loop_note}`);
      for (const blocker of proposal.blockers) console.log(`      ${blocker.message}`);
    }
    if (!result.proposals.length) console.log(`  제안할 전이가 없습니다 (${result.status})`);
    if (result.would_open?.length) {
      console.log(`  완료로 적으면 열리는 단계: ${result.would_open.map((item) => item.entity_id).join(", ")}`);
      console.log("  (이것도 제안입니다. 각각 따로 적으세요.)");
    }
    console.log("  적용하려면 --to <상태> 와 근거를 함께 주세요.");
    return;
  }

  if (!args.to) {
    // 목적지를 안 주면 갈 수 있는 곳을 보여주고 끝낸다.
    const options = legalTransitions(caseData, args.entity);
    console.log(`${args.entity}: 현재 ${options.from ?? "상태 미기재"}`);
    if (!options.closed_vocabulary) {
      console.log(`  ${options.note}`);
      return;
    }
    for (const transition of options.transitions) {
      const mark = transition.allowed ? "○" : "×";
      console.log(`  ${mark} ${transition.to} — ${transition.meaning ?? ""}`);
      for (const blocker of transition.blockers) console.log(`      ${blocker.message}`);
    }
    if (options.terminal) console.log("  (종단 상태입니다)");
    return;
  }

  const evidence = {
    kind: args["evidence-kind"] ?? "none",
    note: typeof args.note === "string" ? args.note : "",
    ...(args.source ? { source: args.source } : {}),
  };
  const input = {
    entity_id: args.entity,
    to: args.to,
    evidence,
    at: typeof args.at === "string" ? args.at : undefined,
    actor: typeof args.actor === "string" ? args.actor : null,
  };

  const verdict = validateTransition(caseData, input);
  if (!verdict.ok) {
    console.error(`거부: ${args.entity} ${verdict.from ?? "?"} → ${args.to}`);
    reportReasons(verdict.reasons);
    process.exit(1);
  }

  if (args.dry) {
    console.log(`통과(검사만): ${args.entity} ${verdict.from} → ${args.to}`);
    return;
  }

  let next;
  try {
    next = applyTransition(caseData, input);
  } catch (error) {
    if (error instanceof TransitionError) {
      console.error(`거부: ${error.message}`);
      reportReasons(error.details.reasons ?? []);
      process.exit(1);
    }
    throw error;
  }

  await writeFile(casePath, `${JSON.stringify(next, null, indent)}\n`, "utf8");
  const entry = next.state_log[next.state_log.length - 1];
  console.log(`적용: ${entry.entity_id} ${entry.from} → ${entry.to} (${entry.at})`);
  console.log(`  근거: ${entry.evidence.kind} — ${entry.evidence.note}`);
  console.log(`  이력 ${next.state_log.length}건, as_of ${next.as_of}`);
  console.log("  구조 층이 바뀌었다면 derive-*.mjs --remerge 를 다시 돌리세요.");
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
