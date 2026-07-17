import { NextResponse } from "next/server";
import { listTrips } from "../../../lib/db";
import { getAuthenticatedUser } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: "请先登录后查看历史行程。" }, { status: 401, headers: noStore });
    const trips = await listTrips(user.id);
    return NextResponse.json({
      trips: trips.map((trip) => ({
        id: trip.id,
        accessToken: trip.access_token,
        destination: trip.destination,
        startDate: trip.start_date,
        endDate: trip.end_date,
        subtitle: String(trip.plan_json.subtitle ?? "已保存的旅行计划"),
        version: trip.current_version,
        createdAt: trip.created_at,
        updatedAt: trip.updated_at,
      })),
    }, { headers: noStore });
  } catch (error) {
    console.error("[trip_list_failed]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "暂时无法读取历史行程。" }, { status: 503, headers: noStore });
  }
}
