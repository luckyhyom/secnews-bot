import { google } from 'googleapis';
import http from 'http';
import { URL } from 'url';

/**
 * Gmail OAuth 2.0 인증 플로우를 관리한다.
 * 사용자가 Slack에서 /connect-email 명령시 호출.
 *
 * 환경변수:
 *   GOOGLE_CLIENT_ID     — OAuth 클라이언트 ID
 *   GOOGLE_CLIENT_SECRET — OAuth 클라이언트 시크릿
 *   OAUTH_REDIRECT_PORT  — 콜백 서버 포트 (기본: 3000)
 */

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.labels',
];

/**
 * OAuth2 클라이언트를 생성한다.
 * @param {number} [port=3000] - 콜백 서버 포트
 * @returns {import('googleapis').Common.OAuth2Client}
 */
export function createOAuth2Client(port = 3000) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `http://localhost:${port}/oauth/callback`,
  );
}

/**
 * OAuth 인증 URL을 생성한다.
 * 사용자에게 이 URL을 전달하여 브라우저에서 인증하도록 한다.
 *
 * @param {import('googleapis').Common.OAuth2Client} oauth2Client
 * @returns {string} 인증 URL
 */
export function generateAuthUrl(oauth2Client) {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

/**
 * 임시 HTTP 서버를 띄워 OAuth 콜백을 수신한다.
 * 인증 코드를 받으면 토큰으로 교환하고 서버를 종료.
 *
 * @param {import('googleapis').Common.OAuth2Client} oauth2Client
 * @param {number} [port=3000]
 * @returns {Promise<object>} OAuth 토큰 객체
 */
export function waitForCallback(oauth2Client, port = 3000) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, `http://localhost:${port}`);

        if (url.pathname !== '/oauth/callback') {
          res.writeHead(404);
          res.end('Not Found');
          return;
        }

        const code = url.searchParams.get('code');
        if (!code) {
          res.writeHead(400);
          res.end('인증 코드가 없습니다');
          return;
        }

        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>인증 완료!</h1><p>이 탭을 닫고 Slack으로 돌아가세요.</p>');

        server.close();
        resolve(tokens);
      } catch (err) {
        res.writeHead(500);
        res.end('인증 오류: ' + err.message);
        server.close();
        reject(err);
      }
    });

    server.listen(port, () => {
      console.log(`OAuth 콜백 서버 시작: http://localhost:${port}/oauth/callback`);
    });

    // 5분 타임아웃
    setTimeout(() => {
      server.close();
      reject(new Error('OAuth 인증 타임아웃 (5분)'));
    }, 5 * 60 * 1000);
  });
}

/**
 * 저장된 토큰으로 OAuth2 클라이언트를 복원한다.
 * @param {object} tokens - 저장된 OAuth 토큰
 * @returns {import('googleapis').Common.OAuth2Client}
 */
export function restoreClient(tokens) {
  const client = createOAuth2Client();
  client.setCredentials(tokens);
  return client;
}
