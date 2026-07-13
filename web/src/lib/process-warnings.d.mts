export interface ProcessWarningRecord {
  date?: string;
  message?: string;
  detail?: string;
  content?: string;
  "내용"?: string;
  [key: string]: unknown;
}

export type ProcessWarning = string | ProcessWarningRecord;

export function formatProcessWarning(warning: unknown): string | null;
export function formatProcessWarnings(warnings: unknown): string[];
