import "dotenv/config";
import bolt from "@slack/bolt";
import { spawn } from "child_process";
import { join } from "path";
import { readFileSync } from "fs";
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

// 토큰 저장소 (Email 에이전트용)
let tokenStore;
try {
  tokenStore = new TokenStore(join(process.cwd(), "state/tokens.json"));
} catch {
  console.warn("TOKEN_ENCRYPTION_KEY 미설정 — Email 에이전트 비활성");
}

/**
 * Claude Code CLI를 호출한다 (claude-code 모드 전용).
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
 */
async function handleWithProvider(text, intent, slackUserId) {
  switch (intent) {
    case "jira": {
      const agent = new JiraAgent(llm);
      return agent.handle(text);
    }
    case "email": {
      const credentials = tokenStore?.getToken(slackUserId);
      if (!credentials)
        return '이메일이 연동되지 않았습니다. `@봇 connect-email`을 입력해주세요.';
      const agent = new EmailAgent(llm, credentials);
      return agent.handle(text);
    }
    case "news":
      return llm.complete(`보안 뉴스 관련 질문에 답하세요: ${text}`, {
        systemPrompt: "당신은 보안 뉴스 전문가입니다. 한국어로 답하세요.",
      });
    default:
      return llm.complete(text);
  }
}

// --- 메뉴 메시지 ---
const MENU_TEXT = [
  "📋 *SecNews Bot 메뉴*",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "",
  "1️⃣  *보안 뉴스*  —  최신 보안 뉴스 수집 및 조회",
  '    예: `@봇 최근 보안 뉴스 알려줘`',
  "",
  "2️⃣  *지라 자료 검색*  —  Jira 이슈/티켓/스프린트 검색",
  '    예: `@봇 지라에서 긴급 이슈 검색해줘`',
  "",
  "3️⃣  *이메일 검색*  —  IMAP 기반 이메일 조회",
  '    예: `@봇 안 읽은 메일 요약해줘`',
  "",
  "4️⃣  *이메일 연동*  —  이메일 계정 등록",
  '    예: `@봇 connect-email`',
  "",
  "5️⃣  *상태 확인*  —  봇 상태 및 뉴스 수집 현황",
  '    예: `@봇 상태`',
  "",
  "6️⃣  *도움말*  —  이 메뉴 보기",
  '    예: `@봇 메뉴` 또는 `@봇 도움말`',
  "",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "위 키워드 외의 입력은 일반 대화로 처리됩니다.",
].join("\n");

/**
 * 봇 상태 정보를 조회한다.
 */
function getStatusText() {
  try {
    const statePath = join(process.cwd(), "state/posted_articles.json");
    const state = JSON.parse(readFileSync(statePath, "utf-8"));

    const lastUpdated = state.last_updated
      ? new Date(state.last_updated).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
      : "없음";

    const sourceLines = Object.entries(state.articles || {}).map(
      ([source, articles]) => `  • ${source}: ${articles.length}건`
    );

    return [
      "📊 *봇 상태*",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━",
      `🤖 LLM 프로바이더: \`${providerType}\``,
      `📰 마지막 뉴스 수집: ${lastUpdated}`,
      `📧 이메일 연동: ${tokenStore ? "활성" : "비활성"}`,
      "",
      "*소스별 게시 이력:*",
      ...sourceLines,
      "━━━━━━━━━━━━━━━━━━━━━━━━━━",
    ].join("\n");
  } catch {
    return "상태 정보를 불러올 수 없습니다.";
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

  // 의도 분류
  const { intent, systemPrompt } = classifyIntent(text);
  console.log(`[라우터] 의도: ${intent} | 텍스트: ${text.slice(0, 50)}`);

  // --- LLM 호출 없이 처리되는 명령들 ---

  // 메뉴/도움말
  if (intent === "menu") {
    await say({ text: MENU_TEXT, thread_ts: threadTs });
    return;
  }

  // 상태 확인
  if (intent === "status") {
    await say({ text: getStatusText(), thread_ts: threadTs });
    return;
  }

  // 이메일 연동 (IMAP)
  if (intent === "connect-email" || /connect-email/i.test(text)) {
    if (!tokenStore) {
      await say({
        text: "Email 에이전트가 비활성 상태입니다 (TOKEN_ENCRYPTION_KEY 미설정).",
        thread_ts: threadTs,
      });
      return;
    }

    const emailMatch = text.match(/connect-email\s+(\S+)\s+(\S+)\s+(\S+)/i);
    if (!emailMatch) {
      await say({
        text: [
          "📧 *이메일 연동 방법*",
          "",
          "`@봇 connect-email <IMAP서버> <이메일> <앱비밀번호>`",
          "",
          "예시:",
          "• Gmail: `@봇 connect-email imap.gmail.com user@gmail.com xxxx-xxxx-xxxx-xxxx`",
          "• 네이버: `@봇 connect-email imap.naver.com user@naver.com 앱비밀번호`",
          "• 메일플러그: `@봇 connect-email imap.mailplug.co.kr user@company.com 비밀번호`",
          "",
          "Gmail 앱 비밀번호 발급: https://myaccount.google.com/apppasswords",
        ].join("\n"),
        thread_ts: threadTs,
      });
      return;
    }

    const stripSlack = (s) =>
      s.replace(/<[^|>]+\|([^>]+)>/g, "$1").replace(/<|>/g, "");
    const host = stripSlack(emailMatch[1]);
    const user = stripSlack(emailMatch[2]);
    const pass = stripSlack(emailMatch[3]);
    tokenStore.saveToken(event.user, { host, user, pass });

    await say({
      text: `✅ 이메일 연동 완료! (${user})\n이제 메일 관련 질문을 할 수 있습니다.`,
      thread_ts: threadTs,
    });

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

  // Email 인증 확인
  if (intent === "email") {
    if (!tokenStore || !tokenStore.hasToken(event.user)) {
      await say({
        text: '📧 이메일이 연동되지 않았습니다. `@봇 connect-email`을 입력하여 연동 방법을 확인하세요.',
        thread_ts: threadTs,
      });
      return;
    }
  }

  // --- LLM 호출이 필요한 처리 ---
  const loading = await say({
    text: '생각 중... (💡 `@봇 메뉴`를 입력하면 기능 메뉴를 확인할 수 있습니다.)',
    thread_ts: threadTs,
  });

  try {
    let response;

    if (intent === "email") {
      response = await handleWithProvider(text, intent, event.user);
    } else if (isClaudeCode) {
      const sessionId = sessions.get(threadTs);
      const result = await runClaude(text, sessionId, systemPrompt);

      if (result.session_id && !sessionId) {
        sessions.set(threadTs, result.session_id);
      }
      response = result.result || result.text || JSON.stringify(result);
    } else {
      response = await handleWithProvider(text, intent, event.user);
    }

    // 로딩 메시지 삭제 후 응답 전송
    try {
      await app.client.chat.delete({ channel: event.channel, ts: loading.ts });
    } catch {}

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

    let errorText = err.message;
    if (errorText.includes("hit your limit") || errorText.includes("resets")) {
      errorText =
        "⏳ Claude 토큰 리밋에 도달했습니다. 잠시 후 다시 시도해주세요.";
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
