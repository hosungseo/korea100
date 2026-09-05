// 법규명령 층위 판정. 카드가 지목한 조문이 "법률 사항인지, 하위법령에 위임된 사항인지"를 스냅샷 원문으로 가른다.
// 근거 없는 추정 금지: 위임 문구는 조문 본문에서 찾고, 하위 조문은 그 조문을 인용하는 시행령·시행규칙 조문에서만 찾는다.
export const TIERS = ['법률', '대통령령', '부령', '행정규칙', '자치법규'];
export const TIER_RANK = Object.fromEntries(TIERS.map((t, i) => [t, i]));

export function tierOf(lawName) {
  const n = String(lawName ?? '');
  if (/시행규칙$/.test(n)) return '부령';
  if (/시행령$/.test(n)) return '대통령령';
  if (/(고시|훈령|예규|지침|규정)$/.test(n)) return '행정규칙';
  if (/조례$/.test(n)) return '자치법규';
  return '법률';
}

// 조문 텍스트(본문 + 항)를 한 덩어리로
export function articleText(art) {
  if (!art) return '';
  const paras = (art.paras ?? []).map((p) => `${p.body ?? p.text ?? ''} ${(p.hos ?? []).map((h) => h.body ?? h.text ?? '').join(' ')}`);
  return [art.body ?? '', ...paras].join(' ');
}

const DELEG = [
  { kind: '대통령령', re: /대통령령으로\s*정(하|한)/ },
  { kind: '부령', re: /(총리령|[가-힣]{2,6}부령)으로\s*정(하|한)/ },
  { kind: '행정규칙', re: /(고시|훈령|예규)로\s*정(하|한)/ },
  { kind: '자치법규', re: /조례로\s*정(하|한)/ },
];

// 이 조문이 아래 층위로 위임하고 있는가 → ['대통령령', ...]
export function delegationsIn(text) {
  const s = String(text ?? '');
  return DELEG.filter((d) => d.re.test(s)).map((d) => d.kind);
}

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
export const paraNoOf = (citation) => { const m = String(citation ?? '').match(/제(\d+)항/); return m ? Number(m[1]) : null; };
// 위임은 조가 아니라 항 단위다. 인용이 항을 지목하면 그 항 본문만 본다.
export function scopedText(art, citation) {
  const n = paraNoOf(citation);
  if (!art || !n) return articleText(art);
  const p = (art.paras ?? []).find((q) => CIRCLED.indexOf(String(q.no ?? '').trim()[0]) + 1 === n);
  return p ? `${p.body ?? p.text ?? ''} ${(p.hos ?? []).map((h) => h.body ?? h.text ?? '').join(' ')}` : articleText(art);
}

export const artKey = (a) => String(a.no) + (a.branch && a.branch !== '0' && a.branch !== '' ? '의' + a.branch : '');
export const findArticle = (law, key) => (law?.articles ?? []).find((a) => artKey(a) === key);
// "제27조제3항" → "27", "제18조의2제1항" → "18의2"
export function articleKeyOf(citation) {
  const m = String(citation ?? '').match(/제(\d+)조(?:의(\d+))?/);
  return m ? m[1] + (m[2] ? '의' + m[2] : '') : null;
}

// <법률> 제N조를 인용하는 <법률> 시행령·시행규칙 조문을 찾는다.
export function findImplementing(laws, lawName, key, paraNo = null) {
  if (tierOf(lawName) !== '법률' || !key) return [];
  const out = [];
  for (const suffix of ['시행령', '시행규칙']) {
    const sub = laws.get(`${lawName} ${suffix}`);
    if (!sub) continue;
    const [no, branch] = key.split('의');
    const re = branch
      ? new RegExp(`법\\s*제${no}조의${branch}`)
      : new RegExp(`법\\s*제${no}조(?!의)`);
    for (const a of sub.articles ?? []) {
      const txt = articleText(a);
      if (!re.test(txt)) continue;
      // 항까지 지목한 인용이면 그 항을 부르는 하위 조문을 우선 표시한다(exact).
      const exact = paraNo ? new RegExp(`법\\s*제${no}조${branch ? `의${branch}` : ''}제${paraNo}항`).test(txt) : null;
      out.push({ law: `${lawName} ${suffix}`, article: `제${artKey(a)}조`, title: a.title ?? '', tier: tierOf(`${lawName} ${suffix}`), exact });
    }
  }
  return out;
}

// 카드 target 한 줄("부처 — 법령명 제N조…") 판정
export function classifyTarget(laws, target) {
  const m = String(target).match(/^(.+?)\s+—\s+(.+)$/);
  if (!m) return { target, ok: false, why: '형식 불일치' };
  const org = m[1].trim(), cit = m[2].trim();
  const lm = cit.match(/^(.+?)\s+(제\d+조.*)$/);
  if (!lm) return { target, ok: false, why: '조문 형식 불일치' };
  const law = lm[1].trim(), article = lm[2].trim();
  const tier = tierOf(law);
  const key = articleKeyOf(article);
  const paraNo = paraNoOf(article);
  const art = findArticle(laws.get(law), key);
  const delegates = art ? delegationsIn(scopedText(art, article)) : [];
  const all = findImplementing(laws, law, key, paraNo);
  // 항을 지목한 인용은 그 항을 부르는 하위 조문만 근거로 인정한다. 없으면 빈 배열.
  const implementing = paraNo ? all.filter((x) => x.exact) : all;
  return { target, ok: true, org, law, article, paraNo, tier, snapshot: !!art, delegates, implementing, implementingArticleLevel: all.length };
}

// 카드 하나: 지목 조문들이 전부 하위법령에 위임돼 있으면 그 층위로 내려갈 수 있다.
export function classifyCard(laws, card) {
  const targets = (card.targets ?? []).map((t) => classifyTarget(laws, t));
  const usable = targets.filter((t) => t.ok);
  const statuteTargets = usable.filter((t) => t.tier === '법률');
  const lowest = (t) => {
    const cands = [t.tier, ...t.delegates, ...t.implementing.map((i) => i.tier)];
    return cands.sort((a, b) => TIER_RANK[b] - TIER_RANK[a])[0];
  };
  // 대상마다 "여기까지 내려갈 수 있다"를 구한 뒤, 카드 전체의 구속 층위 = 그중 가장 높은(어려운) 것.
  // 대상 하나라도 법률 사항이면 카드는 법률 개정이 필요하다.
  const perTarget = usable.map(lowest);
  const requiredTier = perTarget.length ? perTarget.slice().sort((a, b) => TIER_RANK[a] - TIER_RANK[b])[0] : null;
  const needsStatute = usable.some((t) => t.tier === '법률' && t.delegates.length === 0 && t.implementing.length === 0);
  return {
    id: card.id, kind: card.kind, title: card.title,
    requiredTier, needsStatute,
    statuteOnly: statuteTargets.length === usable.length && !usable.some((t) => t.delegates.length || t.implementing.length),
    targets: usable,
  };
}
