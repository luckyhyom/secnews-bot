import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

/**
 * 사용자별 OAuth 토큰을 암호화하여 저장/조회하는 저장소.
 * 각 Slack user_id에 대해 별도의 토큰을 관리.
 *
 * 환경변수:
 *   TOKEN_ENCRYPTION_KEY — 32바이트(64자 hex) 암호화 키
 */
export class TokenStore {
  /**
   * @param {string} filePath - 토큰 저장 파일 경로 (예: state/tokens.json)
   */
  constructor(filePath) {
    this.filePath = filePath;
    this.encryptionKey = process.env.TOKEN_ENCRYPTION_KEY;

    if (!this.encryptionKey) {
      throw new Error('TOKEN_ENCRYPTION_KEY 환경변수가 필요합니다 (32바이트 hex)');
    }

    this.keyBuffer = Buffer.from(this.encryptionKey, 'hex');
    this.data = this._load();
  }

  _load() {
    if (!existsSync(this.filePath)) return {};
    try {
      return JSON.parse(readFileSync(this.filePath, 'utf-8'));
    } catch {
      return {};
    }
  }

  _save() {
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2) + '\n');
  }

  /**
   * 토큰을 AES-256-GCM으로 암호화한다.
   * @param {object} tokenData - OAuth 토큰 객체
   * @returns {object} { iv, encrypted, tag }
   */
  _encrypt(tokenData) {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, this.keyBuffer, iv);

    const json = JSON.stringify(tokenData);
    let encrypted = cipher.update(json, 'utf-8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');

    return {
      iv: iv.toString('hex'),
      encrypted,
      tag,
    };
  }

  /**
   * 암호화된 토큰을 복호화한다.
   * @param {object} encData - { iv, encrypted, tag }
   * @returns {object} OAuth 토큰 객체
   */
  _decrypt(encData) {
    const decipher = createDecipheriv(
      ALGORITHM,
      this.keyBuffer,
      Buffer.from(encData.iv, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(encData.tag, 'hex'));

    let decrypted = decipher.update(encData.encrypted, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');

    return JSON.parse(decrypted);
  }

  /**
   * 사용자의 OAuth 토큰을 저장한다.
   * @param {string} slackUserId
   * @param {object} tokenData - { access_token, refresh_token, expiry_date, ... }
   */
  saveToken(slackUserId, tokenData) {
    this.data[slackUserId] = this._encrypt(tokenData);
    this._save();
  }

  /**
   * 사용자의 OAuth 토큰을 조회한다.
   * @param {string} slackUserId
   * @returns {object|null} OAuth 토큰 객체 또는 null
   */
  getToken(slackUserId) {
    const encData = this.data[slackUserId];
    if (!encData) return null;

    try {
      return this._decrypt(encData);
    } catch {
      return null;
    }
  }

  /**
   * 사용자의 토큰이 존재하는지 확인한다.
   * @param {string} slackUserId
   * @returns {boolean}
   */
  hasToken(slackUserId) {
    return slackUserId in this.data;
  }

  /**
   * 사용자의 토큰을 삭제한다.
   * @param {string} slackUserId
   */
  removeToken(slackUserId) {
    delete this.data[slackUserId];
    this._save();
  }
}
