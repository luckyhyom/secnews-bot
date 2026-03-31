# SecNews Bot 설정 및 운영 가이드

Slack 기반 멀티 에이전트 봇. 보안 뉴스 자동 수집, Jira 자료 관리, Email 관리를 하나의 봇으로 처리한다.
LLM 백엔드를 Claude Code / Ollama 간 자유롭게 전환할 수 있다.

---

## 아키텍처

```
Slack 멘션 → bot.js (Socket Mode)
                │
                ├─ 프롬프트 라우터 (src/router.js)
                │   ├─ 뉴스 의도 → 보안 뉴스 에이전트
                │   ├─ Jira 의도 → Jira 에이전트
                │   ├─ Email 의도 → Email 에이전트
                │   └─ 기타 → 일반 대화
                │
                ├─ LLM_PROVIDER=claude-code
                │   └─ spawn("claude") → MCP 도구 포함 전체 기능
                │
                └─ LLM_PROVIDER=ollama
                    └─ Node.js가 API 호출 → LLM은 분석/요약만
                        ├─ JiraAgent → Jira REST API → LLM 요약
                        ├─ EmailAgent → Gmail API → LLM 요약
                        └─ llm.complete() → 일반 대화

별도 실행:
  node run.js → 뉴스 파이프라인 (RSS 수집 → LLM 요약 → Slack 게시)
```

---

## 프로젝트 구조

```
secnews-bot/
├── bot.js                        # Slack 대화형 봇 (프롬프트 라우터 포함)
├── run.js                        # 뉴스 파이프라인 CLI 엔트리 포인트
├── CLAUDE.md                     # Claude Code Agent 지시사항
├── spec.md                       # PRD (프로젝트 요구사항 문서)
├── tasks.md                      # 작업 체크리스트
├── .mcp.json                     # MCP 서버 설정 (Atlassian 등)
├── src/
│   ├── router.js                 # 의도 분류 라우터
│   ├── pipeline.js               # 뉴스 파이프라인 오케스트레이터
│   ├── state.js                  # 게시 이력 상태 관리
│   ├── llm/
│   │   ├── index.js              # createProvider() 팩토리
│   │   ├── claude-code.js        # Claude Code CLI 프로바이더
│   │   └── ollama.js             # Ollama REST API 프로바이더
│   ├── collectors/
│   │   └── rss.js                # RSS/Atom 피드 파서
│   ├── analyzers/
│   │   └── summarizer.js         # 기사 요약 + 심각도/카테고리 분류
│   ├── publishers/
│   │   └── slack.js              # Slack 게시 + 메시지 포맷
│   ├── connectors/
│   │   ├── jira.js               # Jira REST API 클라이언트
│   │   └── gmail.js              # Gmail API 클라이언트
│   ├── agents/
│   │   ├── jira-prompt.js        # Jira 시스템 프롬프트
│   │   ├── jira.js               # Jira 에이전트 (Ollama용 오케스트레이터)
│   │   ├── email-prompt.js       # Email 시스템 프롬프트
│   │   └── email.js              # Email 에이전트 (Ollama용 오케스트레이터)
│   └── auth/
│       ├── token-store.js        # 사용자별 OAuth 토큰 암호화 저장소
│       └── oauth-flow.js         # Gmail OAuth 2.0 인증 플로우
├── config/
│   └── sources.json              # 뉴스 소스 정의 (6개)
├── state/
│   ├── posted_articles.json      # 게시 이력 (git 추적)
│   └── tokens.json               # OAuth 토큰 (git 미추적, 암호화)
├── scripts/
│   └── post_to_slack.sh          # Slack 게시 셸 스크립트 (레거시)
└── .env                          # 환경변수 (git 미추적)
```

---

## 사전 요구사항

- **Node.js** 18 이상
- **Claude Code CLI** — `npm install -g @anthropic-ai/claude-code` 후 `claude` 실행하여 인증
- **Ollama** (선택) — https://ollama.com 에서 설치 후 모델 다운로드

```bash
# Ollama 사용시 모델 다운로드 예시
ollama pull qwen3:32b
```

---

## 환경변수 설정

`.env` 파일에 필요한 변수를 설정한다.

### 필수 (Slack)

```bash
SLACK_BOT_TOKEN=xoxb-...          # Bot User OAuth Token
SLACK_CHANNEL_ID=C0501F6DJ57      # 뉴스 게시 대상 채널 ID
SLACK_APP_TOKEN=xapp-...          # App-Level Token (Socket Mode)
```

### LLM 프로바이더

```bash
LLM_PROVIDER=claude-code          # claude-code | ollama (기본: claude-code)
```

### Ollama 전용 (LLM_PROVIDER=ollama 일 때)

```bash
OLLAMA_BASE_URL=http://localhost:11434   # Ollama 서버 주소
OLLAMA_MODEL=qwen3:32b                   # 사용할 모델
```

### Jira 연동 (선택)

```bash
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your-api-token
```

### Email 연동 (선택)

```bash
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
OAUTH_REDIRECT_PORT=3000                 # OAuth 콜백 포트 (기본: 3000)
TOKEN_ENCRYPTION_KEY=64자hex문자열        # 토큰 암호화 키 (32바이트)
```

암호화 키 생성:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Slack 앱 설정

### 1. 앱 생성

https://api.slack.com/apps → **Create New App** → From scratch

### 2. Socket Mode 활성화

**Settings → Socket Mode** → Enable Socket Mode ON

### 3. App-Level Token 생성

**Settings → Basic Information → App-Level Tokens** → Generate Token and Scopes
- 토큰 이름: `socket-mode`
- Scope: `connections:write`
- **Generate** → `xapp-...` 토큰을 `.env`의 `SLACK_APP_TOKEN`에 설정

### 4. Event Subscriptions

**Features → Event Subscriptions** → Enable Events ON

Subscribe to bot events:
- `app_mention` — 채널에서 멘션 수신
- `message.im` — DM 수신 (선택)

### 5. Bot Token Scopes

**Features → OAuth & Permissions → Bot Token Scopes**:
- `app_mentions:read`
- `chat:write`
- `channels:history`
- `im:history` (선택)

### 6. 앱 설치

스코프 변경 후 **Reinstall to Workspace** → `xoxb-...` 토큰을 `.env`의 `SLACK_BOT_TOKEN`에 설정

---

## LLM 프로바이더 설정

`.env`에서 `LLM_PROVIDER` 한 줄만 바꾸면 전환된다.

### Claude Code 모드 (기본)

```bash
LLM_PROVIDER=claude-code
```

- Claude Code CLI가 설치되어 있어야 한다
- MCP 도구 사용 가능 (Jira MCP, 파일 접근 등)
- 세션 기반 대화 유지 (스레드별 맥락 보존)
- 클라우드 API 비용 발생

### Ollama 모드

```bash
LLM_PROVIDER=ollama
OLLAMA_MODEL=qwen3:32b
```

- Ollama가 로컬에서 실행 중이어야 한다 (`ollama serve`)
- Node.js가 직접 API를 호출하고 LLM은 분석/요약만 수행
- API 비용 없음 (GPU 전력만 소비)
- MCP 미지원 — Node.js 코드가 Jira/Gmail API를 직접 호출

### 프로바이더별 동작 차이

| 기능 | Claude Code | Ollama |
|------|:---:|:---:|
| 일반 대화 | CLI 세션 (맥락 유지) | 단발성 응답 |
| 뉴스 수집 | CLI 내장 도구 사용 가능 | Node.js 코드로 처리 |
| Jira 검색 | MCP 도구로 직접 호출 | Node.js → Jira API → LLM 요약 |
| Email 조회 | MCP 도구로 직접 호출 | Node.js → Gmail API → LLM 요약 |
| 한국어 품질 | 우수 | 모델에 따라 다름 |
| 비용 | 클라우드 API 과금 | 무료 |

---

## 실행 방법

### 대화형 봇

```bash
# Claude Code 모드
npm start

# Ollama 모드
LLM_PROVIDER=ollama npm start

# 백그라운드 실행
nohup node bot.js &
```

실행 후 Slack에서 `@봇이름 안녕하세요`로 테스트.

### 뉴스 파이프라인

```bash
# 기본 실행 (Claude Code)
npm run pipeline

# Ollama로 실행
npm run pipeline:ollama

# 게시 없이 테스트 (콘솔 출력만)
npm run pipeline:dry

# CLI 옵션 직접 지정
node run.js --provider=ollama --model=exaone3.5:32b --dry-run
```

### 자동 테스트

```bash
npm test
```

---

## 에이전트 사용법

봇에게 멘션하면 라우터가 키워드를 분석하여 적절한 에이전트로 연결한다.

### 보안 뉴스

키워드: `뉴스`, `보안`, `수집`, `기사`, `최신`

```
@봇 최근 보안 뉴스 알려줘
@봇 오늘 보안 기사 수집해줘
```

### Jira

키워드: `지라`, `jira`, `이슈`, `스프린트`, `티켓`, `보드`

```
@봇 PROJ-123 이슈 상태 알려줘
@봇 지라에서 긴급 이슈 검색해줘
@봇 이번 스프린트 진행 현황
@봇 보안팀 미해결 버그 알려줘
```

### Email

키워드: `메일`, `이메일`, `email`, `받은편지함`

```
@봇 안 읽은 메일 요약해줘
@봇 김철수한테 온 이메일 확인해줘
@봇 이번 주 받은 메일 정리해줘
```

### 일반 대화

위 키워드에 해당하지 않으면 일반 대화로 처리된다.

```
@봇 안녕하세요
@봇 이 코드 리뷰해줘
```

---

## Jira 연동 설정

### 1. API Token 발급

https://id.atlassian.com/manage-profile/security/api-tokens → **Create API token**

### 2. 환경변수 설정

```bash
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=발급받은-토큰
```

### 3. MCP 서버 설정 (Claude Code 모드)

`.mcp.json`은 이미 설정되어 있다. 환경변수만 `.env`에 추가하면 Claude Code가 Jira MCP 도구를 자동으로 로드한다.

### 4. 동작 확인

```
@봇 지라에서 최근 이슈 검색해줘
```

---

## Email 연동 설정

IMAP 표준 프로토콜 기반으로 Gmail, 메일플러그, 네이버, Outlook 등 모든 IMAP 서비스를 지원한다.

### 1. 환경변수 설정

토큰 암호화 키만 필요하다 (Google OAuth 설정 불필요):

```bash
TOKEN_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

### 2. 앱 비밀번호 발급

각 메일 서비스별로 앱 비밀번호를 발급받아야 한다:

- **Gmail**: https://myaccount.google.com/apppasswords (2단계 인증 필요)
- **네이버**: 네이버 메일 → 환경설정 → POP3/IMAP → 앱 비밀번호
- **메일플러그**: 관리자 페이지 → 보안 → 앱 비밀번호

### 3. Slack에서 이메일 연동

봇에게 멘션으로 IMAP 서버, 이메일, 앱 비밀번호를 전달한다:

```
@봇 connect-email
→ 봇이 사용법 안내 (IMAP 서버, 이메일, 앱 비밀번호 형식)

@봇 connect-email imap.gmail.com user@gmail.com xxxx-xxxx-xxxx-xxxx
→ "✅ 이메일 연동 완료!" 메시지 수신
→ 봇이 원본 메시지 삭제 시도 (비밀번호 노출 방지)
```

주요 IMAP 서버 주소:

| 서비스 | IMAP 서버 |
|--------|----------|
| Gmail | `imap.gmail.com` |
| 네이버 | `imap.naver.com` |
| 메일플러그 | `imap.mailplug.co.kr` |
| Outlook | `outlook.office365.com` |

**주의**: 비밀번호가 Slack 채팅에 노출되므로, DM으로 봇에게 보내는 것을 권장한다. 봇은 원본 메시지 삭제를 시도하지만, 권한이 없으면 수동 삭제 안내를 한다.

각 Slack 사용자가 개별적으로 인증하며, 토큰은 AES-256-GCM으로 암호화되어 `state/tokens.json`에 저장된다.

### 4. 동작 확인

```
@봇 안 읽은 메일 요약해줘
```

---

## 동작 방식 상세

### 프롬프트 라우터

`src/router.js`가 멘션 텍스트에서 키워드를 매칭하여 의도를 분류한다. LLM 호출 없이 작동하므로 비용과 지연이 없다.

```
"지라 이슈 검색" → intent: jira
"메일 확인"      → intent: email
"보안 뉴스"      → intent: news
"안녕하세요"     → intent: general
```

### 프로바이더 분기

```
Claude Code 모드:
  모든 의도 → runClaude(text, sessionId, systemPrompt)
  → Claude CLI가 시스템 프롬프트에 따라 동작 분기
  → MCP 도구(Jira, Gmail) 직접 사용 가능

Ollama 모드:
  jira 의도   → JiraAgent.handle() → Jira API 호출 → LLM 요약
  email 의도  → EmailAgent.handle() → Gmail API 호출 → LLM 요약
  news 의도   → LLM으로 직접 응답
  general     → LLM으로 직접 응답
```

### 세션 관리 (Claude Code 모드)

| 상황 | 동작 |
|------|------|
| 새 멘션 | 새 Claude Code 세션 생성 |
| 같은 스레드에서 멘션 | 기존 세션 resume (맥락 유지) |
| 다른 스레드에서 멘션 | 별도 세션 생성 |
| 봇 재시작 | 세션 매핑 초기화 |

Ollama 모드에서는 세션 관리가 없으며, 매 요청이 독립적으로 처리된다.

---

## 보안 주의사항

### 권한 모드 (Claude Code)

`bot.js`의 `runClaude`에서 `--permission-mode` 옵션으로 봇의 권한을 제어할 수 있다.

| 모드 | 설명 |
|------|------|
| `default` | 매 도구 호출마다 승인 필요 (봇에서는 사용 불가) |
| `acceptEdits` | 파일 읽기/쓰기 허용, bash 명령은 제한 |
| `bypassPermissions` | 모든 권한 허용 |

`bypassPermissions` 사용시 Slack 채널에 접근 가능한 모든 사용자가 로컬 명령을 실행할 수 있으므로 비공개 채널에서만 사용할 것.

### 토큰 관리

| 토큰 | 저장 위치 | 보안 |
|------|----------|------|
| Slack Bot Token | `.env` | git 미추적 |
| Jira API Token | `.env` | git 미추적 |
| Gmail OAuth 토큰 | `state/tokens.json` | AES-256-GCM 암호화, git 미추적 |

### 채널별 정보 노출

- 공개 채널: 이슈 제목/상태, 메일 건수 수준만 응답
- DM: 상세 내용 포함 응답
- 시스템 프롬프트에 보안 규칙이 포함되어 있으나, LLM의 판단에 의존하므로 민감 데이터는 DM 전용 채널 사용 권장

---

## 다중 GitHub 계정 SSH 설정 (참고)

여러 GitHub 계정으로 push해야 하는 경우:

```bash
# 계정별 SSH 키 생성
ssh-keygen -t ed25519 -f ~/.ssh/id_계정명 -C "계정명" -N ""

# ~/.ssh/config 설정
Host github-계정명
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_계정명

# 레포 remote URL 변경
git remote set-url origin git@github-계정명:계정명/repo.git
```

각 공개키를 해당 GitHub 계정의 Settings → SSH Keys에 등록.
