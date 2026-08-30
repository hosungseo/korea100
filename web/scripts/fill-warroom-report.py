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
from hwpx_builder import build, TEXT_WIDTH   # noqa: E402  (DSL → HWPX)

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


# 한 줄에 담기는 폭 = (본문 폭 − 글이 시작하는 위치) ÷ 글자 한 칸.
# 여백·들여쓰기·내어쓰기를 고칠 때마다 상수를 다시 재는 대신 계산한다.
#   15pt 한 칸: 본문 폭 48,190·글 시작 3,750 에서 27 칸이 담긴 실측에서 역산
#   12pt 한 칸: 15pt 칸에 크기 비율을 곱한다. 12pt 를 따로 실측해 썼더니
#              폭 36 으로 잡혀 * 줄이 줄곧 두 줄로 흘렀다(실제 한계는 32 미만)
_U15 = (48190 - 3750) / 27
_U12 = _U15 * 12 / 15
# 내어쓰기를 넣은 뒤 글이 시작하는 위치(불릿 끝) — hwpx_builder 의 paraPr 과 같다
DIRECTIVE_W = (TEXT_WIDTH - 3750) / _U15    # ○
BODY_W = (TEXT_WIDTH - 4500) / _U15         # -
# 한 칸 여유 — 딱 맞추면 양쪽정렬이 자간을 벌리며 다음 줄로 흘린다
SMALL_W = (TEXT_WIDTH - 5700) / _U12 - 1    # *


def disp_w(s):
    """한글은 1, 영숫자·괄호는 0.5 로 세는 표시 폭. 글자 수로만 재면 어긋난다.

    ^ 는 위첨자 표시용 마크업이라 지면을 차지하지 않는다. 위첨자 자체는
    작게 그려지므로 절반으로 친다.
    """
    w, sup = 0.0, False
    for c in s:
        if c == "^":
            sup = not sup
            continue
        w += (0.5 if ord(c) < 0x1100 else 1) * (0.6 if sup else 1)
    return w



def fit(text, limit):
    """문장을 폭 안에 넣는다. 말줄임표는 쓰지 않는다.

    어절 경계에서 자르면 '…아직', '…남아' 처럼 말이 끊긴 채 끝난다.
    절(쉼표) 경계에서 먼저 끊고, 그래도 넘치면 어절로 물러선다.
    """
    if disp_w(text) <= limit:
        return text
    parts = text.split(", ")
    while len(parts) > 1:
        parts.pop()
        cut = ", ".join(parts)
        if disp_w(cut) <= limit:
            return cut
    out = ""
    for w in text.split(" "):
        if disp_w(out + " " + w) > limit:
            break
        out = f"{out} {w}" if out else w
    return out.rstrip(" ,·")


# 마지막 줄이 이 비율보다 짧으면 '어설프게 넘긴' 것으로 본다
STUB = 0.35


def lines_ok(text, width, max_lines):
    """줄 수 안에 들어가면서 마지막 줄이 토막이 아니면 True."""
    w = disp_w(text)
    if w > width * max_lines:
        return False
    n = -(-int(w * 100) // int(width * 100))
    return n <= 1 or w - width * (n - 1) >= width * STUB


def fit_bits(bits, width, max_lines=2):
    """' · ' 로 이어 붙인 부연 줄을 꼬리 없이 맞춘다.

    글자로 자르면 항목 중간이 끊기므로 뒤 항목째로 떨군다.
    """
    while len(bits) > 1 and not lines_ok(" · ".join(bits), width, max_lines):
        bits.pop()
    return " · ".join(bits)


def fit_lines(text, width, max_lines=2):
    """줄 수를 정해 놓고 꼬리가 어설프게 넘어가지 않게 맞춘다.

    한 줄에 두세 글자만 흘러넘긴 꼬리('…최종 부 / 지 확정 남음')는
    지면도 버리고 보기도 나쁘다. 그런 꼬리가 생기면 앞 줄까지로 줄인다.
    """
    w = disp_w(text)
    if w <= width:
        return text
    lines = min(max_lines, -(-int(w * 100) // int(width * 100)) or 1)
    for n in (lines, lines - 1):
        if n < 1:
            break
        cut = fit(text, width * n)
        rest = disp_w(cut) - width * (n - 1)
        # 마지막 줄이 토막이면 한 줄 줄여 다시 맞춘다
        if n == 1 or rest >= width * STUB:
            return cut
    return fit(text, width)


def shorten(nm, limit):
    """말끝이 잘려 뜻이 끊기지 않도록 구분자(·, 공백) 경계에서 자른다."""
    if len(nm) <= limit:
        return nm
    cut = nm[:limit]
    for sep in ("·", " "):
        i = cut.rfind(sep)
        if i >= limit // 2:
            return cut[:i].rstrip(" ·-—")
    return cut.rstrip(" ·-—")


def gate_names(limit=22):
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


def tidy(t):
    """보고서 문장은 마침표를 찍지 않고 말줄임표도 쓰지 않는다.

    말줄임표를 빈 문자열로 지우면 '개회…100일' 이 '개회100일' 로 붙는다.
    문장 중간이면 공백으로, 끝이면 그냥 떼어낸다.
    """
    t = re.sub(r"(…|\.\.\.)", " ", t or "")
    t = re.sub(r"\s{2,}", " ", t).strip()
    return t.rstrip(" .·")


# ※ 꼬리말(맑은고딕 12pt)이 한 줄에 담기는 글자 수. 본문 폭 42,520 기준 44 였고
# 지금은 들여쓰기 없이 왼쪽 끝에서 시작하므로 폭 변화만 반영해도 넉넉하다
PIPE_MAX = round(44 * TEXT_WIDTH / 42520)


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


SIGNALS = WEB / "public/warroom/map/signals.json"
LOOPDATA = WEB / "public/warroom/loop/data.json"


def reported_today():
    """오늘 기사가 붙은 관문 — 지시는 여기서 출발한다."""
    try:
        S = json.loads(SIGNALS.read_text())["byGate"]
        since = json.loads(LOOPDATA.read_text())["generatedAt"]
    except Exception:
        return set()
    return {g for g, arr in S.items() if any(a["pubDate"] >= since for a in arr)}


# 조치 필요사항은 총리가 각 부처에 무엇을 챙기게 할지를 적는 자리다.
# 그러므로 주체는 반드시 이름이 붙은 행정기관이어야 한다.
#   민간   — 총리의 지시가 닿지 않는다('사업시행자'가 40건으로 가장 많다.
#            '사업자'만 걸러서는 '사업시행자'가 통과한다)
#   총칭   — 누구인지 특정되지 않아 지시가 성립하지 않는다
NON_ACTOR = re.compile(
    r"주민|신청인|제안자|사업자|시행자|기업|이용자|소유주|발주자|입주|당사자"
    r"|영업자|취급자|투자가|인수자|시공")
GENERIC_ACTOR = re.compile(r"^(전문|심사|허가|조달|승인|운영|감독|담당|관계|소관|관할|해당|각급|주된|관련)")
NAMED_ADMIN = re.compile(r"(부|청|처|위원회|의회|특별시|광역시|자치시|자치도|도|시|군|구청|본부)$")


def actionable(actor):
    """총리가 이름을 불러 지시할 수 있는 상대인가."""
    return bool(actor) and not NON_ACTOR.search(actor) \
        and not GENERIC_ACTOR.match(actor) and not actor.endswith("행정청") \
        and bool(NAMED_ADMIN.search(actor))


def gate_leads():
    """관문 → 감독기관. 절차 주체가 민간이면 지시를 이쪽으로 돌린다.

    ministries 가 비어 있는 관문이 많아 lead, decision 까지 훑는다.
    decision 에는 '이전부지선정위원회'처럼 위원회 이름이 들어가므로 순위를 뒤에 둔다.
    """
    try:
        nodes = json.loads(MAPDATA.read_text())["nodes"]
    except Exception:
        return {}
    out = {}
    for n in nodes:
        cands = (n.get("ministries") or []) + (n.get("lead") or []) + (n.get("decision") or [])
        for c in cands:
            if c and not NON_ACTOR.search(c):
                out[n["id"]] = c
                break
    return out


# 중앙행정기관 이름. '관할 구청·도로관리청·발주청·총괄청'처럼 역할을 가리키는
# 총칭은 부처가 아니므로 뺀다 — 이걸 안 걸러내면 거의 모든 관문이 다부처가 된다
_ROLE = re.compile(r"관할|관리청|발주|승인|소관|지적|총괄|시공|감리")
_CENTRAL = re.compile(r"^(.{2,6}(?:부|청))$")


def short_basis(basis):
    """근거 조문을 한 줄에 맞게 줄인다. 법령명이 길고 조문이 여럿 붙는다."""
    b = re.sub(r"\s*\([^)]*\)", "", basis or "").strip()
    b = re.sub(r"\s*및 .*?에 관한", "", b)
    b = re.sub(r"에 관한 (법률|특별법|특별조치법)", r" \1", b)
    m = re.match(r"(.+?)\s*(제\d+조(?:의\d+)?(?:제\d+항)?)", b)
    return f"{m.group(1).strip()} {m.group(2)}" if m else b


def gate_basis():
    """관문 → 대표 근거 조문. 첫 절차의 basis 를 쓴다."""
    try:
        byGate = json.loads(PROCS.read_text())["byGate"]
    except Exception:
        return {}
    out = {}
    for g, insts in byGate.items():
        for inst in insts:
            for st in (inst.get("steps") or []):
                b = short_basis(st.get("basis"))
                if b:
                    out[g] = b
                    break
            if g in out:
                break
    return out


def gate_ministries():
    """관문 → 그 안 절차에 걸린 중앙부처 집합.

    관문 노드의 ministries 는 대부분 비어 있거나 '정부'·'관계 관리청' 같은
    총칭이라 쓸 수 없다. 절차 1,374개의 주체를 훑는 쪽이 실제에 가깝다.
    """
    try:
        byGate = json.loads(PROCS.read_text())["byGate"]
    except Exception:
        return {}
    out = {}
    for g, insts in byGate.items():
        s = []
        for inst in insts:
            for st in (inst.get("steps") or []):
                for part in re.split(r"[·,/]|\s+및\s+", st.get("actor") or ""):
                    part = re.sub(r"\(.*?\)", "", part).strip()
                    if _CENTRAL.match(part) and not _ROLE.search(part) and part not in s:
                        s.append(part)
        if s:
            out[g] = s
    return out


def josa(word, pair=("을", "를")):
    """받침에 따라 조사를 고른다. '공고를' / '등록을'."""
    if not word:
        return pair[1]
    ch = word[-1]
    if not ("가" <= ch <= "힣"):
        return pair[1]
    return pair[0] if (ord(ch) - 0xAC00) % 28 else pair[1]


def how_to(steps, ministries, n_after):
    """총리가 부처에 시키는 '추진 방식'을 만든다.

    절차를 안내하는 자리가 아니다. 실무는 부처가 안다. 총리가 더하는
    것은 '어떤 식으로 밀어붙이라'는 것 — 병행할지, 다른 부처와 함께
    할지, 앞당길지, 그리고 무엇을 얻기 위해서인지.
    """
    goal = (f"후속 관문 {n_after}개 일정을 확보할 것" if n_after
            else "지체 없이 마무리할 것")
    a = shorten(steps[0][0], 12)
    if len(steps) > 1:
        b = shorten(steps[1][0], 12)
        return f"{a}와 {b}{josa(b)} 병행 추진해 {goal}"
    if len(ministries) > 1:
        return f"{a}{josa(a)} {ministries[1]}와 공동으로 추진해 {goal}"
    return f"{a}{josa(a)} 조기 착수해 {goal}"


def next_step_pairs(gate, step_name):
    """다음 단계와 그 주체를 함께 돌려준다."""
    try:
        byGate = json.loads(PROCS.read_text())["byGate"]
    except Exception:
        return []
    for inst in byGate.get(gate, []):
        steps = inst.get("steps") or []
        names = [s["name"] for s in steps]
        if step_name not in names:
            continue
        head = os.path.commonprefix(names)
        if " " in head:
            head = head[:head.rindex(" ") + 1]
        if len(head) < 8:
            head = ""
        i = names.index(step_name)
        return [(s["name"][len(head):].strip(), s.get("actor") or "")
                for s in steps[i + 1:i + 3]]
    return []


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
    hot = reported_today()

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
    # ② 오늘 보도된 관문의 '다음 관문'. 고위직은 기사를 보고 지시하므로
    #    "뭔일인지 알아보라"보다 한 겹 깊게, 다음에 무엇이 오는지를 짚어 준다.
    nxt = []
    for g in hot:
        for v in ho.get(g, []):
            if N.get(v, {}).get("status") in ("planned", "unknown") and v not in seen:
                nxt.append((v, g))
    # 여러 부처가 걸린 관문을 먼저 — 부처 하나로 닫히는 일은 그 부처가 하지만
    # 사이에 걸친 일은 아무도 끝까지 안 챙겨 거기서 멈춘다
    gmin = gate_ministries()
    for v, src in sorted(set(nxt),
                         key=lambda x: (-len(gmin.get(x[0], [])), -_downstream(ho, x[0]))):
        if v in seen:
            continue
        for inst in (byGate.get(v) or [])[:1]:
            steps = inst.get("steps") or []
            if steps:
                out.append((v, inst["name"], steps[0], f"{src} 보도의 다음 관문"))
                seen.add(v)

    # ③ 그래도 모자라면 착수 가능한데 미착수인 관문 — 파급 순
    for g in sorted(ready, key=lambda x: (-len(gmin.get(x, [])), -_downstream(ho, x))):
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
        L.append(f"원: {press}{tidy(money_hangul(r['title']))}")
        if r.get("body"):
            # * 는 한 줄 부연이다 — 넘치면 절 경계에서 끊는다
            L.append(f"주석: {fit_lines(tidy(money_hangul(r['body'])), SMALL_W, 2)}")

    L.append("엔터:")
    L += ["네모: 리스크·갈등"]
    leads = gate_leads()
    gmin = gate_ministries()
    edges = json.loads(MAPDATA.read_text())["edges"]
    _, _, ho = _graph()          # 조치 필요사항의 '뒤에 걸린 관문 수'에 쓴다

    def mins_of(r):
        """이 리스크에 걸린 중앙부처. 기사에서 모델이 뽑은 것 + 절차 데이터."""
        out = list(r.get("ministries") or [])
        for g in (r.get("gates") or []):
            for m in gmin.get(g, []):
                if m not in out:
                    out.append(m)
        return out

    # 부처 하나로 닫히는 일은 그 부처가 처리한다. 여럿이 걸린 건은 사이에서
    # 멈추므로 국무조정실이 봐야 한다 — 그런 건을 위로 올린다.
    risks = sorted(b.get("risks", []), key=lambda r: -len(mins_of(r)))[:3]
    gbasis = gate_basis()
    for r in risks:
        # ○ 무슨 일이 났나(한 줄) / - 그 내용을 한 겹 더(두 줄까지)
        # / * 수치·관문·법령 같은 부연. 계층마다 성격이 다르다 —
        # 같은 말을 들여쓰기만 바꿔 반복하지 않는다.
        L.append(f"원: {tidy(money_hangul(r['text']))}")
        gs = r.get("gates") or []
        ms = mins_of(r)

        # - 구체 내용. 부처 간 물림이 있으면 그게 가장 구체적인 내용이다.
        detail = tidy(money_hangul(r.get("detail") or ""))
        if len(ms) > 1 and r.get("interlock"):
            # 물림은 이 보고서의 존재 이유라 잘려선 안 된다 — 앞에 두고
            # 뒤에 오는 배경 서술이 대신 깎이게 한다
            il = tidy(r["interlock"])
            detail = f"{il}, {detail}" if detail else il
        if detail:
            L.append(f"바: {fit_lines(detail, BODY_W, 2)}")

        # * 부연 — 관문·소관·근거 조문. 수치는 이미 위 두 줄에 들어간다.
        g = gs[0] if gs else None
        bits = []
        if g:
            more = f" 외 {len(gs)-1}" if len(gs) > 1 else ""
            bits.append(f"{gmap.get(g, '')}^({g}){more}^")
        if len(ms) > 1:
            bits.append("·".join(ms[:3]) + " 협의")
        elif ms:
            bits.append(ms[0])
        elif g and leads.get(g):
            bits.append(leads[g])
        if g and gbasis.get(g):
            bits.append(gbasis[g])
        if bits:
            L.append("주석: " + fit_bits(bits, SMALL_W, 2))

    L += ["엔터:", "네모: 조치 필요사항"]

    def resolve_actor(gate, st, ms):
        """총리가 이름을 불러 챙기게 할 상대를 정한다.

        주체가 "제안자(지자체·민간)" 처럼 괄호를 물고 있어 · 로 자르면
        "제안자(지자체" 가 된다. 주체 이름 자체에도 · 가 들어가므로
        ('선정·지원위원회') 여럿이 나열된 경우만 쉼표·슬래시로 끊는다.
        """
        if len(ms) > 1:              # 맞물린 부처를 함께 적어야 물림이 드러난다
            return "·".join(ms[:2])
        a = re.sub(r"\s*\([^)]*\)", "", st.get("actor") or "")
        a = re.split(r"[,/]|\s+및\s+", a)[0].strip()
        if actionable(a):
            return a
        # 민간·총칭에는 총리의 지시가 닿지 않는다 — 관장 기관으로 돌린다
        return leads.get(gate) or (ms[0] if ms else "소관기관")

    # 같은 부처가 연달아 나오면 총리 보고로서 읽을 값이 떨어진다.
    # 후보를 넉넉히 받아 한 기관당 하나씩만 올린다.
    picked, used = [], set()
    for cand in directives(b.get("advances"))[:12]:
        actor = resolve_actor(cand[0], cand[2], gmin.get(cand[0], []))
        if actor in used:
            continue
        used.add(actor)
        picked.append((actor, *cand))
        if len(picked) == 3:
            break

    for actor, gate, inst, st, why in picked:
        # 절차명이 긴 것은 문장이 아니라 목록이라, 첫 마디만 쓰고 줄인다
        name = st["name"]
        if len(name) > 26:
            name = re.split(r"부터|까지", name)[0].strip().rstrip("·") + " 등"
        ms = gmin.get(gate, [])

        # ○ 은 총리가 부처에 '무엇을 하게 할 것인가'다. 명시적 지시문은
        # 아니지만 무엇을 하라는 것인지는 남아야 하므로 동사형으로 맺는다.
        if len(ms) > 1:
            aspect = "부처 협의 상황 점검"
        elif "완료" in why:
            aspect = "착수 일정 확정"      # 직전 절차가 끝났다는 보도가 있었다
        elif "다음 관문" in why:
            aspect = "준비상황 점검"       # 아직 이 관문 차례가 오지 않았다
        else:
            aspect = "착수 여부 확인"      # 선행이 끝나 시작할 수 있는데 소식이 없다

        # ○ 는 한 줄이어야 한다. 주체와 관점어는 못 줄이므로 절차명을 깎는다.
        # 관문 표시는 아래 * 로 내렸다 — ○ 는 '누가 무엇을' 만 담는다
        name = tidy(name)
        room = DIRECTIVE_W - disp_w(f"{actor}: {aspect}") - 0.5   # 절차명 뒤 공백
        while name and disp_w(name) > room:
            name = shorten(name, len(name) - 1)
        L.append(f"원: {actor}: {name} {aspect}")

        # - 한 단 아래 실무에 내릴 지시. ○ 이 '무엇을 볼 것인가'라면
        #   여기는 '그러려면 무슨 일을 시켜야 하는가'다. 그 절차 다음에
        #   실제로 오는 단계를 짚어 준다.
        # 총리에게 보고하라는 말이 아니라 그 부처가 실제로 할 일을 적는다.
        # next_steps 는 아직 오지 않은 단계이므로 '착수' 가 맞는 말이다.
        nxt = next_step_pairs(gate, st["name"])
        n_after = _downstream(ho, gate)
        if nxt:
            # 지시문은 꼬리가 잘리면 뜻이 무너지므로 뒤를 자르는 대신
            # 단계를 하나로 줄여 문장을 통째로 남긴다.
            line = how_to(nxt, ms, n_after)
            if len(nxt) > 1 and not lines_ok(line, BODY_W, 2):
                line = how_to(nxt[:1], ms, n_after)
        else:
            # 그 절차가 제도의 마지막이라 다음 단계가 없다 — 그 절차 자체를
            # 어떻게 밀어붙일지를 적는다
            line = how_to([(shorten(name, 14), "")], ms, n_after)
        # 여기서 fit_lines 를 다시 걸지 않는다 — 지시문은 끝이 잘리면
        # 지시가 아니게 된다. 길이는 위에서 단계 수로 맞췄다.
        L.append(f"바: {line}")

        # * 부연 — 관문·근거 조문·부처 협의·기한
        # 부처 이름은 위 ○ 에 이미 나왔다 — 세 곳 이상 걸린 경우만 나머지를 덧붙인다
        bits = [f"{gmap.get(gate, '')}^({gate})^"]
        if len(ms) > 2:
            bits.append("·".join(ms[2:4]) + " 포함")
        if short_basis(st.get("basis")):
            bits.append(short_basis(st.get("basis")))
        if st.get("deadline"):
            bits.append(f"기한 {st['deadline']}")
        L.append("주석: " + fit_bits(bits, SMALL_W, 2))

    if b.get("pipeline"):
        # ※ 줄은 길이를 모델에 맡기지 않고 뒤 항목부터 떨궈 한 줄에 맞춘다
        pipe = fit_pipe(b["pipeline"]).removeprefix("※ ")
        if pipe:
            # 꼬리말은 들여쓰기 없이 왼쪽 끝에 — 앞 지시사항의 주석으로 안 읽히게
            L += ["엔터:", f"꼬리: {pipe}"]
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
