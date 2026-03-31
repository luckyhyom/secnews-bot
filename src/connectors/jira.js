/**
 * Jira REST API 클라이언트.
 * Ollama 모드에서 Node.js가 직접 Jira API를 호출할 때 사용.
 *
 * 환경변수:
 *   JIRA_BASE_URL  — Jira 인스턴스 URL (예: https://your-domain.atlassian.net)
 *   JIRA_EMAIL     — API 인증용 이메일
 *   JIRA_API_TOKEN — API 토큰
 */

export class JiraClient {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || process.env.JIRA_BASE_URL;
    this.email = config.email || process.env.JIRA_EMAIL;
    this.apiToken = config.apiToken || process.env.JIRA_API_TOKEN;

    if (!this.baseUrl || !this.email || !this.apiToken) {
      throw new Error('JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN 환경변수가 필요합니다');
    }

    this.authHeader =
      'Basic ' + Buffer.from(`${this.email}:${this.apiToken}`).toString('base64');
  }

  /**
   * Jira REST API에 요청을 보낸다.
   * @param {string} path - API 경로 (예: /rest/api/3/search)
   * @param {object} [options] - fetch 옵션
   * @returns {Promise<object>}
   */
  async _request(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options.headers,
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Jira API 오류 (${res.status}): ${body}`);
    }

    return res.json();
  }

  /**
   * JQL로 이슈를 검색한다.
   * @param {string} jql - JQL 쿼리
   * @param {object} [options]
   * @param {number} [options.maxResults=20]
   * @param {string[]} [options.fields]
   * @returns {Promise<object>}
   */
  async searchIssues(jql, options = {}) {
    const maxResults = options.maxResults ?? 20;
    const fields = options.fields ?? [
      'summary', 'status', 'assignee', 'priority', 'created', 'updated', 'issuetype',
    ];

    const params = new URLSearchParams({
      jql,
      maxResults: String(maxResults),
      fields: fields.join(','),
    });

    return this._request(`/rest/api/3/search?${params}`);
  }

  /**
   * 특정 이슈의 상세 정보를 조회한다.
   * @param {string} issueKey - 이슈 키 (예: PROJ-123)
   * @returns {Promise<object>}
   */
  async getIssue(issueKey) {
    return this._request(`/rest/api/3/issue/${issueKey}`);
  }

  /**
   * 이슈를 생성한다.
   * @param {object} fields - 이슈 필드 (project, summary, issuetype 등)
   * @returns {Promise<object>}
   */
  async createIssue(fields) {
    return this._request('/rest/api/3/issue', {
      method: 'POST',
      body: JSON.stringify({ fields }),
    });
  }

  /**
   * 이슈에 코멘트를 추가한다.
   * @param {string} issueKey
   * @param {string} body - 코멘트 내용
   * @returns {Promise<object>}
   */
  async addComment(issueKey, body) {
    return this._request(`/rest/api/3/issue/${issueKey}/comment`, {
      method: 'POST',
      body: JSON.stringify({
        body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: body }] }] },
      }),
    });
  }

  /**
   * 검색 결과를 요약용 텍스트로 변환한다.
   * LLM에 전달하기 전 구조화된 텍스트 생성.
   * @param {object} searchResult - searchIssues()의 반환값
   * @returns {string}
   */
  formatForLLM(searchResult) {
    const { total, issues } = searchResult;
    const lines = [`총 ${total}건 검색됨 (상위 ${issues.length}건 표시)\n`];

    for (const issue of issues) {
      const f = issue.fields;
      lines.push(
        `[${issue.key}] ${f.summary}`,
        `  상태: ${f.status?.name ?? '없음'} | 우선순위: ${f.priority?.name ?? '없음'} | 담당: ${f.assignee?.displayName ?? '미지정'}`,
        `  유형: ${f.issuetype?.name ?? '없음'} | 생성: ${f.created?.split('T')[0] ?? '불명'}`,
        '',
      );
    }

    return lines.join('\n');
  }
}
