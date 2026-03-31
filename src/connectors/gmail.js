/**
 * Gmail REST API 클라이언트.
 * Ollama 모드에서 Node.js가 직접 Gmail API를 호출할 때 사용.
 * googleapis 패키지 기반.
 */
import { google } from 'googleapis';

export class GmailClient {
  /**
   * @param {object} auth - Google OAuth2 클라이언트 (인증 완료 상태)
   */
  constructor(auth) {
    this.gmail = google.gmail({ version: 'v1', auth });
  }

  /**
   * 메일 목록을 조회한다.
   * @param {object} [options]
   * @param {string} [options.query] - Gmail 검색 쿼리 (예: "is:unread")
   * @param {number} [options.maxResults=10]
   * @returns {Promise<object[]>} 메일 목록 (id, threadId, snippet)
   */
  async listMessages(options = {}) {
    const query = options.query || 'is:unread';
    const maxResults = options.maxResults ?? 10;

    const res = await this.gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults,
    });

    return res.data.messages || [];
  }

  /**
   * 특정 메일의 상세 정보를 조회한다.
   * @param {string} messageId
   * @returns {Promise<object>} 파싱된 메일 정보
   */
  async getMessage(messageId) {
    const res = await this.gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    return this._parseMessage(res.data);
  }

  /**
   * 메일 목록을 조회하고 각 메일의 헤더 정보를 포함하여 반환한다.
   * @param {object} [options]
   * @returns {Promise<object[]>} 메일 요약 목록
   */
  async listWithHeaders(options = {}) {
    const messages = await this.listMessages(options);
    const details = [];

    for (const msg of messages) {
      try {
        const detail = await this.getMessage(msg.id);
        details.push(detail);
      } catch {
        // 개별 메일 조회 실패시 건너뛰기
      }
    }

    return details;
  }

  /**
   * Gmail API 응답에서 필요한 필드만 추출한다.
   * @param {object} message - Gmail API 원시 응답
   * @returns {object}
   */
  _parseMessage(message) {
    const headers = message.payload?.headers || [];
    const getHeader = (name) =>
      headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

    return {
      id: message.id,
      threadId: message.threadId,
      from: getHeader('From'),
      to: getHeader('To'),
      subject: getHeader('Subject'),
      date: getHeader('Date'),
      snippet: message.snippet || '',
      labelIds: message.labelIds || [],
      isUnread: message.labelIds?.includes('UNREAD') ?? false,
    };
  }

  /**
   * 메일 목록을 LLM 요약용 텍스트로 변환한다.
   * @param {object[]} messages - listWithHeaders()의 반환값
   * @returns {string}
   */
  formatForLLM(messages) {
    if (messages.length === 0) return '조회된 이메일이 없습니다.';

    const lines = [`총 ${messages.length}건\n`];

    for (const msg of messages) {
      lines.push(
        `[${msg.isUnread ? '미읽음' : '읽음'}] ${msg.subject}`,
        `  보낸사람: ${msg.from} | 날짜: ${msg.date}`,
        `  미리보기: ${msg.snippet.slice(0, 100)}`,
        '',
      );
    }

    return lines.join('\n');
  }
}
