# SecNews Bot — Agent Instructions

이 문서는 어떤 에이전트/LLM이든 이 시스템을 사용할 수 있도록 작성된 범용 지시서입니다.
특정 에이전트 프레임워크(Claude Code, OpenClaw 등)에 종속되지 않습니다.

## 에이전트 시스템 프롬프트

아래 내용을 에이전트 프레임워크의 시스템 프롬프트 또는 지시 파일에 복사하여 사용하세요.

```
당신은 보안 뉴스 봇의 에이전트입니다. 사용자의 요청을 분석하고, 아래 도구들을 bash로 호출하여 결과를 한국어로 요약합니다.

프로젝트 루트: 이 저장소를 clone한 디렉토리 (AGENT.md가 위치한 곳)
상세 지시서: 프로젝트 루트의 AGENT.md 파일을 반드시 읽고 따르세요.

## 도구 목록

### 이메일 조회
node scripts/read_email.js --action <list|read|search> [--max N] [--unseen true] [--from 발신자] [--subject 키워드] [--uid UID]
- 자격증명은 .env의 IMAP_HOST, IMAP_USER, IMAP_PASS에서 자동 로드
- "내용 보여줘" 요청 시: 먼저 list로 UID를 얻고, read --uid <UID>로 본문 조회 (2단계 필수)
- list 액션은 헤더(제목, 발신자, 날짜)만 반환하고 본문은 포함하지 않음
- 출력: JSON (stdout)

### Jira 검색
node scripts/jira_query.js --action <search|get|create> [--jql "JQL쿼리"] [--key PROJ-123] [--max N] [--project KEY] [--summary "제목"] [--type Task]
- 자격증명은 .env의 JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN에서 자동 로드
- 사용자의 자연어 요청을 JQL로 변환하여 --jql에 전달
- 출력: JSON (stdout)

### Slack 메시지 게시
./scripts/post_to_slack.sh "메시지 내용"
- 토큰과 채널은 .env에서 자동 로드

### 뉴스 수집
node run.js --provider=ollama          # Ollama로 실제 Slack 게시
node run.js --provider=ollama --dry-run # 게시 없이 콘솔 출력만

### 상태 확인
cat state/posted_articles.json
- last_updated: 마지막 뉴스 수집 시각
- articles: 소스별 게시 이력

## 응답 규칙
- 한국어로 응답
- 개인정보(전화번호, 주소, 계좌번호)는 마스킹
- CVE 번호, 제품명은 번역하지 않고 원문 유지
- 대화 맥락을 유지하여 후속 질문("다 보여줘", "그거 자세히")에도 자연스럽게 응답
- 이메일 내용은 공개 채널에서 상세 노출 금지
```

## 시스템 개요

보안 뉴스 수집, 이메일 조회, Jira 검색을 수행하고 Slack으로 결과를 전달하는 봇입니다.

```
사용자 (Slack) → 에이전트 → 도구 호출 → 결과 요약 → Slack 응답
```

## 사용 가능한 도구

모든 도구는 Node.js CLI 또는 셸 스크립트로 호출할 수 있습니다.
프로젝트 루트: 이 파일이 위치한 디렉토리

### 1. 이메일 조회 (IMAP)

IMAP 프로토콜 기반 범용 이메일 클라이언트입니다. Gmail, 메일플러그, 네이버, Outlook 등 IMAP 지원 서비스 모두 사용 가능합니다.

**호출 방법:**
```bash
node scripts/read_email.js --action <action> [옵션]
```

**액션:**

| 액션 | 설명 | 필수 옵션 |
|------|------|----------|
| `list` | 메일 목록 조회 (헤더만) | 없음 |
| `read` | 특정 메일 본문 조회 | `--uid <UID>` |
| `search` | 키워드로 메일 검색 | `--subject <키워드>` |

**옵션:**

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `--host` | .env `IMAP_HOST` | IMAP 서버 주소 (예: imap.gmail.com, imap.mailplug.co.kr) |
| `--user` | .env `IMAP_USER` | 이메일 주소 |
| `--pass` | .env `IMAP_PASS` | 앱 비밀번호 |
| `--max` | 10 | 최대 조회 건수 |
| `--unseen` | false | true면 안 읽은 메일만 조회 |
| `--from` | (선택) | 발신자 필터 |
| `--subject` | (선택) | 제목 키워드 필터 |
| `--uid` | (선택) | 특정 메일 UID (read 액션용) |

**출력 형식:** JSON (stdout)

```json
// list/search 결과
{
  "success": true,
  "count": 3,
  "messages": [
    {
      "uid": 1234,
      "from": "sender@example.com",
      "subject": "메일 제목",
      "date": "2026-04-01T09:00:00Z",
      "isUnread": true
    }
  ]
}

// read 결과
{
  "success": true,
  "message": {
    "uid": 1234,
    "from": "sender@example.com",
    "to": "receiver@example.com",
    "subject": "메일 제목",
    "date": "2026-04-01T09:00:00Z",
    "text": "메일 본문 전체 내용..."
  }
}

// 오류
{
  "success": false,
  "error": "오류 메시지"
}
```

**사용자 요청 → 도구 호출 예시:**

| 사용자 요청 | 도구 호출 |
|------------|----------|
| "최근 메일 1건 보여줘" | `--action list --max 1` |
| "안 읽은 메일 확인해줘" | `--action list --unseen true` |
| "메일 내용 전부 보여줘" | `--action list --max 1` 로 UID 확인 → `--action read --uid <UID>` |
| "김철수한테 온 메일" | `--action search --from 김철수` |

**중요: "내용을 보여줘" 요청 처리 흐름**
1. 먼저 `--action list`로 메일 목록을 가져와 UID를 확인
2. 그 다음 `--action read --uid <UID>`로 본문을 조회
3. list 액션은 헤더(제목, 발신자, 날짜)만 반환하고 본문은 포함하지 않음

### 2. Jira 검색

Jira REST API를 통해 이슈를 검색, 조회, 생성합니다.

**호출 방법:**
```bash
node scripts/jira_query.js --action <action> [옵션]
```

**환경변수 (필수, .env에서 로드):**
- `JIRA_BASE_URL` — Jira 인스턴스 URL (예: https://your-domain.atlassian.net)
- `JIRA_EMAIL` — 인증용 이메일
- `JIRA_API_TOKEN` — API 토큰

**액션:**

| 액션 | 설명 | 필수 옵션 |
|------|------|----------|
| `search` | JQL로 이슈 검색 | `--jql <JQL쿼리>` |
| `get` | 특정 이슈 조회 | `--key <PROJ-123>` |
| `create` | 이슈 생성 | `--project`, `--summary`, `--type` |

**옵션:**

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `--jql` | (search시 필수) | JQL 쿼리 문자열 |
| `--key` | (get시 필수) | 이슈 키 (예: PROJ-123) |
| `--max` | 20 | 검색 최대 결과 수 |
| `--project` | (create시 필수) | 프로젝트 키 |
| `--summary` | (create시 필수) | 이슈 제목 |
| `--type` | Task | 이슈 유형 (Task, Bug, Story 등) |

**출력 형식:** JSON (stdout)

**사용자 요청 → JQL 변환 예시:**

| 사용자 요청 | JQL |
|------------|-----|
| "나한테 할당된 이슈" | `assignee = currentUser() ORDER BY updated DESC` |
| "이번 스프린트 이슈" | `sprint in openSprints() ORDER BY priority DESC` |
| "긴급 버그" | `type = Bug AND priority = Highest ORDER BY created DESC` |
| "최근 생성된 이슈 5개" | `ORDER BY created DESC` (--max 5) |

### 3. Slack 메시지 게시

**호출 방법:**
```bash
./scripts/post_to_slack.sh "메시지 내용"
```

**환경변수 (필수, .env에서 자동 로드):**
- `SLACK_BOT_TOKEN` — Bot User OAuth Token (xoxb-...)
- `SLACK_CHANNEL_ID` — 게시 대상 채널 ID

**의존성:** `jq`, `curl`

### 4. 뉴스 파이프라인

보안 뉴스 6개 소스에서 기사를 수집하고 AI 요약을 생성하여 Slack에 게시합니다.

**호출 방법:**
```bash
# 실제 게시
node run.js

# 게시 없이 콘솔 출력만 (테스트용)
node run.js --dry-run

# Ollama 사용
node run.js --provider=ollama
```

**뉴스 소스 (config/sources.json):**

| 소스 | 유형 | 언어 |
|------|------|------|
| 보안뉴스 | RSS | 한국어 |
| 데일리시큐 | RSS | 한국어 |
| The Hacker News | RSS | 영어 |
| BleepingComputer | RSS | 영어 |
| KISA 보호나라 | WebSearch | 한국어 |
| Exploit Database | RSS | 영어 |

### 5. 상태 파일 (읽기 전용 참조)

**`state/posted_articles.json`** — 게시 이력 및 중복 방지

```json
{
  "last_updated": "2026-03-31T17:30:00Z",
  "articles": {
    "boannews": [
      { "url_hash": "a1b2c3d4", "title": "기사 제목", "posted_at": "2026-03-30T09:00:00Z" }
    ]
  }
}
```

- `last_updated`: 마지막 뉴스 수집 시각
- `articles`: 소스별 게시된 기사 목록 (url_hash로 중복 판별)

## 응답 규칙

### 이메일 응답
- 개인정보(전화번호, 주소, 계좌번호)는 마스킹 처리
- 5건 이하: 각각 요약 / 5건 초과: 통계 + 주요 메일만 요약
- 공개 채널에서는 상세 내용 노출 금지 (건수/제목만)

### 뉴스 요약
- 한국어로 3~5줄 요약
- CVE 번호, 제품명, 버전은 원문 그대로 유지 (번역 금지)
- 심각도 분류: 🔴 긴급 (CVSS 9.0+) / 🟠 높음 (7.0-8.9) / 🟡 보통 (4.0-6.9) / 🟢 낮음
- 카테고리: 취약점 / 사고 / 정책 / 분석 / 익스플로잇

### Slack 메시지 형식 (뉴스)
```
🔒 [출처명] 기사 제목
━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 심각도: 🔴 긴급

📝 AI 요약:
요약 내용 3~5줄.

🏷️ 카테고리: 분류
🔗 원문: URL
🕐 발행: YYYY-MM-DD
━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## 환경변수

`.env` 파일에서 로드됩니다. 도구 스크립트들이 자동으로 읽습니다.

| 변수 | 용도 | 필수 |
|------|------|------|
| `SLACK_BOT_TOKEN` | Slack Bot Token (xoxb-...) | O |
| `SLACK_CHANNEL_ID` | Slack 채널 ID | O |
| `SLACK_APP_TOKEN` | Socket Mode Token (xapp-...) | 대화형 봇 사용시 |
| `JIRA_BASE_URL` | Jira 인스턴스 URL | Jira 사용시 |
| `JIRA_EMAIL` | Jira 인증 이메일 | Jira 사용시 |
| `JIRA_API_TOKEN` | Jira API 토큰 | Jira 사용시 |
| `TOKEN_ENCRYPTION_KEY` | 이메일 토큰 암호화 키 (32바이트 hex) | 이메일 사용시 |

## 진행 중인 리팩토링

### 현재 상태 (as-is)

```
Slack 멘션 → bot.js → JS 키워드 라우터 → 분기:
  ├─ email → EmailAgent (Node.js IMAP, 세션 없음)
  ├─ jira  → Claude Code CLI (MCP) 또는 JiraAgent (Ollama)
  ├─ news  → Claude Code CLI 또는 LLM
  └─ general → Claude Code CLI (세션 유지)
```

**문제점:**
1. 키워드 라우터가 맥락을 끊음 ("메일 보여줘" → email, "다 보여줘" → general)
2. email intent만 Claude Code 세션에서 제외되어 대화 맥락 유실
3. Claude Code 모드와 Ollama 모드가 완전히 다른 코드 경로
4. 이메일 list 액션이 헤더만 가져와서 "내용 보여줘"에 본문 미표시

### 목표 상태 (to-be)

```
Slack 멘션 → bot.js → 에이전트 (LLM으로 의도 파악) → 도구 호출 → 응답
```

- LLM을 "등록된 두뇌"로 취급 (Ollama, Claude API 등 교체 가능)
- JS 키워드 라우터 제거, LLM이 이 문서를 참조하여 의도 분류
- 모든 도구는 CLI 스크립트로 호출 가능 (에이전트 무관)
- 스레드별 대화 히스토리 유지

### 남은 작업

1. **CLI 래퍼 스크립트 작성** (선행 필수)
   - `scripts/read_email.js` — 기존 `src/connectors/imap.js`의 `ImapClient`를 CLI로 래핑
   - `scripts/jira_query.js` — 기존 `src/connectors/jira.js`의 `JiraClient`를 CLI로 래핑
   - 두 스크립트 모두 JSON을 stdout으로 출력

2. **대화 히스토리 저장소**
   - 스레드별 메시지 누적 (최대 20개, 30분 TTL)
   - 현재는 Claude Code CLI 세션에만 존재, Node.js 레벨로 이동 필요

3. **bot.js 리팩토링**
   - 키워드 라우터 제거
   - Claude Code CLI subprocess 의존 제거 (bot 경로에서만)
   - 단일 오케스트레이터가 LLM으로 의도 분류 → 도구 호출

4. **뉴스 파이프라인은 별도 유지**
   - `run.js` + `CLAUDE.md`는 현재 구조 그대로
   - 이 리팩토링은 대화형 봇(`bot.js`) 경로에만 적용

## 프로젝트 구조

```
secnews-bot/
├── AGENT.md                    # 이 문서 (범용 에이전트 지시서)
├── CLAUDE.md                   # 뉴스 파이프라인 전용 지시서
├── bot.js                      # Slack 대화형 봇 (리팩토링 대상)
├── run.js                      # 뉴스 파이프라인 CLI
├── .env                        # 환경변수 (git 미추적)
│
├── src/
│   ├── connectors/
│   │   ├── imap.js             # IMAP 클라이언트 (순수 Node.js, 외부 의존성 없음)
│   │   └── jira.js             # Jira REST API 클라이언트 (순수 Node.js)
│   ├── publishers/
│   │   └── slack.js            # Slack API (postMessage, uploadFile)
│   ├── agents/
│   │   ├── email.js            # Email 오케스트레이터 (LLM + IMAP)
│   │   ├── email-prompt.js     # Email 지시 프롬프트
│   │   ├── jira.js             # Jira 오케스트레이터 (LLM + Jira API)
│   │   └── jira-prompt.js      # Jira 지시 프롬프트
│   ├── llm/
│   │   ├── index.js            # LLM 프로바이더 팩토리
│   │   ├── claude-code.js      # Claude Code CLI 프로바이더
│   │   └── ollama.js           # Ollama REST API 프로바이더
│   ├── collectors/
│   │   └── rss.js              # RSS/Atom 파서
│   ├── analyzers/
│   │   └── summarizer.js       # LLM 기반 기사 요약
│   ├── state.js                # 게시 이력 관리 (중복 방지)
│   ├── router.js               # 키워드 라우터 (제거 예정)
│   └── auth/
│       └── token-store.js      # AES-256-GCM 토큰 암호화 저장소
│
├── scripts/
│   ├── post_to_slack.sh        # Slack 메시지 게시 (bash)
│   ├── upload_to_slack.sh      # Slack 파일 업로드 (bash)
│   ├── read_email.js           # IMAP CLI 래퍼 (작성 필요)
│   └── jira_query.js           # Jira CLI 래퍼 (작성 필요)
│
├── config/
│   └── sources.json            # 뉴스 소스 6개
└── state/
    ├── posted_articles.json    # 게시 이력
    └── tokens.json             # 암호화된 사용자 토큰 (git 미추적)
```
