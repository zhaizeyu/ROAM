import { NextResponse } from "next/server";
import { createSession, publicUser, sessionCookie } from "../../../../lib/auth";
import { createUser, logEvent } from "../../../../lib/db";
import { hashPassword } from "../../../../lib/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const usernamePattern = /^[a-zA-Z0-9_\u4e00-\u9fff]{3,32}$/;

export async function POST(request: Request) {
  try {
    const body = await request.json() as { username?: unknown; displayName?: unknown; password?: unknown };
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 50) : username;
    const password = typeof body.password === "string" ? body.password : "";
    if (!usernamePattern.test(username)) return NextResponse.json({ error: "用户名需为3–32位中文、字母、数字或下划线。" }, { status: 400, headers: noStore });
    if (password.length < 8 || password.length > 128) return NextResponse.json({ error: "密码至少8位，最多128位。" }, { status: 400, headers: noStore });
    const user = await createUser({ username, displayName: displayName || username, passwordHash: await hashPassword(password) });
    const session = await createSession(user.id);
    const response = NextResponse.json({ user: publicUser(user) }, { status: 201, headers: noStore });
    response.cookies.set(sessionCookie(session.token, session.expiresAt));
    await logEvent({ event: "auth_register", message: "新用户完成注册", userId: user.id });
    return response;
  } catch (error) {
    const duplicate = typeof error === "object" && error !== null && "code" in error && error.code === "23505";
    if (duplicate) return NextResponse.json({ error: "这个用户名已经被使用。" }, { status: 409, headers: noStore });
    console.error("[auth_register_failed]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "注册服务暂时不可用。" }, { status: 503, headers: noStore });
  }
}
