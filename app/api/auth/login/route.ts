import { NextResponse } from "next/server";
import { createSession, publicUser, sessionCookie } from "../../../../lib/auth";
import { findUserByUsername, logEvent } from "../../../../lib/db";
import { verifyPassword } from "../../../../lib/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  try {
    const body = await request.json() as { mode?: unknown; username?: unknown; password?: unknown };
    const quickTest = body.mode === "test";
    if (quickTest && process.env.ENABLE_TEST_LOGIN === "false") {
      return NextResponse.json({ error: "测试账号快捷登录已关闭。" }, { status: 403, headers: noStore });
    }
    const username = quickTest
      ? process.env.TEST_USER_NAME?.trim() || "roam-test"
      : typeof body.username === "string" ? body.username.trim() : "";
    const user = username ? await findUserByUsername(username) : null;
    const passwordValid = quickTest || user && typeof body.password === "string" && await verifyPassword(body.password, user.password_hash);
    if (!user || !passwordValid || quickTest && !user.is_test) {
      await logEvent({ level: "warn", event: "auth_login_failed", message: "登录失败", metadata: { username: username.slice(0, 32), quickTest } });
      return NextResponse.json({ error: "用户名或密码不正确。" }, { status: 401, headers: noStore });
    }
    const session = await createSession(user.id);
    const response = NextResponse.json({ user: publicUser(user) }, { headers: noStore });
    response.cookies.set(sessionCookie(session.token, session.expiresAt));
    await logEvent({ event: "auth_login", message: quickTest ? "测试用户快捷登录" : "用户登录", userId: user.id, metadata: { quickTest } });
    return response;
  } catch (error) {
    console.error("[auth_login_failed]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "登录服务暂时不可用。" }, { status: 503, headers: noStore });
  }
}
