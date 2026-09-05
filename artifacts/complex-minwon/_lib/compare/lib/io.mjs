import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { CACHE } from './paths.mjs';

export const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

export function writeJson(f, data) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(data, null, 2) + '\n');
}

// 키 순서에 영향받지 않는 해시. 캐시 키와 "입력이 바뀌었나" 판정에 쓴다.
function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
export const sha1 = (v) => crypto.createHash('sha1').update(canonical(v)).digest('hex');

export const cachePath = (stage, hash) => path.join(CACHE, stage, `${hash}.json`);
