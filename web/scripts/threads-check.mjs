import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  debugThreadsToken,
  getRecentThreads,
  getThreadsProfile,
  loadEnvFile,
  maskSecret,
  requireThreadsConfig,
  summarizeThread,
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

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

async function run() {
  loadEnvFile(path.join(WEB_DIR, ".env.local"));
  loadEnvFile(path.join(REPO_DIR, ".env"));

  const limit = Number(argumentValue("--limit", "3"));
  const config = requireThreadsConfig(threadsConfigFromEnv());
  const profile = await getThreadsProfile(config);
  const tokenDebug = await debugThreadsToken(config);
  const profileConfig = { ...config, userId: config.userId === "me" ? profile.id : config.userId };
  const recent = await getRecentThreads(profileConfig, { limit });
  const expiresAt = tokenDebug.data?.expires_at
    ? new Date(tokenDebug.data.expires_at * 1000).toISOString()
    : null;

  printJson({
    ok: true,
    credentials: {
      appId: maskSecret(config.appId),
      appSecret: maskSecret(config.appSecret),
      accessToken: maskSecret(config.accessToken),
      userId: profileConfig.userId,
    },
    profile: {
      id: profile.id,
      username: profile.username,
      name: profile.name,
    },
    token: {
      isValid: tokenDebug.data?.is_valid ?? null,
      scopes: tokenDebug.data?.scopes ?? [],
      expiresAt,
    },
    recentThreads: (recent.data ?? []).map(summarizeThread),
  });
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
