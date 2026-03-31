import imapSimple from 'imap-simple';
import { simpleParser } from 'mailparser';

/**
 * IMAP 기반 범용 이메일 클라이언트.
 * Gmail, 메일플러그, 네이버, Outlook 등 IMAP 지원 서비스 모두 사용 가능.
 */
export class ImapClient {
  /**
   * @param {object} config
   * @param {string} config.host - IMAP 서버 주소 (예: imap.gmail.com)
   * @param {number} [config.port=993] - IMAP 포트
   * @param {string} config.user - 이메일 주소
   * @param {string} config.pass - 앱 비밀번호
   */
  constructor(config) {
    this.imapConfig = {
      imap: {
        user: config.user,
        password: config.pass,
        host: config.host,
        port: config.port || 993,
        tls: true,
        authTimeout: 10000,
        tlsOptions: { rejectUnauthorized: false },
      },
    };
    this.user = config.user;
  }

  /**
   * IMAP 서버에 연결하고 작업을 실행한 후 연결을 종료한다.
   * @param {function} fn - 연결된 클라이언트를 받는 콜백
   * @returns {Promise<*>}
   */
  async _withConnection(fn) {
    const connection = await imapSimple.connect(this.imapConfig);
    try {
      return await fn(connection);
    } finally {
      connection.end();
    }
  }

  /**
   * 메일 목록을 조회한다.
   * @param {object} [options]
   * @param {boolean} [options.unseen=true] - 미읽음 메일만
   * @param {number} [options.maxResults=10] - 최대 조회 수
   * @param {string} [options.from] - 발신자 필터
   * @param {string} [options.subject] - 제목 키워드
   * @param {string} [options.mailbox='INBOX'] - 메일함
   * @returns {Promise<object[]>}
   */
  async listMessages(options = {}) {
    const maxResults = options.maxResults ?? 10;
    const mailbox = options.mailbox ?? 'INBOX';

    return this._withConnection(async (connection) => {
      await connection.openBox(mailbox);

      // 검색 조건 구성
      const criteria = [];
      if (options.unseen !== false) criteria.push('UNSEEN');
      if (options.from) criteria.push(['FROM', options.from]);
      if (options.subject) criteria.push(['SUBJECT', options.subject]);
      if (criteria.length === 0) criteria.push('ALL');

      const fetchOptions = { bodies: ['HEADER'], struct: true };
      const results = await connection.search(criteria, fetchOptions);

      // 최신 메일부터, maxResults개만
      const messages = results.slice(-maxResults).reverse();

      return messages.map((msg) => {
        const header = msg.parts.find((p) => p.which === 'HEADER');
        const parsed = header?.body || {};

        return {
          uid: msg.attributes.uid,
          from: (parsed.from || [''])[0],
          subject: (parsed.subject || ['(제목 없음)'])[0],
          date: (parsed.date || [''])[0],
          isUnread: !msg.attributes.flags.includes('\\Seen'),
        };
      });
    });
  }

  /**
   * 특정 메일의 본문을 가져온다.
   * @param {number} uid - 메일 UID
   * @param {string} [mailbox='INBOX']
   * @returns {Promise<object>}
   */
  async getMessage(uid, mailbox = 'INBOX') {
    return this._withConnection(async (connection) => {
      await connection.openBox(mailbox);

      const fetchOptions = { bodies: '', struct: true };
      const results = await connection.search([['UID', String(uid)]], fetchOptions);

      if (results.length === 0) throw new Error(`UID ${uid}에 해당하는 메일이 없습니다`);

      const raw = results[0].parts.find((p) => p.which === '')?.body || '';
      const parsed = await simpleParser(raw);

      return {
        uid,
        from: parsed.from?.text || '',
        to: parsed.to?.text || '',
        subject: parsed.subject || '(제목 없음)',
        date: parsed.date?.toISOString() || '',
        text: (parsed.text || '').slice(0, 3000),
        isUnread: true,
      };
    });
  }

  /**
   * 메일 목록을 LLM 요약용 텍스트로 변환한다.
   * @param {object[]} messages
   * @returns {string}
   */
  formatForLLM(messages) {
    if (messages.length === 0) return '조회된 이메일이 없습니다.';

    const lines = [`총 ${messages.length}건\n`];

    for (const msg of messages) {
      lines.push(
        `[${msg.isUnread ? '미읽음' : '읽음'}] ${msg.subject}`,
        `  보낸사람: ${msg.from} | 날짜: ${msg.date}`,
        '',
      );
    }

    return lines.join('\n');
  }
}
