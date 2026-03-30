# SecNews Bot — Agent Instructions

## Mission

보안 뉴스 6개 소스에서 최신 기사를 수집하고, AI 한국어 요약을 생성하여 Slack 채널에 자동 게시한다.

## Execution Steps

아래 단계를 순서대로 실행한다.

### Step 1: 설정 로드

```
config/sources.json → 뉴스 소스 목록 로드
state/posted_articles.json → 이미 게시한 기사 목록 로드
```

### Step 2: 기사 수집

각 소스에 대해:
1. WebFetch로 RSS 피드 또는 웹 페이지를 가져온다
2. RSS 소스: XML에서 `<item>` 또는 `<entry>` 요소 추출
3. Web 소스: HTML에서 기사 목록 추출 (제목, URL, 날짜)
4. 각 기사에서 추출할 정보: **title**, **url**, **pubDate**, **description**

### Step 3: 중복 필터링

1. 각 기사 URL의 SHA-256 해시 앞 8자리를 `url_hash`로 생성
2. `posted_articles.json`에서 해당 `url_hash` 존재 여부 확인
3. 이미 존재하면 → 건너뛰기 (중복)
4. 존재하지 않으면 → 새 기사로 처리

### Step 4: AI 요약 생성

새 기사마다:
1. 한국어 요약 생성 (3~5줄)
2. 카테고리 분류: `취약점` | `사고` | `정책` | `분석` | `익스플로잇`
3. 아래 요약 규칙을 반드시 준수

### Step 5: Slack 게시

1. `templates/slack_message.md` 형식에 맞춰 메시지 포맷팅
2. Slack Bot Token과 Channel ID를 환경변수 또는 `.env`에서 읽기
   - `SLACK_BOT_TOKEN`: Bot User OAuth Token (xoxb-...)
   - `SLACK_CHANNEL_ID`: 게시 대상 채널 ID
3. `scripts/post_to_slack.sh`를 사용하여 Slack chat.postMessage API로 게시
4. 소스당 최대 5개 기사만 게시
5. 게시 간 1초 대기 (Slack rate limit 준수)

Slack 게시 명령:
```bash
./scripts/post_to_slack.sh "🔒 [출처명] 기사 제목
━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 AI 요약:
요약 내용 3~5줄

🏷️ 카테고리: 분류
🔗 원문: URL
🕐 발행: YYYY-MM-DD
━━━━━━━━━━━━━━━━━━━━━━━━━━"
```

### Step 6: 상태 업데이트

1. 게시한 기사들을 `posted_articles.json`에 추가:
   ```json
   {
     "url_hash": "a1b2c3d4",
     "title": "기사 제목",
     "posted_at": "2026-03-30T09:00:00Z"
   }
   ```
2. `last_updated` 타임스탬프 갱신
3. 소스당 500개 초과시 오래된 항목부터 제거 (pruning)

### Step 7: Git 커밋

```bash
git add state/posted_articles.json
git commit -m "chore(state): update posted articles [YYYY-MM-DD HH:MM]"
git push
```

## Summary Guidelines (요약 규칙)

- **언어**: 한국어 (영문 기사는 번역)
- **길이**: 3~5줄
- **필수 포함**: 핵심 영향, 영향받는 시스템/소프트웨어, 필요한 조치
- **원문 보존**: CVE 번호, 버전 번호, 제품명은 절대 번역하지 않음
- **톤**: 전문적, 사실 기반 — 과장 금지
- **원문 URL**: 항상 포함 (요약만으로 판단하지 말고 원문 확인 유도)

## Error Handling (오류 처리)

- 소스 fetch 실패 → 해당 소스 건너뛰고 나머지 계속 처리
- Slack API 실패 → 오류 로그 남기고 다음 실행에서 재시도
- 중복 기사 → 절대 재게시하지 않음
- JSON 파싱 오류 → 기존 상태 파일 보존, 손상된 데이터 무시
- 기사가 0건인 경우 → 정상 종료 (불필요한 커밋 하지 않음)

## Category Classification (카테고리 분류 기준)

| 카테고리 | 기준 |
|---------|------|
| 취약점 | CVE, 보안 패치, 제로데이, 버그 관련 |
| 사고 | 해킹, 데이터 유출, 랜섬웨어 공격 |
| 정책 | 규제, 법안, 정부 정책, 컴플라이언스 |
| 분석 | 위협 분석, 기술 동향, 보안 연구 |
| 익스플로잇 | PoC 코드, 익스플로잇 DB 업데이트 |

## Important Notes

- 모든 실행은 멱등성(idempotent)을 보장해야 함
- 상태 파일이 유일한 진실의 원천(source of truth)
- 원본 기사를 읽지 않고 AI가 내용을 생성(hallucinate)하면 안 됨
- 기사 본문이 아닌 피드의 description/summary만으로 요약 생성
