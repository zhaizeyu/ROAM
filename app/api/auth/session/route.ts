import { NextResponse } from "next/server";
import { clearSession, expiredSessionCookie, getAuthenticatedUser, publicUser } from "../../../../lib/auth";
import { logEvent } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ user: null }, { status: 401, headers: noStore });
    return NextResponse.json({ user: publicUser(user) }, { headers: noStore });
  } catch (error) {
    console.error("[auth_session_failed]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "暂时无法验证登录状态。" }, { status: 503, headers: noStore });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    await clearSession(request);
    const response = NextResponse.json({ ok: true }, { headers: noStore });
    response.cookies.set(expiredSessionCookie());
    if (user) await logEvent({ event: "auth_logout", message: "用户退出登录", userId: user.id });
    return response;
  } catch (error) {
    console.error("[auth_logout_failed]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "退出失败，请稍后重试。" }, { status: 503, headers: noStore });
  }
}
