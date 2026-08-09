export const APP_NAME = "Korea100 작업대";
export const SITE_ORIGIN = "https://hosungseo.github.io/korea100";
export const DRAFT_KIND = "korea100.personal-draft";
export const CONTRIBUTION_KIND = "korea100.contribution";
export const WORKSPACE_KIND = "korea100.workspace";
export const SCHEMA_VERSION = "1.0.0";
export const MAX_CAPTURE_LENGTH = 2_000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const SYNC_CHUNK_BYTES = 7_000;

export const EDGE_TYPES = [
  ["sequence", "순차"],
  ["message", "전달"],
  ["loop", "회귀"],
  ["conditional", "조건"],
  ["return", "회귀"],
  ["exception", "예외"]
];

export const NODE_TYPES = [
  ["task", "업무"],
  ["gateway", "판단"],
  ["notice", "통지"],
  ["system", "시스템"],
  ["event", "사건"],
  ["milestone", "확정"]
];
