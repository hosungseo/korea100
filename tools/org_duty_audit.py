#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
org_duty_audit.py — 과별 업무편람 + 직제 분장사무 ↔ 제도 수행체계 정합성 감사 (L3)

세 소스를 과(부서) 단위로 결합한다:
  - duties  : 직제 시행규칙 분장사무 (orgchart parse-duties.py 산출)
  - crosswalk: 제도 ↔ 소관 과 (org_institution_crosswalk.py 산출, bySlug/byUnit)
  - nodes   : 제도 프로세스 노드별 소관·수행 주석 (node_org_annotate.py 산출)

과마다:
  duties[]        직제가 명령한 분장사무 조문
  laws[]          그 과가 소관하는 법령(소관법령 지도)
  institutions[]  korea100에서 그 과로 연결된 제도(수행 노드 포함)
= "법령에서 역산한 자동 업무편람"

정합성 신호:
  institutionsWithoutDuty : 제도는 그 과로 연결됐는데 분장사무가 비어있음(파싱 누락 또는 소관 불명확)
  dutiesCount vs lawCount vs institutionCount : 과별 업무 부하의 세 축

사용:
  python3 tools/org_duty_audit.py \
      --duties ~/orgchart-generator/work/duties/행정안전부-20260721.json \
      --out web/data/org-lineage/mois-audit.json
"""
import argparse, json, os, re, sys
from collections import defaultdict

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def norm(s):
    return re.sub(r"\s+", "", s or "").replace("ㆍ", "·").replace("・", "·")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--duties", required=True)
    ap.add_argument("--crosswalk", default=os.path.join(REPO, "web/data/org-lineage/mois.json"))
    ap.add_argument("--nodes", default=os.path.join(REPO, "web/data/org-lineage/mois-nodes.json"))
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    duties = json.load(open(os.path.expanduser(args.duties), encoding="utf-8"))
    xwalk = json.load(open(args.crosswalk, encoding="utf-8"))
    nodes = json.load(open(args.nodes, encoding="utf-8"))

    duty_by_unit = {norm(u): (u, r) for u, r in duties["byUnit"].items()}

    # 과별 수행 노드 집계: slug -> unit(소관) 매핑을 nodes 주석에서 역산
    unit_nodes = defaultdict(list)  # unit -> [{slug, inst, node}]
    for slug, inst in nodes["bySlug"].items():
        for nd in inst["nodes"]:
            for o in nd["ruleOwners"]:
                unit_nodes[norm(o["unit"])].append({
                    "slug": slug, "institution": inst["name"],
                    "node": nd["name"], "performer": nd["performer"],
                })

    units = {}
    for unit_name, info in xwalk["byUnit"].items():
        key = norm(unit_name)
        dkey, drec = duty_by_unit.get(key, (None, None))
        insts = info["institutions"]
        rec = {
            "unit": unit_name,
            "path": info["path"],
            "article": drec["article"] if drec else None,
            "articleTitle": drec["articleTitle"] if drec else None,
            "duties": drec["duties"] if drec else [],
            "dutyCount": len(drec["duties"]) if drec else 0,
            "institutions": insts,
            "institutionCount": len(insts),
            "performedNodes": len(unit_nodes.get(key, [])),
            "hasDutyText": bool(drec),
        }
        units[unit_name] = rec

    # 감사 신호
    no_duty = [u for u, r in units.items() if r["institutionCount"] and not r["hasDutyText"]]
    audit = {
        "meta": {
            "dutiesSource": duties["meta"]["source"],
            "orgAsOf": xwalk["meta"].get("orgAsOf"),
            "unitCount": len(units),
            "unitsWithDuty": sum(1 for r in units.values() if r["hasDutyText"]),
            "unitsWithoutDutyButLinked": len(no_duty),
            "totalDuties": sum(r["dutyCount"] for r in units.values()),
            "note": "duties=직제 명령 · laws/institutions=법령·제도 역산 · 세 축의 불일치가 감사 소재",
        },
        "unitsWithoutDutyButLinked": sorted(no_duty),
        "byUnit": dict(sorted(units.items(), key=lambda kv: -kv[1]["institutionCount"])),
    }
    out_path = os.path.expanduser(args.out)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    json.dump(audit, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    m = audit["meta"]
    print(f"과 {m['unitCount']}곳 결합 (분장사무 보유 {m['unitsWithDuty']}, "
          f"제도연결됐으나 분장사무 공백 {m['unitsWithoutDutyButLinked']})", file=sys.stderr)
    print(f"저장: {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
