#!/usr/bin/env python3
"""briefing.txt → 한 장짜리 한글 보고서(HWPX) → PNG.

templates/warroom-daily-template.hwpx 의 토큰 27개를 그날 브리핑으로 채운다.
rhwp 는 빈 문서에 글을 넣지 못하므로(replace-text/set-cell/fill-fields 는 모두
기존 내용을 고치는 것) 템플릿을 채우는 방식만 가능하다.

  python3 scripts/fill-warroom-report.py [--out-dir <폴더>]

산출물: <out-dir>/warroom-<날짜>.hwpx · .pdf · .png
환경변수 RHWP 로 실행 파일 경로를 바꿀 수 있다(기본 ~/.local/bin/rhwp).
"""
import argparse, datetime as _dt, json, os, re, subprocess, sys
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
NO_REFINE = False    # --no-refine: 실무 지시 다듬기(claude -p)를 건너뛴다


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


# 잘린 문장이 이런 어절로 끝나면 말이 끊긴 것이다("…맞물린 구간으로",
# "…확정이 남은"). 명사로 끝나는 어절까지 물러서서 개조식으로 맺는다.
_DANGLING = re.compile(
    r"(으로|에서|부터|까지|하고|하며|이며|라는|하는|되는|있는|없는"
    r"|위한|대한|통한|따른|남은)$")


def finish_noun(cut, full):
    """절단된 문장의 꼬리를 명사형으로 맺는다. 안 잘린 문장은 안 건드린다."""
    if cut == full:
        return cut
    words = cut.split(" ")
    for _ in range(2):
        if len(words) > 1 and _DANGLING.search(words[-1]):
            words.pop()
        else:
            break
    # 남은 꼬리가 '확정이'처럼 조사 한 글자면 떼어 명사로 맺는다.
    # '결과·진입로'류 명사를 다치지 않게 주격·목적격 등만, 세 글자부터.
    if words and len(words[-1]) >= 3 and words[-1][-1] in "이가을를은는와":
        words[-1] = words[-1][:-1]
    return " ".join(words).rstrip(" ,·")


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
# 백테스트(2026-08): "13~18원"·"최대 18원"까지 갖은자로 바꿔 1면 제목을
# 훼손했다 — 범위 표기(~· 뒤)와 소액은 계약 금액이 아니라 제외한다.
_UNIT = {"조": 10**12, "억": 10**8, "만": 10**4}
_MONEY = re.compile(r"(?<![\d,금~\-–—])(\d{1,3}(?:,\d{3})+|\d+)\s*([조억만])?\s*원(?![\w])")


def money_hangul(text: str) -> str:
    """금액을 시행규칙 제2조제2항 서식으로 바꾼다."""
    def sub(m):
        num, unit = m.group(1).replace(",", ""), m.group(2)
        n = int(num) * _UNIT.get(unit or "", 1)
        if n < 10000:                  # 요금·단가류 소액은 병기 대상이 아니다
            return m.group(0)
        shown = f"{int(num):,}{unit or ''}"
        return f"금{shown}원(금{han_num(n)}원)"
    return _MONEY.sub(sub, text)


# ── 부처명 정규화 ────────────────────────────────────────────────────────
# 절차 데이터는 개편 전 직제(산업통상자원부·기획재정부·환경부)로 남아 있고
# 기사 세계는 개편 후(산업통상부·기획예산처·기후에너지환경부)다. 한 문서에
# 두 이름이 섞이거나(산업통상부/산업통상자원부) 같은 부처가 협의 상대로
# 병렬되는 사고(기후에너지환경부·환경부 협의)가 백테스트에서 반복됐다.
_MIN_RENAME = [("산업통상자원부", "산업통상부"),
               ("기획재정부", "기획예산처"), ("기재부", "기획예산처")]


def normalize_ministries(s):
    for old, new in _MIN_RENAME:
        s = s.replace(old, new)
    # '기후에너지환경부' 안의 '환경부'를 다시 바꾸지 않도록 앞말을 본다
    s = re.sub(r"(?<!에너지)환경부", "기후에너지환경부", s)
    # 정규화로 같아진 이름이 ·로 병렬되면 하나로 줄인다
    s = re.sub(r"([가-힣]{2,10}(?:부|처|청))·\1", r"\1", s)
    return s


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


def _attention():
    """관문 → 관심층(온톨로지 attentionView 계산). 없으면 빈 dict.

    지도가 data.json 에 실어 둔 것을 읽기만 한다. 여기서 다시 계산하지 않는다 —
    보고서와 지도가 다른 숫자를 말하는 길을 만들지 않으려는 것이다.
    """
    try:
        d = json.loads(MAPDATA.read_text())
    except Exception:
        return {}
    # openness 는 노드의 최상위 필드고 attention 은 그 위에 얹힌 층이다. 여기서 합쳐 준다.
    return {n["id"]: {**n["attention"], "openness": n.get("openness")}
            for n in d["nodes"] if n.get("attention")}


# 총리가 풀 수 있는 것부터. 지도 브리핑과 같은 순서를 쓴다.
ATT_RANK = {
    "cross_ministry_wait": 0,     # 다른 부처 손에 있어 총리가 풀어야 도는 선
    "exclusive_branch_gate": 1,   # 사업이 정해야 열리는 갈림길
    "central_decision": 2,        # 총리 테이블 결정
    "policy_or_governance": 3,
    "high_leverage_open": 4,
}
ATT_KO = {
    "cross_ministry_wait": "다부처 물림",
    "exclusive_branch_gate": "미확정 갈림길",
    "central_decision": "총리 테이블",
    "policy_or_governance": "정책·거버넌스",
    "high_leverage_open": "고지렛대",
}


def att_priority(att):
    """관심층 → (층, 최상위 사유 순위). 낮을수록 먼저."""
    if not att:
        return (2, 9)
    tier = 0 if att.get("tier") == "cabinet" else 1
    codes = [r["code"] for r in att.get("reasons", []) if r.get("tier") == att.get("tier")]
    best = min((ATT_RANK.get(c, 8) for c in codes), default=8)
    return (tier, best)


def att_why(att):
    """지시의 '왜'에 온톨로지가 준 사유를 적는다. 없으면 None."""
    if not att or att.get("tier") != "cabinet":
        return None
    codes = [r["code"] for r in att.get("reasons", []) if r.get("tier") == "cabinet"]
    codes.sort(key=lambda c: ATT_RANK.get(c, 8))
    return ATT_KO.get(codes[0]) if codes else None


SIGNALS = WEB / "public/warroom/map/signals.json"
LOOPDATA = WEB / "public/warroom/loop/data.json"

# ── 지시 이력 ────────────────────────────────────────────────────────────
# 백테스트 20일에서 같은 ○줄이 18일 나갔다. 지시 선별이 결정론이라 관문
# 상태가 안 변하면 순위가 고정되기 때문 — 어제 나간 지시를 기억해 뒤로
# 미루고, 그래도 나가면 '이행 점검'으로 관점을 올린다.
HISTORY = WEB / "public/warroom/loop/directive-history.json"
_PICKED_GATES = []


def _load_history():
    try:
        return json.loads(HISTORY.read_text())
    except Exception:
        return {}


def _streak(hist, gate, today):
    """직전 보고에도 나간 지시인가. 주말을 낀 하루(4일 이내)면 연속으로 본다."""
    h = hist.get(gate)
    if not h:
        return 0
    try:
        gap = (_dt.date.fromisoformat(today) - _dt.date.fromisoformat(h["last"])).days
    except Exception:
        return 0
    return h.get("streak", 0) if 0 < gap <= 4 else 0


def update_history(day):
    """보고가 실제로 구워진 뒤에만 부른다 — 실패한 시도를 이력으로 치지 않는다."""
    hist = _load_history()
    for g in _PICKED_GATES:
        hist[g] = {"streak": _streak(hist, g, day) + 1, "last": day}
    keep = {}
    for g, h in hist.items():
        try:
            if (_dt.date.fromisoformat(day) - _dt.date.fromisoformat(h["last"])).days <= 14:
                keep[g] = h
        except Exception:
            pass
    HISTORY.write_text(json.dumps(keep, ensure_ascii=False, indent=1) + "\n")


def reported_today():
    """오늘 기사가 붙은 관문 — 지시는 여기서 출발한다."""
    try:
        S = json.loads(SIGNALS.read_text())["byGate"]
        # 기준일 — 브리핑 생성기(BRIEF_SINCE)와 같은 규칙으로 맞춘다
        since = os.environ.get("BRIEF_SINCE") \
            or json.loads(LOOPDATA.read_text())["generatedAt"]
    except Exception:
        return set()
    return {g for g, arr in S.items() if any(a["pubDate"] >= since for a in arr)}


# 조치 필요사항은 총리가 각 부처에 무엇을 챙기게 할지를 적는 자리다.
# 그러므로 주체는 반드시 이름이 붙은 행정기관이어야 한다.
#   민간   — 총리의 지시가 닿지 않는다('사업시행자'가 40건으로 가장 많다.
#            '사업자'만 걸러서는 '사업시행자'가 통과한다)
#   총칭   — 누구인지 특정되지 않아 지시가 성립하지 않는다
NON_ACTOR = re.compile(
    r"주민|신청인|제안자|사업자|시행자|기업|이용자|소유주|건축주|발주자|입주|당사자"
    r"|영업자|취급자|투자가|인수자|시공")
GENERIC_ACTOR = re.compile(r"^(전문|심사|허가|조달|승인|운영|감독|담당|관계|소관|관할|해당|각급|주된|관련|주무)")
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


def follow_task(ho, gate, limit=13):
    """바로 뒤에 걸린 관문의 첫 절차 — 지금 준비해 둬야 할 구체 후속조치.

    '후속 관문 15개' 는 규모일 뿐 무엇을 준비하라는 말이 아니다.
    다음에 실제로 벌어질 일의 이름을 대야 지시가 된다.
    """
    outs = ho.get(gate) or []
    if not outs:
        return None
    try:
        byGate = json.loads(PROCS.read_text())["byGate"]
    except Exception:
        return None
    # 여럿이면 파급이 큰 쪽 — 거기가 막히면 뒤가 다 밀린다
    for t in sorted(outs, key=lambda x: -_downstream(ho, x)):
        for inst in byGate.get(t, [])[:1]:
            steps = inst.get("steps") or []
            if steps:
                # "A부터 B까지 …" 형태는 첫 마디만 쓴다
                nm = re.split(r"부터|까지", steps[0]["name"])[0].strip()
                # 어절 중간 절단('기부 대 양여'→'기부 대')을 막는다 —
                # · 목록은 담기는 데까지 통째로, 아니면 기존 절단
                acc = ""
                for seg in nm.split("·"):
                    cand = f"{acc}·{seg}" if acc else seg
                    if len(cand) > limit:
                        break
                    acc = cand
                return (acc or shorten(nm, limit)), t
    return None


def how_to(steps, ministries, follow):
    """총리가 부처에 시키는 '추진 방식'을 만든다.

    절차를 안내하는 자리가 아니다. 실무는 부처가 안다. 총리가 더하는
    것은 '어떤 식으로 밀어붙이라'는 것 — 병행할지, 다른 부처와 함께
    할지, 앞당길지, 그리고 무엇을 준비해 두라는 것인지.
    """
    if follow:
        task, tgate = follow
        goal = f"{task}^({tgate})^ 준비를 갖출 것"
    else:
        goal = "지체 없이 마무리할 것"
    # 12자로 자르면 '지자체·사업자 사전 협의'가 '사전'에서 끊겨 '사전과'가 된다.
    # 길이는 아래 lines_ok 검증이 단계 수로 조절하므로 여기서는 넉넉히 남긴다.
    a = shorten(steps[0][0], 16)
    if len(steps) > 1:
        b = shorten(steps[1][0], 16)
        return f"{a}{josa(a, ('과', '와'))} {b}{josa(b)} 병행 추진해 {goal}"
    if len(ministries) > 1:
        return f"{a}{josa(a)} {ministries[1]}와 공동으로 추진해 {goal}"
    return f"{a}{josa(a)} 조기 착수해 {goal}"


# 실무 지시(-)를 굳이 모델에 맡기는 이유: how_to 의 기계 조립은 안전하지만
# 세 건이 같은 틀("…을 병행 추진해 … 준비를 갖출 것")로 나와 지시가 아니라
# 절차 안내처럼 읽힌다. ○ 과의 층위 차이는 문형이 아니라 구체성에서 나온다 —
# 사안마다 '무엇을 어떻게'가 달라야 한다. 지어내기는 기계 검증으로 막는다.
# 240초는 짧았다 — 2026-08-31 정기 실행에서 타임아웃으로 지시문 다듬기가 통째
# 생략되고 기계 템플릿('준비를 갖출 것' 3연발)이 그대로 나갔다. 아침 배치는
# 수집·판별과 겹쳐 돌아 응답이 느려진다.
REFINE_TIMEOUT = 420
_REFINE_CACHE = {}       # 압축 재생성 때 같은 claude 호출을 반복하지 않는다


def refine_directives(items, brief, gmap):
    """- 줄을 모델이 사안별로 쓰게 한다. 항목별 결과, 실패 항목은 None.

    검증 세 가지 — 하나라도 어긋나면 그 항목만 how_to 폴백:
      ① 후속절차(follow.task)가 문장에 그대로 있어야 한다(관문 표시를 코드가 단다)
      ② 절차 데이터에 있는 부처명이 이 항목 맥락에 없는데 등장하면 지어낸 것
      ③ 두 줄 폭을 넘으면 지시문 꼬리가 잘린다
    """
    data = []
    for it in items:
        d = {"circle": f"{it['actor']}: {it['name']} {it['aspect']}",
             "why": it["why"],
             "gate": it["gate"], "gateName": gmap.get(it["gate"], ""),
             "steps": [{"name": n, "actor": a, **({"deadline": dl} if dl else {})}
                       for n, a, dl in it["nxt"]]
                      or [{"name": it["name"], "actor": it["actor"]}],
             "ministries": it["ms"]}
        if it["follow"]:
            d["follow"] = {"task": it["follow"][0], "gate": it["follow"][1],
                           "gateName": gmap.get(it["follow"][1], "")}
        data.append(d)
    ctx = {"items": data,
           "reports": [r.get("title") for r in brief.get("reports", [])],
           "risks": [{"text": r.get("text"), "detail": r.get("detail"),
                      "gates": r.get("gates")} for r in brief.get("risks", [])]}
    cache_key = tuple(d["circle"] for d in data)
    if cache_key in _REFINE_CACHE:
        return _REFINE_CACHE[cache_key]
    prompt = (
        "너는 광주 군공항 이전·반도체 클러스터 상황실의 수석 보좌관이다.\n"
        "일일 동향 보고 '조치 필요사항'의 각 항목은 두 단이다:\n"
        "  ○ (데이터의 circle) — 총리가 부처에 무엇을 챙기게 할 것인가\n"
        "  - — 그 부처 실무진에 내려갈 구체 지시. 네가 쓸 것은 이 - 줄이다.\n"
        "○ 이 '무엇을 볼 것인가'라면 - 는 '그러려면 지금 무슨 일을 어떻게 하라'다.\n"
        "항목마다 steps(그 관문에서 다음에 올 절차)·follow(그 뒤 관문의 첫 절차)와 "
        "오늘 보도(reports)·리스크(risks)만 근거로 쓴다.\n"
        "지시에 반드시 담을 것:\n"
        "  ① 무엇을 — steps 중 지금 밟아야 할 절차를 특정한다(뭉뚱그리지 말 것)\n"
        "  ② 어떻게 — 오늘 상황에 맞는 추진 방식. 무엇과 병행할지, 누구와 함께할지, "
        "무엇부터 먼저 할지, 기한이 있으면 언제까지인지 중 사안에 맞는 것\n"
        "  ③ follow.task 가 있으면 그 문자열을 한 글자도 바꾸지 말고 문장에 넣는다 "
        "— 다음 관문 준비까지 잇는 지시임을 보이는 자리다\n"
        "지시의 주어는 수신자(○의 부처)다:\n"
        "  · 수신자 자신의 이름을 문장에 다시 쓰지 말 것 — '국방부와 합동으로' 같은 "
        "자기협의 지시가 대표 실패다\n"
        "  · 신청·공사의 주체가 기업·사업시행자인 절차는 부처가 대신 하는 게 아니라 "
        "부처가 할 일(접수·기한 관리·협의 회신·목록 확정)로 바꿔 쓴다\n"
        "  · 한 항목은 한 절차 사슬만 — 인과를 말할 수 없는 두 행동을 '~해 ~할 것'으로 "
        "묶지 말고, 그날 기사 소재는 실제 연결이 있을 때만 넣는다(억지 접합 금지)\n"
        "  · 위 risks 의 판단과 모순되는 지시 금지(예: 용수 지연 리스크인데 공사를 앞당기라)\n"
        "금지: ①데이터에 없는 기관·수치·날짜·절차 지어내기 ②'검토·노력·만전' 같은 "
        "빈말 ③'보고할 것'(부처가 총리에게 보고하는 게 아니라 부처가 할 일을 쓴다) "
        "④세 항목을 같은 문형·같은 종결로 쓰는 것 — '준비를 갖출 것' 반복이 대표 실패다.\n"
        "종결은 '~할 것'. 길이는 공백 포함 36~48자.\n"
        '출력은 JSON 하나만, 코드블록·설명 금지: {"lines":["항목 순서대로 - 줄", ...]}\n'
        "데이터:\n" + json.dumps(ctx, ensure_ascii=False))
    try:
        r = subprocess.run(["claude", "-p", prompt], capture_output=True,
                           text=True, timeout=REFINE_TIMEOUT)
        m = re.search(r"\{[\s\S]*\}", r.stdout)
        lines = json.loads(m.group(0))["lines"]
        if not isinstance(lines, list):
            raise ValueError("lines 가 배열이 아님")
    except Exception as e:
        print(f"  지시문 다듬기 생략({type(e).__name__}: {e}) — 기계 조립 사용",
              file=sys.stderr)
        _REFINE_CACHE[cache_key] = [None] * len(items)
        return _REFINE_CACHE[cache_key]

    # ── 기계 검증 — 어긋나면 '사유'와 함께 탈락시킨다 ──
    VAGUE = ("걸 것", "같이 잡고", "나란히 붙")
    universe = {m for ms in gate_ministries().values() for m in ms}

    def check(it, raw):
        """지시문 한 줄 검증. (정제된 줄, None) 또는 (None, 탈락 사유)."""
        line = tidy(raw) if isinstance(raw, str) else ""
        line = re.sub(r"^[-–·•]\s*", "", line)   # 재작성 때 불릿을 붙여 오기도 한다
        if not line:
            return None, "빈 문장"
        if not line.endswith("것") or line.endswith("보고할 것"):
            return None, "종결은 '~할 것', '보고할 것'은 금지"
        if any(v in line for v in VAGUE):
            return None, "뜻이 결정되지 않는 술어('걸 것'·'같이 잡고' 류)"
        # 수신자가 자기 이름을 다시 부르면 자기협의 지시다("국방부와 합동으로")
        if any(tok and len(tok) >= 3 and tok in line
               for tok in it["actor"].split("·")):
            return None, "수신자 자기 호명 — 수신자를 주어로 두고 이름을 빼라"
        if it["follow"]:
            task, tg = it["follow"]
            if task not in line:
                return None, f"후속절차 '{task}' 문자열이 그대로 들어가야 함"
            line = line.replace(task, f"{task}^({tg})^", 1)
        # 이 항목 맥락(주체·부처·다음 절차 주체·후속절차)에 없는 부처가 나오면 창작이다
        allowed = " ".join([it["actor"], *it["ms"],
                            *(a for _n, a, _d in it["nxt"]),
                            it["follow"][0] if it["follow"] else ""])
        wrong = [u for u in universe if u in line and u not in allowed]
        if wrong:
            return None, f"데이터에 없는 부처명({wrong[0]})"
        if not lines_ok(line, BODY_W, 2):
            return None, "두 줄 폭 초과 — 더 짧게"
        return line, None

    out, fails = [], []
    for i, it in enumerate(items):
        raw = lines[i] if i < len(lines) else ""
        line, why = check(it, raw)
        if why and isinstance(raw, str) and raw:
            print(f"  지시문 검증 탈락({why}) → 재작성 시도: {raw}", file=sys.stderr)
            fails.append({"i": i, "line": raw, "why": why})
        out.append(line)

    # 탈락분은 사유를 알려주고 한 번만 다시 쓰게 한다 — 그냥 기계 조립으로
    # 떨어뜨리면 '준비를 갖출 것' 반복 문형이 돌아온다(백테스트).
    if fails:
        retry = ("방금 쓴 실무 지시문 중 아래 항목이 기계 검증에서 탈락했다. "
                 "규칙(수신자 기준 행동·자기 호명 금지·follow.task 원문 포함·"
                 "36~48자·'~할 것' 종결·데이터에 없는 기관 금지)을 지키면서 "
                 "탈락 사유를 해소해 각 항목을 다시 써라.\n"
                 '출력은 JSON 하나만: {"lines":["아래 항목 순서대로 - 줄", ...]}\n'
                 "항목:\n" + json.dumps(
                     [{"item": data[f["i"]], "탈락문장": f["line"], "사유": f["why"]}
                      for f in fails], ensure_ascii=False))
        try:
            r2 = subprocess.run(["claude", "-p", retry], capture_output=True,
                                text=True, timeout=REFINE_TIMEOUT)
            m2 = re.search(r"\{[\s\S]*\}", r2.stdout)
            for f, raw2 in zip(fails, json.loads(m2.group(0))["lines"]):
                line2, why2 = check(items[f["i"]], raw2)
                if line2:
                    out[f["i"]] = line2
                else:
                    print(f"  재작성도 탈락({why2}) → 기계 조립: {raw2}",
                          file=sys.stderr)
        except Exception as e:
            print(f"  지시문 재작성 실패({type(e).__name__}) — 기계 조립 폴백",
                  file=sys.stderr)
    _REFINE_CACHE[cache_key] = out
    return out


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
        return [(s["name"][len(head):].strip(), s.get("actor") or "",
                 s.get("deadline") or "")
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

    # ② 착수 가능하나 미착수인 관문의 첫 절차.
    #    온톨로지가 개폐를 계산해 두었으면 그것을 쓴다 — 여기서 다시 판정하면
    #    hard/soft 구분과 경로 미확정(path_undetermined)을 이 파일이 또 알아야 한다.
    att = _attention()
    if att:
        ready = [g for g, a in att.items()
                 if a.get("openness") in ("ready", "in_progress") and g in N]
    else:
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
                         key=lambda x: (att_priority(att.get(x[0])),
                                        -len(gmin.get(x[0], [])), -_downstream(ho, x[0]))):
        if v in seen:
            continue
        for inst in (byGate.get(v) or [])[:1]:
            steps = inst.get("steps") or []
            if steps:
                # 보도가 이유지만, 총리가 왜 챙겨야 하는지는 온톨로지가 안다.
                tag = att_why(att.get(v))
                why = f"{src} 보도의 다음 관문" + (f"·{tag}" if tag else "")
                out.append((v, inst["name"], steps[0], why))
                seen.add(v)

    # ③ 그래도 모자라면 착수 가능한데 미착수인 관문.
    #    순서는 관심층 우선 — 총리 층이면서 '다른 부처 손에 있는 것'이 먼저다.
    #    파급 수는 온톨로지가 센 하류(reach)를 쓰고, 없으면 종전 계산으로 물러선다.
    for g in sorted(ready, key=lambda x: (att_priority(att.get(x)),
                                          -len(gmin.get(x, [])), -_downstream(ho, x))):
        if g in seen:
            continue
        for inst in (byGate.get(g) or [])[:1]:
            steps = inst.get("steps") or []
            if steps:
                a = att.get(g) or {}
                n = a.get("reach", _downstream(ho, g))
                tag = att_why(a)
                why = (tag or "착수 가능") + (f"·뒤 {n}개" if n else "")
                out.append((g, inst["name"], steps[0], why))
    return out


def to_dsl(b, compact=False):
    """구조(JSON) → 한글 라인 DSL. 슬롯이 없으므로 항목 수 제한이 없다.

    LLM 에게 DSL 을 직접 시키지 않는 이유: 자유 텍스트는 형식이 계속 어긋난다
    (마크다운 혼입·서두·불릿 변형을 일곱 번 겪었다). 검증 가능한 JSON 을 받고
    DSL 은 코드가 만든다. 그러면 사람이 DSL 을 손으로 고쳐 다시 굽는 것도 된다.

    compact: 1쪽을 넘긴 경우의 재생성 단계.
      1 — * 부연을 한 줄로 조인다
      2 — 리스크의 * 주석(관문·법령)을 통째 뺀다
    상술(-)은 어느 단계에서도 자르지 않는다. 상술은 '무엇이 왜 문제인가'를
    지고 있고 주석은 참고 표시라, 상술을 자르면 "…무안 민심"처럼 뜻이 끊긴
    문장이 남는다(2026-08-31 발송분에서 실제로 났다). 줄 수로도 주석을 빼는
    쪽이 더 많이 줄어든다 — 리스크 3건이면 3줄.
    """
    wide = 1 if compact >= 1 else 2       # * 부연 줄 수 상한
    wide_body = 2                          # 리스크 - 상술은 항상 두 줄까지
    drop_risk_note = compact >= 2          # 리스크의 * 주석 생략
    gmap = gate_names()
    y, mo, d = b["date"].split("-")
    L = [f"제목: {b['title']}",
         f"부제: {y}. {int(mo)}. {int(d)}. · 언론·정책브리핑 신호 자동집계 기반",
         "네모: 주요 보도내용"]
    # 보도 제목·부연은 기사 원문 전언이라 금액 갖은자 병기를 걸지 않는다
    # ("금54조원(금오십사조원)"이 제목을 훼손한 백테스트 사고)
    for r in b.get("reports", []):
        press = f"({r['press']}) " if r.get("press") else ""
        L.append(f"원: {press}{tidy(r['title'])}")
        if r.get("body"):
            # * 는 한 줄 부연이다 — 넘치면 절 경계에서 끊는다
            body = tidy(r["body"])
            L.append(f"주석: {finish_noun(fit_lines(body, SMALL_W, wide), body)}")

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
            L.append(f"바: {finish_noun(fit_lines(detail, BODY_W, wide_body), detail)}")

        # * 부연 — 관문·소관·근거 조문. 수치는 이미 위 두 줄에 들어간다.
        # 소관 표기는 대표 관문 것만 — 병기 관문의 기관까지 합치면 전기본
        # 협의에 소방본부가 끼는 사고가 난다(백테스트 8-13).
        g = gs[0] if gs else None
        ms_show = []
        for m2 in list(r.get("ministries") or []) + (gmin.get(g, []) if g else []):
            if m2 not in ms_show:
                ms_show.append(m2)
        bits = []
        if g:
            more = f" 외 {len(gs)-1}" if len(gs) > 1 else ""
            bits.append(f"{gmap.get(g, '')}^({g}){more}^")
        if len(ms_show) > 1:
            bits.append("·".join(ms_show[:3]) + " 협의")
        elif ms_show:
            bits.append(ms_show[0])
        elif g and leads.get(g):
            bits.append(leads[g])
        if g and gbasis.get(g):
            bits.append(gbasis[g])
        if bits and not drop_risk_note:
            L.append("주석: " + fit_bits(bits, SMALL_W, wide))

    L += ["엔터:", "네모: 조치 필요사항"]

    def _named(cand):
        """지시 가능한 이름 하나를 뽑는다. 전체가 행정기관이면 그대로
        ('선정·지원위원회'), 아니면 · 조각 중 첫 행정기관('광주특별시·산단
        지정권자' → '광주특별시'). 없으면 None."""
        if not cand:
            return None
        cand = re.sub(r"\s*\([^)]*\)", "", cand)
        cand = re.split(r"[,/]|\s+및\s+", cand)[0].strip()
        if actionable(cand):
            return cand
        for seg in cand.split("·"):
            if actionable(seg.strip()):
                return seg.strip()
        return None

    def resolve_actor(gate, st, ms):
        """총리가 이름을 불러 챙기게 할 '주무' 하나를 정한다.

        협의기관을 병렬 승격하면(산림청·해양수산부가 개발행위허가 주체로)
        수신자가 어긋난다 — 백테스트 최다 사고. 협의기관은 * 로 내린다.
        '건축주'(민간)·'주무부처'(총칭)까지 훑어도 이름이 안 나오는 관문은
        None 을 돌려 후보에서 빼게 한다 — 수신자 없는 지시는 지시가 아니다.
        """
        for cand in [st.get("actor"), leads.get(gate), *(ms or [])]:
            got = _named(cand)
            if got:
                return got
        return None

    # 같은 부처가 연달아 나오면 총리 보고로서 읽을 값이 떨어진다.
    # 후보를 넉넉히 받아 한 기관당 하나씩만 올린다.
    # 순서: 오늘 진척이 확인된 절차(왜=완료)가 반복 여부와 무관하게 먼저,
    # 나머지는 최근 보고에 안 나간 관문부터(같은 지시 18/20일 반복의 처방).
    hist = _load_history()
    cands = sorted(enumerate(directives(b.get("advances"))[:12]),
                   key=lambda x: (0 if "완료" in x[1][3] else 1,
                                  _streak(hist, x[1][0], b["date"]), x[0]))
    picked, used = [], set()
    for _i, cand in cands:
        actor = resolve_actor(cand[0], cand[2], gmin.get(cand[0], []))
        if not actor or actor in used:
            continue
        used.add(actor)
        picked.append((actor, *cand))
        if len(picked) == 3:
            break

    # 관점어 후보 — 한 문서 안에서 세 항목이 같은 관점어를 달면 층위가
    # 무너진다(백테스트: '부처 협의 상황 점검' 일색). 범주별로 돌려 쓴다.
    ASPECTS = {
        "done": ["착수 일정 확정", "후속 절차 준비 점검"],
        "next": ["준비상황 점검", "사전 준비 착수 확인"],
        "multi": ["부처 협의 상황 점검", "협의 쟁점·기한 확인", "합동 추진체계 점검"],
        "ready": ["착수 여부 확인", "미착수 사유 확인"],
        # 온톨로지가 "다른 부처 손에 있다"고 판정한 관문 — 총리가 직접 풀 자리다.
        "wait": ["소관 부처 간 조정", "선행 산출물 인계 시점 확정"],
        "branch": ["적용 경로 결정", "경로 확정 시점 제시"],
    }
    used_aspects = set()

    def pick_aspect(kind):
        for a2 in ASPECTS[kind]:
            if a2 not in used_aspects:
                used_aspects.add(a2)
                return a2
        return ASPECTS[kind][0]

    items = []
    for actor, gate, inst, st, why in picked:
        # 절차명이 긴 것은 문장이 아니라 목록이라, 첫 마디만 쓰고 줄인다
        name = st["name"]
        if len(name) > 26:
            name = re.split(r"부터|까지", name)[0].strip().rstrip("·") + " 등"
        ms = gmin.get(gate, [])

        # ○ 은 총리가 부처에 '무엇을 하게 할 것인가'다. 명시적 지시문은
        # 아니지만 무엇을 하라는 것인지는 남아야 하므로 동사형으로 맺는다.
        # 그래도 또 나간 지시는 새 지시가 아니라 이행 점검이다.
        n_rep = _streak(hist, gate, b["date"])
        if n_rep >= 1:
            aspect = "전일 지시 이행 점검" if n_rep == 1 \
                else f"지시 {n_rep + 1}회째 이행 점검"
        elif "완료" in why:
            aspect = pick_aspect("done")   # 직전 절차가 끝났다는 보도가 있었다
        elif "다부처 물림" in why:
            aspect = pick_aspect("wait")   # 막는 산출물이 다른 부처 손에 지금 있다
        elif "미확정 갈림길" in why:
            aspect = pick_aspect("branch")  # 사업이 값을 정해야 관문이 열린다
        elif "다음 관문" in why:
            aspect = pick_aspect("next")   # 아직 이 관문 차례가 오지 않았다
        elif len(ms) > 1:
            aspect = pick_aspect("multi")
        else:
            aspect = pick_aspect("ready")  # 선행이 끝나 시작할 수 있는데 소식이 없다

        # ○ 는 한 줄이어야 한다. 주체와 관점어는 못 줄이므로 절차명을 깎는다.
        # 관문 표시는 아래 * 로 내렸다 — ○ 는 '누가 무엇을' 만 담는다
        name = tidy(name)
        room = DIRECTIVE_W - disp_w(f"{actor}: {aspect}") - 0.5   # 절차명 뒤 공백
        while name and disp_w(name) > room:
            name = shorten(name, len(name) - 1)
        items.append({"actor": actor, "gate": gate, "st": st, "why": why,
                      "name": name, "aspect": aspect, "ms": ms,
                      "nxt": next_step_pairs(gate, st["name"]),
                      "follow": follow_task(ho, gate)})

    # - 실무 지시는 모델이 사안별로 쓴다(검증 탈락·실패 항목은 기계 조립)
    refined = ([None] * len(items) if NO_REFINE
               else refine_directives(items, b, gmap))

    for it, better in zip(items, refined):
        gate, st, ms = it["gate"], it["st"], it["ms"]
        L.append(f"원: {it['actor']}: {it['name']} {it['aspect']}")

        # - 한 단 아래 실무에 내릴 지시. ○ 이 '무엇을 볼 것인가'라면
        #   여기는 '그러려면 구체적으로 무슨 일을 어떻게 하라'다.
        # 총리에게 보고하라는 말이 아니라 그 부처가 실제로 할 일을 적는다.
        if better:
            line = better
        else:
            nxt, follow = it["nxt"], it["follow"]
            if nxt:
                # 지시문은 꼬리가 잘리면 뜻이 무너지므로 뒤를 자르는 대신
                # 단계를 하나로 줄여 문장을 통째로 남긴다.
                line = how_to(nxt, ms, follow)
                if len(nxt) > 1 and not lines_ok(line, BODY_W, 2):
                    line = how_to(nxt[:1], ms, follow)
            else:
                # 그 절차가 제도의 마지막이라 다음 단계가 없다 — 그 절차 자체를
                # 어떻게 밀어붙일지를 적는다
                line = how_to([(shorten(it["name"], 14), "")], ms, follow)
        # 여기서 fit_lines 를 다시 걸지 않는다 — 지시문은 끝이 잘리면
        # 지시가 아니게 된다. 길이는 위에서 검증했거나 단계 수로 맞췄다.
        L.append(f"바: {line}")

        # * 부연 — 관문·협의기관·근거 조문·기한
        # ○ 는 주무 하나만 부르므로, 얽힌 부처는 여기서 '협의:'로 밝힌다
        bits = [f"{gmap.get(gate, '')}^({gate})^"]
        others = [m for m in ms if m != it["actor"]][:2]
        if others:
            bits.append("협의: " + "·".join(others))
        if short_basis(st.get("basis")):
            bits.append(short_basis(st.get("basis")))
        if st.get("deadline"):
            bits.append(f"기한 {st['deadline']}")
        L.append("주석: " + fit_bits(bits, SMALL_W, wide))

    # ※ 수치 꼬리말은 뺐다(2026-08-30) — 규모 자랑이지 보고가 아니다.
    # 수치는 briefing.json 의 pipeline 에 계속 남으므로 필요하면 되살릴 수 있다.
    global _PICKED_GATES
    _PICKED_GATES = [it["gate"] for it in items]
    # 마지막에 부처명을 한 번에 정규화 — 절차 데이터의 개편 전 직제와
    # 기사 세계의 현행 직제가 한 문서에 섞이지 않게 한다
    return [normalize_ministries(x) for x in L]


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
    ap.add_argument("--no-refine", action="store_true",
                    help="실무 지시(-)를 모델로 다듬지 않고 기계 조립만 쓴다")
    a = ap.parse_args()
    global NO_REFINE
    NO_REFINE = a.no_refine
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
    # 한 장 규격 가드 — 백테스트 20일 중 3일이 조용히 2쪽으로 넘쳤다.
    # 1단계는 * 부연만, 그래도 넘치면 2단계에서 리스크 상술까지 조인다
    # (지시 다듬기는 캐시라 재호출 없음).
    for level in (1, 2):
        if len(pages) <= 1 or a.from_dsl:
            break
        print(f"1쪽 초과 — 압축 {level}단계 재생성", file=sys.stderr)
        lines = to_dsl(b, compact=level)
        dsl_path.write_text("\n".join(lines) + "\n")
        build(lines, doc)
        pages = json.loads(run("export-text", str(doc), "--json"))["pages"]
    text = "\n".join(p["text"] for p in pages)
    if len(text.strip()) < 100:
        sys.exit("생성된 문서가 비어 있다 — 중단한다.")
    if not a.from_dsl:
        update_history(date)     # 보고서가 실제로 구워진 지시만 이력에 남긴다

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
