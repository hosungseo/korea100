import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(root, "dist", "manifest.json"), "utf8"));
const releaseDir = path.join(root, "release");
const archive = path.join(releaseDir, `korea100-workbench-${manifest.version}.zip`);

await mkdir(releaseDir, { recursive: true });
await rm(archive, { force: true });
const result = spawnSync("zip", ["-q", "-r", archive, "."], {
  cwd: path.join(root, "dist"),
  stdio: "inherit"
});
if (result.status !== 0) throw new Error("ZIP 패키지 생성에 실패했습니다.");
console.log(`배포 ZIP 생성: ${archive}`);
