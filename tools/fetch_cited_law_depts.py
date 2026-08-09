#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_cited_law_depts.py — 제도가 실제 인용하는 법령만 골라 연락부서를 받는다.

전 부처의 모든 법령(5,600건)을 받을 필요가 없다. korea100 카드가 가리키는
법령ID는 523건뿐이므로 그것만 조회하면 제도 → 부처 → 부서(과)가 완성된다.
부서를 실·국까지 올리는 일은 부처별 기구도와 맞추는 다음 단계에서 한다.

사용:
  python3 tools/fetch_cited_law_depts.py --out web/data/org-lineage/law-depts.json
"""
import argparse, glob, json, os, re, sys, time, urllib.parse, urllib.request
import xml.etree.ElementTree as ET

BASE = "https://www.law.go.kr/DRF"
UA = {"User-Agent": "Mozilla/5.0 (korea100-cited-depts)"}
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def fetch(url, retries=3, timeout=60):
    for i in range(retries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read().decode("utf-8", "replace")
        except Exception:
            if i == retries - 1:
                raise
            time.sleep(1.5 * (i + 1))


def tx(el, tag):
    x = el.find(tag)
    return (x.text or "").strip() if x is not None and x.text else ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--oc", default="test")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    cited = set()
    for f in glob.glob(os.path.join(REPO, "web", "data", "institutions", "*.json")):
        try:
            d = json.load(open(f, encoding="utf-8"))
        except Exception:
            continue
        for s in (d.get("verification") or {}).get("sources") or []:
            if s.get("lawId"):
                cited.add(s["lawId"])
    cited = sorted(cited)
    print(f"인용 법령 {len(cited)}건 조회", file=sys.stderr)

    by_law, fails = {}, []
    for i, lid in enumerate(cited, 1):
        try:
            root = ET.fromstring(fetch(f"{BASE}/lawService.do?" + urllib.parse.urlencode(
                {"OC": args.oc, "target": "law", "ID": lid, "type": "XML", "JO": "000100"})))
        except Exception as e:
            fails.append({"lawId": lid, "error": str(e)[:80]})
            continue
        depts = []
        for du in root.findall(".//기본정보//연락부서/부서단위"):
            raw = tx(du, "부서명")
            # "소속기구 과명-담당범위" 꼴이므로 담당범위를 떼어 둔다
            base, scope = (raw.split("-", 1) + [""])[:2] if "-" in raw else (raw, "")
            depts.append({
                "부처명": tx(du, "소관부처명"),
                "부처코드": tx(du, "소관부처코드"),
                "부서명": base.strip(),
                "부서원문": raw,
                "담당범위": scope.strip() or None,
                "연락처": tx(du, "부서연락처") or None,
            })
        if depts:
            by_law[lid] = depts
        if i % 50 == 0:
            print(f"\r{i}/{len(cited)}", end="", file=sys.stderr, flush=True)
        time.sleep(0.06)
    print(file=sys.stderr)

    out = {
        "meta": {
            "source": "법제처 국가법령정보 DRF lawService 연락부서 (제도 인용 법령 한정)",
            "citedLaws": len(cited),
            "resolved": len(by_law),
            "failed": fails,
            "note": "부서명은 과 단위. 실·국으로 올리려면 부처별 기구도와 대조해야 한다.",
        },
        "byLawId": by_law,
    }
    os.makedirs(os.path.dirname(os.path.expanduser(args.out)), exist_ok=True)
    json.dump(out, open(os.path.expanduser(args.out), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"연락부서 확보 {len(by_law)}/{len(cited)}건 (실패 {len(fails)}) → {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
