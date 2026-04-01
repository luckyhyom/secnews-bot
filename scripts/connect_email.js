#!/usr/bin/env node
/**
 * 이메일 자격증명 관리 CLI 래퍼.
 * Slack 유저별 IMAP 자격증명을 암호화 저장/조회/삭제한다.
 *
 * 환경변수 (.env에서 자동 로드):
 *   TOKEN_ENCRYPTION_KEY — 32바이트(64자 hex) 암호화 키
 *
 * 사용법:
 *   node scripts/connect_email.js --action save --slack-user U01AB2CD3EF --host imap.mailplug.co.kr --user user@company.com --pass xxxx
 *   node scripts/connect_email.js --action check --slack-user U01AB2CD3EF
 *   node scripts/connect_email.js --action remove --slack-user U01AB2CD3EF
 *   node scripts/connect_email.js --action list
 *
 * 결과는 JSON으로 stdout에 출력된다.
 */
import 'dotenv/config';
import { join } from 'path';
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

function main() {
  const args = parseArgs(process.argv);

  if (!args.action) fail('--action 필수 (save, check, remove, list)');

  let tokenStore;
  try {
    tokenStore = new TokenStore(join(process.cwd(), 'state/tokens.json'));
  } catch {
    fail('TOKEN_ENCRYPTION_KEY 환경변수가 설정되지 않았습니다');
  }

  switch (args.action) {
    case 'save': {
      if (!args['slack-user']) fail('--slack-user 필수');
      if (!args.host) fail('--host 필수 (IMAP 서버 주소)');
      if (!args.user) fail('--user 필수 (이메일 주소)');
      if (!args.pass) fail('--pass 필수 (앱 비밀번호)');

      tokenStore.saveToken(args['slack-user'], {
        host: args.host,
        user: args.user,
        pass: args.pass,
      });
      console.log(JSON.stringify({
        success: true,
        message: `${args.user} 연동 완료`,
        slackUser: args['slack-user'],
      }));
      break;
    }
    case 'check': {
      if (!args['slack-user']) fail('--slack-user 필수');
      const exists = tokenStore.hasToken(args['slack-user']);
      console.log(JSON.stringify({
        success: true,
        registered: exists,
        slackUser: args['slack-user'],
      }));
      break;
    }
    case 'remove': {
      if (!args['slack-user']) fail('--slack-user 필수');
      tokenStore.removeToken(args['slack-user']);
      console.log(JSON.stringify({
        success: true,
        message: '연동 해제 완료',
        slackUser: args['slack-user'],
      }));
      break;
    }
    case 'list': {
      const data = tokenStore.data;
      const users = Object.keys(data);
      console.log(JSON.stringify({
        success: true,
        count: users.length,
        users,
      }));
      break;
    }
    default:
      fail(`알 수 없는 액션: ${args.action} (save, check, remove, list 중 선택)`);
  }
}

main();
