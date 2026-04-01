#!/usr/bin/env node
/**
 * Jira REST API CLI 래퍼.
 * 기존 src/connectors/jira.js의 JiraClient를 CLI에서 호출할 수 있도록 한다.
 *
 * 사용법:
 *   node scripts/jira_query.js --action search --jql "assignee = currentUser()" --max 10
 *   node scripts/jira_query.js --action get --key PROJ-123
 *   node scripts/jira_query.js --action create --project PROJ --summary "이슈 제목" --type Bug
 *
 * 환경변수 (.env에서 자동 로드):
 *   JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN
 *
 * 결과는 JSON으로 stdout에 출력된다.
 */
import 'dotenv/config';
import { JiraClient } from '../src/connectors/jira.js';

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

  if (!args.action) fail('--action 필수 (search, get, create)');

  let client;
  try {
    client = new JiraClient();
  } catch (err) {
    fail(err.message);
  }

  try {
    switch (args.action) {
      case 'search': {
        if (!args.jql) fail('search 액션에는 --jql 필수');
        const result = await client.searchIssues(args.jql, {
          maxResults: Number(args.max) || 20,
        });
        const formatted = client.formatForLLM(result);
        console.log(JSON.stringify({ success: true, total: result.total, formatted, issues: result.issues }));
        break;
      }
      case 'get': {
        if (!args.key) fail('get 액션에는 --key 필수 (예: PROJ-123)');
        const issue = await client.getIssue(args.key);
        console.log(JSON.stringify({ success: true, issue }));
        break;
      }
      case 'create': {
        if (!args.project) fail('create 액션에는 --project 필수');
        if (!args.summary) fail('create 액션에는 --summary 필수');
        const fields = {
          project: { key: args.project },
          summary: args.summary,
          issuetype: { name: args.type || 'Task' },
        };
        const created = await client.createIssue(fields);
        console.log(JSON.stringify({ success: true, key: created.key, id: created.id }));
        break;
      }
      default:
        fail(`알 수 없는 액션: ${args.action} (search, get, create 중 선택)`);
    }
  } catch (err) {
    fail(err.message);
  }
}

main();
