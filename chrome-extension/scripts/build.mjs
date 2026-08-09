import { mkdir, readFile, readdir, rm, writeFile, cp, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(extensionRoot, "..");
const sourceDir = path.join(extensionRoot, "src");
const institutionDir = path.join(repositoryRoot, "web", "data", "institutions");
const distDir = path.join(extensionRoot, "dist");
const dataDir = path.join(distDir, "data");
const detailDir = path.join(dataDir, "institutions");
const iconDir = path.join(distDir, "icons");

const iconNames = [
  "arrow-down",
  "arrow-up",
  "book-open",
  "check",
  "chevron-left",
  "circle-alert",
  "copy",
  "database",
  "download",
  "external-link",
  "file-text",
  "folder-open",
  "git-pull-request",
  "inbox",
  "link-2",
  "panel-right-open",
  "pencil",
  "plus",
  "save",
  "search",
  "settings-2",
  "shield-check",
  "star",
  "trash-2",
  "upload",
  "x"
];

function compact(value) {
  if (Array.isArray(value)) return value.map(compact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, compact(item)]));
}

function projectLegalBasis(items) {
  return (items ?? []).map((item) =>
    compact({
      law: item.law,
      article: item.article ?? item.articles,
      text: item.text,
      url: item.url ?? item.sourceUrl,
      verifiedAt: item.verifiedAt
    })
  );
}

function projectInstitution(source) {
  const process = source.process ?? {};
  return compact({
    schemaVersion: "1.0.0",
    source: "korea100",
    pageUrl: `https://hosungseo.github.io/korea100/model/${source.slug}/`,
    slug: source.slug,
    name: source.name,
    oneLiner: source.oneLiner,
    type: source.type,
    category: source.category,
    asOfDate: source.asOfDate,
    canvas: {
      purpose: source.canvas?.purpose,
      docsFlow: source.canvas?.docsFlow,
      bottlenecks: source.canvas?.bottlenecks,
      legalBasis: source.canvas?.legalBasis,
      authorities: source.canvas?.authorities
    },
    process: {
      institution_name: process.institution_name,
      law_name: process.law_name,
      lanes: process.lanes ?? [],
      stages: process.stages ?? [],
      nodes: (process.nodes ?? []).map((node) =>
        compact({
          id: node.id,
          name: node.name,
          lane: node.lane,
          stage: node.stage,
          type: node.type,
          actor: node.actor,
          receiver: node.receiver,
          action: node.action,
          condition: node.condition,
          input_documents: node.input_documents,
          output_documents: node.output_documents,
          deadline: node.deadline,
          blocker: node.blocker,
          confidence: node.confidence,
          unverified: node.unverified,
          unverified_note: node.unverified_note,
          legal_basis: projectLegalBasis(node.legal_basis)
        })
      ),
      edges: (process.edges ?? []).map((edge) =>
        compact({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: edge.type,
          label: edge.label
        })
      )
    }
  });
}

function projectCatalog(source) {
  const process = source.process ?? {};
  const lawNames = [...new Set((source.canvas?.legalBasis ?? []).map((item) => item.law).filter(Boolean))];
  const searchText = [
    source.name,
    source.oneLiner,
    source.type,
    source.category,
    process.law_name,
    ...lawNames,
    ...(process.lanes ?? []),
    ...(process.nodes ?? []).flatMap((node) => [node.name, node.actor, node.action])
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("ko-KR");

  return {
    slug: source.slug,
    name: source.name,
    oneLiner: source.oneLiner,
    type: source.type,
    category: source.category,
    asOfDate: source.asOfDate,
    priority: source.priority ?? 9999,
    nodeCount: process.nodes?.length ?? 0,
    laneCount: process.lanes?.length ?? 0,
    lawNames,
    searchText
  };
}

await rm(distDir, { recursive: true, force: true });
await mkdir(detailDir, { recursive: true });
await mkdir(iconDir, { recursive: true });
await cp(sourceDir, distDir, { recursive: true });
await copyFile(path.join(extensionRoot, "README.md"), path.join(distDir, "README.md"));
await copyFile(path.join(extensionRoot, "PRIVACY.md"), path.join(distDir, "PRIVACY.md"));

const files = (await readdir(institutionDir)).filter((file) => file.endsWith(".json")).sort();
const catalog = [];
for (const file of files) {
  const source = JSON.parse(await readFile(path.join(institutionDir, file), "utf8"));
  if (!source.slug || !source.name || !source.process) {
    throw new Error(`${file}: 확장 프로그램 데이터에 필요한 slug, name, process가 없습니다.`);
  }
  catalog.push(projectCatalog(source));
  await writeFile(
    path.join(detailDir, `${source.slug}.json`),
    `${JSON.stringify(projectInstitution(source))}\n`,
    "utf8"
  );
}

catalog.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name, "ko"));
await writeFile(path.join(dataDir, "catalog.json"), `${JSON.stringify(catalog)}\n`, "utf8");
await writeFile(
  path.join(dataDir, "build-info.json"),
  `${JSON.stringify({ schemaVersion: "1.0.0", institutionCount: catalog.length })}\n`,
  "utf8"
);

const lucideDir = path.join(extensionRoot, "node_modules", "lucide-static", "icons");
for (const name of iconNames) {
  await copyFile(path.join(lucideDir, `${name}.svg`), path.join(iconDir, `${name}.svg`));
}

const brandSvg = path.join(sourceDir, "assets", "brand.svg");
for (const size of [16, 32, 48, 128]) {
  await sharp(brandSvg).resize(size, size).png().toFile(path.join(distDir, "assets", `icon-${size}.png`));
}

console.log(`Korea100 작업대 빌드 완료: 제도 ${catalog.length}개`);
