#!/bin/bash
# 챕터별 렌더 후 이어붙이기 (렌더러 버그 우회 — BRIEF.md Render note 참고)
# 챕터 파일을 index.html 자리에 잠시 복사해 렌더한다(하위 경로 렌더는 assets 404).
set -e
cd "$(dirname "$0")/.."
CH="${HF_CHAPTER_DIR:-/private/tmp/lawmorph-chapters}"
python3 tools/split-chapters.py
ORDER=(open intro doc map mont reg auto part2 moon mega demo loop brief part3 ax1 ax2 ax3 close)
mkdir -p renders/parts
cp index.html .index.master.html
restore() { cp .index.master.html index.html; rm -f .index.master.html; }
trap restore EXIT
: > renders/concat.txt
for k in "${ORDER[@]}"; do
  echo "  render $k"
  cp "$CH/$k.html" index.html
  npx hyperframes render --quality standard -o "renders/parts/$k.mp4" > /dev/null 2>&1
  echo "file 'parts/$k.mp4'" >> renders/concat.txt
done
restore; trap - EXIT
( cd renders && ffmpeg -y -f concat -safe 0 -i concat.txt -c copy lawmorph-final.mp4 2>/dev/null )
ffprobe -v error -show_entries format=duration -of csv=p=0 renders/lawmorph-final.mp4
