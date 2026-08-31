#!/usr/bin/env python3
"""Korea100 ontology sample demo — no network, no secrets."""
from __future__ import annotations
import json
import sys
from pathlib import Path

CASE = Path(__file__).resolve().parents[1] / "samples" / "information-disclosure.case.json"

def load():
    return json.loads(CASE.read_text())

def state_map(data):
    return {s["entity_id"]: s for s in data["states"]}

def ent(data, eid):
    return next((e for e in data["entities"] if e["id"] == eid), None)

def packet(data, pid):
    return next((p for p in data["action_packets"] if p["id"] == pid), None)

def answer(data, q: str) -> str:
    qn = q.strip()
    sm = state_map(data)
    lines = []
    lines.append(f"institution: {data['institution_name']} ({data['institution_slug']})")
    lines.append(f"case: {data['case_id']}  as_of: {data['as_of']}")
    lines.append("")

    # match demo queries loosely
    if any(k in qn for k in ["뭐 하면", "부분공개", "비공개", "보완", "이의", "통지"]):
        ap = packet(data, "ap:claimant-after-partial")
        st = sm.get("case:IDC-2026-0901-001", {})
        dec = ent(data, "dec:partial-disclosure")
        lines.append("## Resolve")
        lines.append(f"- identify: case + {dec['id'] if dec else 'decision'}")
        lines.append(f"- state: {st.get('state')} (evidence={st.get('evidence',{}).get('kind')})")
        lines.append("- rules: rule:partial-opens-appeal, rule:receive-disclosed-part-first")
        lines.append(f"- action_packet: {ap['id']}")
        lines.append("")
        lines.append(f"## ActionPacket — {ap['title']}")
        lines.append(f"actor: {ap['actor']}")
        lines.append(f"why: {ap['why']}")
        lines.append("checklist:")
        for c in ap["checklist"]:
            lines.append(f"  - [ ] {c}")
        lines.append("evidence_needed:")
        for e in ap["evidence_needed"]:
            lines.append(f"  - {e}")
        lines.append(f"human_signoff: {ap['human_signoff']}")
        lines.append(f"auto_execute: {ap['auto_execute']}")
        return "\n".join(lines)

    if any(k in qn for k in ["어디", "단계", "상태", "지금"]):
        lines.append("## Current step states")
        for s in data["states"]:
            if s["entity_id"].startswith("step:") or s["entity_id"].startswith("case:") or s["entity_id"].startswith("dec:"):
                e = ent(data, s["entity_id"])
                label = e["label"] if e else s["entity_id"]
                lines.append(f"- {s['entity_id']} ({label}): **{s['state']}**")
        lines.append("")
        lines.append("next open: P10 수령 ready / P11 이의 available / P13·P14 심판·소송 available")
        return "\n".join(lines)

    # default summary
    lines.append("알려진 데모 질문:")
    for dq in data.get("demo_queries", []):
        lines.append(f"- {dq['q']}")
    lines.append("")
    lines.append("통계:")
    lines.append(f"- entities: {len(data['entities'])}")
    lines.append(f"- relations: {len(data['relations'])}")
    lines.append(f"- states: {len(data['states'])}")
    lines.append(f"- rules: {len(data['rules'])}")
    lines.append(f"- action_packets: {len(data['action_packets'])}")
    return "\n".join(lines)

def main(argv):
    data = load()
    q = " ".join(argv[1:]).strip() if len(argv) > 1 else "부분공개 통지 왔는데 뭐 하면 됨?"
    print(answer(data, q))

if __name__ == "__main__":
    main(sys.argv)
