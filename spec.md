# SecNews Bot — Product Requirement Document

> 보안 뉴스 수집 → AI 한국어 요약 → Slack 자동 게시 파이프라인.
> LLM Provider 추상화를 통해 Claude Code / Ollama 등 로컬 LLM으로 교체 가능한 구조.

## Overview

### Mission

보안 뉴스 6개 소스에서 최신 기사를 수집하고, AI 한국어 요약을 생성하여 Slack 채널에 자동 게시한다.

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Pipeline Orchestrator (src/pipeline.js)                │
│                                                         │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐            │
│  │Collectors│──▶│Analyzers │──▶│Publishers│            │
│  │  (RSS)   │   │(Summarize│   │ (Slack)  │            │
│  └──────────┘   │  via LLM)│   └──────────┘            │
│                 └────┬─────┘                            │
│                      │                                  │
│              ┌───────▼────────┐                         │
│              │  LLM Provider  │                         │
│              │  (추상화 계층)   │                         │
│              └───┬────────┬───┘                         │
│                  │        │                             │
│           ┌──────▼──┐ ┌───▼─────┐                      │
│           │ Claude  │ │ Ollama  │  ← 환경변수로 전환     │
│           │  Code   │ │(로컬LLM)│                       │
│           └─────────┘ └─────────┘                      │
└─────────────────────────────────────────────────────────┘

별도 프로세스:
┌─────────────────────────────────────────────────────────┐
│  Interactive Bot (bot.js)                               │
│  Slack Socket Mode → Claude Code CLI (대화형 세션)       │
└─────────────────────────────────────────────────────────┘
```

### Project Structure

```
secnews-bot/
├── CLAUDE.md                     # Agent instructions (claude-code 모드용)
├── spec.md                       # 이 파일 — PRD
├── run.js                        # 파이프라인 CLI 엔트리 포인트
├── bot.js                        # Slack 대화형 봇 (Socket Mode)
├── src/
│   ├── pipeline.js               # 오케스트레이션 (수집→분석→게시)
│   ├── state.js                  # posted_articles.json 상태 관리
│   ├── llm/
│   │   ├── index.js              # createProvider() 팩토리
│   │   ├── claude-code.js        # Claude Code CLI 프로바이더
│   │   └── ollama.js             # Ollama REST API 프로바이더
│   ├── collectors/
│   │   └── rss.js                # RSS/Atom 피드 파서
│   ├── analyzers/
│   │   └── summarizer.js         # 기사 요약 + 심각도/카테고리 분류
│   └── publishers/
│       └── slack.js              # Slack chat.postMessage + 메시지 포맷
├── config/
│   └── sources.json              # 뉴스 소스 정의 (6개)
├── state/
│   └── posted_articles.json      # 게시 이력 (중복 방지용)
├── scripts/
│   └── post_to_slack.sh          # Slack 게시 셸 스크립트 (레거시)
├── templates/
│   └── slack_message.md          # 메시지 템플릿 참고용
├── .env                          # 시크릿 (SLACK_BOT_TOKEN 등)
├── package.json
└── bot.test.js                   # 봇 세션 테스트
```

---

## 운영 모드

### Mode A: Node.js Pipeline (`run.js`)

오케스트레이션을 Node.js 코드가 담당하고, LLM은 요약 생성만 수행한다.
로컬 LLM 전환이 가능한 모드.

```bash
# Claude Code 백엔드
npm run pipeline

# Ollama 백엔드
npm run pipeline:ollama

# 게시 없이 테스트
npm run pipeline:dry

# CLI 옵션
node run.js --provider=ollama --model=exaone3.5:32b --dry-run
```

**환경변수:**

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `LLM_PROVIDER` | `claude-code` | LLM 프로바이더 선택 |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama 서버 주소 |
| `OLLAMA_MODEL` | `qwen3:32b` | Ollama 모델명 |
| `SLACK_BOT_TOKEN` | — | Slack Bot Token (xoxb-...) |
| `SLACK_CHANNEL_ID` | — | 게시 대상 채널 ID |

### Mode B: Claude Code Agent (`CLAUDE.md`)

Claude Code가 모든 단계를 자율 수행한다. WebSearch/WebFetch 등 내장 도구를 활용하며,
websearch 타입 소스도 처리 가능.

```bash
claude -p "CLAUDE.md의 지시에 따라 보안 뉴스 수집 파이프라인을 실행해줘"
```

### Mode C: Interactive Bot (`bot.js`)

Slack에서 멘션으로 대화형 질의. Claude Code CLI를 세션 기반으로 호출.

```bash
npm start
```

---

## LLM Provider 추상화

모든 프로바이더는 두 가지 메서드를 구현한다:

```javascript
interface LLMProvider {
  complete(prompt: string, options?: CompletionOptions): Promise<string>
  structured(prompt: string, options?: CompletionOptions): Promise<object>
}
```

| 프로바이더 | 장점 | 단점 | 적합한 용도 |
|-----------|------|------|-----------|
| **claude-code** | 높은 한국어 품질, 도구 사용 | 클라우드 의존, 비용 | 프로덕션, 고품질 요약 |
| **ollama** | 무료, 로컬 실행, 데이터 보안 | 품질 편차, GPU 필요 | 개발/테스트, 비용 절감 |

### 향후 확장: SCOUT+CRITIC 하이브리드

```
SCOUT (로컬 LLM) → 1차 분류/필터링 → 🟡🟢만 처리
                                      🟠🔴 → CRITIC (클라우드) → 정밀 분석
```

---

## 뉴스 소스

| # | 소스 | 타입 | 언어 | 분류 |
|---|------|------|------|------|
| 1 | 보안뉴스 | RSS | KR | 국내 보안 정책/사건 |
| 2 | 데일리시큐 | RSS | KR | 해킹/악성코드 |
| 3 | The Hacker News | RSS | EN | 글로벌 위협 |
| 4 | BleepingComputer | RSS | EN | 랜섬웨어/인프라 |
| 5 | KISA 보호나라 | WebSearch | KR | 공식 보안 권고 |
| 6 | Exploit Database | RSS | EN | PoC/익스플로잇 |

---

## 파이프라인 흐름

```
1. config/sources.json 로드
2. state/posted_articles.json 로드
3. 소스별 RSS 피드 수집 (fetchRSS)
4. 필터링: 마지막 실행 이후 기사만, 중복 제거 (url_hash)
5. 기사별:
   a. 원문 본문 fetch (fetchArticleBody) — 실패시 description 폴백
   b. LLM으로 요약 + 심각도 + 카테고리 생성 (summarizeArticle)
   c. Slack 메시지 포맷팅 (formatSlackMessage)
   d. Slack 게시 (postToSlack) — 소스당 최대 5개, 1초 간격
6. posted_articles.json 업데이트 + 저장
```

---

## Slack 메시지 형식

```
🔒 [출처명] 기사 제목
━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 심각도: 🔴 긴급

📝 AI 요약:
요약 내용 3~5줄. 영향 범위와 대응 방법 포함.

🏷️ 카테고리: 분류
🔗 원문: URL
🕐 발행: YYYY-MM-DD
━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 심각도 분류

| 심각도 | 기준 |
|--------|------|
| 🔴 긴급 | CVSS 9.0+, in-the-wild 공격, CISA KEV, 광범위 영향 |
| 🟠 높음 | CVSS 7.0-8.9, PoC 공개, 주요 SW, 국가 기관 권고 |
| 🟡 보통 | CVSS 4.0-6.9, 조건부 악용, 제한적 영향 |
| 🟢 낮음 | 정보성, 동향, 정책 예고 |

---

## 오류 처리

| 오류 | 대응 |
|------|------|
| RSS fetch 실패 | 해당 소스 건너뛰고 계속 |
| 원문 fetch 실패 | description만으로 요약 (폴백) |
| LLM 호출 실패 | 해당 기사 건너뛰고 계속 |
| Slack API 실패 | 에러 로그 후 다음 실행에서 재시도 |
| 0건 수집 | 정상 종료 (상태 파일 미변경) |

---

## 향후 계획

### 단기

- [ ] SCOUT+CRITIC 하이브리드 프로바이더 구현
- [ ] websearch 소스 로컬 지원 (SearXNG 연동)
- [ ] 파이프라인 단위 테스트 추가

### 중기 — Slack 에이전트 확장

- [ ] **Jira 관리 에이전트**: 이슈 조회/생성, 스프린트 리포트 (MCP 기반)
- [ ] **Email 관리 에이전트**: 미읽은 메일 요약, 분류 (Gmail MCP 기반)
- [ ] 프롬프트 라우터: 멘션 텍스트 의도 분류 → 적절한 에이전트 디스패치

### 장기

- [ ] 멀티 채널 배포 (X/Twitter, 블로그)
- [ ] 기사 트렌드 분석 대시보드
- [ ] 로컬 LLM 전용 경량 모드 (GPU 없이 CPU 추론)
