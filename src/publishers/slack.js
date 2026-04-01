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
/**
 * Slack files.getUploadURLExternal + completeUploadExternal API로 파일을 업로드한다.
 *
 * @param {string} filePath - 업로드할 파일의 절대 경로
 * @param {object} [options]
 * @param {string} [options.token] - Slack Bot Token (기본: 환경변수)
 * @param {string} [options.channel] - 채널 ID (기본: 환경변수)
 * @param {string} [options.comment] - 파일과 함께 게시할 코멘트
 */
export async function uploadFileToSlack(filePath, options = {}) {
  const { readFile } = await import('node:fs/promises');
  const { basename } = await import('node:path');

  const token = options.token || process.env.SLACK_BOT_TOKEN;
  const channel = options.channel || process.env.SLACK_CHANNEL_ID;
  const comment = options.comment || '';

  if (!token) throw new Error('SLACK_BOT_TOKEN이 설정되지 않았습니다');
  if (!channel) throw new Error('SLACK_CHANNEL_ID가 설정되지 않았습니다');

  const fileData = await readFile(filePath);
  const filename = basename(filePath);

  // Step 1: Get upload URL
  const urlRes = await fetch('https://slack.com/api/files.getUploadURLExternal', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ filename, length: fileData.length }),
  });
  const urlData = await urlRes.json();
  if (!urlData.ok) throw new Error(`files.getUploadURLExternal 오류: ${urlData.error}`);

  // Step 2: Upload file content
  const form = new FormData();
  form.append('file', new Blob([fileData]), filename);
  await fetch(urlData.upload_url, { method: 'POST', body: form });

  // Step 3: Complete upload and share to channel
  const completeRes = await fetch('https://slack.com/api/files.completeUploadExternal', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      files: [{ id: urlData.file_id, title: filename }],
      channel_id: channel,
      initial_comment: comment,
    }),
  });
  const completeData = await completeRes.json();
  if (!completeData.ok) throw new Error(`files.completeUploadExternal 오류: ${completeData.error}`);

  return completeData;
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
