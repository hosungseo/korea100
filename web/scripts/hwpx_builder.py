#!/usr/bin/env python3
"""한글 라인 DSL → HWPX 문서 빌더.

KISA 「범정부오피스」(범피스)의 마크다운 DSL 을 차용해 다시 구현했다. 원본은
win32com 으로 실행 중인 한/글을 몰아 문서를 만들지만(Windows·한글 설치 필수),
여기서는 같은 문법을 받아 HWPX 파일을 직접 조립한다 — 매일 도는 자동화라
헤드리스여야 하기 때문이다.

DSL (한 줄 = 한 문단, `키워드: 내용`)
    제목:        문서 제목            HY헤드라인M 20pt 가운데
    부제:        제목 아래 한 줄      함초롬바탕 13pt 가운데
    네모:/사각형: □ 큰내용            HY헤드라인M 16pt
    원:/동그라미: ○ 중간내용          함초롬바탕 15pt 진하게
    바:          - 작은내용           함초롬바탕 15pt
    당구:/당구장: ※ 참고              맑은 고딕 12pt
    주석:/주석1:  * 주석              맑은 고딕 12pt
    주석2:       ** 둘째 주석
    표: a: b: c  콜론 구분 표 행(연속 줄이 한 표, 첫 줄이 머리행)
    엔터:        빈 줄(간격)

본문 안에서 ^…^ 로 감싸면 위첨자가 된다 — 관문 번호처럼 참조용 표시를
문장 흐름에서 빼는 데 쓴다.  예)  바: 신규 수원 확보^(N50)^

기호는 「행정업무의 운영 및 혁신에 관한 규정 시행규칙」 제2조제1항 단서의
□ ○ - ㆍ 를 따른다(한글 자모 ㅇ 나 en dash – 가 아니다).

    from hwpx_builder import build
    build(["제목: 일일 동향", "네모: 주요 보도내용", "원: (조선) …"], Path("out.hwpx"))
"""
import re
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKELETON = HERE.parent / "templates/_skeleton-blank.hwpx"

# 여백 — 위아래좌우 20mm. 1mm = 7200/25.4 = 283.46 HWPUNIT
MM = 7200 / 25.4
MARGIN = round(20 * MM)          # 5669
PAGE_W = 59528                   # A4 가로
# 본문 폭 = 용지 폭 − 좌우 여백. 표 열 너비를 이 값으로 나눈다
TEXT_WIDTH = PAGE_W - MARGIN * 2

# 표 열 너비 배분 힌트(범피스에서 차용): 좁게 둘 머리말 / 넓게 둘 머리말
NARROW = ("순번", "번호", "구분", "분야", "연번", "비고")
MEDIUM = ("진행상황", "상태", "판정", "일자", "담당")
WIDE = ("주소", "내용", "사항", "세부", "관문", "현황", "조치")


# ---------------------------------------------------------------- header.xml
def _patch_header(hdr):
    """글꼴·글자모양·문단모양·테두리를 더한다. 반환: (hdr, CH, PA, BF)"""
    new_fonts = ["HY헤드라인M", "맑은 고딕"]
    typeinfo = ('<hh:typeInfo familyType="FCAT_GOTHIC" weight="5" proportion="4" contrast="0" '
                'strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/>')

    def add_fonts(m):
        head, body = m.group(1), m.group(2)
        base = int(re.search(r'fontCnt="(\d+)"', head).group(1))
        extra = "".join(
            f'<hh:font id="{base+i}" face="{f}" type="TTF" isEmbedded="0">{typeinfo}</hh:font>'
            for i, f in enumerate(new_fonts))
        head = re.sub(r'fontCnt="\d+"', f'fontCnt="{base+len(new_fonts)}"', head)
        return head + body + extra + "</hh:fontface>"

    hdr, n = re.subn(r'(<hh:fontface [^>]*>)(.*?)</hh:fontface>', add_fonts, hdr, flags=re.S)
    assert n == 7, f"fontface 블록 {n}개 (7 기대)"
    F_HY, F_MALGUN, F_BATANG = 3, 4, 2

    base_char = re.search(r'<hh:charPr id="0".*?</hh:charPr>', hdr, re.S).group(0)

    def _all_langs(tag, val):
        return (f'<hh:{tag} hangul="{val}" latin="{val}" hanja="{val}" japanese="{val}" '
                f'other="{val}" symbol="{val}" user="{val}"/>')

    def char_pr(cid, pt, font, bold=False, sup=False):
        x = base_char.replace('<hh:charPr id="0"', f'<hh:charPr id="{cid}"', 1)
        x = re.sub(r'height="\d+"', f'height="{int(pt*100)}"', x, count=1)
        x = re.sub(r'<hh:fontRef [^/]*/>',
                   f'<hh:fontRef hangul="{font}" latin="{font}" hanja="{font}" '
                   f'japanese="{font}" other="{font}" symbol="{font}" user="{font}"/>', x, count=1)
        if bold:
            x = x.replace("<hh:underline", "<hh:bold/><hh:underline", 1)
        if sup:
            # HWPX 에 위첨자 전용 태그는 없다 — 작게 만들고 기준선에서 위로
            # 올리는 것이 한/글의 위첨자다.
            # 크기는 relSz 가 아니라 height 로 준다: rhwp 렌더러가 relSz 를
            # 무시해 PNG 에서는 축소가 전혀 보이지 않았다. height 는 두 곳
            # 모두 지키므로 relSz 는 100 으로 두고 offset 만 얹는다.
            x = re.sub(r'height="\d+"', f'height="{int(pt*65)}"', x, count=1)
            x = re.sub(r'<hh:offset [^/]*/>', _all_langs("offset", 30), x, count=1)
        return x

    CH = {                      # 이름 -> (id, pt, 글꼴, 진하게, 위첨자)
        "title":  (8, 20, F_HY, True, False),
        "head":   (9, 16, F_HY, True, False),
        "bullet": (10, 15, F_BATANG, True, False),
        "body":   (11, 15, F_BATANG, False, False),
        "sub":    (12, 13, F_BATANG, False, False),
        "small":  (13, 12, F_MALGUN, False, False),
        "smallb": (14, 12, F_MALGUN, True, False),
        "gap5":   (15, 5, F_BATANG, False, False),
        "gap3":   (16, 3, F_BATANG, False, False),
        # 관문 번호를 본문 흐름에서 빼는 용도 — 각 단의 글자모양마다 하나씩.
        # 짝이 없는 단은 para() 에서 본문 글자모양으로 떨어지므로 위첨자를
        # 쓰는 단은 여기에 반드시 등록해야 한다.
        "body^":   (17, 15, F_BATANG, False, True),
        "small^":  (18, 12, F_MALGUN, False, True),
        "bullet^": (19, 15, F_BATANG, True, True),
    }
    hdr = hdr.replace("</hh:charProperties>",
                      "".join(char_pr(*v) for v in CH.values())
                      + "</hh:charProperties>", 1)
    hdr = re.sub(r'(<hh:charProperties itemCnt=")\d+(")', rf'\g<1>{8+len(CH)}\g<2>', hdr, count=1)

    # 기존 들여쓰기 문단모양(id 2·3·4)은 heading="OUTLINE" 이라 1./가. 번호가 자동으로
    # 붙는다. heading="NONE" 인 id=0 을 복제해 들여쓰기만 준 것을 새로 만든다.
    base_para = re.search(r'<hh:paraPr id="0".*?</hh:paraPr>', hdr, re.S).group(0)
    assert 'type="NONE"' in re.search(r'<hh:heading[^>]*/>', base_para).group(0)

    def para_pr(pid, left=0, align=None):
        x = base_para.replace('<hh:paraPr id="0"', f'<hh:paraPr id="{pid}"', 1)
        if align:
            x = x.replace('horizontal="JUSTIFY"', f'horizontal="{align}"', 1)
        if left:
            x = x.replace('<hc:left value="0" unit="HWPUNIT"/>',
                          f'<hc:left value="{left}" unit="HWPUNIT"/>')
        return x

    PA = {"center": 20, "L0": 0, "L1": 21, "L2": 22, "L3": 23}
    hdr = hdr.replace("</hh:paraProperties>",
                      para_pr(20, align="CENTER") + para_pr(21, 1500)
                      + para_pr(22, 3000) + para_pr(23, 4500) + "</hh:paraProperties>", 1)
    hdr = re.sub(r'(<hh:paraProperties itemCnt=")\d+(")', r'\g<1>24\g<2>', hdr, count=1)

    # 원본 borderFill(id=1)은 사방 NONE 이라 표 선이 안 그려진다
    def border_fill(bid, face="none"):
        sides = "".join(f'<hh:{d}Border type="SOLID" width="0.12 mm" color="#000000"/>'
                        for d in ("left", "right", "top", "bottom"))
        return (f'<hh:borderFill id="{bid}" threeD="0" shadow="0" centerLine="NONE" '
                f'breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/>'
                f'<hh:backSlash type="NONE" Crooked="0" isCounter="0"/>{sides}'
                f'<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/><hc:fillBrush>'
                f'<hc:winBrush faceColor="{face}" hatchColor="#999999" alpha="0"/>'
                f'</hc:fillBrush></hh:borderFill>')

    hdr = hdr.replace("</hh:borderFills>",
                      border_fill(2) + border_fill(3, "#EEEEEE") + "</hh:borderFills>", 1)
    hdr = re.sub(r'(<hh:borderFills itemCnt=")\d+(")', r'\g<1>3\g<2>', hdr, count=1)
    return hdr, CH, PA, {"body": 2, "head": 3}


# ------------------------------------------------------------------ DSL 규칙
# 키워드 -> (불릿, 글자모양, 문단수준). 범피스 마크다운 문법을 그대로 받는다.
RULES = {
    "제목":    ("",        "title",  "center"),
    "부제":    ("",        "sub",    "center"),
    "네모":    ("□ ",      "head",   "L0"),
    "사각형":  ("□ ",      "head",   "L0"),
    "원":      ("○ ",      "bullet", "L1"),
    "동그라미": ("○ ",      "bullet", "L1"),
    "바":      ("- ",      "body",   "L2"),
    "당구":    ("※ ",      "small",  "L3"),
    "당구장":  ("※ ",      "small",  "L3"),
    "주석":    ("* ",      "small",  "L3"),
    "주석1":   ("* ",      "small",  "L3"),
    "주석2":   ("** ",     "small",  "L3"),
    # 문서 맨 아래 출처·집계 꼬리말. 들여쓰기가 없어야 앞 항목에 딸린 것으로 안 읽힌다
    "꼬리":    ("※ ",      "small",  "L0"),
    "엔터":    ("",        "gap5",   "L0"),
}


def _esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def parse(lines):
    """DSL 줄 목록 -> [('para', 키워드, 내용) | ('table', [행,...])]"""
    out, tbl = [], []
    for raw in lines:
        line = raw.rstrip()
        if not line.strip():
            continue
        kw, _, rest = line.partition(":")
        kw = kw.strip()
        if kw == "표":
            tbl.append([c.strip() for c in rest.split(":")])
            continue
        if tbl:
            out.append(("table", tbl)); tbl = []
        if kw in RULES:
            out.append(("para", kw, rest.strip()))
        else:                      # 키워드가 없으면 본문(바)으로 본다
            out.append(("para", "바", line.strip()))
    if tbl:
        out.append(("table", tbl))
    return out


def _col_widths(rows):
    """머리말 어휘로 열 너비를 배분한다(범피스 차용). 합은 본문 폭."""
    n = max(len(r) for r in rows)
    head = rows[0] + [""] * (n - len(rows[0]))
    w = []
    for h in head:
        if any(k in h for k in NARROW):
            w.append(1.0)
        elif any(k in h for k in MEDIUM):
            w.append(1.4)
        elif any(k in h for k in WIDE):
            w.append(3.0)
        else:
            w.append(1.8)
    total = sum(w)
    return [int(TEXT_WIDTH * x / total) for x in w]


def build(lines, out_path, skeleton=SKELETON):
    """DSL 줄 목록을 HWPX 파일로 굽는다."""
    zin = zipfile.ZipFile(skeleton)
    hdr, CH, PA, BF = _patch_header(zin.read("Contents/header.xml").decode())
    sec = zin.read("Contents/section0.xml").decode()
    prolog = sec[:sec.index("<hp:p ")]
    secpr = re.search(r"<hp:secPr\b.*?</hp:secPr>", sec, re.S).group(0)
    # 뼈대는 좌우 30mm·위 20mm 인 데다 머리말 15mm 를 더 잡아 한 장에 담기는
    # 양이 준다. 머리말·꼬리말은 쓰지 않으므로 0 으로 두고 사방을 20mm 로 맞춘다.
    secpr = re.sub(
        r'<hp:margin\b[^/]*/>',
        f'<hp:margin header="0" footer="0" gutter="0" left="{MARGIN}" '
        f'right="{MARGIN}" top="{MARGIN}" bottom="{MARGIN}"/>',
        secpr)
    colpr = re.search(r"<hp:ctrl><hp:colPr\b.*?</hp:ctrl>", sec, re.S).group(0)

    pid = iter(range(10000))

    def para(text, char, level, prefix=""):
        # ^…^ 로 감싼 조각은 위첨자 글자모양으로 따로 run 을 낸다.
        # 위첨자용 글자모양이 없는 단(제목 등)은 그냥 본문으로 떨어뜨린다.
        sup = CH.get(char + "^", CH[char])[0]
        runs = "".join(
            f'<hp:run charPrIDRef="{sup if i % 2 else CH[char][0]}">'
            f'<hp:t>{_esc(part)}</hp:t></hp:run>'
            for i, part in enumerate(text.split("^")) if part)
        return (f'<hp:p id="{next(pid)}" paraPrIDRef="{PA[level]}" styleIDRef="0" '
                f'pageBreak="0" columnBreak="0" merged="0">{prefix}{runs}</hp:p>')

    def table(rows):
        cols = max(len(r) for r in rows)
        widths = _col_widths(rows)
        rowh, cells = 1300, []
        for r, row in enumerate(rows):
            row = row + [""] * (cols - len(row))
            tcs = []
            for c, val in enumerate(row[:cols]):
                char = "smallb" if r == 0 else "small"
                align = "center" if (r == 0 or c == 0) else "L0"
                p = (f'<hp:p id="0" paraPrIDRef="{PA[align]}" styleIDRef="0" pageBreak="0" '
                     f'columnBreak="0" merged="0"><hp:run charPrIDRef="{CH[char][0]}">'
                     f'<hp:t>{_esc(val)}</hp:t></hp:run></hp:p>')
                tcs.append(
                    f'<hp:tc name="" header="{1 if r == 0 else 0}" hasMargin="0" protect="0" '
                    f'editable="0" dirty="0" borderFillIDRef="{BF["head"] if r == 0 else BF["body"]}">'
                    f'<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" '
                    f'vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" '
                    f'textHeight="0" hasTextRef="0" hasNumRef="0">{p}</hp:subList>'
                    f'<hp:cellAddr colAddr="{c}" rowAddr="{r}"/>'
                    f'<hp:cellSpan colSpan="1" rowSpan="1"/>'
                    f'<hp:cellSz width="{widths[c]}" height="{rowh}"/>'
                    f'<hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc>')
            cells.append("<hp:tr>" + "".join(tcs) + "</hp:tr>")
        tbl = (f'<hp:tbl id="1" zOrder="0" numberingType="NONE" textWrap="TOP_AND_BOTTOM" '
               f'textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" '
               f'repeatHeader="1" rowCnt="{len(rows)}" colCnt="{cols}" cellSpacing="0" '
               f'borderFillIDRef="1" noAdjust="0">'
               f'<hp:sz width="{sum(widths)}" widthRelTo="ABSOLUTE" height="{rowh*len(rows)}" '
               f'heightRelTo="ABSOLUTE" protect="0"/>'
               f'<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" '
               f'holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" '
               f'horzAlign="LEFT" vertOffset="0" horzOffset="0"/>'
               f'<hp:outMargin left="0" right="0" top="141" bottom="141"/>'
               f'<hp:inMargin left="141" right="141" top="141" bottom="141"/>'
               + "".join(cells) + "</hp:tbl>")
        return (f'<hp:p id="{next(pid)}" paraPrIDRef="{PA["L0"]}" styleIDRef="0" pageBreak="0" '
                f'columnBreak="0" merged="0"><hp:run charPrIDRef="{CH["small"][0]}">'
                f'{tbl}</hp:run></hp:p>')

    body, first = [], True
    for item in parse(lines):
        if item[0] == "table":
            body.append(table(item[1]))
            continue
        _, kw, text = item
        bullet, char, level = RULES[kw]
        # 첫 문단에 쪽 설정(secPr)을 실어야 여백·용지가 산다
        prefix = f'<hp:run charPrIDRef="{CH[char][0]}">{secpr}{colpr}</hp:run>' if first else ""
        first = False
        body.append(para(bullet + text if text else "", char, level, prefix))

    sec_xml = prolog + "".join(body) + "</hs:sec>"
    patched = {"Contents/header.xml": hdr, "Contents/section0.xml": sec_xml}
    out_path = Path(out_path)
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("mimetype", zin.read("mimetype"), compress_type=zipfile.ZIP_STORED)
        for it in zin.infolist():
            if it.filename != "mimetype":
                z.writestr(it.filename, patched.get(it.filename, zin.read(it.filename)))
    return out_path


if __name__ == "__main__":
    import sys
    src = Path(sys.argv[1]).read_text().splitlines() if len(sys.argv) > 1 else []
    out = build(src, sys.argv[2] if len(sys.argv) > 2 else "out.hwpx")
    print(f"{out} ({out.stat().st_size:,} bytes)")
