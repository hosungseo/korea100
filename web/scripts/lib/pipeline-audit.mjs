/**
 * Structured audit log for Korea100 institution pipeline.
 * No secrets. Append-only JSONL + latest JSON summary.
 */
import fs from "node:fs";
import path from "node:path";

export function createAuditSession({ repoDir, runId = null } = {}) {
  const startedAt = new Date();
  const id =
    runId ||
    startedAt.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(startedAt);
  const dir = path.join(repoDir, "docs", "pipeline-audit", day);
  fs.mkdirSync(dir, { recursive: true });
  const jsonlPath = path.join(dir, `${id}.jsonl`);
  const summaryPath = path.join(dir, `${id}.summary.json`);
  const latestPath = path.join(repoDir, "docs", "pipeline-audit", "latest.json");

  const state = {
    runId: id,
    day,
    startedAt: startedAt.toISOString(),
    stages: {},
    gates: [],
    errors: [],
    counts: {},
  };

  function write(event) {
    const row = {
      ts: new Date().toISOString(),
      runId: id,
      ...event,
    };
    fs.appendFileSync(jsonlPath, `${JSON.stringify(row)}\n`);
    return row;
  }

  function stage(name, status, detail = {}) {
    state.stages[name] = {
      status,
      at: new Date().toISOString(),
      ...detail,
    };
    return write({ type: "stage", stage: name, status, ...detail });
  }

  function gate(name, ok, detail = {}) {
    const entry = {
      gate: name,
      ok: Boolean(ok),
      at: new Date().toISOString(),
      ...detail,
    };
    state.gates.push(entry);
    write({ type: "gate", ...entry });
    return Boolean(ok);
  }

  function count(key, value) {
    state.counts[key] = value;
  }

  function error(message, detail = {}) {
    const entry = { message, at: new Date().toISOString(), ...detail };
    state.errors.push(entry);
    write({ type: "error", ...entry });
  }

  function finish(status = "ok") {
    state.finishedAt = new Date().toISOString();
    state.status = status;
    state.durationMs = Date.now() - startedAt.getTime();
    const summary = {
      ...state,
      paths: {
        jsonl: path.relative(repoDir, jsonlPath),
        summary: path.relative(repoDir, summaryPath),
      },
    };
    fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
    fs.writeFileSync(latestPath, `${JSON.stringify(summary, null, 2)}\n`);
    // day index
    const indexPath = path.join(dir, "INDEX.md");
    const line = `| ${id} | ${status} | ${summary.durationMs}ms | ${JSON.stringify(state.counts)} |\n`;
    if (!fs.existsSync(indexPath)) {
      fs.writeFileSync(
        indexPath,
        `# pipeline audit ${day}\n\n| runId | status | duration | counts |\n|---|---|---:|---|\n`,
      );
    }
    fs.appendFileSync(indexPath, line);
    write({ type: "finish", status, durationMs: summary.durationMs, counts: state.counts });
    return summary;
  }

  write({ type: "start", day });
  return {
    id,
    day,
    jsonlPath,
    summaryPath,
    latestPath,
    stage,
    gate,
    count,
    error,
    finish,
    state,
  };
}
