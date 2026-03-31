import { describe, it, expect } from "vitest";
import { spawn } from "child_process";

function runClaude(prompt, sessionId) {
  return new Promise((resolve, reject) => {
    const args = ["-p", "--output-format", "json", prompt];
    if (sessionId) {
      args.push("--resume", sessionId);
    }

    const proc = spawn("claude", args, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => (stdout += data));
    proc.stderr.on("data", (data) => (stderr += data));

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(stderr || `claude exited with code ${code}`));
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve({ result: stdout.trim(), session_id: sessionId });
      }
    });

    proc.on("error", reject);
  });
}

describe("Claude Code 세션", () => {
  it("새 세션을 생성하고 응답을 반환한다", async () => {
    const result = await runClaude("1+1의 결과만 숫자로 답해줘");

    expect(result.type).toBe("result");
    expect(result.session_id).toBeTruthy();
    expect(result.result).toContain("2");
  }, 60_000);

  it("세션을 이어서 이전 맥락을 기억한다", async () => {
    // 1차: 새 세션
    const first = await runClaude("내 이름은 테스트봇이야. 알겠으면 '확인'이라고만 답해");
    expect(first.session_id).toBeTruthy();

    // 2차: 같은 세션으로 이어서
    const second = await runClaude("내 이름이 뭐라고 했지?", first.session_id);
    expect(second.session_id).toBe(first.session_id);
    expect(second.result).toMatch(/테스트봇/);
  }, 120_000);
});
