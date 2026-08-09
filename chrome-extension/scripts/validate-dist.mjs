import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const repositoryRoot = path.resolve(root, "..");

const requiredFiles = [
  "manifest.json",
  "sidepanel.html",
  "sidepanel.css",
  "sidepanel.js",
  "service-worker.js",
  "README.md",
  "PRIVACY.md",
  "data/catalog.json",
  "assets/icon-128.png"
];
for (const file of requiredFiles) await access(path.join(dist, file));

const manifest = JSON.parse(await readFile(path.join(dist, "manifest.json"), "utf8"));
const expectedPermissions = ["activeTab", "contextMenus", "scripting", "sidePanel", "storage"];
if (JSON.stringify([...manifest.permissions].sort()) !== JSON.stringify(expectedPermissions.sort())) {
  throw new Error(`manifest 권한이 예상 범위를 벗어났습니다: ${manifest.permissions.join(", ")}`);
}
if (manifest.host_permissions?.length || manifest.permissions.includes("identity")) {
  throw new Error("호스트 접근 또는 identity 권한은 허용하지 않습니다.");
}

const sourceFiles = (await readdir(path.join(repositoryRoot, "web", "data", "institutions"))).filter((file) =>
  file.endsWith(".json")
);
const catalog = JSON.parse(await readFile(path.join(dist, "data", "catalog.json"), "utf8"));
const detailFiles = (await readdir(path.join(dist, "data", "institutions"))).filter((file) => file.endsWith(".json"));
if (catalog.length !== sourceFiles.length || detailFiles.length !== sourceFiles.length) {
  throw new Error(`데이터 수 불일치: 원본 ${sourceFiles.length}, 목록 ${catalog.length}, 상세 ${detailFiles.length}`);
}
if (new Set(catalog.map((item) => item.slug)).size !== catalog.length) {
  throw new Error("catalog.json에 중복 slug가 있습니다.");
}
for (const item of catalog) {
  if (!item.slug || !item.name || !item.searchText) throw new Error(`목록 필드 누락: ${item.slug || "slug 없음"}`);
  await access(path.join(dist, "data", "institutions", `${item.slug}.json`));
}

const manifestSize = (await stat(path.join(dist, "manifest.json"))).size;
if (manifestSize > 32_000) throw new Error("manifest.json이 비정상적으로 큽니다.");

console.log(`검증 완료: 최소 권한, 제도 ${catalog.length}개, 상세 데이터 ${detailFiles.length}개`);
