function sourceIdentity(source) {
  const name = (source.officialName ?? source.law ?? "")
    .replace(/\s+/g, "")
    .replace(/[「」『』“”‘’·ㆍ]/g, "")
    .trim();
  return [source.sourceType, name].join("\u0000");
}

export function mergeExistingSources(generatedSources, existingSources = []) {
  const existingByIdentity = new Map(
    existingSources.map((source) => [sourceIdentity(source), source]),
  );
  const merged = generatedSources.map((source) => ({
    ...(existingByIdentity.get(sourceIdentity(source)) ?? {}),
    ...source,
  }));
  const generatedIdentities = new Set(merged.map(sourceIdentity));

  // Curated supporting sources may be more specific than an unresolved canvas label.
  for (const source of existingSources) {
    if (!generatedIdentities.has(sourceIdentity(source))) merged.push(source);
  }
  return merged;
}
