import { NextRequest, NextResponse } from "next/server";
import { isAuthConfigured, verifyCredentials, getSessionCookieOptions } from "@/app/lib/auth";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
} as const;

// Brute-force protection: 10 attempts per IP per 15 minutes
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

function checkLoginRateLimit(ip: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  let entry = loginAttempts.get(ip);
  if (!entry || now >= entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return { allowed: true };
  }
  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }
  entry.count += 1;
  return { allowed: true };
}

function resetLoginAttempts(ip: string): void {
  loginAttempts.delete(ip);
}

export async function POST(req: NextRequest) {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      { error: "Вход не настроен" },
      { status: 503, headers: SECURITY_HEADERS }
    );
  }

  const ip = getClientIp(req);
  const rl = checkLoginRateLimit(ip);
  if (!rl.allowed) {
    const retrySec = Math.ceil((rl.retryAfterMs ?? LOGIN_WINDOW_MS) / 1000);
    return NextResponse.json(
      { error: `Слишком много попыток входа. Повторите через ${Math.ceil(retrySec / 60)} мин.` },
      { status: 429, headers: { ...SECURITY_HEADERS, "Retry-After": String(retrySec) } }
    );
  }

  try {
    const body = (await req.json()) as { login?: string; password?: string };
    const login = typeof body.login === "string" ? body.login.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!login || !password) {
      return NextResponse.json(
        { error: "Требуются логин и пароль" },
        { status: 400, headers: SECURITY_HEADERS }
      );
    }

    if (!verifyCredentials(login, password)) {
      return NextResponse.json(
        { error: "Неверный логин или пароль" },
        { status: 401, headers: SECURITY_HEADERS }
      );
    }

    // Successful login — reset attempt counter
    resetLoginAttempts(ip);
    const { name, value, options } = getSessionCookieOptions();
    const res = NextResponse.json({ ok: true }, { headers: SECURITY_HEADERS });
    res.cookies.set(name, value, options);
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ошибка входа";
    return NextResponse.json(
      { error: process.env.NODE_ENV === "development" ? message : "Ошибка входа" },
      { status: 500, headers: SECURITY_HEADERS }
    );
  }
}
