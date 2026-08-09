#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""행안부 조직도 × korea100 제도 크로스워크 데모 페이지 생성.

web/data/org-lineage/mois.json 을 읽어, 제도를 소관하는 조직 단위만 남긴
계층 트리(부처→실·본부→국→과)에 제도 배지를 붙인 정적 HTML을 만든다.

사용: python3 artifacts/org-lineage-demo/build.py
출력: artifacts/org-lineage-demo/index.html
"""
import html, json, os

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(REPO, "web", "data", "org-lineage", "mois.json")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "index.html")
SITE = "https://hosungseo.github.io/korea100/model"

CATEGORY_COLORS = {
    "국토·환경·안전": "#e8a33d",
    "재정과 예산": "#5aa9e6",
    "민원·권리구제·참여": "#7bc47f",
    "국가 운영과 권력 통제": "#c792ea",
    "복지와 사회보험": "#ef8f8f",
    "데이터·디지털·공공서비스": "#4dd0c4",
}
DEFAULT_COLOR = "#9aa4b2"


def build_tree(by_unit):
    root = {"children": {}, "insts": []}
    for unit, info in by_unit.items():
        node = root
        for name in info["path"]:
            node = node["children"].setdefault(name, {"children": {}, "insts": []})
        node["insts"] = info["institutions"]
    return root


def render_insts(insts, cat_of):
    chips = []
    for i in sorted(insts, key=lambda x: x["name"]):
        color = CATEGORY_COLORS.get(cat_of.get(i["slug"], ""), DEFAULT_COLOR)
        title = " · ".join(i["laws"])
        chips.append(
            f'<a class="chip" style="--c:{color}" href="{SITE}/{i["slug"]}/"'
            f' title="{html.escape(title)}" target="_blank">{html.escape(i["name"])}</a>'
        )
    return f'<div class="chips">{"".join(chips)}</div>' if chips else ""


def render_node(name, node, cat_of, depth=0):
    kids = "".join(
        render_node(k, v, cat_of, depth + 1) for k, v in node["children"].items()
    )
    label_cls = "unit" if node["insts"] else "branch"
    count = f'<span class="count">{len(node["insts"])}</span>' if node["insts"] else ""
    return (
        f'<div class="node d{min(depth,6)}">'
        f'<div class="label {label_cls}">{html.escape(name)}{count}</div>'
        f"{render_insts(node['insts'], cat_of)}{kids}</div>"
    )


def main():
    d = json.load(open(DATA, encoding="utf-8"))
    cat_of = {slug: v.get("category") or "" for slug, v in d["bySlug"].items()}
    tree = build_tree(d["byUnit"])
    meta = d["meta"]
    # collapse the 장관/차관 spine: render from 부처 root directly
    root_name = meta["orgInstitution"]
    root = tree["children"].get(root_name, tree)
    # skip pass-through 장관→차관 chain nodes without institutions
    body_nodes = []
    def flatten_spine(node):
        for k, v in node["children"].items():
            if k in ("장관", "차관", "본부장") and not v["insts"]:
                flatten_spine(v)
            else:
                body_nodes.append((k, v))
    flatten_spine(root)
    body = "".join(render_node(k, v, cat_of) for k, v in sorted(body_nodes))

    legend = "".join(
        f'<span class="lg"><i style="background:{c}"></i>{html.escape(k)}</span>'
        for k, c in CATEGORY_COLORS.items()
    )
    page = f"""<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{root_name} 조직도 × 제도 100</title>
<style>
:root {{ color-scheme: dark; }}
* {{ box-sizing: border-box; margin: 0; }}
body {{ background:#12161f; color:#dbe2ec; font-family:"Apple SD Gothic Neo","Pretendard",sans-serif; padding:32px 24px 64px; }}
header {{ max-width:1080px; margin:0 auto 28px; }}
h1 {{ font-size:22px; font-weight:800; letter-spacing:-.02em; }}
h1 b {{ color:#5aa9e6; }}
.sub {{ color:#8b95a5; font-size:13px; margin-top:8px; line-height:1.6; }}
.legend {{ margin-top:12px; display:flex; flex-wrap:wrap; gap:10px 16px; font-size:12px; color:#aab4c4; }}
.lg i {{ display:inline-block; width:9px; height:9px; border-radius:3px; margin-right:5px; }}
main {{ max-width:1080px; margin:0 auto; }}
.node {{ position:relative; padding-left:22px; margin-top:10px; }}
.node::before {{ content:""; position:absolute; left:7px; top:0; bottom:6px; width:1px; background:#2a3242; }}
.node.d0 {{ padding-left:0; margin-top:26px; }}
.node.d0::before {{ display:none; }}
.label {{ display:inline-block; font-size:13px; padding:5px 12px; border-radius:8px; border:1px solid #2a3242; background:#1a2030; }}
.node.d0>.label {{ font-size:15px; font-weight:800; background:#213047; border-color:#33507a; }}
.label.unit {{ background:#1e2a1f; border-color:#3a5a3d; font-weight:700; }}
.count {{ margin-left:8px; font-size:11px; color:#7bc47f; font-weight:800; }}
.chips {{ display:flex; flex-wrap:wrap; gap:6px; margin:8px 0 4px 14px; max-width:900px; }}
.chip {{ font-size:12px; color:#dbe2ec; text-decoration:none; padding:3px 10px; border-radius:99px;
  border:1px solid color-mix(in srgb, var(--c) 55%, transparent); background:color-mix(in srgb, var(--c) 14%, transparent); }}
.chip:hover {{ background:color-mix(in srgb, var(--c) 30%, transparent); }}
footer {{ max-width:1080px; margin:48px auto 0; color:#5d6779; font-size:12px; line-height:1.7; }}
</style></head><body>
<header>
<h1>{root_name} 조직도 위에 얹은 <b>대한민국 제도 100</b></h1>
<div class="sub">제도 <b>{meta['institutionCount']}건</b>이 {root_name} 조직 단위 <b>{meta['unitCount']}곳</b>(과 수준)에 연결됩니다.
연결 방법: {html.escape(meta['joinKey'])} · 기구도 기준일 {meta['orgAsOf']} · 제도를 소관하는 계선만 표시</div>
<div class="legend">{legend}<span class="lg"><i style="background:{DEFAULT_COLOR}"></i>기타</span></div>
</header>
<main>{body}</main>
<footer>korea100 (hosungseo.github.io/korea100) × korean-government-orgchart (직제 법령→기구도 파서) 크로스워크 데모.
배지를 누르면 해당 제도의 한 장 구조도로 이동합니다.</footer>
</body></html>"""
    open(OUT, "w", encoding="utf-8").write(page)
    print(f"저장: {OUT} ({len(page)//1024}KB)")


if __name__ == "__main__":
    main()
