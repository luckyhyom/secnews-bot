#!/usr/bin/env node
/**
 * IMAP 이메일 조회 CLI 래퍼.
 * 기존 src/connectors/imap.js의 ImapClient를 CLI에서 호출할 수 있도록 한다.
 *
 * 자격증명 우선순위: --slack-user (TokenStore) > CLI 인자 > .env 환경변수
 *
 * 사용법:
 *   node scripts/read_email.js --action list --slack-user U01AB2CD3EF --max 5
 *   node scripts/read_email.js --action read --slack-user U01AB2CD3EF --uid 1234
 *   node scripts/read_email.js --action list --max 5
 *   node scripts/read_email.js --action list --host imap.gmail.com --user user@gmail.com --pass xxxx
 *
 * 결과는 JSON으로 stdout에 출력된다.
 */
import 'dotenv/config';
import { join } from 'path';
import { ImapClient } from '../src/connectors/imap.js';
import { TokenStore } from '../src/auth/token-store.js';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    args[key] = argv[i + 1];
  }
  return args;
}

function fail(message) {
  console.log(JSON.stringify({ success: false, error: message }));
  process.exit(1);
}

/**
 * 자격증명을 로드한다.
 * 우선순위: --slack-user (TokenStore) > CLI 인자 > .env 환경변수
 */
function loadCredentials(args) {
  // 1. Slack 유저 ID로 TokenStore에서 로드
  if (args['slack-user']) {
    try {
      const tokenStore = new TokenStore(join(process.cwd(), 'state/tokens.json'));
      const credentials = tokenStore.getToken(args['slack-user']);
      if (credentials) return credentials;
      fail(`Slack 유저 ${args['slack-user']}의 이메일이 연동되지 않았습니다. connect-email로 먼저 등록하세요.`);
    } catch {
      fail('TokenStore 로드 실패 (TOKEN_ENCRYPTION_KEY 환경변수 확인)');
    }
  }

  // 2. CLI 인자 > 환경변수
  const host = args.host || process.env.IMAP_HOST;
  const user = args.user || process.env.IMAP_USER;
  const pass = args.pass || process.env.IMAP_PASS;

  if (!host) fail('--slack-user, --host, 또는 IMAP_HOST 환경변수 중 하나 필수');
  if (!user) fail('--slack-user, --user, 또는 IMAP_USER 환경변수 중 하나 필수');
  if (!pass) fail('--slack-user, --pass, 또는 IMAP_PASS 환경변수 중 하나 필수');

  return { host, user, pass };
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.action) fail('--action 필수 (list, read, search)');

  const credentials = loadCredentials(args);
  const client = new ImapClient(credentials);

  try {
    switch (args.action) {
      case 'list':
      case 'search': {
        const messages = await client.listMessages({
          maxResults: Number(args.max) || 10,
          unseen: args.unseen === 'true',
          from: args.from,
          subject: args.subject,
        });
        console.log(JSON.stringify({ success: true, count: messages.length, messages }));
        break;
      }
      case 'read': {
        if (!args.uid) fail('read 액션에는 --uid 필수');
        const message = await client.getMessage(Number(args.uid));
        console.log(JSON.stringify({ success: true, message }));
        break;
      }
      default:
        fail(`알 수 없는 액션: ${args.action} (list, read, search 중 선택)`);
    }
  } catch (err) {
    fail(err.message);
  }
}

main();
