#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
org_institution_crosswalk.py — korea100 제도 ↔ orgchart-generator 조직도 크로스워크

korea100 제도 카드의 verification.sources[].lawId 와
orgchart-generator 소관법령 지도(outputs/*-소관법령.json)의
nodes[].metadata.lawResponsibility.laws[].법령ID 를 법령ID 기준으로 조인해,
제도마다 "정부 조직 어디에 사는가"(계선 경로: 부처→실·국→과)를 산출한다.

사용:
  python3 tools/org_institution_crosswalk.py \
      --orgchart ~/orgchart-generator/outputs/행정안전부-20251125-소관법령.json \
      --out web/data/org-lineage/mois.json

출력 스키마:
  meta: 조직도 기준일·출처
  bySlug: 제도 slug → 담당 조직 단위 목록(계선 경로 포함)
  byUnit: 조직 단위 → 그 단위가 소관하는 korea100 제도 목록
"""
import argparse, glob, json, os, sys
from collections import defaultdict

def build_paths(org):
    """child id -> path of node names from root."""
    nodes = {n["id"]: n for n in org["nodes"]}
    parent = {}
    for e in org["edges"]:
        # keep the first (statutory) parent seen for a child
        parent.setdefault(e["child"], e["parent"])
    def path(nid):
        chain = []
        cur = nid
        seen = set()
        while cur and cur not in seen:
            seen.add(cur)
            n = nodes.get(cur)
            if not n:
                break
            chain.append(n["name"])
            cur = parent.get(cur)
        return list(reversed(chain))
    return nodes, path

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--orgchart", required=True, help="orgchart-generator 소관법령 JSON")
    ap.add_argument("--institutions", default=None, help="korea100 제도 JSON 디렉터리")
    ap.add_argument("--out", default=None, help="출력 경로 (기본: stdout 요약만)")
    args = ap.parse_args()

    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    inst_dir = args.institutions or os.path.join(repo, "web", "data", "institutions")

    org = json.load(open(os.path.expanduser(args.orgchart), encoding="utf-8"))
    nodes, path_of = build_paths(org)

    law2units = defaultdict(list)  # 법령ID -> [(node id, 법령명, 담당범위)]
    for n in org["nodes"]:
        lr = (n.get("metadata") or {}).get("lawResponsibility")
        if not lr:
            continue
        for law in lr.get("laws", []):
            law2units[law["법령ID"]].append((n["id"], law.get("법령명", ""), law.get("담당범위", "")))

    by_slug = {}
    by_unit = defaultdict(lambda: {"path": None, "institutions": []})
    files = sorted(glob.glob(os.path.join(inst_dir, "*.json")))
    for f in files:
        try:
            d = json.load(open(f, encoding="utf-8"))
        except Exception:
            continue
        slug = d.get("slug") or os.path.splitext(os.path.basename(f))[0]
        units = {}  # node id -> entry
        for s in (d.get("verification") or {}).get("sources") or []:
            lid = s.get("lawId")
            if not lid or lid not in law2units:
                continue
            for nid, law_name, scope in law2units[lid]:
                ent = units.setdefault(nid, {
                    "unit": nodes[nid]["name"],
                    "kind": nodes[nid].get("kind"),
                    "path": path_of(nid),
                    "laws": [],
                })
                law_ent = {"law": law_name, "lawId": lid}
                if scope:
                    law_ent["scope"] = scope
                if law_ent not in ent["laws"]:
                    ent["laws"].append(law_ent)
        if not units:
            continue
        by_slug[slug] = {
            "name": d.get("name"),
            "category": d.get("category"),
            "units": sorted(units.values(), key=lambda u: (len(u["path"]), u["unit"])),
        }
        for u in units.values():
            bu = by_unit[u["unit"]]
            bu["path"] = u["path"]
            bu["institutions"].append({
                "slug": slug,
                "name": d.get("name"),
                "laws": [l["law"] for l in u["laws"]],
            })

    # 제도 ↔ 제도 결합(카드의 related). 전개도의 세로축이 된다.
    # 이름으로 적혀 있어 slug로 되돌린 뒤, 이 부처에 연결된 집합 안팎을 나눈다.
    name_to_slug, related_raw = {}, {}
    for f in files:
        try:
            d = json.load(open(f, encoding="utf-8"))
        except Exception:
            continue
        name_to_slug[d.get("name")] = d.get("slug")
        related_raw[d.get("slug")] = d.get("related") or []

    unresolved = set()
    for slug in by_slug:
        inside, outside = [], []
        for r in related_raw.get(slug, []):
            target = name_to_slug.get(r)
            if target is None:
                unresolved.add(r)
            elif target in by_slug:
                inside.append(target)
            else:
                outside.append(target)
        by_slug[slug]["related"] = sorted(set(inside))
        by_slug[slug]["relatedOutside"] = sorted(set(outside))

    pairs = sorted({tuple(sorted((s, t))) for s, v in by_slug.items() for t in v["related"]})

    out = {
        "meta": {
            "orgInstitution": org.get("meta", {}).get("institution"),
            "orgAsOf": org.get("meta", {}).get("asOf")
                or (org.get("meta", {}).get("lawMap") or {}).get("asOf"),
            "orgSource": os.path.basename(os.path.expanduser(args.orgchart)),
            "institutionCount": len(by_slug),
            "unitCount": len(by_unit),
            "joinKey": "법제처 법령ID (korea100 verification.sources[].lawId ↔ orgchart lawResponsibility.laws[].법령ID)",
            "relationPairs": len(pairs),
            "relationUnresolved": sorted(unresolved)[:20],
        },
        "relations": [list(p) for p in pairs],
        "bySlug": by_slug,
        "byUnit": dict(sorted(by_unit.items())),
    }

    print(f"제도 {len(files)}건 중 {len(by_slug)}건이 {out['meta']['orgInstitution']} 조직 단위 {len(by_unit)}곳에 연결", file=sys.stderr)
    if args.out:
        out_path = os.path.expanduser(args.out)
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        json.dump(out, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print(f"저장: {out_path}", file=sys.stderr)
    else:
        json.dump(out["meta"], sys.stdout, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()
