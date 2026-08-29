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
  settle: 2000,
  // mdemo 챕터가 9.0s — 지도 인상 → 관문 클릭 → 절차 패널, 두 비트만 쓴다.
  // (광주 demo 가 워게임·시나리오까지 다 보여주므로, 여기서는 "같은 화면이 프로젝트만
  //  바꿔 열린다"만 증명하면 된다. 상단 프로젝트 전환 칩이 화면에 함께 잡힌다)
  trim: { start: 0.8, duration: 8.2 },
  steps: async ({ click, cursorTo, sleep }) => {
    // 시나리오 칩(pmbrief 등)을 켠 상태에서 관문을 누르면 절차 패널이 열리지 않는다 —
    // 필터 없는 기본 화면에서 바로 관문을 연다.
    await click('#nd-N12', 4000, 900);   // 4대 권역 AX 거점 예타면제(절차 4건)
    await cursorTo(960, 460, 800);
    await sleep(900);
  },
});
