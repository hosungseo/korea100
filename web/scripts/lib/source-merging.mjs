function normalizedSourceName(source) {
  return (source.officialName ?? source.law ?? "")
    .replace(/\s+/g, "")
    .replace(/[「」『』“”‘’·ㆍ]/g, "")
    .trim();
}

function sourceIdentity(source) {
  const name = normalizedSourceName(source);
  return [source.sourceType, name].join("\u0000");
}

export function mergeExistingSources(generatedSources, existingSources = []) {
  const existingByIdentity = new Map(
    existingSources.map((source) => [sourceIdentity(source), source]),
  );
  const merged = generatedSources.map((source) => {
    const existing = existingByIdentity.get(sourceIdentity(source));
    if (existing?.pinnedVersion) return { ...source, ...existing };
    return { ...(existing ?? {}), ...source };
  });
  const generatedIdentities = new Set(merged.map(sourceIdentity));

  // Curated supporting sources may be more specific than an unresolved canvas label.
  for (const source of existingSources) {
    if (!generatedIdentities.has(sourceIdentity(source))) merged.push(source);
  }
  return merged;
}

export function filterUnresolvedAgainstSources(unresolved, sources) {
  const linkedNames = new Set(sources.map(normalizedSourceName));
  return unresolved.filter((item) => !linkedNames.has(normalizedSourceName(item)));
}
