// "관심 제도 업무체계도 100선" PDF pages (SVG) — WITHOUT bureau names.
// Refinements applied: (1) map pages show only a small index number, board
// enlarged; (2) two-column TOC; (4) cover chips + tagline + balanced spacing;
// (5) page numbers bottom-right everywhere; (6) no TOC row separators.
import fs from "node:fs";

const ROOT = "/Users/seohoseong/korea100";
const sel = JSON.parse(fs.readFileSync(`${ROOT}/artifacts/mois-100-selection.json`, "utf8"));
const OUT = "/tmp/pdfpages";
fs.mkdirSync(OUT, { recursive: true });

const W = 827, H = 1169;
const FONT = `'Apple SD Gothic Neo','Noto Sans CJK KR','Noto Sans KR',sans-serif`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const NAVY = "#16233f", GOLD = "#c6a24a", INK = "#1b2740";

// two-column TOC: 20 rows x 2 cols = 40 per page
const TOC_ROWS = 20, TOC_PER = TOC_ROWS * 2;
const tocPages = Math.ceil(sel.length / TOC_PER);
const FRONT = 2 + tocPages;                 // cover + guide + toc pages
const mapPageOf = (order) => FRONT + order;

const pageNo = (n, dark = false) =>
  `<text x="${W-30}" y="${H-26}" text-anchor="end" fill="${dark ? "#8a97b4" : "#9aa6bd"}" font-size="11">${n}</text>`;

function page(inner, bg = "#ffffff") {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>text{font-family:${FONT};}</style>
<rect width="${W}" height="${H}" fill="${bg}"/>
${inner}
</svg>`;
}
const wr = (name, svg) => fs.writeFileSync(`${OUT}/${name}.svg`, svg);

// ---------- Cover ----------
function chipRow(y, items) {
  const gap = 16;
  const ws = items.map((t) => Array.from(t).length * 15 + 34);
  const total = ws.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
  let x = (W - total) / 2, s = "";
  items.forEach((t, i) => {
    s += `<rect x="${x}" y="${y-19}" width="${ws[i]}" height="30" rx="15" fill="#233559" stroke="#3a4d75"/>
    <text x="${x+ws[i]/2}" y="${y}" text-anchor="middle" fill="#dfe6f3" font-size="13" font-weight="600">${esc(t)}</text>`;
    x += ws[i] + gap;
  });
  return s;
}
wr("01-cover", page(`
  <rect width="${W}" height="14" fill="${GOLD}"/>
  <text x="${W/2}" y="150" text-anchor="middle" fill="${GOLD}" font-size="17" font-weight="700" letter-spacing="5">행정안전부 업무 참고용</text>
  <text x="${W/2}" y="272" text-anchor="middle" fill="#ffffff" font-size="52" font-weight="800">관심 제도 업무체계도</text>
  <text x="${W/2}" y="392" text-anchor="middle" fill="${GOLD}" font-size="88" font-weight="850">100선</text>
  <rect x="${W/2-100}" y="432" width="200" height="4" fill="${GOLD}"/>
  <text x="${W/2}" y="528" text-anchor="middle" fill="#e7ecf5" font-size="19" font-weight="700">「행정안전부와 그 소속기관 직제」 대통령령 제36514호 · 2026. 7. 21. 시행</text>
  <text x="${W/2}" y="565" text-anchor="middle" fill="#aab7d0" font-size="16">공공제도 중 행정안전부 소관·연관 100개 선별</text>
  ${chipRow(628, ["세로 A4 인쇄용", "내부 참고", "제도별 업무체계도 100장"])}
  <line x1="${W/2-140}" y1="716" x2="${W/2+140}" y2="716" stroke="#3a4d75" stroke-width="1.5"/>
  <text x="${W/2}" y="762" text-anchor="middle" fill="#c7d2e6" font-size="17" font-style="italic">복잡한 제도를, 누가·언제·무엇을·어떤 근거로 하는지 한 장의 흐름으로.</text>
  <rect x="70" y="850" width="${W-140}" height="150" rx="10" fill="#1e2f52" stroke="#33456e"/>
  <text x="92" y="888" fill="${GOLD}" font-size="15" font-weight="700">안내 · 오류 수정 요청</text>
  <text x="92" y="918" fill="#d7deee" font-size="13.5">본 자료는 인공지능(AI)을 활용해 생성한 업무체계도(프로세스 맵)입니다.</text>
  <text x="92" y="940" fill="#d7deee" font-size="13.5">법령·훈령·실제 업무와 다를 수 있으며, 사실관계·절차에 오류가 있을 수 있습니다.</text>
  <text x="92" y="962" fill="#d7deee" font-size="13.5">공식 업무 판단의 유일한 근거로 사용하지 마시고, 관련 법령과 소관 부서 확인을 병행해 주십시오.</text>
  <text x="92" y="984" fill="#d7deee" font-size="13.5">오류 제보·수정 요청: tigercastle@korea.kr</text>
  <text x="${W/2}" y="1052" text-anchor="middle" fill="${GOLD}" font-size="13.5" font-weight="700">원본 · 소스코드 · 온AI실험실</text>
  <text x="${W/2}" y="1076" text-anchor="middle" fill="#aab7d0" font-size="12">https://gitlab.aigov.go.kr/hosung.seo/korea100_MOIS</text>
  ${pageNo(1, true)}
`, NAVY));

// ---------- Guide ----------
function guideItem(y, tag, ...lines) {
  let s = `<rect x="70" y="${y-16}" width="${20+Array.from(tag).length*11}" height="22" rx="5" fill="#eef2f8"/>
  <text x="80" y="${y}" fill="#2c3d63" font-size="13" font-weight="700">${esc(tag)}</text>`;
  lines.forEach((ln, i) => { s += `<text x="70" y="${y+30+i*24}" fill="#2b3446" font-size="15">${esc(ln)}</text>`; });
  return s;
}
wr("02-guide", page(`
  <rect width="${W}" height="10" fill="${INK}"/>
  <text x="70" y="90" fill="#1b2740" font-size="34" font-weight="800">이용 안내</text>
  <rect x="70" y="104" width="120" height="4" fill="${GOLD}"/>
  ${guideItem(180,"목적","행정안전부 내부 업무 참고·학습용으로, 관련 제도의 업무 흐름을 한눈에 볼 수 있도록 묶었습니다.")}
  ${guideItem(266,"구성","표지 · 이용 안내 · 목차 · 제도별 업무체계도 100장.")}
  ${guideItem(352,"생성 방식","본 자료의 업무체계도는 인공지능(AI)을 활용해 생성한 것입니다.","법령 조문·실제 소관·현장 절차와 완전히 일치하지 않을 수 있습니다.")}
  ${guideItem(468,"주의","공식 해석·처분·대외 공문의 근거로 단독 사용하지 마십시오.","관련 법령, 훈령, 소관 부서 확인을 반드시 병행해 주십시오.")}
  ${guideItem(584,"오류 수정","오기·누락·절차 오류 등이 있으면 tigercastle@korea.kr 로 메일 주시면 검토 후 수정하겠습니다.")}
  ${guideItem(670,"인쇄","A4 세로 · 실제 크기(100%) 인쇄를 권장합니다. ‘용지에 맞춤’ 축소 시 글자가 작아질 수 있습니다.")}
  <rect x="70" y="770" width="${W-140}" height="72" rx="10" fill="#f4f7fb" stroke="#dbe3f0"/>
  <text x="92" y="803" fill="#5b6b8a" font-size="13">수정·보완 요청 메일</text>
  <text x="92" y="829" fill="#1b2740" font-size="22" font-weight="800">tigercastle@korea.kr</text>
  ${guideItem(900,"원본·소스","이 자료의 원본과 생성 소스코드는 ‘온AI실험실’에 있습니다.","https://gitlab.aigov.go.kr/hosung.seo/korea100_MOIS")}
  ${pageNo(2)}
`));

// ---------- TOC (two columns, no separators) ----------
const COLGAP = 26;
const COLW = (W - 140 - COLGAP) / 2;
const colX = [70, 70 + COLW + COLGAP];
for (let p = 0; p < tocPages; p++) {
  const items = sel.slice(p * TOC_PER, (p + 1) * TOC_PER);
  let rows = "";
  items.forEach((x, i) => {
    const col = Math.floor(i / TOC_ROWS);
    const row = i % TOC_ROWS;
    const x0 = colX[col];
    const y = 168 + row * 46;
    const no = String(x.order).padStart(3, "0");
    const pg = mapPageOf(x.order);
    const nm = Array.from(x.name).length > 20 ? Array.from(x.name).slice(0, 19).join("") + "…" : x.name;
    rows += `<text x="${x0}" y="${y}" fill="${GOLD}" font-size="14.5" font-weight="800">${no}</text>
    <text x="${x0+38}" y="${y}" fill="#1f2a40" font-size="14.5">${esc(nm)}</text>
    <text x="${x0+COLW}" y="${y}" text-anchor="end" fill="#7d8aa4" font-size="13">${pg}</text>`;
  });
  wr(`03-toc-${String(p+1).padStart(2,"0")}`, page(`
    <rect width="${W}" height="10" fill="${INK}"/>
    <text x="70" y="90" fill="#1b2740" font-size="30" font-weight="800">목 차${tocPages>1?` · ${p+1}`:""}</text>
    <rect x="70" y="104" width="110" height="4" fill="${GOLD}"/>
    <text x="${W-70}" y="88" text-anchor="end" fill="#8090ad" font-size="14">번호 · 제도 · 쪽</text>
    ${rows}
    <text x="70" y="${H-26}" fill="#9aa6bd" font-size="11">AI 생성 업무체계도 · 오류 가능 · 수정 요청 tigercastle@korea.kr</text>
    ${pageNo(2+1+p)}
  `));
}

// ---------- Map pages (index number only; board enlarged) ----------
const imgX = 16, imgW = W - 32;
const imgY = 54;
const imgH = Math.min(imgW * (2400/1800), H - imgY - 28);
for (const x of sel) {
  const no = String(x.order).padStart(3, "0");
  const png = `data:image/png;base64,${fs.readFileSync(`${ROOT}/${x.png}`).toString("base64")}`;
  const pg = mapPageOf(x.order);
  wr(`map-${no}`, page(`
    <rect width="${W}" height="6" fill="${INK}"/>
    <text x="26" y="42" fill="${GOLD}" font-size="19" font-weight="850">${no}</text>
    <image x="${imgX}" y="${imgY}" width="${imgW}" height="${imgH}" preserveAspectRatio="xMidYMin meet" xlink:href="${png}"/>
    <text x="26" y="${H-24}" fill="#9aa6bd" font-size="11">AI 생성 업무체계도 · 오류 가능 · 수정 요청 tigercastle@korea.kr · A4 실제 크기(100%) 인쇄 권장 · 내부 참고용</text>
    ${pageNo(pg)}
  `));
}

console.log(`pages: cover 1 + guide 1 + toc ${tocPages} + maps ${sel.length} = ${FRONT + sel.length}`);
console.log(`front=${FRONT}, first map page=${FRONT+1}`);
