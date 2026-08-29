#!/bin/bash
# 챕터별 렌더 후 이어붙이기 (렌더러 버그 우회 — BRIEF.md Render note 참고)
# 챕터 파일을 index.html 자리에 잠시 복사해 렌더한다(하위 경로 렌더는 assets 404).
#
# 사용:
#   bash tools/render-all.sh                 전 챕터 렌더 후 concat
#   bash tools/render-all.sh board mdemo     지정 챕터만 다시 렌더하고, 나머지는
#                                            renders/parts 의 기존 mp4 를 그대로 써서 concat
# 챕터는 서로 독립(각자 t=0 부터 렌더)이라 다른 챕터의 시각이 밀려도 픽셀은 그대로다.
# 따라서 내용이 바뀐 챕터만 다시 렌더하면 된다.
set -e
cd "$(dirname "$0")/.."
CH="${HF_CHAPTER_DIR:-/private/tmp/lawmorph-chapters}"
python3 tools/split-chapters.py
# 이어붙일 순서는 split-chapters.py 의 CHAPTERS 하나에서만 온다(두 군데 관리 금지)
read -r -a ORDER <<< "$(python3 - <<'PY'
import re
body = re.search(r'CHAPTERS = \[(.*?)\n\]', open('tools/split-chapters.py').read(), re.S).group(1)
print(' '.join(re.findall(r"^\s*\('([a-z0-9]+)'", body, re.M)))
PY
)"
[ ${#ORDER[@]} -gt 0 ] || { echo "챕터 순서를 읽지 못했습니다"; exit 1; }
echo "  순서(${#ORDER[@]}): ${ORDER[*]}"
mkdir -p renders/parts
cp index.html .index.master.html
restore() { cp .index.master.html index.html; rm -f .index.master.html; }
trap restore EXIT
: > renders/concat.txt
for k in "${ORDER[@]}"; do
  want=1
  if [ $# -gt 0 ]; then
    want=0
    for sel in "$@"; do [ "$sel" = "$k" ] && want=1; done
  fi
  if [ "$want" = 1 ]; then
    echo "  render $k"
    cp "$CH/$k.html" index.html
    npx --yes hyperframes@0.8.17 render --quality standard -o "renders/parts/$k.mp4" > /dev/null 2>&1
  else
    [ -f "renders/parts/$k.mp4" ] || { echo "  기존 파트 없음: $k — 전체 렌더가 필요합니다"; exit 1; }
    echo "  reuse  $k"
  fi
  echo "file 'parts/$k.mp4'" >> renders/concat.txt
done
restore; trap - EXIT
( cd renders && ffmpeg -y -f concat -safe 0 -i concat.txt -c copy lawmorph-final.mp4 2>/dev/null )
ffprobe -v error -show_entries format=duration -of csv=p=0 renders/lawmorph-final.mp4
