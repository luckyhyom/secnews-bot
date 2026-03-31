import "dotenv/config";
import bolt from "@slack/bolt";
import { spawn } from "child_process";

const { App } = bolt;

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

// Slack thread_ts → Claude Code session ID
const sessions = new Map();

function runClaude(prompt, sessionId) {
  return new Promise((resolve, reject) => {
    const args = ["-p", "--output-format", "json", prompt];
    if (sessionId) {
      args.push("--resume", sessionId);
    }

    const proc = spawn("claude", args, {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: process.cwd(),
      env: { ...process.env },
      timeout: 300_000,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => (stdout += data));
    proc.stderr.on("data", (data) => (stderr += data));

    proc.on("close", (code) => {
      if (code !== 0) {
        console.error("claude stderr:", stderr);
        console.error("claude stdout:", stdout);
        return reject(new Error(stderr || stdout || `claude exited with code ${code}`));
      }
      try {
        const result = JSON.parse(stdout);
        if (result.is_error) {
          return reject(new Error(result.result || "Claude error"));
        }
        resolve(result);
      } catch {
        resolve({ result: stdout.trim(), session_id: sessionId });
      }
    });

    proc.on("error", reject);
  });
}

// 멘션 이벤트 처리
app.event("app_mention", async ({ event, say }) => {
  const threadTs = event.thread_ts || event.ts;
  const text = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();

  if (!text) {
    await say({ text: "메시지를 입력해주세요.", thread_ts: threadTs });
    return;
  }

  // 타이핑 표시
  const loading = await say({ text: "생각 중...", thread_ts: threadTs });

  try {
    const sessionId = sessions.get(threadTs);
    const result = await runClaude(text, sessionId);

    // 세션 ID 저장
    if (result.session_id && !sessionId) {
      sessions.set(threadTs, result.session_id);
    }

    const response = result.result || result.text || String(result);

    await app.client.chat.update({
      channel: event.channel,
      ts: loading.ts,
      text: response,
    });
  } catch (err) {
    console.error("Claude error:", err);
    await app.client.chat.update({
      channel: event.channel,
      ts: loading.ts,
      text: `오류 발생: ${err.message}`,
    });
  }
});

(async () => {
  await app.start();
  console.log("⚡ SecNews Bot is running (Socket Mode)");
})();
