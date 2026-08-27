#!/bin/bash
# 무음 영상 + 내레이션 + BGM → 최종 mp4
#   - 영상은 챕터 분할 렌더라 오디오를 컴포지션에 넣지 않고 이 단계에서 합친다(BGM 연속성).
#   - BGM 은 내레이션이 있을 때 사이드체인으로 눌러 말이 항상 위에 오게 한다.
set -e
cd "$(dirname "$0")/.."
VID=renders/lawmorph-final.mp4
VOICE=audio/narration.wav
BGM=${BGM_SRC:-assets/bgm/track.wav}
OUT=renders/lawmorph-final-audio.mp4
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$VID")

[ -f "$BGM" ] || { echo "BGM 없음: $BGM — 내레이션만 믹스합니다"; BGM=""; }

# MusicGen 은 30초 시드만 만든다 → 4초 크로스페이드로 이어 붙여 영상 길이를 덮는 루프를 만든다
if [ -n "$BGM" ]; then
  SEED_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$BGM")
  LOOP=audio/bgm-loop.wav
  if [ "$(echo "$SEED_DUR < $DUR" | bc)" = "1" ]; then
    XF=4
    N=$(python3 -c "import math,sys; print(max(2, math.ceil((float('$DUR')+$XF)/ (float('$SEED_DUR')-$XF))))")
    echo "  BGM 루프: ${SEED_DUR}s 시드 x${N} (크로스페이드 ${XF}s) → ${DUR}s"
    IN=""; FC=""; PREV="[0:a]"
    for ((i=0;i<N;i++)); do IN="$IN -i $BGM"; done
    for ((i=1;i<N;i++)); do
      FC="${FC}${PREV}[${i}:a]acrossfade=d=${XF}:c1=tri:c2=tri[x${i}];"
      PREV="[x${i}]"
    done
    FC="${FC}${PREV}atrim=0:${DUR},asetpts=N/SR/TB[loop]"
    ffmpeg -y $IN -filter_complex "$FC" -map "[loop]" -ar 48000 -ac 2 "$LOOP" 2>/dev/null
    BGM="$LOOP"
  fi
fi

if [ -n "$BGM" ]; then
  ffmpeg -y -i "$VID" -i "$VOICE" -i "$BGM" -filter_complex "\
[1:a]aresample=48000,highpass=f=90,acompressor=threshold=0.05:ratio=3:attack=15:release=250,volume=1.25[vo0];\
[vo0]asplit=2[vo][key];\
[2:a]aresample=48000,atrim=0:${DUR},asetpts=N/SR/TB,volume=0.12,equalizer=f=2200:width_type=o:w=1.6:g=-2.5,afade=t=in:st=0:d=3,afade=t=out:st=$(echo "$DUR-5" | bc):d=5[bed];\
[bed][key]sidechaincompress=threshold=0.02:ratio=12:attack=20:release=500:makeup=1[duck];\
[vo][duck]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.95:level=disabled[mix]" \
    -map 0:v -map "[mix]" -c:v copy -c:a aac -b:a 192k -ar 48000 -ac 2 -shortest "$OUT" 2>/dev/null
else
  ffmpeg -y -i "$VID" -i "$VOICE" -filter_complex "\
[1:a]aresample=48000,highpass=f=90,acompressor=threshold=0.05:ratio=3:attack=15:release=250,volume=1.25,loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.95:level=disabled[mix]" \
    -map 0:v -map "[mix]" -c:v copy -c:a aac -b:a 192k -ar 48000 -ac 2 -shortest "$OUT" 2>/dev/null
fi
ffprobe -v error -show_entries format=duration -show_entries stream=codec_type,codec_name -of default=nw=1 "$OUT"
