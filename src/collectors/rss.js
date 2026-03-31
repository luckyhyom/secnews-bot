import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

/**
 * @typedef {Object} Article
 * @property {string} title - 기사 제목
 * @property {string} url - 원문 URL
 * @property {string} description - 본문 요약/설명
 * @property {string|null} pubDate - 발행일
 * @property {string} source - 소스 ID
 * @property {string} sourceName - 소스 표시명
 * @property {string} language - 언어 코드
 */

/**
 * RSS 피드를 가져와 기사 목록으로 파싱한다.
 * RSS 2.0 (<item>)과 Atom (<entry>) 형식 모두 지원.
 *
 * @param {object} source - sources.json의 소스 항목
 * @returns {Promise<Article[]>}
 */
export async function fetchRSS(source) {
  const res = await fetch(source.url, {
    headers: { 'User-Agent': 'SecNewsBot/1.0' },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`RSS 수집 실패 (${source.id}): ${res.status}`);
  }

  const xml = await decodeResponse(res);
  const parsed = parser.parse(xml);

  const items = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
  const list = Array.isArray(items) ? items : [items];

  return list
    .map((item) => ({
      title: String(item.title ?? '').trim(),
      url: extractLink(item),
      description: String(item.description ?? item.summary ?? item.content ?? '').trim(),
      pubDate: item.pubDate || item.published || item.updated || null,
      source: source.id,
      sourceName: source.name,
      language: source.language,
    }))
    .filter((a) => a.title && a.url);
}

/**
 * HTTP 응답을 적절한 인코딩으로 디코딩한다.
 * XML 선언의 encoding 속성 또는 Content-Type 헤더를 참조.
 * EUC-KR 등 비-UTF-8 인코딩을 자동 처리.
 */
async function decodeResponse(res) {
  const buf = Buffer.from(await res.arrayBuffer());
  const head = buf.slice(0, 200).toString('ascii');
  const encodingMatch = head.match(/encoding=["']([^"']+)["']/i);
  const encoding = encodingMatch?.[1]?.toLowerCase() || 'utf-8';

  if (encoding === 'utf-8') return buf.toString('utf-8');
  return new TextDecoder(encoding).decode(buf);
}

/** RSS/Atom의 다양한 link 형식에서 URL을 추출한다. */
function extractLink(item) {
  if (typeof item.link === 'string') return item.link.trim();
  if (item.link?.['@_href']) return item.link['@_href'];
  if (Array.isArray(item.link)) {
    const alt = item.link.find((l) => l['@_rel'] === 'alternate');
    return alt?.['@_href'] || item.link[0]?.['@_href'] || '';
  }
  return '';
}

/**
 * 기사 URL에서 본문 텍스트를 추출한다.
 * HTML 태그를 제거하고 순수 텍스트만 반환 (최대 8,000자).
 *
 * @param {string} url - 기사 원문 URL
 * @returns {Promise<string>}
 */
export async function fetchArticleBody(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'SecNewsBot/1.0' },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`기사 본문 수집 실패: ${res.status}`);
  }

  const html = await res.text();

  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000);
}
