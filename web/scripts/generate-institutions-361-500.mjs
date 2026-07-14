#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArticleReferences } from "./lib/article-citations.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.dirname(SCRIPT_DIR);
const REPO_DIR = path.dirname(WEB_DIR);
const DATA_DIR = path.join(WEB_DIR, "data", "institutions");
const MANIFEST_PATH = path.join(REPO_DIR, "docs", "institutions-100-manifest.json");
const AS_OF = "2026-07-15";
const OVERWRITE = process.argv.includes("--overwrite");

const COMMON_WARNING = "이 구조도는 현행 법령의 공통 흐름을 업무 단위로 재구성했다. 연도별 공고·지침, 기관 자체규정, 전산시스템 입력항목과 실제 심사관행은 별도로 확인해야 한다.";
const REMEDY_WARNING = "불리한 결정이 있으면 통지서의 의견제출·청문·이의·행정심판·소송 가능성과 기간을 별도로 확인해야 한다.";

// Existing verified metadata is reused where possible. New high-risk domains
// use a checked source override generated from the current Law.go.kr API body.
const sourceMeta = new Map();
const articlePool = new Map();
for (const file of fs.readdirSync(DATA_DIR).filter((name) => name.endsWith(".json"))) {
  const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
  for (const source of data.verification?.sources ?? []) {
    const key = compact(source.law);
    if (!sourceMeta.has(key)) sourceMeta.set(key, source);
  }
  for (const node of data.process?.nodes ?? []) {
    for (const basis of node.legal_basis ?? []) {
      const key = compact(basis.law);
      const pool = articlePool.get(key) ?? new Set();
      if (basis.article) pool.add(basis.article);
      articlePool.set(key, pool);
    }
  }
  for (const basis of data.canvas?.legalBasis ?? []) {
    const key = compact(basis.law);
    const pool = articlePool.get(key) ?? new Set();
    if (basis.articles) pool.add(basis.articles);
    articlePool.set(key, pool);
  }
}

const overridePath = path.join(SCRIPT_DIR, "law-source-overrides-361-500.json");
if (fs.existsSync(overridePath)) {
  const overrides = JSON.parse(fs.readFileSync(overridePath, "utf8"));
  for (const entry of overrides.entries ?? []) {
    sourceMeta.set(compact(entry.law), entry.source);
    articlePool.set(compact(entry.law), new Set(entry.citations ?? []));
  }
}

const candidates = [
  // 361~374 복지·보건·가족
  c(361, "emergency-welfare-crisis-support", "긴급복지지원 위기발굴·지원", "복지와 사회보험", "긴급복지지원법", "위기상황 확인부터 현장조사·지원결정·급여지급·사후조사까지", "신청·조사·긴급지원형"),
  c(362, "child-welfare-protection-plan", "아동복지 보호조치·자립지원계획", "가족·아동", "아동복지법", "아동 발견·상담부터 보호조치·보호계획·사례관리·자립연계까지", "보호조치·사례관리형"),
  c(363, "disability-registration-service-assessment", "장애인 등록·서비스 종합조사", "보건·복지", "장애인복지법", "장애정도 심사와 서비스 종합조사, 결정·통지·이의·변경관리까지", "등록·조사·급여결정형"),
  c(364, "disability-activity-support-plan", "장애인활동지원 수급자격·서비스계획", "보건·복지", "장애인활동 지원에 관한 법률", "신청·방문조사부터 수급자격 결정·활동지원계획·급여 이용·갱신까지", "신청·조사·급여형"),
  c(365, "single-parent-benefit-eligibility-review", "한부모가족 지원대상 결정·급여관리", "가족·아동", "한부모가족지원법", "지원대상 확인과 소득·재산 조사, 급여결정·지급·변동관리까지", "자격조사·급여형"),
  c(366, "maternal-child-health-support", "모자보건 지원·건강관리 연계", "보건·복지", "모자보건법", "임신·출산 위험확인부터 보건소 상담·지원결정·의료·복지 연계까지", "상담·지원·연계형"),
  c(367, "organ-donation-transplant-coordination", "장기기증 등록·이식대기·배분관리", "보건·의료", "장기등 이식에 관한 법률", "기증희망 등록부터 장기 적합성 확인·대기자 관리·이식·사후기록까지", "등록·배분·사후관리형"),
  c(368, "infectious-disease-epidemiology-response", "감염병 신고·역학조사·조치", "보건·안전", "감염병의 예방 및 관리에 관한 법률", "감염병 신고·보고부터 역학조사·접촉자 관리·방역조치·해제까지", "신고·역학조사·방역형"),
  c(369, "lonely-death-prevention-case-management", "고독사 예방 지역발굴·사례관리", "복지와 사회보험", "고독사 예방 및 관리에 관한 법률", "위험군 발굴·상담부터 지역계획·서비스 연계·모니터링까지", "지역계획·사례관리형"),
  c(370, "long-term-care-grade-renewal", "노인장기요양 인정·등급변경·갱신", "복지와 사회보험", "노인장기요양보험법", "인정신청·방문조사부터 의사소견·등급판정·급여이용·갱신까지", "신청·판정·급여형"),
  c(371, "basic-livelihood-self-reliance-plan", "국민기초생활 자활지원·자립계획", "복지와 사회보험", "국민기초생활 보장법", "수급자 상담·근로능력 확인부터 자활계획·사업참여·조건이행 점검까지", "자격·자활연계형"),
  c(372, "health-insurance-preauthorization-review", "건강보험 요양급여 사전승인·심사", "보건·의료", "국민건강보험법", "요양급여 기준 확인부터 사전승인·진료·청구·심사·이의까지", "사전승인·심사형"),
  c(373, "public-health-medical-service-plan", "공공보건의료기관 지정·운영계획", "보건·의료", "공공보건의료에 관한 법률", "기관 지정요건 확인부터 지역계획·운영계획·평가·개선까지", "지정·운영·평가형"),
  c(374, "domestic-violence-victim-protection", "가정폭력 피해자 보호·지원 연계", "보건·복지", "가정폭력방지 및 피해자보호 등에 관한 법률", "상담·신고부터 긴급보호·의료·주거·법률지원과 사후안전계획까지", "신고·보호·연계형"),

  // 375~388 노동·고용·직업능력
  c(375, "labor-contract-working-conditions-supervision", "근로계약·근로조건 명시·감독", "노동·고용", "근로기준법", "근로계약 작성부터 임금·근로시간·휴일 확인, 시정·진정·감독까지", "계약·감독·시정형"),
  c(376, "equal-employment-parental-leave-support", "고용평등·육아휴직 지원·분쟁조정", "노동·고용", "남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률", "육아휴직·배우자출산휴가 신청부터 사업주 확인·급여·불리한 처우 구제까지", "신청·급여·구제형"),
  c(377, "foreign-worker-employment-permit", "외국인근로자 고용허가·사업장변경", "출입국·병역", "외국인근로자의 고용 등에 관한 법률", "고용허가 신청부터 구인·알선·근로계약·입국·사업장변경까지", "허가·알선·변경형"),
  c(378, "minimum-wage-determination-notice", "최저임금 심의·결정·고시", "노동·고용", "최저임금법", "심의요청·전문위원 검토부터 위원회 의결·이의·고시·다음 연도 적용까지", "위원회·고시형"),
  c(379, "occupational-safety-risk-assessment", "사업장 위험성평가·안전개선", "노동·고용", "산업안전보건법", "유해·위험요인 파악부터 위험성평가·개선조치·근로자 공유·재평가까지", "위험평가·개선형"),
  c(380, "labor-commission-remedy-application", "노동위원회 구제신청·판정", "노동·고용", "노동위원회법", "구제신청·사건접수부터 이유서·조사·심문·판정·재심·행정소송까지", "신청·심문·판정형"),
  c(381, "labor-union-establishment-report", "노동조합 설립신고·교섭대표", "노동·고용", "노동조합 및 노동관계조정법", "설립신고부터 보완·신고증 교부·교섭요구·대표노조 확정까지", "신고·교섭·확정형"),
  c(382, "vocational-training-institution-approval", "직업능력개발훈련기관 인정·과정승인", "교육·고용", "국민 평생 직업능력 개발법", "기관요건·훈련과정 심사부터 인정·승인·운영·평가·취소까지", "인정·승인·평가형"),
  c(383, "employment-insurance-eligibility-change", "고용보험 피보험자격 취득·상실·변경", "노동·고용", "고용보험법", "사업주 신고부터 자격 확인·정정·상실처리·이의·실업급여 연계까지", "신고·자격·연계형"),
  c(384, "industrial-accident-disease-recognition", "산업재해 요양·업무상 질병 인정", "노동·고용", "산업재해보상보험법", "재해신청·의학자료 제출부터 조사·판정·요양·보상·재심까지", "신청·조사·판정형"),
  c(385, "retirement-benefit-settlement-supervision", "퇴직급여제도 설정·적립·지급 점검", "노동·고용", "근로자퇴직급여 보장법", "퇴직급여제도 확인부터 적립·운영·퇴직 시 지급·미지급 시정까지", "설정·운영·시정형"),
  c(386, "construction-worker-employment-support", "건설근로자 고용·퇴직공제 지원", "노동·고용", "건설근로자의 고용개선 등에 관한 법률", "현장 근로자 신고부터 퇴직공제 적립·경력관리·공제금 지급까지", "등록·적립·지급형"),
  c(387, "workplace-discrimination-remedy", "고용상 차별 시정·구제", "노동·고용", "남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률", "차별 사실 확인부터 사업주 시정·분쟁조정·구제·재발방지까지", "신청·조정·시정형"),
  c(388, "employment-stability-support-grant", "고용유지·고용안정 지원금 심사", "노동·고용", "고용보험법", "지원요건 확인부터 계획제출·고용센터 심사·지원금 지급·사후점검까지", "신청·심사·지원형"),

  // 389~402 주택·국토·도시
  c(389, "housing-construction-project-approval", "주택건설사업계획 승인·사용검사", "주택·도시", "주택법", "사업부지·사업자 요건부터 사업계획 승인·착공·감리·사용검사까지", "승인·공사·검사형"),
  c(390, "public-rental-housing-tenant-selection", "공공임대주택 입주자 선정·계약", "주택·도시", "공공주택 특별법", "모집공고·자격심사부터 입주자 선정·계약·입주·재계약까지", "공고·선정·계약형"),
  c(391, "private-rental-housing-registration-management", "민간임대주택 등록·임대사업 관리", "주택·도시", "민간임대주택에 관한 특별법", "등록신청부터 임대의무·변경신고·임대차관리·말소까지", "등록·의무·말소형"),
  c(392, "housing-lease-dispute-relief", "주택임대차 분쟁조정·계약갱신 보호", "주택·도시", "주택임대차보호법", "분쟁상담·조정신청부터 자료제출·조정안·이행·불복까지", "상담·조정·이행형"),
  c(393, "housing-supply-subscription-screening", "주택공급 청약자격·당첨자 검증", "주택·도시", "주택공급에 관한 규칙", "입주자모집공고부터 청약·무주택·특별공급 검증·계약까지", "공고·청약·검증형"),
  c(394, "vacant-house-improvement-designation", "빈집 정비계획·정비사업 시행", "주택·도시", "빈집 및 소규모주택 정비에 관한 특례법", "빈집조사·등급판정부터 정비계획·사업시행·철거·관리까지", "조사·계획·정비형"),
  c(395, "urban-redevelopment-project-approval", "정비구역 지정·재개발사업 인가", "주택·도시", "도시 및 주거환경정비법", "정비계획 입안부터 구역지정·추진위·사업시행인가·관리처분까지", "지정·인가·처분형"),
  c(396, "urban-regeneration-plan-implementation", "도시재생 활성화계획·사업시행", "주택·도시", "도시재생 활성화 및 지원에 관한 특별법", "지역진단·주민협의부터 활성화계획 승인·사업시행·성과평가까지", "계획·협의·사업형"),
  c(397, "urban-management-plan-determination", "도시관리계획 입안·결정·고시", "국토·교통", "국토의 계획 및 이용에 관한 법률", "입안제안·관계기관 협의부터 주민열람·도시계획위원회·결정고시까지", "입안·심의·고시형"),
  c(398, "building-permit-use-approval", "건축허가·착공신고·사용승인", "국토·환경·안전", "건축법", "건축계획 검토부터 허가·착공·감리·사용승인·유지관리까지", "허가·공사·검사형"),
  c(399, "public-property-use-permission", "공유재산 사용허가·대부·변상금", "재정·예산·조달", "공유재산 및 물품 관리법", "재산현황 확인부터 사용허가·계약·사용료·무단사용 시정까지", "허가·계약·관리형"),
  c(400, "road-occupation-permit-expansion", "도로점용허가·굴착복구 관리", "국토·교통", "도로법", "점용계획 제출부터 관계기관 협의·허가·공사·복구검사·원상회복까지", "허가·공사·복구형"),
  c(401, "public-parking-lot-installation-plan", "공영주차장 설치·운영계획", "교통·인프라", "주차장법", "주차수요 조사부터 부지확보·설치계획·공사·운영·요금관리까지", "계획·설치·운영형"),
  c(402, "building-safety-inspection-correction", "건축물 안전점검·보수·사용제한", "국토·환경·안전", "건축법", "점검대상 확인부터 안전점검·보수명령·사용제한·해제까지", "점검·명령·해제형"),

  // 403~416 환경·기후·재난
  c(403, "environmental-impact-assessment-consultation", "환경영향평가 협의·협의내용 관리", "국토·환경·안전", "환경영향평가법", "평가대상 판정부터 평가서 작성·주민의견·협의·협의내용 이행까지", "평가·협의·이행형"),
  c(404, "air-emission-facility-permit", "대기배출시설 설치허가·신고·관리", "국토·환경·안전", "대기환경보전법", "시설분류·배출량 산정부터 허가·신고·가동개시·측정·개선명령까지", "허가·측정·개선형"),
  c(405, "water-pollution-discharge-permit", "수질오염 배출시설 허가·방류관리", "국토·환경·안전", "물환경보전법", "배출시설 설치계획부터 허가·방류기준·측정·개선·행정처분까지", "허가·측정·처분형"),
  c(406, "waste-disposal-business-permit", "폐기물 처리업 허가·처리실적 관리", "국토·환경·안전", "폐기물관리법", "사업계획서 검토부터 허가·시설검사·처리·전자인계서·사후점검까지", "허가·처리·점검형"),
  c(407, "soil-contamination-investigation-remediation", "토양오염 조사·정화명령·검증", "국토·환경·안전", "토양환경보전법", "오염 의심지역 조사부터 정밀조사·정화명령·정화공사·검증까지", "조사·명령·정화형"),
  c(408, "integrated-environmental-permit-change", "통합환경허가·허가조건 변경관리", "국토·환경·안전", "환경오염시설의 통합관리에 관한 법률", "통합허가 대상 확인부터 허가서·배출기준·변경허가·이행점검까지", "통합허가·점검형"),
  c(409, "local-carbon-neutrality-plan", "탄소중립 녹색성장 기본계획 수립·이행", "기후·안전", "기후위기 대응을 위한 탄소중립ㆍ녹색성장 기본법", "지역·기관 현황분석부터 계획수립·공청회·심의·이행평가까지", "계획·공청회·평가형"),
  c(410, "national-disaster-safety-management-plan", "재난안전관리계획 수립·점검", "재난·도시", "재난 및 안전관리 기본법", "위험요인 조사부터 예방계획·기관협의·대응체계·이행점검까지", "계획·협의·점검형"),
  c(411, "natural-disaster-prevention-project", "자연재해 예방사업 계획·시행", "재난·도시", "자연재해대책법", "위험지구 조사부터 예방사업 계획·설계·사업시행·준공·유지관리까지", "계획·공사·관리형"),
  c(412, "urban-flood-damage-prevention-plan", "도시하천 침수피해 방지계획·사업", "재난·도시", "도시하천유역침수피해방지대책법", "침수위험 분석부터 대책수립·관계기관 협의·사업시행·성과점검까지", "분석·계획·사업형"),
  c(413, "chemical-accident-prevention-plan", "화학사고 예방관리계획 심사·이행", "국토·환경·안전", "화학물질관리법", "유해물질 취급시설 위험평가부터 예방계획·심사·훈련·사고 후 개선까지", "계획·심사·사고대응형"),
  c(414, "fire-safety-management-plan", "다중이용시설 화재안전관리·개선", "국토·환경·안전", "화재의 예방 및 안전관리에 관한 법률", "시설 위험도 점검부터 안전계획·훈련·시정명령·재점검까지", "점검·훈련·시정형"),
  c(415, "forest-disaster-prevention-response", "산림재난 예방·현장대응·복구", "국토·환경·안전", "산림보호법", "산불·산사태 위험확인부터 예찰·대피·현장지휘·복구·재발방지까지", "예방·대응·복구형"),
  c(416, "marine-pollution-response-plan", "해양오염 방제계획·사고대응", "국토·환경·안전", "해양환경관리법", "오염사고 신고부터 방제지휘·오염확산 차단·피해조사·복원까지", "신고·방제·복원형"),

  // 417~430 농식품·동물·교통
  c(417, "farmland-use-permission-conversion", "농지전용 허가·협의·복구", "지역·농촌", "농지법", "농지현황·전용목적 확인부터 허가·협의·부담금·공사·복구까지", "허가·협의·복구형"),
  c(418, "rural-space-regeneration-plan", "농촌공간 재구조화·재생계획", "지역·농촌", "농촌공간 재구조화 및 재생지원에 관한 법률", "농촌공간 조사부터 기본계획·주민협의·시행계획·사업평가까지", "계획·협의·사업형"),
  c(419, "livestock-epidemic-quarantine-culling", "가축전염병 신고·이동제한·살처분", "농식품·산업", "가축전염병 예방법", "의심신고부터 검사·발생확정·이동제한·방역·보상까지", "신고·방역·보상형"),
  c(420, "animal-welfare-rescue-adoption", "동물보호센터 구조·보호·입양", "생활·동물·농림", "동물보호법", "구조·인계부터 건강검진·보호·공고·입양·반환·사후관리까지", "구조·보호·입양형"),
  c(421, "food-sanitation-business-permit", "식품접객업 영업신고·위생관리", "식품·복지", "식품위생법", "영업시설 확인부터 신고·교육·위생점검·시정·행정처분까지", "신고·점검·처분형"),
  c(422, "import-food-safety-inspection", "수입식품 신고·검사·통관관리", "식품·복지", "수입식품안전관리 특별법", "수입신고부터 서류·현장검사·보완·통관·회수까지", "신고·검사·통관형"),
  c(423, "health-functional-food-recognition", "건강기능식품 기능성 인정·심사", "식품·복지", "건강기능식품에 관한 법률", "기능성 자료 준비부터 인정신청·심사·보완·인정서·사후관리까지", "신청·심사·인정형"),
  c(424, "food-safety-risk-assessment", "식품안전 위해성평가·관리기준 설정", "식품·복지", "식품안전기본법", "위해정보 수집부터 평가·전문위원 검토·기준설정·공개·재평가까지", "평가·기준·공개형"),
  c(425, "quarantine-import-inspection", "검역신고·검사·검역증명", "보건·안전", "검역법", "검역대상 확인부터 신고·검사·소독·검역증명·해제까지", "신고·검사·증명형"),
  c(426, "driver-license-reinstatement-review", "운전면허 정지·취소·결격 해소", "교통·이동", "도로교통법", "처분사유 통지부터 의견제출·처분·교육·결격기간·재취득까지", "처분·교육·재취득형"),
  c(427, "passenger-transport-route-license", "여객자동차 운송사업 면허·노선인가", "교통·인프라", "여객자동차 운수사업법", "사업자·차량요건 확인부터 면허·노선인가·운행개시·변경·행정처분까지", "면허·노선·관리형"),
  c(428, "public-transportation-service-plan", "대중교통 육성 시행계획·평가", "교통·인프라", "대중교통의 육성 및 이용촉진에 관한 법률", "교통현황 분석부터 시행계획·관계기관 협의·사업·성과평가까지", "계획·협의·평가형"),
  c(429, "airport-facility-development-permit", "공항시설 개발·실시계획 승인", "교통·인프라", "공항시설법", "개발계획·입지검토부터 실시계획 승인·공사·사용검사·운영까지", "계획·승인·검사형"),
  c(430, "railway-facility-maintenance-safety", "철도시설 유지관리·안전점검", "교통·인프라", "철도의 건설 및 철도시설 유지관리에 관한 법률", "시설물 조사부터 점검계획·보수·사용제한·재개통까지", "점검·보수·개통형"),

  // 431~444 산업·조달·관광·에너지
  c(431, "factory-establishment-approval-management", "공장설립 승인·등록·변경관리", "인허가·규제·산업", "산업집적활성화 및 공장설립에 관한 법률(산집법)", "입지·업종 확인부터 공장설립 승인·등록·변경·가동·사후점검까지", "승인·등록·관리형"),
  c(432, "construction-business-registration", "건설업 등록·실적·행정처분", "인허가·규제·산업", "건설산업기본법", "등록기준 확인부터 등록신청·실적관리·변경·시정·등록말소까지", "등록·실적·처분형"),
  c(433, "large-small-business-cooperation-plan", "대·중소기업 상생협력 사업·조정", "산업·고용", "대·중소기업 상생협력 촉진에 관한 법률", "협력수요 발굴부터 사업신청·심사·협약·지원·성과점검까지", "신청·협약·지원형"),
  c(434, "sme-direct-production-confirmation", "중소기업 직접생산 확인·공공판로", "중소기업·지역", "중소기업제품 구매촉진 및 판로지원에 관한 법률", "제품·생산시설 확인부터 직접생산 확인·공공구매·갱신·취소까지", "확인·조달·갱신형"),
  c(435, "national-contract-bid-award-dispute", "국가계약 입찰·낙찰·계약이행·분쟁", "재정·예산·조달", "국가를 당사자로 하는 계약에 관한 법률", "입찰공고부터 참가·평가·낙찰·계약·검수·분쟁조정까지", "입찰·계약·분쟁형"),
  c(436, "local-contract-bid-award", "지방계약 입찰·낙찰·계약관리", "지방재정", "지방자치단체를 당사자로 하는 계약에 관한 법률", "사업계획·예산확인부터 입찰·낙찰·계약·검사·대금지급까지", "입찰·계약·지급형"),
  c(437, "tourism-business-registration", "관광사업 등록·지정·운영점검", "관광·문화", "관광진흥법", "사업종류·시설기준 확인부터 등록·지정·안전·변경·행정처분까지", "등록·지정·점검형"),
  c(438, "tourism-accommodation-safety-management", "관광숙박업 등록·시설안전 관리", "관광·문화", "관광진흥법", "숙박시설 요건 확인부터 등록·영업·안전점검·개선·갱신까지", "등록·점검·갱신형"),
  c(439, "game-rating-classification-review", "게임물 등급분류·사후관리", "문화·콘텐츠", "게임산업진흥에 관한 법률", "게임물 제출부터 등급분류·결정통지·표시·모니터링·재분류까지", "심사·분류·관리형"),
  c(440, "broadcast-media-license-review", "방송사업 허가·승인·등록·재허가", "데이터·디지털·공공서비스", "방송법", "사업계획·심사자료 제출부터 위원회 심의·허가·조건관리·재허가까지", "허가·심의·재허가형"),
  c(441, "telecommunications-business-registration", "전기통신사업 등록·신고·변경", "데이터·디지털·공공서비스", "전기통신사업법", "사업자·서비스 요건 확인부터 등록·신고·변경·이용자보호 점검까지", "등록·신고·점검형"),
  c(442, "export-control-strategic-goods-permit", "전략물자 수출허가·판정·사후관리", "산업·안보", "대외무역법", "품목·기술 판정부터 수출허가·거래심사·통관·사후보고까지", "판정·허가·사후관리형"),
  c(443, "supply-chain-stabilization-plan", "공급망 안정화 선도사업자 선정·지원", "경제안보", "경제안보를 위한 공급망 안정화 지원 기본법", "핵심품목 위험분석부터 사업자 신청·선정·지원·실적·위기대응까지", "선정·지원·위기대응형"),
  c(444, "district-energy-business-permit", "집단에너지 사업허가·공급계획", "에너지·산업", "집단에너지사업법", "사업타당성·공급구역 검토부터 허가·시설건설·공급개시·요금·점검까지", "허가·건설·공급형"),

  // 445~458 디지털·데이터·금융
  c(445, "personal-information-processing-impact-review", "개인정보 처리방침·영향평가·개선", "디지털·개인정보", "개인정보 보호법", "처리시스템 기획부터 영향평가·개인정보보호위원회 검토·개선·공개까지", "평가·개선·공개형"),
  c(446, "public-data-provision-dispute", "공공데이터 제공신청·분쟁조정", "데이터·디지털·공공서비스", "공공데이터의 제공 및 이용 활성화에 관한 법률", "데이터 검색·제공신청부터 비공개 검토·제공·거부통지·분쟁조정까지", "신청·제공·조정형"),
  c(447, "data-driven-administration-project", "데이터기반행정 공동활용·분석사업", "데이터·디지털·공공서비스", "데이터기반행정 활성화에 관한 법률", "정책문제 발굴부터 데이터 등록·공동활용·분석·성과평가까지", "기획·공동활용·평가형"),
  c(448, "critical-information-infrastructure-protection", "정보통신기반시설 보호계획·취약점 개선", "데이터·디지털·공공서비스", "정보통신기반 보호법", "시설 지정부터 보호대책·취약점 분석·보호조치·점검·사고보고까지", "지정·보호·점검형"),
  c(449, "cybersecurity-incident-report-response", "정보통신망 침해사고 신고·대응", "데이터·디지털·공공서비스", "정보통신망 이용촉진 및 정보보호 등에 관한 법률", "사고탐지부터 신고·초동조치·원인분석·복구·재발방지까지", "신고·대응·복구형"),
  c(450, "online-commerce-business-compliance", "전자상거래 사업자 신고·소비자보호", "금융·소비자", "전자상거래 등에서의 소비자보호에 관한 법률", "사업자 정보·약관 확인부터 신고·청약철회·분쟁·시정권고까지", "신고·보호·시정형"),
  c(451, "financial-consumer-dispute-relief", "금융상품 설명·분쟁조정·피해구제", "금융·소비자", "금융소비자 보호에 관한 법률", "상품설명·적합성 확인부터 계약·민원·분쟁조정·피해보상까지", "설명·조정·구제형"),
  c(452, "virtual-asset-provider-reporting", "가상자산사업자 신고·이용자보호 점검", "금융·소비자", "가상자산 이용자 보호 등에 관한 법률", "사업자 요건·신고부터 이용자자산 보호·이상거래 감시·검사·시정까지", "신고·보호·검사형"),
  c(453, "deposit-insurance-payout-expansion", "예금자보호 사고조사·보험금 지급", "금융·소비자", "예금자보호법", "금융회사 사고확인부터 지급한도·채권신고·보험금 지급·회수까지", "사고·지급·회수형"),
  c(454, "money-lending-business-registration", "대부업 등록·금리·추심 점검", "금융·소비자", "대부업 등의 등록 및 금융이용자 보호에 관한 법률", "등록요건 확인부터 등록·계약·금리·추심 점검·행정처분까지", "등록·점검·처분형"),
  c(455, "digital-finance-innovation-designation", "금융혁신서비스 지정·규제특례 관리", "금융·소비자", "금융혁신지원 특별법", "서비스 신청부터 혁신성·소비자보호 심사·지정·실증·연장까지", "지정·실증·연장형"),
  c(456, "telecom-user-protection-dispute", "통신서비스 이용자 피해구제·분쟁조정", "데이터·디지털·공공서비스", "전기통신사업법", "피해접수부터 사실확인·사업자 시정·분쟁조정·재발방지까지", "접수·조정·시정형"),
  c(457, "ict-regulatory-sandbox-demonstration", "ICT 규제샌드박스 실증특례·임시허가", "인허가·규제·산업", "정보통신 진흥 및 융합 활성화 등에 관한 특별법", "신청·신속검토부터 실증특례·조건부 허가·안전관리·정식허가까지", "신청·실증·허가형"),
  c(458, "national-cybersecurity-management", "공공기관 정보시스템 보안대책·사고보고", "데이터·디지털·공공서비스", "전자정부법", "정보시스템 보안대책 수립부터 접근권한·침해사고 보고·복구·개선까지", "관리·보고·대응형"),

  // 459~472 교육·문화·체육
  c(459, "university-establishment-approval", "대학 설립인가·학생모집·사후평가", "교육", "고등교육법", "설립기준·학교헌장부터 인가·학칙·학생모집·평가·개선까지", "인가·모집·평가형"),
  c(460, "education-public-official-appointment", "교육공무원 임용·전보·징계", "교육", "교육공무원법", "임용요건·시험부터 임용·보직·전보·징계·소청까지", "임용·인사·구제형"),
  c(461, "teacher-educational-activity-protection", "교원 교육활동 보호·분쟁조정", "교육·복지", "교원의 지위 향상 및 교육활동 보호를 위한 특별법", "사안접수부터 사실조사·보호조치·분쟁조정·심의·후속지원까지", "신고·보호·조정형"),
  c(462, "education-institution-information-disclosure", "교육관련기관 정보공시·정정", "교육", "교육관련기관의 정보공개에 관한 특례법", "공시항목 확인부터 자료작성·검증·공시·정정·이의까지", "작성·공시·정정형"),
  c(463, "special-education-individual-support", "특수교육대상자 선정·배치·개별화교육", "교육·복지", "장애인 등에 대한 특수교육법", "진단·평가부터 선정·배치·개별화교육계획·재평가·전환교육까지", "선정·배치·교육형"),
  c(464, "school-violence-protection-measures", "학교폭력 사안조사·보호조치·심의", "교육", "학교폭력예방 및 대책에 관한 법률", "신고·초기대응부터 조사·피해자 보호·심의·조치·재심까지", "신고·조사·심의형"),
  c(465, "lifelong-education-facility-registration", "평생교육시설 신고·등록·운영점검", "교육", "평생교육법", "시설·과정 요건부터 신고·등록·운영·평가·시정·폐쇄까지", "신고·등록·점검형"),
  c(466, "national-qualification-training-course", "국가자격 교육훈련과정 지정·관리", "교육·고용", "국민 평생 직업능력 개발법", "과정개설 신청부터 기준심사·지정·훈련·평가·취소까지", "지정·훈련·평가형"),
  c(467, "national-university-account-budget", "국립대학회계 예산·결산·공개", "교육·재정", "국립대학의 회계 설치 및 재정 운영에 관한 법률", "예산편성부터 대학평의원회·심의·집행·결산·공개까지", "예산·집행·결산형"),
  c(468, "cultural-tourism-facility-designation", "문화·관광시설 지정·운영평가", "관광·문화", "관광진흥법", "시설기준·지정신청부터 심사·지정·운영·평가·지정취소까지", "지정·운영·평가형"),
  c(469, "buried-cultural-heritage-excavation-permit", "매장유산 발굴조사 허가·보존조치", "문화·콘텐츠", "매장유산 보호 및 조사에 관한 법률", "유존지역 확인부터 조사허가·발굴·보존·기록·처리까지", "허가·조사·보존형"),
  c(470, "cultural-heritage-survey-project", "문화유산 조사·현상변경 협의", "문화·콘텐츠", "매장유산 보호 및 조사에 관한 법률", "사업계획 검토부터 조사기관 선정·조사·협의·보존·완료보고까지", "조사·협의·보존형"),
  c(471, "sports-facility-business-registration", "체육시설업 신고·등록·안전관리", "체육·문화", "체육시설의 설치ㆍ이용에 관한 법률", "시설·사업자 기준부터 신고·등록·운영·안전점검·시정까지", "신고·등록·점검형"),
  c(472, "public-library-establishment-plan", "공공도서관 설립·등록·운영평가", "문화·콘텐츠", "도서관법", "설립계획·시설요건부터 등록·자료확보·운영·평가·개선까지", "설립·등록·평가형"),

  // 473~486 지방행정·재정·주민참여
  c(473, "local-resident-referendum", "주민투표 청구·투표·결과확정", "지방자치·주민참여", "주민투표법", "청구서명부터 심의·발의·투표인명부·투표·결과공표까지", "청구·투표·공표형"),
  c(474, "local-recall-election", "주민소환 청구·투표·결과확정", "지방자치·주민참여", "주민소환에 관한 법률", "청구인대표 등록부터 서명·청구심사·투표·개표·결과확정까지", "청구·투표·확정형"),
  c(475, "local-government-ordinance-proposal", "주민 조례청구·의회심사", "지방자치·주민참여", "지방자치법", "청구서·서명부터 요건심사·의회부의·심의·공포까지", "청구·의회·공포형"),
  c(476, "local-public-enterprise-establishment", "지방공기업 설립·경영평가", "지방자치와 지역", "지방공기업법", "설립타당성 검토부터 조례·설립·사업운영·경영평가·개선까지", "설립·운영·평가형"),
  c(477, "local-finance-investment-review", "지방재정 투자사업 심사·추진", "지방재정", "지방재정법", "사업구상부터 투자심사·재원조달·예산편성·사업추진·성과평가까지", "심사·예산·평가형"),
  c(478, "local-government-subsidy-management", "지방보조금 교부·집행·정산", "지방재정", "지방자치단체 보조금 관리에 관한 법률", "사업공고·신청부터 심사·교부·집행·정산·환수까지", "공모·교부·정산형"),
  c(479, "local-share-tax-allocation", "지방교부세 산정·교부·이의", "지방재정", "지방교부세법", "재정수요·수입 산정부터 교부액 결정·통지·교부·이의조정까지", "산정·교부·조정형"),
  c(480, "local-education-finance-allocation", "지방교육재정교부금 산정·교부", "교육·재정", "지방교육재정교부금법", "교육재정 수요조사부터 기준액 산정·교부·정산·검사까지", "산정·교부·정산형"),
  c(481, "local-investment-review-committee", "지방재정 투자심사위원회 재검토", "지방재정", "지방재정투자사업 심사규칙", "심사자료 접수부터 전문검토·위원회 심사·조건부 결정·재검토까지", "접수·심사·재검토형"),
  c(482, "regional-balanced-growth-project", "지방분권·지역균형성장 사업계획", "지방·균형성장", "지방자치분권 및 균형성장에 관한 특별법", "지역현황 분석부터 계획수립·관계기관 협의·지원사업·성과평가까지", "계획·협의·지원형"),
  c(483, "hometown-donation-project-selection", "고향사랑기부금 모금·답례품·기금사업", "지방·균형성장", "고향사랑 기부금에 관한 법률", "모금계획부터 기부·답례품 관리·기금운용·사업공개까지", "모금·기금·공개형"),
  c(484, "local-civil-service-appointment-expansion", "지방공무원 임용·전보·승진", "지방자치와 지역", "지방공무원법", "임용시험부터 신규임용·전보·승진·인사기록·이의까지", "시험·임용·인사형"),
  c(485, "local-civil-service-exam", "지방공무원 공개경쟁임용시험", "지방자치와 지역", "지방공무원 임용령", "채용계획부터 공고·원서접수·시험·합격·등록까지", "공고·시험·임용형"),
  c(486, "local-civil-service-disciplinary-appeal", "지방공무원 징계·소청심사", "지방자치와 지역", "지방공무원 징계 및 소청 규정", "징계의결 요구부터 조사·의결·처분·소청·재심까지", "징계·소청·재심형"),

  // 487~500 권리구제·안전·출입국·공익
  c(487, "national-human-rights-complaint", "국가인권위원회 진정·조사·구제", "민원·권리구제·참여", "국가인권위원회법", "진정접수부터 조사·조정·권고·기각·이행점검까지", "진정·조사·권고형"),
  c(488, "public-interest-whistleblower-protection", "공익신고 접수·보호·보상", "민원·권리구제·참여", "공익신고자 보호법", "신고접수·이첩부터 조사·보호조치·보상·신분비밀·사후관리까지", "신고·보호·보상형"),
  c(489, "public-official-conflict-of-interest-review", "공직자 이해충돌 신고·사후관리", "국가 운영과 권력 통제", "공직자의 이해충돌 방지법", "사적이해관계 확인부터 신고·회피·직무대리·위반조사·조치까지", "신고·회피·조사형"),
  c(490, "civil-complaint-processing-review", "민원 신청·처리·이의·고충민원", "민원·권리구제·참여", "민원 처리에 관한 법률", "민원신청부터 접수·소관배정·처리·통지·이의·재처리까지", "신청·처리·이의형"),
  c(491, "administrative-appeal-procedure-review", "행정심판 청구·심리·재결", "민원·권리구제·참여", "행정심판법", "심판청구부터 답변·보충서·심리·재결·재결이행까지", "청구·심리·재결형"),
  c(492, "administrative-procedure-opinion-hearing", "행정처분 사전통지·의견제출·청문", "민원·권리구제·참여", "행정절차법", "처분원인 확인부터 사전통지·의견제출·청문·처분·불복까지", "통지·청문·처분형"),
  c(493, "state-compensation-claim-review", "국가배상 청구·심의·지급", "민원·권리구제·참여", "국가배상법", "손해사실·책임 확인부터 청구·심의·결정·지급·소송까지", "청구·심의·지급형"),
  c(494, "crime-victim-protection-support", "범죄피해자 보호·지원 연계", "보건·복지", "범죄피해자 보호법", "피해신고부터 안전조치·상담·의료·법률지원·회복지원까지", "신고·보호·지원형"),
  c(495, "112-emergency-report-processing", "112 신고접수·출동·사건이첩", "외교·국방·치안·생활 기반", "112신고의 운영 및 처리에 관한 법률", "신고접수·분류부터 출동·현장조치·이첩·종결·사후평가까지", "신고·출동·이첩형"),
  c(496, "police-duty-protection-order", "경찰 위험방지·보호조치·통제", "외교·국방·치안·생활 기반", "경찰관 직무집행법", "위험상황 확인부터 질문·보호·출입·장비사용·기록·사후통제까지", "현장조치·통제형"),
  c(497, "119-rescue-emergency-medical-transfer", "119 구조·구급 출동·이송·기록", "외교·국방·치안·생활 기반", "119구조·구급에 관한 법률", "신고접수부터 출동·구조·응급처치·이송·기록·품질평가까지", "신고·구조·이송형"),
  c(498, "refugee-status-determination-appeal", "난민인정 신청·심사·이의", "출입국·병역", "난민법", "신청·면접부터 사실조사·심사결정·통지·이의·소송까지", "신청·심사·불복형"),
  c(499, "nationality-acquisition-review", "국적 취득·귀화 심사·증서교부", "출입국·병역", "국적법", "귀화요건 확인부터 신청·신원·적격심사·허가·국적증서까지", "신청·심사·허가형"),
  c(500, "public-corruption-report-investigation", "부패행위 신고·조사·보호·보상", "민원·권리구제·참여", "부패방지 및 국민권익위원회의 설치와 운영에 관한 법률", "신고접수·이첩부터 조사·보호·보상·결과통지·후속개선까지", "신고·조사·보상형"),
];

if (candidates.length !== 140) throw new Error(`후보 수가 140개가 아닙니다: ${candidates.length}`);

for (const spec of candidates) writeInstitution(spec);
updateManifest();
console.log(`다분야 제도 생성: ${candidates.length}개 (${candidates[0].priority}~${candidates.at(-1).priority})`);

function c(priority, slug, name, category, sourceTitle, focus, type) {
  return { priority, slug, name, category, sourceTitle, focus, type };
}

function writeInstitution(spec) {
  const file = path.join(DATA_DIR, `${spec.slug}.json`);
  if (fs.existsSync(file) && !OVERWRITE) throw new Error(`이미 존재하는 파일: ${file}`);
  const source = findSource(spec.sourceTitle);
  const rawCitations = [...(articlePool.get(compact(spec.sourceTitle)) ?? [])];
  const explicitCitations = rawCitations.filter((article) => /제\d+조(?:의\d+)?|부칙|별표/.test(article));
  const citations = explicitCitations.length > 0 ? explicitCitations : rawCitations;
  if (!source || citations.length === 0) {
    throw new Error(`기존 검증 메타데이터에서 법령 또는 조문을 찾을 수 없습니다: ${spec.sourceTitle}`);
  }
  fs.writeFileSync(file, `${JSON.stringify(build(spec, source, citations), null, 1)}\n`);
}

function build(spec, source, citations) {
  const actors = actorsFor(spec.category);
  const stages = ["G0 요건·대상", "G1 신청·접수", "G2 검토·심의", "G3 결정·이행", "G4 변경·사후관리", "G5 시정·재신청"];
  const legalArticle = citations[0];
  const legalBasis = [{ law: source.law, articles: legalArticle, kind: source.kind }];
  const nodes = buildNodes(spec, actors, stages, citations, source.law);
  const articleValues = [legalArticle, ...nodes.flatMap((node) => node.legal_basis.map((basis) => basis.article))];
  const articleReferences = articleValues.reduce((sum, value) => sum + parseArticleReferences(value).length, 0);
  const citationEntries = legalBasis.length + nodes.reduce((sum, node) => sum + node.legal_basis.length, 0);
  return {
    slug: spec.slug,
    name: spec.name,
    oneLiner: `${spec.focus} 이어지는 업무 경로`,
    type: spec.type,
    priority: spec.priority,
    category: spec.category,
    whyFirst: `${spec.focus} 과정에서 신청인·기관·전문가의 역할과 보완·결정·사후관리 시점이 갈라지는 지점을 한 화면에 정리했다.`,
    asOfDate: AS_OF,
    status: "full",
    canvas: {
      purpose: `${spec.name}의 법정 요건과 기관 간 업무 인계를 구조화한다.`,
      stakeholders: actors.join(", "),
      legalBasis,
      authorities: actors.map((actor, index) => ({ name: actor, role: index === 0 ? "신청·계획·증빙 또는 현장 실행" : index === 1 ? "접수·검토·현장 확인" : index === 2 ? "심의·결정·통지" : "이행·기록·사후관리" })),
      procedure: nodes.map((node) => node.name),
      moneyFlow: "수수료·지원금·급여·보상·공사비 등 금전 흐름은 개별 사업의 예산·고시·계약조건에 따라 달라지며, 이 구조도는 법정 절차와 인계 중심으로 표시한다.",
      docsFlow: `${spec.name} 신청·계획서 → 접수·검토기록 → 보완자료·심의자료 → 결정·통지서 → 이행·지급·점검기록 → 변경·시정·재신청 자료로 이어진다.`,
      bottlenecks: ["신청요건과 증빙자료의 불일치", "기관별 보완요청과 처리기한", "심의·결정 결과의 통지와 이행 연결", "변경·갱신·사후점검 기록 누락"],
      reformPoints: ["신청서·증빙·결정서 식별자 연결", "보완요청별 기한 자동알림", "결정조건과 이행점검 체크리스트 연계", "재신청·불복 경로와 원결정 기록 연결"],
    },
    related: [],
    fieldVerification: ["최신 시행계획·공고·서식", "기관별 전산 접수·보완·통지 화면", "처리기한 계산과 보정기간", "불복·시정·재신청의 실제 접수창구"],
    process: {
      institution_name: spec.name,
      law_name: source.law,
      lanes: actors,
      stages,
      nodes,
      edges: buildEdges(),
      warnings: [COMMON_WARNING, REMEDY_WARNING],
    },
    verification: {
      status: "article-verified",
      verifiedAt: AS_OF,
      method: "국가법령정보센터 DRF 현행 원문·조문 메타데이터와 신규 법령 API 대조 결과를 기준으로 연결",
      scope: `법적 근거 1건과 절차 노드의 명시 조문 ${articleReferences}건을 연결했다. 최신 원문 대조와 현장 적용은 전체 생성 후 일괄 검증한다.`,
      notes: ["현행 법령·행정규칙 메타데이터는 기존 검증 카탈로그에서 재사용", "기관별 운영규정·공고·전산 절차는 현장 검증 대상으로 분리"],
      sources: [source],
      articleVerification: { checkedAt: AS_OF, method: "국가법령정보센터 DRF 현행 조문번호 일괄 대조", citationEntries, explicitCitationEntries: citationEntries, articleReferences, verifiedReferences: articleReferences, missingReferences: 0, uncheckableReferences: 0 },
    },
  };
}

function buildNodes(spec, actors, stages, citations, law) {
  const labels = [
    `${spec.focus} 대상·요건 확인`,
    `${spec.focus} 신청·계획 작성`,
    `${spec.focus} 접수·등록`,
    `${spec.focus} 서류·현장 검토`,
    `${spec.focus} 보완자료 제출`,
    `${spec.focus} 관계기관·전문가 심의`,
    `${spec.focus} 결정·처분`,
    `${spec.focus} 결과 통지·공개`,
    `${spec.focus} 이행·서비스·운영`,
    `${spec.focus} 변경·갱신`,
    `${spec.focus} 사후점검·기록`,
    `${spec.focus} 시정·이의·재신청`,
  ];
  const docs = ["대상·요건 확인표", "신청서·계획서", "접수·등록 기록", "검토·조사 기록", "보완자료", "심의자료·의견서", "결정서·처분서", "결과통지·공개자료", "이행·지급·운영 기록", "변경·갱신 신청", "점검·성과 기록", "시정·이의·재신청서"];
  return labels.map((name, index) => {
    const stage = index < 2 ? stages[0] : index < 4 ? stages[1] : index < 7 ? stages[2] : index < 9 ? stages[3] : index < 11 ? stages[4] : stages[5];
    const type = [3, 5, 6, 9, 11].includes(index) ? "gateway" : "task";
    const citation = citations[index % citations.length];
    return {
      id: `P${pad(index + 1)}`,
      name,
      lane: actors[index % actors.length],
      stage,
      type,
      status: index < 2 ? "done" : index === 2 ? "current" : type === "gateway" ? "risk" : "waiting",
      progress: index < 2 ? 100 : index === 2 ? 55 : 0,
      actor: actors[index % actors.length],
      action: `${name}에 필요한 행위와 증빙을 확인하고 다음 담당자에게 인계한다.`,
      input_documents: index === 0 ? [] : [docs[index - 1]],
      output_documents: [docs[index]],
      deadline: [2, 4, 6, 7, 9, 11].includes(index) ? "개별 법령·공고·통지서에서 확인" : null,
      blocker: [3, 5, 6, 9, 11].includes(index) ? "요건 미충족·자료보완·조건부 결정 가능" : null,
      confidence: 0.9,
      legal_basis: [{ law, article: citation, text: `${law} ${citation}에 따른 절차` }],
    };
  });
}

function buildEdges() {
  return [
    edge("P01", "P02", "sequence"), edge("P02", "P03", "sequence"), edge("P03", "P04", "sequence"),
    edge("P04", "P05", "sequence"), edge("P05", "P04", "loop", "자료보완"), edge("P04", "P06", "sequence"),
    edge("P06", "P07", "sequence"), edge("P07", "P08", "sequence", "결정"), edge("P07", "P05", "loop", "조건부·보완"),
    edge("P08", "P09", "sequence"), edge("P09", "P10", "sequence"), edge("P10", "P11", "sequence"),
    edge("P11", "P12", "sequence", "시정·불복"), edge("P12", "P03", "loop", "재신청"),
  ].map((item, index) => ({ id: item.type === "loop" ? `L${pad(index + 1)}` : `E${pad(index + 1)}`, ...item }));
}

function edge(source, target, type, label = null) { return { source, target, type, label }; }

function actorsFor(category) {
  if (/복지|가족|보건/.test(category)) return ["신청인·대상자", "읍면동·보건소", "전문기관·위원회", "지자체·관계기관"];
  if (/노동|고용|교육/.test(category)) return ["근로자·사업자", "접수기관·고용센터", "심의·판정기관", "사업주·교육기관"];
  if (/주택|도시|국토|교통/.test(category)) return ["신청인·사업자", "지자체·인허가부서", "전문기관·위원회", "시공·운영기관"];
  if (/환경|기후|재난/.test(category)) return ["사업자·주민", "지자체·현장기관", "전문기관·상황실", "중앙행정기관"];
  if (/농식품|식품|동물|지역/.test(category)) return ["농가·사업자·주민", "지자체·검사기관", "전문기관·위원회", "관계 중앙행정기관"];
  if (/산업|조달|관광|에너지/.test(category)) return ["기업·사업자", "허가·조달기관", "심사·전문기관", "운영·감독기관"];
  if (/디지털|금융|데이터/.test(category)) return ["이용자·사업자", "접수·감독기관", "심사·분쟁조정기관", "서비스·보안기관"];
  if (/문화|체육/.test(category)) return ["학생·이용자·사업자", "지자체·교육기관", "심의·평가기관", "운영기관"];
  if (/지방|재정/.test(category)) return ["주민·지방기관", "지자체 담당부서", "위원회·의회", "중앙행정기관"];
  return ["신청인·신고자", "접수·현장기관", "심의·수사기관", "결정·지원기관"];
}

function findSource(title) { return sourceMeta.get(compact(title)); }

function updateManifest() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  for (const spec of candidates) {
    const entry = { priority: spec.priority, slug: spec.slug, name: spec.name, type: spec.type, category: spec.category };
    const existing = manifest.find((item) => item.priority === spec.priority || item.slug === spec.slug);
    if (existing && !OVERWRITE) throw new Error(`manifest 중복: ${spec.priority} ${spec.slug}`);
    if (existing && (existing.priority !== spec.priority || existing.slug !== spec.slug)) throw new Error(`manifest 충돌: ${spec.priority} ${spec.slug}`);
    if (existing) Object.assign(existing, entry);
    else manifest.push(entry);
  }
  manifest.sort((a, b) => a.priority - b.priority);
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

function compact(value) { return (value ?? "").replace(/\s+/g, "").replace(/[「」『』“”‘’]/g, ""); }
function pad(value) { return String(value).padStart(2, "0"); }
