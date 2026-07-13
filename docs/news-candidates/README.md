# Korea100 뉴스 후보 수집

`web/scripts/discover-news-candidates.mjs`가 네이버 뉴스 검색 API와 정책브리핑 정책뉴스 API를 함께 조회해 Korea100 신규 제도 후보를 만든다.

출력 파일:

- `docs/news-candidates/latest.json`
- `docs/news-candidates/latest.md`

두 파일은 2시간마다 갱신되는 작업 산출물이므로 git에 커밋하지 않는다.

로컬 실행:

```bash
cd web
npm run discover:candidates
```

필요한 로컬 환경변수:

- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`
- `POLICY_BRIEFING_SERVICE_KEY`
