# SecNews Bot — 작업 체크리스트

> spec.md와 연동되는 단계별 작업 목록.
> 완료된 항목은 `[x]`로 체크.

---

## 1단계: 프로젝트 초기 설정 ✅

- [x] 디렉토리 구조 생성 (`config/`, `state/`, `templates/`, `scripts/`)
- [x] Git 저장소 초기화 및 GitHub 원격 연결
- [x] `.gitignore` 설정 (`.env`, `node_modules/` 등)
- [x] `config/sources.json` — 6개 뉴스 소스 정의
- [x] `state/posted_articles.json` — 초기 상태 파일 생성
- [x] `templates/slack_message.md` — 메시지 형식 템플릿
- [x] `.env` — Slack Bot Token, Channel ID 설정

---

## 2단계: 뉴스 수집 및 AI 요약 파이프라인 ✅

- [x] `CLAUDE.md` — 에이전트 실행 지시문 작성
- [x] RSS 피드 수집 및 파싱 로직 정의
- [x] WebSearch 폴백 전략 정의 (KISA 등 비-RSS 소스)
- [x] 심각도 분류 기준 정의 (🔴🟠🟡🟢)
- [x] 카테고리 분류 기준 정의 (취약점/사고/정책/분석/익스플로잇)
- [x] 한국어 요약 규칙 정의 (3~5줄, CVE 보존, 과장 금지)
- [x] 오류 처리 규칙 정의 (소스 실패시 건너뛰기, 폴백 전략)
- [x] 중복 제거 로직 정의 (SHA-256 해시 앞 8자리)
- [x] 상태 파일 pruning 규칙 (소스당 500개)

---

## 3단계: Slack 연동 및 대화형 봇 ✅

- [x] Slack 앱 생성 및 Bot Token 발급
- [x] Socket Mode 활성화 및 App Token 발급
- [x] `scripts/post_to_slack.sh` — Slack 게시 셸 스크립트
- [x] `bot.js` — 대화형 봇 (멘션 → Claude Code CLI → 응답)
- [x] 스레드 기반 세션 관리 (thread_ts → session_id 매핑)
- [x] `bot.test.js` — 봇 세션 테스트
- [x] Slack 메시지 포맷 검증 (이모지, 링크, 구분선)

---

## 4단계: LLM Provider 추상화 및 파이프라인 코드 분리 ✅

- [x] `src/llm/index.js` — Provider 팩토리 (`createProvider`)
- [x] `src/llm/claude-code.js` — Claude Code CLI 프로바이더
- [x] `src/llm/ollama.js` — Ollama REST API 프로바이더
- [x] `src/collectors/rss.js` — RSS/Atom 피드 파서 (EUC-KR 인코딩 지원)
- [x] `src/analyzers/summarizer.js` — LLM 요약 + 심각도/카테고리 분류
- [x] `src/publishers/slack.js` — Slack 게시 + 메시지 포맷
- [x] `src/state.js` — 상태 관리자 (중복 체크, pruning)
- [x] `src/pipeline.js` — 파이프라인 오케스트레이터
- [x] `run.js` — CLI 엔트리 포인트 (`--provider`, `--dry-run`, `--model`)
- [x] `package.json` — 스크립트 추가 (`pipeline`, `pipeline:dry`, `pipeline:ollama`)
- [x] `fast-xml-parser` 의존성 추가
- [x] `bot.js` — 하드코딩된 cwd 경로 수정 (`process.cwd()`)
- [x] 모듈 임포트 및 기본 기능 검증 완료

---

## 5단계: 파이프라인 테스트 및 안정화 🔶

- [x] `--dry-run` 모드로 전체 파이프라인 실행 테스트
- [x] RSS 수집 → 필터링 → 요약 → 포맷 흐름 검증
- [x] EUC-KR 인코딩 이슈 수정 (보안뉴스 RSS)
- [ ] Ollama 프로바이더로 로컬 LLM 연동 테스트
- [ ] 파이프라인 단위 테스트 추가 (StateManager, formatSlackMessage 등)
- [ ] 실제 Slack 게시 테스트 (`npm run pipeline`)

---

## 6단계: 프롬프트 라우터 + Jira/Email 에이전트 ✅

- [x] `src/router.js` — 키워드 기반 의도 분류 (뉴스/Jira/이메일/일반)
- [x] `src/agents/jira-prompt.js` — Jira 시스템 프롬프트 (JQL 변환 가이드 포함)
- [x] `src/agents/email-prompt.js` — Email 시스템 프롬프트
- [x] `src/connectors/jira.js` — Jira REST API 클라이언트
- [x] `src/agents/jira.js` — Jira 에이전트 오케스트레이터
- [x] `src/agents/email.js` — Email 에이전트 오케스트레이터
- [x] `src/auth/token-store.js` — 사용자별 토큰 암호화 저장소 (AES-256-GCM)
- [x] `.mcp.json` — Atlassian MCP 서버 설정
- [x] `bot.js` — 프롬프트 라우터 통합 + connect-email 명령
- [x] 라우터 정확도 테스트 (7개 시나리오 통과)
- [x] 모든 모듈 임포트 검증 완료

---

## 7단계: 연동 테스트 🔶

- [x] Jira API Token 발급 및 `.env`에 설정
- [x] Jira 이슈 검색 동작 확인 (API 엔드포인트 /search/jql 마이그레이션)
- [x] Google Cloud Console에서 OAuth 클라이언트 생성
- [x] OAuth 동의 화면 설정 및 테스트 사용자 등록
- [x] `connect-email` 명령을 멘션 기반으로 변경
- [x] Slack 자동 포맷팅 제거 처리 (`<url|text>` → `text`)
- [x] Slack 메시지 길이 초과 분할 전송 (`chat.update` → `say` 방식)
- [x] 토큰 리밋 에러 메시지 간소화
- [x] Slack 대화형 봇 응답 테스트 성공
- [ ] IMAP 이메일 연동 실테스트 (메일플러그 앱 비밀번호 확인 필요)
- [ ] Ollama 프로바이더로 Jira/Email 에이전트 테스트

---

## 8단계: IMAP 기반 범용 이메일 연동 ✅

- [x] `src/connectors/imap.js` — IMAP 클라이언트 (imap-simple 기반)
- [x] Gmail, 메일플러그, 네이버, Outlook 등 멀티 서비스 지원 구조
- [x] 인증 방식: 이메일 + 앱 비밀번호 (OAuth 불필요)
- [x] `src/agents/email.js` — Gmail API에서 IMAP으로 전환 완료
- [x] `bot.js` — connect-email 플로우를 IMAP 방식으로 변경
- [ ] 실제 IMAP 연동 테스트 (앱 비밀번호 인증 확인)

---

## 9단계: SCOUT+CRITIC 하이브리드 프로바이더

- [ ] `src/llm/hybrid.js` — 하이브리드 프로바이더 구현
- [ ] SCOUT 단계: 로컬 LLM으로 1차 분류/필터링
- [ ] 에스컬레이션 기준 정의 (심각도 🟠🔴 → CRITIC으로 전달)
- [ ] CRITIC 단계: 클라우드 LLM으로 정밀 분석
- [ ] 비용 절감 효과 측정 (클라우드 호출 비율 추적)
- [ ] 품질 비교 테스트 (하이브리드 vs 클라우드 전용)
- [ ] `createProvider({ type: 'hybrid' })` 팩토리 등록

---

## 10단계: websearch 소스 로컬 지원

- [ ] SearXNG 로컬 인스턴스 설정 (또는 대안 검색 엔진)
- [ ] `src/collectors/websearch.js` — 검색 기반 기사 수집기
- [ ] KISA 보호나라 등 websearch 소스 로컬 파이프라인 지원
- [ ] RSS 실패시 websearch 폴백 로직 연동
- [ ] 검색 결과에서 기사 메타데이터 추출 (제목, URL, 날짜)

---

## 11단계: 스케줄링 및 모니터링

- [ ] 클라우드 스케줄 등록 (cron: `0 */3 * * *`)
- [ ] 또는 로컬 cron/systemd 타이머로 `npm run pipeline` 실행
- [ ] 실행 로그 저장 및 모니터링 체계 구축
- [ ] 실행 실패시 알림 (Slack 에러 채널 또는 이메일)
- [ ] 주간 실행 현황 리포트 자동 생성
- [ ] 튜닝 파라미터 문서화 (실행 주기, 소스당 최대 기사 수, 보관 기간)

---

## 완료 기준

| 마일스톤 | 상태 | 포함 단계 |
|---------|:----:|----------|
| MVP — 뉴스 자동 게시 | ✅ | 1~3단계 |
| 로컬 LLM 전환 가능 | ✅ | 4단계 |
| 파이프라인 안정화 | 🔶 | 5단계 |
| 멀티 에이전트 코드 | ✅ | 6단계 |
| 연동 테스트 | 🔶 | 7단계 |
| IMAP 범용 이메일 코드 | ✅ | 8단계 |
| 비용 최적화 (하이브리드) | ⬜ | 9단계 |
| 완전 로컬 자립 | ⬜ | 10단계 |
| 무인 자동화 | ⬜ | 11단계 |
