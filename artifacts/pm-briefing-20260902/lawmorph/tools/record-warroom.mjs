#!/usr/bin/env node
/* warroom/map 실사이트 시연 녹화 → assets/warroom-demo.mp4 (zoom 챕터 대체 클립).
 *
 * 빌드 전 1회 실행(네트워크 사용). 렌더 시에는 이 mp4 만 쓴다.
 * 가짜 커서를 주입해 어디를 조작하는지 보이게 한다.
 * 사용: node tools/record-warroom.mjs  →  webm 녹화 후 ffmpeg 로 h264 mp4 변환
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const URL = 'https://hosungseo.github.io/korea100/warroom/map/';
const TMP = '/private/tmp/lawmorph-warroom';
const OUT = path.join(ROOT, 'assets', 'warroom-demo.mp4');
const W = 1920, H = 1080;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cursorTo(page, x, y, ms = 600) {
  // 부드러운 이동: mouse.move 의 steps 로 중간 프레임을 만들고 커서 div 는 mousemove 로 따라온다
  await page.mouse.move(x, y, { steps: Math.max(8, Math.round(ms / 33)) });
  await sleep(120);
}

async function clickAt(page, x, y) {
  await page.evaluate(() => window.__cursor.classList.add('down'));
  await page.mouse.click(x, y);
  await sleep(180);
  await page.evaluate(() => window.__cursor.classList.remove('down'));
}

async function center(page, sel) {
  const el = page.locator(sel).first();
  await el.scrollIntoViewIfNeeded();
  const b = await el.boundingBox();
  if (!b) throw new Error('no box: ' + sel);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  recordVideo: { dir: TMP, size: { width: W, height: H } },
  reducedMotion: 'no-preference',
});
const page = await ctx.newPage();

// 가짜 커서 주입 (mousemove 추종)
await page.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div');
    c.id = 'fake-cursor';
    c.style.cssText = [
      'position:fixed', 'z-index:99999', 'width:22px', 'height:22px',
      'border-radius:50%', 'pointer-events:none', 'left:-50px', 'top:-50px',
      'border:2px solid rgba(255,255,255,0.95)',
      'background:rgba(56,198,244,0.35)',
      'box-shadow:0 0 12px rgba(56,198,244,0.8)',
      'transform:translate(-50%,-50%)', 'transition:width 0.12s,height 0.12s',
    ].join(';');
    document.body.appendChild(c);
    window.__cursor = c;
    c.classList.add('idle');
    const style = document.createElement('style');
    style.textContent = '#fake-cursor.down{width:14px!important;height:14px!important;background:rgba(56,198,244,0.8)!important;}';
    document.head.appendChild(style);
    addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
  });
});

console.log('goto', URL);
await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('#canvas .node', { state: 'visible', timeout: 30000 });
await sleep(2400); // 진입 애니메이션 + 첫 인상 홀드

// 관문 세 개를 차례로 열어 '그 안의 법정 절차 체인'을 세 번 보여준다.
// (2026-08-30) 워게임 시연을 뺀 자리다 — 3부의 핵심은 가정 시뮬레이션이 아니라
// 관문을 열면 그 안의 절차가 순서대로 이어져 나온다는 사실이다.
// 축을 바꿔 가며 고른다: 산단 인허가 → 군공항 → 용수.
const GATES = [
  { id: '#nd-N37', hold: 5000, scroll: false },  // 산단계획 통합심의
  { id: '#nd-N31', hold: 5000, scroll: false },  // 군공항 이전후보지·지원계획
  { id: '#nd-N24', hold: 3200, scroll: true },   // 용수·하수도 (패널을 굴려 체인이 이어짐을 보인다)
];

for (const [i, g] of GATES.entries()) {
  if (i > 0) {                       // 앞 관문 고정 해제
    await page.keyboard.press('Escape');
    await sleep(500);
  }
  let p;
  try {
    p = await center(page, g.id);
  } catch (e) {
    console.log('gate skipped', g.id, e.message);
    continue;
  }
  await cursorTo(page, p.x, p.y, 900);
  await clickAt(page, p.x, p.y);
  await sleep(g.hold);

  if (g.scroll) {
    // 오른쪽 절차 패널 위에서 천천히 굴린다 — 뒤에 더 남아 있음을 보이는 자리
    await cursorTo(page, W * 0.82, H * 0.55, 700);
    for (let k = 0; k < 6; k++) {
      await page.mouse.wheel(0, 130);
      await sleep(240);
    }
    await sleep(1400);
  }
}

// 마무리 홀드
await cursorTo(page, W * 0.5, H * 0.42, 900);
await sleep(1600);

await ctx.close(); // 비디오 flush
await browser.close();

const webm = fs.readdirSync(TMP).filter((f) => f.endsWith('.webm'))
  .map((f) => path.join(TMP, f))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
console.log('webm:', webm);
execFileSync('ffmpeg', ['-y', '-i', webm, '-c:v', 'libx264', '-preset', 'slow',
  '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', '-an', OUT], { stdio: 'inherit' });
console.log('->', OUT);
