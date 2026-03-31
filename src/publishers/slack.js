/**
 * Slack chat.postMessage API로 메시지를 게시한다.
 *
 * @param {string} text - 게시할 메시지 텍스트
 * @param {object} [options]
 * @param {string} [options.token] - Slack Bot Token (기본: 환경변수)
 * @param {string} [options.channel] - 채널 ID (기본: 환경변수)
 */
export async function postToSlack(text, options = {}) {
  const token = options.token || process.env.SLACK_BOT_TOKEN;
  const channel = options.channel || process.env.SLACK_CHANNEL_ID;

  if (!token) throw new Error('SLACK_BOT_TOKEN이 설정되지 않았습니다');
  if (!channel) throw new Error('SLACK_CHANNEL_ID가 설정되지 않았습니다');

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ channel, text }),
  });

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Slack API 오류: ${data.error}`);
  }
  return data;
}

/**
 * 기사와 분석 결과를 Slack 메시지 형식으로 포맷한다.
 *
 * @param {object} article - 기사 정보
 * @param {object} analysis - 분석 결과 (summary, severityLabel, category)
 * @returns {string} 포맷된 Slack 메시지
 */
export function formatSlackMessage(article, analysis) {
  const pubDate = article.pubDate
    ? new Date(article.pubDate).toISOString().split('T')[0]
    : '불명';

  return [
    `🔒 [${article.sourceName}] ${article.title}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `⚠️ 심각도: ${analysis.severityLabel}`,
    '',
    '📝 AI 요약:',
    analysis.summary,
    '',
    `🏷️ 카테고리: ${analysis.category}`,
    `🔗 원문: ${article.url}`,
    `🕐 발행: ${pubDate}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━',
  ].join('\n');
}
