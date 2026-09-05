// 0단계 로더. 워룸 프로젝트 JSON + 제도 템플릿 → 공용 절차 레코드 배열.
// 편입 규칙은 web/tools/gen-warroom.mjs와 같다: nodeIds가 있으면 그 노드만, 없으면 제도 전체.
import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson } from './lib/io.mjs';
import { ROOT, OUT_COMPARE } from './lib/paths.mjs';

const DEFAULT_PROJECT = 'gwangju-semiconductor-cluster';
export const BUNDLE = ['N36', 'N09', 'N11', 'N12', 'N38', 'N39', 'N40', 'N13', 'N14', 'N37', 'N10', 'N15'];

function record(ms, gateIndex, msOrder, onCritical, slug, inst, n) {
  return {
    pid: `${ms.id}:${slug}:${n.id}`,
    ms: ms.id, msName: ms.name, stage: ms.stage ?? null, gateIndex, msOrder,
    institution: slug, institutionName: inst.name ?? slug,
    nodeId: n.id, name: n.name, action: n.action ?? '', actorRaw: n.actor ?? n.lane ?? ms.authority ?? '',
    type: n.type ?? 'task', outputs: n.output_documents ?? [], inputs: n.input_documents ?? [],
    deadlineRaw: n.deadline ?? null,
    legal: (n.legal_basis ?? []).map((b) => ({ law: b.law, article: b.article, text: b.text ?? '' })),
    onCritical,
  };
}

export function loadProcedures({
  projectFile = path.join(ROOT, 'web/data/mega-projects/projects', `${DEFAULT_PROJECT}.json`),
  pathFile = path.join(ROOT, 'web/public/warroom/p', DEFAULT_PROJECT, 'path.json'),
  institutionsDir = path.join(ROOT, 'web/data/institutions'),
  milestones = null, institutions = null,
} = {}) {
  const project = readJson(projectFile);
  const pathJson = fs.existsSync(pathFile) ? readJson(pathFile) : { scenarios: [{ critical: [], eta: {} }] };
  const s0 = pathJson.scenarios?.[0] ?? { critical: [], eta: {} };
  const critical = new Set(s0.critical ?? []);
  const stageIdx = new Map((project.stages ?? []).map((s, i) => [s.id, i]));
  const instCache = new Map();
  const inst = (slug) => {
    if (!instCache.has(slug)) {
      const f = path.join(institutionsDir, `${slug}.json`);
      instCache.set(slug, fs.existsSync(f) ? readJson(f) : null);
    }
    return instCache.get(slug);
  };

  const out = [];
  if (institutions) {
    for (const slug of institutions) {
      const t = inst(slug);
      if (!t) throw new Error(`unknown institution ${slug}`);
      const ms = { id: `INST:${slug}`, name: t.name ?? slug, stage: null, authority: '' };
      for (const n of t.process?.nodes ?? []) out.push(record(ms, 0, 0, false, slug, t, n));
    }
    return out;
  }

  const byId = new Map(project.nodes.map((n) => [n.id, n]));
  const wanted = milestones ?? project.nodes.map((n) => n.id);
  for (const id of wanted) if (!byId.has(id)) throw new Error(`unknown milestone ${id}`);
  const ordered = [...wanted].sort((a, b) => {
    const ea = s0.eta?.[a]?.[0] ?? Number.MAX_SAFE_INTEGER, eb = s0.eta?.[b]?.[0] ?? Number.MAX_SAFE_INTEGER;
    return ea - eb || (a < b ? -1 : a > b ? 1 : 0);
  });
  ordered.forEach((id, msOrder) => {
    const ms = byId.get(id);
    const gateIndex = stageIdx.get(ms.stage) ?? 0;
    const onCritical = critical.has(id);
    for (const ref of ms.templateRefs ?? []) {
      const t = inst(ref.institution);
      if (!t) continue; // gen-warroom과 같이 템플릿 없는 참조는 건너뛴다
      const nodes = t.process?.nodes ?? [];
      const sel = ref.nodeIds ? nodes.filter((n) => ref.nodeIds.includes(n.id)) : nodes;
      for (const n of sel) out.push(record(ms, gateIndex, msOrder, onCritical, ref.institution, t, n));
    }
  });
  return out;
}

// CLI: node load.mjs [--project id] [--milestones N36,N09] [--institutions a,b] [--out file]
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
  const project = arg('--project', DEFAULT_PROJECT);
  const opts = {
    projectFile: path.join(ROOT, 'web/data/mega-projects/projects', `${project}.json`),
    pathFile: path.join(ROOT, 'web/public/warroom/p', project, 'path.json'),
  };
  const msArg = arg('--milestones'); const instArg = arg('--institutions');
  if (instArg) opts.institutions = instArg.split(',');
  else opts.milestones = msArg === 'all' ? null : (msArg ? msArg.split(',') : BUNDLE);
  const procs = loadProcedures(opts);
  const outFile = arg('--out', path.join(OUT_COMPARE, 'procedures.json'));
  writeJson(outFile, procs);
  const laws = new Set(procs.flatMap((p) => p.legal.map((l) => l.law)));
  console.log(`procedures ${procs.length} · milestones ${new Set(procs.map((p) => p.ms)).size} · institutions ${new Set(procs.map((p) => p.institution)).size} · laws ${laws.size} → ${outFile}`);
}
