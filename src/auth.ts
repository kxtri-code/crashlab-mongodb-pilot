import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import type { StagingSession, StagingUser } from './types.js';

const KEY_LEN = 64;
const DEFAULT_SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, KEY_LEN);
  return {
    hash: derived.toString('hex'),
    salt,
  };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  try {
    const derived = scryptSync(password, salt, KEY_LEN);
    const hashBuf = Buffer.from(hash, 'hex');
    if (derived.length !== hashBuf.length) {
      return false;
    }
    return timingSafeEqual(derived, hashBuf);
  } catch {
    return false;
  }
}

export function signSession(session: StagingSession, secret: string): string {
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifySession(token: string, secret: string): StagingSession | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payload, signature] = parts;
    if (!payload || !signature) return null;
    const expectedSig = createHmac('sha256', secret).update(payload).digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const session: StagingSession = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (Date.now() > session.expiresAt) {
      return null; // Expired
    }
    return session;
  } catch {
    return null;
  }
}

export function createSession(user: StagingUser, durationMs = DEFAULT_SESSION_DURATION_MS): StagingSession {
  const now = Date.now();
  return {
    sessionId: randomBytes(16).toString('hex'),
    userId: user.id,
    email: user.email,
    createdAt: now,
    expiresAt: now + durationMs,
  };
}
