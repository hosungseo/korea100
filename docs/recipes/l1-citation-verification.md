You are fixing legal citation errors in institution files of the korea100 project.
Work from /Users/seohoseong/korea100 on branch audit/l0-process-audit (already checked out — do NOT switch branches).

## What to fix
See your targets' findings:
python3 -c "
import json
d = json.load(open('docs/audits/process-audit-2026-07-12.json'))
for r in d['results']:
    if r['slug'] in (TARGETS):
        print('==', r['slug'])
        for f in r['findings']: print(' ', f)"
Fix ONLY article-descriptive and article-compound findings (ignore outlier/no-sublaw/no-loop/empty-lane).

## Method (proven recipe — follow exactly)
1. Load korealaw tools once: ToolSearch "select:mcp__claude_ai_korealaw__search_law,mcp__claude_ai_korealaw__get_law_text"
2. Per law: search_law (현행 MST) → get_law_text(mst) WITHOUT jo = 조문 목차.
3. Map each descriptive citation to actual article(s) using the node's name/action.
   Ambiguous from ToC title → fetch the article (jo="제N조") and confirm it governs the node's 행위·주체·기한.
4. Split compound refs ("제2·3조") into individual entries: "제N조(현행 제목)".
5. 지어내기 절대 금지. Never cite an article you haven't seen in fetched ToC/text.
   Unresolvable (훈령·고시 등 API 미제공, 또는 맞는 조문 없음) → keep the descriptive text,
   add "unverified": true to that legal_basis entry, add a fieldVerification item, done.
6. Entry schema: {"law", "article": "제N조(제목)", "text": "짧은 요지(원문 확인분만, 선택)"}. No fabricated quotes.
7. Append correction record to process.warnings: date 2026-07-12, 내용, consulted MSTs.

## Verify & commit
After each file:
  node web/scripts/validate-data.mjs      # must end 검증 성공
  node web/scripts/audit-process.mjs 2026-07-12   # your slug의 article findings 0이어야 함
ONE commit per file: git add web/data/institutions/<file>.json docs/audits/ && git commit -m "fix: <slug> citations — ..."
If git commit fails with index.lock (parallel agents), sleep 2 and retry up to 3 times.
End commit messages with:
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013WXa2uVeD6vUjpK4hHNLZU
Do NOT push. Do NOT touch other institution files.

## Report (FINAL message = report only)
Per file: before→after, articles confirmed, unverified/FV moves & why, commit SHAs, suspicious content noticed (report only).
