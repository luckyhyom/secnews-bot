import "dotenv/config";
import bolt from "@slack/bolt";
import { spawn } from "child_process";
import { join } from "path";
import { createProvider } from "./src/llm/index.js";
import { classifyIntent } from "./src/router.js";
import { JiraAgent } from "./src/agents/jira.js";
import { EmailAgent } from "./src/agents/email.js";
import { TokenStore } from "./src/auth/token-store.js";

const { App } = bolt;

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

// --- LLM 프로바이더 설정 ---
const providerType = process.env.LLM_PROVIDER || "claude-code";
const llm = createProvider({ type: providerType });
const isClaudeCode = providerType === "claude-code";

// Slack thread_ts → Claude Code session ID (claude-code 모드 전용)
const sessions = new Map();

// OAuth 토큰 저장소 (Email 에이전트용)
let tokenStore;
try {
  tokenStore = new TokenStore(join(process.cwd(), "state/tokens.json"));
} catch {
  console.warn("TOKEN_ENCRYPTION_KEY 미설정 — Email 에이전트 비활성");
}

/**
 * Claude Code CLI를 호출한다 (claude-code 모드 전용).
 * systemPrompt가 있으면 --system-prompt로 전달하여 에이전트별 동작을 분기.
 */
function runClaude(prompt, sessionId, systemPrompt) {
  return new Promise((resolve, reject) => {
    const args = ["-p", "--output-format", "json"];
    if (systemPrompt) {
      args.push("--system-prompt", systemPrompt);
    }
    args.push(prompt);
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
        return reject(
          new Error(stderr || stdout || `claude 프로세스 종료 코드: ${code}`)
        );
      }
      try {
        const result = JSON.parse(stdout);
        if (result.is_error) {
          return reject(new Error(result.result || "Claude 오류"));
        }
        resolve(result);
      } catch {
        resolve({ result: stdout.trim(), session_id: sessionId });
      }
    });

    proc.on("error", reject);
  });
}

/**
 * LLM 프로바이더를 통해 응답을 생성한다 (ollama 등 로컬 LLM 모드).
 * 의도별로 적절한 에이전트를 호출하거나, 일반 대화는 LLM에 직접 전달.
 */
async function handleWithProvider(text, intent, slackUserId) {
  switch (intent) {
    case "jira": {
      const agent = new JiraAgent(llm);
      return agent.handle(text);
    }
    case "email": {
      const credentials = tokenStore?.getToken(slackUserId);
      if (!credentials) return "이메일이 연동되지 않았습니다. `@봇 connect-email`을 먼저 입력해주세요.";
      const agent = new EmailAgent(llm, credentials);
      return agent.handle(text);
    }
    case "news":
      return llm.complete(
        `보안 뉴스 관련 질문에 답하세요: ${text}`,
        { systemPrompt: "당신은 보안 뉴스 전문가입니다. 한국어로 답하세요." }
      );
    default:
      return llm.complete(text);
  }
}

// --- 멘션 이벤트 처리 ---
app.event("app_mention", async ({ event, say }) => {
  const threadTs = event.thread_ts || event.ts;
  const text = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();

  if (!text) {
    await say({ text: "메시지를 입력해주세요.", thread_ts: threadTs });
    return;
  }

  // --- 이메일 연동 명령 (IMAP) ---
  // 형식: connect-email <IMAP서버> <이메일> <앱비밀번호>
  const emailMatch = text.match(/connect-email\s+(\S+)\s+(\S+)\s+(\S+)/i);
  if (/connect-email/i.test(text)) {
    if (!tokenStore) {
      await say({
        text: "Email 에이전트가 비활성 상태입니다 (TOKEN_ENCRYPTION_KEY 미설정).",
        thread_ts: threadTs,
      });
      return;
    }

    if (!emailMatch) {
      await say({
        text: [
          "📧 이메일 연동 형식:",
          "`@봇 connect-email <IMAP서버> <이메일> <앱비밀번호>`",
          "",
          "예시:",
          "• Gmail: `@봇 connect-email imap.gmail.com gyals0386@gmail.com xxxx-xxxx-xxxx-xxxx`",
          "• 네이버: `@봇 connect-email imap.naver.com user@naver.com 앱비밀번호`",
          "• 메일플러그: `@봇 connect-email imap.mailplug.co.kr user@company.com 비밀번호`",
          "",
          "Gmail 앱 비밀번호 발급: https://myaccount.google.com/apppasswords",
        ].join("\n"),
        thread_ts: threadTs,
      });
      return;
    }

    // Slack 자동 포맷팅 제거 (<url|text> → text, <mailto:email|email> → email)
    const stripSlack = (s) => s.replace(/<[^|>]+\|([^>]+)>/g, "$1").replace(/<|>/g, "");
    const host = stripSlack(emailMatch[1]);
    const user = stripSlack(emailMatch[2]);
    const pass = stripSlack(emailMatch[3]);
    tokenStore.saveToken(event.user, { host, user, pass });

    await say({
      text: `✅ 이메일 연동 완료! (${user})\n이제 메일 관련 질문을 할 수 있습니다.`,
      thread_ts: threadTs,
    });

    // 원본 메시지 삭제 시도 (비밀번호 노출 방지)
    try {
      await app.client.chat.delete({ channel: event.channel, ts: event.ts });
    } catch {
      await say({
        text: "⚠️ 보안을 위해 위 메시지를 직접 삭제해주세요 (비밀번호 포함).",
        thread_ts: threadTs,
      });
    }
    return;
  }

  // 의도 분류
  const { intent, systemPrompt } = classifyIntent(text);
  console.log(`[라우터] 의도: ${intent} | 프로바이더: ${providerType} | 텍스트: ${text.slice(0, 50)}`);

  // Email 에이전트: 인증 확인 (프로바이더 무관하게 자체 OAuth 사용)
  if (intent === "email") {
    if (!tokenStore || !tokenStore.hasToken(event.user)) {
      await say({
        text: '📧 이메일이 연동되지 않았습니다. "@봇 connect-email"을 입력하여 연동 방법을 확인하세요.',
        thread_ts: threadTs,
      });
      return;
    }
  }

  const loading = await say({ text: "생각 중...", thread_ts: threadTs });

  try {
    let response;

    if (intent === "email") {
      // Email은 프로바이더 무관하게 자체 에이전트 사용 (MCP 인증 불가)
      response = await handleWithProvider(text, intent, event.user);
    } else if (isClaudeCode) {
      // Claude Code 모드: CLI를 통해 MCP 도구 포함 전체 기능 사용
      const sessionId = sessions.get(threadTs);
      const result = await runClaude(text, sessionId, systemPrompt);

      if (result.session_id && !sessionId) {
        sessions.set(threadTs, result.session_id);
      }
      response = result.result || result.text || JSON.stringify(result);
      console.log(`[응답] 길이: ${response.length}자, 타입: ${typeof response}`);
    } else {
      // 로컬 LLM 모드: Node.js가 API 호출, LLM은 분석/요약만
      response = await handleWithProvider(text, intent, event.user);
    }

    // 로딩 메시지 삭제 후 응답 전송
    try {
      await app.client.chat.delete({ channel: event.channel, ts: loading.ts });
    } catch {}

    // Slack 메시지 길이 제한 (약 3900자씩 분할)
    const MAX_LEN = 3900;
    const chunks = [];
    for (let i = 0; i < response.length; i += MAX_LEN) {
      chunks.push(response.slice(i, i + MAX_LEN));
    }
    for (const chunk of chunks) {
      await say({ text: chunk, thread_ts: threadTs });
    }
  } catch (err) {
    console.error("오류:", err.message);

    // 에러 메시지 간소화
    let errorText = err.message;
    if (errorText.includes("hit your limit") || errorText.includes("resets")) {
      errorText = "⏳ Claude 토큰 리밋에 도달했습니다. 잠시 후 다시 시도해주세요.";
    } else if (errorText.length > 200) {
      errorText = errorText.slice(0, 200) + "...";
    }

    try {
      await app.client.chat.delete({ channel: event.channel, ts: loading.ts });
    } catch {}
    await say({ text: errorText, thread_ts: threadTs });
  }
});

(async () => {
  await app.start();
  console.log(`⚡ SecNews Bot 실행 중 (Socket Mode | LLM: ${providerType})`);
})();
