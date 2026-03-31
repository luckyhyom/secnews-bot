/**
 * Ollama REST API 프로바이더.
 * 로컬에서 실행되는 LLM 서버(Ollama)와 통신한다.
 *
 * 환경변수:
 *   OLLAMA_BASE_URL - 서버 주소 (기본: http://localhost:11434)
 *   OLLAMA_MODEL    - 모델명 (기본: qwen3:32b)
 */
export class OllamaProvider {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.model = config.model || process.env.OLLAMA_MODEL || 'qwen3:32b';
  }

  /** 텍스트 응답을 생성한다. /api/chat 엔드포인트 사용. */
  async complete(prompt, options = {}) {
    const messages = [];
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.3,
          num_predict: options.maxTokens ?? 2048,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama API 오류: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return data.message.content;
  }

  /**
   * JSON 구조화 응답을 생성한다.
   * Ollama의 format: 'json' 옵션으로 네이티브 JSON 모드를 사용.
   */
  async structured(prompt, options = {}) {
    const messages = [];
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({
      role: 'user',
      content: `${prompt}\n\n반드시 유효한 JSON 형식으로만 응답하세요. 코드 블록 없이 JSON만 출력하세요.`,
    });

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        format: 'json',
        options: {
          temperature: options.temperature ?? 0.3,
          num_predict: options.maxTokens ?? 2048,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama API 오류: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const text = data.message.content;

    try {
      return JSON.parse(text);
    } catch {
      const jsonMatch =
        text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);
      if (jsonMatch) return JSON.parse(jsonMatch[1]);
      return { text };
    }
  }
}
