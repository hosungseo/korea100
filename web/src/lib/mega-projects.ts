import fs from "node:fs";
import path from "node:path";
import type {
  MegaArtifactRegistry,
  MegaDetailTemplate,
  MegaProject,
  MegaProjectBundle,
} from "./mega-project-types";
import type { Institution } from "./types";

const MEGA_PROJECT_DIR = path.join(process.cwd(), "data", "mega-projects");
const PROJECT_DIR = path.join(MEGA_PROJECT_DIR, "projects");
const ARTIFACT_PATH = path.join(MEGA_PROJECT_DIR, "artifacts.json");
const INSTITUTION_DIR = path.join(process.cwd(), "data", "institutions");

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

export function getAllMegaProjectIds(): string[] {
  if (!fs.existsSync(PROJECT_DIR)) return [];
  return fs
    .readdirSync(PROJECT_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""))
    .sort();
}

export function getMegaProject(id: string): MegaProject | null {
  const filePath = path.join(PROJECT_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) return null;
  return readJson<MegaProject>(filePath);
}

export function getMegaProjectBundle(id: string): MegaProjectBundle | null {
  const project = getMegaProject(id);
  if (!project || !fs.existsSync(ARTIFACT_PATH)) return null;
  const registry = readJson<MegaArtifactRegistry>(ARTIFACT_PATH);
  const templateSlugs = new Set(
    project.nodes.flatMap((node) =>
      (node.templateRefs ?? []).map((reference) => reference.institution),
    ),
  );
  const institutions = new Map(
    [...templateSlugs].map((slug) => {
      const filePath = path.join(INSTITUTION_DIR, `${slug}.json`);
      if (!fs.existsSync(filePath)) return [slug, null] as const;
      return [slug, readJson<Institution>(filePath)] as const;
    }),
  );
  const templates = Object.fromEntries(
    [...institutions].map(([slug, institution]) => [
      slug,
      institution?.name ?? slug,
    ]),
  );
  const detailTemplates = Object.fromEntries(
    [...institutions].map(([slug, institution]) => {
      const process = institution?.process;
      const template: MegaDetailTemplate = {
        id: slug,
        name: institution?.name ?? slug,
        nodes: (process?.nodes ?? []).map((node) => ({
          id: node.id,
          name: node.name,
          actor: node.actor,
          stage: node.stage,
          type: node.type,
          outputDocuments: node.output_documents ?? [],
          legalBasisCount: node.legal_basis?.length ?? 0,
          confidence: node.confidence,
        })),
        edges: (process?.edges ?? []).map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: edge.type,
        })),
      };
      return [slug, template];
    }),
  );
  return {
    project,
    artifacts: registry.artifacts,
    templates,
    detailTemplates,
  };
}
