import { ImapClient } from '../connectors/imap.js';
import { EMAIL_ACTION_PROMPT, EMAIL_SYSTEM_PROMPT } from './email-prompt.js';

/**
 * Email 에이전트 오케스트레이터.
 * IMAP 기반으로 Gmail, 메일플러그, 네이버, Outlook 등 모든 서비스 지원.
 * Node.js가 IMAP으로 메일을 조회하고, LLM은 의도 파악과 요약만 수행.
 */
export class EmailAgent {
  /**
   * @param {import('../llm/index.js').LLMProvider} llm
   * @param {object} credentials - { host, user, pass }
   */
  constructor(llm, credentials) {
    this.llm = llm;
    this.imap = new ImapClient(credentials);
  }

  /**
   * 사용자 질의를 처리한다.
   * 1) LLM이 질의를 분석하여 액션+파라미터 추출
   * 2) Node.js가 IMAP으로 메일 조회
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

    // 2단계: IMAP으로 메일 조회
    let result;
    try {
      switch (action.action) {
        case 'list':
        case 'search': {
          const options = {
            maxResults: action.maxResults ?? 10,
            unseen: action.filters?.unreadOnly === true,
            from: action.filters?.from,
            subject: action.filters?.subject || action.query,
          };
          const messages = await this.imap.listMessages(options);
          result = this.imap.formatForLLM(messages);
          break;
        }
        case 'read': {
          if (!action.messageId) return '읽을 메일을 지정해주세요.';
          const msg = await this.imap.getMessage(Number(action.messageId));
          result = `제목: ${msg.subject}\n보낸사람: ${msg.from}\n날짜: ${msg.date}\n\n${msg.text}`;
          break;
        }
        default:
          return `지원하지 않는 액션: ${action.action}`;
      }
    } catch (err) {
      return `이메일 조회 실패: ${err.message}`;
    }

    // 3단계: 결과를 LLM으로 요약
    const summary = await this.llm.complete(
      `사용자 질의: "${userQuery}"\n\n이메일 조회 결과:\n${result}\n\n위 결과를 한국어로 간결하게 요약하세요. 개인정보(전화번호, 주소, 계좌번호)는 마스킹 처리하세요.`,
      { systemPrompt: EMAIL_SYSTEM_PROMPT },
    );

    return summary;
  }
}
