import "dotenv/config";
import bolt from "@slack/bolt";
import { spawn } from "child_process";
import { join } from "path";
import { createProvider } from "./src/llm/index.js";
import { classifyIntent } from "./src/router.js";
import { JiraAgent } from "./src/agents/jira.js";
import { EmailAgent } from "./src/agents/email.js";
import { TokenStore } from "./src/auth/token-store.js";
import {
  createOAuth2Client,
  generateAuthUrl,
  waitForCallback,
} from "./src/auth/oauth-flow.js";

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
      const tokens = tokenStore?.getToken(slackUserId);
      if (!tokens) return "Gmail이 연동되지 않았습니다.";
      const agent = new EmailAgent(llm, tokens);
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

// --- 이메일 인증 명령 ---
app.message(/\/connect-email/i, async ({ message, say }) => {
  if (!tokenStore) {
    await say({
      text: "Email 에이전트가 비활성 상태입니다 (TOKEN_ENCRYPTION_KEY 미설정).",
      thread_ts: message.ts,
    });
    return;
  }

  const port = parseInt(process.env.OAUTH_REDIRECT_PORT || "3000", 10);
  const oauth2Client = createOAuth2Client(port);
  const authUrl = generateAuthUrl(oauth2Client);

  await say({
    text: `📧 Gmail 연동을 시작합니다.\n아래 링크에서 Google 계정을 인증해주세요:\n${authUrl}`,
    thread_ts: message.ts,
  });

  try {
    const tokens = await waitForCallback(oauth2Client, port);
    tokenStore.saveToken(message.user, tokens);

    await say({
      text: "✅ Gmail 연동 완료! 이제 메일 관련 질문을 할 수 있습니다.",
      thread_ts: message.ts,
    });
  } catch (err) {
    await say({
      text: `❌ Gmail 인증 실패: ${err.message}`,
      thread_ts: message.ts,
    });
  }
});

// --- 멘션 이벤트 처리 ---
app.event("app_mention", async ({ event, say }) => {
  const threadTs = event.thread_ts || event.ts;
  const text = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();

  if (!text) {
    await say({ text: "메시지를 입력해주세요.", thread_ts: threadTs });
    return;
  }

  // 의도 분류
  const { intent, systemPrompt } = classifyIntent(text);
  console.log(`[라우터] 의도: ${intent} | 프로바이더: ${providerType} | 텍스트: ${text.slice(0, 50)}`);

  // Email 에이전트: 인증 확인
  if (intent === "email" && tokenStore && !tokenStore.hasToken(event.user)) {
    await say({
      text: '📧 Gmail이 연동되지 않았습니다. 먼저 "/connect-email"을 입력해주세요.',
      thread_ts: threadTs,
    });
    return;
  }

  const loading = await say({ text: "생각 중...", thread_ts: threadTs });

  try {
    let response;

    if (isClaudeCode) {
      // Claude Code 모드: CLI를 통해 MCP 도구 포함 전체 기능 사용
      const sessionId = sessions.get(threadTs);
      const result = await runClaude(text, sessionId, systemPrompt);

      if (result.session_id && !sessionId) {
        sessions.set(threadTs, result.session_id);
      }
      response = result.result || result.text || String(result);
    } else {
      // 로컬 LLM 모드: Node.js가 API 호출, LLM은 분석/요약만
      response = await handleWithProvider(text, intent, event.user);
    }

    await app.client.chat.update({
      channel: event.channel,
      ts: loading.ts,
      text: response,
    });
  } catch (err) {
    console.error("오류:", err);
    await app.client.chat.update({
      channel: event.channel,
      ts: loading.ts,
      text: `오류 발생: ${err.message}`,
    });
  }
});

(async () => {
  await app.start();
  console.log(`⚡ SecNews Bot 실행 중 (Socket Mode | LLM: ${providerType})`);
})();
