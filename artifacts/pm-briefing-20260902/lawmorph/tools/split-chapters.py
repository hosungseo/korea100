#!/usr/bin/env python3
"""index.html 을 챕터별 렌더 파일로 쪼갠다.

hyperframes 0.8.15 렌더러가 약 46초 이후 클립을 캡처하지 못하는 버그가 있어
(스냅샷·프리뷰는 정상) 챕터별로 나눠 렌더한 뒤 ffmpeg 로 이어붙인다.
각 챕터 파일은 대상 챕터를 t=0 으로 옮기고 나머지 챕터는 타임라인 밖(900초)으로 보낸다.

프로젝트 밖(기본 /private/tmp/lawmorph-chapters)에 쓰는 이유:
  - compositions/ 아래에 두면 assets/ 상대경로가 404 나서 화면이 통째로 빈다
  - 프로젝트 안에 루트 컴포지션이 둘 이상이면 lint 가 막는다
render-all.sh 가 챕터 파일을 index.html 자리에 잠시 복사해 렌더한다.
"""
import re, os, json, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'index.html')
OUTDIR = os.environ.get('HF_CHAPTER_DIR', '/private/tmp/lawmorph-chapters')

# (챕터키, 길이, 이 챕터에 속한 클립 id들)  — 순서가 곧 이어붙일 순서
CHAPTERS = [
    ('intro', 32.2, ['stage-intro', 'c1-terms'], [1, 2, 3, 4, 5]),
    ('doc',   14.2, ['stage-doc']      ,    [6, 7]),
    ('map',   16.0, ['stage-map'],               [8]),
    ('mont',   8.4, ['stage-mont'],              [9]),
    ('reg',    9.0, ['stage-reg'],               [10]),
    ('track',  9.0, ['stage-track'],             [11]),
    ('mega',  16.0, ['stage-mega'],              [12, 13]),
    ('zoom',  11.0, ['stage-zoom'],              [14]),
    ('ax1',   22.6, ['stage-ax1'],              [15, 16, 17]),
    ('ax2',   25.0, ['stage-ax2'],              [18, 19]),
    ('ax3',   14.0, ['stage-ax3'],              [20]),
    ('close', 12.6, ['stage-close'],             [21]),
]

def read_starts(html):
    """id -> data-start (원본 절대 시각)"""
    out = {}
    for m in re.finditer(r'<[a-z]+[^>]*(?<![-\w])id="([^"]+)"[^>]*\bdata-start="([0-9.]+)"', html):
        out[m.group(1)] = float(m.group(2))
    return out

def set_start(html, elid, val):
    pat = re.compile(r'(<[a-z]+[^>]*(?<![-\w])id="' + re.escape(elid) + r'"[^>]*\bdata-start=")[0-9.]+(")')
    html, n = pat.subn(lambda m: m.group(1) + str(round(val, 3)) + m.group(2), html)
    assert n == 1, f'{elid}: matched {n}'
    return html

def main():
    src = open(SRC).read()
    starts = read_starts(src)
    tbase = json.loads(re.search(r'const T = (\{.*?\});', src, re.S).group(1)
                       .replace('intro:', '"intro":').replace('doc:', '"doc":')
                       .replace('map:', '"map":').replace('mont:', '"mont":')
                       .replace('reg:', '"reg":').replace('track:', '"track":')
                       .replace('mega:', '"mega":').replace('zoom:', '"zoom":')
                       .replace('ax1:', '"ax1":').replace('ax2:', '"ax2":').replace('ax3:', '"ax3":').replace('close:', '"close":'))
    os.makedirs(OUTDIR, exist_ok=True)
    made = []
    for key, dur, clips, subs in CHAPTERS:
        s = src
        base = tbase[key]
        # 1) 챕터 상수 : 대상만 0, 나머지는 타임라인 밖으로
        newT = {k: (0 if k == key else 900) for k in tbase}
        s = re.sub(r'const T = \{.*?\};',
                   'const T = ' + json.dumps(newT).replace('"', '') + ';', s, flags=re.S)
        # 2) 클립 : 대상은 base 만큼 앞으로, 나머지는 900 으로
        for elid, st in starts.items():
            if elid == 'root':
                continue
            if elid in clips or (elid.startswith('subclip') and int(elid[7:]) in subs):
                s = set_start(s, elid, st - base)
            else:
                s = set_start(s, elid, 900)
        # 3) 자막 타임라인 배열도 같은 만큼 이동
        def shift_subs(m):
            rows = re.findall(r'\[(\d+), ([0-9.]+)\]', m.group(1))
            keep = [f'[{n}, {round(float(t) - base, 3)}]' for n, t in rows if int(n) in subs]
            return 'const SUBS = [' + ', '.join(keep) + '];'
        s = re.sub(r'const SUBS = \[(.*?)\];', shift_subs, s, flags=re.S)
        # 4) 루트 길이 · 컴포지션 id
        s, n = re.subn(r'(<div[^>]*(?<![-\w])id="root"[^>]*\bdata-duration=")[0-9.]+(")',
                       r'\g<1>' + str(dur) + r'\2', s)
        assert n == 1, f'{key}: root duration not rewritten'
        s = s.replace('data-composition-id="main"', f'data-composition-id="ch-{key}"')
        s = s.replace('window.__timelines["main"]', f'window.__timelines["ch-{key}"]')
        # 5) 글로우 반복 횟수를 챕터 길이에 맞춤(무한 반복 금지)
        s = re.sub(r'yoyo: true, repeat: \d+ \}, 0\);',
                   f'yoyo: true, repeat: {max(0, int(dur // 1.5) - 1)} }}, 0);', s)
        path = os.path.join(OUTDIR, f'{key}.html')
        open(path, 'w').write(s)
        made.append((key, dur, path))
    total = sum(d for _, d, _ in made)
    print(f'{len(made)} chapters, total {total:.1f}s')
    for k, d, p in made:
        print(f'  {k:6s} {d:5.1f}s  {os.path.relpath(p, ROOT)}')

if __name__ == '__main__':
    main()
