import { GmailClient } from '../connectors/gmail.js';
import { EMAIL_ACTION_PROMPT, EMAIL_SYSTEM_PROMPT } from './email-prompt.js';
import { restoreClient } from '../auth/oauth-flow.js';

/**
 * Email 에이전트 오케스트레이터 (Ollama 모드).
 * Node.js가 Gmail API를 호출하고, LLM은 의도 파악과 요약만 수행.
 */
export class EmailAgent {
  /**
   * @param {import('../llm/index.js').LLMProvider} llm
   * @param {object} tokens - 사용자의 OAuth 토큰
   */
  constructor(llm, tokens) {
    this.llm = llm;
    const auth = restoreClient(tokens);
    this.gmail = new GmailClient(auth);
  }

  /**
   * 사용자 질의를 처리한다.
   * 1) LLM이 질의를 분석하여 Gmail 액션+파라미터 추출
   * 2) Node.js가 Gmail API 호출
   * 3) LLM이 결과를 한국어로 요약
   *
   * @param {string} userQuery - 사용자의 자연어 질의
   * @returns {Promise<string>} 한국어 응답
   */
  async handle(userQuery) {
    // 1단계: 의도 및 파라미터 추출
    const action = await this.llm.structured(
      `사용자 질의: "${userQuery}"\n\n${EMAIL_ACTION_PROMPT}`,
      { systemPrompt: EMAIL_SYSTEM_PROMPT },
    );

    // 2단계: Gmail API 호출
    let result;
    try {
      switch (action.action) {
        case 'list':
        case 'search': {
          const query = action.query || this._buildQuery(action.filters);
          const messages = await this.gmail.listWithHeaders({
            query,
            maxResults: action.maxResults ?? 10,
          });
          result = this.gmail.formatForLLM(messages);
          break;
        }
        case 'read': {
          if (!action.messageId) return '읽을 메일 ID를 지정해주세요.';
          const msg = await this.gmail.getMessage(action.messageId);
          result = JSON.stringify(msg, null, 2);
          break;
        }
        default:
          return `지원하지 않는 액션: ${action.action}`;
      }
    } catch (err) {
      return `Gmail API 호출 실패: ${err.message}`;
    }

    // 3단계: 결과를 LLM으로 요약
    const summary = await this.llm.complete(
      `사용자 질의: "${userQuery}"\n\n이메일 조회 결과:\n${result}\n\n위 결과를 한국어로 간결하게 요약하세요. 개인정보(전화번호, 주소, 계좌번호)는 마스킹 처리하세요.`,
      { systemPrompt: EMAIL_SYSTEM_PROMPT },
    );

    return summary;
  }

  /**
   * 필터 객체를 Gmail 검색 쿼리로 변환한다.
   * @param {object} [filters]
   * @returns {string}
   */
  _buildQuery(filters = {}) {
    const parts = [];
    if (filters.unreadOnly) parts.push('is:unread');
    if (filters.from) parts.push(`from:${filters.from}`);
    if (filters.subject) parts.push(`subject:${filters.subject}`);
    return parts.join(' ') || 'is:unread';
  }
}
