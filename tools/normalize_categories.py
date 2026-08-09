#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
normalize_categories.py — 제도 카테고리 54종을 정본 14종 2단 체계로 정리.

배경:
  category는 스키마상 자유 문자열이라(validate-data.mjs는 존재 여부만 검사)
  100개 → 532개로 확장하는 배치마다 새 값이 생겨 54종으로 흩어졌다.
  홈 카탈로그는 이 값으로 필터 칩을 만들고 RegistryCatalog의 CATEGORY_COLORS로
  색을 입히는데, 색이 정의된 10종 외 44종은 전부 회색으로 떨어졌다.

정리 원칙:
  - 상위 category는 정본 14종으로 통일한다(원래 10종 + 확장 과정에서 실체가 생긴 4종:
    다부처·복합사업, 연구개발·행정, 금융·소비자, 문화·체육·관광).
  - 원래 값은 버리지 않고 categoryDetail로 보존한다. 상위값과 같으면 넣지 않는다.
  - 매핑되지 않은 값이 하나라도 있으면 실행을 중단한다(조용한 누락 금지).

사용:
  python3 tools/normalize_categories.py           # 미리보기 (파일 미수정)
  python3 tools/normalize_categories.py --write   # 적용
"""
import argparse, glob, json, os, sys
from collections import Counter, defaultdict

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INST_DIR = os.path.join(REPO, "web", "data", "institutions")
MANIFEST = os.path.join(REPO, "docs", "institutions-100-manifest.json")

# 정본 14종 → 흡수하는 원래 값들
CANON = {
    "국토·환경·안전": [
        "국토·환경·안전", "교통·인프라", "주택·도시", "재난·도시", "국토·교통",
        "교통·이동", "기후·안전", "지역·농촌",
    ],
    "복지와 사회보험": [
        "복지와 사회보험", "보건·의료", "보건·복지", "보건·안전", "가족·아동",
    ],
    "인허가·규제·산업": [
        "인허가·규제·산업", "사업·소비자", "농식품·산업", "에너지·산업",
        "중소기업·지역", "산업·지역", "산업·안보", "경제안보", "생활·동물·농림",
        "식품·복지",
    ],
    "노동·교육·인적자원": [
        "노동·교육·인적자원", "노동·고용", "교육", "교육·복지", "교육·재정",
        "교육·고용", "교육·산업", "고용·산업", "산업·고용",
    ],
    "지방자치와 지역": [
        "지방자치와 지역", "지방자치·주민참여", "지방재정", "지방·균형성장",
        "지방·인구", "행정·균형성장",
    ],
    "다부처·복합사업": ["다부처·복합사업"],
    "재정과 예산": ["재정과 예산", "재정·예산·조달"],
    "연구개발·행정": ["연구개발·행정"],
    "데이터·디지털·공공서비스": ["데이터·디지털·공공서비스", "디지털·개인정보"],
    "민원·권리구제·참여": ["민원·권리구제·참여"],
    "외교·국방·치안·생활 기반": ["외교·국방·치안·생활 기반", "출입국·병역"],
    "금융·소비자": ["금융·소비자", "경제안보·금융", "금융·복지"],
    "문화·체육·관광": ["문화·콘텐츠", "관광·문화", "체육·문화"],
    "국가 운영과 권력 통제": ["국가 운영과 권력 통제"],
}
TO_CANON = {old: new for new, olds in CANON.items() for old in olds}


def detect_indent(text, default=1):
    """파일마다 들여쓰기가 1칸/2칸으로 섞여 있어, 원본 폭을 그대로 유지한다."""
    for line in text.split("\n")[1:]:
        stripped = line.lstrip(" ")
        if stripped and stripped != line:
            return len(line) - len(stripped)
    return default


def load_all():
    insts = []
    for p in sorted(glob.glob(os.path.join(INST_DIR, "*.json"))):
        raw = open(p, encoding="utf-8").read()
        insts.append((p, json.loads(raw), detect_indent(raw)))
    manifest_raw = open(MANIFEST, encoding="utf-8").read()
    return insts, json.loads(manifest_raw), detect_indent(manifest_raw, 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    insts, manifest, man_indent = load_all()

    seen = {d.get("category") for _, d, _ in insts if d.get("category")}
    seen |= {e.get("category") for e in manifest if e.get("category")}
    unmapped = sorted(v for v in seen if v not in TO_CANON)
    if unmapped:
        sys.exit(f"오류: 매핑되지 않은 카테고리 {len(unmapped)}종 — {unmapped}\n"
                 f"CANON에 추가한 뒤 다시 실행하세요.")

    before, after = Counter(), Counter()
    moves = defaultdict(int)
    changed_files = 0

    for p, d, indent in insts:
        old = d.get("category")
        if not old:
            continue
        before[old] += 1
        new = TO_CANON[old]
        after[new] += 1
        if new == old and d.get("categoryDetail") is None:
            continue
        moves[(old, new)] += 1
        if not args.write:
            continue
        # 키 순서 보존: category 자리에 새 값을 넣고 바로 뒤에 categoryDetail을 둔다
        rebuilt = {}
        for k, v in d.items():
            if k == "category":
                rebuilt["category"] = new
                if new != old:
                    rebuilt["categoryDetail"] = old
            elif k == "categoryDetail":
                continue
            else:
                rebuilt[k] = v
        with open(p, "w", encoding="utf-8") as f:
            json.dump(rebuilt, f, ensure_ascii=False, indent=indent)
            f.write("\n")
        changed_files += 1

    man_changed = 0
    for e in manifest:
        old = e.get("category")
        if not old:
            continue
        new = TO_CANON[old]
        if new != old:
            e["category"] = new
            e["categoryDetail"] = old
            man_changed += 1
    if args.write and man_changed:
        with open(MANIFEST, "w", encoding="utf-8") as f:
            json.dump(manifest, f, ensure_ascii=False, indent=man_indent)
            f.write("\n")

    mode = "적용 완료" if args.write else "미리보기 — 파일 미수정, --write 로 적용"
    print(f"[{mode}]")
    print(f"카테고리 {len(before)}종 → {len(after)}종 · 제도 {sum(before.values())}건 "
          f"(변경 카드 {sum(moves.values())}건, 매니페스트 {man_changed}건)")
    print()
    print("정본 14종 분포")
    for k, v in after.most_common():
        print(f"  {v:4d}  {k}")
    print()
    print("흡수된 값 (원래 값 → 정본, categoryDetail에 보존)")
    for (old, new), c in sorted(moves.items(), key=lambda kv: -kv[1]):
        if old != new:
            print(f"  {c:4d}  {old}  →  {new}")


if __name__ == "__main__":
    main()
