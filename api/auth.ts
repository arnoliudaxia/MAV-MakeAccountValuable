import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { env } from "./lib/env";

type ScryptOptions = {
  N: number;
  r: number;
  p: number;
  maxmem: number;
};

function scrypt(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey as Buffer);
    });
  });
}

const SESSION_COOKIE = "mav_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const KEY_LENGTH = 64;
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 32 * 1024 * 1024;

type AuthSession = {
  expiresAt: number;
};

type LoginAttempt = {
  count: number;
  resetAt: number;
};

const sessions = new Map<string, AuthSession>();
const loginAttempts = new Map<string, LoginAttempt>();

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
  headers: Record<string, string> = {}
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function cookieFlags() {
  return env.isProduction ? "; Secure" : "";
}

function sessionCookie(token: string) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${cookieFlags()}`;
}

function expiredSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${cookieFlags()}`;
}

function getSessionToken(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]*)`)
  );
  return match?.[1] || null;
}

function cleanupSessions(now: number) {
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(token);
  }
}

export function getSession(request: Request): AuthSession | null {
  const now = Date.now();
  cleanupSessions(now);
  const token = getSessionToken(request);
  if (!token) return null;

  const session = sessions.get(token);
  if (!session || session.expiresAt <= now) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function getClientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function checkLoginRateLimit(key: string) {
  const now = Date.now();
  for (const [attemptKey, attempt] of loginAttempts) {
    if (attempt.resetAt <= now) loginAttempts.delete(attemptKey);
  }

  const existing = loginAttempts.get(key);
  if (!existing || existing.resetAt <= now) {
    const attempt = { count: 1, resetAt: now + LOGIN_WINDOW_MS };
    loginAttempts.set(key, attempt);
    return { allowed: true, retryAfter: 0 };
  }

  if (existing.count >= MAX_LOGIN_ATTEMPTS) {
    return {
      allowed: false,
      retryAfter: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  existing.count += 1;
  return { allowed: true, retryAfter: 0 };
}

function resetLoginRateLimit(key: string) {
  loginAttempts.delete(key);
}

function parsePasswordHash(value: string) {
  const parts = value.trim().split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (
    !Number.isSafeInteger(n) ||
    !Number.isSafeInteger(r) ||
    !Number.isSafeInteger(p) ||
    n < 2 ||
    r < 1 ||
    p < 1 ||
    n > 1_048_576 ||
    r > 64 ||
    p > 16
  ) {
    return null;
  }

  try {
    const salt = Buffer.from(parts[4]!, "base64url");
    const derivedKey = Buffer.from(parts[5]!, "base64url");
    if (salt.length < 16 || derivedKey.length !== KEY_LENGTH) return null;
    return { n, r, p, salt, derivedKey };
  } catch {
    return null;
  }
}

export async function verifyPassword(password: string) {
  const parsed = parsePasswordHash(env.authPasswordHash);
  if (!parsed) return false;

  const derivedKey = (await scrypt(password, parsed.salt, KEY_LENGTH, {
    N: parsed.n,
    r: parsed.r,
    p: parsed.p,
    maxmem: SCRYPT_MAXMEM,
  })) as Buffer;

  return (
    derivedKey.length === parsed.derivedKey.length &&
    timingSafeEqual(derivedKey, parsed.derivedKey)
  );
}

export async function handleLogin(request: Request) {
  if (!env.authPasswordHash) {
    return jsonResponse({ error: "服务端尚未配置 AUTH_PASSWORD_HASH" }, 503);
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return jsonResponse({ error: "请求体必须是 JSON" }, 400);
  }

  const password =
    input && typeof input === "object" && "password" in input
      ? (input as { password?: unknown }).password
      : undefined;
  if (typeof password !== "string" || password.length === 0) {
    return jsonResponse({ error: "请输入密码" }, 400);
  }
  // Avoid spending excessive CPU/memory on an attacker-controlled scrypt input.
  if (password.length > 1024) {
    return jsonResponse({ error: "密码长度不能超过 1024 个字符" }, 400);
  }

  const clientKey = getClientKey(request);
  const rateLimit = checkLoginRateLimit(clientKey);
  if (!rateLimit.allowed) {
    return jsonResponse(
      { error: "登录尝试过于频繁，请稍后再试" },
      429,
      { "Retry-After": String(rateLimit.retryAfter) }
    );
  }

  let valid = false;
  try {
    valid = await verifyPassword(password);
  } catch (error) {
    console.error("Password verification failed", error);
  }

  if (!valid) {
    return jsonResponse({ error: "密码错误" }, 401);
  }

  resetLoginRateLimit(clientKey);
  cleanupSessions(Date.now());
  const token = randomBytes(32).toString("base64url");
  sessions.set(token, { expiresAt: Date.now() + SESSION_TTL_MS });

  return jsonResponse(
    { authenticated: true },
    200,
    { "Set-Cookie": sessionCookie(token) }
  );
}

export function handleSession(request: Request) {
  return jsonResponse({ authenticated: getSession(request) !== null });
}

export function handleLogout(request: Request) {
  const token = getSessionToken(request);
  if (token) sessions.delete(token);
  return jsonResponse(
    { authenticated: false },
    200,
    { "Set-Cookie": expiredSessionCookie() }
  );
}

export function isAuthenticated(request: Request) {
  return getSession(request) !== null;
}

// Keep the hash format and parameters visible to the hash-generation tool without
// exporting server secrets or ever accepting a plaintext password from the app.
export const passwordHashParameters = {
  keyLength: KEY_LENGTH,
  n: SCRYPT_N,
  r: SCRYPT_R,
  p: SCRYPT_P,
  maxmem: SCRYPT_MAXMEM,
};

export function formatPasswordHash(salt: Buffer, derivedKey: Buffer) {
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

// This is intentionally only used by the standalone hash generator.
export async function createPasswordHash(password: string) {
  const salt = randomBytes(16);
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  })) as Buffer;
  return formatPasswordHash(salt, derivedKey);
}

// Referenced by tests/tools to make accidental SHA-only implementations obvious.
export function hashFingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
