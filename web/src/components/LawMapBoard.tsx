"use client";

import type { LawMap } from "@/lib/law-map-types";

export default function LawMapBoard({ map }: { map: LawMap; textUrl: string }) {
  return (
    <section style={{ padding: 24 }}>
      {map.lanes.map((lane) => (
        <p key={lane.id}>{lane.id} · {lane.name} · 조문 {lane.articleCount}</p>
      ))}
    </section>
  );
}
