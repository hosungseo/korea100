You perform an L2 blind-reconstruction audit of ONE institution's process diagram in the korea100 project.
Repo: /Users/seohoseong/korea100, branch audit/l0-process-audit (already checked out — do NOT switch).

## PHASE 1 — Blind reconstruction (STRICT ORDER)

You must NOT open web/data/institutions/<slug>.json (or any repo data/docs) until Phase 1 is complete and written to disk. Independence is the entire point.

1. Identify the institution's governing laws from its name/topic (given in your dispatch). Fetch them via law.go.kr DRF API (curl):
   - Search: curl -s "https://www.law.go.kr/DRF/lawSearch.do?OC=test&target=law&query=<법령명>&type=XML" → 현행 MST
   - Body: curl -s "https://www.law.go.kr/DRF/lawService.do?OC=test&target=law&MST=<MST>&type=XML"
2. Reconstruct the procedure skeleton from the article text: steps with actor / action / legal_basis "법령명 제N조(제목)" / statutory deadline (조문 명시분만) / branches / loops. Include party(당사자) procedural rights and duties — 신청·동의·이의신청·열람·협조 등.
3. NO article you haven't seen in the XML. Write the skeleton to /tmp/l2-recon-<slug>.json BEFORE opening any repo data file.

## PHASE 2 — Diff & adjudication

Now read web/data/institutions/<slug>.json and diff against your reconstruction. Adjudication principles (from the ordinance/hearing pilots):
- FIX these (with the verified article as evidence):
  (C) 근거 오인용 — cited article/law does not govern that node's 행위·주체·기한
  (E) 필수 단계·당사자 권리 누락 — statute mandates a step/right absent from the diagram (add a node: status done/waiting — NEVER current, progress 100/0, wire with sequence/message edges, ids continuing the file's scheme)
  (D) 기한 오류/누락 — deadline differs from or missing vs statute text
  (F) 비법정 기구·단계가 법령 근거처럼 표기 — mark the entry unverified:true with a text noting its actual basis (조례·훈령·운영)
- DO NOT change: modeling compressions, lane groupings, naming style — style is not error.
- 지어내기 금지: cite only articles you fetched. Unresolvable → unverified:true + fieldVerification item.
- Never touch the existing current-status node; keep exactly one current in the file.
- Append ONE process.warnings record: "2026-07-12 L2 블라인드 재구성 대조 정정: ..." listing changes + consulted MSTs.
- Add discovered 법의 침묵 지점 (statute-silent points) — append to the SAME warnings record as "법의 침묵: ..." (max 3, short).

## Verify & commit

cd /Users/seohoseong/korea100/web && node scripts/generate-field-verification-queue.mjs && node scripts/validate-data.mjs
Validation MUST print 검증 성공 (check exit code directly, do not pipe to tail).
Then stage only the files produced by this audit. For one-institution work, use:

```bash
git add web/data/institutions/<slug>.json docs/field-verification-queue.json docs/field-verification-queue.md
```

If an audit report was intentionally updated, add that report by its exact path. Never use broad paths such as `git add web/data/ docs/`, because concurrent agents' uncommitted files can be accidentally included.

Then commit with: `git commit -m "fix: <slug> L2 blind-recon adjudication — <n> corrections"`
If commit fails on index.lock, sleep 2 and retry (max 3).
End commit message with:
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013WXa2uVeD6vUjpK4hHNLZU
Do NOT push. Do NOT touch other institutions' files.

## Report (FINAL message = report only, nothing after)
slug | recon steps N | corrections applied (type-tagged C/E/D/F, one line each) | left-as-is judgments (count) | 법의 침묵 (count) | commit SHA
