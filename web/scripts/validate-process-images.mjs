import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const dataDir = path.join(webRoot, "data/institutions");
const imageDir = path.join(webRoot, "public/exports/process-maps");
const files = (await fs.readdir(dataDir))
  .filter((file) => file.endsWith(".json"))
  .sort();
const expectedSlugs = [];

for (const file of files) {
  const institution = JSON.parse(await fs.readFile(path.join(dataDir, file), "utf8"));
  expectedSlugs.push(institution.slug);
}

const imageFiles = (await fs.readdir(imageDir))
  .filter((file) => file.endsWith(".png"))
  .sort();
const expectedFiles = expectedSlugs.map((slug) => `${slug}.png`).sort();
const errors = [];

if (JSON.stringify(imageFiles) !== JSON.stringify(expectedFiles)) {
  errors.push(
    `PNG 파일 구성이 원본 slug와 다릅니다 (${imageFiles.length}/${expectedFiles.length})`
  );
}

await Promise.all(
  expectedFiles.map(async (file) => {
    try {
      const metadata = await sharp(path.join(imageDir, file)).metadata();
      if (metadata.width !== 1800 || metadata.height !== 2400 || metadata.format !== "png") {
        errors.push(`${file}: ${metadata.width}x${metadata.height} ${metadata.format}`);
      }
    } catch (error) {
      errors.push(`${file}: ${error.message}`);
    }
  })
);

if (errors.length > 0) {
  console.error(`세로형 PNG 검증 실패: ${errors.length}건`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`세로형 PNG 검증 성공: ${expectedFiles.length}개, 1800x2400`);
