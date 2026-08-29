#!/usr/bin/env node
/* 5극3특 관문 의존 지도 실사이트 시연 녹화 → assets/fivepoles-demo.mp4
 *
 * 광주 반도체(record-warroom.mjs)와 같은 화면이 프로젝트만 바꿔 열린다는 걸 보이는 게 목적.
 * 사용: node tools/record-fivepoles.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { record } from './rec-lib.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

await record({
  url: 'https://hosungseo.github.io/korea100/warroom/map/?p=five-poles-three-special',
  out: path.join(ROOT, 'assets', 'fivepoles-demo.mp4'),
  tmp: '/private/tmp/lawmorph-fivepoles',
  waitFor: '#canvas .node',
  settle: 2800,
  // mdemo 챕터가 13.0s — 진입 홀드를 조금 잘라내고 관문 클릭까지만 쓴다
  trim: { start: 1.2, duration: 12.2 },
  steps: async ({ click, cursorTo, page, sleep }) => {
    // 1) 총리 브리핑 시나리오 — 이 판에서 총리께 보고할 관문만 남긴다
    await click('#chips button[data-id="pmbrief"]', 3200);

    // 2) 전체로 되돌린 뒤, 진행 중인 관문 하나를 열어 상·하류와 절차 체인을 본다
    await click('#chips button[data-id="all"]', 1200);
    await click('#nd-N11', 3400, 900);   // 권역별 초광역특별협약 체결(active)
    await page.keyboard.press('Escape');
    await sleep(700);

    // 3) 법제 정비 축만 남겨 본다 — 축을 바꿔 가며 같은 판을 읽는다
    await click('#chips button[data-id="law"]', 3000);

    await cursorTo(960, 460, 900);
    await sleep(1400);
  },
});
