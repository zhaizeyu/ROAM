import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { createAuthSession, deleteAuthSession, findUserBySession, type UserRow } from "./db";

export const sessionCookieName = "roam_session";
const sessionDays = 30;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function readCookie(request: Request, name: string) {
  const source = request.headers.get("cookie") ?? "";
  for (const item of source.split(";")) {
    const [key, ...parts] = item.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
  return null;
}

export function publicUser(user: UserRow) {
  return { id: user.id, username: user.username, displayName: user.display_name, isTest: user.is_test };
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionDays * 86_400_000);
  await createAuthSession({ id: crypto.randomUUID(), userId, tokenHash: hashToken(token), expiresAt });
  return { token, expiresAt };
}

export function sessionCookie(token: string, expiresAt: Date) {
  return {
    name: sessionCookieName,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

export function expiredSessionCookie() {
  return { ...sessionCookie("", new Date(0)), maxAge: 0 };
}

export async function getAuthenticatedUser(request: Request) {
  const token = readCookie(request, sessionCookieName);
  if (!token) return null;
  return findUserBySession(hashToken(token));
}

export async function clearSession(request: Request) {
  const token = readCookie(request, sessionCookieName);
  if (token) await deleteAuthSession(hashToken(token));
}
