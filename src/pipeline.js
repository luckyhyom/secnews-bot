import { join } from 'path';
import { readFileSync } from 'fs';
import { createProvider } from './llm/index.js';
import { fetchRSS, fetchArticleBody } from './collectors/rss.js';
import { summarizeArticle } from './analyzers/summarizer.js';
import { postToSlack, formatSlackMessage } from './publishers/slack.js';
import { StateManager } from './state.js';

const MAX_ARTICLES_PER_SOURCE = 5;
const SLACK_DELAY_MS = 1_000;
const CUTOFF_HOURS = 48;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 뉴스 수집 파이프라인을 실행한다.
 *
 * 흐름: 소스 로드 → RSS 수집 → 필터/중복제거 → LLM 요약 → Slack 게시 → 상태 저장
 *
 * @param {object} [options]
 * @param {string}  [options.projectRoot] - 프로젝트 루트 (기본: cwd)
 * @param {boolean} [options.dryRun]      - true면 게시 없이 콘솔 출력만
 * @param {object}  [options.llm]         - LLM 프로바이더 설정 ({ type, model, … })
 * @returns {Promise<number>} 게시된 기사 수
 */
export async function runPipeline(options = {}) {
  const root = options.projectRoot || process.cwd();
  const sources = JSON.parse(readFileSync(join(root, 'config/sources.json'), 'utf-8')).sources;
  const state = new StateManager(join(root, 'state/posted_articles.json'));
  const llm = createProvider(options.llm);

  const lastUpdated = state.getLastUpdated();
  const cutoff = lastUpdated || new Date(Date.now() - CUTOFF_HOURS * 60 * 60 * 1000);

  console.log(`마지막 실행: ${lastUpdated?.toISOString() ?? `없음 (${CUTOFF_HOURS}시간 컷오프 적용)`}`);

  let totalPosted = 0;

  for (const source of sources) {
    console.log(`\n--- ${source.name} ---`);

    // --- 수집 ---
    let articles = [];

    if (source.type === 'rss') {
      try {
        articles = await fetchRSS(source);
        console.log(`  수집: ${articles.length}건`);
      } catch (err) {
        console.error(`  RSS 수집 실패: ${err.message}`);
        continue;
      }
    } else {
      // websearch 소스는 로컬 파이프라인 미지원 (claude-code 모드에서만 동작)
      console.log('  건너뜀: websearch 소스 (claude-code 프로바이더 필요)');
      continue;
    }

    // --- 필터링 & 중복 제거 ---
    const newArticles = articles
      .filter((a) => {
        if (state.isPosted(a.url)) return false;
        if (a.pubDate) return new Date(a.pubDate) > cutoff;
        return true;
      })
      .sort((a, b) => {
        const da = a.pubDate ? new Date(a.pubDate) : new Date(0);
        const db = b.pubDate ? new Date(b.pubDate) : new Date(0);
        return db - da;
      })
      .slice(0, MAX_ARTICLES_PER_SOURCE);

    console.log(`  신규: ${newArticles.length}건`);

    // --- 요약 & 게시 ---
    for (const article of newArticles) {
      try {
        // 원문 본문 수집 (실패시 description 폴백)
        let bodyText = '';
        try {
          bodyText = await fetchArticleBody(article.url);
        } catch {
          console.log('    본문 수집 실패 — description 폴백 사용');
        }

        const analysis = await summarizeArticle(llm, article, bodyText);
        const message = formatSlackMessage(article, analysis);

        if (options.dryRun) {
          console.log(`\n${message}\n`);
        } else {
          await postToSlack(message);
          await sleep(SLACK_DELAY_MS);
        }

        state.addArticle(source.id, article);
        totalPosted++;
        console.log(`  ✓ ${article.title}`);
      } catch (err) {
        console.error(`  ✗ ${article.title}: ${err.message}`);
      }
    }
  }

  // --- 상태 저장 ---
  if (totalPosted > 0) {
    state.updateTimestamp();
    state.save();
    console.log(`\n완료: ${totalPosted}건 게시`);
  } else {
    console.log('\n신규 기사 없음');
  }

  return totalPosted;
}
