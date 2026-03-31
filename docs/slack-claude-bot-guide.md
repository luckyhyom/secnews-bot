# Slack Claude Code Bot 설정 가이드

Slack 채널에서 `@봇이름`으로 멘션하면 로컬 Claude Code를 호출하여 대화하는 봇.

## 프로젝트 구조

```
secnews-bot/
├── CLAUDE.md                  # Claude Code Agent 지시사항
├── spec.md                    # 보안뉴스 파이프라인 스펙
├── tasks.md                   # 작업 체크리스트
├── bot.js                     # Slack 대화형 봇 (Socket Mode + Claude Code)
├── bot.test.js                # 봇 기능 테스트 (세션 생성/유지 검증)
├── package.json               # Node.js 의존성
├── .env                       # 환경변수 (git 추적 안 됨)
├── config/
│   └── sources.json           # 뉴스 소스 설정 (6개)
├── state/
│   └── posted_articles.json   # 게시 이력 (중복 방지)
├── scripts/
│   └── post_to_slack.sh       # Slack API 호출 스크립트
└── templates/
    └── slack_message.md       # 뉴스 메시지 포맷 템플릿
```

## 아키텍처

```
Slack 멘션 → Socket Mode → 로컬 Node.js (bot.js)
                                  ↓
                           claude -p --resume <session_id>
                                  ↓
                           Claude Code 응답 → Slack 스레드 회신
```

- **스레드 단위 세션 유지**: Slack thread_ts ↔ Claude Code session_id 매핑
- **대화 맥락 유지**: 같은 스레드 내에서 이전 대화를 기억
- **새 스레드 = 새 세션**: 독립된 컨텍스트

## 사전 요구사항

- Node.js 18+
- Claude Code CLI (`npm install -g @anthropic-ai/claude-code`)
- Claude Code 로그인 완료 (`claude` 실행 후 인증)
- Slack 앱 생성 완료

## 1단계: Slack 앱 설정

### 앱 생성
https://api.slack.com/apps 에서 새 앱 생성 (From scratch)

### Socket Mode 활성화
- **Settings → Socket Mode** → Enable Socket Mode ON

### App-Level Token 생성
- **Settings → Basic Information → App-Level Tokens**
- **Generate Token and Scopes** 클릭
- 토큰 이름: `socket-mode`
- Scope: `connections:write` 추가
- **Generate** → `xapp-...` 토큰 복사

### Event Subscriptions 설정
- **Features → Event Subscriptions** → Enable Events ON
- **Subscribe to bot events** 에서 추가:
  - `app_mention` — 채널에서 멘션 수신
  - `message.im` — DM 수신 (선택)
- **Save Changes**

### Bot Token Scopes 설정
- **Features → OAuth & Permissions → Bot Token Scopes**:
  - `app_mentions:read` — 멘션 읽기
  - `chat:write` — 메시지 보내기
  - `channels:history` — 채널 히스토리 읽기
  - `im:history` — DM 히스토리 읽기 (선택)

### 앱 설치
- 스코프 변경 후 **Reinstall to Workspace** 클릭
- **OAuth & Permissions** 페이지에서 `xoxb-...` Bot Token 확인

## 2단계: 환경변수 설정

`.env` 파일 생성:

```bash
SLACK_BOT_TOKEN=xoxb-...          # Bot User OAuth Token
SLACK_CHANNEL_ID=C0501F6DJ57      # 대상 채널 ID
SLACK_APP_TOKEN=xapp-...          # App-Level Token (Socket Mode)
```

## 3단계: 설치 및 실행

```bash
# 의존성 설치
npm install

# 봇 실행
npm start

# 백그라운드 실행
node bot.js &
```

## 4단계: 테스트

### 자동 테스트
```bash
npm test
```

검증 항목:
- 새 세션 생성 및 응답 반환
- `--resume`으로 세션 이어가기 (이전 맥락 기억 확인)

### Slack에서 수동 테스트
1. 채널에서 `@봇이름 안녕하세요` 멘션
2. "생각 중..." 표시 후 응답 확인
3. 같은 스레드에서 `@봇이름 방금 뭐라고 했지?` → 맥락 유지 확인

## 동작 방식

### 세션 관리
| 상황 | 동작 |
|------|------|
| 새 멘션 (채널) | 새 Claude Code 세션 생성 |
| 같은 스레드에서 멘션 | 기존 세션 resume (맥락 유지) |
| 다른 스레드에서 멘션 | 별도 새 세션 생성 |
| 봇 재시작 | 매핑 초기화 (세션 데이터는 로컬에 잔존) |

### 제한사항
- 로컬 서버가 항상 가동되어야 함
- 봇 재시작 시 thread ↔ session 매핑 초기화
- Claude Code 세션은 로컬(`~/.claude/`)에 저장되며 자동 정리됨
- 오래된 스레드에서 대화 재개 시 세션이 만료되었을 수 있음

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

각 공개키(`~/.ssh/id_계정명.pub`)를 해당 GitHub 계정의 Settings → SSH Keys에 등록.
