# Korea100 작업대 Chrome 확장 프로그램

Korea100의 제도 데이터를 Chrome 사이드패널에서 검색하고, 개인 초안으로 복제해 업무 단계·연결·근거를 편집하는 Manifest V3 확장 프로그램이다. 별도 회원가입, 서버, Google OAuth 없이 동작한다.

## 설치

### 준비된 ZIP 사용

1. `release/korea100-workbench-0.1.0.zip`의 압축을 푼다.
2. Chrome 주소창에서 `chrome://extensions`를 연다.
3. **개발자 모드**를 켜고 **압축해제된 확장 프로그램을 로드합니다**를 누른다.
4. 압축을 푼 폴더에서 `manifest.json`이 있는 폴더를 선택한다.
5. 도구 모음의 Korea100 아이콘을 누르면 사이드패널이 열린다.

Chrome Web Store에 공개하면 2~4단계 없이 일반 확장 프로그램처럼 설치할 수 있다. 현재 산출물은 스토어 제출 전 자체 설치용이다.

### 저장소에서 빌드

```bash
cd chrome-extension
npm install
npm run package
```

빌드 결과는 `dist/`, 설치 ZIP은 `release/`에 생성된다. `web/data/institutions/`의 모든 JSON을 읽으므로 제도가 추가되면 확장 프로그램 데이터도 다음 빌드에서 자동으로 갱신된다.

## 주요 흐름

- **찾기**: 제도명, 기관, 법령, 업무로 현재 505개 제도를 검색한다.
- **복제**: 원본의 레인, 단계, 노드, 연결, 근거 조문을 개인 초안으로 복제한다.
- **편집**: 개요, 업무 노드, 노드 간 연결을 추가·수정·삭제한다.
- **근거 수집**: 웹페이지 문장을 선택하고 사이드패널 버튼 또는 우클릭 메뉴로 가져온다.
- **JSON**: 초안 또는 전체 작업대를 백업하고 다시 가져온다.
- **기여 제안**: 캡처 원문과 계정 정보 없이 GitHub 이슈·PR용 또는 GitLab 이슈·MR용 JSON을 만든다.

## 저장 경계

| 데이터 | 저장 위치 | 다른 Chrome 프로필 기기 |
|---|---|---|
| 즐겨찾기 | `chrome.storage.sync` | Chrome 동기화 설정에 따라 목록 동기화 |
| 초안 목록·수정 시각 | `chrome.storage.sync` | Chrome 동기화 설정에 따라 목록 동기화 |
| 초안 본문 | `chrome.storage.local` | 자동 동기화 안 됨 |
| 캡처 문장·출처 | `chrome.storage.local` | 자동 동기화 안 됨 |
| 임시 캡처 | `chrome.storage.session` | 브라우저 세션 종료 시 소멸 |

확장 프로그램은 Google 이름, 이메일, 프로필 ID, OAuth 토큰을 요청하거나 읽지 않는다. 다른 기기에서 초안 본문을 이어 쓰려면 **전체 백업** JSON을 가져온다.

## 개인정보 방어

- 주민·외국인등록번호, 이메일, 전화번호, 계좌·카드로 보이는 긴 숫자, 인증정보가 든 URL을 저장 전에 차단한다.
- 출처 URL에서는 사용자명, 비밀번호, 쿼리 문자열, 해시를 제거한다.
- 웹페이지 내용은 사용자가 문장을 선택하고 명령을 실행했을 때만 읽는다.
- 기여 제안 패키지에는 캡처 문장을 제외하고 정리된 출처 링크만 넣는다.
- 전체 삭제는 로컬 초안·근거와 동기화 목록을 함께 지운다.

자세한 내용은 [PRIVACY.md](PRIVACY.md)를 참고한다.

## 권한

- `sidePanel`: 작업대를 Chrome 사이드패널로 표시
- `storage`: 개인 작업과 동기화 목록 저장
- `contextMenus`: 선택 문장 우클릭 명령 제공
- `activeTab`, `scripting`: 사용자가 명령한 현재 탭의 선택 문장만 읽기

`identity`, 광범위한 `host_permissions`, 방문 기록, 다운로드, 클립보드 권한은 사용하지 않는다.

## 검증

```bash
npm test            # 개인정보, 데이터 모델, 동기화 분할 저장
npm run check       # 테스트, 505개 데이터 빌드, 권한·데이터 검증
npm run test:browser # 실제 Chromium에서 검색·복제·320px UI 검사
```

자동 브라우저 검사는 Playwright용 Chromium이 필요하다. 기본 경로를 찾지 못하면 `CHROME_PATH`에 Chrome for Testing 또는 Chromium 실행 파일을 지정한다.

## 기여 방식

확장 프로그램은 GitHub·GitLab 토큰을 저장하거나 저장소에 직접 쓰지 않는다. 사용자는 **기여 제안**에서 GitHub 또는 GitLab용 JSON을 내려받아 담당 저장소의 이슈, Pull Request 또는 Merge Request에 첨부한다. 파일에는 계정정보가 없지만 로그인한 플랫폼에 올리면 해당 플랫폼의 계정명은 표시된다.

## 라이선스

저장소 루트의 [MIT License](../LICENSE)를 따른다. Lucide 아이콘은 Lucide의 ISC License를 따른다.
