/**
 * Lightweight Korea100-ish process SVG for news-draft models.
 * Deterministic, no sharp dependency.
 */

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&" + "amp;")
    .replaceAll("<", "&" + "lt;")
    .replaceAll(">", "&" + "gt;")
    .replaceAll('"', "&" + "quot;");
}

function wrap(text, max = 14) {
  const s = String(text ?? "");
  if (s.length <= max) return [s];
  const lines = [];
  let rest = s;
  while (rest.length > max && lines.length < 3) {
    lines.push(rest.slice(0, max));
    rest = rest.slice(max);
  }
  if (rest && lines.length < 3) lines.push(rest);
  return lines;
}

export function renderProcessDraftSvg(institution) {
  const process = institution.process ?? {};
  const lanes = process.lanes?.length ? process.lanes : ["절차"];
  const nodes = process.nodes ?? [];
  const edges = process.edges ?? [];

  const width = 1400;
  const headerH = 120;
  const footerH = 70;
  const laneHeaderH = 36;
  const colW = Math.floor((width - 40) / Math.max(lanes.length, 1));
  const cardW = Math.min(240, colW - 30);
  const cardH = 78;
  const vGap = 36;
  const top = headerH + 30;

  const byLane = Object.fromEntries(lanes.map((lane) => [lane, []]));
  for (const node of nodes) {
    const lane = byLane[node.lane] ? node.lane : lanes[0];
    byLane[lane].push(node);
  }

  const positions = new Map();
  let maxRows = 1;
  lanes.forEach((lane, li) => {
    const list = byLane[lane] ?? [];
    maxRows = Math.max(maxRows, list.length);
    list.forEach((node, ni) => {
      const x = 20 + li * colW + (colW - cardW) / 2;
      const y = top + laneHeaderH + 16 + ni * (cardH + vGap);
      positions.set(node.id, {
        x,
        y,
        w: cardW,
        h: cardH,
        cx: x + cardW / 2,
        cy: y + cardH / 2,
      });
    });
  });

  const height = top + laneHeaderH + 16 + maxRows * (cardH + vGap) + footerH;

  const laneHeaders = lanes
    .map((lane, li) => {
      const x = 20 + li * colW;
      return `<rect x="${x}" y="${top}" width="${colW - 8}" height="${laneHeaderH}" rx="8" fill="#0f3d2e"/>
      <text x="${x + (colW - 8) / 2}" y="${top + 24}" text-anchor="middle" fill="#e8f5ef" font-size="15" font-family="Apple SD Gothic Neo, sans-serif">${esc(lane)}</text>`;
    })
    .join("\n");

  const cards = nodes
    .map((node) => {
      const p = positions.get(node.id);
      if (!p) return "";
      const lines = wrap(node.name, 12);
      const text = lines
        .map(
          (line, i) =>
            `<text x="${p.cx}" y="${p.y + 34 + i * 18}" text-anchor="middle" fill="#10241c" font-size="15" font-family="Apple SD Gothic Neo, sans-serif">${esc(line)}</text>`,
        )
        .join("");
      return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="12" fill="#ffffff" stroke="#1b5e45" stroke-width="2"/>
      <rect x="${p.x}" y="${p.y}" width="8" height="${p.h}" rx="2" fill="#c9a227"/>
      ${text}
      <text x="${p.cx}" y="${p.y + p.h - 12}" text-anchor="middle" fill="#6b7c74" font-size="11" font-family="Apple SD Gothic Neo, sans-serif">${esc(node.id)} · draft</text>`;
    })
    .join("\n");

  const arrows = edges
    .map((edge) => {
      const a = positions.get(edge.source);
      const b = positions.get(edge.target);
      if (!a || !b) return "";
      const x1 = a.cx;
      const y1 = a.y + a.h;
      const x2 = b.cx;
      const y2 = b.y;
      if (Math.abs(x1 - x2) < 4) {
        return `<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="#1b5e45" stroke-width="2.5" fill="none" marker-end="url(#arrow)"/>`;
      }
      const midY = (y1 + y2) / 2;
      return `<path d="M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}" stroke="#1b5e45" stroke-width="2.5" fill="none" marker-end="url(#arrow)"/>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#1b5e45"/>
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="#f4f7f5"/>
  <rect x="0" y="0" width="${width}" height="${headerH}" fill="#0b2f24"/>
  <text x="40" y="48" fill="#f0f7f3" font-size="28" font-family="Apple SD Gothic Neo, sans-serif" font-weight="700">${esc(institution.name)}</text>
  <text x="40" y="82" fill="#b7d2c6" font-size="15" font-family="Apple SD Gothic Neo, sans-serif">${esc(institution.oneLiner || "")}</text>
  <text x="40" y="106" fill="#e2b84a" font-size="13" font-family="Apple SD Gothic Neo, sans-serif">INSTITUTION-DRAFT · 브리핑=발굴신호 · 등재 금지 · ${esc(institution.slug)}</text>
  ${laneHeaders}
  ${arrows}
  ${cards}
  <text x="40" y="${height - 28}" fill="#5c6b64" font-size="12" font-family="Apple SD Gothic Neo, sans-serif">Korea100 process draft from news candidate · human/law verification required</text>
</svg>
`;
}
