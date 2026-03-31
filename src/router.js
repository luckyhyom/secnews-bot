import { JIRA_SYSTEM_PROMPT } from './agents/jira-prompt.js';
import { EMAIL_SYSTEM_PROMPT } from './agents/email-prompt.js';

/**
 * 의도별 키워드 정의.
 * 키워드 매칭은 LLM 호출 없이 빠르고 비용이 들지 않는다.
 */
const INTENT_RULES = [
  {
    intent: 'news',
    keywords: ['뉴스', '보안', '수집', '기사', 'news', '최신', '피드'],
    systemPrompt: null,
  },
  {
    intent: 'jira',
    keywords: ['지라', 'jira', '이슈', '스프린트', '티켓', 'ticket', 'issue', '보드', 'board', '백로그'],
    systemPrompt: JIRA_SYSTEM_PROMPT,
  },
  {
    intent: 'email',
    keywords: ['메일', '이메일', 'email', '받은편지함', 'inbox', 'gmail', '편지'],
    systemPrompt: EMAIL_SYSTEM_PROMPT,
  },
];

/**
 * 멘션 텍스트에서 의도를 분류한다.
 * 키워드 기반 매칭으로, 일치하는 키워드가 없으면 일반 대화로 분류.
 *
 * @param {string} text - 멘션에서 봇 태그를 제거한 텍스트
 * @returns {{ intent: string, systemPrompt: string|null }}
 */
export function classifyIntent(text) {
  const lower = text.toLowerCase();

  for (const rule of INTENT_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return { intent: rule.intent, systemPrompt: rule.systemPrompt };
    }
  }

  return { intent: 'general', systemPrompt: null };
}
