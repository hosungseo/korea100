import fs from "fs";
import path from "path";
import type {
  ArticleTextEntry,
  FieldVerificationQueue,
  Institution,
  InstitutionSummary,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data", "institutions");
const ARTICLE_TEXT_REGISTRY_PATH = path.join(
  process.cwd(),
  "data",
  "article-text-registry.json"
);
const MANIFEST_PATH = path.join(process.cwd(), "..", "docs", "institutions-100-manifest.json");
const FIELD_QUEUE_PATH = path.join(
  process.cwd(),
  "..",
  "docs",
  "field-verification-queue.json"
);

interface ManifestEntry {
  priority: number;
  slug: string;
  name: string;
  type: string;
  category: string;
}

interface StoredArticleText {
  article: string;
  title?: string;
  text: string;
  effectiveOn?: string | null;
  checkedAt: string;
}

interface ArticleTextReference {
  key: string;
  article: string;
  citation: string;
  paragraph: number | null;
  item: number | null;
  subitem: string | null;
}

interface ArticleTextRegistry {
  articles: Record<string, StoredArticleText>;
  institutions: Record<string, Record<string, ArticleTextReference[]>>;
}

let articleTextRegistry: ArticleTextRegistry | null | undefined;
const CIRCLED_PARAGRAPHS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚";

function loadArticleTextRegistry(): ArticleTextRegistry | null {
  if (articleTextRegistry !== undefined) return articleTextRegistry;
  if (!fs.existsSync(ARTICLE_TEXT_REGISTRY_PATH)) {
    articleTextRegistry = null;
    return articleTextRegistry;
  }
  articleTextRegistry = JSON.parse(
    fs.readFileSync(ARTICLE_TEXT_REGISTRY_PATH, "utf8")
  ) as ArticleTextRegistry;
  return articleTextRegistry;
}

function nextMarkerIndex(lines: string[], start: number, pattern: RegExp): number {
  const next = lines.findIndex((line, index) => index > start && pattern.test(line.trim()));
  return next === -1 ? lines.length : next;
}

function citationExcerpt(text: string, reference: ArticleTextReference): string {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return text;

  let selected = lines;
  if (reference.paragraph) {
    const marker = CIRCLED_PARAGRAPHS[reference.paragraph - 1];
    const start = marker ? lines.findIndex((line) => line.startsWith(marker)) : -1;
    if (start >= 0) {
      const end = nextMarkerIndex(lines, start, /^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚]/);
      selected = lines.slice(start, end);
    }
  }

  if (reference.item) {
    const itemPattern = new RegExp(`^${reference.item}\\.\\s*`);
    const start = selected.findIndex((line) => itemPattern.test(line));
    if (start >= 0) {
      const end = nextMarkerIndex(selected, start, /^\d+\.\s*/);
      const parent = reference.paragraph && start > 0 ? [selected[0]] : [];
      selected = [...parent, ...selected.slice(start, end)];
    }
  }

  return selected.join("\n");
}

function attachArticleTexts(institution: Institution): Institution {
  if (!institution.verification || !institution.process) return institution;
  const registry = loadArticleTextRegistry();
  const references = registry?.institutions?.[institution.slug];
  if (!registry || !references) return institution;

  const articleTexts: Record<string, ArticleTextEntry[]> = {};
  for (const node of institution.process.nodes) {
    for (const [basisIndex] of (node.legal_basis ?? []).entries()) {
      const basisKey = `${node.id}:${basisIndex}`;
      const entries = (references[basisKey] ?? []).flatMap((reference) => {
        const stored = registry.articles[reference.key];
        if (!stored) return [];
        return [{
          ...stored,
          sourceKey: reference.key.slice(0, reference.key.lastIndexOf("::")),
          citation: reference.citation,
          text: citationExcerpt(stored.text, reference),
        }];
      });
      if (entries.length > 0) articleTexts[basisKey] = entries;
    }
  }

  if (Object.keys(articleTexts).length > 0) {
    institution.verification.articleTexts = articleTexts;
  }
  return institution;
}

function loadManifest(): ManifestEntry[] {
  if (!fs.existsSync(MANIFEST_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8")) as ManifestEntry[];
  } catch {
    return [];
  }
}

function buildCategoryMap(): Map<string, string> {
  const manifest = loadManifest();
  const map = new Map<string, string>();
  for (const entry of manifest) {
    if (entry.slug && entry.category) {
      map.set(entry.slug, entry.category);
    }
  }
  return map;
}

export function getCategoryOrder(): string[] {
  const manifest = loadManifest();
  const seen = new Set<string>();
  const order: string[] = [];
  for (const entry of manifest) {
    if (entry.category && !seen.has(entry.category)) {
      seen.add(entry.category);
      order.push(entry.category);
    }
  }
  return order;
}

export function getAllInstitutions(): Institution[] {
  if (!fs.existsSync(DATA_DIR)) return [];
  const categoryMap = buildCategoryMap();
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const institutions = files.map((file) => {
    const content = fs.readFileSync(path.join(DATA_DIR, file), "utf-8");
    const inst = JSON.parse(content) as Institution;
    if (!inst.category) {
      inst.category = categoryMap.get(inst.slug) ?? "기타";
    }
    return inst;
  });
  return institutions.sort((a, b) => a.priority - b.priority);
}

export function toInstitutionSummary(
  institution: Institution
): InstitutionSummary {
  const category = institution.category ?? "기타";
  const article = institution.verification?.articleVerification;
  const gatewayCount =
    institution.process?.nodes.filter((node) => node.type === "gateway").length ??
    0;

  return {
    slug: institution.slug,
    name: institution.name,
    oneLiner: institution.oneLiner,
    type: institution.type,
    priority: institution.priority,
    category,
    asOfDate: institution.asOfDate,
    processNodeCount: institution.process?.nodes.length ?? 0,
    processStageCount: institution.process?.stages.length ?? 0,
    processLaneCount: institution.process?.lanes.length ?? 0,
    processGatewayCount: gatewayCount,
    legalBasisCount: institution.canvas.legalBasis.length,
    fieldVerificationCount: institution.fieldVerification.length,
    bottleneckCount: institution.canvas.bottlenecks.length,
    verificationStatus: institution.verification?.status,
    verifiedReferences: article?.verifiedReferences ?? 0,
    articleReferences: article?.articleReferences ?? 0,
    sourceCount: institution.verification?.sources.length ?? 0,
    laws: institution.canvas.legalBasis.map((basis) => basis.law),
  };
}

export function getInstitutionSummaries(): InstitutionSummary[] {
  return getAllInstitutions().map(toInstitutionSummary);
}

export interface RegistryStats {
  modelCount: number;
  processNodeCount: number;
  articleReferences: number;
  verifiedReferences: number;
  sourceCount: number;
  articleVerifiedCount: number;
  needsReviewCount: number;
}

export function getRegistryStats(
  summaries: InstitutionSummary[] = getInstitutionSummaries()
): RegistryStats {
  return summaries.reduce<RegistryStats>(
    (stats, institution) => ({
      modelCount: stats.modelCount + 1,
      processNodeCount: stats.processNodeCount + institution.processNodeCount,
      articleReferences: stats.articleReferences + institution.articleReferences,
      verifiedReferences:
        stats.verifiedReferences + institution.verifiedReferences,
      sourceCount: stats.sourceCount + institution.sourceCount,
      articleVerifiedCount:
        stats.articleVerifiedCount +
        (institution.verificationStatus === "article-verified" ? 1 : 0),
      needsReviewCount:
        stats.needsReviewCount +
        (institution.verificationStatus === "needs-review" ? 1 : 0),
    }),
    {
      modelCount: 0,
      processNodeCount: 0,
      articleReferences: 0,
      verifiedReferences: 0,
      sourceCount: 0,
      articleVerifiedCount: 0,
      needsReviewCount: 0,
    }
  );
}

export function getInstitution(slug: string): Institution | null {
  const filePath = path.join(DATA_DIR, `${slug}.json`);
  if (!fs.existsSync(filePath)) return null;
  const categoryMap = buildCategoryMap();
  const content = fs.readFileSync(filePath, "utf-8");
  const inst = JSON.parse(content) as Institution;
  if (!inst.category) {
    inst.category = categoryMap.get(slug) ?? "기타";
  }
  return attachArticleTexts(inst);
}

export function getAllSlugs(): string[] {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""));
}

export function getFieldVerificationQueue(): FieldVerificationQueue {
  return JSON.parse(fs.readFileSync(FIELD_QUEUE_PATH, "utf8")) as FieldVerificationQueue;
}
