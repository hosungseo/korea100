import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createTextContainer,
  getThreadsProfile,
  loadEnvFile,
  publishContainer,
  requireThreadsConfig,
  threadsConfigFromEnv,
} from "./lib/threads-api.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.dirname(SCRIPT_DIR);
const REPO_DIR = path.dirname(WEB_DIR);

function argumentValue(name, fallback) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function readTextArgument() {
  const text = argumentValue("--text", "");
  if (text) return text;
  const filePath = argumentValue("--file", "");
  if (!filePath) return "";
  return fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8").trim();
}

function output(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

async function run() {
  loadEnvFile(path.join(WEB_DIR, ".env.local"));
  loadEnvFile(path.join(REPO_DIR, ".env"));

  const config = requireThreadsConfig(threadsConfigFromEnv());
  const profile = await getThreadsProfile(config);
  const publishConfig = { ...config, userId: config.userId === "me" ? profile.id : config.userId };
  const text = readTextArgument();
  if (!text) throw new Error("Provide --text=... or --file=...");

  if (!process.argv.includes("--confirm")) {
    output({
      dryRun: true,
      profile: { id: profile.id, username: profile.username },
      userId: publishConfig.userId,
      textLength: text.length,
      textPreview: text.length > 120 ? `${text.slice(0, 120)}...` : text,
      nextStep: "Re-run with --confirm to create and publish the Threads post.",
    });
    return;
  }

  const container = await createTextContainer(publishConfig, { text });
  const published = await publishContainer(publishConfig, { creationId: container.id });
  output({
    ok: true,
    profile: { id: profile.id, username: profile.username },
    containerId: container.id,
    threadId: published.id,
  });
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
