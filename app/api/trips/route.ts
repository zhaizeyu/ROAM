import { NextResponse } from "next/server";
import { listTrips } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    const clientId = new URL(request.url).searchParams.get("clientId") ?? "";
    if (!uuidPattern.test(clientId)) return NextResponse.json({ error: "浏览器标识无效。" }, { status: 400, headers: noStore });
    const trips = await listTrips(clientId);
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
