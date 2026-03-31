import { ClaudeCodeProvider } from './claude-code.js';
import { OllamaProvider } from './ollama.js';

/**
 * @typedef {Object} CompletionOptions
 * @property {string} [systemPrompt] - 시스템 프롬프트
 * @property {number} [maxTokens] - 최대 토큰 수
 * @property {number} [temperature] - 샘플링 온도
 */

/**
 * @typedef {Object} LLMProvider
 * @property {(prompt: string, options?: CompletionOptions) => Promise<string>} complete - 텍스트 생성
 * @property {(prompt: string, options?: CompletionOptions) => Promise<object>} structured - JSON 구조화 응답
 */

const PROVIDERS = {
  'claude-code': ClaudeCodeProvider,
  ollama: OllamaProvider,
};

/**
 * LLM 프로바이더 인스턴스를 생성한다.
 * 환경변수 LLM_PROVIDER 또는 config.type으로 백엔드를 선택.
 *
 * @param {object} [config]
 * @param {string} [config.type] - 'claude-code' | 'ollama'
 * @returns {LLMProvider}
 */
export function createProvider(config = {}) {
  const type = config.type || process.env.LLM_PROVIDER || 'claude-code';
  const Provider = PROVIDERS[type];

  if (!Provider) {
    throw new Error(
      `알 수 없는 LLM 프로바이더: "${type}". 사용 가능: ${Object.keys(PROVIDERS).join(', ')}`,
    );
  }

  return new Provider(config);
}
