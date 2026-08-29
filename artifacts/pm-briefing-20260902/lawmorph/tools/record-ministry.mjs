#!/usr/bin/env node
/* 부처 상황판 실사이트 시연 녹화 → assets/ministry-demo.mp4
 *
 * 프로젝트 축을 주체 축으로 뒤집은 화면. 정렬(레버리지) → 부처 상세 → 사업 필터 순.
 * 사용: node tools/record-ministry.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { record } from './rec-lib.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

await record({
  url: 'https://hosungseo.github.io/korea100/warroom/ministry/',
  out: path.join(ROOT, 'assets', 'ministry-demo.mp4'),
  tmp: '/private/tmp/lawmorph-ministry',
  waitFor: '#grid .card',
  settle: 3000,
  // bdemo 챕터가 13.0s — 그리드 → 레버리지 정렬 → 부처 상세까지. 사업 필터 비트는 잘라낸다
  trim: { start: 1.0, duration: 12.2 },
  steps: async ({ click, cursorTo, page, sleep }) => {
    // 1) 레버리지 순 정렬 — 뒤를 가장 많이 막고 있는 부처가 위로 온다
    await click('#sortbar button[data-sort="leverage"]', 3000);

    // 2) 부처 하나를 열어 소관 관문 목록을 본다
    await click('#grid .card[data-m="motie"]', 4200, 900);
    await page.keyboard.press('Escape');
    await sleep(1000);

    // 3) 사업 필터 — 같은 화면을 프로젝트별로 잘라 본다
    await click('#projbar button[data-p="arctic-route"]', 3000);

    await cursorTo(960, 430, 900);
    await sleep(1400);
  },
});
