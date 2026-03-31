import { readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';

/**
 * 게시 완료된 기사 상태를 JSON 파일로 관리한다.
 * 중복 게시 방지를 위한 단일 진실 원천(single source of truth).
 */
export class StateManager {
  /**
   * @param {string} filePath - posted_articles.json 절대 경로
   * @param {object} [options]
   * @param {number} [options.maxPerSource=500] - 소스당 최대 보관 기사 수
   */
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.maxPerSource = options.maxPerSource ?? 500;
    this.data = this._load();
  }

  /** 상태 파일을 디스크에서 읽어온다. 파일이 없으면 빈 상태로 초기화. */
  _load() {
    try {
      return JSON.parse(readFileSync(this.filePath, 'utf-8'));
    } catch {
      return { last_updated: null, articles: {} };
    }
  }

  /** @returns {Date|null} 마지막 실행 시각 */
  getLastUpdated() {
    return this.data.last_updated ? new Date(this.data.last_updated) : null;
  }

  /**
   * URL의 SHA-256 해시 앞 8자리를 생성한다.
   * 중복 판별용 식별자로 사용.
   * @param {string} url
   * @returns {string}
   */
  urlHash(url) {
    return createHash('sha256').update(url).digest('hex').slice(0, 8);
  }

  /**
   * 해당 URL의 기사가 이미 게시되었는지 확인한다.
   * @param {string} url
   * @returns {boolean}
   */
  isPosted(url) {
    const hash = this.urlHash(url);
    return Object.values(this.data.articles).some((articles) =>
      articles.some((a) => a.url_hash === hash),
    );
  }

  /**
   * 새로 게시된 기사를 기록한다.
   * @param {string} sourceId - 소스 ID
   * @param {{ url: string, title: string }} article
   */
  addArticle(sourceId, article) {
    if (!this.data.articles[sourceId]) {
      this.data.articles[sourceId] = [];
    }
    this.data.articles[sourceId].push({
      url_hash: this.urlHash(article.url),
      title: article.title,
      posted_at: new Date().toISOString(),
    });
  }

  /** last_updated 타임스탬프를 현재 시각으로 갱신한다. */
  updateTimestamp() {
    this.data.last_updated = new Date().toISOString();
  }

  /** 소스당 maxPerSource 초과시 오래된 항목부터 제거한다. */
  prune() {
    for (const [sourceId, articles] of Object.entries(this.data.articles)) {
      if (articles.length > this.maxPerSource) {
        this.data.articles[sourceId] = articles.slice(-this.maxPerSource);
      }
    }
  }

  /** 현재 상태를 디스크에 저장한다. 저장 전 자동으로 pruning 수행. */
  save() {
    this.prune();
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2) + '\n');
  }
}
