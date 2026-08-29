#!/bin/bash
# korea100 워룸 뉴스 신호 수집 — 매일 로컬 실행 후 main 자동 커밋
# (법령 최신성 점검과 같은 launchd 패턴. 네이버·정책브리핑 키와
#  claude CLI 판별이 로컬에만 있어 Actions 대신 로컬에서 돈다.)
#
# 실행 위치는 ~/.local/bin/korea100-warroom-signals.sh 이고, launchd
# com.korea100.warroom-signals(매일 08:00)가 그 경로를 부른다. 이 파일은
# 그 사본이자 정본이다 — 심링크로 걸지 않은 이유는, 이 저장소의 기본
# 워크트리가 다른 브랜치로 바뀌면 스크립트가 통째로 사라져 작업이
# 조용히 죽기 때문이다(낡은 사본보다 없는 파일이 더 나쁘다).
#
#   고친 뒤 반영:  cp tools/launchd/korea100-warroom-signals.sh ~/.local/bin/
#   차이 확인:     diff tools/launchd/korea100-warroom-signals.sh ~/.local/bin/korea100-warroom-signals.sh
set -uo pipefail

NODE_BIN="/Users/seohoseong/.nvm/versions/node/v24.18.0/bin"
export PATH="$NODE_BIN:/Users/seohoseong/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

REPO="hosungseo/korea100"
REPO_DIR="/Users/seohoseong/korea100"
SECRETS="/Users/seohoseong/.config/k-skill/secrets.env"
WEB_DIR="$REPO_DIR/web"
WT="/Users/seohoseong/korea100-worktrees/warroom-signals"
REL="web/public/warroom/map/signals.json"
LOG="/Users/seohoseong/Library/Logs/korea100-warroom-signals.log"
mkdir -p "$(dirname "$LOG")"

{
  echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') 워룸 신호 수집 시작 ====="

  cd "$WEB_DIR" || { echo "!! $WEB_DIR 없음"; exit 1; }

  # 수집 (키는 web/.env.local, 판별은 claude CLI — 실패 시 기계 필터 결과 유지)
  OUT="$(node scripts/collect-warroom-signals.mjs 2>&1)"
  RC=$?
  echo "$OUT"
  echo "collector exit=$RC"
  if [ "$RC" -ne 0 ]; then echo "!! 수집 실패 — 커밋 생략"; exit "$RC"; fi
  NEW_CAND="$(echo "$OUT" | grep -o 'new-candidates: [0-9]*' | grep -o '[0-9]*' | head -1)"

  # main 커밋용 detached 워크트리 (main 브랜치는 다른 워크트리가 점유 중일 수 있어
  # 항상 origin/main 기준 detached로 만든다)
  if [ ! -d "$WT" ]; then
    git -C "$REPO_DIR" worktree add --detach "$WT" origin/main || { echo "!! 워크트리 생성 실패"; exit 1; }
  fi
  git -C "$WT" fetch origin --quiet
  git -C "$WT" checkout --detach origin/main --quiet || { echo "!! origin/main 체크아웃 실패"; exit 1; }

  cp "$WEB_DIR/public/warroom/map/signals.json" "$WT/$REL"
  CAND_REL="web/public/warroom/map/gate-candidates.json"
  [ -f "$WEB_DIR/public/warroom/map/gate-candidates.json" ] && cp "$WEB_DIR/public/warroom/map/gate-candidates.json" "$WT/$CAND_REL"

  if git -C "$WT" status --porcelain -- "$REL" "$CAND_REL" | grep -q .; then
    git -C "$WT" add "$REL" "$CAND_REL" 2>/dev/null || git -C "$WT" add "$REL"
    git -C "$WT" commit --quiet -m "chore: 워룸 뉴스 신호 갱신 ($(date '+%Y-%m-%d'))

자동 수집(launchd) — 네이버·정책브리핑 → 기계 필터 → claude 판별.
신호 레이어만 갱신, 관문 상태 데이터는 불변.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
    if git -C "$WT" push origin HEAD:main --quiet; then
      echo "main 푸시 완료: $(git -C "$WT" rev-parse --short HEAD)"
    else
      echo "!! 푸시 실패(경합 가능) — 다음 주기에 재시도"
      exit 1
    fi
  else
    echo "변경 없음 — 커밋 생략"
  fi

  # korea100 본판 신규 제도 후보 발굴 (기사·정책브리핑 → 586+ 확장 루프)
  INST_OUT="$(node scripts/discover-institution-candidates.mjs 2>&1)"
  echo "$INST_OUT"
  NEW_INST="$(echo "$INST_OUT" | grep -o 'new-institution-candidates: [0-9]*' | grep -o '[0-9]*' | head -1)"
  # 루프 상태판 데이터 재생성 (신호·큐 집계 → /warroom/loop/)
  node scripts/generate-loop-status.mjs || echo "!! 루프 상태 생성 실패"
  # 장차관 보고체 일일 브리핑 (claude — 실패 시 기계식 폴백 내장)
  node scripts/generate-loop-briefing.mjs || echo "!! 브리핑 생성 실패"

  for REL2 in docs/institution-candidates/queue.json docs/institution-candidates/queue.md web/public/warroom/loop/data.json web/public/warroom/loop/briefing.txt; do
    if [ -f "$REPO_DIR/$REL2" ]; then
      mkdir -p "$WT/$(dirname "$REL2")"
      cp "$REPO_DIR/$REL2" "$WT/$REL2"
    fi
  done
  if git -C "$WT" status --porcelain -- docs/institution-candidates web/public/warroom/loop | grep -q .; then
    git -C "$WT" add docs/institution-candidates web/public/warroom/loop
    git -C "$WT" commit --quiet -m "chore: 루프 상태·제도 후보 갱신 ($(date '+%Y-%m-%d'))

자동 발굴(launchd) — 후보는 institution-creation 레시피로 검증 후 등재.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
    git -C "$WT" push origin HEAD:main --quiet && echo "제도 후보 푸시 완료" || echo "!! 제도 후보 푸시 실패"
  fi
  if [ "${NEW_INST:-0}" -gt 0 ] 2>/dev/null; then
    echo "korea100 신규 제도 후보 $NEW_INST건 → GitHub 이슈"
    gh label create korea100-institution-candidate --color 0E8A16 --description "News-discovered institution candidates" --force -R "$REPO" >/dev/null 2>&1
    IBODY="$REPO_DIR/docs/institution-candidates/queue.md"
    INUM="$(gh issue list -R "$REPO" --label korea100-institution-candidate --state open --json number --jq '.[0].number // empty' 2>/dev/null)"
    if [ -n "$INUM" ]; then
      gh issue edit "$INUM" -R "$REPO" --body-file "$IBODY" && echo "이슈 #$INUM 갱신"
    else
      gh issue create -R "$REPO" --label korea100-institution-candidate --title "korea100 신규 제도 후보 검토" --body-file "$IBODY" && echo "이슈 생성"
    fi
  fi

  # 신규 절차 후보 발견 시 검토 이슈 생성/갱신 (법령 점검과 같은 패턴)
  if [ "${NEW_CAND:-0}" -gt 0 ] 2>/dev/null; then
    echo "신규 절차 후보 $NEW_CAND건 → GitHub 이슈"
    gh label create warroom-gate-candidate --color 1D76DB --description "News-discovered gate candidates" --force -R "$REPO" >/dev/null 2>&1
    BODY="$WEB_DIR/public/warroom/map/gate-candidates.md"
    NUM="$(gh issue list -R "$REPO" --label warroom-gate-candidate --state open --json number --jq '.[0].number // empty' 2>/dev/null)"
    if [ -n "$NUM" ]; then
      gh issue edit "$NUM" -R "$REPO" --body-file "$BODY" && echo "이슈 #$NUM 갱신"
    else
      gh issue create -R "$REPO" --label warroom-gate-candidate --title "워룸 신규 절차 후보 검토" --body-file "$BODY" && echo "이슈 생성"
    fi
  fi
  # 텔레그램 데일리 다이제스트 — secrets.env에 TELEGRAM_BOT_TOKEN이 있을 때만
  TG_TOKEN="$(grep '^TELEGRAM_BOT_TOKEN=' "$SECRETS" 2>/dev/null | head -1 | cut -d= -f2-)"
  TG_CHAT="$(grep '^TELEGRAM_CHAT_ID=' "$SECRETS" 2>/dev/null | head -1 | cut -d= -f2-)"
  TG_CHAT="${TG_CHAT:-5089905038}"
  if [ -n "${TG_TOKEN:-}" ]; then
    MSG="$(cat "$WEB_DIR/public/warroom/loop/briefing.txt" 2>/dev/null)"
    TG_API="https://api.telegram.org/bot${TG_TOKEN}"
    LOOPDIR="$WEB_DIR/public/warroom/loop"
    SENT=0

    # 한 장짜리 한글 보고서(PNG + HWPX). 채움 스크립트는 파싱이 어긋나면 종료 코드 1 로
    # 죽으므로, 여기서 걸러 평문 발송으로 떨어진다 — 빈 보고서를 내보내지 않기 위한 게이트.
    if REPORT_OUT="$(python3 "$WEB_DIR/scripts/fill-warroom-report.py" 2>&1)"; then
      echo "$REPORT_OUT"
      PNG="$(ls -t "$LOOPDIR"/warroom-*.png 2>/dev/null | head -1)"
      HWPX="$(ls -t "$LOOPDIR"/warroom-*.hwpx 2>/dev/null | head -1)"
      if [ -n "$PNG" ] && [ -f "$PNG" ]; then
        # 사진은 텔레그램에서 검색이 안 된다 — 캡션에 제목과 관문 ID 를 남긴다
        CAP="$(head -1 "$LOOPDIR/briefing.txt")
$(grep -o 'N[0-9]\{2,\}' "$LOOPDIR/briefing.txt" | sort -u | tr '\n' ' ')"
        if curl -s -X POST "${TG_API}/sendPhoto" -F chat_id="$TG_CHAT" \
             -F photo=@"$PNG" -F caption="$CAP" >/dev/null; then
          echo "텔레그램 사진 보고서 발송: $(basename "$PNG")"
          SENT=1
          if [ -n "$HWPX" ] && [ -f "$HWPX" ]; then
            curl -s -X POST "${TG_API}/sendDocument" -F chat_id="$TG_CHAT" \
              -F document=@"$HWPX" >/dev/null && echo "텔레그램 hwpx 첨부 발송"
          fi
        else
          echo "!! 사진 발송 실패 — 평문으로 대체"
        fi
      fi
    else
      echo "!! 한 장 보고서 생성 실패 — 평문으로 대체"
      echo "$REPORT_OUT" | tail -3
    fi

    # 사진을 못 보냈으면 기존 평문 다이제스트로 폴백(본문은 텔레그램에서 검색된다)
    if [ "$SENT" = 0 ] && [ -n "$MSG" ]; then
      curl -s -X POST "${TG_API}/sendMessage" \
        -d chat_id="$TG_CHAT" --data-urlencode text="$MSG" >/dev/null \
        && echo "텔레그램 다이제스트 발송(평문)" || echo "!! 텔레그램 발송 실패"
    fi
  else
    echo "TELEGRAM_BOT_TOKEN 없음 — 다이제스트 생략(상태판·이슈로 대체)"
  fi
  echo "===== 완료 ====="
} >> "$LOG" 2>&1
