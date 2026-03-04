import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "macrodata_session";
const SESSION_MAX_AGE_SEC = 24 * 60 * 60; // 24 часа
const PAYLOAD_SEP = ".";

function getSecret(): string {
  const s = process.env.MACRODATA_SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error("MACRODATA_SESSION_SECRET должен быть задан и не короче 32 символов");
  }
  return s;
}

export function isAuthConfigured(): boolean {
  const secret = process.env.MACRODATA_SESSION_SECRET;
  return Boolean(
    process.env.MACRODATA_AUTH_LOGIN?.trim() &&
      process.env.MACRODATA_AUTH_PASSWORD?.trim() &&
      secret &&
      secret.length >= 32
  );
}

function getCredentials(): { login: string; password: string } {
  const login = process.env.MACRODATA_AUTH_LOGIN;
  const password = process.env.MACRODATA_AUTH_PASSWORD;
  if (!login || !password) {
    throw new Error("MACRODATA_AUTH_LOGIN и MACRODATA_AUTH_PASSWORD должны быть заданы");
  }
  return { login: login.trim(), password: password.trim() };
}

/** Создаёт подписанное значение сессии (payload.exp + подпись). */
export function createSessionToken(): string {
  const secret = getSecret();
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC;
  const payload = Buffer.from(JSON.stringify({ exp }), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return payload + PAYLOAD_SEP + sig;
}

/** Проверяет подпись и срок действия. Возвращает true только если сессия валидна. */
export function verifySessionToken(token: string): boolean {
  try {
    const secret = getSecret();
    const i = token.lastIndexOf(PAYLOAD_SEP);
    if (i <= 0) return false;
    const payload = token.slice(0, i);
    const sig = token.slice(i + 1);
    const expectedSig = createHmac("sha256", secret).update(payload).digest("base64url");
    if (sig.length !== expectedSig.length || !timingSafeEqual(Buffer.from(sig, "utf8"), Buffer.from(expectedSig, "utf8"))) return false;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof data.exp === "number" && data.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

/** Сравнение логина и пароля без утечки по времени (через HMAC, фиксированная длина). */
export function verifyCredentials(login: string, password: string): boolean {
  try {
    const secret = getSecret();
    const { login: envLogin, password: envPassword } = getCredentials();
    const inputHash = createHmac("sha256", secret).update(login + "\n" + password, "utf8").digest("hex");
    const envHash = createHmac("sha256", secret).update(envLogin + "\n" + envPassword, "utf8").digest("hex");
    return inputHash.length === envHash.length && timingSafeEqual(Buffer.from(inputHash, "hex"), Buffer.from(envHash, "hex"));
  } catch {
    return false;
  }
}

export function getSessionCookieName(): string {
  return COOKIE_NAME;
}

export function getSessionCookieOptions(hostOnly = false): { name: string; value: string; options: { httpOnly: boolean; secure: boolean; sameSite: "strict"; path: string; maxAge: number } } {
  return {
    name: COOKIE_NAME,
    value: createSessionToken(),
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_MAX_AGE_SEC,
    },
  };
}

/** Извлечь значение сессии из заголовка Cookie. */
export function getSessionFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`, "i"));
  return match ? decodeURIComponent(match[1].trim()) : null;
}
