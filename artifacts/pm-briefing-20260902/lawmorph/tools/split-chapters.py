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

# (챕터키, 길이, 이 챕터에 속한 클립 id들, 자막 번호)  — 순서가 곧 이어붙일 순서
CHAPTERS = [
    # --- 1부 : 제도를 읽다 ---
    ('open',   4.6, ['stage-open'],                               []),
    ('intro', 28.4, ['stage-intro', 'c1-terms'],                  [1, 2, 3]),
    ('doc',   14.2, ['stage-doc'],                                [5, 6]),
    ('map',   16.0, ['stage-map'],                                [7]),
    ('reg',    9.0, ['stage-reg'],                                [10]),
    ('auto',   8.6, ['stage-auto'],                               [11]),
    ('part2',  8.0, ['stage-part2'],                              [12]),
    # --- 2부 : 미시로, 실증으로 (사례는 여비몬 한 건) ---
    ('part3', 12.0, ['stage-part3'],                              [20]),
    ('ax1',   22.6, ['stage-ax1'],                                [21, 22, 23]),
    ('ax3',   15.4, ['stage-ax3'],                                [26]),
    ('close', 10.0, ['stage-close'],                              [27]),
    # --- 3부 : 거시로, 문샷으로 ---
    ('moon',  19.0, ['stage-moon'],                               [13, 29]),
    ('mega',  16.0, ['stage-mega'],                               [14, 15]),
    ('demo',  25.0, ['stage-demo', 'demovid', 'demotagclip'],     [16, 17, 18]),
    ('loop',  17.0, ['stage-loop', 'subclip19b'],                 [19]),
    ('brief', 13.0, ['stage-brief', 'subclip19c'],                []),
    ('multi', 16.0, ['stage-multi'],                              [30, 31]),
    ('mdemo',  9.0, ['stage-mdemo', 'mdemovid', 'mdemotagclip'],  [34, 37]),
    ('board', 12.0, ['stage-board'],                              [32]),
    ('bdemo', 13.0, ['stage-bdemo', 'bdemovid', 'bdemotagclip'],  [35, 36]),
    ('fin',   11.0, ['stage-fin'],                                [33]),
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
    tsrc = re.search(r'const T = (\{.*?\});', src, re.S).group(1)
    tbase = json.loads(re.sub(r'([A-Za-z_][A-Za-z0-9_]*)\s*:', r'"\1":', tsrc))
    # 시연 클립은 여럿이다 — id 를 소스에서 뽑아 쓴다(추가할 때 고칠 곳을 늘리지 않는다)
    video_ids = re.findall(r'<video[^>]*(?<![-\w])id="([^"]+)"', src)
    os.makedirs(OUTDIR, exist_ok=True)
    made = []
    for key, dur, clips, subs in CHAPTERS:
        s = src
        base = tbase[key]
        # 렌더러가 파킹(900초)된 비디오도 프레임 추출을 시도해 커버리지 게이트로
        # 렌더를 중단시키므로, 그 챕터에 속하지 않는 비디오는 태그 자체를 제거한다.
        for vid in video_ids:
            if vid in clips:
                continue
            s, n = re.subn(r'\s*<video[^>]*(?<![-\w])id="' + re.escape(vid) + r'"[^>]*></video>', '', s)
            assert n == 1, f'{key}: {vid} tag removal matched {n}'
        # 1) 챕터 상수 : 대상만 0, 나머지는 타임라인 밖으로
        newT = {k: (0 if k == key else 900) for k in tbase}
        s = re.sub(r'const T = \{.*?\};',
                   'const T = ' + json.dumps(newT).replace('"', '') + ';', s, flags=re.S)
        # 2) 클립 : 대상은 base 만큼 앞으로, 나머지는 900 으로
        for elid, st in starts.items():
            if elid == 'root':
                continue
            if elid in video_ids and elid not in clips:
                continue  # 태그를 제거했으므로 건너뜀
            m2 = re.fullmatch(r'subclip(\d+)', elid)
            if elid in clips or (m2 and int(m2.group(1)) in subs):
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
