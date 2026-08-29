#!/usr/bin/env python3
"""briefing.txt → 한 장짜리 한글 보고서(HWPX) → PNG.

templates/warroom-daily-template.hwpx 의 토큰 27개를 그날 브리핑으로 채운다.
rhwp 는 빈 문서에 글을 넣지 못하므로(replace-text/set-cell/fill-fields 는 모두
기존 내용을 고치는 것) 템플릿을 채우는 방식만 가능하다.

  python3 scripts/fill-warroom-report.py [--out-dir <폴더>]

산출물: <out-dir>/warroom-<날짜>.hwpx · .pdf · .png
환경변수 RHWP 로 실행 파일 경로를 바꿀 수 있다(기본 ~/.local/bin/rhwp).
"""
import argparse, json, os, re, subprocess, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from hwpx_builder import build   # noqa: E402  (DSL → HWPX)

WEB = Path(__file__).resolve().parent.parent
RHWP = os.environ.get("RHWP", str(Path.home() / ".local/bin/rhwp"))
TEMPLATE = WEB / "templates/warroom-daily-template.hwpx"
BRIEFING = WEB / "public/warroom/loop/briefing.txt"
BRIEF_JSON = WEB / "public/warroom/loop/briefing.json"
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


def shorten(nm, limit):
    """말끝이 잘려 뜻이 끊기지 않도록 구분자(·, 공백) 경계에서 자른다."""
    if len(nm) <= limit:
        return nm
    cut = nm[:limit]
    for sep in ("·", " "):
        i = cut.rfind(sep)
        if i >= limit // 2:
            return cut[:i].rstrip(" ·-—") + "…"
    return cut.rstrip(" ·-—") + "…"


def gate_names(limit=12):
    """관문 ID → 이름. 표 칸과 리스크 * 줄이 한 줄에 들어가야 하므로 줄여서 준다."""
    try:
        nodes = json.loads(MAPDATA.read_text())["nodes"]
    except Exception:
        return {}
    return {n["id"]: shorten(n["name"], limit) for n in nodes}


# ── 금액 한글화 (범피스 `한글화` 차용) ───────────────────────────────────────
# 「행정업무의 운영 및 혁신에 관한 규정 시행규칙」 제2조제2항:
#   문서에 금액을 표시할 때에는 아라비아 숫자로 쓰되 괄호 안에 한글로 적는다.
#   (예시) 금113,560원(금일십일만삼천오백육십원)
_D = "영일이삼사오육칠팔구"
_S4 = ["", "십", "백", "천"]
_U4 = ["", "만", "억", "조", "경"]


def han_num(n: int) -> str:
    """1234 -> 일천이백삼십사. 0 은 '영'."""
    if n == 0:
        return "영"
    s = str(n)
    groups = [s[max(0, len(s) - i - 4):len(s) - i] for i in range(0, len(s), 4)]
    out = []
    for gi, g in enumerate(groups):          # 아래 자리 그룹부터
        part = ""
        for i, ch in enumerate(reversed(g)):
            d = int(ch)
            if d:
                part = _D[d] + _S4[i] + part
        if part:
            out.append(part + _U4[gi])
    return "".join(reversed(out))


# 숫자만("113560원")과 한글 단위 혼용("22억원")을 모두 잡는다. 동향 보고에서는
# 22억원을 금2,200,000,000원으로 펴 쓰면 오히려 읽기 나쁘므로, 아라비아 숫자와
# 단위는 그대로 두고 괄호 안 한글만 붙인다.
_UNIT = {"조": 10**12, "억": 10**8, "만": 10**4}
_MONEY = re.compile(r"(?<![\d,금])(\d{1,3}(?:,\d{3})+|\d+)\s*([조억만])?\s*원(?![\w])")


def money_hangul(text: str) -> str:
    """금액을 시행규칙 제2조제2항 서식으로 바꾼다."""
    def sub(m):
        num, unit = m.group(1).replace(",", ""), m.group(2)
        n = int(num) * _UNIT.get(unit or "", 1)
        shown = f"{int(num):,}{unit or ''}"
        return f"금{shown}원(금{han_num(n)}원)"
    return _MONEY.sub(sub, text)


PIPE_MAX = 44   # ※ 줄(맑은고딕 12pt, 들여쓰기 4500)이 한 줄에 담기는 글자 수


def fit_pipe(text):
    """※ 수치 줄을 한 줄에 맞춘다. 모델이 길이를 지키지 않아도 뒤 항목부터 떨궈 맞춘다."""
    if not text:
        return ""
    # 쉼표+공백만 항목 구분으로 본다. "1,374" 같은 천 단위 쉼표를 쪼개면 안 된다.
    parts = [x.strip() for x in re.split(r",\s+|;\s*", text) if x.strip()]
    while parts and len("※ " + ", ".join(parts)) > PIPE_MAX:
        parts.pop()
    return "※ " + ", ".join(parts) if parts else ""


PROCS = WEB / "public/warroom/map/procedures.json"


def _graph():
    d = json.loads(MAPDATA.read_text())
    N = {n["id"]: n for n in d["nodes"]}
    hi, ho = {}, {}
    for e in d["edges"]:
        if e.get("strength") == "hard":
            hi.setdefault(e["to"], []).append(e["from"])
            ho.setdefault(e["from"], []).append(e["to"])
    return N, hi, ho


def _downstream(ho, g):
    """이 관문 뒤에 경성 의존으로 걸린 관문 수 — 지시 우선순위의 근거."""
    seen, st = set(), list(ho.get(g, []))
    while st:
        v = st.pop()
        if v in seen:
            continue
        seen.add(v)
        st += ho.get(v, [])
    return len(seen)


def directives(advances):
    """지시 후보를 뽑는다.

    고위공무원은 '어느 단계인지'까지만 알고 그 단계 '안'은 실무자 보고 없이는
    모른다. 그 격차를 메우는 게 목적이라, 관문이 아니라 **절차** 단위로 낸다.
      ① 오늘 기사가 끝났다고 말한 절차 → 그 제도의 다음 절차가 곧 지시 대상
      ② 선행이 모두 끝나 착수 가능한데 아직 시작 안 한 관문 → 첫 절차
    """
    try:
        byGate = json.loads(PROCS.read_text())["byGate"]
        N, hi, ho = _graph()
    except Exception:
        return []

    done = {(a.get("gate"), a.get("step")) for a in (advances or [])
            if a.get("verdict") == "일어남"}
    out, seen = [], set()

    # ① 진척이 확인된 절차의 '다음 절차'
    for gate, step in done:
        for inst in byGate.get(gate, []):
            steps = inst.get("steps") or []
            for i, st in enumerate(steps):
                if st["name"] == step and i + 1 < len(steps):
                    nxt = steps[i + 1]
                    out.append((gate, inst["name"], nxt, "직전 절차 완료 보도"))
                    seen.add(gate)

    # ② 착수 가능하나 미착수인 관문의 첫 절차
    ready = [g for g, n in N.items()
             if n["status"] in ("planned", "unknown")
             and all(N[p]["status"] == "completed" for p in hi.get(g, []))]
    # 뒤에 걸린 관문이 많을수록 먼저 — 지시는 파급 순으로 낸다
    for g in sorted(ready, key=lambda x: -_downstream(ho, x)):
        if g in seen:
            continue
        for inst in (byGate.get(g) or [])[:1]:
            steps = inst.get("steps") or []
            if steps:
                n = _downstream(ho, g)
                why = "착수 가능" + (f"·뒤 {n}개" if n else "")
                out.append((g, inst["name"], steps[0], why))
    return out


def to_dsl(b):
    """구조(JSON) → 한글 라인 DSL. 슬롯이 없으므로 항목 수 제한이 없다.

    LLM 에게 DSL 을 직접 시키지 않는 이유: 자유 텍스트는 형식이 계속 어긋난다
    (마크다운 혼입·서두·불릿 변형을 일곱 번 겪었다). 검증 가능한 JSON 을 받고
    DSL 은 코드가 만든다. 그러면 사람이 DSL 을 손으로 고쳐 다시 굽는 것도 된다.
    """
    gmap = gate_names()
    y, mo, d = b["date"].split("-")
    L = [f"제목: {b['title']}",
         f"부제: {y}. {int(mo)}. {int(d)}. · 언론·정책브리핑 신호 자동집계 기반",
         "네모: 주요 보도내용"]
    for r in b.get("reports", []):
        press = f"({r['press']}) " if r.get("press") else ""
        L.append(f"원: {press}{money_hangul(r['title'])}")
        if r.get("body"):
            L.append(f"바: {money_hangul(r['body'])}")

    L += ["엔터:", "네모: 분야별 절차 진행상황", "표: 분야: 진행상황: 관문"]
    for f in b.get("fields", []):
        gs = f.get("gates") or []
        gate = (f"{gs[0]} {gmap.get(gs[0], '')}".strip()
                + (f" 외 {len(gs)-1}" if len(gs) > 1 else "")) if gs else "-"
        L.append(f"표: {f['name']}: {f.get('status', '')}: {gate}")

    L += ["네모: 리스크·갈등"]
    for r in b.get("risks", [])[:2]:
        L.append(f"바: {money_hangul(r['text'])}")
        gs = r.get("gates") or []
        if gs:
            L.append(f"주석: ({gs[0]}) {gmap.get(gs[0], '')}".rstrip()
                     + (f" 외 {len(gs)-1}" if len(gs) > 1 else ""))

    L += ["엔터:", "네모: 지시 필요사항"]
    for gate, inst, st, why in directives(b.get("advances"))[:2]:
        # 주체가 "제안자(지자체·민간)" 처럼 괄호를 물고 있어 · 로 자르면 "제안자(지자체" 가 된다
        actor = re.sub(r"\s*\([^)]*\)", "", st.get("actor") or "").split("·")[0].strip() or "소관"
        # 절차명이 긴 것은 문장이 아니라 목록이라, 첫 마디만 쓰고 줄인다
        name = st["name"]
        if len(name) > 26:
            name = re.split(r"부터|까지", name)[0].strip().rstrip("·") + " 등"
        L.append(f"바: {actor}: {name}({gate})")
        # 불릿(*)은 DSL 이 붙인다 — 여기서 붙이면 키워드가 없어 '바'로 폴백한다
        # 조문은 "군 공항 이전 및 지원에 관한 특별법 제6조·제7조·제11조" 처럼 길어
        # 한 줄을 넘긴다. 법령명을 줄이고 조문은 첫 것만 남긴다.
        basis = re.sub(r"\s*\([^)]*\)", "", st.get("basis") or "").strip()
        basis = re.sub(r"\s*및 .*?에 관한", "", basis)
        basis = re.sub(r"에 관한 (법률|특별법|특별조치법)", r" \1", basis)
        m = re.match(r"(.+?)\s*(제\d+조(?:의\d+)?(?:제\d+항)?)", basis)
        if m:
            basis = f"{m.group(1).strip()} {m.group(2)}"
        bits = [why]
        if basis:
            bits.append(basis)
        if st.get("deadline"):
            bits.append(f"기한 {st['deadline']}")
        L.append("주석: " + " · ".join(bits)[:52])

    if b.get("pipeline"):
        # ※ 줄은 길이를 모델에 맡기지 않고 뒤 항목부터 떨궈 한 줄에 맞춘다
        pipe = fit_pipe(b["pipeline"]).removeprefix("※ ")
        if pipe:
            L.append(f"당구: {pipe}")
    return L


def build_tokens():
    """briefing.json(구조) 우선. 없으면 briefing.txt 파싱으로 물러난다.

    평문 파싱은 모델 출력 형식이 매번 달라 일곱 번 깨졌다(마크다운·영어 서두·
    불릿 붙은 ※·원문자 번호·관문 ID 위치). 그래서 생성기가 JSON 을 내도록 바꾸고
    여기서는 그것을 읽는다 — 평문 경로는 폴백으로만 남긴다.
    """
    if BRIEF_JSON.exists():
        return tokens_from_json(json.loads(BRIEF_JSON.read_text()))
    return tokens_from_text()


def tokens_from_json(b):
    gmap = gate_names()
    tok = {"TITLE": b["title"]}
    y, mo, d = b["date"].split("-")
    tok["SUBTITLE"] = f"{y}. {int(mo)}. {int(d)}. · 언론·정책브리핑 신호 자동집계 기반"

    for i in range(3):
        r = b["reports"][i] if i < len(b["reports"]) else {}
        press = f"({r['press']}) " if r.get("press") else ""
        tok[f"R{i+1}H"] = f"○ {press}{r['title']}" if r.get("title") else ""
        tok[f"R{i+1}B"] = f"- {r['body']}" if r.get("body") else ""

    by = {f["name"]: f for f in b.get("fields", [])}
    for i, name in enumerate(FIELDS, start=1):
        f = by.get(name, {})
        tok[f"S{i}"] = f.get("status") or "변동 없음"
        gs = f.get("gates") or []
        tok[f"G{i}"] = (f"{gs[0]} {gmap.get(gs[0], '')}".strip()
                        + (f" 외 {len(gs)-1}" if len(gs) > 1 else "")) if gs else "-"

    for i in range(3):
        r = b["risks"][i] if i < len(b.get("risks", [])) else {}
        tok[f"RK{i+1}"] = f"- {r['text']}" if r.get("text") else ""
        gs = r.get("gates") or []
        tok[f"RK{i+1}N"] = (f"* ({gs[0]}) {gmap.get(gs[0], '')}".strip()
                            + (f" 외 {len(gs)-1}" if len(gs) > 1 else "")) if gs else ""

    for i in range(2):
        acts = b.get("actions", [])
        tok[f"AC{i+1}"] = f"- {acts[i]}" if i < len(acts) else ""

    tok["PIPE"] = fit_pipe(b.get("pipeline") or "")
    return tok, b["date"]


def tokens_from_text():
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
        tok[f"R{i+1}H"] = f"○ {h}" if h else ""
        tok[f"R{i+1}B"] = f"- {b}" if b else ""

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
        names_map = gate_names()
        if uniq:
            g0 = uniq[0]
            tok[f"G{i}"] = f"{g0} {names_map.get(g0, '')}".strip() \
                           + (f" 외 {len(uniq)-1}" if len(uniq) > 1 else "")
        else:
            tok[f"G{i}"] = "-"
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

    gmap = gate_names()
    risks = bullets("리스크")
    for i in range(3):
        raw = risks[i] if i < len(risks) else ""
        gs, seen2 = [], set()
        for g in re.findall(r"N\d{2,}", raw):
            if g not in seen2:
                seen2.add(g)
                gs.append(g)
        body = re.sub(r"[(（]?\s*N\d{2,}(?:\s*[·,]\s*N\d{2,})*\s*[)）]?", "", raw)
        body = re.sub(r"\s{2,}", " ", body).strip(" :,·")
        tok[f"RK{i+1}"] = f"- {body}" if body else ""
        tok[f"RK{i+1}N"] = (f"* ({gs[0]}) {gmap.get(gs[0], '')}".strip()
                            + (f" 외 {len(gs)-1}" if len(gs) > 1 else "")) if gs else ""
    acts = bullets("조치")
    for i in range(2):
        tok[f"AC{i+1}"] = f"- {acts[i]}" if i < len(acts) else ""

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
    return tok, date


def run(*args):
    r = subprocess.run([RHWP, *args], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"rhwp {' '.join(args[:2])} 실패({r.returncode}): {r.stderr.strip()[:300]}")
    return r.stdout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out-dir", default=str(WEB / "public/warroom/loop"))
    ap.add_argument("--from-dsl", help="DSL 파일을 직접 굽는다(손으로 고친 뒤 재생성용)")
    a = ap.parse_args()
    out = Path(a.out_dir)
    out.mkdir(parents=True, exist_ok=True)

    if a.from_dsl:
        lines = Path(a.from_dsl).read_text().splitlines()
        date = "manual"
    else:
        if not BRIEF_JSON.exists():
            sys.exit(f"briefing.json 이 없다: {BRIEF_JSON}")
        b = json.loads(BRIEF_JSON.read_text())
        # 파싱·생성이 어긋나면 빈 보고서가 조용히 나가는 게 가장 나쁜 실패다
        for key in ("title", "date", "reports", "fields"):
            if not b.get(key):
                sys.exit(f"브리핑 구조에 {key} 가 없다 — 생성 실패로 보고 중단한다.")
        lines = to_dsl(b)
        date = b["date"]

    stem = f"warroom-{date}"
    dsl_path = out / f"{stem}.dsl.txt"
    dsl_path.write_text("\n".join(lines) + "\n")

    doc = out / f"{stem}.hwpx"
    build(lines, doc)

    pages = json.loads(run("export-text", str(doc), "--json"))["pages"]
    text = "\n".join(p["text"] for p in pages)
    if len(text.strip()) < 100:
        sys.exit("생성된 문서가 비어 있다 — 중단한다.")

    run("export-pdf", str(doc), "-o", str(out / f"{stem}.pdf"))
    subprocess.run(["pdftoppm", "-png", "-r", "150", "-f", "1", "-l", "1",
                    str(out / f"{stem}.pdf"), str(out / stem)], check=True)
    png = out / f"{stem}-1.png"
    if png.exists():
        png.replace(out / f"{stem}.png")

    info = json.loads(run("info", str(doc), "--json"))
    print(f"{stem}: {info['pageCount']}쪽 · DSL {len(lines)}줄")
    for ext in ("dsl.txt", "hwpx", "pdf", "png"):
        p = out / f"{stem}.{ext}"
        if p.exists():
            print(f"  {p} ({p.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
