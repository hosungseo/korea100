// 절대경로 한 곳. ROOT = 저장소 루트(이 파일에서 4단계 위).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const COMPARE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const ROOT = path.resolve(COMPARE, '..', '..', '..', '..');
export const OUT = path.join(ROOT, 'artifacts', 'complex-minwon', '04-deemed-bundle');
export const OUT_COMPARE = path.join(OUT, 'compare');
export const CACHE = path.join(COMPARE, '.cache');
