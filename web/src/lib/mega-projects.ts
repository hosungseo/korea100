import fs from "node:fs";
import path from "node:path";
import type {
  MegaArtifactRegistry,
  MegaProject,
  MegaProjectBundle,
} from "./mega-project-types";

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
  const templates = Object.fromEntries(
    [...templateSlugs].map((slug) => {
      const filePath = path.join(INSTITUTION_DIR, `${slug}.json`);
      if (!fs.existsSync(filePath)) return [slug, slug];
      const institution = readJson<{ name?: string }>(filePath);
      return [slug, institution.name ?? slug];
    }),
  );
  return { project, artifacts: registry.artifacts, templates };
}
