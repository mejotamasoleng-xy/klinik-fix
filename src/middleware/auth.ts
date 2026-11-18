/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { getSetting, setSetting } from '../db/queries.ts';

export interface AuthSessionPayload {
  sub: string;
  iat: number;
  exp: number;
}

export interface AuthRequest extends Request {
  user?: AuthSessionPayload;
}

let cachedSessionSecret: string | null = null;
let secretLoadInFlight: Promise<string> | null = null;

export async function getSessionSecret(): Promise<string> {
  const envSecret = process.env.SESSION_SECRET?.trim();
  if (envSecret && envSecret.length >= 16) {
    return envSecret;
  }
  if (cachedSessionSecret) return cachedSessionSecret;
  if (!secretLoadInFlight) {
    secretLoadInFlight = (async () => {
      try {
        const stored = await getSetting('auth_session_secret');
        if (typeof stored === 'string' && stored.length >= 32) {
          cachedSessionSecret = stored;
          return stored;
        }
      } catch {
        // Fallback to generated secret if DB unavailable
      }
      const generated = crypto.randomBytes(32).toString('hex');
      cachedSessionSecret = generated;
      try {
        await setSetting('auth_session_secret', generated);
      } catch {
        // Ignore persistence error during transient startup
      }
      return generated;
    })().finally(() => {
      secretLoadInFlight = null;
    });
  }
  return secretLoadInFlight;
}

export function hashPasswordSha256(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function encodeBase64Url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4;
  const padded = pad ? normalized + '='.repeat(4 - pad) : normalized;
  return Buffer.from(padded, 'base64');
}

export async function createSessionToken(username: string, ttlMs: number): Promise<{ token: string; expiresAt: number }> {
  const secret = await getSessionSecret();
  const iat = Date.now();
  const exp = iat + ttlMs;
  const payload: AuthSessionPayload = { sub: username, iat, exp };
  const payloadB64 = encodeBase64Url(JSON.stringify(payload));
  const sigB64 = encodeBase64Url(
    crypto.createHmac('sha256', secret).update(payloadB64).digest()
  );
  return {
    token: `${payloadB64}.${sigB64}`,
    expiresAt: exp,
  };
}

export async function verifySessionToken(token: string): Promise<AuthSessionPayload | null> {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  try {
    const secret = await getSessionSecret();
    const expectedSig = encodeBase64Url(
      crypto.createHmac('sha256', secret).update(payloadB64).digest()
    );
    if (!constantTimeEquals(sigB64, expectedSig)) return null;

    const decoded = JSON.parse(decodeBase64Url(payloadB64).toString('utf8')) as AuthSessionPayload;
    if (!decoded || typeof decoded.sub !== 'string' || typeof decoded.exp !== 'number') {
      return null;
    }
    if (Date.now() > decoded.exp) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  let token = '';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (typeof req.query.token === 'string' && req.query.token.trim()) {
    token = req.query.token.trim();
  }

  if (!token) {
    return res.status(401).json({
      error: 'Sesi belum terautentikasi. Silakan login terlebih dahulu.',
    });
  }

  const payload = await verifySessionToken(token);
  if (!payload) {
    return res.status(401).json({
      error: 'Sesi tidak valid atau telah berakhir. Silakan login kembali.',
    });
  }

  req.user = payload;
  next();
};

