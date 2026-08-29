#!/usr/bin/env python3
"""briefing.txt → 한 장짜리 한글 보고서(HWPX) → PNG.

templates/warroom-daily-template.hwpx 의 토큰 27개를 그날 브리핑으로 채운다.
rhwp 는 빈 문서에 글을 넣지 못하므로(replace-text/set-cell/fill-fields 는 모두
기존 내용을 고치는 것) 템플릿을 채우는 방식만 가능하다.

  python3 scripts/fill-warroom-report.py [--out-dir <폴더>]

산출물: <out-dir>/warroom-<날짜>.hwpx · .pdf · .png
환경변수 RHWP 로 실행 파일 경로를 바꿀 수 있다(기본 ~/.local/bin/rhwp).
"""
import argparse, json, os, re, shutil, subprocess, sys
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent
RHWP = os.environ.get("RHWP", str(Path.home() / ".local/bin/rhwp"))
TEMPLATE = WEB / "templates/warroom-daily-template.hwpx"
BRIEFING = WEB / "public/warroom/loop/briefing.txt"
MAPDATA = WEB / "public/warroom/map/data.json"
LOOP_URL = "hosungseo.github.io/korea100/warroom/loop/"
FIELDS = ["군공항", "산단·인허가", "전력", "용수", "건축·가동"]


MD = re.compile(r"\*\*|__|`|^#+\s*")
CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩"


def strip_md(s):
    """모델이 이따금 마크다운 강조를 섞어 낸다 — 파싱 전에 벗긴다."""
    return MD.sub("", s).strip()


def parse(text):
    """■ 소제목으로 끊어 섹션별 줄 목록을 만든다."""
    sec, cur = {}, None
    for raw in text.splitlines():
        line = strip_md(raw.strip())
        if not line:
            continue
        if line.startswith("■"):
            cur = re.sub(r"^■\s*", "", line)
            cur = re.sub(r"\s*\(.*\)$", "", cur)   # "(우리 판정)" 같은 꼬리표 제거
            sec[cur] = []
        elif cur:
            sec[cur].append(line)
    # 제목 줄은 첫 줄이 아닐 수 있다(모델 서두). 📡 또는 (YYYY-MM-DD) 패턴으로 찾는다
    head = ""
    for raw in text.splitlines():
        line = strip_md(raw.strip())
        if line.startswith("📡") or re.search(r"\(\d{4}-\d{2}-\d{2}\)\s*$", line):
            head = line
            break
    if not head:
        head = strip_md(text.splitlines()[0].strip())
    return head, sec


def pick(sec, *names):
    for n in names:
        for k, v in sec.items():
            if k.startswith(n):
                return v
    return []


def gate_names():
    """관문 ID → 이름. * 용어 풀이 줄에 쓴다."""
    try:
        nodes = json.loads(MAPDATA.read_text())["nodes"]
        return {n["id"]: n["name"] for n in nodes}
    except Exception:
        return {}


def build_tokens():
    head, sec = parse(BRIEFING.read_text())
    tok = {}

    m = re.match(r"[^\w가-힣]*(.+?)\s*\((\d{4}-\d{2}-\d{2})\)\s*$", head)
    title, date = (m.group(1), m.group(2)) if m else (head, "")
    y, mo, d = (date.split("-") + ["", "", ""])[:3] if date else ("", "", "")
    tok["TITLE"] = title
    tok["SUBTITLE"] = (f"{y}. {int(mo)}. {int(d)}. · 언론·정책브리핑 신호 자동집계 기반"
                       if date else "언론·정책브리핑 신호 자동집계 기반")

    # 주요 보도내용 — "–" 로 시작하면 내용, 아니면 제목
    reports, cur = [], None
    for line in pick(sec, "주요 보도내용"):
        if line.startswith(("–", "-", "‑")):
            if cur:
                cur[1] = re.sub(r"^[–\-‑]\s*", "", line)
                reports.append(cur)
                cur = None
        else:
            cur = [re.sub(r"^[0-9]+[)\.]\s*|^[▸▷·]\s*|^[" + CIRCLED + r"]\s*", "", line), ""]
    if cur:
        reports.append(cur)
    for i in range(3):
        h, b = reports[i] if i < len(reports) else ("", "")
        tok[f"R{i+1}H"] = f"ㅇ {h}" if h else ""
        tok[f"R{i+1}B"] = f"– {b}" if b else ""

    # 분야별 절차 진행상황 — "분야: 내용" 을 표 5행에 맞춘다. 관문 ID 는 별도 열로 뺀다
    # 관문 ID 는 "군공항(N31·N32): …" 처럼 분야명 쪽에 붙기도 하고 서술 쪽에 붙기도 한다.
    # 어느 쪽이든 줄 전체에서 걷고, 분야명에서는 괄호를 떼어 대조한다.
    by_field = {}
    for line in pick(sec, "분야별 절차", "트랙별"):
        m = re.match(r"^[–\-‑]\s*([^:：]+)[:：]\s*(.+)$", line)
        if m:
            label = re.sub(r"\s*\([^)]*\)\s*", "", m.group(1)).strip()
            by_field[label] = (m.group(2).strip(), line)
    for i, f in enumerate(FIELDS, start=1):
        body, line = next((v for k, v in by_field.items() if k.startswith(f[:2])), ("", ""))
        gates = re.findall(r"N\d{2,}", line)
        seen, uniq = set(), []
        for g in gates:
            if g not in seen:
                seen.add(g)
                uniq.append(g)
        tok[f"G{i}"] = ("·".join(uniq[:4]) + ("…" if len(uniq) > 4 else "")) if uniq else "–"
        # 관문 ID 는 옆 칸으로 옮겼으므로 본문에서는 지운다
        txt = re.sub(r"\(?\s*N\d{2,}(?:\s*[·,]\s*N\d{2,})*\s*\)?", "", body)
        tok[f"S{i}"] = re.sub(r"\s{2,}", " ", txt).strip(" ,·") or "특이사항 없음"

    def bullets(*names):
        """불릿 줄만 추린다. ※ 줄은 별도(PIPE)라 제외 — 모델이 '– ※ …' 로 낼 때가 있다."""
        out = []
        for x in pick(sec, *names):
            body = re.sub(r"^[–\-‑]\s*", "", x)
            if body.startswith("※") or body.startswith("*"):
                continue
            if x.startswith(("–", "-", "‑")):
                out.append(body)
        return out

    for key, names in (("RK", ("리스크",)), ("AC", ("조치",))):
        lines = bullets(*names)
        for i in range(3):
            tok[f"{key}{i+1}"] = f"– {lines[i]}" if i < len(lines) else ""

    # ※ 줄은 어느 섹션에 있든, 앞에 불릿이 붙어 있든 찾는다
    pipe = ""
    for lines in sec.values():
        for x in lines:
            body = re.sub(r"^[–\-‑]\s*", "", x)
            if body.startswith("※"):
                pipe = body
                break
        if pipe:
            break
    tok["PIPE"] = pipe

    # ▲ 상세 · * 용어 풀이
    tok["TDETAIL"] = "▲ 근거 기사·절차 체인은 워룸 루프 상황판 참조"
    names = gate_names()
    used, seen = [], set()
    for g in re.findall(r"N\d{2,}", BRIEFING.read_text()):
        if g not in seen and g in names:
            seen.add(g)
            used.append(f"{g} {names[g]}")
    tok["NOTE"] = ("* 관문: " + ", ".join(used[:2]) + (" 등" if len(used) > 2 else "")
                   ) if used else ""
    return tok, date


def run(*args):
    r = subprocess.run([RHWP, *args], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"rhwp {' '.join(args[:2])} 실패({r.returncode}): {r.stderr.strip()[:300]}")
    return r.stdout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out-dir", default=str(WEB / "public/warroom/loop"))
    a = ap.parse_args()
    out = Path(a.out_dir)
    out.mkdir(parents=True, exist_ok=True)

    tok, date = build_tokens()
    # 파싱이 어긋나면(마크다운 혼입·소제목 변경 등) 빈 보고서가 조용히 나간다.
    # 매일 도는 자동화에서 가장 나쁜 실패라, 핵심 토큰이 비면 여기서 멈춘다.
    must = ["TITLE", "R1H", "R1B", "S1", "RK1", "AC1", "PIPE"]
    empty = [k for k in must if not tok.get(k)]
    if empty:
        sys.exit(f"브리핑 파싱 실패 — 빈 항목 {empty}. briefing.txt 형식을 확인하라.")
    filled = sum(1 for v in tok.values() if v)
    if filled < len(tok) * 0.6:
        sys.exit(f"채워진 토큰이 {filled}/{len(tok)}뿐 — 형식이 어긋난 것으로 보고 중단한다.")

    stem = f"warroom-{date or 'latest'}"
    doc = out / f"{stem}.hwpx"
    shutil.copy(TEMPLATE, doc)

    # 토큰은 문서에 하나씩만 있으므로 순차 치환으로 충분하다.
    # 치환 후 재독 대조는 아래 leftover 검사가 담당한다(rhwp 매뉴얼의 overflow·재독 규칙).
    tmp = out / f"{stem}.tmp.hwpx"
    for k, v in tok.items():
        run("edit", "replace-text", str(doc), "--find", "{{%s}}" % k,
            "--replace", v, "-o", str(tmp), "--json")
        tmp.replace(doc)

    # 재독 대조 — 쪽 전체를 본다(1쪽만 보면 넘친 쪽의 미치환을 놓친다)
    pages = json.loads(run("export-text", str(doc), "--json"))["pages"]
    txt = "\n".join(p["text"] for p in pages)
    leftover = sorted(set(re.findall(r"\{\{[A-Z0-9_]+\}\}", txt)))
    if leftover:
        sys.exit(f"치환되지 않은 토큰: {leftover}")

    run("export-pdf", str(doc), "-o", str(out / f"{stem}.pdf"))
    subprocess.run(["pdftoppm", "-png", "-r", "150", "-f", "1", "-l", "1",
                    str(out / f"{stem}.pdf"), str(out / stem)], check=True)
    png = out / f"{stem}-1.png"
    if png.exists():
        png.replace(out / f"{stem}.png")

    info = json.loads(run("info", str(doc), "--json"))
    print(f"{stem}: {info['pageCount']}쪽 · 토큰 {len(tok)}개 치환")
    for ext in ("hwpx", "pdf", "png"):
        p = out / f"{stem}.{ext}"
        print(f"  {p} ({p.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
