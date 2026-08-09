#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gov_wide_crosswalk.py — 전 부처 실·국 단위로 제도를 잇는다.

세 소스를 겹친다.
  law-ministries.json : 법령ID → 소관부처            (현행법령 전량 덤프)
  law-depts.json      : 법령ID → 연락부서(과)         (제도 인용 법령 한정)
  orgchart-generator/outputs/all/*.json : 부처별 기구도 (직제·시행규칙 파싱)

부서(과)는 기구도에서 계선을 거슬러 올라가 실·국으로 승격한다. 기구도에 없는
부서(한시조직·소속기관 등)는 버리지 않고 부처 직속으로 남기고 그 사실을 기록한다.

사용:
  python3 tools/gov_wide_crosswalk.py --out web/data/org-lineage/gov-wide.json
"""
import argparse, glob, json, os, re, sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from node_org_annotate import classify_performer  # 수행 주체 분류를 그대로 재사용한다

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(REPO, "web", "data", "org-lineage")
ORG_DIR = os.path.expanduser("~/orgchart-generator/outputs/all")

# 실·국 이상으로 인정할 단위. 직제상 계선 이름의 꼬리로 판정한다.
UNIT_TAIL = re.compile(r"(실|국|본부|단|관|처|청|원|과학관|위원회)$")
SKIP = {"장관", "차관", "차장", "청장", "처장", "위원장", "부위원장", "제1차관", "제2차관"}


def norm(s):
    return re.sub(r"\s+", "", s or "").replace("ㆍ", "·").replace("・", "·")


UNIT_SUFFIX = re.compile(r"(과|관|실|국|단|팀|센터|본부|처|청|위원회|담당관)$")


def dept_candidates(raw):
    """연락부서 문언에서 조직 단위로 볼 만한 후보를 뽑는다.

    표기가 한 가지가 아니다. '의약품정책과-식약처 총괄'처럼 단위가 앞에 오기도 하고
    '총괄-물환경정책과'처럼 담당범위가 앞에 오기도 하며, '식품안전정책과 법령 해석'처럼
    공백으로만 이어붙기도 한다. 그래서 잘라 낸 조각을 모두 후보로 두고,
    실제 기구도에 있는 이름과 맞는 것을 고른다.
    """
    out, seen = [], set()

    def add(x):
        x = x.strip(" ()[]{}·,")
        if x and x not in seen:
            seen.add(x)
            out.append(x)

    add(raw)
    parts = re.split(r"[-–—/]", raw)
    for p in parts:
        add(p)
        for tok in re.split(r"[,\s]+", p):
            add(tok)
    # 접미사로 끝나는 최장 연속 토막도 후보에 넣는다
    for m in re.finditer(r"[가-힣A-Za-z0-9·]+(?:과|관|실|국|단|팀|센터|본부|처|청|위원회|담당관)", raw):
        add(m.group(0))
    # 단위 접미사로 끝나는 후보를 먼저 시도하고, 긴 것부터 본다
    return sorted(out, key=lambda x: (0 if UNIT_SUFFIX.search(x) else 1, -len(x)))


def load_orgcharts():
    """부처명 → (부서명 정규화 → 실·국 경로) 색인."""
    charts = {}
    for path in sorted(glob.glob(os.path.join(ORG_DIR, "*.json"))):
        try:
            g = json.load(open(path, encoding="utf-8"))
        except Exception:
            continue
        # --decree로 지은 기구도는 meta.institution이 '행정기관'으로 뭉개진다.
        # 파일명이 부처명이므로 그것을 정본으로 쓴다.
        inst = os.path.basename(path)[:-5]
        nodes = {n["id"]: n for n in g["nodes"]}
        parent = {}
        for e in g["edges"]:
            parent.setdefault(e["child"], e["parent"])

        def path_of(nid):
            chain, cur, seen = [], nid, set()
            while cur and cur not in seen:
                seen.add(cur)
                n = nodes.get(cur)
                if not n:
                    break
                chain.append(n["name"])
                cur = parent.get(cur)
            return list(reversed(chain))

        index = {}
        for n in g["nodes"]:
            p = path_of(n["id"])
            # 계선에서 실·국 이상 단위만 남긴다
            spine = [x for x in p[1:] if x not in SKIP and UNIT_TAIL.search(x)]
            index[norm(n["name"])] = {
                "fullPath": p,
                "bureau": spine[0] if spine else None,
                "division": spine[1] if len(spine) > 1 else None,
                "spine": spine,
            }
        charts[norm(inst)] = {"institution": inst, "index": index, "nodeCount": len(g["nodes"])}
    return charts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    lawmin = json.load(open(os.path.join(D, "law-ministries.json"), encoding="utf-8"))["byLawId"]
    lawdept = json.load(open(os.path.join(D, "law-depts.json"), encoding="utf-8"))["byLawId"]
    charts = load_orgcharts()
    print(f"기구도 {len(charts)}개 부처 적재", file=sys.stderr)

    by_slug, by_unit = {}, defaultdict(lambda: {"ministry": None, "kind": None, "institutions": []})
    unmatched_depts = defaultdict(int)
    no_chart = defaultdict(int)

    for f in sorted(glob.glob(os.path.join(REPO, "web", "data", "institutions", "*.json"))):
        try:
            d = json.load(open(f, encoding="utf-8"))
        except Exception:
            continue
        slug = d.get("slug")
        seen_units = {}
        ministries = set()
        for s in (d.get("verification") or {}).get("sources") or []:
            lid = s.get("lawId")
            if not lid:
                continue
            law = lawmin.get(lid)
            if law:
                ministries |= set(law["부처명"])
            for dept in lawdept.get(lid, []):
                min_name = dept["부처명"]
                ministries.add(min_name)
                chart = charts.get(norm(min_name))
                if not chart:
                    no_chart[min_name] += 1
                    key = (min_name, min_name)
                    ent = seen_units.setdefault(key, {
                        "ministry": min_name, "unit": min_name, "level": "ministry",
                        "resolved": False, "laws": [],
                    })
                else:
                    hit = None
                    for cand in dept_candidates(dept["부서원문"]):
                        hit = chart["index"].get(norm(cand))
                        if hit:
                            break
                    if hit and hit["spine"]:
                        # 계선에서 가장 깊은 실·국을 단위로 삼는다.
                        # 행안부는 실 아래 국이 한 겹 더 있고(→ 국), 국토부는 실이 곧 그 단계다(→ 실).
                        unit = hit["spine"][-1]
                        level = "division" if len(hit["spine"]) > 1 else "bureau"
                        spine = hit["spine"]
                    else:
                        unmatched_depts[f'{min_name}/{dept["부서명"]}'] += 1
                        unit, level, spine = min_name, "ministry", []
                    key = (min_name, unit)
                    ent = seen_units.setdefault(key, {
                        "ministry": min_name, "unit": unit, "level": level,
                        "spine": spine, "resolved": level != "ministry", "laws": [],
                    })
                law_ent = {"lawId": lid, "law": law["법령명"] if law else s.get("law"),
                           "dept": dept["부서명"]}
                if dept.get("담당범위"):
                    law_ent["scope"] = dept["담당범위"]
                if law_ent not in ent["laws"]:
                    ent["laws"].append(law_ent)

        if not seen_units:
            continue
        # 수행 주체 구성 — 이 제도의 단계를 실제로 누가 움직이는가.
        # 조직 소관과 별개의 층이므로 부처 연결 여부와 무관하게 전 제도에서 계산한다.
        mix = defaultdict(int)
        for nd in (d.get("process") or {}).get("nodes") or []:
            perf, _ = classify_performer(f'{nd.get("lane","")} {nd.get("actor","")}')
            mix[perf] += 1
        by_slug[slug] = {
            "name": d.get("name"),
            "category": d.get("category"),
            "ministries": sorted(ministries),
            "units": sorted(seen_units.values(), key=lambda u: (u["ministry"], u["unit"])),
            "steps": sum(mix.values()),
            "performerMix": dict(sorted(mix.items(), key=lambda kv: -kv[1])),
        }
        for u in seen_units.values():
            k = f'{u["ministry"]} › {u["unit"]}'
            by_unit[k]["ministry"] = u["ministry"]
            by_unit[k]["kind"] = u["level"]
            by_unit[k]["institutions"].append({"slug": slug, "name": d.get("name")})

    ministry_inst = defaultdict(set)
    for slug, v in by_slug.items():
        for m in v["ministries"]:
            ministry_inst[m].add(slug)

    out = {
        "meta": {
            "institutionCount": len(by_slug),
            "unitCount": len(by_unit),
            "ministryCount": len(ministry_inst),
            "chartsLoaded": sorted(c["institution"] for c in charts.values()),
            "unmatchedDeptSamples": sorted(unmatched_depts.items(), key=lambda kv: -kv[1])[:25],
            "ministriesWithoutChart": sorted(no_chart.items(), key=lambda kv: -kv[1])[:25],
            "joinKey": "제도 verification.sources[].lawId → 법제처 소관부처·연락부서 → 부처별 직제 기구도의 실·국",
        },
        "ministryInstitutionCounts": {m: len(v) for m, v in
                                      sorted(ministry_inst.items(), key=lambda kv: -len(kv[1]))},
        "bySlug": by_slug,
        "byUnit": dict(sorted(by_unit.items(), key=lambda kv: -len(kv[1]["institutions"]))),
    }
    os.makedirs(os.path.dirname(os.path.expanduser(args.out)), exist_ok=True)
    json.dump(out, open(os.path.expanduser(args.out), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    resolved = sum(1 for v in by_unit.values() if v["kind"] != "ministry")
    print(f"제도 {len(by_slug)}건 · 부처 {len(ministry_inst)}곳 · 단위 {len(by_unit)}개"
          f"(실·국 확정 {resolved}) → {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
