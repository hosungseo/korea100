import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  buildProcessEdgeRouteSlots,
  buildProcessLaneGroups,
} from "../src/lib/process-layout.mjs";
import { arrowMarkerMarkup, EDGE_TYPE_COLORS } from "../src/lib/edge-style.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const dataDir = path.join(webRoot, "data/institutions");
const manifestPath = path.join(webRoot, "../docs/institutions-100-manifest.json");
const outputDir = path.join(webRoot, "public/exports/process-maps");
const WIDTH = 1800;
const HEIGHT = 2400;
const GRID_LEFT = 38;
const GRID_RIGHT = 1762;
const GRID_TOP = 260;
const GROUP_HEADER_HEIGHT = 100;
const STAGE_LABEL_WIDTH = 190;
const GROUP_X = GRID_LEFT + STAGE_LABEL_WIDTH;
const GRID_BOTTOM = 2200;
const STAGE_BODY_TOP = GRID_TOP + GROUP_HEADER_HEIGHT;
const STAGE_BODY_HEIGHT = GRID_BOTTOM - STAGE_BODY_TOP;
const CARD_WIDTH = 270;
const CARD_HEIGHT = 90;
const CARD_GAP = 24;
const STAGE_VERTICAL_SPACE = 40;
const MIN_STAGE_HEIGHT = 130;
const DEFAULT_LAYOUT_METRICS = Object.freeze({
  cardHeight: CARD_HEIGHT,
  cardGap: CARD_GAP,
  stageVerticalSpace: STAGE_VERTICAL_SPACE,
  minStageHeight: MIN_STAGE_HEIGHT,
});
// Preserve the 1800x2400 export while keeping dense, legally complete flows readable.
const COMPACT_LAYOUT_METRICS = Object.freeze({
  cardHeight: 86,
  cardGap: 20,
  stageVerticalSpace: 16,
  minStageHeight: 124,
});
// Dense diagrams retain the compact card height; only their inter-card and stage padding contracts.
const DENSE_LAYOUT_METRICS = Object.freeze({
  cardHeight: 86,
  cardGap: 16,
  stageVerticalSpace: 8,
  minStageHeight: 120,
});
const ARROW_CLEARANCE = 8;
const CARD_TEXT_WIDTH = CARD_WIDTH - 30;
const CARD_TITLE_SIZE = 15.5;
const CARD_TITLE_LINE_HEIGHT = 18;
const CARD_TITLE_DOUBLE_Y = 47;
const CARD_TITLE_SINGLE_Y = 57;
const CARD_FOOTER_SIZE = 11;
const CARD_FOOTER_Y = 82;
const EDGE_LABEL_HEIGHT = 30;
const EDGE_LABEL_GAP = 7;
const EDGE_PORT_GAP = 20;
const EDGE_CHANNEL_GAP = 16;
const EDGE_RAIL_GAP = 13;
const EDGE_RAIL_INSET = 18;
const MAX_COLLINEAR_EDGE_OVERLAP = 40;

const STATUS = {
  done: {
    label: "선행",
    fill: "#effaf5",
    border: "#35a77d",
    ink: "#123d2e",
    sub: "#287a5c",
  },
  current: {
    label: "핵심",
    fill: "#087452",
    border: "#087452",
    ink: "#ffffff",
    sub: "#d8f4e8",
  },
  waiting: {
    label: "후속",
    fill: "#ffffff",
    border: "#b9c7bf",
    ink: "#17231d",
    sub: "#627169",
  },
  risk: {
    label: "병목",
    fill: "#fff8e8",
    border: "#d9901a",
    ink: "#7a4305",
    sub: "#a96008",
  },
  loop: {
    label: "회귀",
    fill: "#edf4ff",
    border: "#3478db",
    ink: "#173f7a",
    sub: "#316bbd",
  },
};

const files = (await fs.readdir(dataDir))
  .filter((file) => file.endsWith(".json"))
  .sort();
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const categoryBySlug = new Map(
  manifest.map((entry) => [entry.slug, entry.category])
);

await fs.mkdir(outputDir, { recursive: true });
const generated = [];
for (let index = 0; index < files.length; index += 4) {
  const batch = files.slice(index, index + 4);
  const results = await Promise.all(batch.map(generateInstitutionImage));
  generated.push(...results);
}

if (generated.length !== manifest.length) {
  throw new Error(
    `세로형 PNG 수 ${generated.length}개와 manifest ${manifest.length}개가 다릅니다`
  );
}

console.log(`세로형 업무구조도 PNG 생성: ${generated.length}개 (${WIDTH}x${HEIGHT})`);
console.log(
  `텍스트 레이아웃 검증: 노드 ${generated.reduce((sum, item) => sum + item.audit.nodes, 0)}개 · ` +
    `단계 ${generated.reduce((sum, item) => sum + item.audit.stages, 0)}개 · ` +
    `행위자 묶음 ${generated.reduce((sum, item) => sum + item.audit.groups, 0)}개`
);
console.log(
  `연결 라벨 충돌 검증: ${generated.reduce((sum, item) => sum + item.audit.edgeLabels, 0)}개 · ` +
    `재배치 ${generated.reduce((sum, item) => sum + item.audit.adjustedEdgeLabels, 0)}개`
);
console.log(
  `연결선 분리 검증: ${generated.reduce((sum, item) => sum + item.audit.edgeRoutes, 0)}개 · ` +
    `장거리 우회 ${generated.reduce((sum, item) => sum + item.audit.longEdgeRoutes, 0)}개 · ` +
    "공선 겹침 0개"
);

async function generateInstitutionImage(file) {
  const institution = JSON.parse(await fs.readFile(path.join(dataDir, file), "utf8"));
  institution.category ??= categoryBySlug.get(institution.slug) ?? "기타";
  const process = institution.process;
  const groups = buildProcessLaneGroups(process?.lanes ?? [], institution.slug);
  if (!process || !groups?.length) {
    throw new Error(`프로세스 또는 레이아웃 설정 누락: ${institution.slug}`);
  }

  const context = buildLayout(institution, process, groups);
  const outputPath = path.join(outputDir, `${institution.slug}.png`);
  const svg = renderSvg(context);
  await sharp(Buffer.from(svg), { density: 144 })
    .resize(WIDTH, HEIGHT)
    .png({ compressionLevel: 9, quality: 100 })
    .toFile(outputPath);

  const metadata = await sharp(outputPath).metadata();
  if (metadata.width !== WIDTH || metadata.height !== HEIGHT) {
    throw new Error(`PNG 규격 오류: ${institution.slug}`);
  }
  return { outputPath, audit: context.textAudit };
}

function buildLayout(institution, process, groups) {
  const groupWidth = (GRID_RIGHT - GROUP_X) / groups.length;
  const stageIndex = new Map(process.stages.map((stage, index) => [stage, index]));
  const groupByLane = new Map(
    groups.flatMap((group, groupIndex) =>
      group.lanes.map((lane) => [lane, groupIndex])
    )
  );
  const nodesByCell = new Map();

  for (const node of process.nodes) {
    const rowIndex = stageIndex.get(node.stage);
    const groupIndex = groupByLane.get(node.lane);
    if (rowIndex === undefined || groupIndex === undefined) {
      throw new Error(`노드 배치 설정 누락: ${institution.slug}/${node.id}`);
    }
    const key = `${rowIndex}:${groupIndex}`;
    const cell = nodesByCell.get(key) ?? [];
    cell.push(node);
    nodesByCell.set(key, cell);
  }

  const maxCellCounts = process.stages.map((_, rowIndex) =>
    Math.max(
      1,
      ...groups.map(
        (_, groupIndex) => nodesByCell.get(`${rowIndex}:${groupIndex}`)?.length ?? 0
      )
    )
  );
  let layoutMetrics = DEFAULT_LAYOUT_METRICS;
  let desiredStageHeights = calculateDesiredStageHeights(
    maxCellCounts,
    layoutMetrics
  );
  let desiredTotal = desiredStageHeights.reduce((sum, height) => sum + height, 0);
  if (desiredTotal > STAGE_BODY_HEIGHT) {
    layoutMetrics = COMPACT_LAYOUT_METRICS;
    desiredStageHeights = calculateDesiredStageHeights(
      maxCellCounts,
      layoutMetrics
    );
    desiredTotal = desiredStageHeights.reduce((sum, height) => sum + height, 0);
  }
  if (desiredTotal > STAGE_BODY_HEIGHT) {
    layoutMetrics = DENSE_LAYOUT_METRICS;
    desiredStageHeights = calculateDesiredStageHeights(
      maxCellCounts,
      layoutMetrics
    );
    desiredTotal = desiredStageHeights.reduce((sum, height) => sum + height, 0);
  }
  if (desiredTotal > STAGE_BODY_HEIGHT) {
    throw new Error(
      `세로형 캔버스 높이 초과: ${institution.slug} (${desiredTotal}/${STAGE_BODY_HEIGHT})`
    );
  }
  const extraPerStage = (STAGE_BODY_HEIGHT - desiredTotal) / process.stages.length;
  const stageHeights = desiredStageHeights.map((height) => height + extraPerStage);
  const stageTops = [];
  let currentY = STAGE_BODY_TOP;
  for (const stageHeight of stageHeights) {
    stageTops.push(currentY);
    currentY += stageHeight;
  }

  const nodeLayout = new Map();
  for (const [key, cellNodes] of nodesByCell) {
    const [rowIndex, groupIndex] = key.split(":").map(Number);
    const stackHeight =
      cellNodes.length * layoutMetrics.cardHeight +
      (cellNodes.length - 1) * layoutMetrics.cardGap;
    const firstY = stageTops[rowIndex] + (stageHeights[rowIndex] - stackHeight) / 2;
    const x =
      GROUP_X +
      groupIndex * groupWidth +
      (groupWidth - CARD_WIDTH) / 2;
    cellNodes.forEach((node, nodeIndex) => {
      nodeLayout.set(node.id, {
        x,
        y:
          firstY +
          nodeIndex * (layoutMetrics.cardHeight + layoutMetrics.cardGap),
        width: CARD_WIDTH,
        height: layoutMetrics.cardHeight,
        stageIndex: rowIndex,
        groupIndex,
      });
    });
  }

  if (nodeLayout.size !== process.nodes.length) {
    throw new Error(`노드 배치 수 오류: ${institution.slug}`);
  }

  const context = {
    institution,
    process,
    groups,
    groupWidth,
    groupByLane,
    stageIndex,
    stageHeights,
    stageTops,
    layoutMetrics,
    nodeLayout,
    edgeRouteSlots: buildProcessEdgeRouteSlots(process.edges, nodeLayout),
  };
  context.edgeRouteAudit = validateEdgeRouteLayout(context);
  context.edgeLabelLayout = buildEdgeLabelLayout(context);
  context.textAudit = validateTextLayout(context);
  return context;
}

function calculateDesiredStageHeights(maxCellCounts, metrics) {
  return maxCellCounts.map((count) =>
    Math.max(
      metrics.minStageHeight,
      count * metrics.cardHeight +
        (count - 1) * metrics.cardGap +
        metrics.stageVerticalSpace
    )
  );
}

function renderSvg(context) {
  const { process } = context;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`,
    `<defs>
      <filter id="card-shadow" x="-20%" y="-25%" width="140%" height="160%">
        <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#12271e" flood-opacity="0.10"/>
      </filter>
      ${arrowMarker("arrow-sequence", EDGE_TYPE_COLORS.sequence)}
      ${arrowMarker("arrow-message", EDGE_TYPE_COLORS.message)}
      ${arrowMarker("arrow-loop", EDGE_TYPE_COLORS.loop)}
      <style>
        text { font-family: "Apple SD Gothic Neo", "Noto Sans CJK KR", "Noto Sans KR", sans-serif; }
        .mono { font-family: "SFMono-Regular", "Menlo", monospace; }
      </style>
    </defs>`,
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="#ffffff"/>`,
    `<rect x="0" y="0" width="${WIDTH}" height="240" fill="#07150f"/>`,
    `<rect x="0" y="0" width="${WIDTH}" height="9" fill="#18a87b"/>`,
    renderHeader(context),
    renderGrid(context),
    renderEdges(context),
    ...process.nodes.map((node) => renderNode(node, context)),
    renderFooter(context),
    `</svg>`,
  ].join("\n");
}

function arrowMarker(id, color) {
  // 화살촉 규칙 단일 스펙 사용 — 고해상 이미지라 1.25배 확대
  return arrowMarkerMarkup(id, color, 1.25);
}

function renderHeader({ institution, process }) {
  const titleSize = fitFontSize(institution.name, 48, 34, 1120);
  const oneLiner = fitTextToWidth(
    institution.oneLiner ?? institution.canvas?.purpose ?? "",
    1180,
    19
  );
  const article = institution.verification?.articleVerification;
  const verificationLabel = article
    ? `조문 검증 ${article.verifiedReferences}/${article.articleReferences}`
    : "공식 원문 연결";
  const category = fitTextToWidth(institution.category ?? "기타", 160, 14);
  const priority = String(institution.priority).padStart(2, "0");
  return `
    <text x="40" y="45" font-size="19" font-weight="800" fill="#ffffff">조달제도 100</text>
    <text x="252" y="45" font-size="15" font-weight="650" fill="#8fa299">업무구조도 · 세로판</text>
    <text x="1760" y="45" text-anchor="end" font-size="15" fill="#8fa299">기준일 ${escapeXml(institution.asOfDate)}</text>
    <text x="40" y="82" font-size="14" font-weight="750" fill="#8fa299">NO ${priority}</text>
    <text x="122" y="82" font-size="14" font-weight="750" fill="#6ee7b7">${escapeXml(category)}</text>
    <text x="320" y="82" font-size="14" font-weight="650" fill="#b7c7bf">${escapeXml(institution.type)}</text>
    <text x="40" y="132" font-size="${titleSize}" font-weight="850" fill="#ffffff">${escapeXml(institution.name)}</text>
    <text x="40" y="174" font-size="19" font-weight="520" fill="#b7c7bf">${escapeXml(oneLiner)}</text>
    <rect x="40" y="192" width="260" height="32" rx="5" fill="#0d2c20" stroke="#1f684e" stroke-width="1"/>
    <circle cx="58" cy="208" r="5" fill="#18a87b"/>
    <text x="72" y="214" font-size="14" font-weight="750" fill="#6ee7b7">${escapeXml(verificationLabel)}</text>
    <text x="1760" y="214" text-anchor="end" font-size="16" font-weight="750" fill="#dce7e1">노드 ${process.nodes.length} · 레인 ${process.lanes.length} · 게이트 ${process.stages.length}</text>
  `;
}

function renderGrid(context) {
  const { groups, process, groupWidth, stageHeights, stageTops } = context;
  const result = [
    `<rect x="${GRID_LEFT}" y="${GRID_TOP}" width="${GRID_RIGHT - GRID_LEFT}" height="${GRID_BOTTOM - GRID_TOP}" rx="10" fill="#ffffff" stroke="#b8c7bf" stroke-width="2"/>`,
    `<rect x="${GRID_LEFT}" y="${GRID_TOP}" width="${STAGE_LABEL_WIDTH}" height="${GROUP_HEADER_HEIGHT}" rx="10" fill="#eaf2ee"/>`,
    `<text x="58" y="299" font-size="17" font-weight="800" fill="#17231d">단계 ↓</text>`,
    `<text x="58" y="332" font-size="15" font-weight="650" fill="#68776f">행위자 묶음 →</text>`,
  ];

  process.stages.forEach((stage, rowIndex) => {
    const y = stageTops[rowIndex];
    const height = stageHeights[rowIndex];
    const stageNodes = process.nodes.filter((node) => node.stage === stage);
    const hasCurrent = stageNodes.some((node) => node.status === "current");
    const allDone = stageNodes.every((node) => node.status === "done");
    const rowFill = hasCurrent
      ? "#f0faf5"
      : rowIndex % 2 === 0
        ? "#fbfcfb"
        : "#f5f8f6";
    const labelFill = hasCurrent
      ? "#087452"
      : allDone
        ? "#e4f5ed"
        : "#eef3f0";
    const labelInk = hasCurrent ? "#ffffff" : allDone ? "#087452" : "#53645b";
    const [code, ...labelParts] = stage.split(" ");
    result.push(
      `<rect x="${GRID_LEFT}" y="${round(y)}" width="${GRID_RIGHT - GRID_LEFT}" height="${round(height)}" fill="${rowFill}"/>`,
      `<rect x="${GRID_LEFT}" y="${round(y)}" width="${STAGE_LABEL_WIDTH}" height="${round(height)}" fill="${labelFill}"/>`,
      `<text x="58" y="${round(y + 32)}" class="mono" font-size="16" font-weight="800" fill="${labelInk}">${escapeXml(code)}</text>`,
      textLines(
        wrapTextToWidth(labelParts.join(" "), STAGE_LABEL_WIDTH - 40, 19, 2),
        58,
        y + 65,
        {
          size: 19,
          weight: 800,
          fill: labelInk,
          lineHeight: 22,
        }
      )
    );
  });

  groups.forEach((group, groupIndex) => {
    const x = GROUP_X + groupIndex * groupWidth;
    const title = fitTextToWidth(group.title, groupWidth - 40, 20);
    result.push(
      `<rect x="${round(x)}" y="${GRID_TOP}" width="${round(groupWidth)}" height="${GROUP_HEADER_HEIGHT}" fill="#f7faf8"/>`,
      `<rect x="${round(x)}" y="${GRID_TOP}" width="${round(groupWidth)}" height="7" fill="${group.accent}"/>`,
      `<text x="${round(x + 20)}" y="299" font-size="20" font-weight="800" fill="#17231d">${escapeXml(title)}</text>`,
      textLines(wrapTextToWidth(group.lanes.join(" · "), groupWidth - 40, 13.5, 2), x + 20, 329, {
        size: 13.5,
        weight: 600,
        fill: "#68776f",
        lineHeight: 19,
      })
    );
  });

  for (let index = 0; index <= groups.length; index += 1) {
    const x = GROUP_X + index * groupWidth;
    result.push(
      `<line x1="${round(x)}" y1="${GRID_TOP}" x2="${round(x)}" y2="${GRID_BOTTOM}" stroke="#d3dcd7" stroke-width="1.5"/>`
    );
  }
  result.push(
    `<line x1="${GRID_LEFT}" y1="${STAGE_BODY_TOP}" x2="${GRID_RIGHT}" y2="${STAGE_BODY_TOP}" stroke="#b8c7bf" stroke-width="2"/>`
  );
  stageTops.forEach((y) => {
    result.push(
      `<line x1="${GRID_LEFT}" y1="${round(y)}" x2="${GRID_RIGHT}" y2="${round(y)}" stroke="#c8d3cd" stroke-width="1.5"/>`
    );
  });
  result.push(
    `<line x1="${GRID_LEFT}" y1="${GRID_BOTTOM}" x2="${GRID_RIGHT}" y2="${GRID_BOTTOM}" stroke="#b8c7bf" stroke-width="2"/>`
  );
  return result.join("\n");
}

function renderEdges(context) {
  const paths = [];
  const labels = [];
  for (const edge of context.process.edges) {
    const source = context.nodeLayout.get(edge.source);
    const target = context.nodeLayout.get(edge.target);
    if (!source || !target) {
      throw new Error(`연결 배치 누락: ${context.institution.slug}/${edge.id}`);
    }
    const style =
      edge.type === "loop"
        ? { color: EDGE_TYPE_COLORS.loop, width: 4, dash: "10 8", marker: "arrow-loop" }
        : edge.type === "message"
          ? { color: EDGE_TYPE_COLORS.message, width: 3.4, dash: "11 8", marker: "arrow-message" }
          : { color: EDGE_TYPE_COLORS.sequence, width: 3.4, dash: "", marker: "arrow-sequence" };
    const route = edgeRoute(edge, source, target, context);
    const dash = style.dash ? `stroke-dasharray="${style.dash}"` : "";
    paths.push(
      `<path d="${route.path}" fill="none" stroke="#ffffff" stroke-width="${style.width + 4}" ${dash} stroke-linecap="round" stroke-linejoin="round" opacity="0.94"/>`,
      `<path d="${route.path}" fill="none" stroke="${style.color}" stroke-width="${style.width}" ${style.dash ? `stroke-dasharray="${style.dash}"` : ""} marker-end="url(#${style.marker})" stroke-linecap="round" stroke-linejoin="round" opacity="0.96"/>`
    );
    if (edge.label) {
      const label = context.edgeLabelLayout.get(edge.id);
      if (!label) {
        throw new Error(`연결 라벨 배치 누락: ${context.institution.slug}/${edge.id}`);
      }
      labels.push(
        `<rect x="${round(label.x - label.width / 2)}" y="${round(label.y - EDGE_LABEL_HEIGHT / 2)}" width="${round(label.width)}" height="${EDGE_LABEL_HEIGHT}" rx="6" fill="#ffffff" stroke="${style.color}" stroke-width="1.4"/>`,
        `<text x="${round(label.x)}" y="${round(label.y + 5)}" text-anchor="middle" font-size="14" font-weight="750" fill="${style.color}">${escapeXml(edge.label)}</text>`
      );
    }
  }
  return [...paths, ...labels].join("\n");
}

function buildEdgeLabelLayout(context) {
  const placements = new Map();
  const reserved = [
    ...Array.from(context.nodeLayout.values(), (node) =>
      expandRect(
        { x: node.x, y: node.y, width: node.width, height: node.height },
        EDGE_LABEL_GAP
      )
    ),
    ...context.stageTops.map((top, index) => ({
      x: GRID_LEFT + 8,
      y: top + 10,
      width: STAGE_LABEL_WIDTH - 16,
      height: Math.min(98, context.stageHeights[index] - 18),
    })),
  ];
  const placed = [];

  for (const edge of context.process.edges) {
    if (!edge.label) continue;
    const source = context.nodeLayout.get(edge.source);
    const target = context.nodeLayout.get(edge.target);
    if (!source || !target) continue;
    const route = edgeRoute(edge, source, target, context);
    const width = Math.max(96, estimatedTextWidth(edge.label, 14) + 26);
    const placement = findFreeEdgeLabel(
      route.labelX,
      route.labelY,
      width,
      context,
      reserved,
      placed
    );
    if (!placement) {
      throw new Error(
        `연결 라벨 충돌을 해소할 수 없습니다: ${context.institution.slug}/${edge.id}`
      );
    }
    const rect = {
      x: placement.x - width / 2,
      y: placement.y - EDGE_LABEL_HEIGHT / 2,
      width,
      height: EDGE_LABEL_HEIGHT,
    };
    placed.push(expandRect(rect, EDGE_LABEL_GAP));
    placements.set(edge.id, {
      x: placement.x,
      y: placement.y,
      width,
      adjusted:
        Math.abs(placement.x - route.labelX) > 0.1 ||
        Math.abs(placement.y - route.labelY) > 0.1,
    });
  }
  return placements;
}

function findFreeEdgeLabel(anchorX, anchorY, width, context, reserved, placed) {
  const xOffsets = [0, -70, 70, -140, 140, -210, 210, -280, 280, -350, 350, -420, 420];
  const yOffsets = [0, -36, 36, -72, 72, -108, 108, -144, 144, -180, 180];
  const candidates = yOffsets
    .flatMap((dy) => xOffsets.map((dx) => ({ x: anchorX + dx, y: anchorY + dy, dx, dy })))
    .sort(
      (a, b) =>
        Math.abs(a.dx) + Math.abs(a.dy) * 1.25 -
        (Math.abs(b.dx) + Math.abs(b.dy) * 1.25)
    );

  for (const candidate of candidates) {
    const rect = {
      x: candidate.x - width / 2,
      y: candidate.y - EDGE_LABEL_HEIGHT / 2,
      width,
      height: EDGE_LABEL_HEIGHT,
    };
    if (
      rect.x < GRID_LEFT + 5 ||
      rect.x + rect.width > GRID_RIGHT - 5 ||
      rect.y < STAGE_BODY_TOP + 5 ||
      rect.y + rect.height > GRID_BOTTOM - 5
    ) {
      continue;
    }
    if (reserved.some((item) => rectsOverlap(rect, item))) continue;
    if (placed.some((item) => rectsOverlap(rect, item))) continue;
    return candidate;
  }
  return null;
}

function expandRect(rect, amount) {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  };
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function verticalRouteBlocked(x, startY, endY, edge, context) {
  const top = Math.min(startY, endY);
  const bottom = Math.max(startY, endY);
  return [...context.nodeLayout.entries()].some(([nodeId, node]) => {
    if (nodeId === edge.source || nodeId === edge.target) return false;
    return (
      x > node.x - 4 &&
      x < node.x + node.width + 4 &&
      bottom > node.y - 4 &&
      top < node.y + node.height + 4
    );
  });
}

function validateEdgeRouteLayout(context) {
  const routes = context.process.edges.map((edge) => {
    const source = context.nodeLayout.get(edge.source);
    const target = context.nodeLayout.get(edge.target);
    return {
      edge,
      route: edgeRoute(edge, source, target, context),
      long: target.stageIndex - source.stageIndex > 1,
    };
  });
  const overlaps = [];
  for (let leftIndex = 0; leftIndex < routes.length; leftIndex += 1) {
    const left = routes[leftIndex];
    const leftSegments = orthogonalSegments(left.route.path);
    for (let rightIndex = leftIndex + 1; rightIndex < routes.length; rightIndex += 1) {
      const right = routes[rightIndex];
      const rightSegments = orthogonalSegments(right.route.path);
      let longest = 0;
      for (const leftSegment of leftSegments) {
        for (const rightSegment of rightSegments) {
          longest = Math.max(longest, collinearOverlap(leftSegment, rightSegment));
        }
      }
      if (longest > MAX_COLLINEAR_EDGE_OVERLAP) {
        overlaps.push({
          ids: `${left.edge.id}/${right.edge.id}`,
          length: round(longest),
          leftPath: left.route.path,
          rightPath: right.route.path,
        });
      }
    }
  }
  if (overlaps.length > 0) {
    throw new Error(
      `연결선 공선 겹침: ${context.institution.slug}\n- ${overlaps
        .slice(0, 12)
        .map(
          ({ ids, length, leftPath, rightPath }) =>
            `${ids} ${length}px\n  ${leftPath}\n  ${rightPath}`
        )
        .join("\n- ")}`
    );
  }
  return {
    routes: routes.length,
    longRoutes: routes.filter(({ long }) => long).length,
  };
}

function orthogonalSegments(pathData) {
  const tokens = pathData.match(/[MHV]|-?\d+(?:\.\d+)?/g) ?? [];
  const segments = [];
  let x = 0;
  let y = 0;
  for (let index = 0; index < tokens.length; ) {
    const command = tokens[index];
    index += 1;
    if (command === "M") {
      x = Number(tokens[index]);
      y = Number(tokens[index + 1]);
      index += 2;
      continue;
    }
    if (command === "H") {
      const nextX = Number(tokens[index]);
      index += 1;
      segments.push({ orientation: "horizontal", fixed: y, start: x, end: nextX });
      x = nextX;
      continue;
    }
    if (command === "V") {
      const nextY = Number(tokens[index]);
      index += 1;
      segments.push({ orientation: "vertical", fixed: x, start: y, end: nextY });
      y = nextY;
    }
  }
  return segments;
}

function collinearOverlap(left, right) {
  if (
    left.orientation !== right.orientation ||
    Math.abs(left.fixed - right.fixed) > 0.1
  ) {
    return 0;
  }
  const leftStart = Math.min(left.start, left.end);
  const leftEnd = Math.max(left.start, left.end);
  const rightStart = Math.min(right.start, right.end);
  const rightEnd = Math.max(right.start, right.end);
  return Math.max(0, Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart));
}

function edgeRoute(edge, source, target, context) {
  const sourceCenterX = source.x + source.width / 2;
  const sourceCenterY = source.y + source.height / 2;
  const targetCenterX = target.x + target.width / 2;
  const targetCenterY = target.y + target.height / 2;
  const sourceRight = source.x + source.width;
  const targetRight = target.x + target.width;
  const sourceBottom = source.y + source.height;
  const targetBottom = target.y + target.height;
  const slot = context.edgeRouteSlots.get(edge.id) ?? {
    sourcePort: 0,
    targetPort: 0,
    channel: 0,
    rail: 0,
    railSide: 1,
    approach: 0,
    sourceChannel: 0,
    targetChannel: 0,
    backRail: 0,
  };
  const sourcePortX =
    sourceCenterX +
    slot.sourcePort * EDGE_PORT_GAP +
    alternatingSlotOffset(slot.sourceChannel) * 6 +
    alternatingSlotOffset(slot.channel) * 6;
  const targetPortX =
    targetCenterX +
    slot.targetPort * EDGE_PORT_GAP +
    alternatingSlotOffset(slot.targetChannel) * 6 +
    alternatingSlotOffset(slot.channel) * 6;

  if (source.stageIndex === target.stageIndex && source.groupIndex === target.groupIndex) {
    if (edge.type === "message") {
      const sideX = sourceRight + 28 + slot.channel * EDGE_RAIL_GAP;
      const sourceSideY =
        sourceCenterY + sidePortOffset(slot.sourcePort, slot.sourceChannel);
      const targetSideY =
        targetCenterY + sidePortOffset(slot.targetPort, slot.targetChannel);
      return {
        path: `M ${round(sourceRight)} ${round(sourceSideY)} H ${round(sideX)} V ${round(targetSideY)} H ${round(targetRight + ARROW_CLEARANCE)}`,
        labelX: sideX + 58,
        labelY: (sourceSideY + targetSideY) / 2,
      };
    }
    const downward = target.y >= sourceBottom;
    // Fan same-cell branches out in port order before they approach their targets.
    // This keeps a farther branch from sharing the nearer branch's target stem.
    const middleY = Math.max(
      sourceBottom + ARROW_CLEARANCE + 8,
      Math.min(
        target.y - ARROW_CLEARANCE - 8,
        sourceBottom + 36 - slot.sourcePort * 28
      )
    );
    return {
      path: downward
        ? Math.abs(sourcePortX - targetPortX) < 1
          ? `M ${round(sourcePortX)} ${round(sourceBottom)} V ${round(target.y - ARROW_CLEARANCE)}`
          : `M ${round(sourcePortX)} ${round(sourceBottom)} V ${round(middleY)} H ${round(targetPortX)} V ${round(target.y - ARROW_CLEARANCE)}`
        : `M ${round(source.x)} ${round(sourceCenterY)} H ${round(GROUP_X - 12 - slot.backRail * EDGE_RAIL_GAP)} V ${round(targetCenterY)} H ${round(target.x - ARROW_CLEARANCE)}`,
      labelX: downward ? sourceRight + 50 : GROUP_X + 48,
      labelY: (sourceCenterY + targetCenterY) / 2,
    };
  }

  if (source.stageIndex === target.stageIndex) {
    const forward = target.groupIndex > source.groupIndex;
    const sourceSideY =
      sourceCenterY + sidePortOffset(slot.sourcePort, slot.sourceChannel);
    const targetSideY =
      targetCenterY + sidePortOffset(slot.targetPort, slot.targetChannel);
    const channelX = forward
      ? target.x - 28 - slot.channel * EDGE_RAIL_GAP
      : targetRight + 28 + slot.channel * EDGE_RAIL_GAP;
    return {
      path: forward
        ? `M ${round(sourceRight)} ${round(sourceSideY)} H ${round(channelX)} V ${round(targetSideY)} H ${round(target.x - ARROW_CLEARANCE)}`
        : `M ${round(source.x)} ${round(sourceSideY)} H ${round(channelX)} V ${round(targetSideY)} H ${round(targetRight + ARROW_CLEARANCE)}`,
      labelX: forward
        ? (sourceRight + target.x) / 2
        : (source.x + targetRight) / 2,
      labelY: (sourceSideY + targetSideY) / 2 - 17,
    };
  }

  if (target.stageIndex > source.stageIndex) {
    const sourceRowBottom =
      context.stageTops[source.stageIndex] + context.stageHeights[source.stageIndex];
    const channelY = sourceRowBottom - 12 - slot.channel * EDGE_CHANNEL_GAP;
    const sourceBlocked = verticalRouteBlocked(
      sourcePortX,
      sourceBottom,
      channelY,
      edge,
      context
    );
    const sourceSide =
      target.groupIndex > source.groupIndex
        ? 1
        : target.groupIndex < source.groupIndex
          ? -1
          : slot.railSide;
    const sourceGroupLeft = GROUP_X + source.groupIndex * context.groupWidth;
    const blockedRailNudge =
      alternatingSlotOffset(slot.sourceChannel) * EDGE_RAIL_GAP;
    const sourceRailCandidate =
      sourceSide < 0
        ? sourceGroupLeft + EDGE_RAIL_INSET + blockedRailNudge
        : sourceGroupLeft +
          context.groupWidth -
          EDGE_RAIL_INSET +
          blockedRailNudge;
    // Channel offsets may not pull a detour rail back through its source card.
    const sourceRailX =
      sourceSide < 0
        ? Math.min(sourceRailCandidate, source.x - ARROW_CLEARANCE)
        : Math.max(sourceRailCandidate, sourceRight + ARROW_CLEARANCE);
    const sourcePath = sourceBlocked
      ? sourceSide < 0
        ? `M ${round(source.x)} ${round(sourceCenterY + sidePortOffset(slot.sourcePort, slot.sourceChannel))} H ${round(sourceRailX)} V ${round(channelY)}`
        : `M ${round(sourceRight)} ${round(sourceCenterY + sidePortOffset(slot.sourcePort, slot.sourceChannel))} H ${round(sourceRailX)} V ${round(channelY)}`
      : `M ${round(sourcePortX)} ${round(sourceBottom)} V ${round(channelY)}`;
    if (target.stageIndex - source.stageIndex > 1) {
      const targetGroupLeft = GROUP_X + target.groupIndex * context.groupWidth;
      // Keep channel offsets subordinate to the assigned rail so they cannot cancel it.
      const routeRailNudge = alternatingSlotOffset(slot.channel) * 4;
      const railX =
        slot.railSide < 0
          ? targetGroupLeft +
            EDGE_RAIL_INSET +
            slot.rail * EDGE_RAIL_GAP +
            routeRailNudge
          : targetGroupLeft +
            context.groupWidth -
            EDGE_RAIL_INSET -
            slot.rail * EDGE_RAIL_GAP +
            routeRailNudge;
      const longRailX =
        sourceBlocked && source.groupIndex === target.groupIndex
          // Separate long routes sharing a source rail when they fan into different target ports.
          ? sourceRailX +
            slot.railSide * (slot.targetChannel - slot.sourceChannel) * 8 -
            slot.railSide * slot.rail * EDGE_RAIL_GAP
          : railX;
      const targetApproachY = target.y - 28 - slot.approach * 10;
      const longSourcePath =
        sourceBlocked && source.groupIndex === target.groupIndex
          ? slot.railSide < 0
            ? `M ${round(source.x)} ${round(sourceCenterY + sidePortOffset(slot.sourcePort, slot.sourceChannel))} H ${round(longRailX)} V ${round(channelY)}`
            : `M ${round(sourceRight)} ${round(sourceCenterY + sidePortOffset(slot.sourcePort, slot.sourceChannel))} H ${round(longRailX)} V ${round(channelY)}`
          : sourcePath;
      return {
        path: `${longSourcePath} H ${round(longRailX)} V ${round(targetApproachY)} H ${round(targetPortX)} V ${round(target.y - ARROW_CLEARANCE)}`,
        labelX: longRailX,
        labelY: (channelY + targetApproachY) / 2,
      };
    }
    const targetBlocked = verticalRouteBlocked(
      targetPortX,
      channelY,
      target.y - ARROW_CLEARANCE,
      edge,
      context
    );
    if (targetBlocked) {
      const targetSide =
        source.groupIndex < target.groupIndex
          ? -1
          : source.groupIndex > target.groupIndex
            ? 1
            : slot.railSide;
      const targetGroupLeft = GROUP_X + target.groupIndex * context.groupWidth;
      const targetRailNudge =
        alternatingSlotOffset(slot.targetChannel) * EDGE_RAIL_GAP;
      const targetRailX =
        targetSide < 0
          ? targetGroupLeft + EDGE_RAIL_INSET + targetRailNudge
          : targetGroupLeft +
            context.groupWidth -
            EDGE_RAIL_INSET +
            targetRailNudge;
      return {
        path:
          targetSide < 0
            ? `${sourcePath} H ${round(targetRailX)} V ${round(targetCenterY + sidePortOffset(slot.targetPort, slot.targetChannel))} H ${round(target.x - ARROW_CLEARANCE)}`
            : `${sourcePath} H ${round(targetRailX)} V ${round(targetCenterY + sidePortOffset(slot.targetPort, slot.targetChannel))} H ${round(targetRight + ARROW_CLEARANCE)}`,
        labelX: (sourcePortX + targetRailX) / 2,
        labelY: channelY - 17,
      };
    }
    return {
      path: `${sourcePath} H ${round(targetPortX)} V ${round(target.y - ARROW_CLEARANCE)}`,
      labelX: (sourcePortX + targetPortX) / 2,
      labelY: channelY - 17,
    };
  }

  const railX = GROUP_X - 12 - slot.backRail * EDGE_RAIL_GAP;
  const targetRowBottom =
    context.stageTops[target.stageIndex] + context.stageHeights[target.stageIndex];
  const channelY = targetRowBottom - 20 - slot.channel * EDGE_CHANNEL_GAP;
  return {
    path: `M ${round(source.x)} ${round(sourceCenterY + sidePortOffset(slot.sourcePort, slot.sourceChannel))} H ${round(railX)} V ${round(channelY)} H ${round(targetPortX)} V ${round(targetBottom + ARROW_CLEARANCE)}`,
    labelX: railX + 70,
    labelY: (sourceCenterY + channelY) / 2,
  };
}

function renderNode(node, context) {
  const position = context.nodeLayout.get(node.id);
  const status = STATUS[node.status] ?? STATUS.waiting;
  const x = position.x;
  const y = position.y;
  const statusWidth = 50;
  const nameLines = wrapTextToWidth(
    node.name,
    CARD_TEXT_WIDTH,
    CARD_TITLE_SIZE,
    2
  );
  const nameY = nameLines.length === 1 ? CARD_TITLE_SINGLE_Y : CARD_TITLE_DOUBLE_Y;
  const footer = node.blocker ? `⚠ ${node.blocker}` : node.actor;
  const fittedFooter = fitTextToWidth(
    footer,
    CARD_TEXT_WIDTH,
    CARD_FOOTER_SIZE
  );
  const footerColor = node.blocker
    ? node.status === "current"
      ? "#fff0bc"
      : "#a96008"
    : status.sub;
  const idPrefix = node.type === "gateway" ? "◇ " : node.type === "system" ? "▣ " : "";
  return `
    <g filter="url(#card-shadow)">
      <rect x="${round(x)}" y="${round(y)}" width="${CARD_WIDTH}" height="${position.height}" rx="8" fill="${status.fill}" stroke="${status.border}" stroke-width="2.3"/>
      <rect x="${round(x)}" y="${round(y)}" width="6" height="${position.height}" rx="3" fill="${status.border}"/>
      <text x="${round(x + 15)}" y="${round(y + 20)}" class="mono" font-size="12.5" font-weight="750" fill="${status.sub}">${idPrefix}${escapeXml(node.id)}</text>
      <rect x="${round(x + CARD_WIDTH - statusWidth - 10)}" y="${round(y + 7)}" width="${statusWidth}" height="24" rx="5" fill="${node.status === "current" ? "#ffffff" : status.border}" opacity="${node.status === "current" ? 0.18 : 0.14}"/>
      <text x="${round(x + CARD_WIDTH - statusWidth / 2 - 10)}" y="${round(y + 24)}" text-anchor="middle" font-size="12" font-weight="800" fill="${status.ink}">${status.label}</text>
      ${textLines(nameLines, x + 15, y + nameY, {
        size: CARD_TITLE_SIZE,
        weight: 800,
        fill: status.ink,
        lineHeight: CARD_TITLE_LINE_HEIGHT,
      })}
      <text x="${round(x + 15)}" y="${round(y + CARD_FOOTER_Y)}" font-size="${CARD_FOOTER_SIZE}" font-weight="650" fill="${footerColor}">${escapeXml(fittedFooter)}</text>
    </g>
  `;
}

function renderFooter({ process, groups }) {
  const legendY = 2245;
  return `
    <text x="38" y="${legendY}" font-size="16" font-weight="800" fill="#18251e">읽는 법</text>
    ${legendStatus(118, legendY - 14, "#35a77d", "선행")}
    ${legendStatus(216, legendY - 14, "#087452", "핵심")}
    ${legendStatus(314, legendY - 14, "#d9901a", "병목")}
    ${legendStatus(412, legendY - 14, EDGE_TYPE_COLORS.loop, "회귀")}
    <line x1="548" y1="${legendY - 8}" x2="600" y2="${legendY - 8}" stroke="#53675d" stroke-width="4" marker-end="url(#arrow-sequence)"/>
    <text x="620" y="${legendY - 2}" font-size="15" fill="#526159">절차 순서</text>
    <line x1="760" y1="${legendY - 8}" x2="812" y2="${legendY - 8}" stroke="#0f8a65" stroke-width="4" stroke-dasharray="10 8" marker-end="url(#arrow-message)"/>
    <text x="832" y="${legendY - 2}" font-size="15" fill="#526159">정보 전달</text>
    <line x1="972" y1="${legendY - 8}" x2="1024" y2="${legendY - 8}" stroke="#3478db" stroke-width="4" stroke-dasharray="10 8" marker-end="url(#arrow-loop)"/>
    <text x="1044" y="${legendY - 2}" font-size="15" fill="#526159">보완 회귀</text>
    <text x="38" y="2291" font-size="15.5" font-weight="650" fill="#56655d">단계는 위→아래, 행위자 묶음은 좌→우로 읽습니다.</text>
    <text x="38" y="2321" font-size="14.5" fill="#68776f">원래 ${process.lanes.length}개 행위자 레인을 ${groups.length}개 레이아웃 묶음으로 배치했으며, ${process.nodes.length}개 업무와 ${process.edges.length}개 연결 관계는 유지했습니다.</text>
    <text x="38" y="2361" font-size="13.5" fill="#7b8881">출처: 해당 제도의 법률·시행령·시행규칙 기반 모델 · 실제 사건의 진행 상태나 법률 자문을 의미하지 않습니다.</text>
    <text x="1762" y="2361" text-anchor="end" font-size="17" font-weight="750" fill="#087452">조달제도 100</text>
  `;
}

function legendStatus(x, y, color, label) {
  return `<rect x="${x}" y="${y - 12}" width="17" height="17" rx="4" fill="${color}"/><text x="${x + 26}" y="${y + 2}" font-size="14.5" fill="#526159">${label}</text>`;
}

function textLines(lines, x, y, options = {}) {
  const {
    size = 18,
    weight = 600,
    fill = "#17231d",
    lineHeight = size * 1.25,
  } = options;
  const tspans = lines
    .map(
      (line, index) =>
        `<tspan x="${round(x)}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
    )
    .join("");
  return `<text x="${round(x)}" y="${round(y)}" font-size="${size}" font-weight="${weight}" fill="${fill}">${tspans}</text>`;
}

function wrapTextToWidth(text, maxWidth, fontSize, maxLines) {
  const normalized = String(text).trim().replace(/\s+/gu, " ");
  if (!normalized) return [""];
  if (estimatedTextWidth(normalized, fontSize) <= maxWidth) return [normalized];

  const words = normalized.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (estimatedTextWidth(candidate, fontSize) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (estimatedTextWidth(word, fontSize) <= maxWidth) {
      current = word;
      continue;
    }

    current = "";
    for (const char of Array.from(word)) {
      const chunk = `${current}${char}`;
      if (current && estimatedTextWidth(chunk, fontSize) > maxWidth) {
        lines.push(current);
        current = char;
      } else {
        current = chunk;
      }
    }
  }
  if (current) lines.push(current);

  const limited = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    limited[maxLines - 1] = fitTextToWidth(
      `${limited[maxLines - 1]}…`,
      maxWidth,
      fontSize
    );
  }
  return limited;
}

function fitTextToWidth(text, maxWidth, fontSize) {
  const value = String(text);
  if (estimatedTextWidth(value, fontSize) <= maxWidth) return value;

  const ellipsis = "…";
  let fitted = "";
  for (const char of Array.from(value)) {
    if (estimatedTextWidth(`${fitted}${char}${ellipsis}`, fontSize) > maxWidth) {
      break;
    }
    fitted += char;
  }
  return `${fitted.trimEnd()}${ellipsis}`;
}

function fitFontSize(text, preferredSize, minimumSize, maxWidth) {
  const units = textWidthUnits(String(text));
  if (units === 0) return preferredSize;
  return round(Math.max(minimumSize, Math.min(preferredSize, maxWidth / units)));
}

function estimatedTextWidth(text, fontSize) {
  return textWidthUnits(String(text)) * fontSize;
}

function textWidthUnits(text) {
  return Array.from(text).reduce((sum, char) => {
    if (/\s/u.test(char)) return sum + 0.35;
    if (/[MW@%]/u.test(char)) return sum + 0.9;
    if (/[A-Z]/u.test(char)) return sum + 0.72;
    if (/[a-z0-9]/u.test(char)) return sum + 0.58;
    if (".,:;·/()[]{}+-_!?".includes(char)) return sum + 0.5;
    return sum + 1;
  }, 0);
}

function validateTextLayout(context) {
  const { institution, process, groups, groupWidth, layoutMetrics } = context;
  const errors = [];
  const assertFits = (lines, maxWidth, fontSize, label) => {
    for (const line of lines) {
      const width = estimatedTextWidth(line, fontSize);
      if (width > maxWidth + 0.1) {
        errors.push(`${label}: ${round(width)}/${round(maxWidth)}px`);
      }
    }
  };

  const titleTop = CARD_TITLE_DOUBLE_Y - CARD_TITLE_SIZE * 0.82;
  const titleBottom =
    CARD_TITLE_DOUBLE_Y + CARD_TITLE_LINE_HEIGHT + CARD_TITLE_SIZE * 0.2;
  const footerTop = CARD_FOOTER_Y - CARD_FOOTER_SIZE * 0.82;
  const footerBottom = CARD_FOOTER_Y + CARD_FOOTER_SIZE * 0.2;
  if (
    titleTop <= 31 ||
    titleBottom >= footerTop ||
    footerBottom >= layoutMetrics.cardHeight
  ) {
    errors.push("카드 세로 텍스트 영역이 겹칩니다");
  }

  for (const node of process.nodes) {
    const nameLines = wrapTextToWidth(
      node.name,
      CARD_TEXT_WIDTH,
      CARD_TITLE_SIZE,
      2
    );
    assertFits(
      nameLines,
      CARD_TEXT_WIDTH,
      CARD_TITLE_SIZE,
      `${node.id} 업무명`
    );
    const footer = fitTextToWidth(
      node.blocker ? `⚠ ${node.blocker}` : node.actor,
      CARD_TEXT_WIDTH,
      CARD_FOOTER_SIZE
    );
    assertFits([footer], CARD_TEXT_WIDTH, CARD_FOOTER_SIZE, `${node.id} 보조문구`);
    const idPrefix =
      node.type === "gateway" ? "◇ " : node.type === "system" ? "▣ " : "";
    assertFits([`${idPrefix}${node.id}`], 180, 12.5, `${node.id} 식별자`);
  }

  for (const stage of process.stages) {
    const label = stage.split(" ").slice(1).join(" ");
    assertFits(
      wrapTextToWidth(label, STAGE_LABEL_WIDTH - 40, 19, 2),
      STAGE_LABEL_WIDTH - 40,
      19,
      `${stage} 단계명`
    );
  }

  for (const group of groups) {
    assertFits(
      [fitTextToWidth(group.title, groupWidth - 40, 20)],
      groupWidth - 40,
      20,
      `${group.id} 묶음명`
    );
    assertFits(
      wrapTextToWidth(group.lanes.join(" · "), groupWidth - 40, 13.5, 2),
      groupWidth - 40,
      13.5,
      `${group.id} 행위자명`
    );
  }

  assertFits(
    [
      fitTextToWidth(
        institution.oneLiner ?? institution.canvas?.purpose ?? "",
        WIDTH - 80,
        21
      ),
    ],
    WIDTH - 80,
    21,
    "상단 설명"
  );
  assertFits(
    [institution.name],
    WIDTH - 80,
    fitFontSize(institution.name, 52, 36, WIDTH - 80),
    "제도명"
  );

  for (const edge of process.edges) {
    if (!edge.label) continue;
    const labelWidth = Math.max(
      96,
      estimatedTextWidth(edge.label, 14) + 26
    );
    assertFits([edge.label], labelWidth - 26, 14, `${edge.id} 연결명`);
  }

  if (errors.length > 0) {
    throw new Error(`텍스트 레이아웃 오류: ${institution.slug}\n- ${errors.join("\n- ")}`);
  }
  return {
    nodes: process.nodes.length,
    stages: process.stages.length,
    groups: groups.length,
    edgeLabels: context.edgeLabelLayout.size,
    adjustedEdgeLabels: Array.from(context.edgeLabelLayout.values()).filter(
      (label) => label.adjusted
    ).length,
    edgeRoutes: context.edgeRouteAudit.routes,
    longEdgeRoutes: context.edgeRouteAudit.longRoutes,
  };
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function alternatingSlotOffset(index) {
  if (index === 0) return 0;
  const magnitude = Math.ceil(index / 2);
  return index % 2 === 1 ? -magnitude : magnitude;
}

function sidePortOffset(port, channel) {
  return port * 13 + channel * 2.5;
}
