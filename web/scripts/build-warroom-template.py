#!/usr/bin/env python3
"""워룸 일일 보고 한 장짜리 HWPX 템플릿 생성기.

rhwp 에는 빈 문서에 글을 넣는 명령이 없다(replace-text/set-cell/fill-fields 는 모두
기존 내용을 고치는 것). 그래서 빈 hwp → hwpx 로 얻은 뼈대의 header.xml 에
글자모양·문단모양·글꼴을 더하고 section0.xml 본문을 직접 짜 넣는다.

서식 근거: 사용자 제공 보고서 표준 양식
  제목 HY헤드라인M 20pt / 소제목 □ HY헤드라인M 16pt
  ○ 함초롬바탕 15pt 진하게 / - 함초롬바탕 15pt / ▲·※·* 맑은 고딕 12pt
기호는 「행정업무의 운영 및 혁신에 관한 규정 시행규칙」 제2조제1항 단서가 든
□, ○, -, ㆍ 를 따른다(한글 자모 ㅇ 나 en dash – 가 아니다)
  표 맑은 고딕 12pt(머리 진하게) · 배치 글자처럼취급
  줄 띄우기 함초롬바탕 5pt(3pt) · 양쪽 정렬 · 장평 100 고정
"""
import re, zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE.parent / "templates/_skeleton-blank.hwpx"   # 빈 hwpx 뼈대(아래 주석 참고)
OUT = HERE.parent / "templates/warroom-daily-template.hwpx"

# 뼈대 재취득: rhwp 레포의 template/blank-batang.hwp 를 받아 hwpx 로 변환한다
#   curl -sLO https://github.com/edwardkim/rhwp/raw/main/template/blank-batang.hwp
#   rhwp export-hwpx blank-batang.hwp _skeleton-blank.hwpx
_zin = zipfile.ZipFile(SRC)
_read = lambda name: _zin.read(name).decode()

# ---------- 1. header.xml : 글꼴 · 글자모양 · 문단모양 추가 ----------
hdr = _read("Contents/header.xml")

# 1-1 글꼴: 7개 lang 블록 모두에 같은 id 로 추가해야 fontRef 가 어긋나지 않는다
NEW_FONTS = ["HY헤드라인M", "맑은 고딕"]
TYPEINFO = ('<hh:typeInfo familyType="FCAT_GOTHIC" weight="5" proportion="4" contrast="0" '
            'strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/>')

def add_fonts(m):
    head, body = m.group(1), m.group(2)
    base = int(re.search(r'fontCnt="(\d+)"', head).group(1))
    extra = "".join(
        f'<hh:font id="{base+i}" face="{f}" type="TTF" isEmbedded="0">{TYPEINFO}</hh:font>'
        for i, f in enumerate(NEW_FONTS))
    head = re.sub(r'fontCnt="\d+"', f'fontCnt="{base+len(NEW_FONTS)}"', head)
    return head + body + extra + "</hh:fontface>"

hdr, n = re.subn(r'(<hh:fontface [^>]*>)(.*?)</hh:fontface>', add_fonts, hdr, flags=re.S)
assert n == 7, f"fontface 블록 {n}개 (7 기대)"
F_HY, F_MALGUN, F_BATANG = 3, 4, 2   # 한글 글꼴 id

# 1-2 글자모양: id=0 을 원본으로 복제해 크기·글꼴·굵기만 바꾼다
base_char = re.search(r'<hh:charPr id="0".*?</hh:charPr>', hdr, re.S).group(0)

def char_pr(cid, pt, font, bold=False):
    x = base_char.replace('<hh:charPr id="0"', f'<hh:charPr id="{cid}"', 1)
    x = re.sub(r'height="\d+"', f'height="{int(pt*100)}"', x, count=1)
    x = re.sub(r'<hh:fontRef [^/]*/>',
               f'<hh:fontRef hangul="{font}" latin="{font}" hanja="{font}" japanese="{font}" '
               f'other="{font}" symbol="{font}" user="{font}"/>', x, count=1)
    if bold:  # 굵기는 빈 요소의 존재로 표현한다
        x = x.replace("<hh:underline", "<hh:bold/><hh:underline", 1)
    return x

CH = {  # 이름 -> (id, pt, 글꼴, 진하게)
    "title":    (8,  20, F_HY,     True),
    "head":     (9,  16, F_HY,     True),
    "bullet":   (10, 15, F_BATANG, True),
    "body":     (11, 15, F_BATANG, False),
    "sub":      (12, 13, F_BATANG, False),
    "small":    (13, 12, F_MALGUN, False),
    "smallb":   (14, 12, F_MALGUN, True),
    "gap5":     (15,  5, F_BATANG, False),
    "gap3":     (16,  3, F_BATANG, False),
}
add_chars = "".join(char_pr(cid, pt, f, b) for cid, pt, f, b in CH.values())
hdr = hdr.replace("</hh:charProperties>", add_chars + "</hh:charProperties>", 1)
hdr = re.sub(r'(<hh:charProperties itemCnt=")\d+(")', rf'\g<1>{8+len(CH)}\g<2>', hdr, count=1)

# 1-3 문단모양: 기존 들여쓰기 문단(id 2·3·4)은 heading="OUTLINE" 이라 1./가. 번호가
# 자동으로 붙는다. heading="NONE" 인 id=0 을 복제해 들여쓰기만 준 것을 새로 만든다.
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

# 양식의 6단계: □(0) ㅇ(1) –(2) ▲(3) ※·*(3)
PA_CENTER, PA_L0, PA_L1, PA_L2, PA_L3 = 20, 0, 21, 22, 23
add_paras = (para_pr(20, align="CENTER") + para_pr(21, 1500)
             + para_pr(22, 3000) + para_pr(23, 4500))
hdr = hdr.replace("</hh:paraProperties>", add_paras + "</hh:paraProperties>", 1)
hdr = re.sub(r'(<hh:paraProperties itemCnt=")\d+(")', r'\g<1>24\g<2>', hdr, count=1)

# 1-4 테두리: 원본 borderFill(id=1)은 사방 NONE 이라 표 선이 안 그려진다.
#   id=2 본문 셀(실선) · id=3 머리 셀(실선 + 연회색 음영)
def border_fill(bid, face="none"):
    sides = "".join(
        f'<hh:{d}Border type="SOLID" width="0.12 mm" color="#000000"/>'
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
BF_BODY, BF_HEAD = 2, 3

# ---------- 2. section0.xml : 본문 ----------
sec = _read("Contents/section0.xml")
prolog = sec[:sec.index("<hp:p ")]                     # xml 선언 + <hs:sec ...>
secpr = re.search(r'<hp:secPr\b.*?</hp:secPr>', sec, re.S).group(0)
colpr = re.search(r'<hp:ctrl><hp:colPr\b.*?</hp:ctrl>', sec, re.S).group(0)

def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

_pid = iter(range(1000))

def para(text, char, parapr, prefix=""):
    """문단 하나. prefix 는 첫 run 앞에 넣을 원시 XML(secPr 등)."""
    cid = CH[char][0]
    run = f'<hp:run charPrIDRef="{cid}"><hp:t>{esc(text)}</hp:t></hp:run>'
    return (f'<hp:p id="{next(_pid)}" paraPrIDRef="{parapr}" styleIDRef="0" '
            f'pageBreak="0" columnBreak="0" merged="0">{prefix}{run}</hp:p>')

# 표: 3열 × 6행(머리 1 + 분야 5). 셀에 토큰을 넣어 set-cell·replace-text 둘 다 되게 한다
# 본문 폭 = 쪽폭 59528 - 좌우 여백 8504*2 = 42520. 표 문단 들여쓰기 1500 을 뺀다
COLW = [7200, 14000, 21320]
ROWH = 1600
TBL_W, TBL_H = sum(COLW), ROWH * 6
HEADERS = ["분야", "진행상황", "관문"]
FIELDS = ["군공항", "산단·인허가", "전력", "용수", "건축·가동"]

def cell(text, r, c, char):
    cid = CH[char][0]
    pa = PA_CENTER if (r == 0 or c < 2) else PA_L0
    p = (f'<hp:p id="0" paraPrIDRef="{pa}" styleIDRef="0" pageBreak="0" columnBreak="0" '
         f'merged="0"><hp:run charPrIDRef="{cid}"><hp:t>{esc(text)}</hp:t></hp:run></hp:p>')
    return (f'<hp:tc name="" header="{1 if r == 0 else 0}" hasMargin="0" protect="0" '
            f'editable="0" dirty="0" borderFillIDRef="{BF_HEAD if r == 0 else BF_BODY}">'
            f'<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" '
            f'linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" '
            f'hasTextRef="0" hasNumRef="0">{p}</hp:subList>'
            f'<hp:cellAddr colAddr="{c}" rowAddr="{r}"/><hp:cellSpan colSpan="1" rowSpan="1"/>'
            f'<hp:cellSz width="{COLW[c]}" height="{ROWH}"/>'
            f'<hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc>')

rows = ["<hp:tr>" + "".join(cell(h, 0, c, "smallb") for c, h in enumerate(HEADERS)) + "</hp:tr>"]
for i, f in enumerate(FIELDS, start=1):
    rows.append("<hp:tr>" + cell(f, i, 0, "small")
                + cell(f"{{{{S{i}}}}}", i, 1, "small")
                + cell(f"{{{{G{i}}}}}", i, 2, "small") + "</hp:tr>")

tbl = (f'<hp:tbl id="1" zOrder="0" numberingType="NONE" textWrap="TOP_AND_BOTTOM" '
       f'textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" '
       f'rowCnt="6" colCnt="3" cellSpacing="0" borderFillIDRef="1" noAdjust="0">'
       f'<hp:sz width="{TBL_W}" widthRelTo="ABSOLUTE" height="{TBL_H}" heightRelTo="ABSOLUTE" protect="0"/>'
       f'<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" '
       f'holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" '
       f'vertOffset="0" horzOffset="0"/>'
       f'<hp:outMargin left="0" right="0" top="141" bottom="141"/>'
       f'<hp:inMargin left="141" right="141" top="141" bottom="141"/>'
       + "".join(rows) + "</hp:tbl>")

tbl_para = (f'<hp:p id="{next(_pid)}" paraPrIDRef="{PA_L1}" styleIDRef="0" pageBreak="0" '
            f'columnBreak="0" merged="0"><hp:run charPrIDRef="{CH["small"][0]}">{tbl}</hp:run></hp:p>')

body = []
body.append(para("{{TITLE}}", "title", PA_CENTER, prefix=
                 f'<hp:run charPrIDRef="{CH["title"][0]}">{secpr}{colpr}</hp:run>'))
body.append(para("{{SUBTITLE}}", "sub", PA_CENTER))
body.append(para("", "gap5", PA_L0))

body.append(para("□ 주요 보도내용", "head", PA_L0))
for i in (1, 2, 3):
    body.append(para(f"{{{{R{i}H}}}}", "bullet", PA_L1))
    body.append(para(f"{{{{R{i}B}}}}", "body", PA_L2))
body.append(para("", "gap5", PA_L0))

body.append(para("□ 분야별 절차 진행상황", "head", PA_L0))
body.append(tbl_para)
# ▲(상세 내용 기술) 단계는 양식에 있으나 일일 보고에서는 상용문구뿐이라 쓰지 않는다.
# 필요해지면 여기에 para("{{TDETAIL}}", "body", PA_L3) 한 줄을 되살리면 된다.
body.append(para("", "gap5", PA_L0))

body.append(para("□ 리스크·갈등", "head", PA_L0))
for i in (1, 2, 3):
    body.append(para(f"{{{{RK{i}}}}}", "body", PA_L2))
    body.append(para(f"{{{{RK{i}N}}}}", "small", PA_L3))   # * (N50) 관문 이름
body.append(para("", "gap5", PA_L0))

body.append(para("□ 조치 필요사항", "head", PA_L0))
for i in (1, 2):
    body.append(para(f"{{{{AC{i}}}}}", "body", PA_L2))
body.append(para("", "gap3", PA_L0))
body.append(para("{{PIPE}}", "small", PA_L3))          # ※ 판 수치

sec_xml = prolog + "".join(body) + "</hs:sec>"

# ---------- 3. 패키징 ----------
patched = {"Contents/header.xml": hdr, "Contents/section0.xml": sec_xml}
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("mimetype", _zin.read("mimetype"), compress_type=zipfile.ZIP_STORED)
    for it in _zin.infolist():
        if it.filename == "mimetype":
            continue
        z.writestr(it.filename, patched.get(it.filename, _zin.read(it.filename)))

print(f"{OUT} ({OUT.stat().st_size:,} bytes) · 문단 {len(body)} · 표 6×3")
