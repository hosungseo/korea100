// 연결선·화살촉 단일 스펙 — 업무구조도의 세 렌더 경로(데스크톱 보드,
// 모바일 세로 보드, 공유용 프로세스 이미지)가 이 값을 함께 쓴다.
// 규칙 문서: docs/edge-style-rules.md — 값을 바꾸면 문서도 함께 갱신한다.

// 유형별 대표색. 선은 표면에 따라 옅은 톤을 쓸 수 있으나
// 화살촉은 항상 이 팔레트를 써서 진행 방향이 또렷이 읽히게 한다.
export const EDGE_TYPE_COLORS = {
  sequence: "#55685e",
  message: "#0d8a63",
  loop: "#2563eb",
};

// 유형별 대시 패턴(보드 기준). sequence는 실선.
export const EDGE_DASH = {
  sequence: "",
  message: "2 4",
  loop: "5 4",
};

// 화살촉: 꼭지각이 뾰족한 삼각형 + 흰 테두리(겹침 분리·배경 대비).
// refX를 촉끝 가까이에 두어, 촉끝이 경로 끝(=카드 경계)에 닿는다.
export const ARROW_HEAD = {
  d: "M1,1 L13,5.5 L1,10 Z",
  width: 14,
  height: 11,
  refX: 12,
  refY: 5.5,
  outline: "#ffffff",
  outlineWidth: 1.2,
};

// 경로 끝과 카드 경계의 최대 간격(px). 화살촉이 카드에서 떠 보이면 안 된다.
export const EDGE_END_INSET = 1;

// 같은 변으로 여러 선이 들어올 때의 세로 분산 간격(px). 촉 겹침 방지.
export const FAN_IN_GAP = 12;

// 이미지 등 고해상 표면에서 쓸 마커 마크업. scale로 촉 크기를 비례 확대.
export function arrowMarkerMarkup(id, color, scale = 1) {
  const w = ARROW_HEAD.width * scale;
  const h = ARROW_HEAD.height * scale;
  return `<marker id="${id}" viewBox="0 0 ${ARROW_HEAD.width} ${ARROW_HEAD.height}" markerWidth="${w}" markerHeight="${h}" refX="${ARROW_HEAD.refX}" refY="${ARROW_HEAD.refY}" orient="auto" markerUnits="userSpaceOnUse">
    <path d="${ARROW_HEAD.d}" fill="${color}" stroke="${ARROW_HEAD.outline}" stroke-width="${ARROW_HEAD.outlineWidth}" stroke-linejoin="round"/>
  </marker>`;
}
