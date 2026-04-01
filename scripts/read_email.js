#!/usr/bin/env node
/**
 * IMAP 이메일 조회 CLI 래퍼.
 * 기존 src/connectors/imap.js의 ImapClient를 CLI에서 호출할 수 있도록 한다.
 *
 * 자격증명은 CLI 인자 또는 .env 환경변수(IMAP_HOST, IMAP_USER, IMAP_PASS)에서 로드.
 *
 * 사용법:
 *   node scripts/read_email.js --action list --max 5
 *   node scripts/read_email.js --action read --uid 1234
 *   node scripts/read_email.js --action search --subject "보안"
 *   node scripts/read_email.js --action list --host imap.gmail.com --user user@gmail.com --pass xxxx
 *
 * 결과는 JSON으로 stdout에 출력된다.
 */
import 'dotenv/config';
import { ImapClient } from '../src/connectors/imap.js';

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

async function main() {
  const args = parseArgs(process.argv);

  if (!args.action) fail('--action 필수 (list, read, search)');

  // CLI 인자 > 환경변수 순으로 자격증명 로드
  const host = args.host || process.env.IMAP_HOST;
  const user = args.user || process.env.IMAP_USER;
  const pass = args.pass || process.env.IMAP_PASS;

  if (!host) fail('--host 또는 IMAP_HOST 환경변수 필수');
  if (!user) fail('--user 또는 IMAP_USER 환경변수 필수');
  if (!pass) fail('--pass 또는 IMAP_PASS 환경변수 필수');

  const client = new ImapClient({ host, user, pass });

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
