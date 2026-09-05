// 배선 겹침 검사기: 렌더된 HTML을 열어 ①선이 카드를 관통하는지 ②서로 다른 선이 나란히 겹치는지 센다.
// 끝점을 공유하는 선(같은 카드에서 갈라지는 줄기)은 겹침으로 세지 않는다.
// 사용: node _lib/check-overlap.mjs <html...>
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: node check-overlap.mjs <html...>'); process.exit(2); }
const { chromium } = createRequire(path.join(execSync('npm root -g').toString().trim(), 'x.js'))('playwright');

const browser = await chromium.launch();
let bad = 0;
for (const f of files) {
  const page = await browser.newPage({ viewport: { width: 6200, height: 900 } });
  await page.goto('file://' + path.resolve(f));
  await page.waitForTimeout
    ? await page.waitForTimeout(500) : null;
  const res = await page.evaluate(() => {
    const grid = document.getElementById('grid'), g = grid.getBoundingClientRect();
    const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left - g.left, r: r.right - g.left, t: r.top - g.top, b: r.bottom - g.top }; };
    const cards = [...grid.querySelectorAll('.card')].map(R);
    const segs = [];
    for (const p of grid.querySelectorAll('#edgeLayer path')) {
      const pts = p.getAttribute('d').match(/-?[\d.]+/g).map(Number);
      const id = p.getAttribute('data-edge') || pts.join(',');
      for (let i = 0; i + 3 < pts.length; i += 2) {
        const [x1, y1, x2, y2] = [pts[i], pts[i + 1], pts[i + 2], pts[i + 3]];
        segs.push({ id, x1, y1, x2, y2, h: Math.abs(y1 - y2) < 0.5, v: Math.abs(x1 - x2) < 0.5 });
      }
    }
    const ov = (a1, a2, b1, b2) => Math.min(a2, b2) - Math.max(a1, b1) > 4;
    const sameEnd = (a, b) => [[a.x1, a.y1], [a.x2, a.y2]].some(([x, y]) => [[b.x1, b.y1], [b.x2, b.y2]].some(([u, v]) => Math.abs(x - u) < 2 && Math.abs(y - v) < 2));
    let cardHits = 0, near = 0; const hits = [];
    for (const s of segs) for (const r of cards) {
      const ix = Math.min(Math.max(s.x1, s.x2), r.r) - Math.max(Math.min(s.x1, s.x2), r.l);
      const iy = Math.min(Math.max(s.y1, s.y2), r.b) - Math.max(Math.min(s.y1, s.y2), r.t);
      // 관통 = 실제로 카드 안을 지남 / 근접 = 테두리에서 3px 안쪽으로 스침
      const hit = (s.v ? ix > 0.5 : ix > 4) && (s.h ? iy > 0.5 : iy > 4);
      const close = !hit && (s.v ? ix > -3.5 : ix > 4) && (s.h ? iy > -3.5 : iy > 4);
      if (hit) { cardHits++; if (hits.length < 40) hits.push(`${s.id} ↯ card @(${Math.round(r.l)},${Math.round(r.t)})`); }
      else if (close) near++;
    }
    let dup = 0; const pairs = [];
    const pair = (arr, key, cross) => {
      for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], b = arr[j];
        if (Math.abs(a[key] - b[key]) >= 4 || sameEnd(a, b)) continue;
        if (ov(Math.min(a[cross], a[cross + '2']), Math.max(a[cross], a[cross + '2']), Math.min(b[cross], b[cross + '2']), Math.max(b[cross], b[cross + '2']))) { dup++; if (pairs.length < 40) pairs.push(`${a.id} ~ ${b.id} @${key}=${Math.round(a[key])}`); }
      }
    };
    pair(segs.filter((s) => s.h).map((s) => ({ ...s, y: s.y1, x: s.x1, x2: s.x2 })), 'y', 'x');
    pair(segs.filter((s) => s.v).map((s) => ({ ...s, x: s.x1, y: s.y1, y2: s.y2 })), 'x', 'y');
    return { segs: segs.length, cardHits, near, dup, pairs: hits.concat(pairs) };
  });
  const ok = res.cardHits === 0 && res.dup === 0;
  if (!ok) bad++;
  console.log(`${ok ? 'OK  ' : 'WARN'} ${path.basename(f)} — 선분 ${res.segs}, 카드 관통 ${res.cardHits}, 테두리 근접 ${res.near}, 선 겹침 ${res.dup}`);
  if (process.env.VERBOSE) res.pairs.forEach((x) => console.log('    ', x));
  await page.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
