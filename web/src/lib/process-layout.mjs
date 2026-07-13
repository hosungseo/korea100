const ACCENTS = ["#0f9f72", "#3b82f6", "#c78116", "#0891b2"];
const EXTRA_LANE_ORDER = [2, 1, 0, 3];
const TITLE_OVERRIDES = {
  "environmental-impact-assessment": [
    "사업 준비·작성",
    "승인·공고",
    "협의·전문검토",
    "주민·정보공개",
  ],
  "workplace-harassment-response": [
    "신고·피해보호",
    "사용자·행위자",
    "사내조사·노동청",
    "공무원·별도구제",
  ],
};

export function buildProcessLaneGroups(lanes, slug) {
  return partitionLanes(lanes).map((groupLanes, index) => ({
    id: `group-${index + 1}`,
    title: TITLE_OVERRIDES[slug]?.[index] ?? summarizeGroupTitle(groupLanes),
    lanes: groupLanes,
    accent: ACCENTS[index],
  }));
}

export function buildProcessEdgeRouteSlots(edges, nodePositions) {
  const slots = new Map(
    edges.map((edge) => [
      edge.id,
      {
        sourcePort: 0,
        targetPort: 0,
        channel: 0,
        rail: 0,
        railSide: 1,
        approach: 0,
        sourceChannel: 0,
        targetChannel: 0,
        backRail: 0,
      },
    ])
  );
  const records = edges.flatMap((edge) => {
    const source = nodePositions.get(edge.source);
    const target = nodePositions.get(edge.target);
    return source && target ? [{ edge, source, target }] : [];
  });

  assignIncidentPortSlots(records, slots);
  assignChannelSlots(records, slots);
  assignEndpointChannelSlots(records, slots, "source", "sourceChannel");
  assignEndpointChannelSlots(records, slots, "target", "targetChannel");
  assignRailSlots(records, slots);
  assignBackRailSlots(records, slots);
  assignApproachSlots(records, slots);
  return slots;
}

export function buildBlockedRailNudge(channel, side, gap) {
  return side * Math.max(0, channel) * gap;
}

function assignIncidentPortSlots(records, slots) {
  const incidents = records.flatMap((record) => [
    {
      ...record,
      nodeId: record.edge.source,
      endpoint: "source",
      counterpart: record.target,
    },
    {
      ...record,
      nodeId: record.edge.target,
      endpoint: "target",
      counterpart: record.source,
    },
  ]);
  const grouped = groupBy(incidents, ({ nodeId }) => nodeId);
  for (const group of grouped.values()) {
    const sorted = [...group].sort((left, right) => {
      const leftPosition = left.counterpart;
      const rightPosition = right.counterpart;
      return (
        leftPosition.groupIndex - rightPosition.groupIndex ||
        leftPosition.stageIndex - rightPosition.stageIndex ||
        left.endpoint.localeCompare(right.endpoint) ||
        left.edge.type.localeCompare(right.edge.type) ||
        left.edge.id.localeCompare(right.edge.id)
      );
    });
    const center = (sorted.length - 1) / 2;
    const scale = center > 2.5 ? 2.5 / center : 1;
    sorted.forEach(({ edge, endpoint }, index) => {
      const slot = slots.get(edge.id);
      slot[`${endpoint}Port`] = (index - center) * scale;
    });
  }
}

function assignChannelSlots(records, slots) {
  const candidates = records.flatMap((record) => {
    const { edge, source, target } = record;
    const sameCell =
      source.stageIndex === target.stageIndex &&
      source.groupIndex === target.groupIndex;
    if (sameCell && edge.type === "sequence") return [];
    const rowIndex = Math.min(source.stageIndex, target.stageIndex);
    return [
      {
        ...record,
        key: rowIndex,
        start: Math.min(source.groupIndex, target.groupIndex) - 0.45,
        end: Math.max(source.groupIndex, target.groupIndex) + 0.45,
      },
    ];
  });

  const grouped = groupBy(candidates, ({ key }) => key);
  for (const group of grouped.values()) {
    assignIntervalSlots(group, ({ edge }, channel) => {
      slots.get(edge.id).channel = channel;
    });
  }
}

function assignEndpointChannelSlots(records, slots, endpoint, property) {
  const candidates = records.map((record) => ({
    ...record,
    key: record[endpoint].stageIndex,
    start: Math.min(record.source.groupIndex, record.target.groupIndex) - 0.45,
    end: Math.max(record.source.groupIndex, record.target.groupIndex) + 0.45,
  }));
  const grouped = groupBy(candidates, ({ key }) => key);
  for (const group of grouped.values()) {
    assignIntervalSlots(group, ({ edge }, channel) => {
      slots.get(edge.id)[property] = channel;
    });
  }
}

function assignRailSlots(records, slots) {
  const candidates = records.flatMap((record) => {
    const { edge, source, target } = record;
    if (target.stageIndex - source.stageIndex <= 1) return [];
    const slot = slots.get(edge.id);
    const railSide =
      source.groupIndex < target.groupIndex
        ? 1
        : source.groupIndex > target.groupIndex
          ? -1
          : slot.sourcePort < 0
            ? -1
            : 1;
    slot.railSide = railSide;
    return [
      {
        ...record,
        key: `${target.groupIndex}:${railSide}`,
        start: source.stageIndex,
        end: target.stageIndex,
      },
    ];
  });

  const grouped = groupBy(candidates, ({ key }) => key);
  for (const group of grouped.values()) {
    assignIntervalSlots(group, ({ edge }, rail) => {
      slots.get(edge.id).rail = rail;
    });
  }
}

function assignApproachSlots(records, slots) {
  const candidates = records.flatMap((record) => {
    const { source, target } = record;
    if (target.stageIndex - source.stageIndex <= 1) return [];
    return [
      {
        ...record,
        key: target.stageIndex,
        start: target.groupIndex - 0.45,
        end: target.groupIndex + 0.45,
      },
    ];
  });
  const grouped = groupBy(candidates, ({ key }) => key);
  for (const group of grouped.values()) {
    assignIntervalSlots(group, ({ edge }, approach) => {
      slots.get(edge.id).approach = approach;
    });
  }
}

function assignBackRailSlots(records, slots) {
  const candidates = records.flatMap((record) => {
    const { edge, source, target } = record;
    const sameCellEdge =
      edge.type !== "message" &&
      target.stageIndex === source.stageIndex &&
      target.groupIndex === source.groupIndex;
    if (target.stageIndex >= source.stageIndex && !sameCellEdge) return [];
    return [
      {
        ...record,
        key: "backward",
        start: sameCellEdge ? source.stageIndex - 0.1 : target.stageIndex,
        end: sameCellEdge ? source.stageIndex + 0.1 : source.stageIndex,
      },
    ];
  });
  assignIntervalSlots(candidates, ({ edge }, backRail) => {
    slots.get(edge.id).backRail = backRail;
  });
}

function assignIntervalSlots(records, assign) {
  const slotEnds = [];
  [...records]
    .sort(
      (left, right) =>
        left.start - right.start ||
        left.end - right.end ||
        left.edge.id.localeCompare(right.edge.id)
    )
    .forEach((record) => {
      let slot = slotEnds.findIndex((end) => record.start > end + 0.05);
      if (slot === -1) {
        slot = slotEnds.length;
        slotEnds.push(record.end);
      } else {
        slotEnds[slot] = record.end;
      }
      assign(record, slot);
    });
}

function groupBy(values, keyFor) {
  const grouped = new Map();
  for (const value of values) {
    const key = keyFor(value);
    const group = grouped.get(key) ?? [];
    group.push(value);
    grouped.set(key, group);
  }
  return grouped;
}

function partitionLanes(lanes) {
  const groupCount = Math.min(4, lanes.length);
  if (groupCount === 0) return [];

  const baseSize = Math.floor(lanes.length / groupCount);
  const sizes = Array.from({ length: groupCount }, () => baseSize);
  const remainder = lanes.length % groupCount;
  const order = EXTRA_LANE_ORDER.filter((index) => index < groupCount);
  for (let index = 0; index < remainder; index += 1) {
    sizes[order[index] ?? index] += 1;
  }

  let cursor = 0;
  return sizes.map((size) => {
    const group = lanes.slice(cursor, cursor + size);
    cursor += size;
    return group;
  });
}

function summarizeGroupTitle(lanes) {
  if (lanes.length === 1) return truncate(compactLaneLabel(lanes[0]), 18);
  if (lanes.length === 2) {
    return truncate(
      `${compactLaneLabel(lanes[0])}·${compactLaneLabel(lanes[1])}`,
      18
    );
  }
  return `${truncate(compactLaneLabel(lanes[0]), 13)} 외 ${lanes.length - 1}`;
}

function compactLaneLabel(lane) {
  const cleaned = lane
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replaceAll("/", "·")
    .trim();
  if (Array.from(cleaned).length <= 9) return cleaned;
  return cleaned.split("·")[0].trim();
}

function truncate(value, maxLength) {
  const chars = Array.from(value);
  return chars.length <= maxLength
    ? value
    : `${chars.slice(0, maxLength - 1).join("")}…`;
}
