const SYSTEM_PROMPT = `당신은 보안 뉴스 분석 전문가입니다. 기사를 분석하여 구조화된 JSON으로 응답합니다.

## 분석 프레임워크
- 무엇이 일어났는가: 사건/취약점/정책의 핵심 내용
- 영향 범위: 영향받는 시스템, 소프트웨어, 조직, 사용자 수
- 심각도: critical/high/medium/low
- 대응 방법: 패치 적용, 설정 변경, 모니터링 등 구체적 조치

## 심각도 기준
- critical: CVSS 9.0+, 실제 공격 진행 중(in-the-wild), CISA KEV 등재, 광범위 영향
- high: CVSS 7.0-8.9, PoC 공개됨, 주요 소프트웨어 영향, 국가 기관 권고
- medium: CVSS 4.0-6.9, 특정 조건에서만 악용 가능, 제한적 영향
- low: 정보성 기사, 동향 분석, 정책 변경 예고

## 카테고리
- 취약점: CVE, 보안 패치, 제로데이, 버그 관련
- 사고: 해킹, 데이터 유출, 랜섬웨어 공격
- 정책: 규제, 법안, 정부 정책, 컴플라이언스
- 분석: 위협 분석, 기술 동향, 보안 연구
- 익스플로잇: PoC 코드, 익스플로잇 DB 업데이트

## 요약 규칙
- 한국어 3~5줄
- CVE 번호, 버전 번호, 제품명은 절대 번역하지 않음
- 전문적, 사실 기반 — 과장 금지
- 원문에 없는 정보를 추가하거나 추측하지 않음`;

const SEVERITY_LABEL = {
  critical: '🔴 긴급',
  high: '🟠 높음',
  medium: '🟡 보통',
  low: '🟢 낮음',
};

/**
 * Summarise a single article via the given LLM provider.
 *
 * @param {import('../llm/index.js').LLMProvider} llm
 * @param {object} article
 * @param {string} bodyText - fetched article body (may be empty)
 * @returns {Promise<{ summary: string, severity: string, severityLabel: string, category: string }>}
 */
export async function summarizeArticle(llm, article, bodyText) {
  const prompt = `다음 보안 기사를 분석하고 JSON으로 응답하세요.

제목: ${article.title}
출처: ${article.sourceName}
URL: ${article.url}
발행일: ${article.pubDate || '불명'}
언어: ${article.language === 'en' ? '영어 (한국어로 요약)' : '한국어'}

본문:
${bodyText || article.description || '본문 없음'}

다음 JSON 형식으로 응답:
{
  "summary": "한국어 요약 3~5줄",
  "severity": "critical|high|medium|low",
  "category": "취약점|사고|정책|분석|익스플로잇"
}`;

  const result = await llm.structured(prompt, { systemPrompt: SYSTEM_PROMPT });

  const severity = result.severity || 'low';

  return {
    summary: result.summary || '요약 생성 실패',
    severity,
    severityLabel: SEVERITY_LABEL[severity] || SEVERITY_LABEL.low,
    category: result.category || '분석',
  };
}
