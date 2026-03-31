import { JiraClient } from '../connectors/jira.js';
import { JIRA_ACTION_PROMPT, JIRA_SYSTEM_PROMPT } from './jira-prompt.js';

/**
 * Jira 에이전트 오케스트레이터 (Ollama 모드).
 * Node.js가 Jira API를 호출하고, LLM은 의도 파악과 요약만 수행.
 */
export class JiraAgent {
  /**
   * @param {import('../llm/index.js').LLMProvider} llm
   * @param {object} [config] - JiraClient 설정
   */
  constructor(llm, config = {}) {
    this.llm = llm;
    this.jira = new JiraClient(config);
  }

  /**
   * 사용자 질의를 처리한다.
   * 1) LLM이 질의를 분석하여 액션+파라미터 추출
   * 2) Node.js가 Jira API 호출
   * 3) LLM이 결과를 한국어로 요약
   *
   * @param {string} userQuery - 사용자의 자연어 질의
   * @returns {Promise<string>} 한국어 응답
   */
  async handle(userQuery) {
    // 1단계: 의도 및 파라미터 추출
    const action = await this.llm.structured(
      `사용자 질의: "${userQuery}"\n\n${JIRA_ACTION_PROMPT}`,
      { systemPrompt: JIRA_SYSTEM_PROMPT },
    );

    // 2단계: Jira API 호출
    let result;
    try {
      switch (action.action) {
        case 'search':
          result = await this.jira.searchIssues(action.jql, {
            maxResults: action.maxResults ?? 10,
          });
          break;
        case 'get':
          result = await this.jira.getIssue(action.issueKey);
          break;
        case 'create':
          result = await this.jira.createIssue(action.fields);
          break;
        default:
          return `지원하지 않는 액션: ${action.action}`;
      }
    } catch (err) {
      return `Jira API 호출 실패: ${err.message}`;
    }

    // 3단계: 결과를 LLM으로 요약
    const formatted =
      action.action === 'search'
        ? this.jira.formatForLLM(result)
        : JSON.stringify(result, null, 2);

    const summary = await this.llm.complete(
      `사용자 질의: "${userQuery}"\n\nJira 검색 결과:\n${formatted}\n\n위 결과를 한국어로 간결하게 요약하세요.`,
      { systemPrompt: JIRA_SYSTEM_PROMPT },
    );

    return summary;
  }
}
