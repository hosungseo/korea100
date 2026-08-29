/* 실사이트 시연 녹화 공용 코어 — record-*.mjs 가 steps 만 넘긴다.
 *
 * 빌드 전 1회 실행(네트워크 사용). 렌더 시에는 만들어진 mp4 만 쓴다.
 * 가짜 커서를 주입해 어디를 조작하는지 보이게 한다.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const W = 1920, H = 1080;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CURSOR_INIT = () => {
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
    const style = document.createElement('style');
    style.textContent = '#fake-cursor.down{width:14px!important;height:14px!important;background:rgba(56,198,244,0.8)!important;}';
    document.head.appendChild(style);
    addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
  });
};

/** 페이지 조작 헬퍼 묶음 — steps 콜백이 받는다 */
function helpers(page) {
  const cursorTo = async (x, y, ms = 600) => {
    await page.mouse.move(x, y, { steps: Math.max(8, Math.round(ms / 33)) });
    await sleep(120);
  };
  const clickAt = async (x, y) => {
    await page.evaluate(() => window.__cursor?.classList.add('down'));
    await page.mouse.click(x, y);
    await sleep(180);
    await page.evaluate(() => window.__cursor?.classList.remove('down'));
  };
  const center = async (sel) => {
    const el = page.locator(sel).first();
    await el.scrollIntoViewIfNeeded();
    const b = await el.boundingBox();
    if (!b) throw new Error('no box: ' + sel);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  /** 선택자를 찾아 커서를 옮기고 클릭한 뒤 hold ms 대기. 없으면 건너뛰고 false */
  const click = async (sel, hold = 2000, move = 700) => {
    try {
      const p = await center(sel);
      await cursorTo(p.x, p.y, move);
      await clickAt(p.x, p.y);
      await sleep(hold);
      return true;
    } catch (e) {
      console.log('  skip', sel, '—', e.message);
      return false;
    }
  };
  return { page, cursorTo, clickAt, center, click, sleep };
}

/**
 * @param {object} o
 * @param {string} o.url        시연할 실사이트 URL
 * @param {string} o.out        결과 mp4 절대경로
 * @param {string} o.tmp        webm 임시 디렉터리
 * @param {string} o.waitFor    첫 화면 준비 판정 선택자
 * @param {number} o.settle     첫 인상 홀드(ms)
 * @param {{start:number, duration:number}} [o.trim]
 *        컴포지션 챕터 길이에 맞춰 잘라낼 구간(초). 트리밍을 스크립트 밖에서 하면
 *        나중에 재녹화했을 때 길이가 원래대로 돌아와 챕터가 깨진다 — 여기서 굽는다.
 * @param {(h: object) => Promise<void>} o.steps
 */
export async function record({ url, out, tmp, waitFor, settle = 2600, trim, steps }) {
  fs.mkdirSync(tmp, { recursive: true });
  for (const f of fs.readdirSync(tmp)) fs.rmSync(path.join(tmp, f), { force: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    recordVideo: { dir: tmp, size: { width: W, height: H } },
    reducedMotion: 'no-preference',
  });
  const page = await ctx.newPage();
  await page.addInitScript(CURSOR_INIT);

  console.log('goto', url);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector(waitFor, { state: 'visible', timeout: 30000 });
  await sleep(settle);

  await steps(helpers(page));

  await ctx.close(); // 비디오 flush
  await browser.close();

  const webm = fs.readdirSync(tmp).filter((f) => f.endsWith('.webm'))
    .map((f) => path.join(tmp, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  if (!webm) throw new Error('녹화 webm 이 없습니다: ' + tmp);
  console.log('webm:', webm);
  execFileSync('ffmpeg', ['-y', ...(trim ? ['-ss', String(trim.start)] : []), '-i', webm,
    ...(trim ? ['-t', String(trim.duration)] : []),
    '-c:v', 'libx264', '-preset', 'slow',
    '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', '-an', out], { stdio: 'inherit' });
  const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', out]).toString().trim();
  console.log('->', out, dur + 's');
  return Number(dur);
}
