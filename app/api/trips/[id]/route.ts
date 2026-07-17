import { NextResponse } from "next/server";
import { getTrip, logEvent, updateTrip } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function credentials(request: Request) {
  const url = new URL(request.url);
  return { accessToken: url.searchParams.get("key") ?? undefined, clientId: url.searchParams.get("clientId") ?? undefined };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const auth = credentials(request);
    if (!uuidPattern.test(id) || ![auth.accessToken, auth.clientId].some((value) => value && uuidPattern.test(value))) {
      return NextResponse.json({ error: "行程链接无效。" }, { status: 400, headers: noStore });
    }
    const trip = await getTrip(id, auth.accessToken, auth.clientId);
    if (!trip) return NextResponse.json({ error: "行程不存在或你没有访问权限。" }, { status: 404, headers: noStore });
    return NextResponse.json({
      tripId: trip.id,
      accessToken: trip.access_token,
      input: trip.input_json,
      plan: trip.plan_json,
      backend: trip.backend,
      version: trip.current_version,
      createdAt: trip.created_at,
      updatedAt: trip.updated_at,
    }, { headers: noStore });
  } catch (error) {
    console.error("[trip_read_failed]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "暂时无法读取这份行程。" }, { status: 503, headers: noStore });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json() as { accessToken?: unknown; clientId?: unknown; plan?: unknown; instruction?: unknown };
    const accessToken = typeof body.accessToken === "string" ? body.accessToken : undefined;
    const clientId = typeof body.clientId === "string" ? body.clientId : undefined;
    if (!uuidPattern.test(id) || ![accessToken, clientId].some((value) => value && uuidPattern.test(value))) {
      return NextResponse.json({ error: "行程访问凭据无效。" }, { status: 400, headers: noStore });
    }
    if (!body.plan || typeof body.plan !== "object" || Array.isArray(body.plan)) {
      return NextResponse.json({ error: "行程内容格式无效。" }, { status: 400, headers: noStore });
    }
    const serialized = JSON.stringify(body.plan);
    if (serialized.length > 500_000) return NextResponse.json({ error: "行程内容过大。" }, { status: 413, headers: noStore });
    const updated = await updateTrip({
      tripId: id,
      accessToken,
      clientId,
      plan: body.plan as Record<string, unknown>,
      changeType: "manual_edit",
      instruction: typeof body.instruction === "string" ? body.instruction : "网页手工编辑",
    });
    if (!updated) return NextResponse.json({ error: "行程不存在或你没有访问权限。" }, { status: 404, headers: noStore });
    await logEvent({ event: "trip_manual_edit", message: "用户保存了手工行程修改", tripId: id, metadata: { version: updated.current_version } });
    return NextResponse.json({ tripId: id, accessToken: updated.access_token, version: updated.current_version, updatedAt: updated.updated_at }, { headers: noStore });
  } catch (error) {
    console.error("[trip_update_failed]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "保存修改失败，请稍后重试。" }, { status: 503, headers: noStore });
  }
}
