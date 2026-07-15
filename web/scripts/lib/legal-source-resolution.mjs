const LAW_ALIASES = new Map(
  [
    ["하도급법", "하도급거래 공정화에 관한 법률"],
    ["공정거래법", "독점규제 및 공정거래에 관한 법률"],
    ["배출권거래법", "온실가스 배출권의 할당 및 거래에 관한 법률"],
    ["배출권거래법 시행령", "온실가스 배출권의 할당 및 거래에 관한 법률 시행령"],
    ["인공지능 기본법", "인공지능 발전과 신뢰 기반 조성 등에 관한 기본법"],
    ["인공지능 기본법 시행령", "인공지능 발전과 신뢰 기반 조성 등에 관한 기본법 시행령"],
    ["112신고의 운영 및 처리 등에 관한 법률", "112신고의 운영 및 처리에 관한 법률"],
  ].map(([alias, official]) => [compactLawName(alias), official]),
);

const COMPOSITE_LAWS = new Map(
  [
    ["근로기준법·노동조합 및 노동관계조정법", ["근로기준법", "노동조합 및 노동관계조정법"]],
    ["방송심의에 관한 규정·정보통신에 관한 심의규정", ["방송심의에 관한 규정", "정보통신에 관한 심의규정"]],
    ["난민법 및 행정소송법", ["난민법", "행정소송법"]],
    ["행정심판법·행정소송법", ["행정심판법", "행정소송법"]],
    ["민법·상법 등 실체법", ["민법", "상법"]],
    ["법률구조법 시행령·공단 내부규정", ["법률구조법 시행령"]],
    ["인공지능 기본법 시행령·고시", ["인공지능 기본법 시행령"]],
  ].map(([law, targets]) => [compactLawName(law), targets]),
);

export function compactLawName(value) {
  return (value ?? "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, "")
    .replace(/[「」『』“”‘’·ㆍ,;:/]/g, "")
    .trim();
}

export function legalSourceKey(source) {
  const type = source?.sourceType ?? "statute";
  const id = type === "statute"
    ? source?.mst
    : type === "admin-rule"
      ? source?.adminRuleSerial
      : source?.treatyId;
  return id && id !== "0" ? `${type}:${id}` : null;
}

function sourceNames(source) {
  return [source.law, source.officialName].filter(Boolean);
}

function lawTargets(law) {
  const compact = compactLawName(law);
  const composite = COMPOSITE_LAWS.get(compact);
  if (composite) return composite;
  const alias = LAW_ALIASES.get(compact);
  if (alias) return [alias];
  if (/\s+및\s+하위법령\s*$/.test(law)) return [law.replace(/\s+및\s+하위법령\s*$/, "")];
  return [law];
}

export function findLegalSources(law, sources) {
  const targets = lawTargets(law);
  const matched = sources.filter((source) => targets.some((target) => {
    const targetKey = compactLawName(target);
    return sourceNames(source).some((name) => compactLawName(name) === targetKey);
  }));

  if (/\s+및\s+하위법령\s*$/.test(law)) {
    const base = compactLawName(targets[0]);
    matched.push(...sources.filter((source) =>
      sourceNames(source).some((name) => compactLawName(name).startsWith(base)),
    ));
  }

  const seen = new Set();
  return matched.filter((source) => {
    const key = legalSourceKey(source) ?? source.officialUrl;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
