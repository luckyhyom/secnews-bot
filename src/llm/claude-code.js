import { spawn } from 'child_process';

/**
 * Claude Code CLI를 child process로 호출하는 프로바이더.
 * 현재 기본 백엔드로, claude CLI가 설치되어 있어야 한다.
 */
export class ClaudeCodeProvider {
  constructor(config = {}) {
    this.cwd = config.cwd || process.cwd();
    this.timeout = config.timeout || 300_000;
  }

  /** 텍스트 응답을 생성한다. */
  async complete(prompt, options = {}) {
    return new Promise((resolve, reject) => {
      const args = ['-p', '--output-format', 'json'];
      if (options.systemPrompt) {
        args.push('--system-prompt', options.systemPrompt);
      }
      args.push(prompt);

      const proc = spawn('claude', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: this.cwd,
        env: { ...process.env },
        timeout: this.timeout,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => (stdout += data));
      proc.stderr.on('data', (data) => (stderr += data));

      proc.on('close', (code) => {
        if (code !== 0) {
          console.error('claude stderr:', stderr);
          return reject(new Error(stderr || stdout || `claude 프로세스 종료 코드: ${code}`));
        }
        try {
          const result = JSON.parse(stdout);
          if (result.is_error) {
            return reject(new Error(result.result || 'Claude 오류'));
          }
          resolve(result.result || result.text || String(result));
        } catch {
          resolve(stdout.trim());
        }
      });

      proc.on('error', reject);
    });
  }

  /** JSON 구조화 응답을 생성한다. 응답에서 JSON을 추출하여 파싱. */
  async structured(prompt, options = {}) {
    const jsonPrompt = `${prompt}\n\n반드시 유효한 JSON 형식으로만 응답하세요. 코드 블록 없이 JSON만 출력하세요.`;
    const text = await this.complete(jsonPrompt, options);

    try {
      const jsonMatch =
        text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);
      if (jsonMatch) return JSON.parse(jsonMatch[1]);
      return JSON.parse(text);
    } catch {
      return { text };
    }
  }
}
