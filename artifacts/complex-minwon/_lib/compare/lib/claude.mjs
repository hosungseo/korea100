// claude -p 호출 한 곳. 입력 해시 캐시 · JSON 추출 · 파싱 실패 시 1회 재시도.
// 실패는 예외가 아니라 {failed:true}로 돌려준다. 지어내서 채우는 일은 호출자가 하지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { sha1, cachePath } from './io.mjs';

const BIN = () => process.env.COMPARE_CLAUDE_BIN || 'claude';

function extractJson(raw) {
  const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(raw.slice(s, e + 1)); } catch { return null; }
}

function invoke(prompt) {
  return execFileSync(BIN(), ['-p', prompt], { encoding: 'utf8', timeout: 600_000, maxBuffer: 16 * 1024 * 1024 });
}

export function callJson(prompt, { stage, cacheDir = null, fresh = false } = {}) {
  const promptSha1 = sha1(prompt);
  const file = cacheDir ? path.join(cacheDir, stage, `${promptSha1}.json`) : cachePath(stage, promptSha1);
  if (!fresh && fs.existsSync(file)) {
    const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!rec.failed) return { data: rec.data, cached: true, failed: false, cacheFile: file };
  }
  let raw = '', data = null, attempts = 0;
  while (attempts < 2 && data === null) {
    attempts++;
    try { raw = invoke(prompt); } catch (e) { raw = `<<exec error: ${e.message}>>`; data = null; continue; }
    data = extractJson(raw);
  }
  const rec = { stage, promptSha1, at: new Date().toISOString(), attempts, failed: data === null, raw, data };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(rec, null, 2) + '\n');
  return { data, cached: false, failed: data === null, cacheFile: file };
}
