/**
 * 1800x2400 Korea100-style portrait process draft renderer (SVG string).
 * news-draft only. Not for production catalog promotion without verification.
 */

const WIDTH = 1800;
const HEIGHT = 2400;

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&" + "amp;")
    .replaceAll("<", "&" + "lt;")
    .replaceAll(">", "&" + "gt;")
    .replaceAll('"', "&" + "quot;");
}

function wrap(text, maxChars) {
  const s = String(text ?? "").trim();
  if (!s) return [""];
  const lines = [];
  let rest = s;
  while (rest.length > maxChars && lines.length < 3) {
    lines.push(rest.slice(0, maxChars));
    rest = rest.slice(maxChars);
  }
  if (rest && lines.length < 3) lines.push(rest);
  if (!lines.length) lines.push(s.slice(0, maxChars));
  return lines;
}

export function renderProcessDraftPortraitSvg(institution) {
  const process = institution.process ?? {};
  const lanes = process.lanes?.length ? process.lanes : ["절차"];
  const nodes = process.nodes ?? [];
  const edges = process.edges ?? [];
  const stages = process.stages?.length ? process.stages : ["절차"];

  const headerH = 220;
  const footerH = 120;
  const leftLabelW = 200;
  const gridLeft = 48;
  const gridRight = WIDTH - 48;
  const gridTop = headerH + 24;
  const gridBottom = HEIGHT - footerH;
  const gridW = gridRight - gridLeft;
  const bodyLeft = gridLeft + leftLabelW;
  const bodyW = gridW - leftLabelW;
  const colW = bodyW / Math.max(lanes.length, 1);
  const cardW = Math.min(300, colW - 36);
  const cardH = 110;
  const rowGap = 48;

  const byLane = Object.fromEntries(lanes.map((lane) => [lane, []]));
  for (const node of nodes) {
    const lane = byLane[node.lane] ? node.lane : lanes[0];
    byLane[lane].push(node);
  }

  const positions = new Map();
  let maxRows = 1;
  lanes.forEach((lane, li) => {
    const list = byLane[lane] ?? [];
    maxRows = Math.max(maxRows, list.length || 1);
    list.forEach((node, ni) => {
      const x = bodyLeft + li * colW + (colW - cardW) / 2;
      const y = gridTop + 70 + ni * (cardH + rowGap);
      positions.set(node.id, {
        x,
        y,
        w: cardW,
        h: cardH,
        cx: x + cardW / 2,
        cy: y + cardH / 2,
        bottom: y + cardH,
        top: y,
      });
    });
  });

  const usedBottom = gridTop + 70 + maxRows * (cardH + rowGap);
  const stageBlockH = Math.max(gridBottom - gridTop, usedBottom - gridTop + 40);

  const laneHeaders = lanes
    .map((lane, li) => {
      const x = bodyLeft + li * colW + 8;
      return `
      <rect x="${x}" y="${gridTop}" width="${colW - 16}" height="48" rx="10" fill="#0f3d2e"/>
      <text x="${x + (colW - 16) / 2}" y="${gridTop + 31}" text-anchor="middle" fill="#eaf6f0" font-size="20" font-family="Apple SD Gothic Neo, Pretendard, sans-serif">${esc(lane)}</text>`;
    })
    .join("\n");

  const stageLabels = stages
    .map((stage, i) => {
      const y = gridTop + 70 + i * Math.max(stageBlockH / stages.length, cardH + rowGap);
      return `
      <text x="${gridLeft + 16}" y="${y + 24}" fill="#35564a" font-size="18" font-family="Apple SD Gothic Neo, Pretendard, sans-serif">${esc(stage)}</text>`;
    })
    .join("\n");

  const cards = nodes
    .map((node) => {
      const p = positions.get(node.id);
      if (!p) return "";
      const titleLines = wrap(node.name, 11);
      const title = titleLines
        .map(
          (line, i) =>
            `<text x="${p.cx}" y="${p.y + 42 + i * 24}" text-anchor="middle" fill="#10241c" font-size="20" font-family="Apple SD Gothic Neo, Pretendard, sans-serif" font-weight="600">${esc(line)}</text>`,
        )
        .join("\n");
      const actor = wrap(node.actor || "", 14)[0];
      return `
      <rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="16" fill="#ffffff" stroke="#1b5e45" stroke-width="3"/>
      <rect x="${p.x}" y="${p.y}" width="12" height="${p.h}" rx="3" fill="#c9a227"/>
      ${title}
      <text x="${p.cx}" y="${p.y + p.h - 18}" text-anchor="middle" fill="#6b7c74" font-size="14" font-family="Apple SD Gothic Neo, Pretendard, sans-serif">${esc(node.id)} · ${esc(actor)} · draft</text>`;
    })
    .join("\n");

  const arrows = edges
    .map((edge) => {
      const a = positions.get(edge.source);
      const b = positions.get(edge.target);
      if (!a || !b) return "";
      const x1 = a.cx;
      const y1 = a.bottom;
      const x2 = b.cx;
      const y2 = b.top;
      if (Math.abs(x1 - x2) < 6) {
        return `<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="#1b5e45" stroke-width="3" fill="none" marker-end="url(#arrow)"/>`;
      }
      const midY = (y1 + y2) / 2;
      return `<path d="M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}" stroke="#1b5e45" stroke-width="3" fill="none" marker-end="url(#arrow)"/>`;
    })
    .join("\n");

  const source = institution.sourceNews?.title
    ? `출처 기사: ${institution.sourceNews.title}`
    : "출처: news candidate";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#1b5e45"/>
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="#f3f6f4"/>
  <rect x="0" y="0" width="${WIDTH}" height="${headerH}" fill="#0b2f24"/>
  <text x="56" y="70" fill="#f3faf6" font-size="42" font-family="Apple SD Gothic Neo, Pretendard, sans-serif" font-weight="700">${esc(institution.name)}</text>
  <text x="56" y="118" fill="#b9d6c8" font-size="24" font-family="Apple SD Gothic Neo, Pretendard, sans-serif">${esc((institution.oneLiner || "").slice(0, 70))}</text>
  <text x="56" y="158" fill="#e2b84a" font-size="20" font-family="Apple SD Gothic Neo, Pretendard, sans-serif">INSTITUTION-DRAFT · 법령 미검증 · 브리핑은 발굴신호 · 등재 금지</text>
  <text x="56" y="190" fill="#8fb5a4" font-size="18" font-family="Apple SD Gothic Neo, Pretendard, sans-serif">${esc(institution.slug)}</text>
  <rect x="${gridLeft}" y="${gridTop}" width="${gridW}" height="${Math.min(stageBlockH, gridBottom - gridTop)}" rx="18" fill="#eef4f1" stroke="#d5e2db"/>
  ${stageLabels}
  ${laneHeaders}
  ${arrows}
  ${cards}
  <rect x="0" y="${HEIGHT - footerH}" width="${WIDTH}" height="${footerH}" fill="#0b2f24"/>
  <text x="56" y="${HEIGHT - 68}" fill="#d7ebe2" font-size="20" font-family="Apple SD Gothic Neo, Pretendard, sans-serif">Korea100 process draft · 1800×2400</text>
  <text x="56" y="${HEIGHT - 34}" fill="#9fbfb1" font-size="16" font-family="Apple SD Gothic Neo, Pretendard, sans-serif">${esc(source.slice(0, 90))}</text>
</svg>
`;
}

export const PORTRAIT = { width: WIDTH, height: HEIGHT };
