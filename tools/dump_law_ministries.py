#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
dump_law_ministries.py — 법제처 현행법령 전체의 소관부처를 한 번에 받아 둔다.

제도 카드는 verification.sources[].lawId로 법령을 가리킨다. 법령마다 소관부처가
붙어 있으므로, 현행법령 목록 한 벌만 있으면 별도 조회 없이
  제도 → 인용 법령 → 소관부처
를 전 부처 범위로 이을 수 있다. 부서(과) 단위까지 내려가려면 법령별 연락부서를
따로 받아야 하지만, 부처·실·국 단위 지도에는 이 목록으로 충분하다.

사용:
  python3 tools/dump_law_ministries.py --out web/data/org-lineage/law-ministries.json
"""
import argparse, json, os, sys, time, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from collections import Counter

BASE = "https://www.law.go.kr/DRF"
UA = {"User-Agent": "Mozilla/5.0 (korea100-law-ministries)"}


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

    by_law, page = {}, 1
    while True:
        root = ET.fromstring(fetch(f"{BASE}/lawSearch.do?" + urllib.parse.urlencode(
            {"OC": args.oc, "target": "law", "type": "XML", "display": "100", "page": str(page)})))
        total = int(tx(root, "totalCnt") or 0)
        rows = root.findall("law")
        for r in rows:
            lid = tx(r, "법령ID")
            if not lid:
                continue
            # 공동소관이면 코드·이름이 콤마로 이어져 온다
            codes = [c for c in tx(r, "소관부처코드").split(",") if c]
            names = [n for n in tx(r, "소관부처명").split(",") if n]
            by_law[lid] = {
                "법령명": tx(r, "법령명한글"),
                "법종": tx(r, "법령구분명"),
                "시행일자": tx(r, "시행일자"),
                "부처코드": codes,
                "부처명": names,
            }
        print(f"\r목록 {len(by_law)}/{total}", end="", file=sys.stderr, flush=True)
        if len(by_law) >= total or not rows:
            break
        page += 1
        time.sleep(0.05)
    print(file=sys.stderr)

    ministries = Counter()
    for v in by_law.values():
        for n in v["부처명"]:
            ministries[n] += 1

    out = {
        "meta": {
            "source": "법제처 국가법령정보 DRF lawSearch (현행법령 전량)",
            "lawCount": len(by_law),
            "ministryCount": len(ministries),
            "note": "공동소관 법령은 부처코드·부처명이 여러 개다",
        },
        "ministryLawCounts": dict(ministries.most_common()),
        "byLawId": by_law,
    }
    os.makedirs(os.path.dirname(os.path.expanduser(args.out)), exist_ok=True)
    json.dump(out, open(os.path.expanduser(args.out), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"법령 {len(by_law)}건 · 소관부처 {len(ministries)}곳 → {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
