# Slack Message Format Template

Use this template when formatting each article for Slack posting.
The message should be sent as a JSON payload to the Slack webhook.

## Single Article Format

```
🔒 [{{SOURCE_NAME}}] {{TITLE}}
━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 AI 요약:
{{SUMMARY_LINE_1}}
{{SUMMARY_LINE_2}}
{{SUMMARY_LINE_3}}

🏷️ 카테고리: {{CATEGORY}}
🔗 원문: {{URL}}
🕐 발행: {{PUB_DATE}}
━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Field Descriptions

- **SOURCE_NAME**: 출처 이름 (예: 보안뉴스, The Hacker News)
- **TITLE**: 기사 제목 (영문 기사는 원문 제목 유지)
- **SUMMARY**: 한국어 3~5줄 요약. CVE 번호, 버전, 제품명은 원문 그대로 보존
- **CATEGORY**: 취약점 | 사고 | 정책 | 분석 | 익스플로잇
- **URL**: 원문 기사 URL
- **PUB_DATE**: 발행일 (YYYY-MM-DD 형식)

## Slack JSON Payload Example

```json
{
  "text": "🔒 [The Hacker News] Critical RCE Vulnerability in Apache Struts\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n📝 AI 요약:\nApache Struts에서 원격 코드 실행(RCE) 취약점 CVE-2026-XXXX이 발견됨.\n공격자가 특수 조작된 요청을 통해 서버에서 임의 코드를 실행할 수 있음.\nApache Struts 2.5.33 이상으로 즉시 업데이트 필요.\n\n🏷️ 카테고리: 취약점\n🔗 원문: https://thehackernews.com/2026/03/apache-struts-rce.html\n🕐 발행: 2026-03-30\n━━━━━━━━━━━━━━━━━━━━━━━━━━"
}
```
