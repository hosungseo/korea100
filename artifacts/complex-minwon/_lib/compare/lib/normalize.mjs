import path from 'node:path';
import { readJson } from './io.mjs';
import { COMPARE } from './paths.mjs';

export const loadOrgs = () => readJson(path.join(COMPARE, 'orgs.json'));
export const loadSubjects = () => readJson(path.join(COMPARE, 'subjects.json')).subjects;
export const loadPreserve = () => readJson(path.join(COMPARE, 'preserve.json')).preserve;

function lookup(raw, orgs) {
  for (const [code, o] of Object.entries(orgs.orgs)) if (o.aliases.includes(raw)) return { org: code, label: o.label, kind: 'org' };
  for (const [code, r] of Object.entries(orgs.roles)) if (r.aliases.includes(raw)) return { org: code, label: r.label, kind: 'role' };
  if (orgs.applicants.includes(raw)) return { org: 'applicant', label: '신청인·사업시행자', kind: 'applicant' };
  return null;
}

// 정확한 별칭 → 그대로. 없으면 '·'로 나눠 첫 해석 가능한 항을 쓰고 나머지는 also에.
// 어느 것도 안 되면 원문 유지 + unknown. 역할명을 기관으로 추측하지 않는다.
export function normalizeOrg(raw, orgs) {
  const s = (raw ?? '').trim();
  const exact = lookup(s, orgs);
  if (exact) return { ...exact, also: [], unknown: false };
  const parts = s.split('·').map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    for (let i = 0; i < parts.length; i++) {
      const hit = lookup(parts[i], orgs);
      if (hit) return { ...hit, also: parts.filter((_, j) => j !== i), unknown: false };
    }
  }
  return { org: s, label: s, kind: 'unknown', also: [], unknown: true };
}

export function preserveHit(proc, preserve) {
  for (const p of preserve) {
    const re = new RegExp(p.pattern);
    if (re.test(proc.name ?? '') && (proc.legal ?? []).some((l) => l.law === p.law)) return p;
  }
  return null;
}
