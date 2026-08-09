#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
node_org_annotate.py — 제도 프로세스 노드 수준의 조직 주석 (L2 수행 매핑)

제도 업무구조도의 각 노드에 두 신호를 주석한다:
  1) ruleOwner(소관): 노드 legal_basis의 법령 → 법령ID → 직제 소관 과
     = "이 단계의 규칙을 소유한 조직" (orgchart-generator 소관법령 지도 기준)
  2) performer(수행): lane/actor 문언 분류 — 부처 내부 수행인지,
     지자체·민간·위원회 등 외부 행위자 수행인지
소관 과 ≠ 수행 주체인 노드를 구분하는 것이 수행체계 관점의 핵심이다.

사용:
  python3 tools/node_org_annotate.py \
      --orgchart ~/orgchart-generator/outputs/행정안전부-2026-소관법령.json \
      --out web/data/org-lineage/mois-nodes.json
"""
import argparse, glob, json, os, re, sys
from collections import defaultdict

MINISTRY_PAT = re.compile(r"행정안전부|행안부|중앙재난안전대책본부|중앙대책본부|소방청|경찰청")
# 앞선 규칙이 우선한다. 좁은 주체부터 넓은 주체 순으로 배열하고,
# '기관'처럼 넓게 걸리는 말은 뒤로 미뤄 구체적인 분류가 먼저 잡히게 한다.
PERFORMER_RULES = [
    ("court", re.compile(r"법원|검찰|검사|사법|재판부")),
    ("ministry", MINISTRY_PAT),
    ("local-gov", re.compile(
        r"지방자치단체|지자체|시·도|시도지사|시·도지사|시장·군수|시·군·구|시군구|읍·면·동|읍면동|"
        r"보건소|광역|기초|보장기관|지방기관|지방의회")),
    ("council", re.compile(r"의회|국회|선관위|선거관리")),
    ("committee", re.compile(r"위원회|평가단|심의회|심의|심사위|분쟁조정|자문단|심판원")),
    ("system", re.compile(r"시스템|정보시스템|전산|플랫폼|포털")),
    ("public-org", re.compile(
        r"공단|공사|공제회|진흥원|연구원|협회|재단|센터|공공기관|전문기관|검사기관|조사기관|감리법인|"
        r"대행자|수행기관|의료기관|대학|산학협력단|연구개발기관|연구기관|교육기관|학교")),
    ("central-gov", re.compile(
        r"중앙행정기관|중앙부처|중앙관서|주관부처|관계부처|주무부처|행정청|행정기관|관계기관|책임기관|감독기관|"
        r"국무조정실|국가정보원|주관기관|소관 ?부서|담당부서|인사부서|임용권자|출동대|소방서|"
        r"과세관청|세무서|재외공관|출입국|감독|청문|허가기관|승인기관|등록기관|접수기관|처분청|"
        r"[가-힣]{2,}(?:부|처|청)\b|기관")),
    ("public", re.compile(
        r"주민|국민|신청인|청구인|사업자|이용자|농가|당사자|민간|피해자|취득자|창업자|영업자|소유자|"
        r"신고인|납세자|가입자|수급자|응시자|참여자|근로자|기업|법인|조합|개인|"
        r"임차인|임대인|차주|양도자|양수인|채무자|채권자|저작자|신청자|매도인|매수인|"
        r"사업주|사업시행자|사업주체|시공|발주자|수급인|고객|환자|학생|외국인")),
]


def norm(s):
    s = re.sub(r"\s+", "", s or "").replace("ㆍ", "·").replace("・", "·")
    return re.sub(r"\([^)]*\)$", "", s)


def classify_performer(text):
    hits = []
    for label, pat in PERFORMER_RULES:
        m = pat.search(text)
        if m:
            hits.append((label, m.group(0)))
    if not hits:
        return "other", None
    return hits[0][0], hits[0][1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--orgchart", required=True, help="소관법령 결합 기구도 JSON")
    ap.add_argument("--institutions", default=None)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    inst_dir = args.institutions or os.path.join(repo, "web", "data", "institutions")

    org = json.load(open(os.path.expanduser(args.orgchart), encoding="utf-8"))
    nodes = {n["id"]: n for n in org["nodes"]}
    parent = {}
    for e in org["edges"]:
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

    # 법령ID·법령명 양쪽 인덱스 (노드 legal_basis에는 lawId가 없어 명칭 폴백 필요)
    by_law_id, by_law_name = defaultdict(list), defaultdict(list)
    for n in org["nodes"]:
        lr = (n.get("metadata") or {}).get("lawResponsibility")
        if not lr:
            continue
        for law in lr.get("laws", []):
            ent = (n["id"], law.get("법령명", ""), law.get("담당범위", ""))
            by_law_id[law["법령ID"]].append(ent)
            by_law_name[norm(law.get("법령명", ""))].append(ent)

    result, totals = {}, defaultdict(int)
    for f in sorted(glob.glob(os.path.join(inst_dir, "*.json"))):
        try:
            d = json.load(open(f, encoding="utf-8"))
        except Exception:
            continue
        name_to_id = {}
        for s in (d.get("verification") or {}).get("sources") or []:
            if s.get("lawId"):
                name_to_id[norm(s.get("law") or s.get("officialName") or "")] = s["lawId"]
        proc = d.get("process") or {}
        annotated, inst_hit = [], False
        for nd in proc.get("nodes") or []:
            owners = {}
            for lb in nd.get("legal_basis") or []:
                lname = norm(lb.get("law", ""))
                ents = by_law_id.get(name_to_id.get(lname, ""), []) or by_law_name.get(lname, [])
                for nid, law_name, scope in ents:
                    o = owners.setdefault(nid, {
                        "unit": nodes[nid]["name"], "path": path_of(nid), "laws": [],
                    })
                    ent2 = {"law": law_name}
                    if scope:
                        ent2["scope"] = scope
                    if ent2 not in o["laws"]:
                        o["laws"].append(ent2)
            perf_text = f"{nd.get('lane','')} {nd.get('actor','')}"
            performer, keyword = classify_performer(perf_text)
            if owners:
                inst_hit = True
            annotated.append({
                "id": nd.get("id"), "name": nd.get("name"),
                "lane": nd.get("lane"), "actor": nd.get("actor"), "stage": nd.get("stage"),
                "type": nd.get("type"), "status": nd.get("status"),
                # 단계의 성격 신호 — 전개도의 띠에서 색 외의 표식으로 쓴다
                "hasDeadline": bool(nd.get("deadline")),
                "deadline": nd.get("deadline"),
                "hasBlocker": bool(nd.get("blocker")),
                "performer": performer, "performerKeyword": keyword,
                "ruleOwners": sorted(owners.values(), key=lambda o: o["unit"]),
            })
            totals["nodes"] += 1
            totals[f"perf:{performer}"] += 1
            if owners:
                totals["nodesWithOwner"] += 1
                if performer == "ministry":
                    totals["ministryPerformedOwned"] += 1
        # 회귀(loop) 엣지를 노드 순서상의 위치로 환산해 둔다. 전개도가 띠 아래에
        # 되돌아가는 호를 그릴 수 있어야 "이 제도는 어디서 되돌아가는가"가 보인다.
        idx_of = {nd.get("id"): i for i, nd in enumerate(proc.get("nodes") or [])}
        loops = []
        for e in proc.get("edges") or []:
            if e.get("type") != "loop":
                continue
            si, ti = idx_of.get(e.get("source")), idx_of.get(e.get("target"))
            if si is None or ti is None:
                continue
            loops.append({"from": si, "to": ti, "label": e.get("label")})

        if inst_hit:
            result[d.get("slug")] = {
                "name": d.get("name"),
                "nodes": annotated,
                "loops": loops,
                "internalRatio": round(
                    sum(1 for a in annotated if a["performer"] == "ministry") / max(len(annotated), 1), 3),
                "ownerCoverage": round(
                    sum(1 for a in annotated if a["ruleOwners"]) / max(len(annotated), 1), 3),
            }

    out = {
        "meta": {
            "orgSource": os.path.basename(os.path.expanduser(args.orgchart)),
            "orgAsOf": org.get("meta", {}).get("asOf"),
            "institutionCount": len(result),
            "totals": dict(totals),
            "signals": {
                "ruleOwner": "legal_basis 법령 → 직제 소관 과 (규칙 소유)",
                "performer": "lane/actor 키워드 분류 (수행 주체 유형)",
            },
        },
        "bySlug": result,
    }
    out_path = os.path.expanduser(args.out)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    json.dump(out, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"제도 {len(result)}건 / 노드 {totals['nodes']}건 주석 "
          f"(소관 연결 {totals['nodesWithOwner']}건, 부처 수행+소관 일치 {totals['ministryPerformedOwned']}건)", file=sys.stderr)
    print(f"저장: {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
