#!/usr/bin/env python3
"""내레이션 WAV 생성 + 타임코드 배치 트랙 만들기.

엔진: Supertonic 3 (로컬 ONNX, 한국어 지원). `.venv-tts` 의 파이썬으로 실행해야 한다.
  .venv-tts/bin/python tools/make-narration.py
환경변수: NARRATION_VOICE(F1~F5·M1~M5, 기본 F1) · NARRATION_SPEED(기본 1.0) ·
          NARRATION_TOTAL(기본 190)
audio/narration.json 의 at(초)에 각 문장을 배치한 190초 모노 트랙을 만든다.
"""
import json, os, subprocess, sys, wave, contextlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'audio', 'voice')
VOICE = os.environ.get('NARRATION_VOICE', 'F1')
SPEED = float(os.environ.get('NARRATION_SPEED', '1.0'))
TOTAL = float(os.environ.get('NARRATION_TOTAL', '190'))

def dur(path):
    with contextlib.closing(wave.open(path)) as w:
        return w.getnframes() / w.getframerate()

def main():
    try:
        from supertonic import TTS
    except ImportError:
        sys.exit('supertonic 이 없습니다 — .venv-tts/bin/python 으로 실행하세요')

    os.makedirs(OUT, exist_ok=True)
    lines = json.load(open(os.path.join(ROOT, 'audio', 'narration.json')))
    tts = TTS(auto_download=True)
    style = tts.get_voice_style(voice_name=VOICE)
    parts, over = [], []

    for i, ln in enumerate(lines):
        raw = os.path.join(OUT, ln['id'] + '-raw.wav')
        wav_path = os.path.join(OUT, ln['id'] + '.wav')
        wav, _ = tts.synthesize(ln['text'], voice_style=style, lang='ko', speed=SPEED)
        tts.save_audio(wav, raw)
        # 48k 모노로 통일 (믹스 단계와 맞춤)
        subprocess.run(['ffmpeg', '-y', '-i', raw, '-ar', '48000', '-ac', '1', wav_path],
                       check=True, capture_output=True)
        os.remove(raw)

        d = dur(wav_path)
        nxt = lines[i + 1]['at'] if i + 1 < len(lines) else TOTAL
        slot = nxt - ln['at']
        note = ''
        if d > slot - 0.25:  # 슬롯을 넘치면 1.12배 안에서만 빠르게
            tempo = min(1.12, d / max(0.5, slot - 0.25))
            sped = wav_path.replace('.wav', '-t.wav')
            subprocess.run(['ffmpeg', '-y', '-i', wav_path, '-filter:a', f'atempo={tempo:.4f}',
                            '-ar', '48000', '-ac', '1', sped], check=True, capture_output=True)
            os.replace(sped, wav_path)
            d2 = dur(wav_path)
            note = f'  → x{tempo:.3f} = {d2:.2f}s'
            if d2 > slot - 0.1:
                over.append((ln['id'], round(d2, 2), round(slot, 2)))
                note += ' *** STILL OVER'
            d = d2
        parts.append((ln['at'], wav_path, d))
        print(f"{ln['id']} at {ln['at']:6.1f}  len {d:5.2f}s  slot {slot:5.2f}s{note}")

    inputs, filters, labels = [], [], []
    for i, (at, wav_path, _) in enumerate(parts):
        inputs += ['-i', wav_path]
        filters.append(f'[{i}:a]adelay={int(at * 1000)}|{int(at * 1000)}[d{i}]')
        labels.append(f'[d{i}]')
    track = os.path.join(ROOT, 'audio', 'narration.wav')
    fc = ';'.join(filters) + ';' + ''.join(labels) + \
         f'amix=inputs={len(parts)}:normalize=0:dropout_transition=0[mixed];' \
         f'[mixed]apad=whole_dur={TOTAL},atrim=0:{TOTAL},' \
         'dynaudnorm=p=0.9:m=4,volume=1.25,alimiter=limit=0.89:level=disabled[out]'
    subprocess.run(['ffmpeg', '-y'] + inputs + ['-filter_complex', fc, '-map', '[out]',
                    '-ar', '48000', '-ac', '1', track], check=True, capture_output=True)
    print(f"\n[{VOICE}] narration track →", os.path.relpath(track, ROOT), f'({dur(track):.1f}s)')
    if over:
        print('OVERRUNS:', over)
        sys.exit(1)

if __name__ == '__main__':
    main()
