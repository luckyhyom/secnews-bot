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

### Step 2: 기사 수집 (하이브리드 전략)

소스별로 최적의 수집 방법을 사용한다:

**방법 A — RSS 피드 (type: "rss"인 소스)**
1. WebFetch로 RSS 피드 URL을 가져온다
2. XML에서 `<item>` 또는 `<entry>` 요소 추출
3. 각 기사에서 추출: **title**, **url**, **pubDate**, **description**

**방법 B — WebSearch (type: "scrape"인 소스 또는 RSS 실패시 폴백)**
1. WebSearch로 `site:{사이트도메인} 보안` 등의 쿼리를 실행
2. 검색 결과에서 기사 목록 추출 (제목, URL, 날짜)
3. RSS가 실패한 소스에 대해서도 WebSearch를 폴백으로 사용

**수집 우선순위**: RSS → WebSearch → WebFetch(HTML 스크래핑)

### Step 3: 중복 필터링

1. 각 기사 URL의 SHA-256 해시 앞 8자리를 `url_hash`로 생성
2. `posted_articles.json`에서 해당 `url_hash` 존재 여부 확인
3. 이미 존재하면 → 건너뛰기 (중복)
4. 존재하지 않으면 → 새 기사로 처리

### Step 4: 원문 수집 및 AI 요약 생성

새 기사마다:

**4-1. 원문 본문 수집**
- WebFetch로 기사 원문 페이지를 가져온다
- 본문 텍스트를 추출한다 (기사 내용만, 광고/메뉴 제외)
- WebFetch 실패시 RSS description만으로 요약 생성 (폴백)

**4-2. 구조화 분석**
아래 프레임워크에 따라 기사를 분석한다:

| 항목 | 설명 |
|------|------|
| **무엇이 일어났는가** | 사건/취약점/정책의 핵심 내용 |
| **영향 범위** | 영향받는 시스템, 소프트웨어, 조직, 사용자 수 |
| **심각도** | 🔴 긴급 / 🟠 높음 / 🟡 보통 / 🟢 낮음 (아래 기준 참고) |
| **대응 방법** | 패치 적용, 설정 변경, 모니터링, 업데이트 등 구체적 조치 |

**4-3. 한국어 요약 생성**
- 위 분석 결과를 바탕으로 3~5줄 한국어 요약 작성
- 카테고리 분류: `취약점` | `사고` | `정책` | `분석` | `익스플로잇`
- 아래 요약 규칙을 반드시 준수

### Step 5: Slack 게시

1. 아래 메시지 형식에 맞춰 포맷팅
2. Slack Bot Token과 Channel ID를 환경변수 또는 `.env`에서 읽기
   - `SLACK_BOT_TOKEN`: Bot User OAuth Token (xoxb-...)
   - `SLACK_CHANNEL_ID`: 게시 대상 채널 ID
3. `scripts/post_to_slack.sh`를 사용하여 Slack chat.postMessage API로 게시
4. 소스당 최대 5개 기사만 게시
5. 게시 간 1초 대기 (Slack rate limit 준수)

Slack 메시지 형식:
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

## Severity Classification (심각도 판별 기준)

| 심각도 | 기준 | 예시 |
|--------|------|------|
| 🔴 긴급 | CVSS 9.0+, 실제 공격 진행 중(in-the-wild), CISA KEV 등재, 광범위 영향 | CVE with active exploitation, 대규모 데이터 유출 |
| 🟠 높음 | CVSS 7.0-8.9, PoC 공개됨, 주요 소프트웨어 영향, 국가 기관 권고 | KISA 긴급 패치 권고, 주요 플랫폼 취약점 |
| 🟡 보통 | CVSS 4.0-6.9, 특정 조건에서만 악용 가능, 제한적 영향 | 특정 플러그인 취약점, 조건부 공격 |
| 🟢 낮음 | 정보성 기사, 동향 분석, 정책 변경 예고 | 보안 컨퍼런스 소식, 산업 동향 |

심각도 판별 우선순위:
1. CVSS 점수가 명시되어 있으면 해당 점수 기준 적용
2. "actively exploited", "in the wild", "실제 공격" 표현이 있으면 최소 🟠 높음
3. CISA KEV, KISA 긴급 권고 등 공식 기관 경보 시 🔴 긴급
4. 영향받는 시스템 수가 10만 이상이면 한 단계 상향

## Summary Guidelines (요약 규칙)

- **언어**: 한국어 (영문 기사는 번역)
- **길이**: 3~5줄
- **필수 포함**: 핵심 영향, 영향받는 시스템/소프트웨어, 필요한 조치
- **원문 보존**: CVE 번호, 버전 번호, 제품명은 절대 번역하지 않음
- **톤**: 전문적, 사실 기반 — 과장 금지
- **원문 URL**: 항상 포함 (요약만으로 판단하지 말고 원문 확인 유도)
- **출처 명시**: 원문에 없는 정보를 추가하거나 추측하지 않음

## Summary Examples (요약 예시)

### 좋은 예시 — 취약점

```
🔒 [The Hacker News] Citrix NetScaler Under Active Recon for CVE-2026-3055 (CVSS 9.3)
━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 심각도: 🔴 긴급

📝 AI 요약:
Citrix NetScaler ADC 및 Gateway에서 메모리 오버리드 취약점 CVE-2026-3055(CVSS 9.3)이 발견됨.
입력값 검증 부족으로 인해 공격자가 민감한 메모리 데이터를 읽을 수 있으며, 현재 활발한 정찰 활동이 감지됨.
영향받는 버전을 사용하는 조직은 Citrix 보안 업데이트를 즉시 적용해야 함.

🏷️ 카테고리: 취약점
🔗 원문: https://thehackernews.com/2026/03/citrix-netscaler...
🕐 발행: 2026-03-28
━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 좋은 예시 — 사고

```
🔒 [BleepingComputer] FBI confirms hack of Director Patel's personal email inbox
━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 심각도: 🟠 높음

📝 AI 요약:
이란 연계 해커 그룹 Handala가 FBI 국장 Kash Patel의 개인 이메일을 침해하여
2010-2019년 사이의 사진과 문서를 공개함.
이번 공격은 심리전과 파괴적 사이버 공격을 결합한 새로운 패턴을 보여주며,
고위 공직자의 개인 계정 보안 강화 필요성을 재확인시킴.

🏷️ 카테고리: 사고
🔗 원문: https://www.bleepingcomputer.com/news/security/fbi-confirms...
🕐 발행: 2026-03-29
━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 나쁜 예시 (이렇게 하지 말 것)

```
❌ "최근 심각한 보안 위협이 발생했습니다..." → 구체적이지 않음
❌ "CVE-2026-3055는 매우 위험합니다" → 과장, 구체적 영향 미기재
❌ "Citrix 넷스케일러..." → 제품명 번역하면 안 됨 (NetScaler 유지)
❌ 원문에 없는 공격 시나리오를 추가로 서술 → 허위 정보 생성
```

## Error Handling (오류 처리)

- RSS fetch 실패 → WebSearch로 폴백, 그래도 실패시 건너뛰고 계속
- WebSearch 실패 → 해당 소스 건너뛰고 나머지 계속 처리
- 원문 WebFetch 실패 → RSS description만으로 요약 생성 (폴백)
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
- 가능하면 원문 본문을 WebFetch로 가져와서 요약의 근거로 사용
- WebFetch 실패시에만 RSS description/summary로 폴백
